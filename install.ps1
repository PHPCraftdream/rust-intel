# Installs the rust-intel skill and three slash commands into %USERPROFILE%\.claude\.
# Run from the repo root: .\install.ps1
# Cleanly replaces any previous installation.

[CmdletBinding()]
param(
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\install.ps1

Cleanly installs (any previous rust-intel skill directory and the three named command files are removed first):
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

Write-Output "Installing rust-intel into $ClaudeDir ..."

# Remove any previous skill directory entirely. Handles stale files from older
# versions (e.g. if a future release adds extra files alongside SKILL.md, an
# older install must not be left mixed in).
if (Test-Path -LiteralPath $SkillDir) {
    Write-Output "  cleaning   $SkillDir (previous install)"
    Remove-Item -LiteralPath $SkillDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $SkillDir    | Out-Null
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

# Remove any previous versions of the three named command files. Also remove
# `commands\rust-intel.md` if present - that was the legacy single-command
# layout used before the project was split into a skill + three commands; it
# would otherwise shadow the skill in some Claude Code listings.
foreach ($cmd in 'rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md') {
    $cmdPath = Join-Path $CommandsDir $cmd
    if (Test-Path -LiteralPath $cmdPath) {
        Write-Output "  cleaning   $cmdPath (previous install)"
        Remove-Item -LiteralPath $cmdPath -Force
    }
}

function Install-File {
    param([string]$Source, [string]$Destination)
    Copy-Item -Path $Source -Destination $Destination -Force
    Write-Output "  copied     $Destination"
}

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
