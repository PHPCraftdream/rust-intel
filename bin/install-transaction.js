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

// Test-only crash calibration.  A child exits without running rollback, then the next invocation
// must recover from the durable journal.  Keeping this behind an environment variable leaves the
// normal installer path free of timing-sensitive fault injection.
function abruptAbort(boundary) {
  const log = process.env.RUST_INTEL_INSTALL_ABORT_LOG;
  if (log) fs.appendFileSync(log, `${boundary}\n`, 'utf8');
  if (process.env.RUST_INTEL_INSTALL_ABORT_AT === boundary) process.exit(86);
}

function mkdirParent(value) {
  fs.mkdirSync(path.dirname(value), { recursive: true });
}

// Directories that do not exist yet on the way to `destination`, deepest first. The transaction
// journals them before creating anything so a restart can always find and remove exactly the
// containers it created.
function missingAncestorDirectories(destination) {
  const missing = [];
  let current = path.dirname(path.resolve(destination));
  while (!exists(current)) {
    missing.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return missing;
}

// rmdir only: a container that is no longer empty (or already gone) is left untouched, so
// content created by anyone else can never be deleted through this path.
function removeCreatedDirectories(entries) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    try { fs.rmdirSync(entry); } catch (error) { /* empty-dir cleanup is best effort */ }
  }
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

const JOURNAL_PHASES = new Set(['prepared', 'active', 'committed', 'rolled-back', 'rollback-failed']);
const RECORD_STATUSES = new Set(['pending', 'backing-up', 'backed-up', 'installing', 'installed', 'restoring', 'restored']);

// RUST_INTEL_ABORT_BOUNDARIES: before-journal,after-journal,before-backup-{index},after-backup-journal-{index},after-backup-rename-{index},before-replacement-{index},after-replacement-journal-{index},after-replacement-rename-{index},before-restore-{index},after-restore-rename-{index},after-restore-status-{index},before-rollback-{index},after-rollback-{index},before-commit,after-commit,before-cleanup,after-cleanup

function validateJournal(journal, transaction, owned) {
  if (!journal || journal.version !== 1 || !JOURNAL_PHASES.has(journal.phase)) {
    throw new Error(`invalid installer transaction journal: ${transaction}`);
  }
  if (!Array.isArray(journal.records) || journal.records.length !== owned.length) {
    throw new Error(`installer transaction journal record count does not match owned inventory: ${transaction}`);
  }
  const backupRoot = path.resolve(transaction, 'backup');
  const seen = new Set();
  journal.records.forEach((record, index) => {
    if (!record || typeof record.destination !== 'string' || typeof record.backup !== 'string' ||
        !RECORD_STATUSES.has(record.status) || typeof record.originalPresent !== 'boolean') {
      throw new Error(`invalid installer transaction record ${index}: ${transaction}`);
    }
    // Records are positional on purpose: this prevents a sparse inventory from binding a backup
    // to a different destination during restart recovery.
    if (record.destination !== owned[index] || seen.has(record.destination)) {
      throw new Error(`installer transaction owned inventory mismatch at record ${index}: ${transaction}`);
    }
    seen.add(record.destination);
    const expectedBackup = path.resolve(backupRoot, String(index));
    const backup = path.resolve(record.backup);
    if (backup !== expectedBackup || (backup !== backupRoot && !backup.startsWith(`${backupRoot}${path.sep}`))) {
      throw new Error(`installer transaction backup is outside its backup root at record ${index}: ${transaction}`);
    }
  });
  if (journal.createdDirectories !== undefined && (!Array.isArray(journal.createdDirectories) || journal.createdDirectories.some((entry) => typeof entry !== 'string'))) {
    throw new Error(`invalid installer transaction createdDirectories: ${transaction}`);
  }
  return journal;
}

function pathExists(value) {
  return exists(value);
}

