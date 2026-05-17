# Removes the rust-intel skill and the three named slash commands from %USERPROFILE%\.claude\.
# Inverse of install.ps1. Only touches paths that install.ps1 creates - other
# skills and commands under %USERPROFILE%\.claude\ are untouched.

[CmdletBinding()]
param(
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\uninstall.ps1

Removes (only the files install.ps1 creates):
  $env:USERPROFILE\.claude\skills\rust-intel\          (the entire skill directory)
  $env:USERPROFILE\.claude\commands\rust-audit.md
  $env:USERPROFILE\.claude\commands\rust-fix.md
  $env:USERPROFILE\.claude\commands\rust-plan.md

Other skills and commands under `$CLAUDE_CONFIG_DIR are not touched.

Environment:
  CLAUDE_CONFIG_DIR   Override the default %USERPROFILE%\.claude location.
"@ | Write-Output
    exit 0
}

$ErrorActionPreference = 'Stop'

if ($env:CLAUDE_CONFIG_DIR) {
    $ClaudeDir = $env:CLAUDE_CONFIG_DIR
} else {
    $ClaudeDir = Join-Path $env:USERPROFILE '.claude'
}
$SkillDir = Join-Path $ClaudeDir 'skills\rust-intel'
$CommandsDir = Join-Path $ClaudeDir 'commands'

Write-Output "Uninstalling rust-intel from $ClaudeDir ..."

$removedAny = $false

if (Test-Path -LiteralPath $SkillDir) {
    Remove-Item -LiteralPath $SkillDir -Recurse -Force
    Write-Output "  removed    $SkillDir"
    $removedAny = $true
}

# Includes the legacy `commands\rust-intel.md` (single-command layout used
# before the project was split into a skill + three commands).
foreach ($cmd in 'rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md') {
    $cmdPath = Join-Path $CommandsDir $cmd
    if (Test-Path -LiteralPath $cmdPath) {
        Remove-Item -LiteralPath $cmdPath -Force
        Write-Output "  removed    $cmdPath"
        $removedAny = $true
    }
}

Write-Output ""
if (-not $removedAny) {
    Write-Output "Nothing to remove - rust-intel is not installed at $ClaudeDir."
} else {
    Write-Output "Done. rust-intel skill and slash commands are uninstalled."
}
