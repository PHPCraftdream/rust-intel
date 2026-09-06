# Round 30 review of the latest commits and v0.7.0 release readiness — 2026-09-06 20:14 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `e5989b26b6689db79e396fa9fd07866e66dbbb7a`.
- Commit window: `origin/main..HEAD` — twenty-three commits, sixteen changed files, `+2257/-284`
  before this report. The complete window and the whole repository state needed for the planned
  `0.7.0` release were inspected in an isolated linked worktree.
- Round 29 was read in full. Its one P2 and two P3 findings were traced through `f085c36`,
  `b2f7f37`, and `e5989b2`. The round-28 historical Open row and its distinct fixing disposition
  were also checked rather than inferred from the newer commit messages.
- The registry was challenged counterfactually with its implementation extracted from the
  reviewed source: a representative semantic body was removed while registration and the current
  failure-baseline completion expression were retained; duplicate-plus-omission and foreign-next-ID
  paths were exercised separately. These are bounded in-process checks, not recursive replays of
  the 389-control suite.
- One complete `npm run validate` was run and timed. Release manifests, banner/Status/changelog
  transition, checklist ordering, workflows, immutable action refs, Dependabot, package contents,
  installer/package surfaces, mirror/category state, tags, and commit provenance were reviewed.
- No product, version, tag, workflow, package, or remote ref was changed. This report and its Open
  ledger row are the only authored changes.

## Executive result

- **No P0, P1, or P2 finding.** Round 29's runtime-cost P2 is closed: the complete validator took
  **240.136 seconds**, near the fixing commit's direct 389-control fixture time of 237.722 seconds,
  and no recursive near-full registry replay remains.
- **Three P3 findings remain.** Twenty live controls still complete through deletion-blind global
  failure-count equality markers, with a default-true completion API; control 389 does not exercise
  the representative retained-completion or foreign-registration counterfactuals it claims; and
  the ledger has no round-29 fixing disposition.
- The numeral **389** is internally aligned across the scope header, registry declaration,
  contiguous source labels, successful runtime registry finalization, README Status/checklist,
  CHANGELOG, and ledger. This proves ID accounting at the current implementation boundary. It does
  not prove that every advertised semantic body ran: the bounded body-removal counterfactual below
  finalizes successfully.
- Release surfaces outside those findings are coherent. The three manifests and README banner stay
  at `0.6.0`; Status and CHANGELOG identify `0.7.0` as the planned MINOR release; the checklist
  preserves a fresh Unreleased section and requires green validation on the exact release SHA
  before tagging; all seven workflow actions are full-SHA pinned and covered by monthly Dependabot.
- **Release verdict: NOT READY for `v0.7.0`.** The repository's clean-review gate requires no
  P0–P3. Close the three P3s and run another independent review before an explicitly authorized
  version bump, tag, or push.

## P3 findings

### 1. Twenty completion predicates remain semantic-body-deletion blind

Locations: `dev/validate-fixtures.mjs:153`, `dev/validate-fixtures.mjs:294-307`,
`dev/validate-fixtures.mjs:311-328`, `dev/validate-fixtures.mjs:352-404`,
`dev/validate-fixtures.mjs:675-740`, `dev/validate-fixtures.mjs:1689-1725`,
`dev/validate-fixtures.mjs:1918-1965`, `dev/validate-fixtures.mjs:2110-2173`,
`dev/validate-fixtures.mjs:2286-2349`, `dev/validate-fixtures.mjs:2439-2480`, and
`dev/validate-fixtures.mjs:3352-3368`.

`e5989b2` removed the old `assertControlOutcome(true, ...)` spelling, but twenty custom controls now
use the equivalent shape:

```js
const control1FailureBaseline = failures.length;
// semantic mutation and result checks
completeCurrentControlScope(1, failures.length === control1FailureBaseline);
```

Removing the semantic mutation/result-check block while retaining the label, registration,
baseline, and completion leaves the predicate true. The completion API compounds the problem by
declaring `outcome = true`, so a future one-argument call is itself an unconditional accounting
success.

Bounded counterfactual against the `createControlRegistry` function extracted from this revision:

