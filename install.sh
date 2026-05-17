#!/usr/bin/env bash
# Installs the rust-intel skill and three slash commands into ~/.claude/.
# Run from the repo root.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SKILL_DIR="$CLAUDE_DIR/skills/rust-intel"
COMMANDS_DIR="$CLAUDE_DIR/commands"

USE_SYMLINK=0
for arg in "$@"; do
    case "$arg" in
        --symlink) USE_SYMLINK=1 ;;
        --help|-h)
            cat <<EOF
Usage: ./install.sh [--symlink]

Installs:
  rust-intel.md          -> $SKILL_DIR/SKILL.md
  commands/rust-audit.md -> $COMMANDS_DIR/rust-audit.md
  commands/rust-fix.md   -> $COMMANDS_DIR/rust-fix.md
  commands/rust-plan.md  -> $COMMANDS_DIR/rust-plan.md

Options:
  --symlink   Symlink files instead of copying, so they track repo updates.
  --help      Show this message.

Environment:
  CLAUDE_CONFIG_DIR   Override the default ~/.claude location.
EOF
            exit 0
            ;;
    esac
done

if [[ ! -f "$REPO_DIR/rust-intel.md" ]]; then
    echo "Error: rust-intel.md not found at $REPO_DIR. Run from the repo root." >&2
    exit 1
fi

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

echo "Installing rust-intel into $CLAUDE_DIR ..."
install_file "$REPO_DIR/rust-intel.md"          "$SKILL_DIR/SKILL.md"
install_file "$REPO_DIR/commands/rust-audit.md" "$COMMANDS_DIR/rust-audit.md"
install_file "$REPO_DIR/commands/rust-fix.md"   "$COMMANDS_DIR/rust-fix.md"
install_file "$REPO_DIR/commands/rust-plan.md"  "$COMMANDS_DIR/rust-plan.md"

echo ""
echo "Done. Verify by starting 'claude' in any Rust project and trying:"
echo "  /rust-audit"
echo "  /rust-fix <error message>"
echo "  /rust-plan <task description>"
echo ""
echo "The skill 'rust-intel' will activate automatically on any Rust task."
