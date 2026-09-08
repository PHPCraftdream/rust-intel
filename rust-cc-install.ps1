# Installs the rust-intel skill and the /rust-cc-audit, /rust-cc-fix,
# /rust-cc-plan commands.
#
# Repo layout (source): commands\rust-intel-cc\{audit,fix,plan}.md  (organized as
# a namespace dir on disk for readability).
# Installed layout (target): <claude>\commands\rust-cc-{audit,fix,plan}.md  (flat,
# prefixed - Claude Code maps these to flat slash commands /rust-cc-*).
# The installer renames during copy.
#
# Default target: .\.claude\ of the current working directory (project-local).
# Pass -User to install into the user-global %USERPROFILE%\.claude\ instead.
# CLAUDE_CONFIG_DIR env var (if set) overrides everything.

[CmdletBinding()]
param(
    [switch]$User,
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\rust-cc-install.ps1 [-User]

Default target (no flags): .\.claude\  (the current working directory).
With -User:                %USERPROFILE%\.claude\  (user-global).
If `$env:CLAUDE_CONFIG_DIR is set, it overrides both.

Installs the modular skill (the single-file rust-intel.md reference is NOT installed):
  skill\**\*.md + **\*.js (SKILL.md + theme modules + workflow + references) -> <target>\skills\rust-intel\
  commands\rust-intel-cc\audit.md         -> <target>\commands\rust-cc-audit.md
  commands\rust-intel-cc\fix.md           -> <target>\commands\rust-cc-fix.md
  commands\rust-intel-cc\plan.md          -> <target>\commands\rust-cc-plan.md

Slash commands after install:
  /rust-cc-audit   /rust-cc-fix   /rust-cc-plan

Sweeps any previous install at the same target before copying:
  <target>\skills\rust-intel\                                          (entire directory, incl. any previous monolithic SKILL.md)
  <target>\commands\rust-cc-{audit,fix,plan}.md                        (v0.2.1+ flat-with-prefix)
  <target>\commands\rust-intel-cc\                                     (v0.2.0 namespace dir)
  <target>\commands\{rust-audit,rust-fix,rust-plan,rust-intel}.md      (legacy v0.1.x flat layout)

Options:
  -User       Install to %USERPROFILE%\.claude\ instead of .\.claude\.
  -Help       Show this message.

Environment:
  CLAUDE_CONFIG_DIR   Override the target. If set, -User is ignored.
"@ | Write-Output
    exit 0
}

$ErrorActionPreference = 'Stop'
$script:createdDirectories = @()
if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $env:RUST_INTEL_INSTALL_FAIL_AFTER -notmatch '^[1-9][0-9]*$') {
    throw 'RUST_INTEL_INSTALL_FAIL_AFTER must be a positive integer.'
}

function Abrupt-Abort {
    param([string]$Boundary)
    if ($env:RUST_INTEL_INSTALL_ABORT_LOG) { [IO.File]::AppendAllText($env:RUST_INTEL_INSTALL_ABORT_LOG, $Boundary + [Environment]::NewLine) }
    if ($env:RUST_INTEL_INSTALL_ABORT_AT -eq $Boundary) { exit 86 }
}

# RUST_INTEL_ABORT_BOUNDARIES: before-journal,after-journal,before-backup-{index},after-backup-journal-{index},after-backup-rename-{index},before-replacement-{index},after-replacement-journal-{index},after-replacement-rename-{index},before-restore-{index},after-restore-rename-{index},after-restore-status-{index},before-rollback-{index},after-rollback-{index},before-commit,after-commit,before-cleanup,after-cleanup

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

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

$SkillSourceDir = Join-Path $RepoDir 'skill'
if (-not (Test-Path -LiteralPath (Join-Path $SkillSourceDir 'SKILL.md'))) {
    Write-Error "skill\SKILL.md not found at $SkillSourceDir. The installer must live alongside the skill\ directory."
    exit 1
}

function Get-CanonicalCandidate {
    param([string]$PathValue)
    $full = [IO.Path]::GetFullPath($PathValue)
    if (Test-Path -LiteralPath $full) {
        return (Resolve-Path -LiteralPath $full).Path
    }
    $parent = Split-Path -Parent $full
    if ($parent -eq $full) { return $full }
    return (Join-Path (Get-CanonicalCandidate $parent) (Split-Path -Leaf $full))
}

function Test-PathWithin {
    param([string]$Child, [string]$Parent)
    $childFull = $Child.TrimEnd('\')
    $parentFull = $Parent.TrimEnd('\')
    return $childFull.Equals($parentFull, [StringComparison]::OrdinalIgnoreCase) -or
        $childFull.StartsWith($parentFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

$sourceCanonical = Get-CanonicalCandidate $SkillSourceDir
$destinationCanonical = Get-CanonicalCandidate $SkillDir
if ((Test-PathWithin $destinationCanonical $sourceCanonical) -or (Test-PathWithin $sourceCanonical $destinationCanonical)) {
    throw "Destination must not overlap source (source: $sourceCanonical, destination: $destinationCanonical)."
}
$commandsSourceCanonical = Get-CanonicalCandidate (Join-Path $RepoDir 'commands\rust-intel-cc')
$commandsDestinationCanonical = Get-CanonicalCandidate $CommandsDir
if ((Test-PathWithin $commandsDestinationCanonical $commandsSourceCanonical) -or (Test-PathWithin $commandsSourceCanonical $commandsDestinationCanonical)) {
    throw "Destination commands directory must not overlap source commands (source: $commandsSourceCanonical, destination: $commandsDestinationCanonical)."
}

Write-Output "Installing rust-intel into $ClaudeDir ..."

function Install-File {
    param([string]$Source, [string]$Destination)
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
    Write-Output "  copied     $Destination"
}

$skillFiles = @(Get-ChildItem -LiteralPath $SkillSourceDir -Recurse -File | Where-Object {
    $_.Name -like '*.md' -or $_.Name -like '*.js'
})
if (-not ($skillFiles | Where-Object { $_.FullName.Substring($SkillSourceDir.Length).TrimStart('\','/') -eq 'SKILL.md' })) {
    throw "Source inventory is missing skill\SKILL.md."
}
$commandSources = @(
    (Join-Path $RepoDir 'commands\rust-intel-cc\audit.md'),
    (Join-Path $RepoDir 'commands\rust-intel-cc\fix.md'),
    (Join-Path $RepoDir 'commands\rust-intel-cc\plan.md')
)
foreach ($source in $commandSources) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Source command is missing: $source" }
}

$owned = @($SkillDir,
    (Join-Path $CommandsDir 'rust-cc-audit.md'), (Join-Path $CommandsDir 'rust-cc-fix.md'), (Join-Path $CommandsDir 'rust-cc-plan.md'),
    $NsDir,
    (Join-Path $CommandsDir 'rust-audit.md'), (Join-Path $CommandsDir 'rust-fix.md'),
    (Join-Path $CommandsDir 'rust-plan.md'), (Join-Path $CommandsDir 'rust-intel.md'))

function Write-TransactionJournal {
    param([string]$Path, [string]$Phase, [object[]]$Records, [string[]]$Failures = @())
    Abrupt-Abort 'before-journal'
    $payload = [ordered]@{ version = 1; phase = $Phase; records = @($Records) }
    if ($Failures.Count -gt 0) { $payload.rollbackFailures = @($Failures) }
    if ($script:createdDirectories.Count -gt 0) { $payload.createdDirectories = @($script:createdDirectories) }
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

# rmdir-only: a container that is no longer empty or already gone is left untouched, so
# content owned by anyone else can never be removed through this path. The bounded retry
# absorbs transient sharing violations on a just-emptied container (antivirus and filter
# drivers briefly hold directory handles); a container that is genuinely not empty fails
# every attempt and is still left untouched.
function Remove-CreatedDirectories {
    param([object[]]$Entries)
    foreach ($entry in $Entries) {
        if (Test-Path -LiteralPath $entry -PathType Container) {
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                try { Remove-Item -LiteralPath $entry -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 100 }
            }
        }
    }
}

# Containers this install will create, deepest first, deduplicated. Written into the staged
# skill directory so a later uninstall can prove which empty containers it may remove; the
# transaction journal only survives until commit. Entries are recorded relative to the target
# directory so the manifest content is identical regardless of where the target lives.
function Get-ManifestCandidates {
    param([string[]]$Destinations)
    $result = @()
    foreach ($destination in $Destinations) {
        $ancestor = [IO.Path]::GetFullPath((Split-Path -Parent $destination))
        while (-not (Test-Path -LiteralPath $ancestor -PathType Container)) {
            $relative = $ancestor.Substring($ClaudeDir.Length).TrimStart('\','/')
            if ($result -notcontains $relative) { $result += $relative }
            $parent = Split-Path -Parent $ancestor
            if ($parent -eq $ancestor) { break }
            $ancestor = $parent
        }
    }
    return $result
}

function Recover-Transaction {
    param([string]$Transaction, [string[]]$Owned)
    $journalPath = Join-Path $Transaction 'journal.json'
    if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) {
        # The journal is published before staging and before any live path is moved.
        Remove-Item -LiteralPath $Transaction -Recurse -Force
        return
    }
    try { $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json } catch { throw "Invalid installer transaction journal; recover manually from $Transaction" }
    $phases = @('prepared', 'active', 'committed', 'rolled-back', 'rollback-failed')
    if ($journal.version -ne 1 -or $phases -notcontains [string]$journal.phase) { throw "Invalid installer transaction journal; recover manually from $Transaction" }
    $records = @($journal.records)
    if ($records.Count -ne $Owned.Count) { throw "Installer transaction journal record count does not match owned inventory: $Transaction" }
    $statuses = @('pending', 'backing-up', 'backed-up', 'installing', 'installed', 'restoring', 'restored')
    $backupRoot = [IO.Path]::GetFullPath((Join-Path $Transaction 'backup'))
    for ($recordIndex = 0; $recordIndex -lt $records.Count; $recordIndex++) {
        $record = $records[$recordIndex]
        if ($null -eq $record -or $statuses -notcontains [string]$record.status -or
            $record.destination -ne $Owned[$recordIndex] -or $null -eq $record.backup -or
            ($record.originalPresent -isnot [bool])) {
            throw "Invalid installer transaction record $recordIndex; recover manually from $Transaction"
        }
        $expectedBackup = [IO.Path]::GetFullPath((Join-Path $backupRoot ([string]$recordIndex)))
        if ([IO.Path]::GetFullPath([string]$record.backup) -ne $expectedBackup) { throw "Installer transaction backup is outside its backup root: $Transaction" }
    }
    # Re-seed from the journal so mid-recovery journal rewrites (restore status writes) keep
    # carrying the created-directories list until recovery completes.
    $script:createdDirectories = @()
    if ($journal.PSObject.Properties['createdDirectories'] -and $null -ne $journal.createdDirectories) {
        $script:createdDirectories = @($journal.createdDirectories | ForEach-Object { [string]$_ })
    }
    if ($journal.phase -eq 'committed' -or $journal.phase -eq 'rolled-back') {
        Remove-Item -LiteralPath $Transaction -Recurse -Force
        return
    }
    $failures = @()
    for ($recordIndex = 0; $recordIndex -lt $records.Count; $recordIndex++) {
        $record = $records[$recordIndex]
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
            if ($record.status -eq 'installed' -and $destinationPresent) {
                try { Remove-Item -LiteralPath $destination -Recurse -Force } catch { $failures += "$destination`: $($_.Exception.Message)" }
            } elseif ($record.status -eq 'installing' -and $destinationPresent) {
                # The old path was moved to backup before replacement installation began. Thus a
                # destination at this boundary is the replacement after its rename; remove it
                # and restore the old snapshot below.
                try { Remove-Item -LiteralPath $destination -Recurse -Force } catch { $failures += "$destination`: $($_.Exception.Message)" }
            }
            if (-not (Test-Path -LiteralPath $destination) -and (Test-Path -LiteralPath $backup)) {
                try {
                    if (-not (Restore-TransactionRecord $journalPath $journal $record $recordIndex)) { throw 'destination and backup both exist' }
                } catch { $failures += "$destination`: $($_.Exception.Message)" }
            } elseif ((Test-Path -LiteralPath $backup) -and (Test-Path -LiteralPath $destination)) {
                $failures += "$destination`: destination and backup both exist"
            }
        } elseif ($record.status -eq 'installed' -and -not [bool]$record.originalPresent -and $destinationPresent) {
            try { Remove-Item -LiteralPath $destination -Recurse -Force } catch { $failures += "$destination`: $($_.Exception.Message)" }
        } elseif ($record.status -eq 'installing' -and $destinationPresent -and -not [bool]$record.originalPresent) {
            # Fresh install: there is no old snapshot, so remove the replacement to restore the
            # pre-transaction state.
            try { Remove-Item -LiteralPath $destination -Recurse -Force } catch { $failures += "$destination`: $($_.Exception.Message)" }
        } elseif ($record.status -eq 'installing' -and $destinationPresent) {
            $failures += "$destination`: unbacked destination exists while replacement is installing"
        } elseif ($record.status -eq 'backed-up' -or ($record.status -eq 'backing-up' -and -not $destinationPresent)) {
            $failures += "$destination`: backup state is incomplete"
        }
    }
    if ($failures.Count -gt 0) { throw "Unfinished installer transaction requires recovery: $Transaction`n$($failures -join "`n")" }
    $createdEntries = @()
    if ($null -ne $journal -and $journal.PSObject.Properties['createdDirectories'] -and $null -ne $journal.createdDirectories) {
        $createdEntries = @($journal.createdDirectories | ForEach-Object { [string]$_ })
    }
    Remove-CreatedDirectories $createdEntries
    Remove-Item -LiteralPath $Transaction -Recurse -Force
}

$txParent = Split-Path -Parent $ClaudeDir
New-Item -ItemType Directory -Force -Path $txParent | Out-Null
$pendingTransactions = @(
    foreach ($filter in @('.rust-intel-ps-tx-*', '.rust-intel-ps-uninstall-*')) {
        Get-ChildItem -LiteralPath $txParent -Directory -Filter $filter -ErrorAction SilentlyContinue
    }
)
if ($pendingTransactions.Count -gt 1) {
    throw "Multiple pending installer transactions require manual recovery: $($pendingTransactions.FullName -join ', ')"
}
foreach ($pending in $pendingTransactions) { Recover-Transaction $pending.FullName $owned }

$txDir = Join-Path $txParent ('.rust-intel-ps-tx-' + [IO.Path]::GetRandomFileName())
$stageRoot = Join-Path $txDir 'stage'
$backupRoot = Join-Path $txDir 'backup'
New-Item -ItemType Directory -Force -Path $txDir | Out-Null
$stageSkill = Join-Path $stageRoot 'rust-intel'

# Copy and validate the complete replacement before moving any existing path.
foreach ($file in $skillFiles) {
    $relative = $file.FullName.Substring($SkillSourceDir.Length).TrimStart('\','/')
    $destination = Join-Path $stageSkill $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Install-File -Source $file.FullName -Destination $destination
}
$stageCommands = @()
for ($index = 0; $index -lt $commandSources.Count; $index++) {
    $stageCommand = Join-Path $stageRoot ('rust-cc-' + @('audit','fix','plan')[$index] + '.md')
    Install-File -Source $commandSources[$index] -Destination $stageCommand
    $stageCommands += $stageCommand
}
foreach ($file in $skillFiles) {
    $relative = $file.FullName.Substring($SkillSourceDir.Length).TrimStart('\','/')
    $staged = Join-Path $stageSkill $relative
    if (-not (Test-Path -LiteralPath $staged -PathType Leaf)) { throw "Staged skill file is missing: $relative" }
    $sourceHash = $null
    $stagedHash = $null
    try {
        $sourceHash = (Get-FileHash -LiteralPath $file.FullName).Hash
        $stagedHash = (Get-FileHash -LiteralPath $staged).Hash
    } catch [System.Management.Automation.CommandNotFoundException] {
        throw "Get-FileHash is not available in this PowerShell session (Microsoft.PowerShell.Utility failed to resolve); cannot validate staged skill file: $relative"
    }
    if ($sourceHash -ne $stagedHash) { throw "Staged skill file differs: $relative" }
}

$manifestDirs = Get-ManifestCandidates @($SkillDir, $CommandsDir)
$previousManifest = Join-Path $SkillDir '.rust-intel-created-dirs'
if (Test-Path -LiteralPath $previousManifest -PathType Leaf) {
    # Carry forward the manifest of the install being replaced: the containers it lists were
    # created by this install lineage.
    foreach ($entry in @(Get-Content -LiteralPath $previousManifest | ForEach-Object { [string]$_ })) {
        if ($entry -ne '' -and $manifestDirs -notcontains $entry) { $manifestDirs += $entry }
    }
}
if ($manifestDirs.Count -gt 0) {
    Set-Content -LiteralPath (Join-Path $stageSkill '.rust-intel-created-dirs') -Value $manifestDirs
}

$replacements = @(@{ Destination = $SkillDir; Staged = $stageSkill })
for ($index = 0; $index -lt $stageCommands.Count; $index++) {
    $replacements += @{ Destination = (Join-Path $CommandsDir ('rust-cc-' + @('audit','fix','plan')[$index] + '.md')); Staged = $stageCommands[$index] }
}
$journalPath = Join-Path $txDir 'journal.json'
$records = @()
foreach ($destination in $owned | Select-Object -Unique) {
    $records += [pscustomobject]@{
        destination = $destination
        backup = Join-Path $backupRoot ([string]$records.Count)
        status = 'pending'
        originalPresent = [bool](Test-Path -LiteralPath $destination)
    }
}
Write-TransactionJournal $journalPath 'prepared' $records
New-Item -ItemType Directory -Force -Path $stageRoot, $backupRoot | Out-Null
$replaceCount = 0
try {
    foreach ($record in $records) {
        if (-not $record.originalPresent) { continue }
        $record.status = 'backing-up'
        Abrupt-Abort ("before-backup-" + [Array]::IndexOf($records, $record))
        Write-TransactionJournal $journalPath 'active' $records
        Abrupt-Abort ("after-backup-journal-" + [Array]::IndexOf($records, $record))
        Move-Item -LiteralPath $record.destination -Destination $record.backup
        Abrupt-Abort ("after-backup-rename-" + [Array]::IndexOf($records, $record))
        $record.status = 'backed-up'
        Write-TransactionJournal $journalPath 'active' $records
    }
    foreach ($replacement in $replacements) {
        # Journal any not-yet-existing ancestor containers durably BEFORE creating them, so an
        # interrupted install can never leak an unrecorded directory.
        $missingAncestors = @()
        $ancestor = [IO.Path]::GetFullPath((Split-Path -Parent $replacement.Destination))
        while (-not (Test-Path -LiteralPath $ancestor -PathType Container)) {
            $missingAncestors = , $ancestor + $missingAncestors
            $parent = Split-Path -Parent $ancestor
            if ($parent -eq $ancestor) { break }
            $ancestor = $parent
        }
        if ($missingAncestors.Count -gt 0) {
            $script:createdDirectories = @($script:createdDirectories) + $missingAncestors
            Write-TransactionJournal $journalPath 'active' $records
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $replacement.Destination) | Out-Null
        $record = $records | Where-Object { $_.destination -eq $replacement.Destination }
        $record.status = 'installing'
        Abrupt-Abort ("before-replacement-" + [Array]::IndexOf($records, $record))
        Write-TransactionJournal $journalPath 'active' $records
        Abrupt-Abort ("after-replacement-journal-" + [Array]::IndexOf($records, $record))
        Move-Item -LiteralPath $replacement.Staged -Destination $replacement.Destination
        Abrupt-Abort ("after-replacement-rename-" + [Array]::IndexOf($records, $record))
        $record.status = 'installed'
        Write-TransactionJournal $journalPath 'active' $records
        $replaceCount++
        if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $replaceCount -eq [int]$env:RUST_INTEL_INSTALL_FAIL_AFTER) { throw "Injected installer failure after replacement $replaceCount." }
    }
    Abrupt-Abort 'before-commit'; Write-TransactionJournal $journalPath 'committed' $records; Abrupt-Abort 'after-commit'
    Abrupt-Abort 'before-cleanup'
    Remove-Item -LiteralPath $txDir -Recurse -Force
    Abrupt-Abort 'after-cleanup'
} catch {
    $rollbackFailures = @()
    for ($recordIndex = $records.Count - 1; $recordIndex -ge 0; $recordIndex--) {
        $record = $records[$recordIndex]
        $destinationPresent = Test-Path -LiteralPath $record.destination
        $backupPresent = Test-Path -LiteralPath $record.backup
        if ($record.status -eq 'installed' -and $destinationPresent -and ($backupPresent -or -not [bool]$record.originalPresent)) {
            Abrupt-Abort ("before-rollback-" + $recordIndex)
            try { Remove-Item -LiteralPath $record.destination -Recurse -Force } catch { $rollbackFailures += "$($record.destination): $($_.Exception.Message)" }
            Abrupt-Abort ("after-rollback-" + $recordIndex)
        }
        if ((Test-Path -LiteralPath $record.backup) -and -not (Test-Path -LiteralPath $record.destination)) {
            try { if (-not (Restore-TransactionRecord $journalPath ([pscustomobject]@{ records = $records }) $record $recordIndex)) { throw 'destination and backup both exist' } }
            catch { $rollbackFailures += "$($record.destination): $($_.Exception.Message)" }
        } elseif ($backupPresent -and $destinationPresent -and $record.status -ne 'installed') {
            $rollbackFailures += "$($record.destination): destination and backup both exist"
        } elseif ($record.status -eq 'backing-up' -and -not $backupPresent -and -not $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent"
        } elseif ($record.status -eq 'backed-up' -and -not $backupPresent -and -not $destinationPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent"
        } elseif ($record.status -eq 'installing' -and $destinationPresent -and -not $backupPresent) {
            $rollbackFailures += "$($record.destination): unbacked destination exists while replacement is installing"
        } elseif ($record.status -eq 'restoring' -and -not $destinationPresent -and -not $backupPresent) {
            $rollbackFailures += "$($record.destination): destination and backup are both absent while restoring"
        } elseif ($record.status -eq 'restored' -and (-not $destinationPresent -or $backupPresent)) {
            $rollbackFailures += "$($record.destination): restored state is incomplete"
        }
    }
    if ($rollbackFailures.Count -gt 0) {
        Write-TransactionJournal $journalPath 'rollback-failed' $records $rollbackFailures
        throw "Installer failed and rollback is incomplete; recover from $txDir`n$($rollbackFailures -join "`n")"
    }
    Write-TransactionJournal $journalPath 'rolled-back' $records
    Remove-CreatedDirectories $script:createdDirectories
    Remove-Item -LiteralPath $txDir -Recurse -Force
    throw
}

Write-Output ""
Write-Output "Done. Verify by starting 'claude' in this directory and trying:"
Write-Output "  /rust-cc-audit"
Write-Output "  /rust-cc-fix  <error message>"
Write-Output "  /rust-cc-plan <task description>"
Write-Output ""
Write-Output "The skill 'rust-intel' will activate automatically on any Rust task."
