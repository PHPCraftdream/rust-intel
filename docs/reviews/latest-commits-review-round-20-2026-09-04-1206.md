# Round 20 review of the latest commits and specification overview — 2026-09-04 12:06 CEST

## Scope and method

- Review base: `0a00dab34968dbff2b96066f67bb8f81c06d7a0e`
  (`docs: add round 18 review of latest commit`).
- Reviewed head: `49433b9b0cd284af71e5165f089fdd01eb27dab8`
  (`rust-intel: correctness fixes from round-19 independent review`).
- Range: `0a00dab..49433b9` — 3 commits, 13 files, `+340/-26`: the round-18 fix,
  round-19 report, and round-19 fix.
- The complete range diff and every changed normative/tooling hunk were inspected. The general
  specification overview structurally covered `skill/SKILL.md`, all ten theme modules, the
  category-to-module map, enforcement tiers, trigger tables, version pins, source ledger, mirror,
  validator, fixtures, changelog, and active Codex installation.
- This is a bounded single-context review: all ten modules were reached structurally, but unchanged
  clauses were not each re-proven against their upstream implementation. Accordingly, the overview
  is a coverage/architecture assessment, not a new exhaustive factual audit of every sentence in
  the 1,685 lines of theme-module prose.
- Current, load-bearing changed claims were checked against primary sources: the Rust Reference,
  Rust Forge, RustSec, rustls and DashMap sources/releases, the GFM specification, and cmark-gfm's
  table/fence implementation.
- Per the explicit request, no test, validator, fixture runner, build, installer, package command,
  syntax checker, or other project executable was run. No sub-agent was used. The only working-tree
  write made by this review is this report.
- Pre-existing untracked `.githooks/` was excluded and left untouched.

## Executive result

- **No P1 finding.**
- **No P2 finding.** The normative corrections in `49433b9` are accurate in the repository and do
  not weaken a red-tier rule.
- **Three P3 finding groups:** the table-boundary classifier treats an invalid backtick-fence opener
  as a real block boundary; delimiter parsing still uses Unicode-wide JavaScript `trim()` instead of
  cmark-gfm's byte class; and the active Codex installation is stale in exactly the four normative
  files changed by `49433b9`.
- **Round-19 closure is complete in Git:** all six findings and both minor notes are correctly fixed.
  The two validator findings below are adjacent paths that the round-19 patch and its new controls
  did not cover, not regressions in the clauses it changed.
- **Specification overview:** the declared 59-category architecture is internally complete and
  correctly routed: A=3, B=29, C=12, D=5, E=6, F=4. It covers the important production-surviving
  Rust risk families well. Its principal residual weakness is maintenance evidence: semantic
  accuracy and third-party API freshness remain mostly manual, while the executable checks strongly
  protect structure, mirrors, and a selected subset of corrected rule text.
- Overall verdict: **REQUEST CHANGES (P3 only)**. The content commit is substantively correct; the
  remaining work is validator conformance and redeployment.

## P3 findings

### 1. An invalid backtick-fence opener silently terminates the validator's table state

Locations: `dev/validate.mjs:322`; incomplete negative control at
`dev/validate-fixtures.mjs:418-435`.

