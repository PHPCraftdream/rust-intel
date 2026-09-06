# Round 35 review of the latest commits and v0.7.0 release readiness — 2026-09-07 00:56 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`).
- Reviewed head: `2266fbcad0592ae8a3f70c39117bc7f73430fdba`.
- Commit window: `origin/main..HEAD` — forty-three commits, thirty-one changed files,
  `+5643/-632` before this report, inspected in an isolated linked worktree.
- Round 34 was read in full. Its three P2 and five P3 findings were traced through `6efe1c2`,
  `4f9db28`, `3bd9bf5`, and `2266fbc`, then challenged at lexical-resource, token-role,
  interrupted-transaction, rollback, and test-oracle boundaries.
- One complete timed `npm run validate` ran. Bounded checks also covered actionlint, JavaScript and
  shell syntax, release crash calibration, Node/Claude/Codex and PowerShell installer rollback,
  mirror/package/version state, tags, registry state, and focused lexical/recovery probes.
- No product, version, tag, package, workflow run, or remote ref was changed. This report and its
  Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Three P2 and five P3 findings remain.** The lexer is forward on ordinary valid input, but a
  mismatched closer still performs uncharged quadratic stack searches, and a valid private
  keyword-named member call still hides live division text. Installer journals improve ordinary
  rollback, but every implementation blocks on a safely inferable `backing-up` boundary; Bash can
  bind a backup to the wrong journal record, and PowerShell can leave a journal-less stage.
- Completion enforcement retains `id: null` and covers the five new controls, but still misses
  executable assignment/grouped aliases and retains aliases beyond reassignment or scope.
  Installer CI has no abrupt-exit/restart oracle and does not put dash-leading rollback coverage on
  Bash 3.2. The release calibration's “complete cleanup” assertion scans only the repository root,
  not the plugin directories, and its Windows process-exit model does not prove power-loss
  durability. The release record lacks a round-34 fixing disposition, an installer net summary, and
  the new snapshot helper in Layout.
- `npm run validate` exited 0 in **226.736 seconds** on Node `v24.12.0` / npm `11.13.0`, checking
  twelve skill Markdown files. The fixture authority is **399 controls**: 371 child-spawn and 28
  in-process. All thirteen normative mirror files are byte-identical.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call `0.7.0`
  planned. Local and remote `v0.7.0` are absent; npm returns `E404` for
  `rust-intel-cc@0.7.0`. This is the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P2/P3 and run another independent review
  before the separately authorized version bump, tag, push, or publication.

## P2 findings

### 1. The shared lexical budget excludes a quadratic closing-delimiter search

Locations: `dev/js-lexer.mjs:32-34` and `dev/js-lexer.mjs:200-207`.

Every outer scan iteration charges `step()`, but a closing delimiter searches backward through the
whole stack without charging that loop. A mismatched close leaves the stack intact, so the next
close repeats the full search. The counterexample

```js
'('.repeat(n) + ']'.repeat(n)
```

never reaches the declared two-million-operation limit while actual work is quadratic:

| `n` | elapsed |
|---:|---:|
| 1,000 | 15.484 ms |
| 2,000 | 16.926 ms |
| 4,000 | 39.222 ms |
| 8,000 | 112.148 ms |
| 16,000 | 566.277 ms |

`completionDiagnostics()` calls this masker first, so its own forward pass does not contain the
cost. Control 399 checks too many unmatched opening parentheses, not repeated mismatched closers.
Validation runs before the workflow's later syntax-check step, so malformed review input can take
this path before Node rejects it.

Correction: charge every inspected stack entry to the deterministic budget, or reject a mismatched
closer immediately. Add operation-count controls at and above the budget; elapsed time may be
diagnostic evidence, not the oracle.

### 2. A private keyword-named member call still hides live mutation text

Locations: `dev/js-lexer.mjs:159-170`, `dev/js-lexer.mjs:186-189`, and
`dev/validate-fixtures.mjs:3828-3842`.

Member status is preserved only after `.` or `?.`; `#` has no private-name token role. Consequently
this valid JavaScript:

```js
class C {
  #if() { return 2; }
  m() { this.#if() / MODULES.push({}) / 2; }
}
```

is masked as if `MODULES.push({})` were regexp data. `#` is processed as an expression-prefix
operator, `if` becomes the control keyword, and closing its call makes the following slash
regexp-capable. Node `v24.12.0` parses the private method/call shape. A dormant method is not
exercised by runtime deep-freeze, so the static workflow mutation check can miss this mutation.

Controls 390–393 close the sampled public-member/class/catch/label cases, but round 34 explicitly
required member/private-name role preservation.

