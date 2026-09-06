# Round 28 review of the latest commits and v0.7.0 release readiness — 2026-09-06 15:04 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `a5d833fb380c76d7cb7c19b13f81df09ed5e68c8`.
- Commit window: `origin/main..HEAD` — fourteen commits, fourteen files, `+1247/-63` before this
  report. The pass reviewed every commit and the complete repository state needed for the planned
  `0.7.0` release.
- The review ran in an isolated linked worktree created at the exact requested head. No product,
  version, tag, or workflow file was changed; this report and its Open ledger row are the only
  authored changes.
- Round 27 was read in full and each of its four P3 findings was traced through `7fcb71f`,
  `1863bef`, and `a5d833f`. The pass also rechecked Unicode-comment exactness, current fixture-count
  propagation, ledger mappings/dispositions, the structural count parser and its claimed
  counterfactual, action pins and Dependabot, release-state transitions, manifests, banner,
  CHANGELOG, workflows, package contents, installers, mirror identity, category ownership, and
  provenance.

## Executive result

- **No P0, P1, or P2 finding.** The current validator and Unicode result classifier are
  functionally healthy; action refs remain pinned to their live upstream SHAs; the Node/Rust pins,
  package, mirror, installers, manifests, and release workflow all pass their applicable checks.
- **Three P3 findings remain.** The new control-count mechanism counts comments rather than
  executable controls; the ledger misattributes the 389 transition and does not dispose of round
  27; and the release checklist still instructs maintainers to back-fill a Status entry that is
  already present.
- **The current numeral 389 is correct as a label inventory:** independent extraction finds a
  contiguous, duplicate-free set `1..389`, and README Status/checklist, current CHANGELOG prose,
  the fixture header, and current ledger prose all repeat 389. That agreement does not prove 389
  executable controls: deleting an entire control body while retaining its label leaves full
  validation green (P3-1).
- **Round-27 closure is partial.** Its Unicode-comment and stale-current-count findings are closed.
  Its provenance finding is only partially closed, and its header-to-suite authority finding
  remains open because the replacement registry is not connected to test execution.
- **Release verdict: NOT READY for `v0.7.0`.** The planned MINOR classification and unbumped
  `0.6.0` pre-release state are correct, but this repository's clean-review gate requires another
  fixing pass and a subsequent review with no P0–P3 before the explicitly authorized bump and
  release sequence.

## P3 findings

### 1. The structural fixture count registers source comments, not executed controls

Locations: `dev/validate.mjs:1782-1814`; `dev/validate-fixtures.mjs:3277-3290`.

The new parser declares that a line-start comment such as `// Control 389:` is the registration
grammar, expands singular/range labels, and proves that those labels cover `1..headerTotal` exactly
once. That is a useful label-integrity invariant, but it does not establish the release-facing
claim that the runner has 389 controls. No parsed registration is connected to an assertion,
`expectFixture` call, loop iteration, or executed child probe. A comment can survive after its test
body is deleted, or can be added without any test body, and still contributes one control.

The shipped counterfactual demonstrates only the same comment grammar: control 389 adds
`// Control 390: ...` and expects the label parser to reject it. Its own comment explicitly says
the added label is never executed. It therefore cannot prove the missing label-to-execution
relationship.

Independent counterfactual: in a temporary copy of the reviewed tree, the complete executable
body of control 389 (`dev/validate-fixtures.mjs:3281-3290`) was removed while its `// Control 389:`
label was retained. A full `node dev/validate.mjs` still exited 0 with
`rust-intel validation passed (12 skill markdown files checked)`. The header, README, CHANGELOG,
and label set remained mutually consistent even though one advertised control no longer ran.

Correction: register controls in executable code through a counted helper/registry and make every
control execution pass through it, or instrument the runner so completion reports an independently
observed executed-control set. The validator should compare that set/count to the header and
release prose. Add counterfactuals that remove/bypass an executable control while preserving its
label and that add executable control behavior without updating the declared total. A source-label
inventory can remain as a secondary documentation check, not as the authority for execution.

### 2. The review ledger's current fixing provenance is inaccurate and incomplete

Locations: `docs/reviews/README.md:42-43`.

