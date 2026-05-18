# Removes the rust-intel skill and the /rust-intel-cc:* commands.
# Inverse of install.ps1.
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
Usage: .\uninstall.ps1 [-User]

Default target (no flags): .\.claude\  (the current working directory).
With -User:                %USERPROFILE%\.claude\  (user-global).
If `$env:CLAUDE_CONFIG_DIR is set, it overrides both.

Removes (only the files install.ps1 creates):
  <target>\skills\rust-intel\                      (entire directory)
  <target>\commands\rust-intel-cc\                 (entire directory)
  <target>\commands\{rust-audit,rust-fix,rust-plan,rust-intel}.md   (legacy v0.1.x flat layout)

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

$removedAny = $false

if (Test-Path -LiteralPath $SkillDir) {
    Remove-Item -LiteralPath $SkillDir -Recurse -Force
    Write-Output "  removed    $SkillDir"
    $removedAny = $true
}

if (Test-Path -LiteralPath $NsDir) {
    Remove-Item -LiteralPath $NsDir -Recurse -Force
    Write-Output "  removed    $NsDir"
    $removedAny = $true
}

# Includes the legacy flat layout from v0.1.x.
foreach ($legacy in 'rust-audit.md', 'rust-fix.md', 'rust-plan.md', 'rust-intel.md') {
    $legacyPath = Join-Path $CommandsDir $legacy
    if (Test-Path -LiteralPath $legacyPath) {
        Remove-Item -LiteralPath $legacyPath -Force
        Write-Output "  removed    $legacyPath (legacy v0.1.x layout)"
        $removedAny = $true
    }
}

Write-Output ""
if (-not $removedAny) {
    Write-Output "Nothing to remove - rust-intel is not installed at $ClaudeDir."
} else {
    Write-Output "Done. rust-intel skill and slash commands are uninstalled."
}
