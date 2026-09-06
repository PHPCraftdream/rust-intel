# Round 27 review of the latest commits and v0.7.0 release readiness — 2026-09-06 14:21 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `d9691394fc1244e686425d7253ba6eedcf086eb3`.
- Commit window: `origin/main..HEAD` — ten commits, thirteen files, `+1016/-63`:
  `ce57929`, `5784fd2`, `c3714af`, `c5aa58e`, `ca5d24e`, `ae4df09`, `b722667`,
  `2890ea5`, `cb34859`, and `d969139`.
- The review was performed in an isolated linked worktree created from the exact requested head.
  No implementation or release artifact was changed; this report and its open ledger row are the
  only authored changes.
- The complete round-24, round-25, and round-26 reports were read first. Every round-26 finding was
  traced into the current tree, and the post-review rewrite was checked by object and tree identity.
  The historical `535eb60` object and current `ae4df09` have the same tree
  (`bdf337e172b1724fa5c549e80ce8fd8b078ee94b`), but only `ae4df09` is an ancestor of the reviewed
  head.
- Whole-repository release readiness covered README Status/banner/checklist and release transition,
  CHANGELOG, the review ledger, all manifests, category and fixture counts, canonical/mirror skill
  trees, both workflows and Dependabot, release helpers, package contents, Node/Rust pins, and the
  Claude/Codex installer surfaces. The ten-commit window contains no normative change under
  `skill/` or `skills/rust-intel/`; this pass therefore checked their release integrity and mirror
  identity rather than claiming a new semantic audit of all 59 already-reviewed category bodies.
- External claims were re-read from their authoritative state: npm publication metadata, repository
  tags, and the three upstream Git refs named by the workflow-pin comments.

## Executive result

- **No P0, P1, or P2 finding.** The functional validator, Unicode classifier, runtime floor,
  release workflows, action pins, package, manifests, category routing, mirror, and installers all
  passed the applicable independent checks.
- **Four P3 findings remain.** Round 26's false classifier-order explanation survives in source
  comments; one ledger row still calls 384 the current control count; rewritten-history mappings and
  the round-26 fixing disposition are incomplete; and the new fixture-count check synchronizes
  copies to a hand-maintained header without proving that the header equals the actual numbered
  suite.
- **Round-26 closure is incomplete.** Its Git-tag language is fixed and the current public
  README/CHANGELOG counts are 388. Its Unicode-comment finding remains open, while the count and
  provenance fixes introduced fresh or surviving ledger inaccuracies.
- **Release verdict: NOT READY for the `v0.7.0` tag.** The release mechanics and executable checks
  are healthy, but the repository's own gate requires a new independent pass with no P0–P3. Close
  the four P3s below, then review the resulting head again before the explicitly authorized version
  bump, release commit, branch-CI gate, tag, and publish sequence.

## P3 findings

### 1. The invalid-Unicode classifier comments still claim a nonexistent branch-order dependency

Locations: `dev/validate-fixtures.mjs:3224-3228,3240-3243`.

The implementation is correct and strict: status 0 accepts only the exact success line, status 1
accepts only the exact intentional Unicode diagnostic, the exact mutation diagnostic is rejected,
and unrelated/error outcomes are rejected. The two status-1 patterns are nevertheless anchored and
disjoint:

- `^ERROR: workflow invalid Unicode escape in identifier$`;
- `^ERROR: workflow (?:MODULES|AUDIT_UNITS) has an executable increment/decrement mutation$`.

Swapping the two `if` statements cannot change any classification. The surviving comments say that
the shared word `workflow` makes order load-bearing and that control 381 catches moving a broad
false-mutation check ahead of the intentional branch. There is no broad predicate in the current
classifier. Control 381 instead protects against reintroducing the former broad
`output.includes('workflow')`-style predicate. Commit `ae4df09`'s rewritten body already describes
that accurate predicate-width regression, so the source comments now contradict both the code and
its provenance.

Correction: keep the classifier and controls unchanged; rewrite both comments to say that control
381 rejects regression to the former over-broad workflow predicate. Do not claim current branch
order is observable.

### 2. The ledger still advertises 384 as the current control count

Location: `docs/reviews/README.md:36`; contrasted with `README.md:46`, `CHANGELOG.md:65`,
`dev/validate-fixtures.mjs:5-10`, and current ledger line 38.

The post-cycle-19 row says “the current 384-control state is recorded below.” The current tree and
the row two lines later both say 388. This is not a qualified historical occurrence: the sentence
uses “current” and therefore directly contradicts the reviewed head. It also contradicts
`d969139`'s body, which says that 384 was preserved only where it describes historical revisions.

