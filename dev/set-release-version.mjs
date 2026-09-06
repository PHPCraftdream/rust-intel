#!/usr/bin/env node
// Manual release-bump utility. Run this locally, review the diff, commit it, THEN create the
// tag — the tag must always be created on a commit that already carries the target version.
// CI does not run this: dev/check-release-version.mjs verifies the tag against what got
// committed here; it never rewrites manifests after the tag has been resolved. Release tooling
// must publish the tree selected by the tag, rather than synthesizing a different version after
// checkout.
//
// The three-manifest update is a small transaction. Every input is parsed and validated before
// any destination is touched; replacements are made from fsynced sibling files and old files
// are retained as siblings until the commit point. A deterministic journal lets the next run
// restore an interrupted transaction. On POSIX, parent-directory fsync makes the rename sequence
// durable after each entry change. On Windows, Node does not expose a write-through directory-
// metadata primitive here, so the contract is calibrated process-interruption recovery only;
// sudden power-loss durability is explicitly out of scope. RUST_INTEL_RELEASE_FAIL_AFTER=1..3
// is a bounded calibration hook: it injects a failure after that many replacements, proving
// rollback without touching the caller's real manifests when used against a temporary copy.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isValidSemver } from './semver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifests = ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];
const journalPath = path.join(root, '.release-version-transaction.json');
const version = process.argv[2];

function fail(message) {
  throw new Error(message);
}

function siblingPath(file, kind) {
  return `${file}.${kind}-${process.pid}-${randomUUID()}`;
}

