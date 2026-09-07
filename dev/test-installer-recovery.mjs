#!/usr/bin/env node
// Exercise one installer transaction boundary and require an exact exit 86 followed by a
// restart that produces the same complete byte inventory as a clean run.
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [surface, operation, mode, boundary] = process.argv.slice(2);
const validSurfaces = new Set(['node-claude', 'node-codex', 'bash', 'powershell']);
const validOperations = new Set(['install', 'uninstall']);
const validModes = new Set(['fresh', 'upgrade', 'sparse']);
if (!validSurfaces.has(surface) || !validOperations.has(operation) || !validModes.has(mode) || !boundary || process.argv.length !== 6) {
  console.error('usage: node dev/test-installer-recovery.mjs <node-claude|node-codex|bash|powershell> <install|uninstall> <fresh|upgrade|sparse> <boundary>');
  process.exit(2);
}
if (mode === 'fresh' && operation === 'uninstall') {
  console.error('fresh uninstall has no transaction to exercise');
  process.exit(2);
}

const repo = path.resolve(import.meta.dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-recovery-'));

function write(relative, value) {
  const file = path.join(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function claudeFixture(target, sparse) {
  if (!sparse) write(path.join(target, 'skills', 'rust-intel', 'SKILL.md'), 'old-skill\n');
  const legacy = ['rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md'];
  const flat = ['rust-cc-audit.md', 'rust-cc-fix.md', 'rust-cc-plan.md'];
  if (sparse) write(path.join(target, 'commands', legacy[0]), 'old-sparse-record-5\n');
  else {
    for (const file of flat) write(path.join(target, 'commands', file), `old-${file}\n`);
    write(path.join(target, 'commands', 'rust-intel-cc', 'audit.md'), 'old-namespace\n');
    for (const file of legacy) write(path.join(target, 'commands', file), `old-${file}\n`);
  }
  write(path.join(target, 'commands', 'keep.md'), 'unrelated\n');
}

function fixture(target) {
  const sparse = mode === 'sparse';
  if (surface === 'node-codex') {
    if (!sparse) write(path.join(target, 'rust-intel', 'SKILL.md'), 'old-codex\n');
    else write(path.join(target, 'other-owned-looking', 'keep.txt'), 'sparse-codex\n');
    write(path.join(target, 'other', 'sibling.md'), 'unrelated\n');
  } else claudeFixture(target, sparse);
}

function command(target) {
  if (surface === 'node-claude') {
    const args = [path.join(repo, 'bin', 'install.js'), '--user'];
    if (operation === 'uninstall') args.push('--uninstall');
    return [process.execPath, args, { CLAUDE_CONFIG_DIR: target }];
  }
  if (surface === 'node-codex') {
    const args = [path.join(repo, 'bin', 'install-codex.js'), '--user-dir', target];
    if (operation === 'uninstall') args.push('--uninstall');
    return [process.execPath, args, {}];
  }
  if (surface === 'bash') return ['bash', [path.join(repo, operation === 'install' ? 'rust-cc-install.sh' : 'rust-cc-uninstall.sh')], { CLAUDE_CONFIG_DIR: target }];
  return ['pwsh', ['-NoProfile', '-File', path.join(repo, operation === 'install' ? 'rust-cc-install.ps1' : 'rust-cc-uninstall.ps1')], { CLAUDE_CONFIG_DIR: target }];
}

// Keep the journal record order in one place. Node Claude intentionally journals its removals
// before replacements; the other surfaces use their public owned inventory order. A case outside
// this inventory is a coverage error, not a successful no-op.
function boundaryInventory() {
  const common = new Set(['before-journal', 'after-journal', 'before-commit', 'after-commit', 'before-cleanup', 'after-cleanup']);
  const backup = surface === 'node-claude' && operation === 'install'
    ? [0, 1, 2, 3, 4]
    : surface === 'node-codex' ? [0] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const replacements = operation === 'install'
    ? surface === 'node-claude' ? [5, 6, 7, 8] : surface === 'node-codex' ? [0] : [0, 1, 2, 3]
    : [];
  for (const index of backup) {
    for (const phase of ['before-backup', 'after-backup-journal', 'after-backup-rename']) common.add(`${phase}-${index}`);
  }
  for (const index of replacements) {
    for (const phase of ['before-replacement', 'after-replacement-journal', 'after-replacement-rename']) common.add(`${phase}-${index}`);
  }
  return common;
}

function run(target, abortBoundary) {
  const [executable, args, variables] = command(target);
  const env = { ...process.env, ...variables };
  if (abortBoundary) env.RUST_INTEL_INSTALL_ABORT_AT = abortBoundary;
  else delete env.RUST_INTEL_INSTALL_ABORT_AT;
  const result = spawnSync(executable, args, { cwd: repo, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function snapshot(target) {
  const result = spawnSync(process.execPath, [path.join(repo, 'dev', 'snapshot-install.mjs'), target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`snapshot failed: ${result.stderr}`);
  return result.stdout;
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}: expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

try {
  const expectedTarget = path.join(root, 'expected target with spaces');
  const actualTarget = path.join(root, 'actual target with spaces');
  if (!boundaryInventory().has(boundary)) {
    // Prove that the implementation treats the unknown hook as a normal run, then reject it as
    // an invalid coverage case. This prevents a typo in the CI matrix from becoming a false green.
    const probeTarget = path.join(root, 'unreachable boundary target');
    fixture(probeTarget);
    const probe = run(probeTarget, boundary);
    assertStatus(probe, 0, `nonexistent abort boundary ${boundary}`);
    throw new Error(`${surface} ${operation} ${mode} ${boundary}: boundary is not reachable; coverage case rejected`);
  }
  fixture(expectedTarget);
  fixture(actualTarget);
  if (operation === 'install') {
    const clean = run(expectedTarget);
    assertStatus(clean, 0, 'clean install');
  }
  const expected = operation === 'install'
    ? snapshot(expectedTarget)
    : (() => { const result = run(expectedTarget); assertStatus(result, 0, 'clean uninstall'); return snapshot(expectedTarget); })();
  const initial = snapshot(actualTarget);

  const interrupted = run(actualTarget, boundary);
  assertStatus(interrupted, 86, `${surface} ${operation} ${mode} ${boundary}`);
  const restarted = run(actualTarget);
  assertStatus(restarted, 0, `${surface} ${operation} ${mode} ${boundary} restart`);
  const actual = snapshot(actualTarget);
  if (actual !== initial && actual !== expected) {
    throw new Error(`${surface} ${operation} ${mode} ${boundary}: complete post-restart inventory is neither old nor new`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
