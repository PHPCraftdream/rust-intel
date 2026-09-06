#!/usr/bin/env node
// Emit a deterministic, byte-aware inventory for installer smoke tests.
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || process.argv.length !== 3) {
  console.error('usage: node dev/snapshot-install.mjs <target>');
  process.exit(2);
}

const root = path.resolve(target);
const entries = [];

function visit(current, relative) {
  const stat = fs.lstatSync(current);
  const type = stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other';
  const entry = { path: relative || '.', type };
  if (type === 'file') entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(current)).digest('hex');
  if (type === 'symlink') entry.target = fs.readlinkSync(current);
  entries.push(entry);
  if (type !== 'dir') return;
  for (const child of fs.readdirSync(current).sort()) visit(path.join(current, child), path.join(relative, child));
}

if (fs.existsSync(root)) visit(root, '');
process.stdout.write(`${JSON.stringify(entries)}\n`);
