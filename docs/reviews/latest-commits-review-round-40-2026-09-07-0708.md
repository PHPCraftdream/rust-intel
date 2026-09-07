# Round 40 review of the latest commits and v0.7.0 release readiness — 2026-09-07 07:08 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, also
  confirmed by `git ls-remote origin refs/heads/main`).
- Reviewed head: `8b2d576550068b27d1654f48fa98d6b90d7818b4`.
- Commit window: `origin/main..8b2d576` — seventy-one commits, thirty-seven changed files,
  `+8698/-627`, reviewed in an isolated linked worktree.
- Round 39 and fixing commits `419fe32`, `f5a655e`, `1363cc8`, `7042ce8`, and `8b2d576`
  were traced against failed/nonempty POSIX inventories, direct function-heritage construct
  ordering, same- and cross-operation installer recovery, transaction-prefix cleanup,
  independent replacement inventories, child/job timeouts, generated Bash 3.2 and PowerShell
  matrices, fixture-count arithmetic, and release-facing dispositions.
- One complete timed `npm run validate` was attempted, as required. It did not pass: the fixture
  child terminated with a V8 `Zone Allocation failed - process out of memory` fatal error after
  254.860 seconds. The complete generated Node matrix and representative current-Bash cases were
  run separately; release calibration, syntax, mirror, package, manifest, action-pin, workflow,
  tag, npm, and diff checks were also run.
- No normative skill file, installer, validator, workflow, manifest version, tag, package, or
  remote ref was changed. This report and its Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Three P2 and four P3 findings remain.** The POSIX CI inventory checks accept a whitespace-only
  file as nonempty, so both current-Bash/Node and Bash-3.2 matrices can silently execute zero
  cases. The JavaScript scanner still treats keyword-named class fields as real class/function
  constructs and masks a following live completion or workflow mutation. The required full
  validator gate failed with a V8 out-of-memory fatal error on this reviewed head.
- Cross-operation recovery now runs and cleans up in all 578 Node cases and the ten sampled Bash
  cases, but its full-snapshot oracle repeats the same interrupted-operation/recovery sequence on
  both sides of the comparison. It therefore cannot detect deterministic corruption in that
  sequence. The transaction-debris negative control exercises only the first of the two accepted
  prefixes, the tag-triggered publish job still has no finite job timeout, and the round-39 ledger
  calls `7042ce8` the current head although the disposition itself was committed at `8b2d576`.
- The generated Node matrix passed **578/578** executions in **429.545 seconds**: all 289 concrete
  boundaries in same-operation mode and all 289 in cross-operation mode. Ten representative Bash
  5.2.21 same/cross cases passed in **56.278 seconds**, including fresh replacement, deepest
  restore, rollback, upgrade, sparse, install, and uninstall paths. This is useful implementation
  evidence, but it does not repair the CI-vacuity or cross-oracle findings.
- The source/header arithmetic remains **440 = 374 child-process + 66 in-process**: the independently
  reviewed 430-control base was 373 + 57, controls 431–439 add nine in-process checks, and control
  440 adds one child check. The executable suite did not reach a successful terminal report in this
  review, so the current 440 completion total is not runtime-proven by this run.
- Release-version calibration exited 0 in **8.893 seconds** and reported all 48 process-interruption
  boundaries, failures after replacements 1–3, old-or-new manifest state, modes, recursive cleanup,
  and the nested-artifact negative case.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call `0.7.0`
  planned. Local and remote `v0.7.0` are absent, and npm returns `E404` for
  `rust-intel-cc@0.7.0`. This remains the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P2/P3 below, obtain a passing full
  validator run and another independent review, then run current-head CI before the separately
  authorized bump/tag/publish sequence.

## P2 findings

### 1. POSIX “nonempty” inventory checks accept whitespace-only output and run zero cases

Locations: `.github/workflows/ci.yml:232-257`, especially line 241, and
`.github/workflows/ci.yml:410-427`, especially line 421.