1. create a one-ID registry and call `register(1)`;
2. retain an empty `failures` array and its baseline, representing a removed control body;
3. call the exact current predicate, `complete(1, failures.length === baseline)`;
4. finalize.

The result was `body-removed=[]`: no diagnostic. Therefore “389 controls executed” can still mean
that the accounting epilogue ran after its semantic probe was deleted. The current green suite
does not close round-29 P3-1.

Correction: remove the default-true outcome. For every custom control, derive a local `passed`
value directly from the concrete child result or scoped semantic observation and feed that value to
completion; deleting the producer must leave an undefined/false outcome, not a true global-count
comparison. Add a focused source-mutation counterfactual that removes at least one real child probe
and one in-process probe while retaining their comments, registrations, and completion call, then
requires the specific false/missing-outcome diagnostic.

### 2. Control 389's synthetic calibrations do not cover the failure shapes they claim

Locations: `dev/validate-fixtures.mjs:3597-3662`.

The named “Control 1 semantic body removed while registration remains” case creates a fresh
registry, registers ID 1, omits completion entirely, and observes that finalization reports the
missing ID. It does not retain the live control's completion expression, which is the counterfactual
that exposes finding 1. The forbidden-pattern scan checks only the retired
`controlScopePassed`/`assertControlOutcome(true` spellings, so the current
`failures.length === ...FailureBaseline` and default-true completion forms pass it.

The “foreign explicit outcome” case registers **389**, then completes **390**. Round 29 required the
different next-ID boundary: register 390 and invoke its real outcome while the declared registry
stays 389. The shipped case also creates a 389-ID registry while registering only one valid ID;
`finalize()` emits **779 diagnostics**, but `expectRegistryCase` merely checks that one expected
string is included and ignores the other 778. The bounded requested foreign-registration path
(`register(390); complete(390, true)`) was rejected, but produced 780 diagnostics because the
calibration does not first satisfy the declared IDs; no shipped exact oracle pins this behavior.

The duplicate-plus-omission helper behavior itself is sound: an extracted three-ID case emitted the
duplicate-ID diagnostic plus both missing-ID diagnostics. The gap is the shipped calibration's
ability to distinguish the intended causal diagnostic set from a broadly broken registry.

Correction: exercise a small fully-satisfied registry, then add a foreign registration and outcome;
compare the complete sorted diagnostic list, not a subset. Do the same for duplicate-plus-omission.
Replace the obsolete forbidden-name scan with an actual retained-completion source mutation (or a
focused runner mode that executes only sentinel controls and registry finalization), without adding
another near-full-suite replay.

### 3. The ledger has no disposition for the round-29 fixing pass

Location: `docs/reviews/README.md:47`.

The ledger stops at the historical round-29 Open row for reviewed head `4d12509`. It does not map
the subsequent commits or state what they actually closed:

- `f085c36` replaces the recursive registry counterfactuals with bounded in-process helper cases,
  closing round-29 P2-1's runtime amplification.
- `b2f7f37` supplies the distinct round-28 fixing disposition, closing round-29 P3-2.
- `e5989b2` makes IDs explicit and rejects duplicate completed IDs, but only partially addresses
  round-29 P3-1 because findings 1–2 above remain.

Without a separate fixing row, the committed record leaves all round-29 findings Open and gives no
revision-qualified closure state for the current head. This is the same provenance obligation that
the earlier review cycles and the repository's own review-quality gate require.

Correction: retain the historical Open row and add a round-29 fixing-pass disposition mapping these
three commits item by item. Mark runtime and round-28 disposition closed, semantic execution only
partially integrated, and make no CI/version/tag/push claim for the unpushed head.

## P4 observations

- `dev/validate-fixtures.mjs:1725` completes control 116 against
  `control115FailureBaseline`. It happens to be correct when control 115 passes, while a control-115
  failure already fails the whole run, but it creates a misleading cross-control dependency. Give
  control 116 its own baseline or, preferably, a direct local semantic predicate while correcting
  P3-1.
- Commit messages `f085c36` and `e5989b2` contain literal `\n\n` text between body paragraphs
  rather than actual paragraph separators. Their substantive provenance is still readable, so this
  does not justify rewriting published/local history by itself; future commits should pass a real
  multiline body.

## Round-29 closure matrix

