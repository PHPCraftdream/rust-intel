# Round 21 review of the latest commit and specification overview — 2026-09-04 12:28 CEST

## Scope and method

- Review base: `49433b9b0cd284af71e5165f089fdd01eb27dab8`
  (`rust-intel: correctness fixes from round-19 independent review`).
- Reviewed head: `803a87fe62c3d2cac6f8ea636a6147d58c122366`
  (`docs: add round 20 review and spec overview`).
- Range: `49433b9..803a87f` — one commit, one new file, `+239/-0`:
  `docs/reviews/latest-commits-review-round-20-2026-09-04-1206.md`.
- The new report was reviewed claim-by-claim against the committed source it describes. Its two
  cmark/GFM counterexamples were hand-traced again, its Git arithmetic and category arithmetic were
  independently recounted, and its canonical/mirror/active-install observations were rechecked from
  the current filesystem.
- The general specification overview covered the current canonical `skill/SKILL.md`, all ten module
  headings and category routes, enforcement tiers, trigger architecture, version/source policy,
  validation boundaries, the checked-in mirror, and the active Codex installation. Because the only
  new commit is a review document and no normative module changed, this is a structural and
  risk-coverage refresh, not a second exhaustive source audit of every unchanged normative clause.
- Current date/API assertions carried by the report were sampled against primary sources: Rust
  Forge, the GFM specification, cmark-gfm source, RustSec, the Rust Reference, DashMap source, and
  rustls releases/source.
- Per the explicit request, no test, validator, fixture runner, build, installer, package command,
  syntax checker, or project executable was run. No sub-agent was used. The only working-tree write
  made by this review is this report.
- Pre-existing untracked `.githooks/` was left untouched and excluded from the commit.

## Executive result

- **The reviewed commit itself is approved.** It adds exactly the requested round-20 review,
  contains no code or normative change, has an accurate English subject, and introduces no new
  factual, severity, Markdown, or repository-hygiene defect found by this static pass.
- **No new P1, P2, or P3 finding was introduced by `803a87f`.**
- **Project state is still REQUEST CHANGES (three carried P3 groups).** No fix commit followed the
  round-20 report, so its invalid-fence table false negative, Unicode-trim delimiter false positive,
  and 4-file active-install drift remain present exactly as reported.
- **Round-20 report accuracy:** its scope arithmetic, all eight round-19 closure dispositions, both
  tooling counterexamples, 13/13 mirror result, 9/13 active-install result, 59-category count,
  severity calibration, and general specification conclusions remain supported.
- **Specification overview:** unchanged and internally complete at the advertised abstraction level:
  A=3, B=29, C=12, D=5, E=6, F=4. The ten-module architecture covers the major Rust failures that
  survive compilation and ordinary tests; its main systemic exposure remains source/API freshness
  and the limited semantic depth of mechanical regression controls.

## Review of commit `803a87f`

### Completeness

The commit's purpose was documentation only. It records the requested round, the exact reviewed
base/head, findings, source checks, specification overview, static-verification limitations, and a
correction order. It does not claim to implement the findings and therefore is not incomplete merely
because the three P3s remain open. No unrelated file was added to the commit.

The report also satisfies the project's review-quality shape where applicable:

- concrete counterexamples are supplied for both accepted validator defects;
- each accepted technical claim names a primary source;
- positive repository properties and negative findings are separated;
- the read-only/no-tests limitation is explicit;
- deployment state is distinguished from Git repository state;
- the bounded single-context nature of the broad overview is disclosed instead of being presented
  as exhaustive semantic proof.

### Accuracy

