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
}

function Recover-Transaction {
    param([string]$Transaction)
    $journalPath = Join-Path $Transaction 'journal.json'
    if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) { throw "Unfinished uninstall transaction has no journal; recover manually from $Transaction" }
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if ($journal.phase -eq 'committed' -or $journal.phase -eq 'rolled-back') { Remove-Item -LiteralPath $Transaction -Recurse -Force; return }
    $failures = @()
    foreach ($record in @($journal.records)) {
        $destination = [string]$record.destination
        $backup = [string]$record.backup
        if (Test-Path -LiteralPath $backup) {
            if (-not (Test-Path -LiteralPath $destination)) {
                try { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null; Move-Item -LiteralPath $backup -Destination $destination }
                catch { $failures += "$destination`: $($_.Exception.Message)" }
            } else { $failures += "$destination`: destination and backup both exist" }
        } elseif ($record.status -eq 'backing-up') { $failures += "$destination`: backup state is incomplete" }
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
foreach ($pending in @(Get-ChildItem -LiteralPath $txParent -Directory -Filter '.rust-intel-ps-uninstall-*' -ErrorAction SilentlyContinue)) { Recover-Transaction $pending.FullName }
$txDir = Join-Path $txParent ('.rust-intel-ps-uninstall-' + [IO.Path]::GetRandomFileName())
$backupRoot = Join-Path $txDir 'backup'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$records = @()
foreach ($destination in $owned | Select-Object -Unique) {
    $records += [pscustomobject]@{ destination = $destination; backup = Join-Path $backupRoot ([string]$records.Count); status = 'pending'; originalPresent = [bool](Test-Path -LiteralPath $destination) }
}
$journalPath = Join-Path $txDir 'journal.json'
Write-TransactionJournal $journalPath 'prepared' $records
try {
    $backupCount = 0
    foreach ($record in $records) {
        if (-not $record.originalPresent) { continue }
        $record.status = 'backing-up'; Write-TransactionJournal $journalPath 'active' $records
        Move-Item -LiteralPath $record.destination -Destination $record.backup
        $record.status = 'backed-up'; Write-TransactionJournal $journalPath 'active' $records
        $backupCount++
        if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $backupCount -eq [int]$env:RUST_INTEL_INSTALL_FAIL_AFTER) {
            throw "Injected uninstall failure after backup $backupCount."
        }
    }
    $removedAny = [bool]($records | Where-Object { $_.originalPresent })
    Write-TransactionJournal $journalPath 'committed' $records
    Remove-Item -LiteralPath $txDir -Recurse -Force
} catch {
    $rollbackFailures = @()
    for ($recordIndex = $records.Count - 1; $recordIndex -ge 0; $recordIndex--) {
        $record = $records[$recordIndex]
        if ((Test-Path -LiteralPath $record.backup) -and -not (Test-Path -LiteralPath $record.destination)) {
            try { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $record.destination) | Out-Null; Move-Item -LiteralPath $record.backup -Destination $record.destination }
            catch { $rollbackFailures += "$($record.destination): $($_.Exception.Message)" }
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