Correction: identify the 384 state as the historical `ae4df09`/`2890ea5` fixing state and state that
the current tree has 388 controls, or remove the redundant current claim from this superseded row.
Extend the release-count check to the ledger if it continues to carry an unqualified current count.

### 3. Rewritten-history provenance and the round-26 fixing disposition are incomplete

Locations: `docs/reviews/README.md:40,42`.

The round-25 disposition calls `535eb60` one of “the three ... commits in the current history,” but
`git merge-base --is-ancestor 535eb60 HEAD` fails. The current corresponding commit is `ae4df09`;
`git diff 535eb60 ae4df09` is empty and both have tree
`bdf337e172b1724fa5c549e80ce8fd8b078ee94b`. The ledger records the earlier `e30bae3 → ce57929` and
`efa62fb → 5784fd2` mappings but omits this third rewrite mapping.

The round-26 row also remains Open and says it stays so until a subsequent fixing pass disposes of
it, although `2890ea5`, `cb34859`, and `d969139` are precisely that fixing pass. No row states which
round-26 items those commits closed, which remain open, which validation evidence applies, or that
the report's reviewed head `535eb60` maps tree-identically to current `ae4df09`. A reader following
the ledger therefore cannot reconstruct the current branch topology or the actual round-26
disposition.

Correction: replace the stale `535eb60` “current history” wording with the explicit
`535eb60 == ae4df09` tree mapping, and add an Integrated/Partially integrated round-26 fixing-pass
disposition naming `2890ea5`, `cb34859`, and `d969139`. Preserve the round-26 report as historical
evidence and do not claim CI for this unpushed head.

### 4. The fixture-count pin synchronizes prose to a hand-maintained number, not the number to the suite

Locations: `dev/validate.mjs:1767-1822`; `dev/validate-fixtures.mjs:5-10,185-215`.

The new check parses the numeral in the source comment
`Scope, stated honestly: 388 hand-written controls` and requires README Status, the README release
checklist, and current CHANGELOG prose to repeat it. Controls 385–388 establish those copy-sync
properties. Nothing, however, verifies that the header numeral equals the actual numbered controls
in the runner. Adding and executing a new control while leaving the header at 388 leaves the header,
README, checklist, and CHANGELOG mutually consistent and green. The mechanism therefore prevents
copy drift but does not make its claimed authoritative total mechanically true.

At the reviewed head, an independent static recount finds every declared control label from 1
through 388 represented with no gap, and the declared arithmetic `370` child-spawn plus `18`
in-process controls equals 388; the current count itself is correct. The defect is the missing
future-drift negative control behind the release-facing “mechanically pinned” claim.

Correction: make the runner register controls through a counted helper/registry, or add a structural
source check that proves a contiguous `1..headerTotal` set and rejects any numbered control above
the header. Add a counterfactual fixture that inserts/registers control 389 without changing the
header and proves validation fails. Keep the existing README/CHANGELOG copy-sync checks.

## Round-26 closure matrix

| Round-26 item | Disposition at `d969139` |
|---|---|
| P3-1: public release prose says 379 instead of 384 | **Mostly closed and superseded to 388.** README Status/checklist and current CHANGELOG agree with the 388 header. One ledger row still calls 384 current, and the header itself is not tied mechanically to the actual suite (findings 2 and 4). |
| P3-2: classifier-order explanation is false | **Open.** Functional semantics and `ae4df09`'s commit body are accurate; both source-comment blocks still claim order dependence (finding 1). |
| P3-3: no round-25 post-rewrite disposition | **Partially closed.** A disposition exists, but it names non-ancestor `535eb60` as current and omits its tree-identical `ae4df09` mapping; round 26 itself has no fixing-pass disposition (finding 3). |
| P3-4: changelog says Git tags are immutable | **Closed.** Current release documentation and helper headers consistently say the ref can move and the resolved committed tree must be published unchanged. Historical descriptions of the superseded workflow remain correctly scoped historical state. |

## Per-commit review

