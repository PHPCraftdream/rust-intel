# Round 36 review of the latest commits and v0.7.0 release readiness — 2026-09-07 01:39 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`).
- Reviewed head: `b47634785911fe3b4254a2a5541ff7c733a3a219`.
- Commit window: `origin/main..HEAD` — forty-eight commits, thirty-two changed files,
  `+6433/-632` before this report, inspected in an isolated linked worktree.
- Round 35 was read in full. Its three P2 and five P3 findings were traced through `3fd68fa`,
  `992f734`, `64295f9`, and `b476347`, then challenged at delimiter-budget, private-name,
  completion-provenance, transaction-journal, sparse-inventory, restart, and CI-oracle boundaries.
- One complete timed `npm run validate` ran. Bounded checks covered the shared lexer and completion
  scanner, Node and PowerShell abrupt restart, Bash transaction entry, release crash calibration,
  JavaScript and shell syntax, actionlint, mirror/package/version state, action pins, tags, and
  registry publication state.
- No product, version, tag, package, workflow run, or remote ref was changed. This report and its
  Open ledger row are the only authored changes.

## Executive result

- **No P0 finding.**
- **One P1, two P2, and four P3 findings remain.** The new Bash abort hook makes both advertised
  Bash scripts exit at their first journal boundary during an ordinary run. Node and PowerShell
  restart recovery still blocks after a replacement rename, Node publishes a structurally invalid
  empty-record journal at one abort boundary, and Bash still stores sparse backups under compact
  rather than owned-record indices.
- The shared lexer now rejects mismatched closers in constant stack work and preserves the sampled
  private keyword-name role. Completion enforcement catches the added assignment/grouping samples,
  but it does not implement its stated canonical-reference rule: sequence, array, object, and
  argument references can still invoke the helper with literal `true` without a diagnostic.
- CI samples only one pre-rename backup state per installer and does not exercise replacement-rename
  recovery or Node/Bash uninstall restart. The separate 48-boundary release calibration accepts any
  nonzero child status rather than proving its abort hook returned 86. Current README, changelog,
  and ledger prose consequently overstate installer closure.
- `npm run validate` exited 0 in **239.433 seconds** on Node `v24.12.0` / npm `11.13.0`, checking
  twelve skill Markdown files and the nested **409-control** fixture suite. The release calibration
  passed its reported 48 Windows process-interruption cases. All thirteen normative mirror files
  are byte-identical.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call `0.7.0`
  planned. Local and remote `v0.7.0` are absent, and npm returns `E404` for
  `rust-intel-cc@0.7.0`. This remains the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P1/P2/P3 and run another independent
  review before the separately authorized version bump, tag, push, or publication.

## P1 findings

### 1. The abrupt-abort helper makes both Bash entry points fail during every ordinary run

Locations: `rust-cc-install.sh:206-208`, `rust-cc-install.sh:281-293`,
`rust-cc-uninstall.sh:71-73`, and `rust-cc-uninstall.sh:139-150`.

Both scripts run with `set -e`. Their new helper ends with a false `[[ ... ]]` whenever the requested
boundary does not match — including when `RUST_INTEL_INSTALL_ABORT_AT` is unset:

```bash
abrupt_abort() {
    [[ "${RUST_INTEL_INSTALL_ABORT_AT:-}" == "$1" ]] && exit 86
}
```

That false test returns status 1. Because `write_journal` calls `abrupt_abort before-journal` as a
simple command, `errexit` terminates the script before it writes the first journal. A bounded real
probe invoked the installer first with `after-backup-rename-5`, then normally with the variable
unset; both invocations exited 1 at the first boundary and never installed anything. The same helper
shape is present in the uninstaller.

This is a release-blocking regression in the advertised macOS/Linux install and uninstall path, and
the current repository-checks and Bash-3.2 jobs will go red as soon as this head is pushed.

Correction: make a non-match successful, for example `if [[ ... == ... ]]; then exit 86; fi`, and
run real ordinary install/uninstall plus every selected abort case under both current Bash and the
advertised Bash 3.2 floor.

## P2 findings

### 1. Node and PowerShell cannot restart after a replacement rename

Locations: `bin/install-transaction.js:131-166`, `bin/install-transaction.js:230-241`,
`rust-cc-install.ps1:188-218`, and `rust-cc-install.ps1:282-292`.

