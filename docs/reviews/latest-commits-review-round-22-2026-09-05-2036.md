# Round 22 review of the latest commits — 2026-09-05 20:36 CEST

## Scope and method

- Review base: `0a00dab34968dbff2b96066f67bb8f81c06d7a0e`
  (`docs: add round 18 review of latest commit`).
- Reviewed head: `3e8d433f9ec8e47cc66566251b9ebaf4fda6b7f6`
  (`fix: close bounded validator escape routes`).
- Range: `0a00dab..3e8d433` — 13 commits, 16 files, `+1599/-318`: the round-18 fix (`7726ed6`),
  the round-19 report and fix (`c017bd2`, `49433b9`), the round-20 and round-21 reports
  (`803a87f`, `ab2a1bd`), and eight validator commits with subject-only messages (`a28b905`,
  `44eb16c`, `8d4db70`, `80d8452`, `ee86c0d`, `014382a`, `a018845`, `3e8d433`).
- Method: static, revision-qualified inspection only. Every file changed in the range was read in
  full at `3e8d433` (`dev/validate.mjs`, `dev/validate-fixtures.mjs`, `CHANGELOG.md`
  `[Unreleased]`, `README.md`, `docs/reviews/README.md`, the four normative files touched by
  `49433b9` and their mirrors, both new review reports); the eight validator commits were read as
  per-commit diffs of `dev/validate.mjs` plus the per-commit deltas of the changelog and ledger
  rows they added; the pre-refactor fixture suite (`ee86c0d`, 92 controls) and the round-19 suite
  (`49433b9`, 24 controls) were diffed control-by-control against the 68 controls at `3e8d433`.
  The table contract, fence mask, code-span scanner, and escape guard were hand-traced against the
  current `skill/SKILL.md` (scaffold lines 174–175, 300–304, 417–422; per-row unescaped-pipe
  counts for lines 176–299 and 305–416) and against all 68 fixture mutations.
- Primary sources consulted: cmark-gfm `extensions/table.c` (`try_opening_table_header`,
  `CMARK_NODE__TABLE_VISITED`, `unescape_pipes`, `row_from_string`), cmark-gfm
  `extensions/ext_scanners.re` (`spacechar`, `escaped_char`, `table_marker`, `table_cell`,
  `_scan_table_start`), cmark-gfm `test/extensions.txt`, comrak `src/tests/table.rs`, the GFM
  specification (§4.5, §4.10, §6.1), the Rust Reference dyn-compatibility rules (as re-verified
  by rounds 19–21), and the crates.io API for `rustls`.
- Per the explicit request, no test, validator, fixture runner, build, installer, package command,
  syntax checker, or other project executable was run, and no sub-agents were spawned. Mirror
  parity was established from index blob hashes (`git ls-files -s`), not by running
  `dev/sync-mirror.mjs`. The active Codex installation was compared by SHA-256 of the files on
  disk (read-only).
- **Concurrent-work caveat.** While this review was in progress a further commit landed on `main`
  (`dbeddcd`, 20:50:13, `fix: harden repository validation invariants`), and the working tree now
  carries uncommitted edits to `CHANGELOG.md`, `dev/validate.mjs`, and `docs/reviews/README.md`
  from a concurrent session. Both are **outside the requested range and were not reviewed**;
  every file:line citation below refers to the `3e8d433` blobs. `dbeddcd`'s diff was spot-read
  only to confirm it does not close the P2 items below (it re-labels ledger row 39 "Superseded",
  adds a "cycle 8" row, adds fixture controls 69–78, and removes the duplicated fixture-suite run
  from `package.json`/`ci.yml`; it does not restore the deleted fence/NBSP/CR controls, amend
  ledger rows 32–33, or record a validator run). Pre-existing untracked `.githooks/` was excluded
  and left untouched. The only working-tree write made by this review is this report.

## Executive result