`blockStartRe` recognizes any line beginning, after zero to three literal spaces, with `` ``` `` or
`~~~` as a block start:

```js
const blockStartRe = /^ {0,3}(#{1,6}(?:[ \t]|$)|```|~~~|...)/;
```

That is incomplete for a backtick fence. GFM §4.5 says the info string after a backtick opener may
not itself contain a backtick. The escape guard implements that condition at
`dev/validate.mjs:506-510`, but the table-state machine does not. Consequently, immediately after a
real trigger-table body row:

```text
```lang`invalid
```

is treated by the validator as a fence boundary and calls `flushTableBlock()`. cmark-gfm does not
open a fence there; its table extension can parse this non-blank, pipe-less line as a one-cell body
row. The project's leading-pipe convention therefore requires an error, but the validator silently
accepts it. This is a static false negative in the guard whose purpose is to prevent trigger rows
from escaping duplicate/signature checks.

The round-19 fixture named `backtick-in-info-string-opener` does not exercise this obligation. It
adds a second line containing a literal `\"` and asserts only the escape-guard diagnostic. That
diagnostic makes the fixture fail as expected even while the table machine misses the first line.

Primary reference: [GFM §4.5 fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks)
(the opener restriction and example 115).

Correction: extract one shared `isFenceOpener(line)` predicate, including the backtick-info rule,
and use it in both the escape scanner and the table-boundary classifier. Add an isolated table
negative control that inserts only `` ```lang`invalid `` after a body row and specifically requires
the `missing its leading \`|\`` diagnostic.

### 2. Table delimiter parsing still trims NBSP and other Unicode whitespace that cmark-gfm retains

Locations: `dev/validate.mjs:271`, `:342-343`, `:351`; no delimiter-whitespace counterexample in
`dev/validate-fixtures.mjs`.

Round 19 correctly replaced `line.trim() === ''` with `/^[ \t]*$/` for GFM blank lines, but three
other table-machine paths still use JavaScript `String.prototype.trim()` to normalize cells.
ECMAScript `trim()` removes Unicode `White_Space`, including U+00A0 NBSP. cmark-gfm's table-start
scanner instead defines its delimiter `spacechar` as the explicit byte class `[ \t\v\f]`; NBSP is
ordinary cell content and prevents a delimiter marker from matching.

Counterexample:

```text
| header | header |
| --- | --- |
pipe-less prose
```

The spaces immediately inside the second row's outer pipes above are NBSP. The validator strips
them, recognizes two `---` cells, enters `body`, and falsely reports the third line as a missing-pipe
table row. cmark-gfm rejects the second line as a delimiter, so no table opens and the third line is
ordinary paragraph continuation. This is the opposite error from finding 1: a static false positive.

Primary references:
[cmark-gfm `extensions/ext_scanners.re`](https://github.com/github/cmark-gfm/blob/master/extensions/ext_scanners.re)
(`spacechar = [ \t\v\f]`, used by `table_marker`) and
[cmark-gfm `extensions/table.c`](https://github.com/github/cmark-gfm/blob/master/extensions/table.c)
(delimiter detection and cell parsing).

Correction: replace these table-specific `trim()` calls with one explicitly named helper matching
cmark-gfm's table `spacechar` class, and add the NBSP-delimiter counterexample as a must-stay-quiet
fixture. Do not reuse the blank-line `[ \t]` class blindly: cmark-gfm's table extension deliberately
also admits vertical tab and form feed around delimiter markers.

### 3. The active Codex installation still contains the four pre-fix normative files

Locations:

- repository source: `skill/{SKILL.md,async.md,deps-macros-ergonomics.md,references/sources.md}`;
- active copy: `C:\Users\Computer\.agents\skills\rust-intel\` at the same relative paths.

SHA-256 comparison of all 13 canonical skill files found:

- `skill/` versus checked-in `skills/rust-intel/`: **13/13 identical**;
- `skill/` versus active installation: **9/13 identical**;
- mismatches: exactly the four files changed by `49433b9`.

The active files still state the old associated-const `where Self: Sized` claim, say
`try_entry()` returns `Entry` rather than `Option<Entry>`, describe rustls 0.24 as already shipped,
and use quick-xml's reported date rather than the issued date. The Git artifact is fixed, but Codex
sessions loading the user skill still receive all four superseded statements. This is deployment
incompleteness, not a repository-mirror defect.

Correction: after the validator fixes are committed, run `node bin/install-codex.js` in a
non-read-only round, byte-verify all 13 installed files, and start a new Codex thread as the installer
instructions require.

## Round-19 closure matrix

| Round-19 item | Round-20 disposition |
|---|---|
| `blockStartRe` / blank line used ECMAScript whitespace | **Closed as requested.** Marker and indentation positions now use literal space/tab, and blankness uses `/^[ \t]*$/`; two NBSP controls exist. Findings 1-2 are adjacent unhandled grammar paths. |
| Fixture header said 20 controls while 22 existed | **Closed.** The suite now contains and declares 24 hand-written controls. The 13 rule-text controls remain correctly counted. |
| Fence-closer tab suffix attributed to GFM text | **Closed.** The comment distinguishes GFM's prose from cmark-gfm/CommonMark behavior and states the `.gitattributes` LF invariant. |
| Changelog date and round history | **Closed.** Rust 1.100 is scheduled for 2026-11-12; rounds 8-19 and the omitted round-16/17 tooling work are recorded; Cargo wording now counts advisory rounds rather than identifiers. |
| Associated const given a `where Self: Sized` opt-out | **Closed.** Associated functions and constants are separated exactly as the Rust Reference requires. |
| rustls 0.24 described as released | **Closed.** It is explicitly a development line; 0.23.43 remains identified as latest stable and release-time re-verification is required. |
| DashMap `try_entry()` return type | **Closed.** `entry()` → `Entry`; `try_entry()` → `Option<Entry>`. |
| quick-xml advisory date | **Closed.** `2026-07-02` is RustSec's issued date; `2026-06-29` is separately the reported date. |

## General specification overview

### Coverage map

| Module | Numbered categories | What it covers | Overview assessment |
|---|---:|---|---|
| `async.md` | 11 | locks/guards across await, cancellation, dropped tasks, blocking, futures machinery, task lifecycle, runtime/tracing coherence, serial latency | Strong; semantic triggers avoid tying the rule to one method spelling. |
| `unsafe-and-ffi.md` | 4 | UB, allocation/stack hazards, manual auto-traits/variance, FFI panic/ABI/ownership/concurrency | Strongest high-risk module; local proof obligations and counterexamples are explicit. |
| `concurrency-and-state.md` | 9 | ownership wrappers, deadlocks, cycles, TOCTOU, backpressure, runtime borrow failures, invalidation, runtime/channel mismatch, contention | Broad and production-oriented; distinguishes sync atomicity from async guard lifetime. |
| `data-and-types.md` | 10 | exhaustiveness, Eq/Hash, Serde presence, numeric/time/Unicode/iterator hazards, allocation and complexity | Covers the everyday silent-error surface that Rust's type checker does not settle. |
| `security.md` | 3 | crypto/secrets, side channels/oracles, error and trust-boundary discipline | Compact but cross-routed to dependency, parsing, logging, and FFI rules. |
| `drop-and-raii.md` | 1 | cleanup/drop order, async rollback, edition-2024 temporary scopes | Narrow by theme, appropriately cross-linked to cancellation and boundary lifecycle. |
| `deps-macros-ergonomics.md` | 8 | stale/slopsquat dependencies, clone debt, proc macros/build scripts, features/workspaces, API ergonomics, established crates/subsystems, repeated work | Good supply-chain and ecosystem coverage; highest ongoing freshness burden. |
| `lifetimes-and-api.md` | 3 | lifetime laundering/leaks, blanket impl/non-exhaustive semver, accidental public API | Correctly focuses on failures visible only to downstream consumers. |
| `testing.md` | 6 | nondeterministic/circular oracles, placement, prod divergence, runner filtering, Windows process wedges, measurement | Strong negative-control stance; treats green tests as evidence to challenge, not a conclusion. |
| `semantics-and-conformance.md` | 4 | external specs, project promises, error-path lifecycle, inverse-pair laws | Important cross-cutting layer that catches self-consistent-but-wrong implementations. |

The 59 numbered headings re-count as A1-A3, B1-B29, C1-C12, D1-D5, E1-E6, and F1-F4.
Lettered refinements (`B1a/b`, `B3a`, `B4a`, `B15a-e`, `B18a`, `B25a`, `C1a`, `C12a`,
`D1a`) are intentionally routed separately but do not inflate the advertised category count.

### What the specification covers well

1. It targets the right boundary: code that compiles and commonly passes tests but fails through UB,
   deadlock, cancellation, resource exhaustion, semver drift, interop, or scale.
2. Red/yellow/green enforcement prevents every stylistic occurrence from becoming a finding while
   keeping unsafe, FFI, secret, unbounded-admission, and detached-task shapes visible.
3. Trigger rows are predominantly semantic (owned guard remains live, admission is attacker-
   extendable, documented promise is touched) rather than brittle lists of function names.
4. Tier F requires external oracles and counterfactual negative controls, closing the common
   `encode`/`decode`-agree-with-each-other but disagree-with-the-spec hole.
5. The canonical/mirror/source packaging architecture is sound: all references remain inside the
   installable tree and the checked-in Codex mirror is byte-identical.
6. Version pins and advisory grounding are unusually concrete. The sampled changed claims match the
   current primary sources: Rust 1.100's 2026-11-12 train date, rustls 0.23.43 versus the 0.24
   development line, Rust's dyn-compatibility rule, DashMap's `try_entry` return type, and RustSec's
   quick-xml issue date.

### Residual completeness and maintenance limits

- Deliberate scope exclusion is honest: compile-only failures are left to rustc, while downstream-
  only semver/dyn-compatibility breakage stays in scope. This is not a general Rust language manual.
- Structural automation is much stronger than semantic automation. Mirror parity, routing, links,
  schema shape, category counts, and selected recent rule tokens are guarded, but only 13
  `ruleTextControls` protect specific high-risk corrections. The rest still relies on review.
- Third-party currency remains a recurring manual obligation. `[Unreleased]` explicitly says the
  cited-third-party-API ledger/docs.rs liveness probe was scoped but not built; that is the clearest
  project-wide completeness gap, although it was disclosed rather than silently claimed complete.
- The table validator deliberately over-approximates HTML starts and does not track whole fenced
  regions. Neither causes a failure in the current `SKILL.md`; a future fenced Markdown-table example
  can still create a false positive. The accepted top-level-fence limitation should remain visible
  until the table scanner shares the fence state machine.
- Ecosystem substitutions in §C12 are advice under pinned versions, not timeless truth. They need
  periodic release/advisory review even after a liveness probe exists.

## Static verification record

| Check | Result |
|---|---|
| Commit range | 3 commits, 13 files, `+340/-26` (`0a00dab..49433b9`) |
| Round-18 fix `7726ed6` | Both requested fence-closer fixes present; no regression found in the changed path |
| Round-19 report `c017bd2` | Findings, severity calibration, and source conclusions remain supported |
| Round-19 fix `49433b9` | All six P3 groups and two minor notes closed in Git |
| `git diff --check 0a00dab..HEAD` | PASS (no output) |
| Canonical vs checked-in Codex mirror | PASS — 13/13 SHA-256 hashes identical |
| Canonical vs active Codex installation | FAIL — 9/13 identical; four `49433b9` files stale |
| Numbered categories | PASS — 59 (A 3, B 29, C 12, D 5, E 6, F 4) |
| Changed factual claims sampled against primary sources | PASS; no normative factual regression found |
| Table/fence hand-trace | Two P3 divergences, findings 1-2 |
| Tests/validators/fixtures/build/install/package/syntax checks | **NOT RUN**, per request |
| Pre-existing `.githooks/` | Untracked; not read into the review result, modified, or staged |

## Recommended correction order

1. Unify fence-opener recognition and add the invalid-backtick-info table negative control.
2. Replace table-specific Unicode `trim()` with the exact cmark-gfm table-space helper and add the
   NBSP delimiter must-stay-quiet control.
3. In a later non-read-only round, run normal validation and mutation controls for those two fixes.
4. Reinstall the Codex skill, verify 13/13 active files, and start a new thread.
5. Separately prioritize the already-scoped third-party API/source-liveness check; it is the largest
   remaining systemic defense against future spec staleness.
