# Round 26 review of the latest commits and v0.7.0 release readiness — 2026-09-06 13:36 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `535eb602fa7eed3325fbb3c3cfb8523299ccf7da`.
- Commit window: `origin/main..HEAD` — six commits, twelve files, `+739/-58`:
  `ce57929` (round-24 report), `5784fd2` (round-24 fixing pass), `c3714af` (round-25
  report), `c5aa58e` (release-document fixes), `ca5d24e` (action pins), and `535eb60`
  (Unicode-classifier hardening).
- The review was performed in an isolated detached worktree created from the exact requested head.
  Project files were not changed; this report and its open ledger row are the only authored changes.
- The complete round-24 and round-25 reports were read first. Each round-25 finding was traced into
  the current commits, and the rewritten provenance was compared with the old reviewed objects.
  `git diff e30bae3 ce57929` and `git diff efa62fb 5784fd2` are both empty: the rewritten
  report tree and combined fixing tree are byte-identical to the trees round 25 reviewed, even though
  the old commit chain is no longer an ancestor of the current head.
- Whole-repository release readiness covered README Status/banner/checklist, CHANGELOG, the review
  ledger, all three manifests, both workflows and Dependabot, release helpers, the fixture runner,
  canonical/mirror skill trees, package contents, Node/Rust pins, and install surfaces. The six-commit
  window does not change normative `skill/*.md` or `skill/audit-project.workflow.js`, so no new Rust
  category or red-tier rule surface was introduced by this window.
- External state was re-read rather than assumed: npm registry publication metadata and all three
  action refs behind the pinned SHAs. The seven workflow `uses:` entries are full 40-character SHAs;
  the refs still resolve to the exact pinned values recorded in `ca5d24e`.

## Executive result

- **No P0, P1, or P2 finding.** Round 25's workflow-supply-chain P2 is closed: all seven action
  invocations are pinned, the same checkout/setup-node SHAs are used across workflows, and monthly
  GitHub Actions Dependabot updates are configured.
- **Four P3 findings remain.** The current control count is stale in release-facing prose; the
  Unicode classifier's claimed branch-order regression is not a property of its disjoint patterns;
  the post-rewrite round-25 disposition is absent; and two current changelog passages still assert
  that Git tags are immutable after the scripts were corrected for the opposite fact.
- **Round-25 closure is functionally strong but not record-complete.** Its action-pin P2, Unicode
  result acceptance, release transition, historical dates/tag record, and script headers are fixed.
  The remaining defects are current-state documentation, calibration accuracy, and provenance.
- **Release verdict: NOT READY for the `v0.7.0` tag.** Runtime, manifests, category count, mirrors,
  package contents, workflows, and executed validation are coherent, but this project's release gate
  explicitly requires a fresh pass with no P0–P3. Close the four P3s and review again before the
  authorized version-bump/tag sequence.

## P3 findings

### 1. The 384-control suite is still advertised as 379 controls in current release state

Locations:

- `README.md:46` — current Unreleased Status paragraph;
- `README.md:261` — release checklist's stated current value;
- `CHANGELOG.md:65` — current Net tooling state;
- `docs/reviews/README.md:36,38` — one explicitly current ledger claim and one historical/current
  phrase that no longer distinguishes the round-23 count from the current count;
- contrasted with `dev/validate-fixtures.mjs:5,10,3210-3226` — 384 total, 366 spawning and 18
  in-process controls.

Commit `535eb60` correctly raised the runner header from 379 to 384 after adding controls 380–384,
but it did not update any of the release-facing current-count claims. This is precisely the drift the
release checklist says to re-check, and `npm run validate` remains green because it does not compare
those current prose values with the fixture header.

Correction: update the README Status/checklist and CHANGELOG net state to 384. Preserve 375 and 379
where they are revision-qualified historical evidence, but replace ambiguous uses of "current" with
an explicit revision or a supersession sentence. Add a validator regression that derives the fixture
header's total and rejects a stale current README/CHANGELOG count, or remove the duplicated current
number from prose that does not need it.

### 2. Controls 380–384 do not establish the claimed classifier-order dependency

Locations: `dev/validate-fixtures.mjs:3191-3226`; commit `535eb60` body.

The functional classifier is strict and correct: status 0 accepts only the validator's exact success
line; status 1 accepts only the exact Unicode diagnostic; the specific increment/decrement mutation,
unrelated status 1, and execution failure are rejected. Controls 380–384 cover those five outcomes.