- **No P1 finding.**
- **Three P2 finding groups**, all in the tooling/record layer: (1) the `014382a` refactor deleted
  the regression controls that rounds 16–19 required and that the ledger and changelog still
  record as present (fence marker-length, tab-indented fake opener/closer, form-feed-suffix false
  closer, NBSP bullet/NBSP-only line, NBSP delimiter, CR/CRLF probes) without replacement or a
  record of the deletion; (2) the correction ledger and `[Unreleased]` changelog now contradict
  the shipped validator and each other — the "post-`a28b905` cycle 1" row is still `Corrected`
  while claiming optional 0–3-space leading pipes, paragraph-aware interruption, and NBSP
  rollback controls that no longer exist, the rounds-20–21 row names an `isFenceOpener(line)`
  predicate and a "table-boundary detection" that `014382a` removed, and the rounds-8–19 tooling
  paragraph describes `blockStartRe` and the state machine as the release's net state; (3) the
  eight validator commits rewrote the CI gate (`+372/-1,506` lines in `014382a` alone, then
  `+283/-40` and `+231/-86`) with subject-only commit messages, no review report, ledger/changelog rows
  that explicitly "do not assert test results", and `main` sitting 19 commits ahead of
  `origin/main` — so no committed artifact or CI run anywhere evidences that the rewritten
  validator and its 68 controls pass.
- **Five P3 findings**: the two fixture controls round 20 explicitly demanded were never added
  (one still meaningful under the anchored contract, one moot but not recorded as such);
  escaped-pipe *parity* is labelled GFM/cmark-gfm conformance although cmark-gfm's cell grammar
  and `unescape_pipes` have no parity rule; the new 120 s aggregate wall-clock timeout on the
  default `node dev/validate.mjs` path is the exact §D1 wall-clock-oracle shape the spec bans;
  ledger row 27 was rewritten in place from `Corrected` to `Reopened` without the ledger's
  add-a-row convention or a report; and several convention/precision nits (undefined "HS" and
  "cycle" numbering, dead `onSpan` parameter, misleading diagnostic for an indented row).
- **Rounds 20–21 closure:** both validator P3s are closed **by architecture** at `3e8d433` — the
  anchored-table contract makes the invalid-fence false negative and the NBSP-delimiter false
  positive impossible, and the fence predicate is shared — but the closure was reached by first
  implementing the requested fixes (`a28b905`) and then deleting that machinery (`014382a`), and
  the requested counterfactual fixtures were never written. The active Codex installation is now
  13/13 current (closed outside Git; no record).
- **Round-19 fix `49433b9` and round-18 fix `7726ed6`:** re-verified at `3e8d433`; every
  normative correction is present and byte-mirrored, and the external facts still hold on
  2026-09-05 (rustls stable `0.23.43`, pre-release `0.24.0-dev.1` only; dashmap `try_entry()` →
  `Option<Entry>`; the five dyn-dispatchability shapes plus the unconditional associated-const
  strip). The round-19 tooling half (`blockStartRe`/blank-line class, the eol=lf comment, the two
  NBSP controls) was subsequently removed wholesale by `014382a` — see P2 finding 1.
- **Round-20 and round-21 reports:** their range arithmetic (`+340/-26`; `+239/-0`), category
  arithmetic (A 3, B 29, C 12, D 5, E 6, F 4 = 59), cmark-gfm citations (`spacechar =
  [ \t\v\f]`, GFM §4.5 info-string rule), and both counterexamples were re-derived and hold.
- **Static trace of the shipped validator against the shipped `SKILL.md`:** no failure found
  (scaffold lines exact; every prompt-trigger row has exactly four unescaped pipes and every
  code-pattern row exactly three — line 388's `\|s\|` is the only escaped-pipe row; no
  angle-leading, container-prefixed-fence, ≥4-space-indented-fence, or literal `\"` line in any
  `skill/*.md`; both `SKILL.md` fences close). This is a hand-trace, not a run.
- Overall verdict: **REQUEST CHANGES** (P2 in the record/regression layer; nothing here weakens
  a shipped normative rule).

## P2 findings

### 1. `014382a` deleted the regression controls rounds 16–19 required, and the ledger/changelog still record them as present

Locations: `dev/validate-fixtures.mjs` at `3e8d433` (68 controls, lines 184–790) versus
`49433b9:dev/validate-fixtures.mjs:373–434` (round-16–19 controls) and
`ee86c0d:dev/validate-fixtures.mjs:460–472, 499–521, 627–646` (cycle-1 controls);
`docs/reviews/README.md:31, 33`; `CHANGELOG.md:57, 61`.

The refactor took the suite from 92 controls to 68 and replaced the GFM table machine with the
anchored contract. That change of contract legitimately retires the block-start, one-column,
HTML-block, list-container, and `TABLE_VISITED` probes — those mechanisms no longer exist. But
the following behaviours **do** still exist at `3e8d433` and are now unpinned:

| Behaviour still implemented at `3e8d433` | Where | Control that pinned it | Present at `3e8d433`? |
|---|---|---|---|
| Closer must be at least as long as the opener (a 3-tick line inside a 4-tick fence is content) | `dev/validate.mjs:264-267` (`length >=`) | round 16 `4-backtick-fence-3-backtick-content` (`49433b9:401`) | **No** |
| Tab-indented ```` ``` ```` is neither opener nor closer (`^ {0,3}` literal spaces) | `:260, :265` | round 17/18 `tab-indented-fake-opener` / `tab-indented-fake-closer` (`49433b9:405, :423`) | **No** |
| Form-feed after a closing delimiter leaves the fence open (`[ \t]*$`) | `:265` | round 18 `closer-form-feed-suffix-fence-still-open` (`49433b9:404`) | **No** |
| NBSP is not blank and not table space (`/^[ \t]*$/`, `[ \t\v\f]`) | `:251-253, :484` | round 19 `nbsp-prefixed-bullet` / `nbsp-only-line` (`49433b9:377-378`); cycle-1 NBSP-delimiter and per-branch NBSP rollback controls (`ee86c0d:460-472, 627-646`) | **No** |
| CRLF / lone CR normalised before any line predicate | `:254-257` (`splitGfmLines`) | cycle-1 controls 28–31 (`ee86c0d:499-521`) | **No** |

Each of these was added in direct response to a numbered finding of rounds 16, 17, 18, 19 or
the post-`a28b905` cycle, and each is still described as present: ledger row 31 ("the fixture
suite gains the missing tab-indented fake-closer control plus a form-feed-suffix false-closer
control"), ledger row 33 ("branch-complete NBSP rollback controls", "CRLF/lone-CR parsing"),
`CHANGELOG.md:57` ("five new fixture controls", "three new fixture controls", "the fixture suite
gains the missing tab-indented fake-closer control", "adds two fixture controls"). No commit in
the range records that they were removed, and the ledger's own quality gate (item 5) requires a
committed regression record for exactly this kind of fix. The seven fence-state controls at
`3e8d433` (26–32) cover only 0–3-space indentation, a trailing-text false closer, a wrong-marker
false closer, and the backtick-info false opener — the regressions rounds 17–19 actually fought
(`\s` creeping back into the closer suffix, the indentation class, or the blank-line test) would
pass the current suite unnoticed.

Correction: restore the five control classes above as anchored-contract probes (each is a
one-fence or one-row insertion: a 4-tick fence with a 3-tick interior line and a `\"`; a
`\t```` fake opener/closer; a ```` ``` \f ```` closer; an NBSP-only body line and an NBSP-wrapped
delimiter cell, both expected to fail with the width/delimiter diagnostic; a CRLF-terminated
`SKILL.md` copy expected to pass), and add one ledger row stating which pre-refactor controls
were retired as moot and which were carried.

### 2. The ledger and the `[Unreleased]` changelog contradict the shipped validator and each other

Locations: `docs/reviews/README.md:32-33, 39`; `CHANGELOG.md:57, 59, 61, 73`; `README.md:27-35`.

(a) Ledger row 33 (`post-a28b905 HS review-cycle`, status **Corrected**) and `CHANGELOG.md:61`
claim closure of "optional leading pipes with 0–3 spaces", "paragraph-aware interruption",
"duplicate signatures only for confirmed tables", and "branch-complete NBSP rollback controls".
At `3e8d433` the contract is the opposite on the first item — `contractRow` requires a raw
column-1 pipe (`dev/validate.mjs:308-311`; README "raw column-1 leading pipes … are required";
ledger row 39 and `CHANGELOG.md:73` say the same) — and none of the other three mechanisms
exist. Rows 34–38 were each re-labelled **Superseded** by the next cycle; row 33 was not, so a
reader of the ledger is told that two mutually exclusive leading-pipe contracts are both the
corrected state.

(b) Ledger row 32 and `CHANGELOG.md:59` state that "the shared `isFenceOpener(line)` predicate
applies GFM §4.5's backtick-info restriction to table-boundary detection". `isFenceOpener` was
introduced by `a28b905`, and removed by `014382a` (`git log -S'isFenceOpener'`); the surviving
predicate is `projectFenceOpener` (`dev/validate.mjs:259-263`) and there is no table-boundary
detection to apply it to — the fence mask (`:269-283`) and the anchored scan replace it. The
sentence is true of `a28b905` only.

