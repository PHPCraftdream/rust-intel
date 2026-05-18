# Removes the rust-intel skill and the /rust-cc-* commands.
# Inverse of install.ps1. Sweeps every known historical layout (v0.1.x, v0.2.0,
# v0.2.1+) so this script is safe to run regardless of which version was used
# to install.
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

$removedAny = $false

if (Test-Path -LiteralPath $SkillDir) {
    Remove-Item -LiteralPath $SkillDir -Recurse -Force
    Write-Output "  removed    $SkillDir"
    $removedAny = $true
}

# v0.2.1+ flat-with-prefix:
foreach ($cur in 'rust-cc-audit.md', 'rust-cc-fix.md', 'rust-cc-plan.md') {
    $curPath = Join-Path $CommandsDir $cur
    if (Test-Path -LiteralPath $curPath) {
        Remove-Item -LiteralPath $curPath -Force
        Write-Output "  removed    $curPath"
        $removedAny = $true
    }
}

# v0.2.0 colon-namespace dir:
if (Test-Path -LiteralPath $NsDir) {
    Remove-Item -LiteralPath $NsDir -Recurse -Force
    Write-Output "  removed    $NsDir (v0.2.0 namespace layout)"
    $removedAny = $true
}

# v0.1.x legacy flat layout:
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