function recoverTransaction(transaction, owned) {
  const journalFile = path.join(transaction, 'journal.json');
  if (!pathExists(journalFile)) {
    // The journal is published before staging and before any live path is moved.  A transaction
    // without one is therefore provably pre-live and its stage can be discarded safely.
    remove(transaction);
    return;
  }
  let journal;
  try {
    journal = validateJournal(readJournal(journalFile), transaction, owned);
  } catch (error) {
    throw new Error(`${error.message}; recover manually from ${transaction}`);
  }
  if (journal.phase === 'committed' || journal.phase === 'rolled-back') {
    remove(transaction);
    return;
  }
  const unresolved = [];
  function restoreRecord(record, index) {
    const backupPresent = pathExists(record.backup);
    const destinationPresent = pathExists(record.destination);
    if (record.status === 'restoring' && !backupPresent && destinationPresent) {
      // The rename completed but the status write did not.  `restoring` is published only while
      // the destination is absent, so destination-present/backup-absent is an unambiguous commit.
      record.status = 'restored';
      durableWrite(journalFile, journal);
      abruptAbort(`after-restore-status-${index}`);
      return true;
    }
    if (record.status === 'restored') return destinationPresent && !backupPresent;
    if (!backupPresent || destinationPresent) return false;
    record.status = 'restoring';
    durableWrite(journalFile, journal);
    abruptAbort(`before-restore-${index}`);
    mkdirParent(record.destination);
    fs.renameSync(record.backup, record.destination);
    abruptAbort(`after-restore-rename-${index}`);
    record.status = 'restored';
    durableWrite(journalFile, journal);
    abruptAbort(`after-restore-status-${index}`);
    return true;
  }
  for (const record of journal.records || []) {
    const index = journal.records.indexOf(record);
    const backupPresent = pathExists(record.backup);
    const destinationPresent = pathExists(record.destination);
    if (record.status === 'backing-up' && !backupPresent && destinationPresent) {
      // The journal was written before rename.  Destination-present/backup-absent proves that
      // the rename did not happen; leave the live path untouched and continue recovery.
      continue;
    }
    if (backupPresent) {
      if (record.status === 'installed' && destinationPresent) {
        try { remove(record.destination); } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
      } else if (record.status === 'installing' && destinationPresent) {
        // The old path was moved to backup before replacement installation began. Thus a
        // destination at this boundary is the replacement after its rename; remove it and
        // restore the old snapshot below.
        try { remove(record.destination); } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
      }
      if (pathExists(record.backup)) {
        try {
          if (!restoreRecord(record, index)) unresolved.push(`${record.destination}: destination and backup both exist`);
        }
        catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
      }
    } else if (record.status === 'installed' && !record.originalPresent && destinationPresent) {
      // The journal says this destination was installed by this transaction and had no backup.
      try { remove(record.destination); } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
    } else if (record.status === 'installing' && destinationPresent && !record.originalPresent) {
      // Fresh install: there is no old snapshot, so a destination at this boundary is the new
      // replacement and can be removed to restore the pre-transaction state.
      try { remove(record.destination); } catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
    } else if (record.status === 'restoring' && destinationPresent) {
      try { restoreRecord(record, index); }
      catch (error) { unresolved.push(`${record.destination}: ${error.message}`); }
      if (record.status !== 'restored') unresolved.push(`${record.destination}: restore state is incomplete`);
    } else if (record.status === 'restored') {
      if (!destinationPresent || backupPresent) unresolved.push(`${record.destination}: restored state is incomplete`);
    } else if (record.status === 'installing' && destinationPresent) {
      unresolved.push(`${record.destination}: unbacked destination exists while replacement is installing`);
    } else if (record.status === 'backed-up' || (record.status === 'backing-up' && !destinationPresent)) {
      unresolved.push(`${record.destination}: backup state is incomplete`);
    }
  }
  if (unresolved.length) {
    throw new Error(`unfinished installer transaction requires recovery: ${transaction}\n${unresolved.join('\n')}`);
  }
  removeCreatedDirectories(journal.createdDirectories);
  remove(transaction);
}