Before moving a staged replacement into place, both implementations persist `status = installing`.
If the child exits after the rename but before the `installed` journal update, restart sees the
replacement at the destination. Recovery treats this exact expected boundary as an ambiguous
“unbacked destination” and refuses to continue instead of restoring the old backup or removing a
fresh destination.

Two real fresh-install probes at `after-replacement-rename-0` reproduced the defect:

| Surface | abrupt exit | next install | result |
|---|---:|---:|---|
| Codex Node installer | 86 | 1 | `unbacked destination exists while replacement is installing` |
| PowerShell installer | 86 | 1 | `unbacked destination exists while replacement is installing` |

Node has another unrecoverable advertised boundary. `atomicInstall()` first writes a `prepared`
journal with `records: []`, then constructs and writes the exact owned inventory. An abort at the
generic `after-journal` hook after the first write exits 86, but restart rejects the journal because
its record count does not equal the owned inventory.

Correction: construct the complete record array before the first journal publication. Persist or
infer enough staged-path state to distinguish rename-not-run from rename-completed, then restore the
old snapshot at every before/after replacement boundary. Add real abort/restart controls for fresh
and upgrade installs, not only before-backup cases.

### 2. Sparse Bash backups are still stored under the wrong journal record path

Locations: `rust-cc-install.sh:223-265`, `rust-cc-install.sh:380-400`,
`rust-cc-uninstall.sh:89-119`, and `rust-cc-uninstall.sh:186-203`.

`64295f9` correctly changed `RECORD_STATUS` to use `owned_index`, but both Bash scripts still store
the actual backup at `"$BACKUP_ROOT/$BACKUP_COUNT"`. Recovery deliberately derives the only valid
backup as `"$tx/backup/$index"`, where `index` is the owned-record index. When earlier owned paths
are absent, those values differ: if only owned record 5 exists, the live rename goes to `backup/0`
while the journal and recovery require `backup/5`.

Same-process rollback hides the defect because it uses the compact `BACKUP_PATHS` array. After an
abrupt exit following the rename, restart reports the owned destination and expected backup absent,
while the real old data remains stranded under a different number. This is the exact sparse-
inventory binding defect round 35 required the fixing pass to close.

Correction: name every backup by `owned_index` in both install and uninstall, or serialize and
strictly validate an explicit backup path per record. Add a sparse inventory restart case where the
first present owned path is not record 0 and compare the complete byte-aware inventory afterward.

## P3 findings

### 1. The canonical completion-reference contract still has indirect-call bypasses

Locations: `dev/js-lexer.mjs:301-420` and `dev/validate-fixtures.mjs:3899-3929`.

The implementation records an alias only for a narrow `word = helper` or grouped equivalent and
emits a diagnostic only when a recognized direct/alias callee opens a call. It does not reject the
noncanonical helper reference itself. Bounded probes all returned an empty diagnostic list for:

```js
const unused = completeCurrentControlScope;
consume(completeCurrentControlScope);
(0, completeCurrentControlScope)(41, true);
[completeCurrentControlScope][0](42, true);
({ done: completeCurrentControlScope }).done(43, true);
```

The last three can execute an unconditional completion and keep the registry green after a semantic
predicate is removed. Controls 405–408 cover only assignment/grouped aliases that later appear as a
plain callee; control 409 mutates the actual loop only to the direct canonical spelling. That does
not prove the documented policy that every executable noncanonical helper reference is banned.

Correction: in the masked forward token stream, diagnose every executable decoded reference to
`completeCurrentControlScope` unless it is the callee of the one allowed direct call form. Add
actual-loop mutations through sequence, array/property, object/property, and argument forwarding,
plus inert comment/string/template decoys.

### 2. Installer restart CI does not cover the transaction protocol it claims

Locations: `.github/workflows/ci.yml:128-162`, `.github/workflows/ci.yml:280-334`, and
`.github/workflows/ci.yml:336-365`.

The Linux restart step samples only `after-backup-journal-*` for Node Claude, Bash, and Node Codex.
It has no replacement-journal/rename cases, no Node uninstall restart, no Bash uninstall restart,
and no sparse owned inventory whose present record differs from its compact backup count. The
Windows job similarly samples one backup-journal boundary for install and uninstall. The Bash 3.2
job adds the requested dash-leading full-inventory caught-error rollback, but no abrupt restart.