| Round-20 report claim | Round-21 verification |
|---|---|
| Range `0a00dab..49433b9` is 3 commits, 13 files, `+340/-26` | **Supported.** The range contains `7726ed6`, `c017bd2`, and `49433b9`. |
| All six round-19 P3 groups and two minor notes are closed in Git | **Supported.** The literal-space/tab, count, citation, changelog, dyn-compatibility, rustls, DashMap, and quick-xml edits are all present. |
| Invalid `` ```lang`invalid `` is not a GFM fence opener | **Supported.** GFM §4.5 forbids a backtick in a backtick fence's info string. |
| `blockStartRe` nevertheless flushes table state on that line | **Supported.** Its `` ``` `` alternative has no info-string condition; the existing fixture only proves the separate `\"` guard fires. |
| JavaScript `trim()` is wider than cmark-gfm's delimiter-space class | **Supported.** cmark-gfm's table scanner uses `[ \t\v\f]`; ECMAScript trimming additionally removes NBSP. |
| The NBSP delimiter counterexample is a validator false positive | **Supported.** The validator strips NBSP and recognizes `---`; cmark-gfm does not recognize that delimiter row, so no table opens. |
| Canonical and checked-in Codex mirror are 13/13 identical | **Supported again by SHA-256 comparison.** |
| Active Codex installation is 9/13 current | **Supported again.** The same four `49433b9` files remain stale. |
| Rust 1.100 is scheduled for 2026-11-12 | **Supported by Rust Forge as of 2026-09-04.** |
| RustSec quick-xml date distinction | **Supported.** RUSTSEC-2026-0195 says reported 2026-06-29 and issued 2026-07-02. |
| Numbered specification count is 59 | **Supported.** A=3, B=29, C=12, D=5, E=6, F=4; lettered refinements are excluded as documented. |

### Errors and presentation

- `git diff --check 49433b9..803a87f` reports no whitespace error.
- The report is tracked as LF (`i/lf`, `w/lf`) under `.gitattributes`.
- Its nested fence counterexample is valid Markdown: the line containing the invalid opener cannot
  close the surrounding fenced sample because it carries trailing text; the following bare fence
  closes it.
- Source links point directly to the relevant primary documents or repositories.
- No unsupported dynamic-pass claim, test-pass claim, or installation claim appears.

No correction to the round-20 report is required.

## Carried P3 findings still open at `HEAD`

These are not new findings against the documentation commit. They remain the actionable project
state because no implementation commit exists after the report.

### 1. Invalid backtick info string is still a false table boundary

Locations: `dev/validate.mjs:322`; incomplete control at
`dev/validate-fixtures.mjs:418-435`.