The round-26 disposition says `d969139` “synchronizes the current count to 389.” It did not:
`d969139` synchronized the release-facing count to 388. Control 389 and the 389 header arrived in
`7fcb71f`; `a5d833f` then propagated 389 into README, CHANGELOG, and ledger prose. The same row says
the false Unicode comment remains open and the structural check is still pending, although
`7fcb71f` changed both. Those statements describe neither the historical `d969139` fixing head nor
the current head coherently.

The round-27 row also remains Open and contains no fixing-pass disposition naming `7fcb71f`,
`1863bef`, and `a5d833f`, no closure matrix, and no qualification that only the label-contiguity
part of its fourth finding was implemented. A reader cannot reconstruct which round-27 findings
the current history closed or discover that the claimed header-to-suite proof is still incomplete.

Correction: preserve round 26's historical state precisely (`d969139` = 388), then add a distinct
Integrated/Partially integrated round-27 fixing disposition. Map the three commits, close the
Unicode-comment and stale-count items, record the provenance repairs, and keep the executable-count
gap open until P3-1 is actually closed. Do not claim CI for the unpushed head.

### 3. The release checklist still calls the existing v0.6.0 Status entry “missing”

Locations: `README.md:48,260`.

README Status already contains the back-filled `v0.6.0 (2026-08-19)` entry, but release-checklist
step 3 still tells the maintainer to “Back-fill the missing `v0.6.0` entry before adding a later
release.” At release time that instruction invites a duplicate Status record or needless judgment
about whether the current entry is somehow incomplete. It is stale current-state guidance in the
exact procedure intended to turn the prepared tree into `0.7.0`.

Correction: change the step to require retaining/verifying the existing `v0.6.0` entry and adding
the new `v0.7.0` entry above it. Keep the existing instructions to remove the prepared paragraph,
preserve reverse chronology and blank-line separation, and update the banner.

## P4 observations (nonblocking)

- The source-label parser can also treat a line-start `// Control N:` inside a template literal as
  a registration because it parses raw JavaScript text rather than syntax. Closing P3-1 with an
  executable registry removes this ambiguity; if the label check remains, document or parse this
  lexical boundary.
- The publish workflow still uses `NPM_TOKEN` while requesting npm provenance. Trusted publishing
  via GitHub OIDC could reduce long-lived-secret exposure, but this is optional hardening, not a
  defect in the documented current release path.

## Round-27 closure matrix