Consequently the suite did not challenge either P2 boundary. The ordinary Bash smoke will expose
P1 when CI runs, but that is not evidence for the advertised cross-boundary recovery protocol.

Correction: derive an explicit boundary inventory from each implementation and require an exact
exit 86 plus a complete old-or-new byte snapshot after restart for every reachable boundary, for
install and uninstall. Include fresh, upgrade, sparse, and rollback-interruption states, while
keeping a bounded representative matrix on Bash 3.2 if the complete matrix runs on current Bash.

### 3. The 48-boundary release calibration does not prove that its abort hook fired

Locations: `dev/calibrate-release-version.mjs:135-150`.

For each named boundary, the oracle checks only `interrupted.status === 0` and accepts every other
status. An unrelated syntax/runtime/filesystem failure therefore satisfies the “abrupt child exit”
half of the control; recovery can then succeed against untouched manifests, producing a false green
boundary. The installer CI correctly expects 86 for its sampled hooks, but the release calibration
does not.

Correction: require `interrupted.status === 86`, report stdout/stderr for any other status, and add a
negative control with a nonexistent boundary that must complete normally rather than count as an
abort. Keep the current old-or-new, mode, and recursive-artifact checks.

### 4. The current release record overstates round-35 closure

Locations: `README.md:46`, `CHANGELOG.md:26-33`, and `docs/reviews/README.md:62`.

The README says installers journal owned inventory before staging and recover defined process-
interruption boundaries. PowerShell intentionally stages before publishing its journal (safe only
because journal-less transactions are pre-live), and P1/P2 show that the broader recovery claim is
not true. The changelog says all three surfaces recover restart boundaries and that sparse defects
are no longer current. The round-35 disposition says `64295f9` closes the implementation portion of
P2-3/P3-2 and binds sparse Bash records correctly. Those are release-facing false closure claims,
not merely stale historical descriptions.

Correction: after the implementation and CI are fixed, map the exact fixing commits and evidence in
a round-36 disposition. Until then, describe installer recovery as partial and distinguish “journal
before staging” (Node/Bash) from “provably pre-live journal-less staging” (PowerShell). Preserve the
historical round-35 Open row.

## P4 observations

- `dev/js-lexer.mjs:9` still retains every distinct source plus mask/bitset in a module-global Map.
  Current validator cardinality is bounded, but the exported helper remains an unbounded-process
  retention surface.
- Bash's tab-delimited journal cannot represent an owned path containing a tab or newline. Strict
  validation fails closed on restart, so this is an availability/portability edge rather than a
  silent cross-path restore under the current non-elevated threat model.
- The PowerShell install stages before its first journal. This is safe for the current ordering
  because no live destination is touched and journal-less transaction directories are discarded;
  documentation should state that actual contract instead of claiming identical ordering across
  implementations.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| Mismatched-delimiter complexity | Top-only match/reject; 50k+50k control fails immediately and 2,000,000/2,000,001 work controls are deterministic. | Round-35 P2-1 closed. |
| Private keyword-name role | `this.#if() / mutation / 2` remains visible; regexp twin is masked. | Round-35 P2-2 closed. |
| Canonical completion references | Added assignment/grouping/reassignment/scope samples pass; sequence/array/object/argument references remain invisible. | P3-1 accepted; round-35 P3-1 partial. |
| Ordinary Bash entry | Normal install exits 1 at first nonmatching abort hook under `set -e`. | P1-1 accepted. |
| Node/PowerShell replacement restart | Exact `after-replacement-rename-0` exits 86, next run exits 1. | P2-1 accepted. |
| Node initial journal | Exact `after-journal` exits 86, next run rejects zero records. | P2-1 accepted. |
| Sparse Bash binding | Status uses owned index; backup pathname still uses compact count. | P2-2 accepted. |
| Installer CI | Sampled backup-journal restarts only; replacement/sparse/Node-Bash-uninstall states absent. | P3-2 accepted. |
| Release recursive cleanup | Nested manifest artifacts and negative nested case present; local calibration passed. | Round-35 P3-3 closed. |
| Windows release durability wording | Explicitly process-interruption only; sudden power loss excluded. | Round-35 P3-4 closed. |
| Release abort oracle | 48 names, but any nonzero exit is accepted. | P3-3 accepted. |
| Round-34/35 records and Layout | Round-34 disposition, installer helper and 409 count present; current closure claims are false. | Round-35 P3-5 partial; P3-4 accepted. |
| Mirror/package/version/actions | 13 mirrors agree; 39 package entries; three 0.6.0 manifests agree; action SHAs resolve to pinned refs. | Closed. |