(c) `CHANGELOG.md:57` is the paragraph that will ship as the next release's tooling record. It
describes, in the present tense, a "stateful header/delimiter/body/rejected table machine",
`blockStartRe` with end-of-line markers and column-based tab expansion, the narrowed blank-line
test, the fence-closer comment "with the `.gitattributes` `eol=lf` dependency now stated", and
the round-16–19 controls. At `3e8d433` none of these exist: there is no table machine, no
`blockStartRe`, no tab expansion, no eol=lf comment (CR is normalised by `splitGfmLines`
instead), and the controls are gone (finding 1). The "cycle 5" paragraph (`:69`) mentions an
"architectural correction to validator scope" but never says the machinery described eight lines
earlier was removed. A release cut from this entry would document a validator that does not
exist.

(d) Minor, same class: "Rounds 20–21 close the two validator-conformance P3 findings" (`:59`)
credits the review rounds with a fix that `a28b905` made; the abbreviation "HS" (`:61-73`, ledger
rows 33–39) is never defined; and `CHANGELOG.md:63-71` records five superseded intermediate
states of the same commit series inside one release entry, each of which "does not assert … a
new commit" although each was itself a commit.

Correction: mark row 33 **Superseded** (by `014382a`), and rewrite row 32 / `CHANGELOG.md:59` to
say the two findings are closed by the anchored contract and the shared `projectFenceOpener`;
collapse `CHANGELOG.md:61-73` into one paragraph that states the net tooling change of the
release (anchored two-table contract, fence mask, bounded code-span scanner, explicit
unsupported-style rejection, retired GFM emulation) and amend `:57` so the round-16–19 sentences
read as history ("…was later replaced by the anchored contract; see below") rather than as the
current state; define or drop "HS".

### 3. The validator rewrite carries no evidence of ever having been run

