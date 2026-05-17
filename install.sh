#!/usr/bin/env bash
# Installs the rust-intel skill and three slash commands into ~/.claude/.
# Run from the repo root. Cleanly replaces any previous installation.

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

Cleanly installs (any previous rust-intel skill directory and the three named command files are removed first):
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

echo "Installing rust-intel into $CLAUDE_DIR ..."

# Remove any previous skill directory entirely. Handles stale files from older
# versions (e.g. if a future release adds extra files alongside SKILL.md, an
# older install must not be left mixed in).
if [[ -e "$SKILL_DIR" || -L "$SKILL_DIR" ]]; then
    echo "  cleaning   $SKILL_DIR (previous install)"
    rm -rf "$SKILL_DIR"
fi
mkdir -p "$SKILL_DIR" "$COMMANDS_DIR"

# Remove any previous versions of the three named command files (handles both
# regular files and symlinks left by a prior --symlink install).
for cmd in rust-audit.md rust-fix.md rust-plan.md; do
    cmd_path="$COMMANDS_DIR/$cmd"
    if [[ -e "$cmd_path" || -L "$cmd_path" ]]; then
        echo "  cleaning   $cmd_path (previous install)"
        rm -f "$cmd_path"
    fi
done

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
