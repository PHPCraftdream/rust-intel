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

function syncDirectory(directory) {
  // Directory fsync is the POSIX durability barrier for rename-based transactions.  Windows does
  // not expose an equivalent through Node; the journal is still flushed before each state change.
  if (process.platform === 'win32') return;
  let fd;
  try {
    fd = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } catch (error) {
    // Some filesystems (and a few test doubles) reject opening directories.  The file journal is
    // still useful for restart recovery, so do not turn an otherwise safe install into a failure.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function durableWrite(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
  syncDirectory(path.dirname(file));
}

function readJournal(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pathExists(value) {
  return exists(value);
}

function recoverTransaction(transaction) {
  const journalFile = path.join(transaction, 'journal.json');
  if (!pathExists(journalFile)) {
    throw new Error(`unfinished installer transaction has no journal; recover manually from ${transaction}`);
  }
  const journal = readJournal(journalFile);
  if (journal.phase === 'committed') {
    remove(transaction);
    return;
  }
  const unresolved = [];
  const removeIfInstalled = (record) => {
    if (!['installed', 'installing'].includes(record.status) || !pathExists(record.destination)) return;
    try { remove(record.destination); } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
  };
  for (const record of journal.records || []) {
    const backupPresent = pathExists(record.backup);
    if (backupPresent) {
      // Only a recorded replacement may be removed.  A destination recreated while the process
      // was down is an unbacked live path and is deliberately preserved for manual recovery.
      removeIfInstalled(record);
      if (!pathExists(record.destination)) {
        try {
          mkdirParent(record.destination);
          fs.renameSync(record.backup, record.destination);
        } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
      } else if (pathExists(record.backup)) {
        unresolved.push(`${record.destination}: destination and backup both exist`);
      }
    } else if (record.status === 'installed' && !record.originalPresent) {
      removeIfInstalled(record);
    } else if (record.status === 'backing-up') {
      // The rename may not have happened yet.  Never guess by deleting the destination.
      unresolved.push(`${record.destination}: backup state is incomplete`);
    }
  }
  if (unresolved.length) {
    throw new Error(`unfinished installer transaction requires recovery: ${transaction}\n${unresolved.join('\n')}`);
  }
  remove(transaction);
}

function recoverTransactions(transactionParent) {
  for (const entry of fs.readdirSync(transactionParent, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.rust-intel-tx-')) {
      recoverTransaction(path.join(transactionParent, entry.name));
    }
  }
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
  recoverTransactions(transactionParent);
  const transaction = fs.mkdtempSync(path.join(transactionParent, '.rust-intel-tx-'));
  const backupRoot = path.join(transaction, 'backup');
  const journal = {
    version: 1, phase: 'prepared', records: [],
  };
  const journalFile = path.join(transaction, 'journal.json');
  durableWrite(journalFile, journal);
  let replacementCount = 0;
  const limit = failAfter();
  const allOwned = [...removals, ...replacements.map((entry) => entry.destination)];
  const uniqueOwned = [...new Set(allOwned)];
  for (const destination of uniqueOwned) {
    journal.records.push({
      destination,
      backup: path.join(backupRoot, String(journal.records.length)),
      status: 'pending',
      originalPresent: exists(destination),
    });
  }
  durableWrite(journalFile, journal);

  try {
    fs.mkdirSync(backupRoot);
    prepare(path.join(transaction, 'stage'));

    for (const record of journal.records) {
      if (!record.originalPresent) continue;
      record.status = 'backing-up';
      durableWrite(journalFile, journal);
      fs.renameSync(record.destination, record.backup);
      record.status = 'backed-up';
      durableWrite(journalFile, journal);
    }

    for (const { destination, staged } of replacements) {
      if (!exists(staged)) throw new Error(`staged output is missing: ${staged}`);
      mkdirParent(destination);
      const record = journal.records.find((entry) => entry.destination === destination);
      record.status = 'installing';
      durableWrite(journalFile, journal);
      fs.renameSync(staged, destination);
      record.status = 'installed';
      durableWrite(journalFile, journal);
      replacementCount += 1;
      if (limit !== null && replacementCount === limit) {
        throw new Error(`injected installer failure after replacement ${replacementCount}`);
      }
    }

    journal.phase = 'committed';
    durableWrite(journalFile, journal);
    remove(transaction);
  } catch (error) {
    const failures = [];
    // Remove only destinations whose replacement was durably recorded.  Unrelated siblings and
    // paths whose backup never completed are never enumerated or deleted.
    for (const record of journal.records.slice().reverse()) {
      if (record.status === 'installed' && exists(record.destination)) {
        try { remove(record.destination); } catch (rollbackError) { failures.push(`${record.destination}: ${rollbackError.message}`); }
      }
      if (exists(record.backup) && !exists(record.destination)) {
        try { mkdirParent(record.destination); fs.renameSync(record.backup, record.destination); }
        catch (rollbackError) { failures.push(`${record.destination}: ${rollbackError.message}`); }
      }
    }
    if (failures.length) {
      journal.phase = 'rollback-failed';
      journal.rollbackFailures = failures;
      durableWrite(journalFile, journal);
      throw new Error(`${error.message}; rollback incomplete; recover from ${transaction}\n${failures.join('\n')}`);
    }
    journal.phase = 'rolled-back';
    durableWrite(journalFile, journal);
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