| Round-29 item | Disposition at `e5989b2` |
|---|---|
| P2-1: recursive counterfactual runtime amplification | **Closed.** `f085c36` replaced the recursive near-full replays with bounded in-process registry tests. The complete run took 240.136 s, approximately one direct-suite equivalent rather than the former 854.991 s / 3.97x shape. |
| P3-1: tautological accounting can hide a removed semantic body | **Partially integrated, still open.** Explicit per-ID completion and duplicate detection are improvements, but twenty failure-baseline predicates and the default-true completion API retain the deletion-blind shape. Control 389 does not test a retained current completion expression. |
| P3-2: no round-28 fixing disposition | **Closed by `b2f7f37`.** The historical round-28 Open row is preserved and a distinct fixing row maps `ae39408`, `99f5310`, `f276d09`, and `4d12509` with accurate partial closure. The missing round-29 fixing disposition is a new record gap (this review's P3-3). |

## Release-readiness evidence

| Area | Evidence at `e5989b2` |
|---|---|
| Full validator/runtime | `npm run validate` exited 0 in **240.136 s** on Node `v24.12.0` / npm `11.13.0`. No recursive registry-counterfactual environment or near-full replay remains. |
| Registry counterfactuals | Extracted-helper checks produced `body-removed=[]`; duplicate-plus-omission produced the duplicate diagnostic and both missing-ID diagnostics; foreign registration/outcome produced the undeclared-ID diagnostic but 780 total diagnostics. The shipped foreign-outcome case itself produces 779 diagnostics and checks only one. |
| Version/status | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are `0.6.0`; README banner is `v0.6.0`; Status and CHANGELOG identify planned MINOR `0.7.0`. `node dev/check-release-version.mjs 0.6.0` passed. No bump was performed. |
| Release transition | README requires manifest bump; banner/Status conversion; fresh empty Unreleased plus versioned changelog section; local checks; release commit; push of `main`; green `validate` on that exact SHA; only then tag and publish. The v0.6.0 Status entry is retained. |
| Counts | Header, registry declaration, contiguous source labels, runtime finalization, README, CHANGELOG, and ledger say 389. Semantic-body authority remains overstated by P3-1/P3-2. |
| Workflows/actions | `actionlint` passed. All seven `uses:` values are full SHAs. Live refs resolve to checkout v7 `3d3c42e...`, setup-node v7 `82076278...`, and rust-toolchain 1.97.0 `86e71974...`. Dependabot covers GitHub Actions monthly. |
| Toolchains | Local rustc `1.97.0 (2d8144b78)` and Cargo `1.97.0 (c980f4866)` match the CI pin. Exact Node 24.0.0 was not locally installed; the unpushed reviewed head has no CI result. |
| Mirror/category | `node dev/sync-mirror.mjs --check` passed for 13 files. Full validation checked 12 skill Markdown files and the 59-category contract. No normative skill file changed in this window. |
| Package/install surface | `npm pack --dry-run --json` passed: 38 entries, 609,163 bytes packed / 1,692,131 unpacked; both licenses, both skill layouts, both npm installers, the Node guard, Codex manifest, Claude commands, README, and CHANGELOG are present. Installer code is unchanged in the reviewed window. |
| Syntax/format | Both validator scripts and all release/install/workflow JavaScript entry points passed `node --check`; shell installers passed `bash -n`; `git diff --check origin/main..HEAD` passed. |
| Git/provenance | Twenty-three commits are ahead of `origin/main`; no remote branch contains `e5989b2`, so no CI/push claim is made. Repository tags contain v0.6.0 and omit v0.5.1, matching the ledger's explicit historical note. Commit-body escaping is noted under P4. |

## Required correction order

1. Replace every failure-baseline/default-true completion with a direct local semantic predicate and
   make absence of that predicate fail closed (P3-1).
2. Make control 389 exercise retained current completion, exact duplicate-plus-omission, and actual
   foreign-registration-plus-outcome paths in a bounded focused harness (P3-2).
3. Add the round-29 fixing disposition with exact commit mappings and partial closure state (P3-3).
4. Run one complete timed validation and another independent review. Only a pass with no P0–P3
   should authorize the explicit `0.7.0` bump and release sequence.
