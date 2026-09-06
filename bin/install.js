#!/usr/bin/env node
// rust-intel installer for npx — mirrors rust-cc-install.sh / .ps1.
// Zero dependencies; Node >= 24.0.0.
//
//   npx rust-intel-cc            install into ./.claude   (project-local)
//   npx rust-intel-cc --user     install into ~/.claude   (global; honors CLAUDE_CONFIG_DIR)
//   npx rust-intel-cc --uninstall [--user]
//   npx rust-intel-cc --help
//
// Prefer the native Claude Code plugin instead when possible:
//   /plugin marketplace add PHPCraftdream/rust-intel
//   /plugin install rust-intel@rust-intel

'use strict';

const { assertSupportedNodeVersion } = require('./node-version.js');
assertSupportedNodeVersion();

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  atomicInstall,
  prepareSkillStage,
  claudeOwnedPaths,
} = require('./install-transaction.js');

const PKG_ROOT = path.resolve(__dirname, '..');
const SKILL_SRC = path.join(PKG_ROOT, 'skill');
const COMMANDS_SRC = path.join(PKG_ROOT, 'commands', 'rust-intel-cc');
const COMMANDS = ['audit', 'fix', 'plan']; // -> rust-cc-<name>.md (flattened, same as the shell installers)

function usage() {
  console.log(`rust-intel installer

Usage:
  npx rust-intel-cc              install into ./.claude (project-local)
  npx rust-intel-cc --user       install into ~/.claude (global; honors CLAUDE_CONFIG_DIR)
  npx rust-intel-cc --uninstall  remove a project-local install (add --user for global)
  npx rust-intel-cc --help       this text

Installs:
  <target>/skills/rust-intel/           the skill (SKILL.md + theme modules + audit workflow)
  <target>/commands/rust-cc-audit.md    /rust-cc-audit
  <target>/commands/rust-cc-fix.md      /rust-cc-fix
  <target>/commands/rust-cc-plan.md     /rust-cc-plan

Tip: the native Claude Code plugin is the recommended install (auto-updates):
  /plugin marketplace add PHPCraftdream/rust-intel
  /plugin install rust-intel@rust-intel`);
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function targetDir(user) {
  if (user) return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(process.cwd(), '.claude');
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

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return usage();
  const user = args.includes('--user');
  const uninstall = args.includes('--uninstall');
  const unknown = args.filter((a) => !['--user', '--uninstall'].includes(a));
  if (unknown.length) fail(`unknown argument(s): ${unknown.join(' ')} (see --help)`);

  const target = targetDir(user);
  const skillDst = path.join(target, 'skills', 'rust-intel');
  const commandsDst = path.join(target, 'commands');
  const ownedPaths = claudeOwnedPaths(skillDst, commandsDst, COMMANDS);
  const commandSources = COMMANDS.map((c) => path.join(COMMANDS_SRC, `${c}.md`));
  const commandStageNames = COMMANDS.map((c) => path.join('commands', `rust-cc-${c}.md`));

  if (uninstall) {
    console.log(`Uninstalling rust-intel from ${target} ...`);
    atomicInstall({
      transactionParent: path.dirname(target),
      replacements: [],
      removals: ownedPaths,
      prepare: () => {},
    });
    console.log('Done.');
    return;
  }

  if (!fs.existsSync(SKILL_SRC) || !fs.existsSync(path.join(SKILL_SRC, 'SKILL.md'))) {
    fail(`package is missing skill/SKILL.md (looked in ${SKILL_SRC})`);
  }
  if (!fs.existsSync(COMMANDS_SRC)) {
    fail(`package is missing commands/rust-intel-cc/ (looked in ${COMMANDS_SRC})`);
  }

  assertNoOverlap(SKILL_SRC, skillDst);
  assertNoOverlap(COMMANDS_SRC, commandsDst);

  console.log(`Installing rust-intel into ${target} ...`);

  const replacements = [
    { destination: skillDst, staged: path.join(target, '.rust-intel-stage', 'skill') },
    ...COMMANDS.map((c, index) => ({
      destination: path.join(commandsDst, `rust-cc-${c}.md`),
      staged: path.join(target, '.rust-intel-stage', commandStageNames[index]),
    })),
  ];
  // The transaction owns the temporary stage and never deletes an unrelated sibling.  Source
  // inventory and all command inputs are checked before any old path is moved aside.
  atomicInstall({
    transactionParent: path.dirname(target),
    replacements,
    removals: ownedPaths.filter((destination) => destination !== skillDst && !COMMANDS.some((name) => destination === path.join(commandsDst, `rust-cc-${name}.md`))),
    prepare: (stageRoot) => {
      prepareSkillStage(SKILL_SRC, path.join(stageRoot, 'skill'), commandSources, commandStageNames, stageRoot);
      replacements[0].staged = path.join(stageRoot, 'skill');
      for (let index = 0; index < commandStageNames.length; index += 1) {
        replacements[index + 1].staged = path.join(stageRoot, commandStageNames[index]);
      }
    },
  });

  console.log(`
Done. Verify by starting 'claude' ${user ? 'anywhere' : 'in this directory'} and trying:
  /rust-cc-audit
  /rust-cc-fix  <error message>
  /rust-cc-plan <task description>

The skill 'rust-intel' will activate automatically on any Rust task.`);
}

main();
