# Round 31 review of the latest commits and v0.7.0 release readiness — 2026-09-06 21:10 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `ade44410194792e13792ecf54395d47590cab06b`.
- Commit window: `origin/main..HEAD` — twenty-seven commits, seventeen changed files,
  `+2529/-298` before this report. The complete window and the whole repository state needed for
  the planned `0.7.0` release were inspected in an isolated linked worktree.
- Round 30 was read in full and its three P3 findings were traced through `d3d1c0e`, `6255730`,
  and `ade4441`. The round-29 fixing disposition was checked directly in the ledger rather than
  inferred from a commit message.
- The current completion sites were checked for failure baselines, default outcomes, and direct
  semantic provenance. A bounded harness extracted the live registry helper and the exact current
  completion expressions for child-spawning control 1 and in-process control 115. It challenged
  body removal, an unconditional retained completion, and a duplicate completion without replaying
  the fixture suite recursively.
- One complete `npm run validate` was run and timed. Release manifests, README banner and Status,
  changelog transition, checklist ordering, workflows and action pins, Dependabot, package
  contents, installer/package surfaces, mirror/category state, tags, and provenance were reviewed.
- No product, version, tag, workflow, package, or remote ref was changed. This report and its Open
  ledger row are the only authored changes.

## Executive result

- **No P0, P1, or P2 finding.** Round 30's global-baseline/default-true implementation defect is
  closed in the live completion sites, the registry calibrations remain bounded, and the complete
  validator finished in **223.851 seconds**, close to one direct fixture-suite equivalent.
- **Two P3 findings remain.** Control 389 still does not run the representative retained-completion
  source mutations round 30 required and accepts the direct replacement
  `completeCurrentControlScope(<id>, true)`; and the ledger has no round-30 fixing disposition.
- The current child and in-process sites themselves fail closed under the bounded deletion
  challenge: deleting control 1's producer while retaining its exact completion expression raises
  `ReferenceError`, deleting control 115's semantic producer while retaining its initialized local
  predicate emits exactly `control 1 completed with a false outcome predicate` in the one-ID
  harness, and duplicating a completed ID emits exactly
  `executable control 1 was observed more than once`. The remaining defect is that the shipped
  release gate does not preserve those properties against a future accounting-only rewrite.
- The numeral **389** is aligned across the scope header, executable registry, contiguous source
  labels, successful runtime finalization, README Status/checklist, CHANGELOG, and ledger. The
  validator reported all 389 registered controls complete in the reviewed tree.
- Release surfaces outside the two findings are coherent. The three manifests and README banner
  remain at `0.6.0`; Status and CHANGELOG identify planned MINOR `0.7.0`; the checklist requires a
  fresh Unreleased section and green validation on the exact release SHA before tagging; all seven
  workflow action uses are immutable SHA pins and monthly Dependabot covers GitHub Actions.
- **Release verdict: NOT READY for `v0.7.0`.** Close both P3 findings and run another independent
  review before an explicitly authorized version bump, tag, or push.

## P3 findings

### 1. Control 389 does not preserve the real completion predicates against body-removal rewrites

Locations: `dev/validate-fixtures.mjs:153`, `dev/validate-fixtures.mjs:306`,
`dev/validate-fixtures.mjs:1691-1709`, and `dev/validate-fixtures.mjs:3614-3734`.

The live implementation is materially better than the round-30 head: completion has no default
outcome, no `FailureBaseline` remains, control 1 derives its outcome from the child result, and
control 115 initializes a local `passed = false` which becomes true only after its semantic
observation. Removing those current producers while retaining their exact completion calls fails
closed in the bounded harness.

Control 389 does not test that coupling. Its “retained child completion” and “retained in-process
completion” cases construct unrelated synthetic values that always pass. Its body-removal cases
either omit completion entirely or explicitly pass an undefined local. None mutates a real control
while retaining its label, registration, and completion call as round 30 required.

The source-pattern case also misses the simplest accounting-only regression:

```js
completeCurrentControlScope(1, true);
```

The bounded counterfactual replaced the exact current control-1 and control-115 completion lines
with that form. Control 389's four forbidden-pattern checks returned `[]`, and a registered one-ID
registry completed with that predicate and finalized with `[]`. Therefore a future edit can delete
a real semantic body, leave its label and registration, replace its completion with literal `true`,
and retain a green accounting gate. The obsolete `assertControlOutcome(true` scan does not cover
the live completion helper's spelling.

Correction: keep the current fail-closed predicates, but make control 389 perform bounded source
mutations of at least one actual child control and one actual in-process control. Retain each
control's source label, registration, and completion call while removing its semantic producer,
and require the complete causal diagnostic/result. Add a masked executable-source rejection for
literal-true `completeCurrentControlScope` outcomes, including whitespace/newline variants and a
comment/string decoy calibration, without spawning another near-full fixture replay.

### 2. The ledger has no round-30 fixing disposition

Location: `docs/reviews/README.md:49`.

The ledger correctly preserves round 30's historical Open row and now contains the round-29 fixing
disposition requested by round 30. It does not map the commits made after the round-30 review:

- `d3d1c0e` closes round-30 P3-3 by recording the round-29 fixing pass.
- `6255730` closes the global failure-baseline/default-outcome implementation defect and improves
  the bounded exact diagnostic cases, but only partially closes round-30 P3-1/P3-2 because finding
  1 above remains.
- `ade4441` closes the polluted foreign-registration calibration by satisfying IDs 1-3 before
  registering/completing foreign ID 4 and pinning the resulting two-diagnostic list.

Without a distinct fixing row, the repository record leaves every round-30 item Open even though
two are closed and one is only partially integrated. This is the same revision-qualified
provenance obligation applied in earlier rounds.

