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

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
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

function copySkillTree(src, dst) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copySkillTree(from, to);
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) {
      fs.copyFileSync(from, to);
      console.log(`  copied     ${to}`);
    }
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

  if (uninstall) {
    console.log(`Uninstalling rust-intel from ${target} ...`);
    rmrf(skillDst);
    for (const c of COMMANDS) rmrf(path.join(commandsDst, `rust-cc-${c}.md`));
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

  // Clean previous install (mirrors the shell installers).
  if (fs.existsSync(skillDst)) {
    console.log(`  cleaning   ${skillDst} (previous install)`);
    rmrf(skillDst);
  }
  fs.mkdirSync(skillDst, { recursive: true });
  fs.mkdirSync(commandsDst, { recursive: true });

  copySkillTree(SKILL_SRC, skillDst);

  for (const c of COMMANDS) {
    const src = path.join(COMMANDS_SRC, `${c}.md`);
    if (!fs.existsSync(src)) fail(`package is missing ${src}`);
    const dst = path.join(commandsDst, `rust-cc-${c}.md`);
    fs.copyFileSync(src, dst);
    console.log(`  copied     ${dst}`);
  }

  console.log(`
Done. Verify by starting 'claude' ${user ? 'anywhere' : 'in this directory'} and trying:
  /rust-cc-audit
  /rust-cc-fix  <error message>
  /rust-cc-plan <task description>

The skill 'rust-intel' will activate automatically on any Rust task.`);
}

main();
