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
  if (surface === 'bash') {
    const toPosix = (value) => process.platform === 'win32' && /^[A-Za-z]:[\\/]/.test(value)
      ? `/mnt/${value[0].toLowerCase()}${value.slice(2).replaceAll('\\', '/')}` : value;
    const script = toPosix(path.join(repo, operation === 'install' ? 'rust-cc-install.sh' : 'rust-cc-uninstall.sh'));
    return process.platform === 'win32'
      ? ['wsl.exe', ['env', 'bash', script], { CLAUDE_CONFIG_DIR: toPosix(target) }]
      : ['bash', [script], { CLAUDE_CONFIG_DIR: toPosix(target) }];
  }
  return ['pwsh', ['-NoProfile', '-File', path.join(repo, operation === 'install' ? 'rust-cc-install.ps1' : 'rust-cc-uninstall.ps1')], { CLAUDE_CONFIG_DIR: target }];
}

// Keep the journal record order in one place. Node Claude intentionally journals its removals
// before replacements; the other surfaces use their public owned inventory order. The source
// declarations are checked against this generated inventory so a reachable hook cannot be added
// without a matrix case.
function operationInventory() {
  const backup = surface === 'node-claude' && operation === 'install'
    ? [0, 1, 2, 3, 4]
    : surface === 'node-codex' ? [0] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const replacements = operation === 'install'
    ? surface === 'node-claude' ? [5, 6, 7, 8] : surface === 'node-codex' ? [0] : [0, 1, 2, 3]
    : [];
  const activeBackup = mode === 'upgrade' ? backup : mode === 'sparse' ? (surface === 'node-codex' ? [] : [5]) : [];
  return { backup, replacements, activeBackup };
}

function activeBackupForMode() { return operationInventory().activeBackup; }
function replacementsForMode() { return operationInventory().replacements; }

function boundaryInventory() {
  const common = new Set(['before-journal', 'after-journal', 'before-commit', 'after-commit', 'before-cleanup', 'after-cleanup']);
  const { replacements, activeBackup } = operationInventory();
  for (const index of activeBackup) {
    for (const phase of ['before-backup', 'after-backup-journal', 'after-backup-rename']) common.add(`${phase}-${index}`);
  }
  for (const index of replacements) {
    for (const phase of ['before-replacement', 'after-replacement-journal', 'after-replacement-rename']) common.add(`${phase}-${index}`);
  }
  if (activeBackup.length > 0) {
    for (const index of activeBackup) {
      for (const phase of ['before-restore', 'after-restore-rename', 'after-restore-status']) common.add(`${phase}-${index}`);
    }
  }
  const rollback = operation === 'install' ? replacements : activeBackup;
  for (const index of rollback) {
    for (const phase of ['before-rollback', 'after-rollback']) common.add(`${phase}-${index}`);
  }
  return common;
}

function declaredBoundaryTemplates() {
  const source = surface.startsWith('node-')
    ? fs.readFileSync(path.join(repo, 'bin', 'install-transaction.js'), 'utf8')
    : fs.readFileSync(path.join(repo, operation === 'install' ? 'rust-cc-install.' : 'rust-cc-uninstall.') + (surface === 'bash' ? 'sh' : 'ps1'), 'utf8');
  const match = source.match(/RUST_INTEL_ABORT_BOUNDARIES:\s*([^\r\n]+)/);
  if (!match) throw new Error(`${surface} ${operation}: implementation boundary declaration is missing`);
  return new Set(match[1].split(',').map((item) => item.trim()).filter(Boolean));
}

