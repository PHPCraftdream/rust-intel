#!/usr/bin/env bash
# Installs the rust-intel skill and the /rust-cc-audit, /rust-cc-fix,
# /rust-cc-plan commands.
#
# Repo layout (source): commands/rust-intel-cc/{audit,fix,plan}.md  (organized as
# a namespace dir on disk for readability).
# Installed layout (target): <claude>/commands/rust-cc-{audit,fix,plan}.md  (flat,
# prefixed - Claude Code maps these to flat slash commands /rust-cc-*).
# The installer renames during copy.
#
# Default target: ./.claude/ of the current working directory (project-local).
# Pass --user to install into the user-global ~/.claude/ instead.
# CLAUDE_CONFIG_DIR env var (if set) overrides everything.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

USE_SYMLINK=0
USE_USER=0
for arg in "$@"; do
    case "$arg" in
        --user)    USE_USER=1 ;;
        --symlink) USE_SYMLINK=1 ;;
        --help|-h)
            cat <<EOF
Usage: ./install.sh [--user] [--symlink]

Default target (no flags): \$PWD/.claude/  (the current working directory).
With --user:               \$HOME/.claude/  (user-global).
If \$CLAUDE_CONFIG_DIR is set, it overrides both.

Installs (renaming source nested -> target flat-with-prefix):
  rust-intel.md                       -> <target>/skills/rust-intel/SKILL.md
  commands/rust-intel-cc/audit.md     -> <target>/commands/rust-cc-audit.md
  commands/rust-intel-cc/fix.md       -> <target>/commands/rust-cc-fix.md
  commands/rust-intel-cc/plan.md      -> <target>/commands/rust-cc-plan.md

Slash commands after install:
  /rust-cc-audit   /rust-cc-fix   /rust-cc-plan

Sweeps any previous install at the same target before copying:
  <target>/skills/rust-intel/                                          (entire directory)
  <target>/commands/rust-cc-{audit,fix,plan}.md                        (v0.2.1+ flat-with-prefix)
  <target>/commands/rust-intel-cc/                                     (v0.2.0 namespace dir)
  <target>/commands/{rust-audit,rust-fix,rust-plan,rust-intel}.md      (legacy v0.1.x flat layout)

Options:
  --user      Install to \$HOME/.claude/ instead of \$PWD/.claude/.
  --symlink   Symlink files instead of copying, so they track repo updates.
  --help      Show this message.

Environment:
  CLAUDE_CONFIG_DIR   Override the target. If set, --user is ignored.
EOF
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg (try --help)" >&2
            exit 1
            ;;
    esac
done

if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
    CLAUDE_DIR="$CLAUDE_CONFIG_DIR"
elif [[ "$USE_USER" -eq 1 ]]; then
    CLAUDE_DIR="$HOME/.claude"
else
    CLAUDE_DIR="$(pwd)/.claude"
fi

SKILL_DIR="$CLAUDE_DIR/skills/rust-intel"
COMMANDS_DIR="$CLAUDE_DIR/commands"
NS_DIR="$COMMANDS_DIR/rust-intel-cc"

if [[ ! -f "$REPO_DIR/rust-intel.md" ]]; then
    echo "Error: rust-intel.md not found at $REPO_DIR. The installer must live alongside it." >&2
    exit 1
fi

echo "Installing rust-intel into $CLAUDE_DIR ..."

# Sweep prior installation - all known layouts (current + every prior).
if [[ -e "$SKILL_DIR" || -L "$SKILL_DIR" ]]; then
    echo "  cleaning   $SKILL_DIR (previous install)"
    rm -rf "$SKILL_DIR"
fi
# v0.2.1+ flat-with-prefix:
for cur in rust-cc-audit.md rust-cc-fix.md rust-cc-plan.md; do
    cur_path="$COMMANDS_DIR/$cur"
    if [[ -e "$cur_path" || -L "$cur_path" ]]; then
        echo "  cleaning   $cur_path (previous install)"
        rm -f "$cur_path"
    fi
done
# v0.2.0 colon-namespace dir:
if [[ -e "$NS_DIR" || -L "$NS_DIR" ]]; then
    echo "  cleaning   $NS_DIR (v0.2.0 namespace layout)"
    rm -rf "$NS_DIR"
fi
# v0.1.x legacy flat layout:
for legacy in rust-audit.md rust-fix.md rust-plan.md rust-intel.md; do
    legacy_path="$COMMANDS_DIR/$legacy"
    if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
        echo "  cleaning   $legacy_path (legacy v0.1.x layout)"
        rm -f "$legacy_path"
    fi
done

mkdir -p "$SKILL_DIR" "$COMMANDS_DIR"

install_file() {
    local src="$1"
    local dst="$2"
    if [[ "$USE_SYMLINK" -eq 1 ]]; then
        ln -sf "$src" "$dst"
        echo "  symlinked  $dst"
    else
        cp -f "$src" "$dst"
        echo "  copied     $dst"
    fi
}

install_file "$REPO_DIR/rust-intel.md"                       "$SKILL_DIR/SKILL.md"
install_file "$REPO_DIR/commands/rust-intel-cc/audit.md"     "$COMMANDS_DIR/rust-cc-audit.md"
install_file "$REPO_DIR/commands/rust-intel-cc/fix.md"       "$COMMANDS_DIR/rust-cc-fix.md"
install_file "$REPO_DIR/commands/rust-intel-cc/plan.md"      "$COMMANDS_DIR/rust-cc-plan.md"

echo ""
echo "Done. Verify by starting 'claude' in this directory and trying:"
echo "  /rust-cc-audit"
echo "  /rust-cc-fix  <error message>"
echo "  /rust-cc-plan <task description>"
echo ""
echo "The skill 'rust-intel' will activate automatically on any Rust task."
