# Round 29 review of the latest commits and v0.7.0 release readiness — 2026-09-06 18:56 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `4d1250937eab391b26e05e9111a435f3feebd65e`.
- Commit window: `origin/main..HEAD` — nineteen commits, fifteen changed files, `+1823/-75`
  before this report. Every commit and the complete repository state needed for the planned
  `0.7.0` release were inspected in an isolated linked worktree.
- Round 28 was read in full. Its three findings were traced through `ae39408`, `99f5310`,
  `f276d09`, and `4d12509`, with particular attention to per-ID assertion accounting,
  body-removal/range-removal/add-next counterfactuals, JavaScript comment/string/template masking,
  the 389-control claims, ledger disposition, and the existing-v0.6.0 release instruction.
- The normative `skill/` and `skills/rust-intel/` trees are unchanged in this commit window. This
  pass therefore rechecked their mirror/category/release gates rather than treating the tooling
  commits as a new 59-category normative specification revision.
- No product, version, tag, workflow, package, or remote ref was changed. This report and its Open
  ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.** The release manifests remain intentionally unbumped at `0.6.0`; the
  planned MINOR `0.7.0` classification, Node/Rust pins, action pins, package contents, installers,
  mirror, Status transition, changelog transition, and release workflow are coherent.
- **One P2 finding remains:** control 389 recursively runs almost the complete fixture suite three
  additional times. A local integrated validation took **854.991 seconds (14:14.991)**, versus
  **215.160 seconds (3:35.160)** for one reduced nonrecursive fixture pass on the same machine — a
  **3.97x wall-clock amplification** and roughly four suite-equivalents per validation job.
- **Two P3 findings remain:** the assertion registry can still call a removed semantic control
  “executed” through a retained tautological accounting assertion, and the ledger has no round-28
  fixing disposition mapping the four follow-up commits and their actual closure state.
- The current numeral **389** is structurally consistent: the header, executable-registry literal,
  contiguous source-label inventory, runtime observed set, README Status/checklist, CHANGELOG, and
  ledger all agree. The successful full run establishes that all 389 registered IDs reached an
  assertion/outcome helper in this revision. It does **not** establish that all 389 advertised
  semantic probes still ran, because P3-1 demonstrates a passing body-removal case.
- **Round-28 closure is partial.** Its release-checklist and provenance findings are closed by
  `99f5310`. Its executable-control-authority finding is improved but remains open.
- **Release verdict: NOT READY for `v0.7.0`.** The repository's own clean-review gate requires no
  P0–P3. Close P2-1 and P3-1/P3-2, then run another independent review before an explicitly
  authorized version bump, tag, or push.

## P2 finding

### 1. Registry self-counterfactuals multiply every validation run by approximately four

Locations: `dev/validate-fixtures.mjs:245-285`, `dev/validate-fixtures.mjs:3607-3643`;
`.github/workflows/ci.yml:39-40,104-106`; `.github/workflows/npm-publish.yml:52-65`.

Control 389 launches three mutated copies of `dev/validate-fixtures.mjs`. Each nested runner has
`RUST_INTEL_SKIP_REGISTRY_COUNTERFACTUALS=1`, so recursion terminates, but it still executes the
other 388 registered IDs, including almost all of the 371 child-spawning controls. The outer run
therefore performs its ordinary suite plus three near-complete nested suites. This is not a small
constant-cost negative calibration; it repeats the repository's dominant cost.

Measured on Node `v24.12.0` / npm `11.13.0` on the same Windows worktree:

| Run | Result | Wall time |
|---|---|---:|
| `npm run validate` at unmodified `4d12509` | exit 0, `rust-intel validation passed (12 skill markdown files checked)` | 854.991 s |
| reduced direct fixture pass with nested registry counterfactuals skipped and only control 389 finalized by the review harness | exit 0, `fixture validation passed (2 cases; 389 controls executed)` | 215.160 s |

The ratio is 3.97x. The `validate` workflow runs this gate in both `repository-checks` and the exact
Node-floor job (concurrently, but consuming roughly twice the runner-minutes); the tag-triggered
publish workflow runs it again before publishing. For this prose/JavaScript repository, a routine
14-minute validator materially delays every commit and release and consumes about 28 runner-minutes
per validation workflow. This is a systemic-cost regression, not merely a test-style nit, so P2 is
proportionate even though the run remains below GitHub's default job timeout.

Correction: move the registry state machine behind a small reusable pure helper and exercise the
missing-ID, duplicate-ID, foreign-ID, omitted-middle-ID, and total/header-drift cases against a
synthetic 2–3-ID registry in-process or in a focused child. Keep exactly one full integration run of
the real 389-control suite. If source mutation is retained as integration evidence, add a focused
mode that executes only a tiny sentinel scope plus registry finalization; do not recursively replay
all unrelated validator fixtures. Preserve the body-removal and add-next semantics described under
P3-1 while bringing a complete `npm run validate` back near one suite-equivalent.