function writeDurably(file, data, mode) {
  const fd = fs.openSync(file, 'wx', mode ?? 0o600);
  try {
    fs.writeFileSync(fd, data, 'utf8');
    if (mode !== undefined) fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function syncDirectory(directory) {
  // POSIX needs the containing directory synced after an entry change. Node has no portable
  // Windows write-through directory-metadata API; the Windows contract is process-interruption
  // recovery, not a sudden-power-loss durability guarantee.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function durableRename(from, to) {
  fs.renameSync(from, to);
  syncDirectory(path.dirname(to));
}

function durableRemove(file) {
  fs.rmSync(file, { force: true });
  syncDirectory(path.dirname(file));
}

function abortAt(boundary) {
  if (process.env.RUST_INTEL_RELEASE_ABORT_AT === boundary) process.exit(86);
}

function writeJournal(state) {
  const temporary = siblingPath(journalPath, 'tmp');
  const previous = `${journalPath}.prev`;
  try {
    abortAt('before-journal-write');
    writeDurably(temporary, `${JSON.stringify(state, null, 2)}\n`);
    abortAt('after-journal-temp-write');
    if (process.platform === 'win32') {
      // Windows rename does not replace an existing destination. Keep the old journal in a
      // recovery slot while installing the new one; a restart can restore that slot if the
      // process exits in the gap between the two same-volume renames.
      removeIfPresent(previous);
      if (fs.existsSync(journalPath)) {
        abortAt('before-journal-old-rename');
        durableRename(journalPath, previous);
        abortAt('after-journal-old-rename');
      }
      abortAt('before-journal-rename');
      durableRename(temporary, journalPath);
      abortAt('after-journal-rename');
      removeIfPresent(previous);
    } else {
      durableRename(temporary, journalPath);
      abortAt('after-journal-rename');
    }
  } catch (error) {
    try { durableRemove(temporary); } catch { /* preserve the original error */ }
    throw error;
  }
}

function removeIfPresent(file) {
  try {
    durableRemove(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function removeJournalTemps() {
  const directory = path.dirname(journalPath);
  const prefix = `${path.basename(journalPath)}.tmp-`;
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith(prefix)) removeIfPresent(path.join(directory, name));
  }
}

function recoverJournalSlot() {
  const previous = `${journalPath}.prev`;
  if (!fs.existsSync(previous)) return;
  if (!fs.existsSync(journalPath)) durableRename(previous, journalPath);
  else removeIfPresent(previous);
}

function validateJournal(state) {
  if (!state || (state.phase !== 'prepared' && state.phase !== 'committed') || !Array.isArray(state.entries) || state.entries.length !== manifests.length) {
    fail(`invalid release transaction journal at ${journalPath}`);
  }
  const expected = manifests.map((relative) => path.resolve(root, relative));
  for (const [index, entry] of state.entries.entries()) {
    const targetName = path.basename(expected[index]);
    const sibling = (candidate, kind) => typeof candidate === 'string'
      && path.dirname(candidate) === path.dirname(expected[index])
      && path.basename(candidate).startsWith(`${targetName}.${kind}-`);
    if (!entry || entry.target !== expected[index] || !sibling(entry.temp, 'tmp') || !sibling(entry.backup, 'bak')) {
      fail(`invalid release transaction journal entry ${index + 1} at ${journalPath}`);
    }
  }
}

// Restore every old manifest whenever the transaction has not reached its commit point. The
// filesystem checks deliberately infer the state too: a kill between rename(target, backup) and
// the journal write is recoverable on the next invocation.
function rollback(state) {
  validateJournal(state);
  for (const [reverseIndex, entry] of [...state.entries].reverse().entries()) {
    const targetExists = fs.existsSync(entry.target);
    const backupExists = fs.existsSync(entry.backup);
    if (backupExists) {
      if (targetExists) removeIfPresent(entry.target);
      abortAt(`before-rollback-rename-${reverseIndex + 1}`);
      durableRename(entry.backup, entry.target);
      abortAt(`after-rollback-rename-${reverseIndex + 1}`);
    } else if (!targetExists) {
      fail(`cannot roll back ${entry.target}: both destination and backup are missing`);
    }
    abortAt(`before-rollback-temp-${reverseIndex + 1}`);
    removeIfPresent(entry.temp);
    abortAt(`after-rollback-temp-${reverseIndex + 1}`);
  }
  abortAt('before-rollback-journal-remove');
  removeIfPresent(journalPath);
  abortAt('after-rollback-journal-remove');
}

function finishCommitted(state) {
  validateJournal(state);
  for (const [index, entry] of state.entries.entries()) {
    abortAt(`before-committed-temp-${index + 1}`);
    removeIfPresent(entry.temp);
    abortAt(`after-committed-temp-${index + 1}`);
    abortAt(`before-committed-backup-${index + 1}`);
    removeIfPresent(entry.backup);
    abortAt(`after-committed-backup-${index + 1}`);
  }
  abortAt('before-committed-journal-remove');
  removeIfPresent(journalPath);
  abortAt('after-committed-journal-remove');
}

function recoverInterruptedTransaction() {
  recoverJournalSlot();
  removeJournalTemps();
  if (!fs.existsSync(journalPath)) return false;
  const state = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  validateJournal(state);
  if (state.phase === 'committed') finishCommitted(state);
  else rollback(state);
  console.error('Recovered an interrupted release-version transaction before starting.');
  return true;
}

function readAndValidateManifests() {
  return manifests.map((relative) => {
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    let json;
    try {
      json = JSON.parse(source);
    } catch (error) {
      fail(`${relative} is not valid JSON: ${error.message}`);
    }
    if (!json || typeof json !== 'object' || Array.isArray(json) || !isValidSemver(json.version)) {
      fail(`${relative} must be a JSON object with a valid existing SemVer version`);
    }
    const mode = fs.statSync(file).mode & 0o777;
    return { file, content: `${JSON.stringify({ ...json, version }, null, 2)}\n`, mode };
  });
}

function injectedFailureAfter(replacements) {
  const raw = process.env.RUST_INTEL_RELEASE_FAIL_AFTER;
  if (raw === undefined) return;
  if (!/^[1-3]$/.test(raw)) fail('RUST_INTEL_RELEASE_FAIL_AFTER must be an integer from 1 to 3');
  if (Number(raw) === replacements) fail(`injected release-version failure after replacement ${replacements}`);
}

const recoveryOnly = process.argv[2] === '--recover';
if (recoveryOnly && process.argv.length !== 3) {
  console.error('usage: node dev/set-release-version.mjs --recover');
  process.exit(1);
}
if (!recoveryOnly && (!version || !isValidSemver(version))) {
  console.error('usage: node dev/set-release-version.mjs <semver>');
  process.exit(1);
}

let transaction = null;
let handlingSignal = false;
const handleTermination = (signal) => {
  if (handlingSignal) process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  handlingSignal = true;
  try {
    if (transaction?.phase !== 'committed') rollback(transaction);
  } catch (error) {
    console.error(`ERROR: failed to roll back after ${signal}: ${error.message}`);
    process.exit(1);
  }
  process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
};
process.on('SIGINT', () => handleTermination('SIGINT'));
process.on('SIGTERM', () => handleTermination('SIGTERM'));

try {
  if (recoveryOnly) {
    recoverInterruptedTransaction();
    console.log('Release-version recovery completed.');
    process.exit(0);
  }
  recoverInterruptedTransaction();
  const prepared = readAndValidateManifests();
  transaction = {
    phase: 'prepared',
    entries: prepared.map(({ file, mode }) => ({ target: file, temp: siblingPath(file, 'tmp'), backup: siblingPath(file, 'bak'), mode, backedUp: false, installed: false })),
  };

  // Publish the recovery names before creating any temporary files. Thus even a process exit
  // during staging leaves a journal that names every artifact that recovery must remove.
  writeJournal(transaction);
  try {
    for (const [index, item] of prepared.entries()) {
      const entry = transaction.entries[index];
      writeDurably(entry.temp, item.content, item.mode);
    }
    writeJournal(transaction);

    for (const [index, entry] of transaction.entries.entries()) {
      abortAt(`before-backup-rename-${index + 1}`);
      durableRename(entry.target, entry.backup);
      abortAt(`after-backup-rename-${index + 1}`);
      entry.backedUp = true;
      writeJournal(transaction);
      abortAt(`before-target-rename-${index + 1}`);
      durableRename(entry.temp, entry.target);
      abortAt(`after-target-rename-${index + 1}`);
      entry.installed = true;
      writeJournal(transaction);
      injectedFailureAfter(index + 1);
    }
    transaction.phase = 'committed';
    abortAt('before-committed-journal');
    writeJournal(transaction);
    abortAt('after-committed-journal');
    finishCommitted(transaction);
  } catch (error) {
    if (transaction.phase !== 'committed') {
      try { rollback(transaction); } catch (rollbackError) {
        throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`, { cause: error });
      }
    }
    throw error;
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}

console.log(`Set package, Claude, and Codex manifests to ${version}. Review the diff, commit it, then tag v${version}.`);
