#!/usr/bin/env bash
# Removes the rust-intel skill and the three named slash commands from ~/.claude/.
# Inverse of install.sh. Only touches paths that install.sh creates — other
# skills and commands under ~/.claude/ are untouched.

set -euo pipefail

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SKILL_DIR="$CLAUDE_DIR/skills/rust-intel"
COMMANDS_DIR="$CLAUDE_DIR/commands"

for arg in "$@"; do
    case "$arg" in
        --help|-h)
            cat <<EOF
Usage: ./uninstall.sh

Removes (only the files install.sh creates):
  $SKILL_DIR/             (the entire skill directory)
  $COMMANDS_DIR/rust-audit.md
  $COMMANDS_DIR/rust-fix.md
  $COMMANDS_DIR/rust-plan.md

Other skills and commands under \$CLAUDE_CONFIG_DIR are not touched.

Environment:
  CLAUDE_CONFIG_DIR   Override the default ~/.claude location.
EOF
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg (try --help)" >&2
            exit 1
            ;;
    esac
done

echo "Uninstalling rust-intel from $CLAUDE_DIR ..."

removed_any=0

if [[ -e "$SKILL_DIR" || -L "$SKILL_DIR" ]]; then
    rm -rf "$SKILL_DIR"
    echo "  removed    $SKILL_DIR"
    removed_any=1
fi

for cmd in rust-audit.md rust-fix.md rust-plan.md; do
    cmd_path="$COMMANDS_DIR/$cmd"
    if [[ -e "$cmd_path" || -L "$cmd_path" ]]; then
        rm -f "$cmd_path"
        echo "  removed    $cmd_path"
        removed_any=1
    fi
done

echo ""
if [[ "$removed_any" -eq 0 ]]; then
    echo "Nothing to remove — rust-intel is not installed at $CLAUDE_DIR."
else
    echo "Done. rust-intel skill and slash commands are uninstalled."
fi
