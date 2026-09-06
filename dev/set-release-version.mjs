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
// restore an interrupted transaction. RUST_INTEL_RELEASE_FAIL_AFTER=1..3 is a bounded calibration
// hook: it injects a failure after that many replacements, proving rollback without touching the
// caller's real manifests when used against a temporary copy.
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
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeJournal(state) {
  const temporary = siblingPath(journalPath, 'tmp');
  try {
    writeDurably(temporary, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporary, journalPath);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the original error */ }
    throw error;
  }
}

function removeIfPresent(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
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
  for (const entry of [...state.entries].reverse()) {
    const targetExists = fs.existsSync(entry.target);
    const backupExists = fs.existsSync(entry.backup);
    if (backupExists) {
      if (targetExists) removeIfPresent(entry.target);
      fs.renameSync(entry.backup, entry.target);
    } else if (!targetExists) {
      fail(`cannot roll back ${entry.target}: both destination and backup are missing`);
    }
    removeIfPresent(entry.temp);
  }
  removeIfPresent(journalPath);
}

function finishCommitted(state) {
  validateJournal(state);
  for (const entry of state.entries) {
    removeIfPresent(entry.temp);
    removeIfPresent(entry.backup);
  }
  removeIfPresent(journalPath);
}

function recoverInterruptedTransaction() {
  if (!fs.existsSync(journalPath)) return;
  const state = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  validateJournal(state);
  if (state.phase === 'committed') finishCommitted(state);
  else rollback(state);
  console.error('Recovered an interrupted release-version transaction before starting.');
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

if (!version || !isValidSemver(version)) {
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
  recoverInterruptedTransaction();
  const prepared = readAndValidateManifests();
  transaction = {
    phase: 'prepared',
    entries: prepared.map(({ file, mode }) => ({ target: file, temp: siblingPath(file, 'tmp'), backup: siblingPath(file, 'bak'), mode })),
  };

  try {
    for (const [index, item] of prepared.entries()) {
      const entry = transaction.entries[index];
      writeDurably(entry.temp, item.content, item.mode);
    }
    writeJournal(transaction);

    for (const [index, entry] of transaction.entries.entries()) {
      fs.renameSync(entry.target, entry.backup);
      fs.renameSync(entry.temp, entry.target);
      writeJournal(transaction);
      injectedFailureAfter(index + 1);
    }
    transaction.phase = 'committed';
    writeJournal(transaction);
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
