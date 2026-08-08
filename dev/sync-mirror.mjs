#!/usr/bin/env node
// Regenerate the Codex skill mirror: skill/ -> skills/rust-intel/.
//
// `skill/` is the single source of truth. `skills/rust-intel/` exists only because the Codex
// plugin manifest requires a `./skills/<name>/` layout, and it is checked into git so a
// git-based plugin install works without a build step. It is DERIVED — never edit it directly.
// dev/validate.mjs enforces byte-identity; this script is how you satisfy that after editing
// skill/. Run `node dev/sync-mirror.mjs --check` to verify without writing (what CI does via
// validate.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skill');
const mirror = path.join(root, 'skills', 'rust-intel');
const checkOnly = process.argv.includes('--check');

function relativeFiles(dir) {
  const files = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) files.push(path.relative(dir, full));
    }
  }
  walk(dir);
  return files.sort();
}

const sourceFiles = relativeFiles(source);
if (!sourceFiles.length) {
  console.error(`error: no skill files found under ${source}`);
  process.exit(1);
}

const drift = [];
for (const rel of sourceFiles) {
  const from = path.join(source, rel);
  const to = path.join(mirror, rel);
  const expected = fs.readFileSync(from, 'utf8');
  const actual = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
  if (actual === expected) continue;
  drift.push(rel);
  if (checkOnly) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// Files the mirror still carries after a rename or deletion in skill/.
const stale = relativeFiles(mirror).filter((rel) => !sourceFiles.includes(rel));
for (const rel of stale) {
  drift.push(`${rel} (stale)`);
  if (!checkOnly) fs.rmSync(path.join(mirror, rel));
}

if (checkOnly) {
  if (drift.length) {
    console.error(`ERROR: Codex mirror is out of sync (${drift.length}): ${drift.join(', ')}\nRun: node dev/sync-mirror.mjs`);
    process.exit(1);
  }
  console.log(`Codex mirror is in sync (${sourceFiles.length} files)`);
} else {
  console.log(drift.length ? `Synced ${drift.length} file(s) to skills/rust-intel/: ${drift.join(', ')}` : `Codex mirror already in sync (${sourceFiles.length} files)`);
}