| Round-27 item | Disposition at `a5d833f` |
|---|---|
| P3-1: Unicode comments claim branch-order dependence | **Closed.** `7fcb71f` now says control 381 protects against the former over-broad workflow predicate and explicitly states that the disjoint anchored patterns make branch order unobservable. Runtime semantics were not changed. |
| P3-2: ledger calls 384 current | **Closed for the current count.** Current release-facing prose consistently says 389 and historical 384 mentions are revision-qualified. The round-26 row has a different false attribution (this review's P3-2). |
| P3-3: rewritten-history/fixing disposition incomplete | **Partially closed.** `1863bef` records `535eb60 == ae4df09` at tree level and distinguishes the non-ancestor object. The ledger still lacks the round-27 fixing disposition and misattributes the 389 transition. |
| P3-4: header not mechanically tied to suite | **Open.** `7fcb71f` proves a contiguous comment-label inventory and control 389 proves that this parser rejects an extra label. Neither proves that the labeled controls execute; removing a control body while retaining its label passes full validation. |

## Per-commit review

| Commit | Result |
|---|---|
| `ce57929` | Round-24 report remains historical evidence with its tree mapping recorded. |
| `5784fd2` | Round-24 release-order, Status, and Unicode-fixture corrections remain present. |
| `c3714af` | Round-25 report remains historical evidence; later mappings are required to interpret its rewritten topology. |
| `c5aa58e` | Release dates, mutable-tag wording, and prepared-to-released transition are materially correct. |
| `ca5d24e` | Seven workflow action uses remain full-SHA pinned and monthly GitHub Actions Dependabot remains valid. |
| `ae4df09` | Strict Unicode-result classification is correct; its old tree mapping from `535eb60` remains reproducible. |
| `b722667` | Round-26 report remains valid historical evidence of its reviewed tree. |
| `2890ea5` | Tag wording and release-count documentation improved; later rows must keep the revision boundaries exact. |
| `cb34859` | Release-document copy synchronization works, but its hand-maintained header authority is not sufficient by itself. |
| `d969139` | Correctly moved the then-current release count from 384 to 388; the ledger's later claim that it produced 389 is false. |
| `bb49934` | Round-27 report accurately identified four P3s at `d969139`. |
| `7fcb71f` | Corrected Unicode comments and added label-contiguity enforcement, but did not establish executable-control counting. |
| `1863bef` | Repaired important rewrite mappings, but its round-26 disposition contains stale/incorrect fixing-state claims. |
| `a5d833f` | Correctly propagates the current 389 label total; it does not repair the ledger's commit attribution or prove execution count. |

## Release-readiness evidence

| Area | Evidence at `a5d833f` |
|---|---|
| Version state | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` all remain `0.6.0`; the banner is `v0.6.0`; Status and CHANGELOG call `0.7.0` planned. `node dev/check-release-version.mjs 0.6.0` passed. No bump/tag/push was performed. |
| SemVer decision | The Node floor raise `16.7.0 → 24.0.0` removes a working install path and is MINOR under the repository's documented 0.x rule. Planned `0.7.0` is correct. |
| Release transition | The checklist correctly requires bump-before-tag, a released changelog section plus fresh Unreleased section, a release commit pushed to `main`, green validation of that exact SHA, then tag/publish. Its stale “missing v0.6.0” instruction is P3-3. |
| Fixture count | Independent label extraction produced 166 singular/range labels expanding to 389 unique IDs, minimum 1, maximum 389, no duplicates or gaps. Header arithmetic says 371 child-spawn plus 18 in-process controls = 389. README Status/checklist, current CHANGELOG, and current ledger prose say 389. The executable-count counterfactual disproves the stronger claimed authority (P3-1). |
| Unicode closure | Long-leading-zero valid identifier escapes and invalid out-of-range/surrogate spellings remain covered; the result classifier accepts only exact quiet/intentional outputs. The round-27 comment correction is exact. |
| Validator/toolchains | `npm run validate` passed on Node `v24.12.0`; a second full `dev/validate.mjs` run passed on exact Node `v24.0.0`. Local rustc/Cargo are exactly `1.97.0`. JavaScript syntax checks and `actionlint` passed. |
| Actions/Dependabot | All seven `uses:` entries are full 40-character SHAs. Live refs resolved unchanged: checkout v7 `3d3c42e...`, setup-node v7 `82076278...`, rust-toolchain 1.97.0 `86e71974...`. `.github/dependabot.yml` requests monthly `github-actions` updates. |
| Category/mirror | The validator derives 59 numbered categories and checks ownership/routing. `node dev/sync-mirror.mjs --check` passed for all 13 mirrored files. No normative skill file changed in the reviewed window. |
| Package/install | `npm pack --dry-run --json` passed with 38 entries, 609,158 bytes packed / 1,692,102 unpacked. Both licenses, Node guard/installers, canonical and Codex skill trees, Codex manifest, commands, README, and CHANGELOG are present. Fresh Claude and Codex user-skill installer smoke tests passed. |
| Git/provenance | `535eb60` and `ae4df09` remain tree-identical; only `ae4df09` is an ancestor. Remote `main` is still `3ed04b9`; no CI can yet exist for the local fourteen-commit head. Ledger inaccuracies are P3-2. |
| Whitespace | `git diff --check origin/main..HEAD` and whole-repository `actionlint` passed. |

## Required correction order

1. Replace comment-label authority with an executable control registry/count and add independent
   removal/addition counterfactuals (P3-1).
2. Repair the round-26 attribution and add the round-27 fixing disposition with exact commit and
   closure mappings (P3-2).
3. Update the Status instruction in the release checklist to reflect the existing v0.6.0 entry
   (P3-3).
4. Run a new independent review. Only a pass with no P0–P3 should authorize the explicit `0.7.0`
   version bump and release sequence.