The round-39 process-substitution failure is fixed: the producer now runs as a separately checked
command. The second fail-closed obligation is incomplete, however. Both POSIX wrappers use only
`[[ -s "$output" ]]` / `[ -s "$inventory" ]`. A file containing one newline has size one but no
boundary; the later loop skips its sole blank line and exits successfully. A bounded calibration
confirmed `size=1 nonblank=false`. PowerShell already applies the stronger trimmed-line check.

This means a generator regression that prints a blank line and exits zero makes the supposedly
exhaustive Node/current-Bash lanes and the complete Bash-3.2 lane green with zero recovery cases.
The existing negative exercises only a nonzero producer and cannot catch this distinct vacuity.

Correction: parse the materialized file into nonblank boundary records, require at least one, and
iterate exactly those records. Add two negative calibrations: producer exits nonzero, and producer
exits zero with blank/whitespace-only output. Use the same checked helper in both POSIX jobs.

### 2. Keyword-named class fields are mistaken for pending constructs and hide live mutations

Locations: `dev/js-lexer.mjs:193-219`, `dev/js-lexer.mjs:256-287`, and
`dev/validate-fixtures.mjs:4037-4074`.

The ordered same-depth stack fixes direct function heritage, but construct creation still depends
only on the word spelling plus `!propertyName`. In a class body, `function` and `class` are valid
public field names. They are not function/class keywords in these examples:

```js
class X { function = {} / completeCurrentControlScope(441, true) / 2; }
class X { class = {} / completeCurrentControlScope(442, true) / 2; }
```

Both sources compile through `new Function(...)`. On the reviewed scanner both return `[]` from
`literalTrueCompletionViolations`, and `maskJsNonCode` blanks the helper call as a regexp. The field
name leaves a false declaration-role construct; the initializer's object brace consumes it and
makes the following division slash look like a regexp start. The same boundary can hide a live
`MODULES.push(...)` or `AUDIT_UNITS.push(...)` mutation.

Correction: classify `class`/`function` as construct keywords only in grammar-compatible token
contexts, not as class element names/field definitions. Add declaration/expression field-name
twins for both spellings, actual completion-loop mutations, and actual workflow-root mutations,
while retaining the construct stack's operation/depth bounds.

### 3. The required full validator gate crashes with a V8 out-of-memory fatal error

Locations: `dev/validate.mjs:2288-2296`, `dev/validate-fixtures.mjs:253-287`, and the
440-control fixture execution path.

The one required complete run was:

```text
npm run validate
ERROR: fixture validation failed: FATAL ERROR: Zone Allocation failed - process out of memory
VALIDATE_EXIT=1 seconds=254.860
```

The host reported substantial free physical memory after the failure, and the failing child did
not produce the suite's `440 controls` terminal success line. This review does not claim a root
cause from one run, but a release candidate whose mandatory validator invocation exits 1 is not a
releasable candidate. The successful smaller matrices and syntax checks are not substitutes for
this gate.

Correction: reproduce with control/progress attribution and capture the failing child's command,
peak memory, and last completed control. Fix the resource/lexer/fixture cause rather than merely
raising a heap limit; retain the watchdog, add a bounded regression for the causal shape, and
require an ordinary `npm run validate` pass under the CI Node floor before closure.

## P3 findings

### 1. Cross-operation full-snapshot comparison uses the implementation as both oracle and subject

Locations: `dev/test-installer-recovery.mjs:335-370`, especially lines 357-365.

In cross mode the expected tree is reset, interrupted at the same first-operation boundary, then
run through the same opposite operation as the actual tree. The actual tree then executes exactly
that sequence again. Comparing the two snapshots proves determinism, not the required semantic
postcondition. A deterministic recovery mutation that loses or rewrites an old owned file affects
both sides identically and remains green; success status and debris cleanup do not reconstruct the
missing independent old/new inventory oracle.

For install→uninstall, compare against a clean uninstall applied directly to the original fixture.
For uninstall→install, compare against a clean install applied directly to the original fixture.
Keep the interrupted first operation only on the subject side. Add a mutation counterfactual that
corrupts recovery in the same deterministic way on every invocation and prove the corrected oracle
rejects it.