`blockStartRe` still accepts any zero-to-three-space-prefixed `` ``` `` sequence, while the escape
scanner correctly rejects a backtick in its info string. Placed after a trigger-table body row,
`` ```lang`invalid `` therefore flushes validator state even though cmark-gfm keeps it as a
pipe-less table row. The required missing-leading-pipe diagnostic is lost.

Correction remains: share an exact fence-opener predicate between both scanners and add an isolated
negative control requiring the table diagnostic rather than a later escape diagnostic.

Primary reference: [GFM §4.5](https://github.github.com/gfm/#fenced-code-blocks).

### 2. Table delimiter normalization still uses Unicode-wide `trim()`

Locations: `dev/validate.mjs:271`, `:342-343`, `:351`.

The three calls remain unchanged. NBSP around a delimiter cell is erased by JavaScript, but not by
cmark-gfm's explicit table `spacechar` class. The validator can therefore invent a table and report
ordinary following prose as a missing-pipe row.

Correction remains: use one table-specific normalization helper matching `[ \t\v\f]`, and add an
NBSP-delimiter must-stay-quiet control.

Primary reference:
[cmark-gfm `extensions/ext_scanners.re`](https://github.com/github/cmark-gfm/blob/master/extensions/ext_scanners.re).

### 3. The active Codex installation remains stale in four files

Repository source versus `C:\Users\Computer\.agents\skills\rust-intel`:

- current: 9/13 files;
- stale: `SKILL.md`, `async.md`, `deps-macros-ergonomics.md`,
  `references/sources.md`.

The active skill therefore still exposes all four superseded round-19 statements. Reinstall only in
a later non-read-only round, after the validator fixes, then verify 13/13 and start a new thread.

## General specification overview

### Architecture and coverage

| Module | Numbered categories | Coverage focus | Current assessment |
|---|---:|---|---|
| `async.md` | 11 | await discipline, cancellation, task lifecycle, blocking, futures machinery, runtime/tracing, serial latency | Broad, semantic triggers; high maintenance burden from fast Tokio/ecosystem evolution. |
| `unsafe-and-ffi.md` | 4 | UB, allocation/stack, variance/auto-traits, ABI/panic/ownership/foreign concurrency | Strong proof-oriented high-risk coverage. |
| `concurrency-and-state.md` | 9 | smart ownership, deadlocks, cycles, TOCTOU, backpressure, borrow/invalidation, runtime fit, contention | Strong production and adversarial-load coverage. |
| `data-and-types.md` | 10 | exhaustiveness, Eq/Hash, Serde, numeric/time/Unicode/iterator correctness, cost | Covers common silent standard-library failures well. |
| `security.md` | 3 | crypto/secrets, side channels/oracles, errors/trust boundaries | Compact core with appropriate cross-module routing. |
| `drop-and-raii.md` | 1 | teardown, drop order, async rollback, edition-2024 scope | Narrow but deep and correctly linked to async/lifecycle rules. |
| `deps-macros-ergonomics.md` | 8 | supply chain, API currency, proc/build macros, features/workspaces, reuse/substitution | Comprehensive; most exposed to external staleness. |
| `lifetimes-and-api.md` | 3 | laundering/leaks, blanket/non-exhaustive semver, visibility | Correctly targets downstream-only breakage. |
| `testing.md` | 6 | flaky/circular oracles, placement, prod divergence, runner/process behavior, measurement | Strong counterfactual and negative-control discipline. |
| `semantics-and-conformance.md` | 4 | external/project specs, boundary lifecycle, inverse laws | Essential cross-cutting layer for self-consistent-but-wrong code. |

The module/category map remains exact and gap-free for the declared numbering: A1-A3, B1-B29,
C1-C12, D1-D5, E1-E6, F1-F4. No category or module changed in the reviewed commit.

### Important strengths

1. Scope is explicit: compile-only failures are deliberately delegated to rustc, while failures
   visible only downstream or under production conditions remain in scope.
2. Enforcement severity separates surface-always safety/security/conformance risks from write-time
   discipline and compiler/clippy backstops.
3. The trigger table increasingly describes semantic ownership, lifetime, admission, and promise
   conditions instead of depending solely on current method names.
4. Unsafe, FFI, async cancellation, concurrency, resource exhaustion, supply chain, semver, testing
   oracles, and external conformance all have concrete proof obligations.
5. Tier F forces reference-first and counterfactual review, preventing internal round trips or green
   tests from substituting for interoperability and documented guarantees.
6. Canonical source and packaged Codex mirror remain byte-identical across all 13 files.

### Important limits and future risks

- This remains a Rust production-risk specification, not a complete language/API manual. Its
  intentional compile-only exclusions should stay visible.
- Semantic regression protection is selective: 13 rule-text controls guard recent high-risk fixes,
  while most normative meaning still depends on human/source review.
- The cited-third-party-API ledger and docs.rs liveness probe remain explicitly scoped but unbuilt.
  This is the largest known systemic completeness gap for future ecosystem/API drift.
- The table validator still approximates Markdown rather than sharing a complete parser state. In
  addition to the two live P3s, it deliberately over-approximates HTML starts and does not skip whole
  fenced regions; current `SKILL.md` does not trigger those accepted limitations.
- §C12 substitutions and version-pinned API recipes require recurring advisory/release review; a
  liveness probe will reduce dead links, not prove semantic correctness.
- Deployment parity is outside Git's mirror guarantee. A content fix is not delivered to active
  Codex until the installer is rerun and the new thread reloads it.

## Static verification record

| Check | Result |
|---|---|
| Reviewed range | 1 commit, 1 file, `+239/-0` (`49433b9..803a87f`) |
| Commit subject/scope | PASS — English documentation-only subject matches the tree |
| Round-20 report factual review | PASS — no new correction found |
| `git diff --check 49433b9..803a87f` | PASS (no output) |
| Report line endings | PASS — `i/lf`, `w/lf`, `.gitattributes` LF pin |
| Canonical `skill/` vs checked-in mirror | PASS — 13/13 SHA-256 hashes identical |
| Canonical `skill/` vs active installation | FAIL — 9/13 identical, same four files stale |
| Category map/count | PASS — 59 (A 3, B 29, C 12, D 5, E 6, F 4) |
| Tests/validators/fixtures/build/install/package/syntax checks | **NOT RUN**, per request |
| Pre-existing `.githooks/` | Untracked, untouched, not staged |

## Recommended next steps

1. Treat `803a87f` as an accurate review artifact; do not edit it.
2. Implement the two table-parser P3 corrections together so opener and whitespace semantics share
   one source of truth and each receives a counterfactual fixture.
3. In a permitted non-read-only round, run the normal validators and revert/mutation controls.
4. Reinstall the Codex skill and verify 13/13 active files only after the repository fixes settle.
5. Plan the deferred third-party API/source-liveness automation as separate maintenance work.
