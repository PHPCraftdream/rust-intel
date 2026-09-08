#!/usr/bin/env node
// Focused child-process probes for the validator fixture's resource-heavy lexer controls.
// Each invocation runs one deterministic control and exits, returning V8's native parser zones
// and temporary source/mask allocations to the operating system before the next control starts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { literalTrueCompletionDiagnostics, literalTrueCompletionViolations } from './js-lexer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSource = fs.readFileSync(path.join(root, 'dev', 'validate-fixtures.mjs'), 'utf8');
const rawControlId = process.argv[2] || '';
const canonicalControlId = /^(?:0|[1-9]\d*)$/u.test(rawControlId) ? Number(rawControlId) : NaN;
const controlId = Number.isSafeInteger(canonicalControlId) ? canonicalControlId : NaN;
const rawProbeInputLength = process.argv[3] || '';
const probeInputLength = /^(?:0|[1-9]\d*)$/u.test(rawProbeInputLength) ? Number(rawProbeInputLength) : NaN;
const supportedControls = new Set([399, 400, 401, 402, 409, 410, 411, 412, 413, 414, 421, 429, 439, 445, 446, 473, 474, 475, 476, 477, 478, 493]);

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
      return { ok: false, observation: { kind: 'unexpected-success' } };
    } catch (error) {
      const observation = { kind: 'error', name: error?.name || 'Error', message: error?.message || String(error) };
      return { ok: observation.message === 'JavaScript lexical nesting exceeded its deterministic budget', observation };
    }
  }
  if (id === 400) {
    try {
      literalTrueCompletionDiagnostics('('.repeat(50_000) + ']'.repeat(50_000));
      return { ok: false, observation: { kind: 'unexpected-success' } };
    } catch (error) {
      const observation = { kind: 'error', name: error?.name || 'Error', message: error?.message || String(error) };
      return { ok: observation.message === 'JavaScript lexical delimiter mismatch', observation };
    }
  }
  if (id === 401 || id === 402) {
    // The parent mutates dev/js-lexer.mjs in a temp-tree copy of this script's directory and
    // judges the observation; nothing here self-reports success, samples telemetry, or reads a
    // marker id from argv. The ';' separator is load-bearing (a completion call directly after
    // an ordinary word token is suppressed as non-canonical). Control 401's filler keeps its
    // input at exactly 2,000,000 code units — the scanner's exact operation budget; the 402
    // branch takes its length from argv because the fixture parent draws it at run time
    // (round-49 P2-1: the length is transport, not a constant of the probe).
    const marker = ';completeCurrentControlScope(902, true)';
    const length = id === 401 ? 2_000_000 : probeInputLength;
    const input = 'x'.repeat(length - marker.length) + marker;
    return { observation: observe(() => literalTrueCompletionDiagnostics(input), input.length) };
  }
  if (id === 493) {
    // Masking-liveness input: the decoy completion call sits inside a block comment on a
    // 1,000,000-unit input. A scanner that stops genuinely masking block comments makes the
    // decoy live code (the parent's negative control 494 detects exactly that differential).
    const marker = ';completeCurrentControlScope(902, true)';
    const decoy = '/*;completeCurrentControlScope(777, true)*/';
    const fillerLength = 400_000;
    const length = 1_000_000;
    const input = 'x'.repeat(fillerLength) + marker
      + 'x'.repeat(length - fillerLength - marker.length - decoy.length) + decoy;
    return { observation: observe(() => literalTrueCompletionDiagnostics(input), input.length) };
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
    473: 'const fieldMutation473 = class { value = function () {} / completeCurrentControlScope(number, true) / 2; };',
    474: 'const fieldMutation474 = class { static value = function () {} / completeCurrentControlScope(number, true) / 2; };',
    475: 'const fieldMutation475 = class { #value = function () {} / completeCurrentControlScope(number, true) / 2; };',
    476: 'const fieldMutation476 = class { ["value"] = function () {} / completeCurrentControlScope(number, true) / 2; };',
    477: 'const fieldMutation477 = class { "value" = function () {} / completeCurrentControlScope(number, true) / 2; };',
    478: 'const fieldMutation478 = class { 1 = function () {} / completeCurrentControlScope(number, true) / 2; };',
  };
  const mutated = completionMutation(replacements[id]);
  if (mutated === null) return { ok: false, observation: { kind: 'mutation-not-applied' } };
  const violations = literalTrueCompletionViolations(mutated);
  const observation = { kind: 'completion-violations', ids: violations };
  return { ok: observation.ids.length === 1 && observation.ids[0] === null, observation };
}

// Reports exactly what happened when the real scanner ran: the returned diagnostics, or the
// thrown error. No predicate lives here — the child's own verdict would be vacuous evidence;
// the parent compares this observation against the expectation derived from each control's
// tree mutation.
function observe(run, inputLength) {
  try {
    const diagnostics = run();
    return {
      kind: 'diagnostics',
      inputLength,
      ids: diagnostics.map(({ id }) => id),
      indexes: diagnostics.map(({ index }) => index),
    };
  } catch (error) {
    return { kind: 'error', name: error?.name || 'Error', message: error?.message || String(error) };
  }
}

if (!supportedControls.has(controlId)) {
  console.error(`ERROR: unsupported lexer probe control ${rawControlId || '<missing>'}`);
  process.exit(2);
}

if (controlId === 402 && !Number.isSafeInteger(probeInputLength)) {
  console.error('ERROR: lexer probe control 402 requires a canonical integer input length argument');
  process.exit(2);
}

let result;
try {
  result = checkControl(controlId);
} catch (error) {
  console.error(`ERROR: lexer probe ${controlId} threw ${error?.name || 'Error'}: ${error?.message || error}`);
  process.exit(1);
}

console.log(JSON.stringify({ controlId, observation: result.observation }));
if (result.ok === false) {
  console.error(`ERROR: lexer probe ${controlId} did not match its deterministic oracle`);
  process.exit(1);
}
