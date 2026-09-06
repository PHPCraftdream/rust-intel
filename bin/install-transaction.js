'use strict';

// Small, dependency-free transaction primitive shared by the Node installers.  A replacement is
// prepared completely beside the destination, then the old owned paths are moved to a backup
// before the staged paths are moved into place.  A failed replacement restores that backup.

const fs = require('fs');
const path = require('path');

function exists(value) {
  try {
    fs.lstatSync(value);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function remove(value) {
  fs.rmSync(value, { recursive: true, force: true });
}

function failAfter() {
  const raw = process.env.RUST_INTEL_INSTALL_FAIL_AFTER;
  if (raw === undefined || raw === '') return null;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error('RUST_INTEL_INSTALL_FAIL_AFTER must be a positive integer');
  }
  return Number(raw);
}

function mkdirParent(value) {
  fs.mkdirSync(path.dirname(value), { recursive: true });
}

/**
 * Run an install transaction.
 * @param {object} options
 * @param {string} options.transactionParent existing directory beside the target
 * @param {Array<{destination:string, staged:string}>} options.replacements
 * @param {Array<string>} options.removals paths owned by this installer
 * @param {(stageRoot:string)=>void} options.prepare creates and validates all staged outputs
 */
function atomicInstall({ transactionParent, replacements, removals, prepare }) {
  fs.mkdirSync(transactionParent, { recursive: true });
  const transaction = fs.mkdtempSync(path.join(transactionParent, '.rust-intel-tx-'));
  const backupRoot = path.join(transaction, 'backup');
  const records = [];
  const touched = new Set();
  let replacementCount = 0;
  const limit = failAfter();
  const allOwned = [...removals, ...replacements.map((entry) => entry.destination)];

  try {
    fs.mkdirSync(backupRoot);
    prepare(path.join(transaction, 'stage'));

    for (const destination of allOwned) {
      if (!exists(destination)) continue;
      const backup = path.join(backupRoot, String(records.length));
      fs.renameSync(destination, backup);
      records.push({ destination, backup });
    }

    for (const { destination, staged } of replacements) {
      if (!exists(staged)) throw new Error(`staged output is missing: ${staged}`);
      mkdirParent(destination);
      fs.renameSync(staged, destination);
      touched.add(destination);
      replacementCount += 1;
      if (limit !== null && replacementCount === limit) {
        throw new Error(`injected installer failure after replacement ${replacementCount}`);
      }
    }

    remove(transaction);
  } catch (error) {
    // Remove only paths owned by this transaction.  Unrelated siblings are never enumerated here.
    for (const destination of touched) remove(destination);
    for (const record of records.slice().reverse()) {
      if (exists(record.destination)) remove(record.destination);
      mkdirParent(record.destination);
      fs.renameSync(record.backup, record.destination);
    }
    remove(transaction);
    throw error;
  }
}

function collectSkillFiles(source) {
  const result = [];
  function visit(current, relative) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const from = path.join(current, entry.name);
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) visit(from, child);
      else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) {
        result.push({ relative: child, source: from });
      }
    }
  }
  visit(source, '');
  return result.sort((a, b) => a.relative.localeCompare(b.relative));
}

function prepareSkillStage(source, stage, commandSources, commandDestinations, commandStageRoot = stage) {
  const inventory = collectSkillFiles(source);
  if (!inventory.some((entry) => entry.relative === 'SKILL.md')) {
    throw new Error('package is missing skill/SKILL.md');
  }
  for (const sourcePath of commandSources) {
    if (!exists(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`package is missing ${sourcePath}`);
    }
  }
  for (const entry of inventory) {
    const destination = path.join(stage, entry.relative);
    mkdirParent(destination);
    fs.copyFileSync(entry.source, destination);
  }
  const stagedInventory = collectSkillFiles(stage).map((entry) => entry.relative);
  const expectedInventory = inventory.map((entry) => entry.relative);
  if (JSON.stringify(stagedInventory) !== JSON.stringify(expectedInventory)) {
    throw new Error('staged skill inventory does not match the source inventory');
  }
  for (let i = 0; i < commandSources.length; i += 1) {
    const destination = path.join(commandStageRoot, commandDestinations[i]);
    mkdirParent(destination);
    fs.copyFileSync(commandSources[i], destination);
    if (!exists(destination)) throw new Error(`staged command is missing: ${destination}`);
  }
}

function claudeOwnedPaths(skillDestination, commandsDestination, commandNames) {
  return [
    skillDestination,
    ...commandNames.map((name) => path.join(commandsDestination, `rust-cc-${name}.md`)),
    path.join(commandsDestination, 'rust-intel-cc'),
    ...['rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md']
      .map((name) => path.join(commandsDestination, name)),
  ];
}

module.exports = {
  atomicInstall, collectSkillFiles, prepareSkillStage, claudeOwnedPaths, exists, remove,
};
