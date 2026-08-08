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
Usage: ./rust-cc-install.sh [--user] [--symlink]

Default target (no flags): \$PWD/.claude/  (the current working directory).
With --user:               \$HOME/.claude/  (user-global).
If \$CLAUDE_CONFIG_DIR is set, it overrides both.

Installs the modular skill (the single-file rust-intel.md reference is NOT installed):
  skill/**/*.md + **/*.js (SKILL.md + theme modules + workflow + references) -> <target>/skills/rust-intel/
  commands/rust-intel-cc/audit.md         -> <target>/commands/rust-cc-audit.md
  commands/rust-intel-cc/fix.md           -> <target>/commands/rust-cc-fix.md
  commands/rust-intel-cc/plan.md          -> <target>/commands/rust-cc-plan.md

Slash commands after install:
  /rust-cc-audit   /rust-cc-fix   /rust-cc-plan

Sweeps any previous install at the same target before copying:
  <target>/skills/rust-intel/                                          (entire directory, incl. any previous monolithic SKILL.md)
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

if [[ ! -f "$REPO_DIR/skill/SKILL.md" ]]; then
    echo "Error: skill/SKILL.md not found at $REPO_DIR/skill. The installer must live alongside the skill/ directory." >&2
    exit 1
fi

# Collapse `.` and `..` components in a slash-separated tail against an absolute base path,
# printing the normalized absolute result. Passes the base and tail as plain strings (not
# array-by-reference / namerefs) and avoids negative array indices — both are bash-4.3+ features
# absent from the bash 3.2 that stock macOS still ships as /bin/bash. Used below to normalize the
# re-appended missing tail so the overlap guard compares the same normalized path that
# `mkdir -p`/`find`/the kernel will later actually operate on — an unnormalized tail (e.g. a
# missing directory followed by `..`) can lexically walk back INTO an already-resolved prefix
# while the plain string still looks like an unrelated sibling path.
normalize_path_components() {
    local base="$1" rest="$2"
    local -a stack=()
    local -a parts
    local old_ifs="$IFS"
    IFS='/'
    read -ra parts <<< "$base"
    IFS="$old_ifs"
    local p
    for p in ${parts[@]+"${parts[@]}"}; do
        [[ -n "$p" ]] && stack+=("$p")
    done
    local comp
    while [[ -n "$rest" ]]; do
        comp="${rest%%/*}"
        if [[ "$comp" == "$rest" ]]; then rest=""; else rest="${rest#*/}"; fi
        case "$comp" in
            ""|.) : ;;
            ..)
                if [[ ${#stack[@]} -gt 0 ]]; then unset "stack[$((${#stack[@]} - 1))]"; fi
                ;;
            *) stack+=("$comp") ;;
        esac
    done
    if [[ ${#stack[@]} -eq 0 ]]; then
        printf '/'
        return
    fi
    local out="" s
    for s in ${stack[@]+"${stack[@]}"}; do out="$out/$s"; done
    printf '%s' "$out"
}

# Portable canonical-path resolution for a possibly-not-yet-existing path: resolve the nearest
# existing ancestor via `cd + pwd -P` (POSIX, no GNU-only flags), then normalize the missing tail
# against that ancestor's own components (above) before re-appending it. Deliberately does NOT use
# `realpath -m` — that flag is GNU coreutils-specific and is absent on stock macOS/BSD `realpath`
# and on minimal/BusyBox environments, both of which this script is advertised for.
canonical_candidate() {
    local target="$1"
    case "$target" in
        /*) : ;;
        *) target="$(pwd)/$target" ;;
    esac
    local tail=""
    while [[ ! -e "$target" ]]; do
        local base
        base="$(basename "$target")"
        if [[ -z "$tail" ]]; then tail="$base"; else tail="$base/$tail"; fi
        local parent
        parent="$(dirname "$target")"
        if [[ "$parent" == "$target" ]]; then break; fi
        target="$parent"
    done
    local resolved
    resolved="$(cd "$target" && pwd -P)"
    if [[ -z "$tail" ]]; then
        echo "$resolved"
    else
        normalize_path_components "$resolved" "$tail"
        echo
    fi
}

SOURCE_REAL="$(canonical_candidate "$REPO_DIR/skill")"
DEST_REAL="$(canonical_candidate "$SKILL_DIR")"
case "$DEST_REAL/" in
    "$SOURCE_REAL/"*) echo "Error: destination must not be inside the source skill directory." >&2; exit 1 ;;
esac
case "$SOURCE_REAL/" in
    "$DEST_REAL/"*) echo "Error: source skill directory must not be inside the destination." >&2; exit 1 ;;
esac
COMMANDS_SOURCE_REAL="$(canonical_candidate "$REPO_DIR/commands/rust-intel-cc")"
COMMANDS_DEST_REAL="$(canonical_candidate "$COMMANDS_DIR")"
case "$COMMANDS_DEST_REAL/" in
    "$COMMANDS_SOURCE_REAL/"*) echo "Error: destination commands directory must not be inside the source commands directory." >&2; exit 1 ;;
esac
case "$COMMANDS_SOURCE_REAL/" in
    "$COMMANDS_DEST_REAL/"*) echo "Error: source commands directory must not be inside the destination commands directory." >&2; exit 1 ;;
esac

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

while IFS= read -r -d '' skill_file; do
    relative="${skill_file#"$REPO_DIR/skill/"}"
    destination="$SKILL_DIR/$relative"
    mkdir -p "$(dirname "$destination")"
    install_file "$skill_file" "$destination"
done < <(find "$REPO_DIR/skill" -type f \( -name '*.md' -o -name '*.js' \) -print0)
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
