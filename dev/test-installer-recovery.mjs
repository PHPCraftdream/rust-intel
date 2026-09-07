#!/usr/bin/env node
// Exercise installer transaction boundaries and require exact exit 86 followed by a clean
// restart. The concrete inventory below is the single source for the CI matrix and assertions.
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const listMode = args[0] === '--list';
const crossMode = args[0] === '--cross' || args[4] === 'cross';
const commandArgs = args[0] === '--list' || args[0] === '--cross' ? args.slice(1) : args;
const [surface, operation, mode, boundary] = commandArgs;
const validSurfaces = new Set(['node-claude', 'node-codex', 'bash', 'powershell']);
const validOperations = new Set(['install', 'uninstall']);
const validModes = new Set(['fresh', 'upgrade', 'sparse']);
const expectedArgCount = listMode ? 4 : crossMode ? 5 : 4;
if (!validSurfaces.has(surface) || !validOperations.has(operation) || !validModes.has(mode)
    || (!boundary && !listMode) || args.length !== expectedArgCount) {
  console.error(listMode
    ? 'usage: node dev/test-installer-recovery.mjs --list <surface> <operation> <mode>'
    : 'usage: node dev/test-installer-recovery.mjs <surface> <operation> <mode> <boundary>');
  process.exit(2);
}
if (mode === 'fresh' && operation === 'uninstall') {
  console.error('fresh uninstall has no transaction to exercise');
  process.exit(2);
}