However, `intentionalInvalidUnicodeOutput` and `falseWorkflowMutationOutput` are anchored, disjoint
regular expressions. Swapping their two `if` statements leaves every result unchanged. The comment
claims that both containing `workflow` makes the order load-bearing, and the commit body claims an
"classifier-order regression" control; neither claim is true for the code that landed. Control 381
would catch reintroducing the old broad `output.includes('workflow')` rejection ahead of the exact
allowance, but that is a predicate-width regression, not a reversal of the current two branches.

Correction: keep the strict classifier and rewrite the comment/provenance to state what the negative
controls really establish. If branch order itself is intended to be a contract, introduce a genuinely
overlapping broad predicate and a mutation test; doing so would be more complex and offers no benefit
over the current disjoint exact patterns.

### 3. Round 25 remains marked Open without a post-rewrite fixing disposition

Locations:

- `docs/reviews/README.md:40` — still says every round-25 item remains open and that no fixing pass
  exists;
- `docs/reviews/latest-commits-review-round-25-2026-09-06-1310.md:5-9,195-214` — describes the old
  four-commit topology (`e30bae3`, `0cb335a`, `bd1b802`, `efa62fb`);
- current commits `ce57929`, `5784fd2`, `c5aa58e`, `ca5d24e`, and `535eb60`.

The report is valid historical evidence and its reviewed trees survive exactly: `e30bae3` and
`ce57929` have identical trees, as do `efa62fb` and `5784fd2`. The rewrite also repairs the actual
commit record: all six current commits have descriptive bodies, and `5784fd2` carries the ledger
disposition together with the fixes it describes. The current ledger nevertheless exposes only the
pre-fix Open row, so a reader cannot discover the mapping, which findings closed, or which checks
apply to the rewritten history.

Correction: replace or follow the Open row with an Integrated fixing-pass disposition that records
the two tree-equivalence mappings, the three round-25 fixing commits, and executed evidence. Keep the
round-25 report unchanged as a contemporaneous review, but make clear that its old hashes are
superseded provenance rather than the present branch topology.

### 4. The changelog still repeats the false Git-tag immutability premise

Locations: `CHANGELOG.md:159,207`; contrasted with `dev/check-release-version.mjs:4-8`,
`dev/set-release-version.mjs:4-7`, and `.github/workflows/npm-publish.yml:79-82`.

Round 25 correctly found that Git tags are movable refs. Commit `c5aa58e` fixes both script headers,
and the publish workflow already states that this repository has neither tag protection nor immutable
releases. Two release-note passages still say "a git tag is immutable and points at a specific tree"
as the reason for verify-not-rewrite. They are not harmless shorthand: the changelog is shipped in the
npm package and is the project's detailed release record, while the current workflow explicitly
depends on recognizing that the ref may move and comparing registry integrity on duplicate runs.

Correction: preserve the historical release event but correct its rationale: the release run must
publish the committed tree selected when the tag is resolved; rewriting the checkout would create an
artifact not represented by that tree, while the tag ref itself remains movable unless protected.

## P4 observations (non-blocking)

1. `dev/set-release-version.mjs:2,26` and the publish-workflow header abbreviate the sequence to
   "commit, then tag". The canonical README checklist correctly inserts `push main` and a green
   `validate` run on the exact SHA before tag creation. Pointing the helper output to that checklist
   would reduce operator ambiguity, but creating a local tag does not itself publish anything.
2. The green-before-tag gate remains procedural. A reusable required validation workflow or protected
   release environment could enforce it, but the current tag workflow independently reruns the
   validator and installer checks, and the documented order is internally sound.

## Round-25 closure matrix

| Round-25 item | Disposition at `535eb60` |
|---|---|
| P2-1: mutable action refs | **Closed.** Seven of seven `uses:` values are full SHAs; live refs match; monthly GitHub Actions Dependabot is present. |
| P3-2: invalid-Unicode legitimate diagnostic unreachable | **Functionally closed.** Exact quiet/intentional results are accepted and false/unrelated/execution failures rejected. The new order-calibration explanation is inaccurate (finding 2). |
| P3-3: stale README state / no fresh changelog Unreleased | **Closed as a release procedure.** Checklist steps 3–4 explicitly retire prepared state and create a new empty Unreleased section. The checklist's current numeric example drifted to 379 (finding 1). |
| P3-4: wrong v0.4.5/v0.5.1 dates / absent tag hidden | **Closed.** README and CHANGELOG use npm publication dates 2026-07-05 and 2026-08-14; the ledger explicitly records the missing `v0.5.1` repository tag. |
| P3-5: script headers call tags immutable | **Partially closed.** Both scripts are correct; two changelog repetitions remain (finding 4). |
| P3-6: subject-only/premature commit provenance | **Closed in rewritten history, not disposed in the ledger.** Current commits have bodies and the fixing claims land with their fixes; the old reviewed trees map byte-for-byte to the replacement trees (finding 3). |

