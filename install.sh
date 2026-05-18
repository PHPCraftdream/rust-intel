#!/usr/bin/env bash
# Installs the rust-intel skill and the /rust-intel-cc:audit, /rust-intel-cc:fix,
# /rust-intel-cc:plan commands.
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

Installs:
  rust-intel.md                       -> <target>/skills/rust-intel/SKILL.md
  commands/rust-intel-cc/audit.md     -> <target>/commands/rust-intel-cc/audit.md
  commands/rust-intel-cc/fix.md       -> <target>/commands/rust-intel-cc/fix.md
  commands/rust-intel-cc/plan.md      -> <target>/commands/rust-intel-cc/plan.md

Sweeps any previous install at the same target before copying:
  <target>/skills/rust-intel/                      (entire directory)
  <target>/commands/rust-intel-cc/                 (entire directory)
  <target>/commands/{rust-audit,rust-fix,rust-plan,rust-intel}.md   (legacy v0.1.x flat layout)

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

# Sweep prior installation: skill dir + new namespace dir + legacy flat files.
if [[ -e "$SKILL_DIR" || -L "$SKILL_DIR" ]]; then
    echo "  cleaning   $SKILL_DIR (previous install)"
    rm -rf "$SKILL_DIR"
fi
if [[ -e "$NS_DIR" || -L "$NS_DIR" ]]; then
    echo "  cleaning   $NS_DIR (previous install)"
    rm -rf "$NS_DIR"
fi
for legacy in rust-audit.md rust-fix.md rust-plan.md rust-intel.md; do
    legacy_path="$COMMANDS_DIR/$legacy"
    if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
        echo "  cleaning   $legacy_path (legacy v0.1.x layout)"
        rm -f "$legacy_path"
    fi
done

mkdir -p "$SKILL_DIR" "$NS_DIR"

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
install_file "$REPO_DIR/commands/rust-intel-cc/audit.md"     "$NS_DIR/audit.md"
install_file "$REPO_DIR/commands/rust-intel-cc/fix.md"       "$NS_DIR/fix.md"
install_file "$REPO_DIR/commands/rust-intel-cc/plan.md"      "$NS_DIR/plan.md"

echo ""
echo "Done. Verify by starting 'claude' in this directory and trying:"
echo "  /rust-intel-cc:audit"
echo "  /rust-intel-cc:fix  <error message>"
echo "  /rust-intel-cc:plan <task description>"
echo ""
echo "The skill 'rust-intel' will activate automatically on any Rust task."
