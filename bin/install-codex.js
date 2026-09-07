#!/usr/bin/env node
// Install the rust-intel skill into Codex's user skill directory.
// Zero dependencies; Node >= 24.0.0.
// Usage: node bin/install-codex.js [--user-dir <path>] [--uninstall] [--help]

'use strict';

const { assertSupportedNodeVersion } = require('./node-version.js');
assertSupportedNodeVersion();

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  atomicInstall,
  prepareSkillStage,
} = require('./install-transaction.js');

const repoRoot = path.resolve(__dirname, '..');
const skillSrc = path.join(repoRoot, 'skill');

function usage() {
  console.log(`Codex installer for rust-intel

Usage:
  node bin/install-codex.js                    install into $CODEX_HOME/skills/rust-intel
  node bin/install-codex.js --user-dir <path>  install into an explicit Codex skills directory
  node bin/install-codex.js --uninstall        remove the installed rust-intel skill
  node bin/install-codex.js --help             show this text

The default target is CODEX_HOME/skills/rust-intel when CODEX_HOME is set,
otherwise ~/.agents/skills/rust-intel. Only *.md and *.js skill files are copied.`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function canonicalCandidate(value) {
  let current = path.resolve(value);
  const tail = [];
  while (!fs.existsSync(current)) {
    tail.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...tail);
}

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertNoOverlap(source, destination) {
  const sourcePath = canonicalCandidate(source);
  const destinationPath = canonicalCandidate(destination);
  if (isWithin(destinationPath, sourcePath) || isWithin(sourcePath, destinationPath)) {
    fail(`destination must not overlap source (source: ${sourcePath}, destination: ${destinationPath})`);
  }
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return usage();
  let explicit;
  let uninstall = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--user-dir') {
      if (explicit !== undefined) fail('--user-dir may be specified only once');
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) fail('--user-dir requires a path');
      explicit = value;
      i += 1;
    } else if (argv[i] === '--uninstall') {
      if (uninstall) fail('--uninstall may be specified only once');
      uninstall = true;
    } else {
      fail(`unknown argument: ${argv[i]} (see --help)`);
    }
  }
  if (!fs.existsSync(path.join(skillSrc, 'SKILL.md'))) fail(`skill/SKILL.md not found at ${skillSrc}`);
  const skillsRoot = explicit || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.agents'), 'skills');
  const destination = path.join(skillsRoot, 'rust-intel');
  assertNoOverlap(skillSrc, destination);
  if (uninstall) {
    atomicInstall({
      // Keep install and uninstall journals beside the same skills root so either operation can
      // recover an interrupted transaction created by the other operation.
      transactionParent: path.dirname(skillsRoot),
      replacements: [],
      removals: [destination],
      prepare: () => {},
    });
    console.log(`Removed ${destination}`);
  } else {
    const replacement = {
      destination,
      staged: path.join(skillsRoot, '.rust-intel-stage', 'rust-intel'),
    };
    atomicInstall({
      transactionParent: path.dirname(skillsRoot),
      replacements: [replacement],
      removals: [],
      prepare: (stageRoot) => {
        prepareSkillStage(skillSrc, path.join(stageRoot, 'rust-intel'), [], []);
        replacement.staged = path.join(stageRoot, 'rust-intel');
      },
    });
    console.log(`Installed rust-intel for Codex at ${destination}`);
    console.log('Start a new Codex thread to load the updated skill.');
  }
}

main(process.argv.slice(2));
