#!/usr/bin/env node
// Focused child-process probes for the validator fixture's resource-heavy lexer controls.
// Each invocation runs one deterministic control and exits, returning V8's native parser zones
// and temporary source/mask allocations to the operating system before the next control starts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { literalTrueCompletionDiagnostics, literalTrueCompletionViolations } from './js-lexer.mjs';
import { observeLiteralTrueCompletion } from './validate-lexer-observations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSource = fs.readFileSync(path.join(root, 'dev', 'validate-fixtures.mjs'), 'utf8');
const rawControlId = process.argv[2] || '';
const canonicalControlId = /^(?:0|[1-9]\d*)$/u.test(rawControlId) ? Number(rawControlId) : NaN;
const controlId = Number.isSafeInteger(canonicalControlId) ? canonicalControlId : NaN;
const supportedControls = new Set([399, 400, 401, 402, 409, 410, 411, 412, 413, 414, 421, 429, 439, 445, 446, 473, 474, 475, 476, 477, 478]);

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
  if (id === 401) {
    try {
      // The marker makes the observation causally depend on the full-length scan: ids [902] can
      // only come from completing the scan of the marker itself, so neither a constant nor a
      // size-conditional branch in the shared observation module can produce the expected result
      // for free. The ';' separator is load-bearing (a completion call directly after an ordinary
      // word token is suppressed as non-canonical), and the filler keeps the total at exactly
      // 2,000,000 code units, one unit below the deterministic scan budget (control 402).
      const marker = ';completeCurrentControlScope(902, true)';
      const fillerLength = 2_000_000 - marker.length;
      const observation = observeLiteralTrueCompletion('x'.repeat(fillerLength) + marker);
      const companion = observeLiteralTrueCompletion('completeCurrentControlScope(901, true)');
      const combined = { ...observation, companion };
      return {
        ok: observation.inputLength === 2_000_000
          && observation.ids.length === 1
          && observation.ids[0] === 902
          && JSON.stringify(companion) === JSON.stringify({ kind: 'diagnostics', inputLength: 38, ids: [901] }),
        observation: combined,
      };
    } catch (error) {
      return { ok: false, observation: { kind: 'error', name: error?.name || 'Error', message: error?.message || String(error) } };
    }
  }
  if (id === 402) {
    try {
      literalTrueCompletionDiagnostics('x'.repeat(2_000_001));
      return { ok: false, observation: { kind: 'unexpected-success' } };
    } catch (error) {
      const observation = { kind: 'error', name: error?.name || 'Error', message: error?.message || String(error) };
      return { ok: observation.message === 'JavaScript lexical scan exceeded its deterministic budget', observation };
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

if (!supportedControls.has(controlId)) {
  console.error(`ERROR: unsupported lexer probe control ${rawControlId || '<missing>'}`);
  process.exit(2);
}

const initialMemory = process.memoryUsage();
let result;
try {
  result = checkControl(controlId);
} catch (error) {
  console.error(`ERROR: lexer probe ${controlId} threw ${error?.name || 'Error'}: ${error?.message || error}`);
  process.exit(1);
}

// The parent independently validates controlId and observation.  Do not emit a freely chosen
// success sentence: a mutated predicate may still exit zero, but it cannot forge the semantic
// observation expected for the selected control without failing that parent oracle.
function telemetry(initialMemory) {
  const memory = process.memoryUsage();
  const usage = typeof process.resourceUsage === 'function' ? process.resourceUsage() : null;
  const maxRss = Number.isFinite(usage?.maxRSS) ? usage.maxRSS * 1024 : null;
  return {
    source: 'child',
    terminalSample: true,
    heapUsed: memory.heapUsed,
    rss: memory.rss,
    peakHeapUsed: Math.max(initialMemory.heapUsed, memory.heapUsed),
    peakHeapSource: 'terminal-boundary-sample',
    peakRss: maxRss === null ? Math.max(initialMemory.rss, memory.rss) : Math.max(initialMemory.rss, memory.rss, maxRss),
    peakRssSource: maxRss === null ? 'boundary-sample' : 'process.resourceUsage.maxRSS',
  };
}
console.log(JSON.stringify({ controlId, observation: result.observation, telemetry: telemetry(initialMemory) }));
if (!result.ok) {
  console.error(`ERROR: lexer probe ${controlId} did not match its deterministic oracle`);
  process.exit(1);
}