function assertBoundaryDeclarations() {
  const declared = declaredBoundaryTemplates();
  const inventory = boundaryInventory();
  for (const boundary of inventory) {
    const matches = [...declared].some((template) => template.includes('{index}')
      ? template.replace('{index}', boundary.match(/(\d+)$/)?.[1] ?? '') === boundary
      : template === boundary);
    if (!matches) throw new Error(`${surface} ${operation}: matrix boundary ${boundary} is not declared by implementation`);
  }
  for (const template of declared) {
    const indexTemplate = template.includes('{index}');
    const index = indexTemplate ? (operationInventory().activeBackup[0] ?? operationInventory().replacements[0]) : null;
    const boundary = indexTemplate ? template.replace('{index}', String(index ?? '')) : template;
    const category = template.match(/^(?:before|after)-(backup|replacement|restore|rollback)/)?.[1];
    const relevant = category === 'replacement' ? operation === 'install'
      : category === 'restore' ? operationInventory().activeBackup.length > 0
      : category === 'backup' ? operationInventory().activeBackup.length > 0
      : category === 'rollback' ? (operation === 'install' ? operationInventory().replacements.length > 0 : operationInventory().activeBackup.length > 0)
      : true;
    if (relevant && (!indexTemplate ? !inventory.has(boundary) : ![...inventory].some((item) => item.startsWith(template.replace('{index}', ''))))) {
      throw new Error(`${surface} ${operation}: declared reachable boundary ${template} is not covered by the matrix`);
    }
  }
}

function run(target, abortBoundary, failAfter) {
  const [executable, args, variables] = command(target);
  const env = { ...process.env, ...variables };
  if (abortBoundary) env.RUST_INTEL_INSTALL_ABORT_AT = abortBoundary;
  else delete env.RUST_INTEL_INSTALL_ABORT_AT;
  if (failAfter) env.RUST_INTEL_INSTALL_FAIL_AFTER = String(failAfter);
  else delete env.RUST_INTEL_INSTALL_FAIL_AFTER;
  let executableToRun = executable;
  let argsToRun = args;
  if (executable === 'wsl.exe') {
    const forwarded = ['CLAUDE_CONFIG_DIR', 'RUST_INTEL_INSTALL_ABORT_AT', 'RUST_INTEL_INSTALL_FAIL_AFTER']
      .filter((name) => env[name] !== undefined)
      .map((name) => `${name}='${String(env[name]).replaceAll("'", "'\\''")}'`);
    const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
    argsToRun = ['bash', '-lc', `${forwarded.join(' ')} exec bash ${shellQuote(args[2])}`];
  }
  const result = spawnSync(executableToRun, argsToRun, { cwd: repo, env, encoding: 'utf8' });
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
  assertBoundaryDeclarations();
  fixture(expectedTarget);
  fixture(actualTarget);
  if (operation === 'install') {
    const clean = run(expectedTarget);
    assertStatus(clean, 0, 'clean install');
  }
  const expected = operation === 'install'
    ? snapshot(expectedTarget)
    : (() => { const result = run(expectedTarget); assertStatus(result, 0, 'clean uninstall'); return snapshot(expectedTarget); })();
  const restoreBoundary = /^(before-restore|after-restore-rename|after-restore-status)-/.test(boundary);
  const rollbackBoundary = /^(before-rollback|after-rollback)-/.test(boundary);
  if (restoreBoundary) {
    const restoreIndex = Number(boundary.match(/(\d+)$/)[1]);
    const forward = activeBackupForMode().length > 0
      ? 'after-backup-rename-' + restoreIndex
      : 'after-replacement-rename-' + (replacementsForMode()[0]);
    const interrupted = run(actualTarget, forward);
    assertStatus(interrupted, 86, `${surface} ${operation} ${mode} restore setup`);
    const restoring = run(actualTarget, boundary);
    assertStatus(restoring, 86, `${surface} ${operation} ${mode} ${boundary}`);
  } else {
    const interrupted = rollbackBoundary ? run(actualTarget, boundary, 1) : run(actualTarget, boundary);
    assertStatus(interrupted, 86, `${surface} ${operation} ${mode} ${boundary}`);
  }
  const restarted = run(actualTarget);
  assertStatus(restarted, 0, `${surface} ${operation} ${mode} ${boundary} restart`);
  const actual = snapshot(actualTarget);
  if (actual !== expected) {
    throw new Error(`${surface} ${operation} ${mode} ${boundary}: successful restart did not produce the clean-operation inventory`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
