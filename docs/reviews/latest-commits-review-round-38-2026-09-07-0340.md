# Round 38 review of the latest commits and v0.7.0 release readiness — 2026-09-07 03:40 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, confirmed
  against the remote `main` ref).
- Reviewed head: `a56582a15266781e1494142339b7cfac003c00d0`.
- Commit window: `origin/main..a56582a` — sixty commits, thirty-five changed files,
  `+7788/-629`, reviewed in an isolated linked worktree.
- Round 37 was read in full. Its two P2 and three P3 findings were traced through
  `b16d142`, `570437f`, `4c17dfa`, and `a56582a`, then challenged at restore,
  rollback, repeated-restart, fresh/upgrade/sparse, concrete-index inventory,
  declaration/expression slash-role, validator-budget, release-record, and CI-runtime
  boundaries.
- One complete timed `npm run validate` ran. Bounded checks covered Node and Bash
  installer recovery, the release-version interruption calibration, JavaScript lexer
  counterexamples, JavaScript/Bash/PowerShell syntax, actionlint, mirrors, package
  contents, manifests, action pins, remote tags, and npm publication state.
- No product implementation, manifest version, tag, package, workflow run, or remote ref
  was changed. This report and its Open ledger row are the only authored changes.

## Executive result

- **No P0 finding.**
- **One P1, two P2, and three P3 findings remain.** The newly committed exhaustive
  installer matrix is red by construction: it requests rollback indices that its fixed
  `failure-after 1` setup cannot reach. The Bash install rollback uses an unset record
  index, and both PowerShell recovery loops pass the completed validation-loop counter
  instead of the current record index to every restore hook.
- The helper's `fresh` fixture is actually an upgrade fixture on every surface, and its
  Node Claude inventory omits live backup/restore indices. Its source-declaration check
  proves only that one example exists for a template, not that every reachable concrete
  boundary is enumerated. The target snapshot also cannot see leaked sibling transaction
  directories.
- The lexer fix handles simple function/class expressions but still loses the outer class
  role when an `extends` expression contains a brace, including a nested class or object
  literal. The following division is again masked as a regexp, hiding an unconditional
  completion or workflow-root mutation from both source gates.
- `npm run validate` exited 0 in **226.898 seconds** on Node `v24.12.0` / npm
  `11.13.0`, checking twelve skill Markdown files and the nested 422-control suite. The
  independently checked arithmetic is **372 child-process + 50 in-process = 422**: the
  former 414-control state was 371 + 43, controls 415–421 are in-process, and control 422
  spawns one validator child.
- The separate release calibration exited 0 in **8.800 seconds** and reported all 48
  Windows process-interruption boundaries, exact exit 86, failures after 1–3, modes,
  old-or-new manifests, recursive cleanup, and the nested-artifact negative case.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call
  `0.7.0` planned. Local and remote `v0.7.0` are absent, and npm returns `E404` for
  `rust-intel-cc@0.7.0`. This remains the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close the P1, both P2s, and all three
  P3s, then run another independent review before the separately authorized version bump,
  tag, push, or publication.

## P1 findings

### 1. The exhaustive installer workflow is guaranteed to fail on reachable matrix rows

Locations: `dev/test-installer-recovery.mjs:109-112` and `204-218`,
`.github/workflows/ci.yml:129-234` and `408-453`, plus the restore-hook defects described
in P2-1 below.

Every rollback case calls the interrupted operation with `RUST_INTEL_INSTALL_FAIL_AFTER=1`,
regardless of the requested rollback record. That can reach only the first backed-up record
for uninstall, and only the first installed replacement for a genuinely fresh install. The
workflow nevertheless iterates every upgrade uninstall index and every fresh replacement
index.

A bounded real Node reproduction is deterministic:

```text
node dev/test-installer-recovery.mjs node-claude uninstall upgrade before-rollback-1
expected exit 86, got 1
Error: injected installer failure after backup 1
```

`before-rollback-0` passes for the same operation, confirming that the test driver stops at
the first backup rather than exposing an installer-wide failure. On the committed workflow,
`repository-checks` reaches the failing index-1 row in `uninstall_matrix node-claude 5`.
The PowerShell job separately fails when its first restore row asks for index 0 while the
implementation emits index 9 (P2-1). The round-37 fixing head therefore cannot produce a
green CI run even though `actionlint` and the integrated validator are green.

