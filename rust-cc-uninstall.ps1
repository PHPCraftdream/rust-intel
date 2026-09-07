# Removes the rust-intel skill and the /rust-cc-* commands.
# Inverse of rust-cc-install.ps1. Sweeps every known historical layout (v0.1.x,
# v0.2.0, v0.2.1+) so this script is safe to run regardless of which version
# was used to install.
#
# Default target: .\.claude\ of the current working directory (project-local).
# Pass -User to remove from the user-global %USERPROFILE%\.claude\ instead.
# CLAUDE_CONFIG_DIR env var (if set) overrides everything.

[CmdletBinding()]
param(
    [switch]$User,
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\rust-cc-uninstall.ps1 [-User]

Default target (no flags): .\.claude\  (the current working directory).
With -User:                %USERPROFILE%\.claude\  (user-global).
If `$env:CLAUDE_CONFIG_DIR is set, it overrides both.

Removes (every known historical layout):
  <target>\skills\rust-intel\                                          (entire directory)
  <target>\commands\rust-cc-{audit,fix,plan}.md                        (v0.2.1+ flat-with-prefix)
  <target>\commands\rust-intel-cc\                                     (v0.2.0 namespace dir)
  <target>\commands\{rust-audit,rust-fix,rust-plan,rust-intel}.md      (legacy v0.1.x flat layout)

Other skills and commands under <target> are not touched.

Options:
  -User       Remove from %USERPROFILE%\.claude\ instead of .\.claude\.
  -Help       Show this message.

Environment:
  CLAUDE_CONFIG_DIR   Override the target. If set, -User is ignored.
"@ | Write-Output
    exit 0
}

$ErrorActionPreference = 'Stop'

function Abrupt-Abort {
    param([string]$Boundary)
    if ($env:RUST_INTEL_INSTALL_ABORT_AT -eq $Boundary) { exit 86 }
}

# RUST_INTEL_ABORT_BOUNDARIES: before-journal,after-journal,before-backup-{index},after-backup-journal-{index},after-backup-rename-{index},before-restore-{index},after-restore-rename-{index},after-restore-status-{index},before-rollback-{index},after-rollback-{index},before-commit,after-commit,before-cleanup,after-cleanup

if ($env:CLAUDE_CONFIG_DIR) {
    $ClaudeDir = $env:CLAUDE_CONFIG_DIR
} elseif ($User) {
    $ClaudeDir = Join-Path $env:USERPROFILE '.claude'
} else {
    $ClaudeDir = Join-Path (Get-Location).Path '.claude'
}

$SkillDir    = Join-Path $ClaudeDir 'skills\rust-intel'
$CommandsDir = Join-Path $ClaudeDir 'commands'
$NsDir       = Join-Path $CommandsDir 'rust-intel-cc'

Write-Output "Uninstalling rust-intel from $ClaudeDir ..."

function Write-TransactionJournal {
    param([string]$Path, [string]$Phase, [object[]]$Records, [string[]]$Failures = @())
    Abrupt-Abort 'before-journal'
    $payload = [ordered]@{ version = 1; phase = $Phase; records = @($Records) }
    if ($Failures.Count -gt 0) { $payload.rollbackFailures = @($Failures) }
    $temporary = "$Path.tmp-$PID"
    $json = $payload | ConvertTo-Json -Depth 8
    $stream = New-Object IO.FileStream($temporary, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($json + "`n")
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    Move-Item -LiteralPath $temporary -Destination $Path -Force
    Abrupt-Abort 'after-journal'
}

function Restore-TransactionRecord {
    param([string]$JournalPath, [object]$Journal, [object]$Record, [int]$Index)
    $backupPresent = Test-Path -LiteralPath $Record.backup
    $destinationPresent = Test-Path -LiteralPath $Record.destination
    if ($Record.status -eq 'restoring' -and -not $backupPresent -and $destinationPresent) {
        $Record.status = 'restored'
        Write-TransactionJournal $JournalPath 'active' @($Journal.records)
        Abrupt-Abort ("after-restore-status-" + $Index)
        return $true
    }
    if ($Record.status -eq 'restored') { return $destinationPresent -and -not $backupPresent }
    if (-not $backupPresent -or $destinationPresent) { return $false }
    $Record.status = 'restoring'
    Write-TransactionJournal $JournalPath 'active' @($Journal.records)
    Abrupt-Abort ("before-restore-" + $Index)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Record.destination) | Out-Null
    Move-Item -LiteralPath $Record.backup -Destination $Record.destination
    Abrupt-Abort ("after-restore-rename-" + $Index)
    $Record.status = 'restored'
    Write-TransactionJournal $JournalPath 'active' @($Journal.records)
    Abrupt-Abort ("after-restore-status-" + $Index)
    return $true
}