| Commit | Result |
|---|---|
| `ce57929` — round-24 report | Historical report with descriptive body; tree mapping from old `e30bae3` remains established. |
| `5784fd2` — round-24 fixing pass | Functional/documentation fixes retained; tree mapping from old `efa62fb` remains established. |
| `c3714af` — round-25 report | Historical review remains usable; current ledger needs the final rewrite mapping. |
| `c5aa58e` — release-document fixes | Status dates, release transition, and tag semantics are correct. |
| `ca5d24e` — immutable action pins | Seven full-SHA uses and monthly GitHub Actions Dependabot are coherent; all three upstream refs re-resolved to the recorded SHAs. |
| `ae4df09` — Unicode classifier | Runtime classifier and commit body are correct; source comments retain the false branch-order explanation (finding 1). |
| `b722667` — round-26 report | Accurate historical review of old head `535eb60`; current ledger needs its rewrite/fixing disposition. |
| `2890ea5` — round-26 documentation fixes | Tag text and most counts/provenance improve, but the commit's “close ... gaps” claim is incomplete because the Unicode comments were untouched and the mapping names old `535eb60` as current. |
| `cb34859` — fixture-count pin | Copy synchronization works and controls 385–388 are non-vacuous; the authoritative header is still hand-maintained (finding 4). |
| `d969139` — 388 count sync | README/CHANGELOG/current round-23 ledger text is correct; a second ledger row still says current 384 despite the commit body promising only historical 384 uses (finding 2). |

## Release-readiness evidence

| Area | Evidence at `d969139` |
|---|---|
| Version state | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are all `0.6.0`; the README banner is `v0.6.0`; README Status and CHANGELOG describe `0.7.0` as planned. `node dev/check-release-version.mjs 0.6.0` passed. No bump/tag/push was performed. |
| SemVer decision | The Node floor raise `16.7.0 → 24.0.0` removes a working install path and is MINOR under the repository's explicit 0.x policy. Planned `0.7.0` is correct. |
| Status/release transition | Status is reverse chronological from prepared Unreleased through v0.3.0, includes the backfilled v0.6.0 and v0.5.1 records, and matches npm dates. The checklist requires retiring prepared state, opening a fresh Unreleased section, pushing main, and waiting for green validation of the exact SHA before tagging. The repository has no v0.5.1 tag and the ledger discloses that. |
| Category/mirror state | 59 numbered categories; no normative skill delta in `origin/main..HEAD`; `node dev/sync-mirror.mjs --check` passed for all 13 mirrored files. |
| Validator/fixtures | `npm run validate` passed on Node `v24.12.0`. A second complete `dev/validate.mjs` run passed under exact Node `v24.0.0`. Static control-label extraction covers 1–388 without a gap, and 370 + 18 = 388. The header-to-suite pin remains incomplete (finding 4). |
| Unicode semantics | Long-leading-zero valid identifier escapes are recognized; >`0x10FFFF` and surrogate escapes are rejected as identifier spellings. Controls 378–384 execute and pass. The strict result classifier is functionally correct; only its comments are false (finding 1). |
| JavaScript/workflow syntax | `node --check` passed for both validators, both installers, both release helpers, `semver.mjs`, `sync-mirror.mjs`, and the audit workflow. `actionlint` passed with no output. `git diff --check origin/main..HEAD` passed. |
| Workflow supply chain | Seven `uses:` entries, all full 40-character SHAs. Live refs re-resolved exactly: checkout v7 = `3d3c42e...`, setup-node v7 = `82076278...`, rust-toolchain 1.97.0 = `86e71974...`. Dependabot is configured monthly for `github-actions`. |
| Toolchains | Local: Node `24.12.0`, npm `11.13.0`, rustc `1.97.0` (`2d8144b7`), Cargo `1.97.0` (`c980f486`). The exact Node 24.0.0 validator pass exercises the declared floor independently of CI. Both Rust fixture files compiled as libraries under rustc 1.97.0 (dead-code warnings only). |
| Package | `npm pack --dry-run --json` passed: 38 entries, 609,157 bytes packed / 1,692,102 unpacked. It includes package metadata, both licenses, both Node installers and the floor guard, canonical and Codex mirror skill trees, Codex manifest, commands, README, and CHANGELOG. `.claude-plugin/` remains intentionally git-marketplace-only. |
| Install surfaces | Fresh temporary Claude/npx-layout and Codex user-skill installs both succeeded; required skill, command, and evidence files landed. Repository and publish workflow installer checks remain aligned with those paths. |
| Tag semantics | Current helper/workflow/changelog language does not call tags immutable. It distinguishes a movable ref from the committed tree selected for a release and verifies duplicate-publication integrity rather than trusting version existence. |
| CI availability | No CI run can exist for this unpushed local head. The checklist correctly requires green `validate` on the exact release SHA before `v0.7.0`; no CI success is claimed here. |

## Required correction order

1. Correct the invalid-Unicode classifier comments without changing its working semantics (P3-1).
2. Repair the stale 384-current ledger sentence (P3-2).
3. Record `535eb60 → ae4df09` and the round-26 fixing-pass disposition (P3-3).
4. Tie the header total to actual registered/numbered controls and add the missing negative control
   (P3-4).
5. Run another independent review. Only a pass with no P0–P3 should authorize the explicit `0.7.0`
   bump and release sequence.
