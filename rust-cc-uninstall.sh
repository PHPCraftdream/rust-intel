#!/usr/bin/env bash
# Removes the rust-intel skill and the /rust-cc-* commands.
# Inverse of rust-cc-install.sh. Sweeps every known historical layout (v0.1.x,
# v0.2.0, v0.2.1+) so this script is safe to run regardless of which version
# was used to install.
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
Usage: ./rust-cc-uninstall.sh [--user]

Default target (no flags): \$PWD/.claude/  (the current working directory).
With --user:               \$HOME/.claude/  (user-global).
If \$CLAUDE_CONFIG_DIR is set, it overrides both.

Removes (every known historical layout):
  <target>/skills/rust-intel/                                          (entire directory)
  <target>/commands/rust-cc-{audit,fix,plan}.md                        (v0.2.1+ flat-with-prefix)
  <target>/commands/rust-intel-cc/                                     (v0.2.0 namespace dir)
  <target>/commands/{rust-audit,rust-fix,rust-plan,rust-intel}.md      (legacy v0.1.x flat layout)

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
case "$CLAUDE_DIR" in
    /*) ;;
    *) CLAUDE_DIR="$(pwd)/$CLAUDE_DIR" ;;
esac

SKILL_DIR="$CLAUDE_DIR/skills/rust-intel"
COMMANDS_DIR="$CLAUDE_DIR/commands"
NS_DIR="$COMMANDS_DIR/rust-intel-cc"

echo "Uninstalling rust-intel from $CLAUDE_DIR ..."
if [[ -n "${RUST_INTEL_INSTALL_FAIL_AFTER:-}" && ! "${RUST_INTEL_INSTALL_FAIL_AFTER}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: RUST_INTEL_INSTALL_FAIL_AFTER must be a positive integer." >&2
    exit 1
fi

abrupt_abort() {
    if [[ "${RUST_INTEL_INSTALL_ABORT_AT:-}" == "$1" ]]; then exit 86; fi
    return 0
}

OWNED=("$SKILL_DIR" "$COMMANDS_DIR/rust-cc-audit.md" "$COMMANDS_DIR/rust-cc-fix.md" "$COMMANDS_DIR/rust-cc-plan.md" "$NS_DIR" \
    "$COMMANDS_DIR/rust-audit.md" "$COMMANDS_DIR/rust-fix.md" "$COMMANDS_DIR/rust-plan.md" "$COMMANDS_DIR/rust-intel.md")

TX_PARENT="$(dirname "$CLAUDE_DIR")"
mkdir -p "$TX_PARENT"
recover_transaction() {
    local tx="$1" journal="$1/journal" kind index status original destination backup
    # The journal is published before any live path is moved.  A transaction without one is
    # therefore provably pre-live and can be discarded safely.
    [[ -f "$journal" ]] || { rm -rf -- "$tx"; return; }
    local version="$(awk '$1 == "version" { print $2; exit }' "$journal")"
    [[ "$version" == 1 ]] || { echo "Error: invalid uninstall transaction journal version (recover from $tx)." >&2; return 1; }
    local phase="$(awk '$1 == "phase" { print $2; exit }' "$journal")"
    [[ "$phase" == prepared || "$phase" == active || "$phase" == committed || "$phase" == rolled-back || "$phase" == rollback-failed ]] || { echo "Error: invalid uninstall transaction phase (recover from $tx)." >&2; return 1; }
    local record_count=0
    local -a seen=()
    while IFS=$'\t' read -r kind index status original destination; do
        [[ "$kind" != phase ]] || continue
        [[ "$kind" == record ]] || continue
        [[ "$index" =~ ^[0-9]+$ && "$index" -lt "${#OWNED[@]}" && -z "${seen[$index]:-}" ]] || { echo "Error: invalid uninstall transaction record index (recover from $tx)." >&2; return 1; }
        [[ "$destination" == "${OWNED[$index]}" && ( "$status" == pending || "$status" == backing-up || "$status" == backed-up ) && ( "$original" == 0 || "$original" == 1 ) ]] || { echo "Error: invalid uninstall transaction record (recover from $tx)." >&2; return 1; }
        seen[$index]=1
        record_count=$((record_count + 1))
        destination="${OWNED[$index]}"
        backup="$tx/backup/$index"
        if [[ "$phase" == committed || "$phase" == rolled-back ]]; then continue; fi
        if [[ "$status" == backing-up && ! -e "$backup" && ! -L "$backup" && ( -e "$destination" || -L "$destination" ) ]]; then
            # The journal is written before rename; destination-present/backup-absent proves that
            # the rename did not happen.  Preserve the unbacked destination.
            continue
        elif [[ -e "$backup" || -L "$backup" ]]; then
            if [[ ! -e "$destination" && ! -L "$destination" ]]; then
                mkdir -p -- "$(dirname "$destination")" && mv -- "$backup" "$destination" || return 1
            else
                echo "Error: unfinished uninstall has both destination and backup: $destination (recover from $tx)." >&2
                return 1
            fi
        elif [[ "$status" == backed-up || ( "$status" == backing-up && ! -e "$destination" && ! -L "$destination" ) ]]; then
            echo "Error: unfinished uninstall backup is incomplete: $destination (recover from $tx)." >&2
            return 1
        fi
    done < "$journal"
    [[ "$record_count" -eq "${#OWNED[@]}" ]] || { echo "Error: uninstall transaction record count does not match owned inventory (recover from $tx)." >&2; return 1; }
    if [[ "$phase" == committed || "$phase" == rolled-back ]]; then rm -rf -- "$tx"; return; fi
    rm -rf -- "$tx"
}
for pending in "$TX_PARENT"/.rust-intel-bash-uninstall.*; do
    [[ -d "$pending" ]] || continue
    recover_transaction "$pending"
done

TX_DIR="$(mktemp -d "$TX_PARENT/.rust-intel-bash-uninstall.XXXXXX")"
ROLLBACK_NEEDED=1
BACKUP_COUNT=0
BACKUP_DESTS=()
BACKUP_PATHS=()
BACKUP_INDICES=()
RECORD_STATUS=()
RECORD_ORIGINAL=()
for index in ${!OWNED[@]}; do
    RECORD_STATUS[$index]=pending
    if [[ -e "${OWNED[$index]}" || -L "${OWNED[$index]}" ]]; then RECORD_ORIGINAL[$index]=1; else RECORD_ORIGINAL[$index]=0; fi
done
JOURNAL="$TX_DIR/journal"
write_journal() {
    local phase="$1" temporary="$JOURNAL.tmp"
    abrupt_abort before-journal
    {
        printf 'version 1\nphase %s\n' "$phase"
        local index
        for index in ${!OWNED[@]}; do printf 'record\t%s\t%s\t%s\t%s\n' "$index" "${RECORD_STATUS[$index]}" "${RECORD_ORIGINAL[$index]}" "${OWNED[$index]}"; done
    } > "$temporary"
    mv -- "$temporary" "$JOURNAL"
    abrupt_abort after-journal
}
write_journal prepared
BACKUP_ROOT="$TX_DIR/backup"
mkdir -p "$BACKUP_ROOT"

rollback_uninstall() {
    local status=$?
    set +e
    local rollback_failure=0
    if [[ "$ROLLBACK_NEEDED" -eq 1 ]]; then
        local index destination
        index=$((BACKUP_COUNT - 1))
        while [[ "$index" -ge 0 ]]; do
            destination="${BACKUP_DESTS[$index]}"
            owned_index="${BACKUP_INDICES[$index]:-$index}"
            backup="${BACKUP_PATHS[$index]}"
            if [[ -e "$destination" || -L "$destination" ]]; then
                rollback_failure=1
            elif [[ -e "$backup" || -L "$backup" ]]; then
                abrupt_abort "before-rollback-$owned_index"; mkdir -p -- "$(dirname "$destination")" && mv -- "$backup" "$destination" || rollback_failure=1; abrupt_abort "after-rollback-$owned_index"
            elif [[ "${RECORD_STATUS[$owned_index]}" == backed-up ]]; then
                rollback_failure=1
            fi
            index=$((index - 1))
        done
    fi
    if [[ "$rollback_failure" -ne 0 ]]; then
        echo "Uninstall rollback incomplete; transaction retained for recovery: $TX_DIR" >&2
    else
        write_journal rolled-back || true
        rm -rf -- "$TX_DIR"
    fi
    trap - EXIT
    exit "$status"
}
trap rollback_uninstall EXIT

backup_owned() {
    local destination="$1"
    if [[ -e "$destination" || -L "$destination" ]]; then
        BACKUP_DESTS[$BACKUP_COUNT]="$destination"
        local index="$BACKUP_COUNT" owned_index
        for owned_index in ${!OWNED[@]}; do [[ "${OWNED[$owned_index]}" == "$destination" ]] && break; done
        [[ "$owned_index" -lt "${#OWNED[@]}" ]] || { echo "Error: destination is outside owned inventory: $destination" >&2; return 1; }
        BACKUP_PATHS[$BACKUP_COUNT]="$BACKUP_ROOT/$owned_index"
        BACKUP_INDICES[$index]="$owned_index"
        RECORD_STATUS[$owned_index]=backing-up
        abrupt_abort "before-backup-$owned_index"
        write_journal active
        abrupt_abort "after-backup-journal-$owned_index"
        mv -- "$destination" "${BACKUP_PATHS[$BACKUP_COUNT]}"
        abrupt_abort "after-backup-rename-$owned_index"
        RECORD_STATUS[$owned_index]=backed-up
        write_journal active
        BACKUP_COUNT=$((BACKUP_COUNT + 1))
    fi
}

for index in ${!OWNED[@]}; do
    backup_owned "${OWNED[$index]}"
done

if [[ "${RUST_INTEL_INSTALL_FAIL_AFTER:-}" =~ ^[1-9][0-9]*$ && "$BACKUP_COUNT" -ge "$RUST_INTEL_INSTALL_FAIL_AFTER" ]]; then
    echo "Error: injected uninstall failure after $BACKUP_COUNT owned paths." >&2
    exit 1
fi

removed_any=0
if [[ "$BACKUP_COUNT" -gt 0 ]]; then removed_any=1; fi
abrupt_abort before-commit; write_journal committed; abrupt_abort after-commit
abrupt_abort before-cleanup
rm -rf -- "$TX_DIR"
abrupt_abort after-cleanup
ROLLBACK_NEEDED=0
trap - EXIT

echo ""
if [[ "$removed_any" -eq 0 ]]; then
    echo "Nothing to remove - rust-intel is not installed at $CLAUDE_DIR."
else
    echo "Done. rust-intel skill and slash commands are uninstalled."
fi
