'use strict';

// Keep the executable and development entry points on one semantic runtime contract.
const MIN_NODE_VERSION = '24.0.0';

function isSupportedNodeVersion(version) {
  if (typeof version !== 'string') return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  if (major !== 24) return major > 24;
  // A prerelease of 24.0.0 sorts before the required stable floor.
  if (minor === 0 && patch === 0 && match[4] !== undefined) return false;
  return true;
}

function assertSupportedNodeVersion(version = process.versions.node) {
  if (isSupportedNodeVersion(version)) return;
  const message = `rust-intel requires Node.js >=${MIN_NODE_VERSION}; detected ${version || 'unknown'}`;
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

module.exports = { MIN_NODE_VERSION, isSupportedNodeVersion, assertSupportedNodeVersion };