### 2. The debris-oracle negative calibrates only one of each shell surface's two prefixes

Locations: `dev/test-installer-recovery.mjs:67-76`, `271-279`, and `372-381`.

`assertCleanTransactionParent` correctly scans both install and uninstall prefixes, but the
negative transaction is created only with `transactionPrefixes()[0]`. Removing or misspelling the
second/opposite-operation prefix in the checker is therefore not caught by the negative control.
Cross-operation success can happen without leaving debris, so it does not calibrate that assertion.

Correction: create and reject one owned synthetic transaction for **each** returned prefix, then
retain the foreign-prefix preservation check. Bind the expected prefix set independently per
surface so deleting a prefix from `transactionPrefixes()` cannot shrink both the implementation
and its test oracle together.

### 3. The tag-triggered publication job still has no finite job timeout

Location: `.github/workflows/npm-publish.yml:33-35`.

All five validation workflow jobs now have `timeout-minutes`, and installer/release child processes
have explicit timeouts. The release workflow's `publish` job has none even though it runs the full
validator plus network-backed registry inspection and publication. A hung validator, registry
request, or publish command can therefore occupy the runner until GitHub's outer default rather
than fail within the repository's stated finite release envelope.

Correction: set a measured `timeout-minutes` on `jobs.publish`, above the validated package and
publish baseline, and keep the duplicate-publish integrity comparison inside that bound.

### 4. The round-39 disposition records the wrong current head and now overstates the fixing scope

Locations: `docs/reviews/README.md:71`, `README.md:46`, and `CHANGELOG.md:31-42`, `106-115`.

The ledger says “the current head `7042ce8`”, but the disposition itself is commit `8b2d576`; a
commit cannot truthfully describe its parent as the current head. The release-facing summaries also
say the fixing pass implements checked inventories, the cross-operation oracle, and timeout work
without the whitespace-vacuity, independent-oracle, and publish-timeout qualifications found here.
Their pending-review caveat prevents a closure claim, but the concrete head/provenance statement is
still false and the implemented-scope summary is now too broad.

Correction: record `8b2d576` as the reviewed round-40 base/head history, distinguish successful
implementation execution from independently proved postconditions, and carry the remaining round-40
P2/P3s into Status, CHANGELOG, and a round-39 fixing disposition without claiming current-head CI.

## P4 observations

- `dev/js-lexer.mjs:31` still retains every distinct source plus mask/bitset in a module-global Map.
  Current cardinality is finite, but the failed full run makes this existing retention surface worth
  measuring during the P2-3 diagnosis.
- `dev/test-installer-recovery.mjs:127-133` retains the now-unused
  `replacementIndicesFromHooks()` helper after moving to the independent inventory.
- `.github/workflows/ci.yml:397` installs a root cleanup trap, but line 416 replaces it with an
  inventory-file trap. The macOS runner is ephemeral, so the leaked test root is not a release
  blocker, but trap composition would keep the test self-cleaning.
- The 374/66 execution-mode split remains revision-arithmetic/prose, not an executable registry
  invariant. The total registry is stronger than the split claim.
- `README.md:84-88` still describes the matrix helper primarily as same-operation evidence even
  though the current CI invokes both modes. The caveat is conservative, but should be rewritten
  after the independent cross-operation oracle exists.

## Round-39 closure matrix