Correction: tokenize `#IdentifierName` as a private member/name role and carry it into call
ownership. Add a live-mutation private-keyword division control and a regexp positive that catches
role leakage.

### 3. Installer interruption recovery is neither total nor safely bound to the owned record

Locations: `bin/install-transaction.js:75-120`, `rust-cc-install.sh:210-245` and
`rust-cc-install.sh:345-361`, `rust-cc-uninstall.sh:76-103`,
`rust-cc-install.ps1:152-200`, and `rust-cc-uninstall.ps1:73-103`.

All recovery implementations record `status = backing-up` before renaming the live path. If the
process exits before that rename, restart sees the unambiguous safe state “destination exists,
backup absent.” Instead of accepting “rename did not happen,” Node, Bash, and both PowerShell paths
report an incomplete backup and refuse the next install/uninstall until manual intervention.

A real Node probe prepared exactly that journal state. `node bin/install.js --user` exited 1 with
`backup state is incomplete`; the old skill and transaction remained. A focused PowerShell probe
likewise reported `Unfinished installer transaction requires recovery`, retaining both.

Bash installation has a second data-binding defect. `backup_owned()` computes `owned_index` and
stores it in `BACKUP_INDICES`, but writes `RECORD_STATUS[$index]`, where `index` is the compact
backup count. If an earlier owned path is absent, a later path's backup is journaled under the wrong
destination. Restart derives a destination from that wrong index and can restore an old command at
the skill path. Same-process rollback uses `BACKUP_DESTS`, so injected failures do not expose it.

PowerShell installation also fills `$stageRoot` before its first journal. Termination during copy
leaves `.rust-intel-ps-tx-*` without `journal.json`; the next run calls it unrecoverable even though
no live destination was touched. The smaller create-directory→first-journal gap exists elsewhere
and should be treated as safely disposable pre-live state.

Bash journals have no file or parent-directory durability barrier, and PowerShell flushes the
journal file but not its directory. Thus a journal's presence does not close round 34's hard-
interruption/power-loss requirement.

Correction: infer destination-present/backup-absent at `backing-up` as not-yet-renamed; bind Bash
status to `owned_index`; publish a journal before staging or safely discard provably pre-live
journal-less transactions. Validate journal version, phase, record count, owned destinations, and
backup containment. Add abrupt child-exit/restart calibration before and after every journal,
backup, replacement, rollback, commit, and cleanup boundary for every install/uninstall surface.

## P3 findings

### 1. Canonical completion enforcement covers samples, not the alias contract

Locations: `dev/js-lexer.mjs:273-280`, `dev/js-lexer.mjs:293-348`,
`dev/js-lexer.mjs:396-405`, and `dev/validate-fixtures.mjs:3844-3859`.

The live gate returns `[null]` and detects the exact escaped/direct-alias/`.call`/`.apply` samples.
Alias discovery recognizes only `const|let|var name = completeCurrentControlScope`. These executable
unconditional completions are invisible:

```js
let done;
done = completeCurrentControlScope;
done(41, true);

const grouped = (completeCurrentControlScope);
grouped(42, true);
```

Conversely aliases live in one global Set with no scope or write tracking, so a reassigned or
out-of-scope alias can still be reported after it ceases to call the helper. This is neither full
ECMAScript equivalence nor an enforced canonical-spelling ban.

Correction: reject every noncanonical helper reference and permit only the direct call, or model
bindings/grouping/scope/assignment. Mutate the actual loop through grouped/assignment aliases with a
nonliteral ID and require full validation to fail; add reassignment and scope negatives.

### 2. Installer CI cannot falsify interrupted recovery, and oldest Bash misses the named edge

Locations: `.github/workflows/ci.yml:59-128` and `.github/workflows/ci.yml:244-309`.

Complete snapshots and a real bracketed source materially improve caught-error coverage. But every
failure hook is a caught exception after a count; no job kills a child at a journal/rename boundary
and restarts it. P2-3's before-backup failure and Bash record-index corruption cannot fail CI.

The macOS job exercises one fresh install/uninstall. Relative dash-leading targets run only on
Ubuntu's modern Bash; the Bash-3.2 job does not run rollback, compare the full inventory, or cover
the dash-leading target round 34 required on the oldest advertised Bash.

Correction: expose boundary aborts and exercise restart in all implementations. On Bash 3.2, run
dash-leading install/uninstall and one full-inventory rollback; assert the version rather than only
printing its first line.

### 3. Release calibration does not inspect two thirds of its artifact locations

Locations: `dev/calibrate-release-version.mjs:79-86` and
`dev/calibrate-release-version.mjs:100-137`.

