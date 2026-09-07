#!/usr/bin/env node
// Focused child-process probes for the validator fixture's resource-heavy lexer controls.
// Each invocation runs one deterministic control and exits, returning V8's native parser zones
// and temporary source/mask allocations to the operating system before the next control starts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  literalTrueCompletionDiagnostics,
  literalTrueCompletionViolations,
} from './js-lexer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSource = fs.readFileSync(path.join(root, 'dev', 'validate-fixtures.mjs'), 'utf8');
const controlId = Number.parseInt(process.argv[2] || '', 10);
const supportedControls = new Set([399, 400, 401, 402, 409, 410, 411, 412, 413, 414, 421, 429, 439, 445, 446]);

function completionMutation(replacement) {
  const anchor = '// Controls 400-402:';
  const start = fixtureSource.indexOf(anchor);
  const marker = 'completeCurrentControlScope(number, passed);';
  const markerIndex = start < 0 ? -1 : fixtureSource.indexOf(marker, start);
  if (markerIndex < 0) return null;
  return fixtureSource.slice(0, markerIndex)
    + fixtureSource.slice(markerIndex).replace(marker, replacement);
}

function checkControl(id) {
  if (id === 399) {
    try {
      literalTrueCompletionDiagnostics('('.repeat(100_001));
      return false;
    } catch {
      return true;
    }
  }
  if (id === 400) {
    try {
      literalTrueCompletionDiagnostics('('.repeat(50_000) + ']'.repeat(50_000));
      return false;
    } catch (error) {
      return /delimiter mismatch/u.test(error.message);
    }
  }
  if (id === 401) {
    try {
      literalTrueCompletionDiagnostics('x'.repeat(2_000_000));
      return true;
    } catch {
      return false;
    }
  }
  if (id === 402) {
    try {
      literalTrueCompletionDiagnostics('x'.repeat(2_000_001));
      return false;
    } catch (error) {
      return /deterministic budget/u.test(error.message);
    }
  }

  const replacements = {
    409: 'completeCurrentControlScope(number, true);',
    410: '(0, completeCurrentControlScope)(number, true);',
    411: '[completeCurrentControlScope][0](number, true);',
    412: '({ done: completeCurrentControlScope }).done(number, true);',
    413: 'consume(completeCurrentControlScope);',
    414: 'completeCurrentControlScope(number + 0, true);',
    421: 'const expression421 = function () {} / completeCurrentControlScope(number, true) / 2;',
    429: 'const expression429 = class extends mixin({ value: class {} }) {} / completeCurrentControlScope(number, true) / 2;',
    439: 'const expression439 = class extends function() { { value: 1; } } {} / completeCurrentControlScope(number, true) / 2;',
    445: 'const fieldMutation445 = class { function = {} / completeCurrentControlScope(number, true) / 2; };',
    446: 'const fieldMutation446 = class { class = {} / completeCurrentControlScope(number, true) / 2; };',
  };
  const mutated = completionMutation(replacements[id]);
  if (mutated === null) return false;
  const violations = literalTrueCompletionViolations(mutated);
  return violations.length === 1 && violations[0] === null;
}

if (!supportedControls.has(controlId)) {
  console.error(`ERROR: unsupported lexer probe control ${process.argv[2] || '<missing>'}`);
  process.exit(2);
}

let passed = false;
try {
  passed = checkControl(controlId);
} catch (error) {
  console.error(`ERROR: lexer probe ${controlId} threw ${error?.name || 'Error'}: ${error?.message || error}`);
  process.exit(1);
}
if (!passed) {
  console.error(`ERROR: lexer probe ${controlId} did not match its deterministic oracle`);
  process.exit(1);
}
console.log(`lexer probe passed (control ${controlId})`);
