#!/usr/bin/env node
// Manual release-bump utility. Run this locally, review the diff, commit it, THEN create the
// tag — the tag must always be created on a commit that already carries the target version.
// CI does not run this: dev/check-release-version.mjs verifies the tag against what got
// committed here; it never rewrites manifests after the fact (a tag is immutable — see
// dev/check-release-version.mjs's header for why post-tag rewriting is the wrong model).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidSemver } from './semver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !isValidSemver(version)) {
  console.error('usage: node dev/set-release-version.mjs <semver>');
  process.exit(1);
}

for (const relative of ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const file = path.join(root, relative);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.version = version;
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`Set package, Claude, and Codex manifests to ${version}. Review the diff, commit it, then tag v${version}.`);