Correction: retain the historical round-30 Open row and add a separate round-30 fixing-pass row
mapping the three commits and the exact closed/partial state above. Make no CI, version, tag, or
push claim for the unpushed head.

## P4 observations

- Commit bodies for `6255730` and `ade4441` contain literal `\n\n` text between their intended
  paragraphs. Their substantive provenance is readable and rewriting local history is unnecessary
  for this release gate, but future multiline bodies should contain real line breaks.
- README Status's phrase “Unreleased (prepared, not tagged)” can be read as release-ready even while
  the clean-review gate is open. The paragraph's following sentences accurately say the release is
  only planned and the manifests remain at `0.6.0`, so this is editorial ambiguity rather than a
  false release-state claim. “In preparation, not tagged” would be clearer until the final clean
  review.

## Round-30 closure matrix

| Round-30 item | Disposition at `ade4441` |
|---|---|
| P3-1: twenty deletion-blind failure-baseline/default-true completion paths | **Implementation closed; regression proof partial.** `6255730` removes the default outcome and every failure baseline, and the former custom sites now derive completion from local semantic results. The shipped control 389 still does not bind that property to representative real controls and misses literal-true completion, so finding 1 remains. |
| P3-2: polluted/incomplete control-389 calibrations | **Partially closed.** Exact complete diagnostic arrays now cover missing outcome, duplicate-plus-omission, foreign registration/completion after satisfying the valid set, header drift, and declaration decoys; `ade4441` removes unrelated missing-ID noise from the foreign case. The requested real retained-completion source mutations are still absent. |
| P3-3: no round-29 fixing disposition | **Closed by `d3d1c0e`.** The historical Open row is retained and the fixing row maps `f085c36`, `b2f7f37`, and `e5989b2` to their actual closure state. The missing round-30 fixing disposition is a new record gap (this review's finding 2). |

## Release-readiness evidence

| Area | Evidence at `ade4441` |
|---|---|
| Full validator/runtime | `npm run validate` exited 0 in **223.851 s** on Node `v24.12.0` / npm `11.13.0`, reporting 12 skill Markdown files checked. No recursive fixture-suite replay or registry-counterfactual environment remains. |
| Bounded registry challenge | Exact current child control 1 producer removal raised `ReferenceError`; current in-process control 115 producer removal retained `passed = false` and emitted exactly the false-outcome diagnostic; duplicate completion emitted exactly the duplicate-ID diagnostic. Replacing either live completion with literal `true` escaped all four shipped forbidden-pattern checks and finalized a one-ID registry without diagnostics. |
| Round-30 implementation cleanup | No `FailureBaseline`, default-true completion signature, or `assertControlOutcome(true` remains. The former custom sites feed local child/in-process observations to completion. Control 116 no longer depends on control 115's baseline. |
| Registry calibrations | Eleven bounded in-process cases compare complete ordered diagnostic arrays. Duplicate-plus-omission and header drift are exact; the foreign case first satisfies declared IDs 1-3, then registers/completes 4 and expects only its two causal diagnostics. Real source-mutation coverage remains open under P3-1. |
| Version/status | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are `0.6.0`; README banner is `v0.6.0`; Status and CHANGELOG identify planned MINOR `0.7.0`. `node dev/check-release-version.mjs 0.6.0` passed. No bump was performed. |
| Release transition | README requires manifest bump, banner/Status conversion, fresh empty Unreleased plus versioned changelog section, local checks, release commit, push of `main`, green `validate` on that exact SHA, and only then tag/publish. The complete Status history from v0.3.0 through v0.6.0 agrees with CHANGELOG dates. |
| Counts | Header, registry declaration, contiguous labels, runtime finalization, README, CHANGELOG, and ledger say 389. The runtime registry established registration and completion for all 389 IDs at this head. |
| Workflows/actions | `actionlint` passed. All seven `uses:` values are full SHAs. Live refs resolve to checkout v7/v7.0.1 `3d3c42e...`, setup-node v7/v7.0.0 `82076278...`, and rust-toolchain branch 1.97.0 `86e71974...`. Dependabot covers GitHub Actions monthly. |
| Toolchains | Local rustc `1.97.0 (2d8144b78)` and Cargo `1.97.0 (c980f4866)` match the CI pin. Exact Node 24.0.0 was not locally installed; the unpushed reviewed head has no CI result. |
| Mirror/category | `node dev/sync-mirror.mjs --check` passed for 13 files. Full validation checked 12 skill Markdown files and the 59-category contract. No normative skill file changed in `origin/main..HEAD`. |
| Package/install surface | `npm pack --dry-run --json` passed: 38 entries, 609,163 bytes packed / 1,692,131 unpacked; both licenses, both skill layouts, both npm installers, the Node guard, Codex manifest, Claude commands, README, and CHANGELOG are present. npm registry metadata contains releases through `0.6.0` and no `0.7.0`. |
| Syntax/format | Both validators, installers, release helpers, mirror helper, semver helper, and the canonical workflow script passed `node --check`; shell installers passed `bash -n`; `git diff --check origin/main..HEAD` passed. |
| Git/provenance | Twenty-seven commits are ahead of `origin/main`; no remote branch contains `ade4441`; tag `v0.7.0` is absent. No CI, push, release, or publication claim is made for this head. |

## Required correction order

1. Add bounded real child and in-process retained-completion source mutations plus the masked
   literal-true/decoy guard to control 389 (P3-1).
2. Add a distinct round-30 fixing disposition with exact commit mappings and partial state (P3-2).
3. Re-run one complete timed validation and another independent review. Only a result with no
   P0-P3 should authorize the explicitly requested `0.7.0` release bump and release sequence.