const repo = path.resolve(import.meta.dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-recovery-'));
let invocation = 0;

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function ownedPaths(target) {
  if (surface === 'node-codex') return [path.join(target, 'rust-intel')];
  if (surface === 'node-claude') return [
    path.join(target, 'skills', 'rust-intel'),
    path.join(target, 'commands', 'rust-cc-audit.md'),
    path.join(target, 'commands', 'rust-cc-fix.md'),
    path.join(target, 'commands', 'rust-cc-plan.md'),
    path.join(target, 'commands', 'rust-intel-cc'),
    path.join(target, 'commands', 'rust-audit.md'),
    path.join(target, 'commands', 'rust-fix.md'),
    path.join(target, 'commands', 'rust-plan.md'),
    path.join(target, 'commands', 'rust-intel.md'),
  ];
  return [
    path.join(target, 'skills', 'rust-intel'),
    path.join(target, 'commands', 'rust-cc-audit.md'),
    path.join(target, 'commands', 'rust-cc-fix.md'),
    path.join(target, 'commands', 'rust-cc-plan.md'),
    path.join(target, 'commands', 'rust-intel-cc'),
    path.join(target, 'commands', 'rust-audit.md'),
    path.join(target, 'commands', 'rust-fix.md'),
    path.join(target, 'commands', 'rust-plan.md'),
    path.join(target, 'commands', 'rust-intel.md'),
  ];
}

// This is an independent oracle for the transaction namespaces. Keep it keyed only by the
// installer surface: both operation prefixes must remain checked even when the case exercises
// only one operation.
const EXPECTED_TRANSACTION_PREFIXES = Object.freeze({
  'node-claude': Object.freeze(['.rust-intel-tx-']),
  'node-codex': Object.freeze(['.rust-intel-tx-']),
  bash: Object.freeze(['.rust-intel-bash-tx.', '.rust-intel-bash-uninstall.']),
  powershell: Object.freeze(['.rust-intel-ps-tx-', '.rust-intel-ps-uninstall-']),
});

function expectedTransactionPrefixes() {
  return EXPECTED_TRANSACTION_PREFIXES[surface];
}

function unrelatedSibling(target) {
  const sibling = path.join(path.dirname(target), `.foreign-rust-intel-${surface}`);
  write(path.join(sibling, 'stage', 'foreign.txt'), 'foreign\n');
  write(path.join(sibling, 'backup', 'foreign.txt'), 'foreign\n');
  write(path.join(sibling, 'journal'), 'foreign transaction\n');
  return sibling;
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
  unrelatedSibling(target);
  if (mode === 'fresh') {
    if (surface !== 'node-codex') {
      // Model the existing Claude/Bash config roots. A clean uninstall preserves these user-owned
      // containers, so the direct opposite-operation oracle has the same starting inventory as a
      // subject that first performed an install.
      fs.mkdirSync(path.join(target, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
    }
    write(path.join(target, 'other', 'sibling.md'), 'unrelated\n');
    return;
  }
  const sparse = mode === 'sparse';
  if (surface === 'node-codex') {
    if (!sparse) write(path.join(target, 'rust-intel', 'SKILL.md'), 'old-codex\n');
    else write(path.join(target, 'other-owned-looking', 'keep.txt'), 'sparse-codex\n');
    write(path.join(target, 'other', 'sibling.md'), 'unrelated\n');
  } else claudeFixture(target, sparse);
}

function present(value) {
  try { fs.lstatSync(value); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function activeBackupIndices(target) {
  return ownedPaths(target).flatMap((destination, index) => (present(destination) ? [index] : []));
}

function boundaryInventory(backups, replacements) {
  const boundaries = new Set(['before-journal', 'after-journal', 'before-commit', 'after-commit', 'before-cleanup', 'after-cleanup']);
  for (const index of backups) {
    for (const phase of ['before-backup', 'after-backup-journal', 'after-backup-rename']) boundaries.add(`${phase}-${index}`);
    for (const phase of ['before-restore', 'after-restore-rename', 'after-restore-status']) boundaries.add(`${phase}-${index}`);
  }
  for (const index of replacements) {
    for (const phase of ['before-replacement', 'after-replacement-journal', 'after-replacement-rename']) boundaries.add(`${phase}-${index}`);
  }
  const rollback = operation === 'install' ? replacements : backups;
  for (const index of rollback) for (const phase of ['before-rollback', 'after-rollback']) boundaries.add(`${phase}-${index}`);
  return { boundaries, backups, replacements };
}

function expectedReplacementIndices() {
  if (operation !== 'install') return [];
  if (surface === 'node-codex') return [0];
  if (surface === 'node-claude') return [0, 1, 2, 3];
  return [0, 1, 2, 3];
}

function assertReplacementInventory(hooks, label) {
  const expected = expectedReplacementIndices();
  const expectedHooks = expected.flatMap((index) => [
    `before-replacement-${index}`,
    `after-replacement-journal-${index}`,
    `after-replacement-rename-${index}`,
  ]);
  const actualHooks = hooks.filter((entry) => /^(?:before|after)-replacement(?:-journal|-rename)?-\d+$/.test(entry));
  if (JSON.stringify(actualHooks) !== JSON.stringify(expectedHooks)) {
    throw new Error(`${label}: clean replacement hooks ${JSON.stringify(actualHooks)} do not match declared inventory ${JSON.stringify(expectedHooks)}`);
  }
}

function declaredBoundaryTemplates() {
  const source = surface.startsWith('node-')
    ? fs.readFileSync(path.join(repo, 'bin', 'install-transaction.js'), 'utf8')
    : fs.readFileSync(path.join(repo, operation === 'install' ? 'rust-cc-install.' : 'rust-cc-uninstall.') + (surface === 'bash' ? 'sh' : 'ps1'), 'utf8');
  const match = source.match(/RUST_INTEL_ABORT_BOUNDARIES:\s*([^\r\n]+)/);
  if (!match) throw new Error(`${surface} ${operation}: implementation boundary declaration is missing`);
  return new Set(match[1].split(',').map((item) => item.trim()).filter(Boolean));
}

function assertBoundaryDeclarations(inventory) {
  const declared = declaredBoundaryTemplates();
  const rollbackCount = operation === 'install' ? inventory.replacements.length : inventory.backups.length;
  const categoryIsReachable = (template) => {
    const category = template.match(/^(?:before|after)-(backup|replacement|restore|rollback)/)?.[1];
    if (category === 'backup' || category === 'restore') return inventory.backups.length > 0;
    if (category === 'replacement') return inventory.replacements.length > 0;
    if (category === 'rollback') return rollbackCount > 0;
    return true;
  };
  for (const concrete of inventory.boundaries) {
    const covered = [...declared].some((template) => {
      if (!template.includes('{index}')) return template === concrete;
      const prefix = template.slice(0, template.indexOf('{index}'));
      return concrete.startsWith(prefix) && /^\d+$/.test(concrete.slice(prefix.length));
    });
    if (!covered) throw new Error(`${surface} ${operation}: matrix boundary ${concrete} is not declared by implementation`);
  }
  for (const template of declared) {
    if (!categoryIsReachable(template)) continue;
    if (!template.includes('{index}')) {
      if (!inventory.boundaries.has(template)) throw new Error(`${surface} ${operation}: declared boundary ${template} is not covered by matrix`);
      continue;
    }
    const prefix = template.slice(0, template.indexOf('{index}'));
    if (![...inventory.boundaries].some((concrete) => concrete.startsWith(prefix) && /^\d+$/.test(concrete.slice(prefix.length)))) {
      throw new Error(`${surface} ${operation}: declared concrete boundary ${template} is not covered by matrix`);
    }
  }
}

function command(target, operationName = operation) {
  if (surface === 'node-claude') {
    const commandArgs = [path.join(repo, 'bin', 'install.js'), '--user'];
    if (operationName === 'uninstall') commandArgs.push('--uninstall');
    return [process.execPath, commandArgs, { CLAUDE_CONFIG_DIR: target }];
  }
  if (surface === 'node-codex') {
    const commandArgs = [path.join(repo, 'bin', 'install-codex.js'), '--user-dir', target];
    if (operationName === 'uninstall') commandArgs.push('--uninstall');
    return [process.execPath, commandArgs, {}];
  }
  if (surface === 'bash') {
    const toPosix = (value) => process.platform === 'win32' && /^[A-Za-z]:[\\/]/.test(value)
      ? `/mnt/${value[0].toLowerCase()}${value.slice(2).replaceAll('\\', '/')}` : value;
    const script = toPosix(path.join(repo, operationName === 'install' ? 'rust-cc-install.sh' : 'rust-cc-uninstall.sh'));
    return process.platform === 'win32'
      ? ['wsl.exe', ['env', 'bash', script], { CLAUDE_CONFIG_DIR: toPosix(target) }]
      : ['bash', [script], { CLAUDE_CONFIG_DIR: toPosix(target) }];
  }
  return ['pwsh', ['-NoProfile', '-File', path.join(repo, operationName === 'install' ? 'rust-cc-install.ps1' : 'rust-cc-uninstall.ps1')], { CLAUDE_CONFIG_DIR: target }];
}

function run(target, abortBoundary, failAfter, operationName = operation) {
  const [executableName, processArgs, variables] = command(target, operationName);
  const logPath = path.join(root, `hooks-${invocation++}.log`);
  fs.writeFileSync(logPath, '');
  const env = { ...process.env, ...variables, RUST_INTEL_INSTALL_ABORT_LOG: logPath };
  if (abortBoundary) env.RUST_INTEL_INSTALL_ABORT_AT = abortBoundary;
  else delete env.RUST_INTEL_INSTALL_ABORT_AT;
  if (failAfter) env.RUST_INTEL_INSTALL_FAIL_AFTER = String(failAfter);
  else delete env.RUST_INTEL_INSTALL_FAIL_AFTER;
  let executable = executableName;
  let argsForRun = processArgs;
  if (executable === 'wsl.exe') {
    const toPosix = (value) => /^[A-Za-z]:[\\/]/.test(value)
      ? `/mnt/${value[0].toLowerCase()}${value.slice(2).replaceAll('\\', '/')}` : value;
    const forwarded = ['CLAUDE_CONFIG_DIR', 'RUST_INTEL_INSTALL_ABORT_AT', 'RUST_INTEL_INSTALL_FAIL_AFTER', 'RUST_INTEL_INSTALL_ABORT_LOG']
      .filter((name) => env[name] !== undefined)
      .map((name) => `${name}='${String(name === 'RUST_INTEL_INSTALL_ABORT_LOG' ? toPosix(env[name]) : env[name]).replaceAll("'", "'\\''")}'`);
    const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
    argsForRun = ['bash', '-lc', `${forwarded.join(' ')} exec bash ${shellQuote(processArgs[2])}`];
  }
  const result = spawnSync(executable, argsForRun, { cwd: repo, env, encoding: 'utf8', timeout: 120_000 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`${surface} ${operationName}: installer child timed out after 120000ms`);
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${surface} ${operationName}: installer child terminated by ${result.signal}`);
  const hooks = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
  return { result, hooks };
}

function snapshot(target) {
  const result = spawnSync(process.execPath, [path.join(repo, 'dev', 'snapshot-install.mjs'), target], { encoding: 'utf8', timeout: 30_000 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`${surface} ${operation}: snapshot child timed out after 30000ms`);
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${surface} ${operation}: snapshot child terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`snapshot failed: ${result.stderr}`);
  return result.stdout;
}

function assertStatus(runResult, expected, label) {
  if (runResult.result.status !== expected) {
    throw new Error(`${label}: expected exit ${expected}, got ${runResult.result.status}\nstdout:\n${runResult.result.stdout}\nstderr:\n${runResult.result.stderr}`);
  }
}

function assertHook(runResult, boundaryName, label) {
  const count = runResult.hooks.filter((entry) => entry === boundaryName).length;
  if (count !== 1) throw new Error(`${label}: expected hook ${boundaryName} exactly once, observed ${count} (${runResult.hooks.join(', ')})`);
}

function assertCleanTransactionParent(target, sibling) {
  const entries = fs.readdirSync(path.dirname(target), { withFileTypes: true });
  const leftovers = entries.filter((entry) => expectedTransactionPrefixes().some((prefix) => entry.name.startsWith(prefix)));
  if (leftovers.length) throw new Error(`${surface} ${operation}: transaction artifacts remain after restart: ${leftovers.map((entry) => entry.name).join(', ')} in ${path.dirname(target)}`);
  if (!present(sibling) || fs.readFileSync(path.join(sibling, 'journal'), 'utf8') !== 'foreign transaction\n') {
    throw new Error(`${surface} ${operation}: unrelated sibling transaction was removed or changed`);
  }
}

function interruptAtBoundary(target, inventory, boundary, labelPrefix) {
  const restoreBoundary = /^(before-restore|after-restore-rename|after-restore-status)-/.test(boundary);
  const rollbackBoundary = /^(before-rollback|after-rollback)-/.test(boundary);
  if (restoreBoundary) {
    const index = Number(boundary.match(/(\d+)$/)[1]);
    const setupBoundary = `after-backup-rename-${index}`;
    const setup = run(target, setupBoundary);
    assertStatus(setup, 86, `${labelPrefix} restore setup`);
    assertHook(setup, setupBoundary, `${labelPrefix} restore setup`);
    const beforeRestore = `before-restore-${index}`;
    const afterRestoreRename = `after-restore-rename-${index}`;
    const afterRestoreStatus = `after-restore-status-${index}`;
    if (boundary === afterRestoreStatus) {
      const first = run(target, beforeRestore);
      assertStatus(first, 86, `${labelPrefix} first restore interruption`);
      assertHook(first, beforeRestore, `${labelPrefix} first restore interruption`);
    } else {
      const first = run(target, boundary);
      assertStatus(first, 86, `${labelPrefix} first restore interruption`);
      assertHook(first, boundary, `${labelPrefix} first restore interruption`);
    }
    const secondBoundary = boundary === beforeRestore ? afterRestoreRename : afterRestoreStatus;
    const second = run(target, boundary === afterRestoreStatus ? boundary : secondBoundary);
    assertStatus(second, 86, `${labelPrefix} second restore interruption`);
    assertHook(second, boundary === afterRestoreStatus ? boundary : secondBoundary, `${labelPrefix} second restore interruption`);
    return;
  }
  const index = Number(boundary.match(/(\d+)$/)?.[1]);
  const sequence = rollbackBoundary ? (operation === 'install' ? inventory.replacements : inventory.backups) : [];
  const position = rollbackBoundary ? sequence.indexOf(index) : -1;
  if (rollbackBoundary && position < 0) throw new Error(`${labelPrefix}: rollback index ${index} is absent from concrete inventory`);
  const interrupted = run(target, boundary, rollbackBoundary ? position + 1 : undefined);
  assertStatus(interrupted, 86, labelPrefix);
  assertHook(interrupted, boundary, labelPrefix);
}

try {
  if (listMode) {
    const target = path.join(root, 'inventory target');
    fixture(target);
    const backups = activeBackupIndices(target);
    const clean = run(target);
    assertStatus(clean, 0, `clean ${operation}`);
    assertReplacementInventory(clean.hooks, `${surface} ${operation}`);
    const inventory = boundaryInventory(backups, expectedReplacementIndices());
    if (expectedReplacementIndices().length > 0) {
      const missingSeedHooks = clean.hooks.filter((entry) => !/^before-replacement-\d+$/.test(entry));
      let rejectedMissingSeed = false;
      try { assertReplacementInventory(missingSeedHooks, `${surface} ${operation} missing-seed negative`); }
      catch { rejectedMissingSeed = true; }
      if (!rejectedMissingSeed) throw new Error(`${surface} ${operation}: missing replacement inventory seed was accepted`);
    }
    assertBoundaryDeclarations(inventory);
    for (const item of inventory.boundaries) console.log(item);
  } else {
    const expectedTarget = path.join(root, 'expected target with spaces');
    const actualTarget = path.join(root, 'actual target with spaces');
    fixture(expectedTarget);
    fixture(actualTarget);
    const expectedBackups = activeBackupIndices(expectedTarget);
    const actualBackups = activeBackupIndices(actualTarget);
    const sibling = unrelatedSibling(actualTarget);
    const clean = run(expectedTarget);
    assertStatus(clean, 0, `clean ${operation}`);
    const oppositeOperation = operation === 'install' ? 'uninstall' : 'install';
    assertReplacementInventory(clean.hooks, `${surface} ${operation}`);
    const replacements = expectedReplacementIndices();
    const expectedInventory = boundaryInventory(expectedBackups, replacements);
    const actualInventory = boundaryInventory(actualBackups, replacements);
    assertBoundaryDeclarations(actualInventory);
    if (JSON.stringify(expectedInventory) !== JSON.stringify(actualInventory)) throw new Error('expected and actual fixtures have different concrete inventories');
    if (!actualInventory.boundaries.has(boundary)) {
      const probe = run(actualTarget, boundary);
      assertStatus(probe, 0, `nonexistent abort boundary ${boundary}`);
      throw new Error(`${surface} ${operation} ${mode} ${boundary}: boundary is not reachable; coverage case rejected`);
    }
    let expected;
    if (crossMode) {
      // The expected side is an independent semantic oracle: apply only the clean opposite
      // operation to the original fixture. The interrupted first operation belongs only to the
      // subject side below.
      fs.rmSync(expectedTarget, { recursive: true, force: true });
      fixture(expectedTarget);
      const oppositeExpected = run(expectedTarget, undefined, undefined, oppositeOperation);
      assertStatus(oppositeExpected, 0, `clean oracle ${oppositeOperation}`);
      expected = snapshot(expectedTarget);
    } else expected = snapshot(expectedTarget);
    interruptAtBoundary(actualTarget, actualInventory, boundary, `${surface} ${operation} ${mode} ${boundary}`);
    const restarted = run(actualTarget, undefined, undefined, crossMode ? oppositeOperation : operation);
    assertStatus(restarted, 0, `${surface} ${operation} ${mode} ${boundary} ${crossMode ? 'cross-' : ''}restart`);
    const actualSnapshot = snapshot(actualTarget);
    if (actualSnapshot !== expected) throw new Error(`${surface} ${operation} ${mode} ${boundary}: restart did not produce clean-operation inventory\nexpected=${expected}\nactual=${actualSnapshot}`);
    if (crossMode) {
      // A deterministic mutation must be visible to the full-tree oracle. This counterfactual
      // guards against an expected side that accidentally replays the subject's recovery path.
      const corruption = path.join(actualTarget, '.rust-intel-recovery-counterfactual');
      write(corruption, 'deterministic corruption\n');
      const corruptedSnapshot = snapshot(actualTarget);
      fs.rmSync(corruption, { force: true });
      if (corruptedSnapshot === expected) throw new Error(`${surface} ${operation}: cross-operation oracle accepted deterministic recovery corruption`);
    }
    for (const prefix of expectedTransactionPrefixes()) {
      const negativeTransaction = path.join(path.dirname(actualTarget), `${prefix}negative`);
      write(path.join(negativeTransaction, 'stage', 'owned.txt'), 'owned\n');
      write(path.join(negativeTransaction, 'backup', 'owned.txt'), 'owned\n');
      write(path.join(negativeTransaction, 'journal'), 'owned transaction\n');
      let rejectedOwnedTransaction = false;
      try { assertCleanTransactionParent(actualTarget, sibling); }
      catch { rejectedOwnedTransaction = true; }
      fs.rmSync(negativeTransaction, { recursive: true, force: true });
      if (!rejectedOwnedTransaction) throw new Error(`${surface} ${operation}: owned transaction prefix ${prefix} was accepted as clean`);
    }
    assertCleanTransactionParent(actualTarget, sibling);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
