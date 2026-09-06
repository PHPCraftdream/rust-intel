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
if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $env:RUST_INTEL_INSTALL_FAIL_AFTER -notmatch '^[1-9][0-9]*$') {
    throw 'RUST_INTEL_INSTALL_FAIL_AFTER must be a positive integer.'
}

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

# Sweep prior installation - all known layouts (current + every prior).
if (Test-Path -LiteralPath $SkillDir) {
    Write-Output "  cleaning   $SkillDir (previous install)"
    Remove-Item -LiteralPath $SkillDir -Recurse -Force
}
# v0.2.1+ flat-with-prefix:
foreach ($cur in 'rust-cc-audit.md', 'rust-cc-fix.md', 'rust-cc-plan.md') {
    $curPath = Join-Path $CommandsDir $cur
    if (Test-Path -LiteralPath $curPath) {
        Write-Output "  cleaning   $curPath (previous install)"
        Remove-Item -LiteralPath $curPath -Force
    }
}
# v0.2.0 colon-namespace dir:
if (Test-Path -LiteralPath $NsDir) {
    Write-Output "  cleaning   $NsDir (v0.2.0 namespace layout)"
    Remove-Item -LiteralPath $NsDir -Recurse -Force
}
# v0.1.x legacy flat layout:
foreach ($legacy in 'rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md') {
    $legacyPath = Join-Path $CommandsDir $legacy
    if (Test-Path -LiteralPath $legacyPath) {
        Write-Output "  cleaning   $legacyPath (legacy v0.1.x layout)"
        Remove-Item -LiteralPath $legacyPath -Force
    }
}

New-Item -ItemType Directory -Force -Path $SkillDir    | Out-Null
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

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

$txParent = Split-Path -Parent $ClaudeDir
New-Item -ItemType Directory -Force -LiteralPath $txParent | Out-Null
$txDir = Join-Path $txParent ('.rust-intel-tx-' + [IO.Path]::GetRandomFileName())
$stageRoot = Join-Path $txDir 'stage'
$backupRoot = Join-Path $txDir 'backup'
New-Item -ItemType Directory -Force -LiteralPath $stageRoot, $backupRoot | Out-Null
$stageSkill = Join-Path $stageRoot 'rust-intel'

# Copy and validate the complete replacement before moving any existing path.
foreach ($file in $skillFiles) {
    $relative = $file.FullName.Substring($SkillSourceDir.Length).TrimStart('\','/')
    $destination = Join-Path $stageSkill $relative
    New-Item -ItemType Directory -Force -LiteralPath (Split-Path -Parent $destination) | Out-Null
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
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $staged).Hash) { throw "Staged skill file differs: $relative" }
}

$owned = @($SkillDir,
    (Join-Path $CommandsDir 'rust-cc-audit.md'), (Join-Path $CommandsDir 'rust-cc-fix.md'), (Join-Path $CommandsDir 'rust-cc-plan.md'),
    $NsDir,
    (Join-Path $CommandsDir 'rust-audit.md'), (Join-Path $CommandsDir 'rust-fix.md'),
    (Join-Path $CommandsDir 'rust-plan.md'), (Join-Path $CommandsDir 'rust-intel.md'))
$backups = @()
$replacements = @(@{ Destination = $SkillDir; Staged = $stageSkill })
for ($index = 0; $index -lt $stageCommands.Count; $index++) {
    $replacements += @{ Destination = (Join-Path $CommandsDir ('rust-cc-' + @('audit','fix','plan')[$index] + '.md')); Staged = $stageCommands[$index] }
}
$replaceCount = 0
try {
    foreach ($destination in $owned) {
        if (Test-Path -LiteralPath $destination -Force) {
            $backup = Join-Path $backupRoot ([string]$backups.Count)
            Move-Item -LiteralPath $destination -Destination $backup
            $backups += @{ Destination = $destination; Backup = $backup }
        }
    }
    foreach ($replacement in $replacements) {
        New-Item -ItemType Directory -Force -LiteralPath (Split-Path -Parent $replacement.Destination) | Out-Null
        Move-Item -LiteralPath $replacement.Staged -Destination $replacement.Destination
        $replaceCount++
        if ($env:RUST_INTEL_INSTALL_FAIL_AFTER -and $replaceCount -eq [int]$env:RUST_INTEL_INSTALL_FAIL_AFTER) { throw "Injected installer failure after replacement $replaceCount." }
    }
    Remove-Item -LiteralPath $txDir -Recurse -Force
} catch {
    foreach ($replacement in $replacements) {
        if (Test-Path -LiteralPath $replacement.Destination -Force) { Remove-Item -LiteralPath $replacement.Destination -Recurse -Force }
    }
    foreach ($record in @($backups | Select-Object -Last $backups.Count)) {
        New-Item -ItemType Directory -Force -LiteralPath (Split-Path -Parent $record.Destination) | Out-Null
        Move-Item -LiteralPath $record.Backup -Destination $record.Destination
    }
    if (Test-Path -LiteralPath $txDir -Force) { Remove-Item -LiteralPath $txDir -Recurse -Force }
    throw
}

Write-Output ""
Write-Output "Done. Verify by starting 'claude' in this directory and trying:"
Write-Output "  /rust-cc-audit"
Write-Output "  /rust-cc-fix  <error message>"
Write-Output "  /rust-cc-plan <task description>"
Write-Output ""
Write-Output "The skill 'rust-intel' will activate automatically on any Rust task."
