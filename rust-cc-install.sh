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
# Keep every derived operand absolute. This also makes a relative, dash-leading override such as
# `CLAUDE_CONFIG_DIR=-config` an ordinary path rather than an option to a POSIX utility.
case "$CLAUDE_DIR" in
    /*) ;;
    *) CLAUDE_DIR="$(pwd)/$CLAUDE_DIR" ;;
esac

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

# Portable canonical-path resolution for a possibly-not-yet-existing path. Deliberately does NOT
# use `realpath -m` — that flag is GNU coreutils-specific and is absent on stock macOS/BSD
# `realpath` and on minimal/BusyBox environments, both of which this script is advertised for.
#
# Runs physical resolution and lexical normalization to a FIXPOINT rather than once each, because
# the two steps feed each other: collapsing a `missing/..` pair can expose a component that was
# unreachable during the physical walk (nothing can be traversed *through* a nonexistent
# directory), and if that newly-exposed component is a symlink it would otherwise be returned
# unresolved — letting `<somewhere>/missing/../link` compare as an unrelated path while the kernel
# follows `link` straight into the source tree. Each iteration either converges or resolves at
# least one more symlink, so the loop terminates; the iteration cap is a backstop for symlink
# cycles (which `cd` would also reject, but not portably enough to rely on).
canonical_candidate() {
    local target="$1"
    case "$target" in
        /*) : ;;
        *) target="$(pwd)/$target" ;;
    esac
    local iteration=0
    while :; do
        iteration=$((iteration + 1))
        if [[ "$iteration" -gt 64 ]]; then
            echo "Error: could not canonicalize '$1' (symlink cycle?)." >&2
            exit 1
        fi
        # Walk to the nearest existing *directory* ancestor. `-d` rather than `-e` so a plain file
        # in the path never becomes a `cd` target (that would abort the script under `set -e`).
        local probe="$target" tail=""
        while [[ ! -d "$probe" ]]; do
            local base parent
            base="$(basename "$probe")"
            if [[ -z "$tail" ]]; then tail="$base"; else tail="$base/$tail"; fi
            parent="$(dirname "$probe")"
            if [[ "$parent" == "$probe" ]]; then break; fi
            probe="$parent"
        done
        local resolved
        if ! resolved="$(cd "$probe" 2>/dev/null && pwd -P)"; then
            resolved="$probe"
        fi
        local candidate
        if [[ -z "$tail" ]]; then
            candidate="$resolved"
        else
            candidate="$(normalize_path_components "$resolved" "$tail")"
        fi
        if [[ "$candidate" == "$target" ]]; then
            echo "$candidate"
            return
        fi
        target="$candidate"
    done
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
if [[ -n "${RUST_INTEL_INSTALL_FAIL_AFTER:-}" && ! "${RUST_INTEL_INSTALL_FAIL_AFTER}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: RUST_INTEL_INSTALL_FAIL_AFTER must be a positive integer." >&2
    exit 1
fi

# Build and validate the complete replacement beside the destination first. The old install is
# moved to a backup only after every source file is known and copied successfully.
TX_PARENT="$(dirname "$CLAUDE_DIR")"
mkdir -p "$TX_PARENT"
recover_transaction() {
    local tx="$1" journal="$1/journal" phase kind index status original destination backup
    [[ -f "$journal" ]] || { echo "Error: unfinished installer transaction has no journal; recover manually from $tx." >&2; return 1; }
    phase="$(awk '$1 == "phase" { print $2; exit }' "$journal")"
    if [[ "$phase" == committed || "$phase" == rolled-back ]]; then rm -rf -- "$tx"; return; fi
    while read -r kind index status original; do
        [[ "$kind" != phase ]] || continue
        [[ "$kind" == record ]] || continue
        destination="${OWNED[$index]}"
        backup="$tx/backup/$index"
        if [[ -e "$backup" || -L "$backup" ]]; then
            if [[ ( "$status" == installed || "$status" == installing ) && ( -e "$destination" || -L "$destination" ) ]]; then
                rm -rf -- "$destination" || return 1
            fi
            if [[ ! -e "$destination" && ! -L "$destination" ]]; then
                mkdir -p -- "$(dirname "$destination")" && mv -- "$backup" "$destination" || return 1
            else
                echo "Error: unfinished transaction has both destination and backup: $destination (recover from $tx)." >&2
                return 1
            fi
        elif [[ ( "$status" == installed || "$status" == installing ) && "$original" == 0 && ( -e "$destination" || -L "$destination" ) ]]; then
            rm -rf -- "$destination" || return 1
        elif [[ "$status" == backing-up ]]; then
            echo "Error: unfinished transaction backup is incomplete: $destination (recover from $tx)." >&2
            return 1
        fi
    done < "$journal"
    rm -rf -- "$tx"
}

OWNED=("$SKILL_DIR" "$COMMANDS_DIR/rust-cc-audit.md" "$COMMANDS_DIR/rust-cc-fix.md" "$COMMANDS_DIR/rust-cc-plan.md" "$NS_DIR" \
    "$COMMANDS_DIR/rust-audit.md" "$COMMANDS_DIR/rust-fix.md" "$COMMANDS_DIR/rust-plan.md" "$COMMANDS_DIR/rust-intel.md")
for pending in "$TX_PARENT"/.rust-intel-bash-tx.*; do
    [[ -d "$pending" ]] || continue
    recover_transaction "$pending"
done

TX_DIR="$(mktemp -d "$TX_PARENT/.rust-intel-bash-tx.XXXXXX")"
STAGE_ROOT="$TX_DIR/stage"
BACKUP_ROOT="$TX_DIR/backup"
JOURNAL="$TX_DIR/journal"
mkdir -p "$STAGE_ROOT" "$BACKUP_ROOT"
write_journal() {
    local phase="$1" temporary="$JOURNAL.tmp"
    {
        printf 'version 1\nphase %s\n' "$phase"
        local index
        for index in ${!OWNED[@]}; do
            printf 'record %s %s %s\n' "$index" "${RECORD_STATUS[$index]}" "${RECORD_ORIGINAL[$index]}"
        done
    } > "$temporary"
    mv -- "$temporary" "$JOURNAL"
}

ROLLBACK_NEEDED=1
BACKUP_COUNT=0
REPLACE_COUNT=0
BACKUP_DESTS=()
BACKUP_PATHS=()
BACKUP_INDICES=()
RECORD_STATUS=()
RECORD_ORIGINAL=()
for index in ${!OWNED[@]}; do
    RECORD_STATUS[$index]=pending
    if [[ -e "${OWNED[$index]}" || -L "${OWNED[$index]}" ]]; then RECORD_ORIGINAL[$index]=1; else RECORD_ORIGINAL[$index]=0; fi
done
write_journal prepared

rollback_transaction() {
    local status=$?
    set +e
    if [[ "$ROLLBACK_NEEDED" -eq 1 ]]; then
        local destination
        local index destination owned_index rollback_failure=0
        index=$((BACKUP_COUNT - 1))
        while [[ "$index" -ge 0 ]]; do
            destination="${BACKUP_DESTS[$index]}"
            owned_index="${BACKUP_INDICES[$index]}"
            if [[ -e "$destination" || -L "$destination" ]]; then
                if [[ "${RECORD_STATUS[$owned_index]}" == installed ]]; then rm -rf -- "$destination" || rollback_failure=1; fi
            fi
            if [[ ! -e "$destination" && ! -L "$destination" ]]; then
                mkdir -p -- "$(dirname "$destination")" && mv -- "${BACKUP_PATHS[$index]}" "$destination" || rollback_failure=1
            fi
            index=$((index - 1))
        done
    fi
    if [[ "$rollback_failure" -ne 0 ]]; then
        echo "Installer rollback incomplete; transaction retained for recovery: $TX_DIR" >&2
    else
        write_journal rolled-back || true
        rm -rf -- "$TX_DIR"
    fi
    trap - EXIT
    exit "$status"
}
trap rollback_transaction EXIT

if [[ ! -f "$REPO_DIR/skill/SKILL.md" ]]; then
    echo "Error: source skill/SKILL.md disappeared during staging." >&2
    exit 1
fi
for command_name in audit fix plan; do
    if [[ ! -f "$REPO_DIR/commands/rust-intel-cc/$command_name.md" ]]; then
        echo "Error: source command $command_name.md is missing." >&2
        exit 1
    fi
done

install_file() {
    local src="$1" dst="$2"
    mkdir -p "$(dirname "$dst")"
    if [[ "$USE_SYMLINK" -eq 1 ]]; then ln -sf "$src" "$dst"; else cp -f "$src" "$dst"; fi
}

while IFS= read -r -d '' skill_file; do
    relative="${skill_file#"$REPO_DIR/skill/"}"
    install_file "$skill_file" "$STAGE_ROOT/skill/$relative"
done < <(find "$REPO_DIR/skill" -type f \( -name '*.md' -o -name '*.js' \) -print0)
for command_name in audit fix plan; do
    install_file "$REPO_DIR/commands/rust-intel-cc/$command_name.md" "$STAGE_ROOT/commands/rust-cc-$command_name.md"
done

# Validate stage completeness before touching the live installation.
while IFS= read -r -d '' source_file; do
    relative="${source_file#"$REPO_DIR/skill/"}"
    staged_file="$STAGE_ROOT/skill/$relative"
    [[ -f "$staged_file" ]] || { echo "Error: staged skill file is missing: $relative" >&2; exit 1; }
    if [[ "$USE_SYMLINK" -eq 0 ]] && ! cmp -s "$source_file" "$staged_file"; then
        echo "Error: staged skill file differs from source: $relative" >&2
        exit 1
    fi
done < <(find "$REPO_DIR/skill" -type f \( -name '*.md' -o -name '*.js' \) -print0)

backup_owned() {
    local destination="$1"
    if [[ -e "$destination" || -L "$destination" ]]; then
        BACKUP_DESTS[$BACKUP_COUNT]="$destination"
        BACKUP_PATHS[$BACKUP_COUNT]="$BACKUP_ROOT/$BACKUP_COUNT"
        local index="$BACKUP_COUNT"
        local owned_index
        for owned_index in ${!OWNED[@]}; do
            [[ "${OWNED[$owned_index]}" == "$destination" ]] && break
        done
        BACKUP_INDICES[$index]="$owned_index"
        RECORD_STATUS[$index]=backing-up
        write_journal active
        mv -- "$destination" "${BACKUP_PATHS[$BACKUP_COUNT]}"
        RECORD_STATUS[$index]=backed-up
        write_journal active
        BACKUP_COUNT=$((BACKUP_COUNT + 1))
    fi
}
for index in ${!OWNED[@]}; do
    backup_owned "${OWNED[$index]}"
done

mkdir -p "$CLAUDE_DIR/skills" "$COMMANDS_DIR"
RECORD_STATUS[0]=installing; write_journal active
mv -- "$STAGE_ROOT/skill" "$SKILL_DIR"
RECORD_STATUS[0]=installed; write_journal active
REPLACE_COUNT=$((REPLACE_COUNT + 1))
if [[ "${RUST_INTEL_INSTALL_FAIL_AFTER:-}" =~ ^[1-9][0-9]*$ && "$REPLACE_COUNT" -eq "$RUST_INTEL_INSTALL_FAIL_AFTER" ]]; then
    echo "Error: injected installer failure after replacement $REPLACE_COUNT." >&2
    exit 1
fi
for command_name in audit fix plan; do
    command_index=$REPLACE_COUNT
    RECORD_STATUS[$command_index]=installing; write_journal active
    mv -- "$STAGE_ROOT/commands/rust-cc-$command_name.md" "$COMMANDS_DIR/rust-cc-$command_name.md"
    RECORD_STATUS[$command_index]=installed; write_journal active
    REPLACE_COUNT=$((REPLACE_COUNT + 1))
    if [[ "${RUST_INTEL_INSTALL_FAIL_AFTER:-}" =~ ^[1-9][0-9]*$ && "$REPLACE_COUNT" -eq "$RUST_INTEL_INSTALL_FAIL_AFTER" ]]; then
        echo "Error: injected installer failure after replacement $REPLACE_COUNT." >&2
        exit 1
    fi
done

write_journal committed
rm -rf -- "$TX_DIR"
ROLLBACK_NEEDED=0
trap - EXIT

echo ""
echo "Done. Verify by starting 'claude' in this directory and trying:"
echo "  /rust-cc-audit"
echo "  /rust-cc-fix  <error message>"
echo "  /rust-cc-plan <task description>"
echo ""
echo "The skill 'rust-intel' will activate automatically on any Rust task."