## P3 findings

### 1. A tautological accounting assertion can hide removal of a semantic control body

Locations: `dev/validate-fixtures.mjs:90-153`, `dev/validate-fixtures.mjs:293-307`,
`dev/validate-fixtures.mjs:3598-3636`.

The registry now distinguishes registration from assertion-helper invocation and records every ID
individually. That closes the narrower defect where one helper call completed an entire range.
However, 34 sites use `assertControlOutcome(true, ...)` solely as accounting markers. For example,
control 1 performs its actual README mutation and result checks in a preceding block, then calls the
unconditional helper separately. Removing that whole semantic block while retaining
`observeControls(1)` and `assertControlOutcome(true, ...)` still marks ID 1 observed and successful.

Independent counterfactual in a temporary copy:

1. delete only control 1's README mutation/result-check block;
2. retain its source label, `observeControls(1)`, and `assertControlOutcome(true, ...)`;
3. use a review-only focused completion for control 389 so the intentionally skipped recursive
   self-counterfactual does not dominate the experiment;
4. run the otherwise complete fixture runner.

The mutated runner exited 0 and printed
`fixture validation passed (2 cases; 389 controls executed)` in 215.160 seconds. Thus the release
word “executed” currently means “an accounting helper ran,” not “the numbered semantic probe ran.”
Running the unmodified recursive control 389 would not change this result: none of its three
mutations targets control 1.

The shipped body-removal counterfactual is circularly narrow: it deletes control 389's entire own
counterfactual block, including the `expectFixture` invocation that observes 389, and then confirms
that 389 is missing. It does not remove a representative control's semantic body while retaining
that control's separate unconditional assertion marker. The omitted-middle test is better: it
removes the code-table delimiter iteration and correctly expects ID 9 missing. The add-next test is
also weaker than its prose: it changes `CONTROL_REGISTRY_TOTAL` from 389 to 390, inserts a fabricated
always-passing `expectFixture` result, and then succeeds because the unchanged header disagrees with
the changed registry total. It does not test adding an asserted ID while leaving the executable
registry's declared total untouched.

`completeCurrentControlScope` also silently returns when an explicit ID was already observed
(`:145`), so duplicate assertion claims within one registered scope are not diagnosed. Default-ID
helpers can consume the next unobserved ID, which makes a duplicated assertion and an omitted
assertion capable of cancelling each other in ranges that do not pass explicit IDs.

Correction: make observation inseparable from the actual result predicate. Replace unconditional
`true` markers with assertion/outcome helpers that receive and check the relevant result, and pass
an explicit control ID at every numbered outcome site. Diagnose a repeated explicit ID rather than
silently returning. Add bounded counterfactuals that (a) remove a representative semantic probe
while its label/registration remain, (b) omit one middle result while duplicating a neighboring
result, and (c) add `observeControls(390)` plus a real outcome helper while leaving
`CONTROL_REGISTRY_TOTAL = 389`. The counterfactual oracle should assert the specific missing,
duplicate, or foreign-ID diagnostic, not only a header mismatch.

### 2. The ledger has no disposition for the round-28 fixing pass

Location: `docs/reviews/README.md:45`.

The ledger ends with the historical round-28 Open row at reviewed head `a5d833f`. It does not map
the follow-up commits or tell a future reviewer which findings actually closed:

- `99f5310` fixes round-28 P3-2's round-26 count attribution, adds the round-27 fixing disposition,
  and fixes P3-3's stale v0.6.0 checklist instruction.
- `ae39408`, `f276d09`, and `4d12509` successively implement source-masked registry parsing,
  assertion-bound accounting, and per-ID range accounting for P3-1, but P3-1 remains open for the
  body-removal/oracle reasons above.

Without that row, the current history appears to leave all three round-28 findings Open even though
two are closed and one is only partially integrated. This repeats the disposition gap earlier
rounds explicitly treated as P3.

Correction: add a distinct round-28 fixing-pass disposition with these four commit mappings and a
three-item closure matrix. Do not overwrite the historical Open review row and do not claim CI for
the unpushed local head.

## P4 observations

- Direct comment and template-literal registry declaration decoys are not presently named as
  dedicated controls. Independent mutation inserted both `// const CONTROL_REGISTRY_TOTAL = 777;`
  and a template containing a line-exact `const CONTROL_REGISTRY_TOTAL = 888;`; with nested fixtures
  skipped, `dev/validate.mjs` still exited 0. `maskJsNonCode` correctly left only the live 389
  declaration visible. This is working code, not a P3 finding; a cheap direct regression would be
  reasonable when P2-1 is refactored.
- The package still uses `NPM_TOKEN` with provenance. GitHub/npm trusted publishing could reduce
  long-lived-secret exposure, but it is optional hardening and does not invalidate the current
  release path.

## Round-28 closure matrix