function recoverTransactions(transactionParent, owned) {
  for (const entry of fs.readdirSync(transactionParent, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.rust-intel-tx-')) {
      recoverTransaction(path.join(transactionParent, entry.name), owned);
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
  // Keep the journal inventory operation-independent: replacement destinations come first and
  // removals follow in their declared order. Install and uninstall must be able to recover each
  // other's interrupted transaction without rebinding positional records to different paths.
  const allOwned = [...replacements.map((entry) => entry.destination), ...removals];
  const uniqueOwned = [...new Set(allOwned)];
  recoverTransactions(transactionParent, uniqueOwned);
  const transaction = fs.mkdtempSync(path.join(transactionParent, '.rust-intel-tx-'));
  const backupRoot = path.join(transaction, 'backup');
  // Build the complete owned inventory before the first journal publication.  A restart after
  // that publication must always have a structurally valid record set to validate and recover.
  const records = uniqueOwned.map((destination, index) => ({
    destination,
    backup: path.join(backupRoot, String(index)),
    status: 'pending',
    originalPresent: exists(destination),
  }));
  const journal = { version: 1, phase: 'prepared', records };
  const journalFile = path.join(transaction, 'journal.json');
  abruptAbort('before-journal');
  durableWrite(journalFile, journal);
  abruptAbort('after-journal');
  let replacementCount = 0;
  let backupCount = 0;
  const limit = failAfter();

  try {
    fs.mkdirSync(backupRoot);
    prepare(path.join(transaction, 'stage'));

    for (const record of journal.records) {
      if (!record.originalPresent) continue;
      record.status = 'backing-up';
      abruptAbort(`before-backup-${journal.records.indexOf(record)}`);
      durableWrite(journalFile, journal);
      abruptAbort(`after-backup-journal-${journal.records.indexOf(record)}`);
      fs.renameSync(record.destination, record.backup);
      abruptAbort(`after-backup-rename-${journal.records.indexOf(record)}`);
      record.status = 'backed-up';
      durableWrite(journalFile, journal);
      backupCount += 1;
      if (replacements.length === 0 && limit !== null && backupCount === limit) {
        throw new Error(`injected installer failure after backup ${backupCount}`);
      }
    }

    for (const { destination, staged } of replacements) {
      if (!exists(staged)) throw new Error(`staged output is missing: ${staged}`);
      const missingAncestors = missingAncestorDirectories(destination);
      if (missingAncestors.length > 0) {
        journal.createdDirectories = [...(journal.createdDirectories || []), ...missingAncestors];
        durableWrite(journalFile, journal);
      }
      mkdirParent(destination);
      const record = journal.records.find((entry) => entry.destination === destination);
      record.status = 'installing';
      abruptAbort(`before-replacement-${journal.records.indexOf(record)}`);
      durableWrite(journalFile, journal);
      abruptAbort(`after-replacement-journal-${journal.records.indexOf(record)}`);
      fs.renameSync(staged, destination);
      abruptAbort(`after-replacement-rename-${journal.records.indexOf(record)}`);
      record.status = 'installed';
      durableWrite(journalFile, journal);
      replacementCount += 1;
      if (limit !== null && replacementCount === limit) {
        throw new Error(`injected installer failure after replacement ${replacementCount}`);
      }
    }

    journal.phase = 'committed';
    abruptAbort('before-commit');
    durableWrite(journalFile, journal);
    abruptAbort('after-commit');
    abruptAbort('before-cleanup');
    remove(transaction);
    abruptAbort('after-cleanup');
  } catch (error) {
    const failures = [];
    function restoreRecord(record, index) {
      const backupPresentNow = exists(record.backup);
      const destinationPresentNow = exists(record.destination);
      if (record.status === 'restoring' && !backupPresentNow && destinationPresentNow) {
        record.status = 'restored';
        durableWrite(journalFile, journal);
        abruptAbort(`after-restore-status-${index}`);
        return true;
      }
      if (record.status === 'restored') return destinationPresentNow && !backupPresentNow;
      if (!backupPresentNow || destinationPresentNow) return false;
      record.status = 'restoring';
      durableWrite(journalFile, journal);
      abruptAbort(`before-restore-${index}`);
      mkdirParent(record.destination);
      fs.renameSync(record.backup, record.destination);
      abruptAbort(`after-restore-rename-${index}`);
      record.status = 'restored';
      durableWrite(journalFile, journal);
      abruptAbort(`after-restore-status-${index}`);
      return true;
    }
    // Remove only destinations whose replacement was durably recorded.  Unrelated siblings and
    // paths whose backup never completed are never enumerated or deleted.
    for (const record of journal.records.slice().reverse()) {
      const destinationPresent = exists(record.destination);
      const backupPresent = exists(record.backup);
      if (record.status === 'installed' && destinationPresent && (backupPresent || !record.originalPresent)) {
        abruptAbort(`before-rollback-${journal.records.indexOf(record)}`);
        try { remove(record.destination); } catch (rollbackError) { failures.push(`${record.destination}: ${rollbackError.message}`); }
        abruptAbort(`after-rollback-${journal.records.indexOf(record)}`);
      }
      if (exists(record.backup) && !exists(record.destination)) {
        abruptAbort(`before-rollback-${journal.records.indexOf(record)}`);
        try { restoreRecord(record, journal.records.indexOf(record)); }
        catch (rollbackError) { failures.push(`${record.destination}: ${rollbackError.message}`); }
        abruptAbort(`after-rollback-${journal.records.indexOf(record)}`);
      } else if (backupPresent && destinationPresent && record.status !== 'installed') {
        failures.push(`${record.destination}: destination and backup both exist`);
      } else if (record.status === 'backing-up' && !exists(record.backup) && !exists(record.destination)) {
        failures.push(`${record.destination}: destination and backup are both absent`);
      } else if (record.status === 'backed-up' && !backupPresent && !destinationPresent) {
        failures.push(`${record.destination}: destination and backup are both absent`);
      } else if (record.status === 'installing' && destinationPresent && !backupPresent) {
        failures.push(`${record.destination}: unbacked destination exists while replacement is installing`);
      } else if (record.status === 'restoring' && !destinationPresent && !backupPresent) {
        failures.push(`${record.destination}: destination and backup are both absent while restoring`);
      } else if (record.status === 'restored' && (!destinationPresent || backupPresent)) {
        failures.push(`${record.destination}: restored state is incomplete`);
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
    removeCreatedDirectories(journal.createdDirectories);
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
  missingAncestorDirectories, removeCreatedDirectories,
};