| Round-39 item | Disposition at `8b2d576` |
|---|---|
| P2-1: failed/empty POSIX list | **Partial.** Nonzero producer failure propagates, but blank-only successful output remains a zero-case green matrix (round-40 P2-1). |
| P2-2: direct function heritage | **Exact reported case closed.** Controls 431-440 cover direct function heritage; keyword-named class fields expose a separate same scanner invariant (round-40 P2-2). |
| P2-3: opposite-operation recovery | **Implementation paths execute; semantic oracle partial.** All Node and sampled Bash same/cross runs completed and cleaned transaction state, but expected and actual replay the same interrupted sequence (round-40 P3-1). |
| P3-1: cleanup prefix | **Implementation fixed; calibration partial.** Both prefixes are scanned, but only the first is independently seeded as a negative (round-40 P3-2). |
| P3-2: replacement inventory | **Closed for the reviewed surfaces.** Expected replacement records are independently declared and all emitted replacement hooks are compared exactly. |
| P3-3: timeouts | **Partial.** Installer and release children plus validation jobs are bounded; the tag-triggered publish job is not (round-40 P3-3). |
| P3-4: Bash 3.2 generated matrix | **Implemented, not runtime-proven here.** CI now enumerates same/cross generated Bash cases on the advertised shell; current-head CI has not run and blank-list vacuity remains. |
| P3-5: release records | **Partial.** Counts and pending-review language are current, but the ledger's current-head statement is stale and the fixing summary needs round-40 qualification. |

## Release-readiness evidence

| Area | Evidence at `8b2d576` |
|---|---|
| Full validator | **Failed** after 254.860 s on Node 24.12.0/npm 11.13.0: fixture child fatal V8 zone-allocation OOM; no 440-control terminal success. |
| Fixture authority | Source/header and historical delta agree on 440 = 374 child + 66 in-process; current runtime completion is unproved because the full run failed. |
| Node installer matrix | 578/578 same/cross executions passed in 429.545 s across Node Claude and Codex surfaces. |
| Bash installer matrix | Ten representative Bash 5.2.21 same/cross cases passed in 56.278 s; committed Bash-3.2 full matrix is pending exact-head CI and has blank-list vacuity. |
| Release recovery | Passed 48 Windows process-interruption boundaries in 8.893 s, including exact status, failures 1-3, old-or-new state, modes, and recursive cleanup. |
| Syntax/workflow | JavaScript syntax, Bash syntax, `actionlint`, mirror, manifest-0.6.0, and `git diff --check origin/main..8b2d576` passed. |
| Mirror/package | Thirteen mirrors agree. Dry-run has 39 entries, 616,621 packed / 1,720,255 unpacked bytes, integrity `sha512-B+nozzYc1jbJrr1cwyspADr5+06ZV0hvtAaZkPv+7rx/6afi/uJRYJznarY0HgGTmDNE4+LL9asF0wkV6O+EGQ==`. |
| Action pins | checkout v7, setup-node v7, and rust-toolchain 1.97.0 refs resolve to the committed full SHAs. |
| Toolchain | `rustc 1.97.0` (`2d8144b7`, x86_64-pc-windows-msvc) and Cargo 1.97.0 (`c980f486`) match CI's pin. |
| Version/status | 0.6.0 check passed; 0.7.0 correctly failed against all three 0.6.0 manifests; local/remote tag absent; npm 0.7.0 E404. |
| Provenance | Remote `main` remains `3ed04b9`; reviewed head is seventy-one local commits ahead. No current-head CI, push, bump, tag, or publication claim is valid. |

## Red-tier and out-of-scope inventory

- No normative `skill/` or `skills/rust-intel/` file differs from `origin/main`; all thirteen mirror
  files are byte-identical.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue/cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added in this window.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: this repository has no Cargo
  manifest or lockfile and the executable changes are Node/Bash/PowerShell repository tooling.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract. This review tests and reports process-interruption behavior only.

## Required next pass

1. Reject blank/whitespace-only POSIX inventories and calibrate both failure and zero-case output.
2. Distinguish keyword-named class fields from construct keywords and add live completion/workflow
   counterfactuals without weakening the bounded scanner.
3. Replace the cross-operation self-comparison with direct clean-opposite semantic snapshots, and
   independently negative-calibrate every owned transaction prefix.
4. Diagnose and fix the full-validator OOM, add the publication-job timeout, and obtain ordinary
   Node-24-floor validation plus exact-head CI.
5. Correct the round-39/current-head disposition, then run another independent P0-P3 review. Only
   a clean reviewed head plus green exact-SHA CI licenses the separately authorized release bump,
   tag, and publish sequence.
