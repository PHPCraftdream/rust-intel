#!/usr/bin/env node
// Run the repository validator and fixture suite in separate Node processes.
// Zero dependencies; run with Node >= 24.0.0.

import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require('../bin/node-version.js').assertSupportedNodeVersion();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phases = [
  {
    name: 'core',
    script: path.join(root, 'dev', 'validate.mjs'),
    env: { RUST_INTEL_SKIP_NESTED_FIXTURES: '1' },
  },
  {
    name: 'fixtures',
    script: path.join(root, 'dev', 'validate-fixtures.mjs'),
    // validate-fixtures.mjs never reads this variable itself (it sets '1' explicitly for the
    // validator children it spawns); '0' only neutralizes an inherited
    // RUST_INTEL_SKIP_NESTED_FIXTURES=1 from the caller's environment.
    env: { RUST_INTEL_SKIP_NESTED_FIXTURES: '0' },
  },
];
// A malformed value hard-errors instead of silently restoring the default: this knob can kill a
// release-gating run when a mistyped timeout quietly replaces the intended one, and the other
// RUST_INTEL_* knobs fail explicitly on malformed input (see positiveIntegerEnv in dev/validate.mjs).
const rawTimeoutMs = process.env.RUST_INTEL_VALIDATE_TIMEOUT_MS;
let timeoutMs = 20 * 60 * 1000;
if (rawTimeoutMs !== undefined) {
  if (!/^[1-9]\d*$/u.test(rawTimeoutMs) || !Number.isSafeInteger(Number(rawTimeoutMs))) {
    console.error(`[validate-all] RUST_INTEL_VALIDATE_TIMEOUT_MS must be a positive integer in milliseconds; got ${JSON.stringify(rawTimeoutMs)}`);
    process.exit(2);
  }
  timeoutMs = Number(rawTimeoutMs);
}

for (const phase of phases) {
  const result = spawnSync(process.execPath, [phase.script, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    env: { ...process.env, ...phase.env },
  });
  const error = result.error;
  const status = Number.isInteger(result.status) ? result.status : null;
  if (error || result.signal || status !== 0) {
    const reason = error ? `${error.code || error.name}: ${error.message}`
      : result.signal ? `signal ${result.signal}`
        : `exit status ${status ?? 'unknown'}`;
    console.error(`[validate-all] phase=${phase.name} failed: ${reason}`);
    process.exit(status !== null && status > 0 && status < 256 ? status : 1);
  }
  console.error(`[validate-all] phase=${phase.name} passed`);
}