`assertNoArtifacts()` calls `readdirSync(caseRoot)` once. It sees package-manifest artifacts at the
root, but not `plugin.json.tmp-*`/`plugin.json.bak-*` under `.claude-plugin/` or `.codex-plugin/`.
The success message nevertheless claims complete cleanup after all 48 Windows boundaries.

Correction: recursively inventory all three manifest parents or inspect exact journal names. Add a
negative calibration that deliberately retains one nested backup and must fail.

### 4. Windows release durability is described more strongly than the evidence

Locations: `dev/set-release-version.mjs:35-52`, `dev/set-release-version.mjs:56-91`,
`dev/calibrate-release-version.mjs:15-39`, and `CHANGELOG.md:15-21`.

The 48-boundary calibration is useful process-exit evidence and passed. It is not a power-loss
model: `process.exit(86)` occurs around synchronous calls. On Windows `syncDirectory()` is a no-op,
and Node's plain rename API is not a write-through metadata barrier. A flushed journal plus
same-volume renames can recover a killed process without proving ordering after sudden power loss.

Round 34 asked for a platform-scoped durability definition or safe Windows replacement protocol.
The changelog now calls the transaction “durable” without the limitation.

Correction: implement and cite a Windows write-through replacement primitive, or narrow the
contract to process interruption and explicitly exclude Windows sudden power loss. Keep POSIX
parent-directory fsync as the stronger platform contract.

### 5. The release record documents the first fixing pass, not the current one

Locations: `CHANGELOG.md:9-21`, `CHANGELOG.md:72`, `README.md:44-46`,
`README.md:82-113`, and `docs/reviews/README.md:55-57`.

The round-33 disposition, 399 count, planned-0.7.0 status, release helper, lexer, and transaction
helper are present. There is no round-34 fixing disposition mapping `6efe1c2`, `4f9db28`, `3bd9bf5`,
and `2266fbc`. The changelog's new paragraph describes the manifest updater, not Node/Bash/
PowerShell installer recovery even though Status says current release tooling is summarized there.
README Layout omits `dev/snapshot-install.mjs`.

The “bounded JavaScript mutation scanner” claim is false for P2-1's uncharged search. A disposition
must not call round 34 integrated until that and recovery are closed.

Correction: retain round 34 Open and add a distinct fixing disposition with the matrix below. Add a
net installer/recovery changelog summary and Layout entry; describe the lexer as partially bounded
until P2-1 closes. Make no CI, bump, tag, push, or publication claim.

## P4 observations

- `dev/js-lexer.mjs:9` retains each source plus mask/bitset in a module-global Map. Current call
  cardinality is bounded, but the helper is exported; keep round 34's observation open or use one
  entry.
- `bin/install-transaction.js:75-113` trusts paths from any `.rust-intel-tx-*` journal. This is not
  P0-P3 under a same-user, non-elevated target model, but an elevated run below an attacker-writable
  parent could turn a crafted journal into arbitrary removal/rename. Validate the exact owned
  inventory and document “do not run elevated”; PowerShell needs the same containment check.
- Commit `2266fbc` stores literal `\n\nFiles:\n...` escape text in its body instead of real line
  breaks. This does not affect the tree.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| Completion complexity | Regex retry is gone; mismatched closers rescan the stack outside `step()`. | Accepted P2-1. |
| Public member/block context | `obj.if()` and controls 390–393 classify correctly. | Exact cases closed. |
| Private member context | `this.#if() / MODULES.push({}) / 2` is valid and masked. | Accepted P2-2. |
| Nonliteral completion ID | The live gate returns `[null]`. | Closed. |
| Completion alternatives | Sampled escaped/alias/`call`/`apply` work; grouped/assignment aliases and scope do not. | Accepted P3-1. |
| Ordinary installer rollback | Full inventory snapshots passed for bounded Node Claude/Codex and PowerShell failures. | Closed for caught errors. |
| Interrupted installer recovery | Prepared `backing-up` probes block restart; Bash misbinds sparse backups. | Accepted P2-3. |
| Installer CI | Inventories and bracket source improved; no restart, oldest-Bash dash, or rollback case. | Accepted P3-2. |
| PowerShell uninstall | Injected failure restores inventory; success removes owned paths only. | Caught-error case closed. |
| Release recovery | 48 abrupt boundaries and failure-after 1–3 passed old-or-new bytes/modes. | Process exit closed; P3-3/P3-4 remain. |
| Round-33 disposition/count | Historical Open + fixing row and 399 copies are present. | Closed. |
| Round-34 disposition/docs | No fixing row/installer summary; Layout misses snapshot helper. | Accepted P3-5. |
| Mirror/package/version | 13 mirror files, 39 package entries, three 0.6.0 manifests agree. | Closed. |

## Round-34 closure matrix