## Round-35 closure matrix

| Round-35 item | Disposition at `b476347` |
|---|---|
| P2-1: delimiter-stack cost | **Closed (`992f734`).** Mismatches reject against the top entry; boundary controls are deterministic. |
| P2-2: private keyword-name role | **Closed (`992f734`).** Live division and regexp twin are covered. |
| P2-3: installer interruption/recovery | **Open (`64295f9`).** Before-backup inference improved, but P1/P2-1/P2-2 retain broken and unrecoverable states. |
| P3-1: canonical completion aliases | **Partial (`992f734`).** Four named aliases close; noncanonical indirect references remain. |
| P3-2: restart/Bash-3.2 CI | **Partial (`64295f9`).** Bash 3.2 version/dash/rollback landed; full restart states and working Bash entry points did not. |
| P3-3: nested release artifacts | **Closed (`3fd68fa`).** Recursive assertion and negative nested artifact are present. |
| P3-4: Windows power-loss claim | **Closed by scoping (`3fd68fa`).** Only process interruption is claimed. |
| P3-5: release record/Layout | **Partial (`3fd68fa`/`b476347`).** Layout/count/disposition exist, but installer closure prose is inaccurate. |

## Release-readiness evidence

| Area | Evidence at `b476347` |
|---|---|
| Full validator | Passed in **239.433 s** on Node 24.12.0/npm 11.13.0; 12 skill Markdown files and nested fixture run. |
| Fixture authority | Header/registry/docs say 409; 371 child plus 38 in-process controls. |
| Syntax/workflow | Node checks, `bash -n`, `actionlint v1.7.12`, and `git diff --check origin/main..HEAD` passed. |
| Lexical probes | Mismatch/budget and private-name controls pass; five indirect completion references returned no diagnostics. |
| Installers | Node and PowerShell replacement-rename restart reproduced P2-1; Node initial-journal restart reproduced P2-1; ordinary Bash entry reproduced P1-1. Exact PowerShell 7 and Bash 3.2 were unavailable locally. |
| Release recovery | Calibration passed its reported 48 Windows process-interruption boundaries and failures after 1–3, subject to P3-3's exit-code oracle. |
| Mirror/package | Mirror passed for 13 files. Dry-run: 39 entries, 614,276 packed / 1,711,189 unpacked bytes, integrity `sha512-9e1IUWM51r/R3sbwcXay9mBn60peRLyAMWI3Djs8LEH2259eTGcvfGzp7wTiVth/oD4TSCmR9yyBq9bJzscNPQ==`. |
| Action pins | checkout v7, setup-node v7, and rust-toolchain 1.97.0 refs resolve to the committed full SHAs. |
| Version/status | 0.6.0 check passed; 0.7.0 planned only; local/remote tag absent; npm 0.7.0 E404. |
| Provenance | 48 commits ahead of local `origin/main`; no current-head CI/push/bump/tag/publication claim. |

## Red-tier and out-of-scope inventory

- No executable Rust dependency, `unsafe`, FFI, crypto, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue/cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown renderer was added. Normative prose examples are not executable.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: no Cargo manifest/lock exists.
- Exact Node 24.0.0, PowerShell 7, and Bash 3.2 were unavailable locally. The reviewed head is
  unpushed; no CI result exists for it.
- Publication, version edits, tags, pushes, and release creation are out of scope.

## Required correction order

1. Repair Bash `abrupt_abort` and prove ordinary install/uninstall on current Bash and Bash 3.2
   (P1-1).
2. Make Node/PowerShell replacement boundaries and Node's first journal restartable; add exact
   old-or-new snapshot controls (P2-1).
3. Name Bash backups by owned record and cover sparse install/uninstall restart (P2-2).
4. Enforce canonical completion references rather than sampled callee forms (P3-1).
5. Build a nonvacuous installer boundary matrix and require release abort status 86 (P3-2/P3-3).
6. Correct README, changelog, and ledger closure only after the implementation evidence exists
   (P3-4).
7. Run one complete timed validation and another independent review. Only no P0–P3 authorizes the
   separately requested `0.7.0` release transition.
