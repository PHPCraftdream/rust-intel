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
    env: { RUST_INTEL_SKIP_NESTED_FIXTURES: '0' },
  },
];
const configuredTimeout = Number(process.env.RUST_INTEL_VALIDATE_TIMEOUT_MS);
const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 20 * 60 * 1000;

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
