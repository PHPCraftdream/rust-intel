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
Usage: .\install.ps1 [-User]

Default target (no flags): .\.claude\  (the current working directory).
With -User:                %USERPROFILE%\.claude\  (user-global).
If `$env:CLAUDE_CONFIG_DIR is set, it overrides both.

Installs (renaming source nested -> target flat-with-prefix):
  rust-intel.md                       -> <target>\skills\rust-intel\SKILL.md
  commands\rust-intel-cc\audit.md     -> <target>\commands\rust-cc-audit.md
  commands\rust-intel-cc\fix.md       -> <target>\commands\rust-cc-fix.md
  commands\rust-intel-cc\plan.md      -> <target>\commands\rust-cc-plan.md

Slash commands after install:
  /rust-cc-audit   /rust-cc-fix   /rust-cc-plan

Sweeps any previous install at the same target before copying:
  <target>\skills\rust-intel\                                          (entire directory)
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

$SkillSource = Join-Path $RepoDir 'rust-intel.md'
if (-not (Test-Path -LiteralPath $SkillSource)) {
    Write-Error "rust-intel.md not found at $RepoDir. The installer must live alongside it."
    exit 1
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
    Copy-Item -Path $Source -Destination $Destination -Force
    Write-Output "  copied     $Destination"
}

Install-File -Source $SkillSource                                                       -Destination (Join-Path $SkillDir 'SKILL.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-intel-cc\audit.md')             -Destination (Join-Path $CommandsDir 'rust-cc-audit.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-intel-cc\fix.md')               -Destination (Join-Path $CommandsDir 'rust-cc-fix.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-intel-cc\plan.md')              -Destination (Join-Path $CommandsDir 'rust-cc-plan.md')

Write-Output ""
Write-Output "Done. Verify by starting 'claude' in this directory and trying:"
Write-Output "  /rust-cc-audit"
Write-Output "  /rust-cc-fix  <error message>"
Write-Output "  /rust-cc-plan <task description>"
Write-Output ""
Write-Output "The skill 'rust-intel' will activate automatically on any Rust task."