Correction: make rollback setup derive the failure depth needed to reach the requested
concrete record (and assert that the chosen hook actually fired exactly once). Generate CI
cases from one authoritative concrete inventory rather than maintaining separate arrays in
the helper and YAML. Run the complete POSIX and PowerShell matrices before claiming the
fixing pass closed.

## P2 findings

### 1. Bash install and PowerShell recovery publish the wrong restore-hook indices

Locations: `rust-cc-install.sh:338-360`, `rust-cc-install.ps1:198-240`, and
`rust-cc-uninstall.ps1:118-148`.

The Bash install rollback loop iterates `index`, but the new restore block reads and writes
`owned_index`, which is never assigned in that function:

```bash
RECORD_STATUS[$owned_index]=restoring
abrupt_abort "before-restore-$owned_index"
```

In the tested Bash, an empty arithmetic array subscript aliases record 0 and the hooks become
`before-restore-`, `after-restore-rename-`, and `after-restore-status-`. A bounded real case
therefore completed normally instead of interrupting:

```text
node dev/test-installer-recovery.mjs bash install upgrade before-restore-0
expected exit 86, got 0
```

This is not only instrumentation damage. A real process interruption after a nonzero backup
has been renamed back can leave that record durably `backed-up` while its backup is absent and
destination is present; the next invocation rejects that state instead of converging. The
explicit `restoring` transition was written to the wrong record.

Both PowerShell recovery functions have the mirror indexing defect. Their validation loop
finishes with `$recordIndex == $records.Count`; the following `foreach ($record in $records)`
reuses that stale value for every `Restore-TransactionRecord` call. With the nine-record Claude
inventory, every recovery hook is emitted as index 9 while CI requests 0–8. The record object
itself is updated, so the ordinary no-hook recovery may converge, but the claimed interruption
proof is absent and the committed PowerShell matrix cannot pass.

Correction: use `index` consistently in Bash. In PowerShell, iterate records by index (or obtain
the exact array index for each current record) and pass that index through every journal write
and hook. Add a bounded negative assertion that no hook can emit an index outside the owned
inventory, then exercise two successive recovery interruptions before the clean restart on each
Node/Bash/PowerShell install and uninstall surface.

### 2. A class `extends` expression still hides executable division as a regexp

Locations: `dev/js-lexer.mjs:190-197` and `254-266`,
`dev/validate-fixtures.mjs:3958-3997`, `README.md:46`, `CHANGELOG.md:88`, and
`docs/reviews/README.md:67`.

`pendingClassBodyRole` is stored as one global pending value and consumed by the first `{`
seen after the `class` keyword. A brace belonging to the `extends` expression therefore steals
the outer class role. The actual outer class body is then inferred from the preceding `)`/`}` as
a statement block, and its following slash is masked as a regexp.

Both counterexamples are valid JavaScript (`new Function(source)` succeeds), yet
`literalTrueCompletionDiagnostics(source)` returns `[]` and the masker removes the helper:

```js
const C = class extends mixin({}) {} / completeCurrentControlScope(421, true) / 2;
const D = class extends (class {}) {} / completeCurrentControlScope(422, true) / 2;
```

The right operand is evaluated, so this can forge completion accounting. Replacing the helper
with `MODULES.push({})` or `AUDIT_UNITS.push({})` similarly hides a workflow-root mutation from
`workflowMutationCheck`; a later runtime failure is not equivalent to the promised static gate.
Controls 415–422 cover only simple class headers and therefore stay green through this mutation.

Correction: attach class-role state to the lexical delimiter/construct stack and identify the
class body only after the complete optional `extends` expression, rather than consuming the first
brace. Add simple/nested object and nested-class `extends` expression-division controls, including
actual completion-loop and workflow-root mutations, while retaining the 2,000,000-operation and
100,000-depth limits.

## P3 findings

### 1. The fresh and concrete-boundary inventories are not mechanically truthful

Locations: `dev/test-installer-recovery.mjs:39-50` and `77-145`, and
`.github/workflows/ci.yml:136-234`.

`fixture()` ignores `mode === 'fresh'`: every non-sparse Claude surface receives the complete
old install, and Node Codex receives `old-codex`. Thus every advertised fresh install is actually
an upgrade with `originalPresent = true`. A direct counterfactual demonstrates the mismatch:

```text
node dev/test-installer-recovery.mjs node-codex install fresh before-backup-0
helper classified the boundary as nonexistent, but the installer exited 86 at that live hook
```

