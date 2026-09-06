# Round 25 review of the latest commits and v0.7.0 release readiness — 2026-09-06 13:10 CEST

## Scope and method

- Review base: `e30bae3^` (`3ed04b9`, the pushed round-23 fixing commit).
- Reviewed head: `efa62fb73e1551c78972110f80f055568b7c18b7`.
- Commit window: `e30bae3^..efa62fb` — four commits, six files, `+436/-41`:
  `e30bae3` (round-24 report), `0cb335a` (ledger correction), `bd1b802` (Unicode
  fixture oracle), and `efa62fb` (Status and release-checklist corrections).
- The review was performed in an isolated worktree. Project files were not changed; this report and
  its open ledger row are the only authored changes.
- The full round-24 report was read first. Its findings were traced into the four commits and then
  checked against the current files. The whole repository was inspected for v0.7.0 release
  readiness: README Status and banner, changelog and SemVer decision, all three manifests, both
  workflows, release scripts, validator and fixture runner, canonical/mirror skill trees, package
  allowlist, and both JavaScript install surfaces.
- External checks used authoritative state rather than memory: the npm registry metadata for every
  published version, the repository's GitHub ruleset and immutable-release settings, the live refs
  behind every `uses:` entry, GitHub's Actions security guidance, and Keep a Changelog's release
  procedure.

## Executive result

- **No P0 or P1 finding.**
- **One P2 finding:** the validation and npm-publish workflows execute actions through movable tags
  or a movable branch. This includes the two actions which prepare the release workspace in a job
  with `id-token: write`; GitHub documents a full commit SHA as the only immutable action reference.
- **Five P3 findings:** the strengthened invalid-Unicode oracle does not actually accept the
  diagnostic form its comment promises; the release checklist neither retires the README's
  point-in-time Unreleased paragraph nor creates a fresh changelog Unreleased section; two dates in
  the newly rewritten Status history are not release dates; two release-script headers falsely call
  Git tags immutable; and the four-commit record still contains a subject-only review commit plus a
  ledger entry that claimed later fixes before they existed.
- **Round-24 closure is incomplete.** Its release ordering, Layout alignment, planned-bump wording,
  ledger wording, and unreachable range test are closed. Its Unicode-oracle, Status, release-time
  rewrite, and commit-provenance findings remain open in narrower forms documented below.
- **Release verdict: NOT READY for the v0.7.0 tag.** Manifests/banner/category count/mirror/install
  surfaces are internally coherent and all executed local gates are green, but the P2 workflow
  supply-chain finding and the P3 release-document/oracle findings must be closed first.

## P2 finding

### 1. Release validation and publication execute mutable action references

Locations:

- `.github/workflows/ci.yml:20-24,145-146`
- `.github/workflows/npm-publish.yml:37-39`

Every external action is selected by a movable ref:

```yaml
actions/checkout@v7
actions/setup-node@v7
dtolnay/rust-toolchain@1.97.0
```

Read-only `git ls-remote` resolved those refs during this review to:

- `actions/checkout@v7` → `3d3c42e5aac5ba805825da76410c181273ba90b1`
- `actions/setup-node@v7` → `820762786026740c76f36085b0efc47a31fe5020`
- `dtolnay/rust-toolchain@1.97.0` → branch
  `86e7197484018ef6aaa9255d186f6ce1754276dd`

Those observations do not pin the workflow: the remote owner can move each ref after review. GitHub's
[secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use) states that
a full-length commit SHA is the only immutable way to reference an action, and that the rule applies
even to actions authored by GitHub. The risk is load-bearing here: `npm-publish.yml` grants
`id-token: write`, prepares the checkout and Node environment through the two tag-selected actions,
and later publishes the resulting tree with `NPM_TOKEN`. A compromised/moved action can taint files,
PATH, or subsequent commands without needing the token in its own step.

Correction: replace all seven `uses:` values with verified full 40-character SHAs and retain the
human-readable version in comments, for example
`actions/checkout@3d3c... # v7`. Pin the same action to the same SHA in both workflows and configure
Dependabot/Renovate to propose reviewed SHA updates. Re-resolve the refs at fix time rather than
assuming the observations above are still current.

## P3 findings

### 2. Controls 378–379 reject the legitimate diagnostic form they claim to accept

Locations: `dev/validate-fixtures.mjs:3183-3207`; existing workflow diagnostics in
`dev/validate.mjs:519-1504`.

The new oracle says an intentional status-1 result containing the exact marker
`invalid Unicode escape in identifier` is accepted. The actual branch order is:

1. reject any output containing `workflow`;
2. only afterwards accept status 1 containing the marker.

Existing diagnostics from the same subsystem consistently begin with `workflow ...`. The concrete
counterfactual

```text
status = 1
output = "ERROR: workflow invalid Unicode escape in identifier"
```

