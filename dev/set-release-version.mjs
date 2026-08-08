#!/usr/bin/env node
// Keep all published manifests on the tag's version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node dev/set-release-version.mjs <semver>');
  process.exit(1);
}

for (const relative of ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const file = path.join(root, relative);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.version = version;
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`Set package, Claude, and Codex manifests to ${version}`);