function Recover-Transaction {
    param([string]$Transaction, [string[]]$Owned)
    $journalPath = Join-Path $Transaction 'journal.json'
    if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) {
        # No live path is moved before the journal is published; this is provably pre-live.
        Remove-Item -LiteralPath $Transaction -Recurse -Force
        return
    }
    try { $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json } catch { throw "Invalid uninstall transaction journal; recover manually from $Transaction" }
    $phases = @('prepared', 'active', 'committed', 'rolled-back', 'rollback-failed')
    if ($journal.version -ne 1 -or $phases -notcontains [string]$journal.phase) { throw "Invalid uninstall transaction journal; recover manually from $Transaction" }
    $records = @($journal.records)
    if ($records.Count -ne $Owned.Count) { throw "Uninstall transaction journal record count does not match owned inventory: $Transaction" }
    $statuses = @('pending', 'backing-up', 'backed-up', 'installing', 'installed', 'restoring', 'restored')
    $backupRoot = [IO.Path]::GetFullPath((Join-Path $Transaction 'backup'))
    for ($recordIndex = 0; $recordIndex -lt $records.Count; $recordIndex++) {
        $record = $records[$recordIndex]
        if ($null -eq $record -or $statuses -notcontains [string]$record.status -or
            $record.destination -ne $Owned[$recordIndex] -or $null -eq $record.backup -or
            ($record.originalPresent -isnot [bool])) { throw "Invalid uninstall transaction record $recordIndex; recover manually from $Transaction" }
        $expectedBackup = [IO.Path]::GetFullPath((Join-Path $backupRoot ([string]$recordIndex)))
        if ([IO.Path]::GetFullPath([string]$record.backup) -ne $expectedBackup) { throw "Uninstall transaction backup is outside its backup root: $Transaction" }
    }
    if ($journal.phase -eq 'committed' -or $journal.phase -eq 'rolled-back') { Remove-Item -LiteralPath $Transaction -Recurse -Force; return }
    $failures = @()
    foreach ($record in $records) {
        $destination = [string]$record.destination
        $backup = [string]$record.backup
        $backupPresent = Test-Path -LiteralPath $backup
        $destinationPresent = Test-Path -LiteralPath $destination
        if ($record.status -eq 'backing-up' -and -not $backupPresent -and $destinationPresent) { continue }
        if ($record.status -eq 'restoring' -and -not $backupPresent -and $destinationPresent) {
            try { Restore-TransactionRecord $journalPath $journal $record $recordIndex } catch { $failures += "$destination`: $($_.Exception.Message)" }
            continue
        }
        if ($record.status -eq 'restored') {
            if (-not $destinationPresent -or $backupPresent) { $failures += "$destination`: restored state is incomplete" }
            continue
        }
        if ($backupPresent) {
            if (-not $destinationPresent) {
                try { if (-not (Restore-TransactionRecord $journalPath $journal $record $recordIndex)) { throw 'destination and backup both exist' } }
                catch { $failures += "$destination`: $($_.Exception.Message)" }
            } else { $failures += "$destination`: destination and backup both exist" }
        } elseif ($record.status -eq 'backed-up' -or ($record.status -eq 'backing-up' -and -not $destinationPresent)) { $failures += "$destination`: backup state is incomplete" }
    }
    if ($failures.Count -gt 0) { throw "Unfinished uninstall transaction requires recovery: $Transaction`n$($failures -join "`n")" }
    Remove-Item -LiteralPath $Transaction -Recurse -Force
}

$owned = @($SkillDir,
    (Join-Path $CommandsDir 'rust-cc-audit.md'), (Join-Path $CommandsDir 'rust-cc-fix.md'), (Join-Path $CommandsDir 'rust-cc-plan.md'),
    $NsDir,
    (Join-Path $CommandsDir 'rust-audit.md'), (Join-Path $CommandsDir 'rust-fix.md'),
    (Join-Path $CommandsDir 'rust-plan.md'), (Join-Path $CommandsDir 'rust-intel.md'))
$txParent = Split-Path -Parent $ClaudeDir
New-Item -ItemType Directory -Force -Path $txParent | Out-Null
foreach ($pending in @(Get-ChildItem -LiteralPath $txParent -Directory -Filter '.rust-intel-ps-uninstall-*' -ErrorAction SilentlyContinue)) { Recover-Transaction $pending.FullName $owned }
$txDir = Join-Path $txParent ('.rust-intel-ps-uninstall-' + [IO.Path]::GetRandomFileName())
$backupRoot = Join-Path $txDir 'backup'
New-Item -ItemType Directory -Force -Path $txDir | Out-Null
$records = @()
foreach ($destination in $owned | Select-Object -Unique) {
    $records += [pscustomobject]@{ destination = $destination; backup = Join-Path $backupRoot ([string]$records.Count); status = 'pending'; originalPresent = [bool](Test-Path -LiteralPath $destination) }
}
$journalPath = Join-Path $txDir 'journal.json'
Write-TransactionJournal $journalPath 'prepared' $records
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
try {
    $backupCount = 0
    foreach ($record in $records) {
        if (-not $record.originalPresent) { continue }
        $record.status = 'backing-up'; Abrupt-Abort ("before-backup-" + [Array]::IndexOf($records, $record)); Write-TransactionJournal $journalPath 'active' $records
        Abrupt-Abort ("after-backup-journal-" + [Array]::IndexOf($records, $record))
        Move-Item -LiteralPath $record.destination -Destination $record.backup
        Abrupt-Abort ("after-backup-rename-" + [Array]::IndexOf($records, $record))
        $record.status = 'backed-up'; Write-TransactionJournal $journalPath 'active' $records
        $backupCount++
        if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $backupCount -eq [int]$env:RUST_INTEL_INSTALL_FAIL_AFTER) {
            throw "Injected uninstall failure after backup $backupCount."
        }
    }
    $removedAny = [bool]($records | Where-Object { $_.originalPresent })
    Abrupt-Abort 'before-commit'; Write-TransactionJournal $journalPath 'committed' $records; Abrupt-Abort 'after-commit'
    Abrupt-Abort 'before-cleanup'
    Remove-Item -LiteralPath $txDir -Recurse -Force
    Abrupt-Abort 'after-cleanup'
} catch {
    $rollbackFailures = @()
    for ($recordIndex = $records.Count - 1; $recordIndex -ge 0; $recordIndex--) {
        $record = $records[$recordIndex]
        $backupPresent = Test-Path -LiteralPath $record.backup
        $destinationPresent = Test-Path -LiteralPath $record.destination
        if ($backupPresent -and -not $destinationPresent) {
            Abrupt-Abort ("before-rollback-" + $recordIndex)
            try { if (-not (Restore-TransactionRecord $journalPath ([pscustomobject]@{ records = $records }) $record $recordIndex)) { throw 'destination and backup both exist' } }
            catch { $rollbackFailures += "$($record.destination): $($_.Exception.Message)" }
            Abrupt-Abort ("after-rollback-" + $recordIndex)
        } elseif ($backupPresent -and $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup both exist"
        } elseif ($record.status -eq 'backing-up' -and -not $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent"
        } elseif ($record.status -eq 'backed-up' -and -not $backupPresent -and -not $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent"
        } elseif ($record.status -eq 'restoring' -and -not $backupPresent -and -not $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent while restoring"
        } elseif ($record.status -eq 'restored' -and (-not $destinationPresent -or $backupPresent)) {
            $rollbackFailures += "$($record.destination): restored state is incomplete"
        }
    }
    if ($rollbackFailures.Count -gt 0) {
        Write-TransactionJournal $journalPath 'rollback-failed' $records $rollbackFailures
        throw "Uninstall failed and rollback is incomplete; recover from $txDir`n$($rollbackFailures -join "`n")"
    }
    Write-TransactionJournal $journalPath 'rolled-back' $records
    Remove-Item -LiteralPath $txDir -Recurse -Force
    throw
}

Write-Output ""
if (-not $removedAny) {
    Write-Output "Nothing to remove - rust-intel is not installed at $ClaudeDir."
} else {
    Write-Output "Done. rust-intel skill and slash commands are uninstalled."
}
