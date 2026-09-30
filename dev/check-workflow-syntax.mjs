#!/usr/bin/env node
// Syntax-check Workflow scripts the way the Workflow runtime loads them.
//
// A workflow script is neither a CommonJS nor an ES module: it starts with
// `export const meta = {...}` and its body runs inside an async function, so top-level
// `await` and `return` are legal. `node --check` therefore depends on Node's module-type
// detection: Node 24.12 accepted such a file, Node 24.21 rejects it. Compile the body the
// way the runtime does instead — `meta` as a plain declaration, wrapped in an async
// function — without executing it.
//
// Usage: node dev/check-workflow-syntax.mjs <script.workflow.js>...

import fs from 'node:fs';
import vm from 'node:vm';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node dev/check-workflow-syntax.mjs <script.workflow.js>...');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/^export const meta\b/mu.test(source)) {
    console.error(`${file}: missing top-level \`export const meta\``);
    failed = true;
    continue;
  }
  // Any other top-level `export` stays in the body and fails to compile inside the wrapper.
  const body = source.replace(/^export const meta\b/mu, 'const meta');
  try {
    // The wrapper's opening line shifts the body down by one; lineOffset keeps reported
    // line numbers aligned with the file.
    new vm.Script(`(async function () {\n${body}\n})`, { filename: file, lineOffset: -1 });
  } catch (error) {
    console.error(`${file}: ${error.stack?.split('\n').slice(0, 5).join('\n') ?? error}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`workflow syntax ok (${files.length} file${files.length === 1 ? '' : 's'})`);