The Node Claude install inventory also declares only backup indices 0–4, although an upgrade
fixture creates all nine owned destinations and `atomicInstall()` backs up records 0–8. Running
the helper against `before-backup-5` likewise reaches exit 86 while the helper calls it
nonexistent. The YAML then reuses the same 0–4 array for Node Claude uninstall, omitting its live
5–8 boundaries even though the helper's own uninstall inventory contains 0–8.

`assertBoundaryDeclarations()` cannot make this mechanical: it compares a hand-authored inventory
to a hand-authored template comment and requires only one concrete prefix match per `{index}`
template. It neither derives existing destinations nor enumerates implementation hook call sites.

Correction: make fresh fixtures genuinely empty except for unrelated siblings; derive active
backups from the fixture snapshot and owned record order; generate both helper and CI cases from
that concrete inventory; and include a mutation/negative control that adds a reachable index or
changes the fixture mode without updating the expected matrix.

### 2. Successful recovery does not assert transaction-directory cleanup

Locations: `dev/test-installer-recovery.mjs:182-224` and `dev/snapshot-install.mjs:10-26`.

The post-restart oracle snapshots only the install target. Node, Bash, and PowerShell transaction
directories are siblings of that target, so a restart can produce the exact expected installed
bytes while leaking a journal, backup, or stage directory and still pass. The release-version
calibration correctly makes recursive transaction cleanup part of its oracle; the installer
matrix does not.

Correction: after each successful restart, assert that the transaction parent contains no
surface-specific transaction directories or nested stage/backup/journal artifacts, without
requiring unrelated sibling directories to be absent.

### 3. Current release records overstate the round-37 fixing state

Locations: `README.md:46`, `CHANGELOG.md:20-31` and `88`, and
`docs/reviews/README.md:67`.

README and CHANGELOG say the helper covers fresh and every supported restore/rollback surface;
the ledger says `570437f` closes the function/class slash-role defect and `4c17dfa` supplies
implementation-declaration coverage. The P1/P2/P3 evidence above contradicts each of those current
claims. The 422 total and its 372/50 breakdown are correct, as are the pre-bump `0.6.0` manifests
and planned-MINOR `0.7.0` statement.

Correction: after the implementation fixes land, rewrite the current Status, Unreleased net state,
and round-37 disposition to distinguish what was closed from what round 38 reopened. Preserve
historical 414/409/399 counts as revision-qualified facts and do not claim current-head CI until a
green run exists for that exact pushed SHA.

## P4 observations

- `dev/js-lexer.mjs:9` still retains every distinct source plus its mask/bitset in a module-global
  Map. Current validator cardinality is finite, so this is not a release blocker, but the exported
  helper remains an unbounded long-lived-process retention surface.
- The 372/50 execution-mode split is arithmetically correct but lives only in prose. The executable
  registry proves 422 observed IDs, not whether a control spawned a validator child. Future moves
  between in-process and child execution can silently stale the split.
- `570437f`, `b16d142`, and `a56582a` have subject-only messages. The history is still intelligible
  from adjacent reports and diffs, but this is weaker provenance than the repository's later
  descriptive-body practice.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| Node restore state machine | `node-codex install upgrade after-restore-rename-0` interrupted and restarted successfully. | Exact sampled Node path closed; broader matrix remains blocked by P1/P3-1. |
| Rollback-index reachability | Node Claude uninstall index 1 returned injected-failure exit 1, not hook exit 86. | P1 accepted. |
| Bash restore hook | Bash upgrade `before-restore-0` returned 0 rather than 86; source uses unset `owned_index`. | P1/P2-1 accepted. |
| PowerShell restore hook | Both recovery loops pass the completed validation-loop counter (9) to current-record hooks. | P1/P2-1 accepted; runtime matrix unavailable locally but failure is deterministic from function scope. |
| Fresh fixture | Node Codex `fresh before-backup-0` reached the supposedly nonexistent hook. | P3-1 accepted. |
| Node Claude concrete inventory | `before-backup-5` reached exit 86 while the helper rejected it as unlisted. | P3-1 accepted. |
| Class expression slash role | Simple controls 415–422 pass in the full suite. | Round-37 exact examples closed. |
| Class `extends` slash role | Object-literal and nested-class headers parse, but helper diagnostics are empty and live code is masked. | P2-2 accepted. |
| Lexer budgets | Full controls retain the exact 2,000,000-operation and 100,000-depth behavior. | Closed; cache retention remains P4. |
| Fixture total | 422 observed controls; 371/43 historical base plus 1/7 delta gives 372/50. | Closed; execution-mode split remains prose-only P4. |
| Release interruption calibration | 48 Windows boundaries, exact 86, nonexistent hook, failures 1–3, old/new state and recursive cleanup passed. | Closed. |
| Mirror/package/version/actions | 13 mirrors agree; 39 package entries; three 0.6.0 manifests agree; action SHAs resolve to pinned refs. | Closed pre-bump. |
| Release records | Planned 0.7.0 and historical counts are calibrated; installer/lexer closure claims are too broad. | P3-3 accepted. |

