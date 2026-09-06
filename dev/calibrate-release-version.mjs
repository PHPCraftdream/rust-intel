#!/usr/bin/env node
// Bounded regression calibration for dev/set-release-version.mjs.
// Each case uses a fresh temporary copy. The child is deliberately terminated at every
// journal/rename boundary, then the recovery-only entry point must leave either one complete
// old manifest set or one complete new set, with original modes and no transaction debris.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFiles = ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];
const copiedFiles = [...manifestFiles, 'dev/set-release-version.mjs', 'dev/semver.mjs'];
const abortBoundaries = [
  'before-journal-write', 'after-journal-temp-write',
  ...(process.platform === 'win32' ? [
    'before-journal-old-rename', 'after-journal-old-rename', 'before-journal-rename',
  ] : []),
  'after-journal-rename',
  ...manifestFiles.flatMap((_, index) => [
    `before-backup-rename-${index + 1}`, `after-backup-rename-${index + 1}`,
    `before-target-rename-${index + 1}`, `after-target-rename-${index + 1}`,
    `before-rollback-rename-${index + 1}`, `after-rollback-rename-${index + 1}`,
    `before-rollback-temp-${index + 1}`, `after-rollback-temp-${index + 1}`,
    `before-committed-temp-${index + 1}`, `after-committed-temp-${index + 1}`,
    `before-committed-backup-${index + 1}`, `after-committed-backup-${index + 1}`,
  ]),
  'before-committed-journal', 'after-committed-journal',
  'before-rollback-journal-remove', 'after-rollback-journal-remove',
  'before-committed-journal-remove', 'after-committed-journal-remove',
];

function copyInputs(caseRoot) {
  for (const relative of copiedFiles) {
    const destination = path.join(caseRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
}

function files(caseRoot) {
  return manifestFiles.map((relative) => path.join(caseRoot, relative));
}

function snapshot(caseRoot) {
  return files(caseRoot).map((file) => ({ bytes: fs.readFileSync(file), mode: fs.statSync(file).mode & 0o777 }));
}

function run(caseRoot, args, extraEnv = {}) {
  const environment = { ...process.env };
  delete environment.RUST_INTEL_RELEASE_ABORT_AT;
  delete environment.RUST_INTEL_RELEASE_FAIL_AFTER;
  Object.assign(environment, extraEnv);
  return spawnSync(process.execPath, [path.join(caseRoot, 'dev', 'set-release-version.mjs'), ...args], {
    cwd: caseRoot, encoding: 'utf8', env: environment,
  });
}

function assertEqualSnapshot(actual, expected, label) {
  actual.forEach((item, index) => {
    if (!item.bytes.equals(expected[index].bytes) || item.mode !== expected[index].mode) {
      throw new Error(`${label}: manifest ${manifestFiles[index]} differs in bytes or mode`);
    }
  });
}

function assertOldOrNew(actual, oldState, newState, label) {
  const isOld = actual.every((item, index) => item.bytes.equals(oldState[index].bytes));
  const isNew = actual.every((item, index) => item.bytes.equals(newState[index].bytes));
  if (!isOld && !isNew) throw new Error(`${label}: manifests are mixed rather than old-or-new`);
  actual.forEach((item, index) => {
    if (item.mode !== oldState[index].mode || item.mode !== newState[index].mode) {
      throw new Error(`${label}: ${manifestFiles[index]} mode changed`);
    }
  });
}

function assertNoArtifacts(caseRoot, label) {
  const names = fs.readdirSync(caseRoot);
  const artifacts = names.filter((name) => name === '.release-version-transaction.json'
    || name === '.release-version-transaction.json.prev'
    || name.startsWith('.release-version-transaction.json.tmp-')
    || manifestFiles.some((file) => name.startsWith(`${path.basename(file)}.tmp-`) || name.startsWith(`${path.basename(file)}.bak-`)));
  if (artifacts.length) throw new Error(`${label}: transaction artifacts remain: ${artifacts.join(', ')}`);
}

function freshCase() {
  const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-release-calibration-'));
  copyInputs(caseRoot);
  return caseRoot;
}

const expectedRoot = freshCase();
let oldState;
let newState;
try {
  oldState = snapshot(expectedRoot);
  const completed = run(expectedRoot, ['0.7.0']);
  if (completed.status !== 0) throw new Error(`successful release bump failed: ${completed.stderr.trim()}`);
  newState = snapshot(expectedRoot);
  if (newState.some((item, index) => item.mode !== oldState[index].mode || JSON.parse(item.bytes).version !== '0.7.0')) {
    throw new Error('successful bump did not preserve modes and set every manifest to 0.7.0');
  }
  assertNoArtifacts(expectedRoot, 'successful bump');
} finally {
  fs.rmSync(expectedRoot, { recursive: true, force: true });
}

for (const boundary of abortBoundaries) {
  const caseRoot = freshCase();
  try {
    const environment = { RUST_INTEL_RELEASE_ABORT_AT: boundary };
    if (boundary.startsWith('before-rollback-') || boundary.startsWith('after-rollback-')) {
      environment.RUST_INTEL_RELEASE_FAIL_AFTER = '3';
    }
    const interrupted = run(caseRoot, ['0.7.0'], environment);
    if (interrupted.status === 0) throw new Error(`${boundary}: abrupt child exit unexpectedly succeeded`);
    const recovered = run(caseRoot, ['--recover']);
    if (recovered.status !== 0) throw new Error(`${boundary}: recovery failed: ${recovered.stderr.trim()}`);
    assertOldOrNew(snapshot(caseRoot), oldState, newState, boundary);
    assertNoArtifacts(caseRoot, boundary);
  } finally {
    fs.rmSync(caseRoot, { recursive: true, force: true });
  }
}

for (const replacements of [1, 2, 3]) {
  const caseRoot = freshCase();
  try {
    const failed = run(caseRoot, ['0.7.0'], { RUST_INTEL_RELEASE_FAIL_AFTER: String(replacements) });
    if (failed.status === 0) throw new Error(`failure-after-${replacements} unexpectedly succeeded`);
    const recovered = run(caseRoot, ['--recover']);
    if (recovered.status !== 0) throw new Error(`failure-after-${replacements}: recovery failed`);
    assertEqualSnapshot(snapshot(caseRoot), oldState, `failure-after-${replacements}`);
    assertNoArtifacts(caseRoot, `failure-after-${replacements}`);
  } finally {
    fs.rmSync(caseRoot, { recursive: true, force: true });
  }
}

console.log(`release-version durability calibration passed (${abortBoundaries.length} abrupt boundaries; failure-after 1, 2, and 3; old-or-new manifests, modes, and cleanup verified).`);
