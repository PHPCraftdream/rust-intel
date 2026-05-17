# Installs the rust-intel skill and three slash commands into %USERPROFILE%\.claude\.
# Run from the repo root: .\install.ps1

[CmdletBinding()]
param(
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\install.ps1

Installs:
  rust-intel.md          -> $env:USERPROFILE\.claude\skills\rust-intel\SKILL.md
  commands\rust-audit.md -> $env:USERPROFILE\.claude\commands\rust-audit.md
  commands\rust-fix.md   -> $env:USERPROFILE\.claude\commands\rust-fix.md
  commands\rust-plan.md  -> $env:USERPROFILE\.claude\commands\rust-plan.md

Environment:
  CLAUDE_CONFIG_DIR   Override the default %USERPROFILE%\.claude location.
"@ | Write-Output
    exit 0
}

$ErrorActionPreference = 'Stop'

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

if ($env:CLAUDE_CONFIG_DIR) {
    $ClaudeDir = $env:CLAUDE_CONFIG_DIR
} else {
    $ClaudeDir = Join-Path $env:USERPROFILE '.claude'
}
$SkillDir = Join-Path $ClaudeDir 'skills\rust-intel'
$CommandsDir = Join-Path $ClaudeDir 'commands'

$SkillSource = Join-Path $RepoDir 'rust-intel.md'
if (-not (Test-Path $SkillSource)) {
    Write-Error "rust-intel.md not found at $RepoDir. Run from the repo root."
    exit 1
}

New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

function Install-File {
    param([string]$Source, [string]$Destination)
    Copy-Item -Path $Source -Destination $Destination -Force
    Write-Output "  copied  $Destination"
}

Write-Output "Installing rust-intel into $ClaudeDir ..."
Install-File -Source $SkillSource                                  -Destination (Join-Path $SkillDir 'SKILL.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-audit.md') -Destination (Join-Path $CommandsDir 'rust-audit.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-fix.md')   -Destination (Join-Path $CommandsDir 'rust-fix.md')
Install-File -Source (Join-Path $RepoDir 'commands\rust-plan.md')  -Destination (Join-Path $CommandsDir 'rust-plan.md')

Write-Output ""
Write-Output "Done. Verify by starting 'claude' in any Rust project and trying:"
Write-Output "  /rust-audit"
Write-Output "  /rust-fix <error message>"
Write-Output "  /rust-plan <task description>"
Write-Output ""
Write-Output "The skill 'rust-intel' will activate automatically on any Rust task."