## Per-commit review

| Commit | Result |
|---|---|
| `ce57929` — round-24 report | Descriptive body accurately states static-only verification. Its tree is identical to old `e30bae3`; no project code. |
| `5784fd2` — round-24 fixing pass | Descriptive body matches its combined tree and records the checks run at its 379-control state. Its tree is identical to old `efa62fb`; no premature forward claim remains. |
| `c3714af` — round-25 report | Substantive report and descriptive body. The report remains historically accurate, but the ledger needs the rewrite mapping and fixing disposition (finding 3). |
| `c5aa58e` — release-document fixes | Correct dates, missing-tag record, transition checklist, and script-header rationale. It leaves two false changelog repetitions (finding 4). |
| `ca5d24e` — action pins | Complete and accurate: seven pins, consistent SHAs, Dependabot, and a body recording the resolved refs and checks. All three refs were re-resolved successfully in this review. |
| `535eb60` — Unicode classifier | Functional outcome branches and new counts are correct. It regresses current-count prose (finding 1) and overstates the order calibration (finding 2). |

## Release-readiness evidence

| Area | Evidence at `535eb60` |
|---|---|
| Version state | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are all `0.6.0`; README banner is `v0.6.0`; CHANGELOG/Status describe `0.7.0` as planned. `node dev/check-release-version.mjs 0.6.0` passed. |
| SemVer decision | Node floor `16.7.0 -> 24.0.0` is a compatibility-breaking MINOR under the repository's 0.x policy; `0.7.0` is correct. No bump/tag/push was performed. |
| Category/mirror state | 59 numbered categories; `node dev/sync-mirror.mjs --check` passed for all 13 files. No normative skill file changed in the reviewed six commits. |
| Validator/fixtures | `npm run validate` passed on Node `v24.12.0`; the fixture source header records 384 controls (366 child-spawn + 18 in-process) and validation reported 12 skill Markdown files checked. Current prose still says 379 (finding 1). |
| JavaScript/workflow syntax | `node --check` passed for both validators, both installers, both release helpers, and the audit workflow. `actionlint` passed with no output. |
| Workflow supply chain | Seven `uses:` entries, seven full SHAs, zero unpinned. `git ls-remote` re-resolved checkout v7, setup-node v7, and rust-toolchain 1.97.0 to the pinned SHAs. Dependabot is monthly for `github-actions`. |
| Toolchains | Local review environment: Node `v24.12.0`, npm `11.13.0`, rustc `1.97.0` (`2d8144b7`), Cargo `1.97.0` (`c980f486`). CI pins Rust 1.97.0 and separately tests exact Node 24.0.0. |
| Package | `npm pack --dry-run --json` passed: 38 entries, 609,039 bytes packed / 1,691,793 unpacked; package includes both licenses, both installers and Node guard, canonical and Codex mirrors, Codex manifest, commands, README and CHANGELOG. |
| Install surfaces | Both installers and their packaged paths are unchanged by this six-commit window; the nested validator suite and prior round-25 fresh installer smokes remain applicable. Syntax checks passed in this review. A second destructive temporary-install smoke was not needed for the docs/workflow/classifier-only delta. |
| Status/dates/tags | Status is reverse chronological and separated correctly; npm publication dates match, including 0.4.5 = 2026-07-05 and 0.5.1 = 2026-08-14. The absent `v0.5.1` tag is disclosed. Current control count is stale (finding 1). |
| Diff hygiene | `git diff --check origin/main..HEAD` passed before this report. The isolated worktree was clean before report authoring. |
| CI availability | No CI run can exist for the unpushed local head. The eventual release checklist correctly requires a green `validate` run on the exact release SHA before pushing `v0.7.0`. |

## Required correction order

1. Update and mechanically pin the current 384-control claims (P3-1).
2. Correct the Unicode calibration/order explanation and provenance wording (P3-2).
3. Record the round-25 post-rewrite fixing disposition and mappings (P3-3).
4. Correct the remaining changelog tag-immutability statements (P3-4).
5. Run a new independent review. Only a pass with no P0–P3 should authorize the explicit
   `0.7.0` bump, release commit, branch CI gate, tag, and publish sequence.
