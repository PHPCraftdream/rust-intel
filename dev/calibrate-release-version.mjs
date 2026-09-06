#!/usr/bin/env node
// Bounded regression calibration for dev/set-release-version.mjs.
// The real repository is never modified: the release utility is run against a temporary copy
// containing a known-good manifest set, once with an injected mid-transaction failure and once
// successfully. This is intentionally separate from the long fixture suite so release tooling
// can be checked quickly and deterministically.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFiles = ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];
const copiedFiles = [...manifestFiles, 'dev/set-release-version.mjs', 'dev/semver.mjs'];
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-release-calibration-'));

function copyInputs() {
  for (const relative of copiedFiles) {
    const destination = path.join(temporaryRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
}

function snapshots() {
  return manifestFiles.map((relative) => fs.readFileSync(path.join(temporaryRoot, relative)));
}

function run(version, env = {}) {
  return spawnSync(process.execPath, [path.join(temporaryRoot, 'dev', 'set-release-version.mjs'), version], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

try {
  copyInputs();
  const before = snapshots();
  const injected = run('0.7.0', { RUST_INTEL_RELEASE_FAIL_AFTER: '2' });
  if (injected.status === 0) throw new Error('injected mid-transaction failure unexpectedly succeeded');
  const afterFailure = snapshots();
  if (before.some((content, index) => !content.equals(afterFailure[index]))) {
    throw new Error('injected failure did not restore every known-good manifest byte-for-byte');
  }
  const completed = run('0.7.0');
  if (completed.status !== 0) throw new Error(`successful release bump failed: ${completed.stderr.trim()}`);
  const versions = manifestFiles.map((relative) => JSON.parse(fs.readFileSync(path.join(temporaryRoot, relative), 'utf8')).version);
  if (versions.some((value) => value !== '0.7.0')) throw new Error(`successful bump produced inconsistent versions: ${versions.join(', ')}`);
  console.log(`release-version transaction calibration passed (injected status ${injected.status}; ${versions.length} manifests committed).`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