| Round-34 item | Disposition at `2266fbc` |
|---|---|
| P2-1: completion discovery quadratic | **Partial (`6efe1c2`).** Candidate discovery is forward; shared masking retains P2-1. |
| P2-2: property/statement context | **Partial (`6efe1c2`).** Exact cases close; private members retain P2-2. |
| P2-3: rollback/interruption | **Partial (`4f9db28`/`2266fbc`).** Caught rollback closes; restart, Bash indexing, pre-journal stage and durability retain P2-3/P3-2. |
| P3-1: IDs/equivalent callees | **Partial (`6efe1c2`).** `id: null` and five forms close; alias contract retains P3-1. |
| P3-2: installer smokes | **Partial (`2266fbc`).** Inventories/npm uninstall/Codex/bracket source close; restart and oldest-Bash edge remain. |
| P3-3: PowerShell uninstall destructive | **Closed for caught errors (`4f9db28`/`2266fbc`).** Shared interruption remains P2-3. |
| P3-4: release recovery unproved | **Partial (`3bd9bf5`).** POSIX barriers/recovery/48 exits land; nested cleanup and Windows power loss retain P3-3/P3-4. |
| P3-5: round-33 record absent | **Partial (`3bd9bf5`).** Round 33/399/release tooling land; current round-34 disposition and installer/Layout summary remain P3-5. |

## Primary references and contracts

- ECMA-262 [Private Identifiers](https://tc39.es/ecma262/#sec-private-identifiers) and
  [Lexical and RegExp Grammars](https://tc39.es/ecma262/#sec-lexical-and-regexp-grammars) govern the
  private-member/slash counterexample.
- Linux [`fsync(2)`](https://man7.org/linux/man-pages/man2/fsync.2.html) distinguishes flushed file
  data from a durable containing-directory entry.
- Node [`fs.renameSync`](https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath) documents rename
  but no Windows write-through/directory-flush guarantee.
- Project contracts: README install/migration/release promises, CHANGELOG Unreleased claims, round
  34's corrections, the ledger quality gate, and rust-intel §D1a/§D3/§F2.

## Release-readiness evidence

| Area | Evidence at `2266fbc` |
|---|---|
| Full validator | Passed in **226.736 s** on Node 24.12.0/npm 11.13.0; 12 skill files. |
| Fixture authority | Header/registry/docs say 399; 371 child plus 28 in-process controls. |
| Syntax/workflow | Focused `node --check` passed; `bash -n` passed on Bash 5.2.21; `actionlint v1.7.12` passed. |
| Installers | Node Claude/Codex and PowerShell caught-error assertions passed; Node/PowerShell restart probes reproduced P2-3. Local Bash 3.2 unavailable. |
| Release recovery | Calibration passed 48 Windows abrupt boundaries and failures after 1–3, subject to P3-3/P3-4. |
| Mirror/package | Mirror passed for 13 files. Dry-run: 39 entries, 612,619 packed / 1,704,376 unpacked bytes, integrity `sha512-fn8xuoXehrpYQOiB/v0Na+3UBxDbe/3m1bNAFcLxk1yM+qTsVhhx2dugqX83iQCAYuChqOeJMQJ6lZkSsWxyMw==`. |
| Version/status | 0.6.0 check passed; 0.7.0 planned only; local/remote tag absent; npm 0.7.0 E404. |
| Formatting | `git diff --check origin/main..HEAD` passed before this report. |
| Provenance | 43 commits ahead of local origin/main; no current-head CI/push/bump/tag/publication claim. |

## Red-tier and out-of-scope inventory

- No executable Rust dependency, `unsafe`, FFI, crypto, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue/cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown renderer was added. Normative prose examples are not executable.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: no Cargo manifest/lock exists.
- Exact Node 24.0.0 and Bash 3.2 were unavailable locally. The head is unpushed; no CI result exists.
- Publication, version edits, tags, pushes, and release creation are out of scope.

## Required correction order

1. Charge/reject all delimiter-stack work and add mismatched-closer budget controls (P2-1).
2. Carry private-name role through calls and add the live mutation counterexample (P2-2).
3. Repair and calibrate interruption recovery on Node/Bash/PowerShell, including sparse inventories
   and every install/uninstall boundary (P2-3/P3-2).
4. Enforce a complete or deliberately canonical completion contract with positive and negative
   binding controls (P3-1).
5. Make release cleanup recursive and narrow or prove Windows power-loss durability (P3-3/P3-4).
6. Add round-34 fixing disposition, installer net changelog summary, and Layout helper (P3-5).
7. Run one complete timed validation and another independent review. Only no P0–P3 authorizes the
   separately requested `0.7.0` release transition.