Locations: commit messages of `a28b905`…`3e8d433` (subject only, no body — `git log --format=%B`);
`docs/reviews/README.md:33-39` ("this row records the closure scope without asserting test
results"); `CHANGELOG.md:61-73` (same wording); `git status -sb` → `main...origin/main [ahead 19]`.

Every prior fix commit in this project's history states what it ran and how it was mutation-checked
(`7726ed6`: "Independently reverted each half of the fenceCloser fix in turn and re-ran the
fixtures"; `49433b9`: "two new fixture controls added and independently verified to catch the
reverted regex"). The eight commits that replaced the CI gate — `dev/validate.mjs` `+168/-596`
and `dev/validate-fixtures.mjs` `+198/-907` in `014382a`, then `+100/-29` / `+168/-9`
(`a018845`) and `+53/-17` / `+171/-65` (`3e8d433`) — have no body at all, no review report (`docs/reviews/` gained nothing after `ab2a1bd`), and their
only record consists of ledger/changelog rows that go out of their way to disclaim test results.
Because `main` is 19 commits ahead of `origin/main`, the `validate` workflow has not executed on
any commit since `19f6599`, i.e. on none of rounds 16–21 or the eight validator commits.

This review's hand-trace finds no failure of the shipped validator against the shipped
`skill/SKILL.md` (scaffold and pipe-count checks in the verification record below), and the 68
controls were traced individually to the diagnostic strings they require; but a hand-trace is
not a run, and the 68-control suite spawns roughly 270 Node processes whose expectations depend
on exit codes and exact diagnostic text. Under the ledger's quality gate this closure is
unevidenced.

Correction: in the next non-read-only round, run `node dev/validate.mjs` (which spawns the
fixture suite) and record the result and the mutation checks in a commit body or a ledger row;
push so the `validate` workflow runs; going forward, restore the commit-body convention for
tooling fixes.

## P3 findings

### 4. The two fixtures round 20 explicitly demanded were never added

Locations: `dev/validate-fixtures.mjs:440-449` (controls 30–32) and `:482-491` (controls 35–36);
round-20 report findings 1–2 ("Correction: … Add an isolated table negative control that inserts
only `` ```lang`invalid `` after a body row and specifically requires the missing-leading-pipe
diagnostic"; "add the NBSP-delimiter counterexample as a must-stay-quiet fixture").

At `3e8d433` a `` ```lang`invalid `` line placed inside either anchored body is rejected by
`projectFenceOpener` (`:261`, backtick in info string) and therefore reaches `contractRow`,
which yields one cell and the width diagnostic ("body row has 1 cells; expected N",
`:491-493`). That closes the round-20 false negative — but with a different diagnostic than
round 20 asked for and with no control: control 32 still only proves the *escape* guard fires on
a later `\"` line, exactly the gap round 20 named, and controls 35–36 strip pipes from a real row
rather than inserting a fence-shaped line. The NBSP-delimiter must-stay-quiet control is moot
under the anchored contract (non-anchored tables are ignored, controls 11–12), but nothing
records it as moot; ledger row 32 says the NBSP finding is "closed" as though the requested
control existed.

Correction: add the isolated `` ```lang`invalid `` body-row control (expect the width
diagnostic at that line and forbid "unclosed project fence"), and one line in the ledger row
recording that the NBSP-delimiter counterexample cannot occur under the anchored contract.

### 5. Escaped-pipe "parity" is labelled GFM/cmark-gfm conformance, but the reference scanner has no parity rule

Locations: `dev/validate.mjs:287-292, 297-299` (`isEscapedChar` odd/even test in
`splitTableCells`); `dev/validate-fixtures.mjs:365-373` (control 15 "even escaped-pipe parity":
`\\|` is expected to split the cell); ledger row 33 ("escaped-pipe backslash parity" listed as a
closed conformance class); the pre-refactor comment removed by `014382a` ("`\|` is content,
`\\|` is a delimiter, and the same odd/even rule applies to longer runs").

cmark-gfm's cell grammar (`extensions/ext_scanners.re`) is
`escaped_char = [\\][|!"#$%&'()*+,./:;<=>?@[\\\]^_`{}~-]` and
`table_cell = (escaped_char|[^|\r\n])+`, scanned by re2c with longest-match semantics. On the
input `\\|b` the longest match is `\` (as `[^|\r\n]`) followed by `\|` (as `escaped_char`)
followed by `b` — the pipe is consumed into the cell. `unescape_pipes` in `extensions/table.c`
then strips exactly one backslash before each `|` with no parity test
(`if (res->ptr[r] == '\\' && res->ptr[r + 1] == '|') r++;`), and the inline parser turns the
remaining `\|` into a literal pipe. So in the reference implementation `a\\|b` is **one** cell
rendering as `a|b`, whereas the validator (and control 15) treat `\\|` as a cell boundary. GFM
§4.10's only statement is "It is possible to include a pipe in a cell's content by escaping it,
including inside other inline spans"; neither the spec examples, `cmark-gfm/test/extensions.txt`,
nor comrak's `src/tests/table.rs` contains a `\\|` case, so this is derived from the grammar, not
from an executed reference — which is precisely why it should not be asserted as conformance.

No live exposure: `skill/SKILL.md:388` is the only escaped-pipe row and uses single `\|`. The
validator may keep parity as a *documented repository convention* (it is the CommonMark-consistent
reading), but the ledger row, the control name, and any future comment should stop calling it
GFM/cmark-gfm behaviour until it is verified by running cmark-gfm on the input.

### 6. The new 120 s aggregate wall-clock timeout is the §D1 shape the spec itself bans

Locations: `dev/validate.mjs:639-653` (`fixtureTimeoutMs = 120_000`, `killSignal: 'SIGTERM'`);
`dev/validate-fixtures.mjs:160-164` (`timeout: spawnOptions.timeoutMs ?? 30_000` per control);
`.github/workflows/ci.yml:38-41` (`node dev/validate.mjs` on `ubuntu-latest`, at `3e8d433` also
a second full `node dev/validate-fixtures.mjs` run); `skill/SKILL.md:357` ("any wall-clock
threshold asserted inside a `#[test]` | §D1 (tight → flakes on a loaded runner …)").

Before this window neither timeout existed. The per-control 30 s budget is generous for one
validator run. The aggregate 120 s budget is not: the default `node dev/validate.mjs` path now
runs 68 controls, each of which copies `skill/`, `skills/`, `bin/`, `commands/` and spawns one
validator child that itself spawns three installer children — about 270 process starts — and
fails the whole gate if the child exceeds 120 s wall-clock. On a cold or co-tenanted runner
(Defender-scanned Windows, a busy shared Linux CI host) that is a flake, and the control-41
comment's own framing ("the generous timeout is only a last-resort safety watchdog against
nontermination") describes a watchdog, not a 2-minute budget. The project's own trigger row for
this shape recommends a deterministic counter, which control 41 already has (the operation
budget); the wall-clock gate should be sized as a watchdog (minutes, or `count × per-control
budget`) and/or be env-overridable, with the per-run cost recorded once so a future change to
the control count re-sizes it.

### 7. Ledger row 27 was rewritten in place from `Corrected` to `Reopened` without a report or the ledger's add-a-row convention

Location: `docs/reviews/README.md:27` (changed by `8d4db70`; compare row 24, "this ledger, row
above (2026-09 correction)", the established convention for correcting an earlier row).

The content is right: cmark-gfm's `try_opening_table_header` returns early when
`parent_container->flags & CMARK_NODE__TABLE_VISITED` and sets that flag on the
`header_row->n_columns != delimiter_row->n_columns` path, so after the first width mismatch a
later delimiter row is never retried and `a | b | c` / `|---|---|` / `|---|---|` / `x | y` stays
one paragraph — the round-15-rush false-positive finding stands and the round-15 synthesis's
"False alarms §1" is now the superseded text. But the row was overwritten rather than appended,
so the ledger no longer shows the withdrawn reasoning ("the header row is the last line of the
pending paragraph", which is also true — cmark-gfm splits a multi-line paragraph at
`header_row->paragraph_offset` — and simply does not rescue the case), the change is attributed
to no review round, and `8d4db70`'s subject ("complete GFM validator state handling") gives no
hint that a ledger disposition was reversed. Correction: restore the original row text, add the
`Reopened` disposition as a new row citing `8d4db70` and the cmark-gfm lines above.

### 8. Convention and precision nits

- Commit messages: the eight validator commits are subject-only (`git log --format=%B`), against
  the project's convention of a body naming the review and the verification performed
  (`7726ed6`, `49433b9`, `e76c372`, `91077f4`); the subjects also describe superseded intents
  ("cover nested GFM parser edge cases", "refine CommonMark container validation") that
  `014382a` reverted an hour later.
- `dev/validate-fixtures.mjs:285` "Cycle-5 anchored table contract controls." — the cycle
  numbering is defined nowhere in the tree; "HS" likewise (finding 2d).
- `dev/validate.mjs:315` `codeSpanTokens(text, onOutside, onSpan)`: `onSpan` is never passed by
  either caller (`:385`, `:394`) — dead parameter left from `a018845`.
- Diagnostic precision: an anchored body row indented by one to three spaces (`  | a | b |`)
  produces "has N+1 cells; expected N" rather than the leading-pipe diagnostic, and an indented
  header anchor produces "missing … header anchor"; both are correct failures under the
  raw-column-1 contract but neither names the actual defect (leading whitespace). One `^[ \t]+\|`
  check before `splitTableCells` would say so.
- Pre-existing, fixed post-range: `package.json` `validate` and `ci.yml:38-41` ran the fixture
  suite twice (once via `validate.mjs`'s spawn, once directly) since v0.5.0; `dbeddcd` removes
  the duplicate. Not a window defect; noted so it is not re-raised.

## Round-20/21 closure matrix

| Round-20 item (carried by round 21) | Round-22 disposition |
|---|---|
| 1. Invalid backtick-fence opener flushes table state (false negative) | **Closed by architecture.** `a28b905` introduced the shared `isFenceOpener` and excluded fences from `blockStartRe` as requested; `014382a` then removed both, and at `3e8d433` the anchored body scan treats the line as a one-cell row (width diagnostic) while the fence mask and escape guard share `projectFenceOpener`. Requested isolated control **not added** (finding 4). |
| 2. Table delimiter normalisation used Unicode-wide `trim()` (false positive) | **Closed.** `trimGfmTableSpace` (`[ \t\v\f]`, `:251-253`) survives the refactor and is the only cell trimmer; the phantom-table false positive cannot occur because non-anchored tables are ignored. Requested must-stay-quiet control not added and not recorded as moot (finding 4); the round-19 NBSP controls were deleted (finding 1). |
| 3. Active Codex installation stale in four files | **Closed outside Git.** SHA-256 on 2026-09-05: 13/13 files under `C:\Users\Computer\.agents\skills\rust-intel\` identical to `skill/`. No commit records the reinstall; none is required. |
| Round-20 recommendation 3 / round-21 step 3: dynamic run in a non-read-only round | **Not done and not evidenced** (finding 3). |

## Per-commit completeness of the eight validator commits

The commits carry no bodies, so "claim" below is the changelog/ledger paragraph each one added.

| Commit | Claim added in the same commit | Disposition at `3e8d433` |
|---|---|---|
| `a28b905` | rounds 20–21 P3s closed: shared `isFenceOpener`, `[ \t\v\f]` trimming | Implemented as claimed at this commit; `isFenceOpener` and the boundary classifier later removed; trimming retained. Row text now stale (finding 2b). |
| `44eb16c` | cycle 1: fenced-content suppression; CRLF/CR; optional 0–3-space leading pipes; paragraph-aware interruption; escaped-pipe parity; duplicates only for confirmed tables; NBSP rollback controls | Fence mask and CR normalisation retained; 0–3-space optional pipe reversed to raw column-1; interruption logic and NBSP/CR controls deleted; parity retained but mislabelled (finding 5). Row still `Corrected` (finding 2a). |
| `8d4db70` | cycle 2: one-column tables, `TABLE_VISITED`, HTML start/continuation, CommonMark code spans, nested blockquote fences; ledger row 27 reversed | All but the code-span extraction superseded; row 27 reversal correct in substance, wrong in form (finding 7). Row marked Superseded. |
| `80d8452` | cycle 3: pipe-less/mixed one-column headers, setext boundary, type-1 HTML terminators, list-contained HTML/fences, inline-HTML/autolink precedence, injective keys | Injective keys retained (control 18); rest superseded. Marked Superseded. |
| `ee86c0d` | cycle 4: list-container lifecycle, 0–3-space HTML starts, link/image destinations and titles, inline HTML priority, autolink bounds | Superseded wholesale by `014382a` (`inlineLinkParts`, `inlineMarkupEnd`, container tracking deleted). Marked Superseded. |
| `014382a` | cycle 5: validator bounded to the two anchored tables and a documented Markdown subset; unsupported syntax fails explicitly | Implemented; deleted 24 controls without record (finding 1); changelog left describing the removed machine (finding 2c). Marked Superseded by cycle 6. |
| `a018845` | cycle 6: exactly two global anchors, raw column-1 pipes/widths/bodies, standalone fences, explicit unsupported-style rejection; README contract | Implemented; fence mask now feeds the anchor scan; `stripSimpleContainerChain`; URI/email ban. Marked Superseded by cycle 7. |
| `3e8d433` | cycle 7: scaffold continuation through the Category map, prose-only rows excluded from dedup, budgeted code-span scanner, bounded fixture child | Implemented as claimed; introduces the wall-clock budgets (finding 6). |

## Static verification record

| Check | Result |
|---|---|
| Commit range | 13 commits, 16 files, `+1599/-318` (`0a00dab..3e8d433`); post-range `dbeddcd` and uncommitted worktree edits excluded |
| `git diff --check 0a00dab..3e8d433` | PASS (no output) |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — 13/13 index blob hashes identical |
| Canonical `skill/` vs active Codex installation | PASS — 13/13 SHA-256 identical (round-20 finding 3 closed) |
| Line endings | all changed files `i/lf w/lf` under `.gitattributes` `text=auto eol=lf` |
| Numbered categories | 59 (A 3, B 29, C 12, D 5, E 6, F 4); round-20/21 module counts re-summed |
| `SKILL.md` scaffold at `3e8d433` | lines 174/175 header+delimiter, 300 blank, 301 `**Triggered by code, not phrase**`, 302 blank, 303/304 header+delimiter, 417 blank, 418 `When two or more triggers…`, 419 blank, 420 `---`, 421 blank, 422 `# Category map — which module holds each §` — all as the contract requires |
| Row widths | lines 176–299: 4 unescaped pipes each; lines 305–416: 3 each (line 388 has two `\|` escapes, correctly parity-escaped) |
| Escape-guard preconditions in `skill/*.md` | no `^ {0,3}<` line, no container-prefixed fence, no `^ {4,}` or tab-indented fence, no literal `\"` anywhere; `SKILL.md` fences 52–58 and 506–533 open and close under `projectFenceOpener`/`projectFenceCloser` |
| Code-pattern first cells | no `[`, `![`, raw `<`, URL, `www.`, or e-mail token outside code spans found by reading all 112 rows; duplicate-signature sets not recomputed mechanically |
| Fixture suite self-description | "sixty-eight hand-written controls" — 68 counted (1–4, 5–10, 11–12, 13, 14–15, 16, 17, 18, 19–22, 23–25, 26–29, 30–32, 33–34, 35–36, 37–38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49–53, 54, 55–60, 61, 62, 63, 64, 65, 66–67, 68); 13 `ruleTextControls`; 2 source probes |
| Fixture hand-trace | all 68 mutations traced to the diagnostic/status they require; control 45's fence closes before the `---`/anchor scaffold so "unclosed project fence" cannot fire; control 41 stays inside the operation budget (`≈2·len + runs` charges vs `128 + 64·len`) |
| Code-span scanner vs CommonMark §6.1 | edge-space stripping, line-ending normalisation, "backslash escapes do not work in code spans" (closer is the raw run), escaped-first-tick suffix opener — all consistent with cmark's `handle_backticks`/`scan_to_closing_backticks`; controls 42, 65–67 trace correctly |
| cmark-gfm table grammar | `spacechar = [ \t\v\f]`, `table_marker = (spacechar*[:]?[-]+[:]?spacechar*)`, `table_cell = (escaped_char\|[^\|\r\n])+`, `_scan_table_start = [\|]? table_marker ([\|] table_marker)* [\|]? spacechar* newline`; `row_from_string` → `unescape_pipes` (no parity) → `cmark_strbuf_trim` — finding 5 |
| cmark-gfm `try_opening_table_header` | early return on `CMARK_NODE__TABLE_VISITED`; flag set on column-count mismatch; multi-line paragraph split at `header_row->paragraph_offset` — ledger row 27 content correct (finding 7 is form only) |
| GFM spec text | §4.5 "If the info string comes after a backtick fence, it may not contain any backtick characters" and "may be followed only by spaces"; §6.1 edge-space rule; §4.10 escaped-pipe sentence — as cited by rounds 19–21 |
| `49433b9` normative fixes at `3e8d433` | `SKILL.md:8` five dispatchability shapes + unconditional associated-const strip; `async.md:17` `try_entry()` → `Option<Entry>`; `deps-macros-ergonomics.md:118` rustls 0.24 as pre-release (crates.io 2026-09-05: `max_stable_version 0.23.43`, `max_version 0.24.0-dev.1`); `sources.md:276` RUSTSEC-2026-0195 issued 2026-07-02; `CHANGELOG.md:22` Rust 1.100 `~2026-11-12`; `:21` "two rounds of Cargo advisories" — all present, mirrored |
| Round-20 report arithmetic | `0a00dab..49433b9` = 13 files, `+340/-26` — PASS |
| Round-21 report arithmetic | `49433b9..803a87f` = 1 file, `+239` — PASS |
| Push state | `main...origin/main [ahead 19]` — no CI run on any commit in the range (finding 3) |
| Tests/validators/fixtures/build/install/package/syntax checks | **NOT RUN**, per request |
| Sub-agents | Not used |
| Pre-existing `.githooks/`; concurrent worktree edits | Untracked / unstaged, not read into the result, not modified, not staged |

## Recommended correction order

1. Finding 3 — run `node dev/validate.mjs` in a non-read-only round, record the outcome and the
   mutation checks in a commit body, and push so the `validate` workflow executes on the range.
2. Finding 1 — restore the fence marker-length, tab-indented opener/closer, form-feed-suffix,
   NBSP body-line/delimiter, and CRLF controls as anchored-contract probes, plus the round-20
   `` ```lang`invalid `` body-row control (finding 4); add the ledger row listing retired versus
   carried controls.
3. Finding 2 — mark ledger row 33 Superseded, correct row 32 and `CHANGELOG.md:57-61` to the
   `projectFenceOpener`/anchored-contract wording, collapse the cycle paragraphs into one net
   tooling record, define or drop "HS".
4. Finding 7 — reinstate the original row-27 text and append the `Reopened` disposition as its own
   row citing `8d4db70` and cmark-gfm.
5. Findings 5, 6, 8 — relabel parity as a repository convention (or verify it against cmark-gfm
   by execution), resize the fixture watchdog, drop `onSpan`, add the leading-whitespace
   diagnostic, and restore commit-body convention for tooling fixes.
