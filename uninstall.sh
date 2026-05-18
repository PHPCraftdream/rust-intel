#!/usr/bin/env bash
# Removes the rust-intel skill and the /rust-intel-cc:* commands.
# Inverse of install.sh.
#
# Default target: ./.claude/ of the current working directory (project-local).
# Pass --user to remove from the user-global ~/.claude/ instead.
# CLAUDE_CONFIG_DIR env var (if set) overrides everything.

set -euo pipefail

USE_USER=0
for arg in "$@"; do
    case "$arg" in
        --user) USE_USER=1 ;;
        --help|-h)
            cat <<EOF
Usage: ./uninstall.sh [--user]

Default target (no flags): \$PWD/.claude/  (the current working directory).
With --user:               \$HOME/.claude/  (user-global).
If \$CLAUDE_CONFIG_DIR is set, it overrides both.

Removes (only the files install.sh creates):
  <target>/skills/rust-intel/                      (entire directory)
  <target>/commands/rust-intel-cc/                 (entire directory)
  <target>/commands/{rust-audit,rust-fix,rust-plan,rust-intel}.md   (legacy v0.1.x flat layout)

Other skills and commands under <target> are not touched.

Options:
  --user      Remove from \$HOME/.claude/ instead of \$PWD/.claude/.
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

echo "Uninstalling rust-intel from $CLAUDE_DIR ..."

removed_any=0

if [[ -e "$SKILL_DIR" || -L "$SKILL_DIR" ]]; then
    rm -rf "$SKILL_DIR"
    echo "  removed    $SKILL_DIR"
    removed_any=1
fi

if [[ -e "$NS_DIR" || -L "$NS_DIR" ]]; then
    rm -rf "$NS_DIR"
    echo "  removed    $NS_DIR"
    removed_any=1
fi

# Includes the legacy flat layout from v0.1.x.
for legacy in rust-audit.md rust-fix.md rust-plan.md rust-intel.md; do
    legacy_path="$COMMANDS_DIR/$legacy"
    if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
        rm -f "$legacy_path"
        echo "  removed    $legacy_path (legacy v0.1.x layout)"
        removed_any=1
    fi
done

echo ""
if [[ "$removed_any" -eq 0 ]]; then
    echo "Nothing to remove - rust-intel is not installed at $CLAUDE_DIR."
else
    echo "Done. rust-intel skill and slash commands are uninstalled."
fi