## Round-37 closure matrix

| Round-37 item | Disposition at `a56582a` |
|---|---|
| P2-1: reentrant installer restoration | **Partial.** Node's sampled transition works; Bash install writes the wrong record/hook index and PowerShell hooks use index 9. The complete matrices cannot run. |
| P2-2: function/class expression division | **Exact simple cases closed, broader objective open.** `class extends` expressions containing braces reopen the static bypass (round-38 P2-2). |
| P3-1: exhaustive strict-snapshot matrix | **Partial.** Expected-only target comparison is fixed, but rollback setup cannot reach many requested indices, fresh is not fresh, concrete inventories drift, and sibling transaction debris is invisible. |
| P3-2: current records/provenance | **Reopened.** Counts are current, but installer and lexer closure claims are contradicted by round 38. |
| P3-3: 414-control header breakdown | **Closed.** Current total is 422 = 372 child + 50 in-process; installer recovery remains a separate helper. |

## Release-readiness evidence

| Area | Evidence at `a56582a` |
|---|---|
| Full validator | Passed in **226.898 s** on Node 24.12.0/npm 11.13.0; 12 skill Markdown files and the nested fixture run. |
| Fixture authority | Header, executable registry, README, CHANGELOG, and ledger agree on 422; independent delta recount agrees on 372 child + 50 in-process. |
| Syntax/workflow | Node checks, `bash -n`, corrected Windows PowerShell parser invocation, `actionlint v1.7.12`, and `git diff --check origin/main..a56582a` passed. PowerShell 7 and Bash 3.2 were unavailable locally. |
| Installer matrix | Sampled Node Codex restore passed. Node Claude uninstall rollback index 1 and Bash restore index 0 failed their exact-86 oracle; the full committed CI matrix is therefore known red before push. |
| Lexical probes | Both brace-bearing `class extends` expressions parse, mask the live helper, and yield no completion diagnostic. |
| Release recovery | Calibration passed 48 Windows process-interruption boundaries in 8.800 s, including exact 86, nonexistent-hook status 0, failures after 1–3, modes, old-or-new state, and recursive cleanup. |
| Mirror/package | Mirror passed for 13 files. Dry-run: 39 entries, 615,396 packed / 1,716,642 unpacked bytes, integrity `sha512-4pR8OJG/PZy5ZRRKMGx/vrUmxtskWB3b2e447raKkhkRN48Ip0ffq9LPHHvH69IEkoRtjQpEY3y7a7MRNtWdTQ==` on Node 24.12.0/npm 11.13.0. |
| Action pins | checkout v7, setup-node v7, and rust-toolchain 1.97.0 refs resolve to the committed full SHAs. |
| Version/status | 0.6.0 check passed; 0.7.0 check correctly failed against all three 0.6.0 manifests; local/remote tag absent; npm 0.7.0 E404. |
| Provenance | Remote `main` remains `3ed04b9`; reviewed head is sixty local commits ahead. No current-head CI, push, bump, tag, or publication claim is valid. |

## Red-tier and out-of-scope inventory

- No normative `skill/` or `skills/rust-intel/` file differs from `origin/main`; all thirteen
  mirror files are byte-identical.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue/cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added in this window.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: the repository has no Cargo
  manifest or lockfile and the executable changes are Node/Bash/PowerShell repository tooling.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract. This review tests and reports process-interruption behavior only.

## Required next pass

1. Fix concrete rollback-depth generation, Bash/PowerShell restore indices, genuine fresh fixtures,
   Node Claude concrete inventories, and sibling transaction cleanup assertions.
2. Fix class-body role tracking across arbitrary `extends` expressions and add causal actual-source
   mutations for the newly exposed form.
3. Run the complete POSIX, Windows PowerShell, and Bash 3.2 matrices plus the integrated validator;
   record exact counts and runtime without weakening or deleting failing rows.
4. Update current README/CHANGELOG/ledger claims to the corrected head and run another independent
   P0–P3 review. Only a clean result licenses the separately authorized 0.7.0 bump/release sequence.
