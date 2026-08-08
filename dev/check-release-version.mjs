#!/usr/bin/env node
// Verify (never rewrite) that a release tag's version matches every committed manifest.
//
// A git tag is immutable and points at a specific tree; a CI step that edits manifests in the
// runner's checkout AFTER the tag exists changes only the npm tarball, not the tagged tree — the
// tag itself still shows whatever version was last committed. This script instead FAILS the
// release when the tag and the committed manifests disagree, so the fix is always "bump the
// manifests, commit, then tag" — never a divergence between the tag and what got published.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidSemver } from './semver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tagVersion = process.argv[2];
if (!tagVersion) {
  console.error('usage: node dev/check-release-version.mjs <semver-from-tag>');
  process.exit(1);
}
if (!isValidSemver(tagVersion)) {
  console.error(`ERROR: tag version "${tagVersion}" is not valid SemVer`);
  process.exit(1);
}

const manifests = ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];
const errors = [];
for (const relative of manifests) {
  const file = path.join(root, relative);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json.version !== tagVersion) errors.push(`${relative} has version "${json.version}", tag says "${tagVersion}"`);
}

if (errors.length) {
  console.error(['ERROR: tag/manifest version mismatch — commit the version bump before tagging:', ...errors.map((e) => `  ${e}`)].join('\n'));
  process.exit(1);
}
console.log(`Tag version ${tagVersion} matches all committed manifests`);
