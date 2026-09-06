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

OWNED=("$SKILL_DIR" "$COMMANDS_DIR/rust-cc-audit.md" "$COMMANDS_DIR/rust-cc-fix.md" "$COMMANDS_DIR/rust-cc-plan.md" "$NS_DIR" \
    "$COMMANDS_DIR/rust-audit.md" "$COMMANDS_DIR/rust-fix.md" "$COMMANDS_DIR/rust-plan.md" "$COMMANDS_DIR/rust-intel.md")

TX_PARENT="$(dirname "$CLAUDE_DIR")"
mkdir -p "$TX_PARENT"
recover_transaction() {
    local tx="$1" journal="$1/journal" kind index status original destination backup
    [[ -f "$journal" ]] || { echo "Error: unfinished uninstall transaction has no journal; recover manually from $tx." >&2; return 1; }
    local phase="$(awk '$1 == "phase" { print $2; exit }' "$journal")"
    if [[ "$phase" == committed || "$phase" == rolled-back ]]; then rm -rf -- "$tx"; return; fi
    while read -r kind index status original; do
        [[ "$kind" != phase ]] || continue
        [[ "$kind" == record ]] || continue
        destination="${OWNED[$index]}"
        backup="$tx/backup/$index"
        if [[ -e "$backup" || -L "$backup" ]]; then
            if [[ ! -e "$destination" && ! -L "$destination" ]]; then
                mkdir -p -- "$(dirname "$destination")" && mv -- "$backup" "$destination" || return 1
            else
                echo "Error: unfinished uninstall has both destination and backup: $destination (recover from $tx)." >&2
                return 1
            fi
        elif [[ "$status" == backing-up ]]; then
            echo "Error: unfinished uninstall backup is incomplete: $destination (recover from $tx)." >&2
            return 1
        fi
    done < "$journal"
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
RECORD_STATUS=()
RECORD_ORIGINAL=()
for index in ${!OWNED[@]}; do
    RECORD_STATUS[$index]=pending
    if [[ -e "${OWNED[$index]}" || -L "${OWNED[$index]}" ]]; then RECORD_ORIGINAL[$index]=1; else RECORD_ORIGINAL[$index]=0; fi
done
JOURNAL="$TX_DIR/journal"
write_journal() {
    local phase="$1" temporary="$JOURNAL.tmp"
    {
        printf 'version 1\nphase %s\n' "$phase"
        local index
        for index in ${!OWNED[@]}; do printf 'record %s %s %s\n' "$index" "${RECORD_STATUS[$index]}" "${RECORD_ORIGINAL[$index]}"; done
    } > "$temporary"
    mv -- "$temporary" "$JOURNAL"
}
write_journal prepared

rollback_uninstall() {
    local status=$?
    set +e
    local rollback_failure=0
    if [[ "$ROLLBACK_NEEDED" -eq 1 ]]; then
        local index destination
        index=$((BACKUP_COUNT - 1))
        while [[ "$index" -ge 0 ]]; do
            destination="${BACKUP_DESTS[$index]}"
            if [[ -e "$destination" || -L "$destination" ]]; then
                rollback_failure=1
            elif [[ -e "${BACKUP_PATHS[$index]}" || -L "${BACKUP_PATHS[$index]}" ]]; then
                mkdir -p -- "$(dirname "$destination")" && mv -- "${BACKUP_PATHS[$index]}" "$destination" || rollback_failure=1
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

BACKUP_ROOT="$TX_DIR/backup"
mkdir -p "$BACKUP_ROOT"
backup_owned() {
    local destination="$1"
    if [[ -e "$destination" || -L "$destination" ]]; then
        BACKUP_DESTS[$BACKUP_COUNT]="$destination"
        BACKUP_PATHS[$BACKUP_COUNT]="$BACKUP_ROOT/$BACKUP_COUNT"
        local index="$BACKUP_COUNT" owned_index
        for owned_index in ${!OWNED[@]}; do [[ "${OWNED[$owned_index]}" == "$destination" ]] && break; done
        RECORD_STATUS[$owned_index]=backing-up
        write_journal active
        mv -- "$destination" "${BACKUP_PATHS[$BACKUP_COUNT]}"
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
write_journal committed
rm -rf -- "$TX_DIR"
ROLLBACK_NEEDED=0
trap - EXIT

echo ""
if [[ "$removed_any" -eq 0 ]]; then
    echo "Nothing to remove - rust-intel is not installed at $CLAUDE_DIR."
else
    echo "Done. rust-intel skill and slash commands are uninstalled."
fi