therefore fails at line 3202 before the marker branch at line 3206 can accept it. The round-24 fix
also asked for absence of the *specific false mutation diagnostic*; checking the generic lowercase
word `workflow` is broader than that contract.

Correction: classify the exact intentional diagnostic before checking for the specific false
increment/decrement-mutation message, or extract the result classifier and give it in-process
negative controls for: current quiet status 0, exact intentional status 1, false workflow-mutation
status 1, unrelated status 1, and execution failure. The test must fail if the exact-diagnostic
acceptance branch is reversed back behind the generic check.

### 3. Following the release checklist leaves stale README state and removes the changelog's Unreleased section

Locations: `README.md:46,260-261`; `CHANGELOG.md:9`.

Step 3 adds the v0.7.0 Status entry but never removes or rewrites the current leading paragraph:

> **Unreleased (prepared, not tagged).** ... manifests and the release banner remain `v0.6.0` ...

After steps 2–3 that paragraph becomes false beside a new v0.7.0 entry. Step 4 then says to
"Replace `## [Unreleased]`" with the versioned heading. Taken literally, it leaves no fresh
Unreleased section even though the file declares the Keep a Changelog format. Keep a Changelog's
[release procedure](https://keepachangelog.com/en/1.1.0/) is to move the current contents into the
new version and add a fresh empty Unreleased section above it.

Correction: step 3 must say to replace/remove the point-in-time README Unreleased paragraph when the
release is cut. Step 4 must say to move the current body into `## [0.7.0] — <date>` and insert a new
`## [Unreleased]` heading above it. A release-state validator control should reject a Status block
which simultaneously says "prepared, not tagged"/"remain v0.6.0" and contains the v0.7.0 release
entry.

### 4. The rewritten Status history carries two non-release dates

Locations: `README.md:54,62`; `CHANGELOG.md:121,272`.

The npm registry is the authoritative publication surface introduced by v0.4.5. Its `time` metadata
reports:

- `0.4.5`: `2026-07-05T20:07:40.521Z`, while README and changelog say `2026-06-17`;
- `0.5.1`: `2026-08-14T12:13:31.921Z`, while README and changelog say `2026-08-09`.

The registry's `0.5.1` record also identifies git head
`76050f5dfea29670d0ec256cb99dca4498827092`; the repository currently has no `v0.5.1` tag. Thus
v0.5.1 is a real npm release, not a fictional version, but its Status date is five days early and
its absent/deleted tag should not be silently treated as ordinary tag evidence. The v0.4.5 tag was
created on 2026-07-05, corroborating the registry rather than the June date.

Correction: use the actual publication dates in both Status and changelog (`2026-07-05` and
`2026-08-14`), and note the missing historical v0.5.1 tag in the ledger or release-history prose.
If the dates are intentionally content-freeze dates instead of release dates, label that convention
explicitly; the current `vX.Y.Z (date)` wording reads as release history.

Registry evidence: [rust-intel-cc package metadata](https://registry.npmjs.org/rust-intel-cc).

### 5. Release scripts claim Git tags are immutable while this repository explicitly permits moving them

Locations: `dev/check-release-version.mjs:4`, `dev/set-release-version.mjs:5`, contrasted with
`.github/workflows/npm-publish.yml:69-75`.

Both script headers state "A git tag is immutable". Git tags are movable refs. The publish workflow
already acknowledges the correct state: the repository lacks tag protection / immutable releases
and a tag is technically movable. Read-only GitHub API checks during this review returned no
repository rulesets and `immutable-releases.enabled = false`.

The scripts' verify-before-rewrite design is still correct; it does not require the false premise.
Correction: say that the workflow must publish the tree named by the tag and must not synthesize a
different version in the runner. Separately protect `v*` refs or adopt immutable GitHub releases if
the project wants the stronger immutability guarantee.

### 6. Commit provenance is still not self-contained

Locations: commit messages for `e30bae3` and `0cb335a`; the round-24 ledger row as it exists in the
`0cb335a` tree.

- `e30bae3` is subject-only, immediately repeating the convention failure which its own report calls
  P3 and says the next commit should stop repeating.
- `0cb335a` has a good body, but its only project change records that "the round-24 fixes correct the
  release checklist's ordering and Status/banner instructions". At that commit those changes do not
  exist; they arrive two commits later in `efa62fb`. The head is correct, but the intermediate commit
  is a forward claim rather than an independently true disposition.

The four commits are not pushed, so the record can still be repaired without rewriting public
history. Correction: give the report commit a body naming scope and static/executed verification,
and move or amend the round-24 disposition so it lands with/after the fixes it describes. A squash
of the three fixing commits with a complete body is also coherent.

## P4 observation (non-blocking)

The safe push ordering is documented but not machine-enforced. A manually pushed `v0.7.0` tag starts
`npm-publish` without proving that the `validate` workflow passed on that SHA; the publish job reruns
the validator and installer smokes but not every branch-CI gate. This is acceptable as an explicit
maintainer procedure, but a reusable validation workflow or protected release environment would
turn the procedural gate into evidence the workflow can enforce.

## Round-24 closure matrix

| Round-24 item | Round-25 disposition at `efa62fb` |
|---|---|
| Part 2 P2-A: push main and tag together | **Closed.** README steps 7–9 push `main`, wait for `validate` on the exact SHA, and only then create/push the tag. |
| Part 1 P3-1: subject-only fixing commit | **Recurred.** The three fixing commits have bodies, but the round-24 report commit `e30bae3` is subject-only (finding 6). |
| Part 1 P3-2: invalid Unicode controls require status 0 | **Partially closed.** Status 1 has a nominal allowance, but normal subsystem wording cannot reach it (finding 2). |
| Changelog planned-bump imperative | **Closed.** It now says "planned next release" and step 4 calls for past tense at release. |
| Layout alignment | **Closed.** The three added rows align with siblings. |
| Ledger row 38 wording and round-23 Status correction | **Closed.** ASCII quotation and clause semantics are fixed; the correction is recorded. |
| Unreachable post-loop range test | **Closed.** Only the reachable surrogate test remains. |
| Part 2 P3-B: stale Status | **Partially closed.** v0.6.0 is backfilled and entries are separated, but two historical dates and the release-time Unreleased transition are wrong/incomplete (findings 3–4). |
| Part 2 P3-C: checklist placement and release-time rewrites | **Partially closed.** Placement and count/past-tense instructions are fixed; creation of a fresh changelog Unreleased section is omitted (finding 3). |

## Per-commit review

| Commit | Result |
|---|---|
| `e30bae3` — round-24 report | Report content is substantive and its P2/P3 findings are reproducible. Subject-only provenance repeats its own finding (P3-6). |
| `0cb335a` — ledger correction | Correctly fixes the round-23 quotation and inverted clause and records the Status omission. Its round-24 closure statement is premature at that commit (P3-6). |
| `bd1b802` — Unicode oracle | Removes unreachable validator code and no longer hard-pins status 0, but the replacement classifier contradicts its own accepted-diagnostic contract (P3-2). |
| `efa62fb` — Status/checklist | Correctly fixes ordering, placement, v0.6.0 omission, spacing, Layout, and planned-bump wording. It leaves release-transition and historical-date inaccuracies (P3-3/4). |

## Release-readiness evidence

| Area | Evidence at `efa62fb` |
|---|---|
| Version state | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are all `0.6.0`; README banner is `v0.6.0`; changelog and Status describe `0.7.0` as planned, not released. `node dev/check-release-version.mjs 0.6.0` passed. |
| SemVer decision | Node floor `16.7.0 → 24.0.0` is documented as a compatibility-breaking MINOR change; target `0.7.0` is correct. No version was changed by this review. |
| Category state | README/package/plugin descriptions and the canonical spec consistently state 59 numbered categories. |
| Validator and fixtures | `npm run validate` passed on Node `v24.12.0`; it executed the 379-control fixture suite and reported 12 skill Markdown files checked. The logical gap in controls 378–379 is finding 2, not a current red run. |
| JavaScript syntax | `node --check` passed for both validators, both installers, release/version/mirror helpers, and `skill/audit-project.workflow.js`. |
| Mirror | `node dev/sync-mirror.mjs --check` passed: 13 files are identical. |
| Install surfaces | Fresh npm/Claude and Codex installer smokes both passed; npm installed the skill plus all three commands, Codex installed all 13 skill files. Temporary trees were uninstalled and removed. |
| Package | `npm pack --dry-run` passed under npm `11.13.0`: 38 files, 609.0 kB packed / 1.7 MB unpacked. The allowlist includes both installers and the Node guard, canonical and Codex mirrors, Codex manifest, three commands, README/changelog, and both licenses. |
| Diff hygiene | `git diff --check e30bae3^..efa62fb` passed. Worktree was clean before this report. |
| Current CI | No CI run can exist for the unpushed `efa62fb` head. `origin/main` remains `3ed04b9`; the release checklist correctly requires a green run on the eventual release SHA before tagging. |
| Workflow security | Functional gates are present, but action refs are mutable (P2-1); exact-SHA validation-before-publish remains procedural (P4). |

## Required correction order

1. **P2-1:** pin every workflow action to a verified full commit SHA and rerun both CI jobs.
2. **P3-2:** repair and negatively calibrate the invalid-Unicode result classifier.
3. **P3-3:** specify and validate the README/changelog transition from prepared to released state.
4. **P3-4:** correct the v0.4.5/v0.5.1 release dates and record the missing historical v0.5.1 tag.
5. **P3-5:** remove the false tag-immutability premise; optionally protect `v*` externally.
6. **P3-6:** repair the still-local commit record before it is pushed.
7. Run a fresh independent review. Only a pass with no remaining P0–P3 should authorize the
   v0.7.0 bump/tag cycle.