| Round-28 item | Disposition at `4d12509` |
|---|---|
| P3-1: source labels do not prove executable controls | **Partially closed.** Runtime IDs are individually consumed by assertion/outcome helpers and the header/registry/labels/runtime report agree on 389. A retained tautological assertion still hides deletion of its semantic probe, and the self-counterfactual does not test that shape (this review's P3-1). |
| P3-2: ledger attribution and round-27 disposition | **Closed in code/docs, not disposed as round 28.** `99f5310` restores the historical 388 attribution and adds the round-27 fixing row. The absence of a round-28 fixing row is this review's P3-2. |
| P3-3: checklist says existing v0.6.0 is missing | **Closed.** README step 3 now requires retaining/verifying `v0.6.0 (2026-08-19)` and adding `v0.7.0` above it, with reverse chronology and blank separation. |

## Per-commit review

| Commit(s) | Result |
|---|---|
| `ce57929`..`a5d833f` (rounds 24–28 and their earlier fixes) | Historical review/release work remains coherent after the mapped-history qualifications. Action pins, Node floor, release sequence, Status, count propagation, and mirror state remain intact. Round 28 accurately identified the three gaps present at its head. |
| `ae39408` | Establishes a live registry, source-label masking, and initial runtime accounting, but its first form completed ranges as a unit and its recursive counterfactual architecture introduced the dominant cost. |
| `99f5310` | Correctly closes the stale v0.6.0 instruction and repairs round-26/27 attribution without claiming CI. It omits the required round-28 fixing disposition (P3-2). |
| `f276d09` | Correctly moves observation from registration to assertion/outcome helper calls. It still treats whole ranges as one completed scope and uses separate unconditional `true` markers. |
| `4d12509` | Correctly accounts individual IDs and catches an omitted explicit ID 9. It does not bind all IDs to semantic outcomes, reject repeated explicit assertion IDs, or provide noncircular representative body-removal/add-next controls (P3-1). |

## Release-readiness evidence

| Area | Evidence at `4d12509` |
|---|---|
| Version/status | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` remain `0.6.0`; README banner remains v0.6.0; Status and CHANGELOG call `0.7.0` planned. `node dev/check-release-version.mjs 0.6.0` passed. No release bump/tag/push occurred. |
| Release transition | README requires manifest bump, banner/Status conversion, a fresh empty Unreleased section, local gates, release commit, push of `main`, green `validate` on that exact SHA, then tag/publish. Step 3 correctly retains the existing v0.6.0 entry. |
| Fixture count | Full validation passed and the runtime registry reported all IDs consumed internally; header, registry, labels, README, CHANGELOG, and ledger say 389. Semantic execution authority remains overstated (P3-1). |
| Runtime cost | Integrated validation was 854.991 s; one reduced nonrecursive suite-equivalent was 215.160 s. Three nested near-full suites explain the 3.97x amplification (P2-1). |
| Toolchains | Local Node `v24.12.0`, npm `11.13.0`, rustc `1.97.0 (2d8144b78)`, Cargo `1.97.0 (c980f4866)`. Exact Node 24.0.0 was not locally available in this worktree; no CI result exists for the unpushed head. |
| Workflows/actions | `actionlint` passed. All seven `uses:` entries are full SHAs. Live refs still resolve to checkout v7 `3d3c42e...`, setup-node v7 `82076278...`, and rust-toolchain branch 1.97.0 `86e71974...`. Dependabot covers GitHub Actions monthly. |
| Mirror/category | `node dev/sync-mirror.mjs --check` passed for 13 files. Full validation checked 12 skill Markdown files and the derived 59-category contract. No normative skill file changed in the reviewed window. |
| Package/install surface | `npm pack --dry-run --json` passed: 38 entries, 609,163 bytes packed / 1,692,131 unpacked; both licenses, both skill layouts, installers, guard, Codex manifest, commands, README, and CHANGELOG are present. |
| Syntax/fixtures | JavaScript syntax checks, bash installer syntax, and rustc 1.97 metadata compilation for both Rust fixture files passed (only expected dead-code warnings). |
| Git/provenance | Nineteen local commits are ahead of `origin/main`; the head has not been pushed, so no CI is claimed. The round-28 fixing disposition is missing (P3-2). |
| Whitespace | `git diff --check origin/main..HEAD` passed. |

## Required correction order

1. Replace the three recursive near-full-suite counterfactual runs with bounded registry tests while
   retaining one real 389-control integration run (P2-1).
2. Bind every numbered ID to a real outcome predicate, require explicit IDs, reject repeated
   assertion IDs, and add representative/noncircular body-removal, duplicate-plus-omission, and
   foreign-next-ID controls (P3-1).
3. Add the exact round-28 fixing disposition and closure matrix to the ledger (P3-2).
4. Re-run the relevant validation/timing gates and a new independent review. Only a pass with no
   P0–P3 should authorize the explicit `0.7.0` bump and release sequence.
