# Round 23 review of the latest commits and release readiness — 2026-09-06 08:10 CEST

## Part 1 — review of the latest commits

### Scope and method

- Review base: `3e8d433f9ec8e47cc66566251b9ebaf4fda6b7f6` (`fix: close bounded validator escape routes`,
  the round-22 head).
- Reviewed head: `15afad0633baa9de8d64d6897a2a7b338620dc7d` (`build: require Node.js 24`), which is
  also `origin/main` (pushed 2026-09-06 07:58 CEST).
- Range: `3e8d433..15afad0` — 28 commits, 14 files, `+4770/-184`: the round-22 report (`545957c`),
  `dbeddcd` and `0d6facb` (subject-only), 23 `fix:` commits with bodies (`11dc3df` … `bd91e42`), two
  `docs:` commits (`bd15e91`, `2dc4e47`), and `15afad0`. The only files touched are
  `dev/validate.mjs` (`+1891` net lines, 2356 at head), `dev/validate-fixtures.mjs` (`+2373`, 3178
  at head), `CHANGELOG.md`, `README.md`, `docs/reviews/README.md`, `.github/workflows/ci.yml`,
  `.gitignore`, `package.json`, `bin/install.js`, `bin/install-codex.js`, the new
  `bin/node-version.js`, and `skill/audit-project.workflow.js` with its mirror. **No normative
  Markdown (`skill/*.md`) changed in the range**; the twelve `.md` blobs are byte-identical to the
  `3e8d433` blobs round 22 hand-traced, so round 22's Rust/crate fact verification (rustls, dashmap,
  dyn-compatibility, RUSTSEC ids) carries forward unchanged and was not re-derived.
- Method: static, revision-qualified inspection only. `dev/validate.mjs`, `dev/validate-fixtures.mjs`,
  `skill/audit-project.workflow.js`, `bin/node-version.js`, both installers, both workflows,
  `package.json`, both plugin manifests, `README.md`, `CHANGELOG.md` `[Unreleased]`, and the ledger
  were read in full at `15afad0`; all 28 commit messages and the per-file diffs of the non-validator
  files were read; the validator/fixture commits were assessed against the code at head (each commit's
  stated mechanism was located in the head source and its controls counted). The 375-control fixture
  numbering was recounted block by block. The primary checkout at `D:\dev\rust\rust-intel` was not
  read or modified; the orchestrator's start-of-review snapshot showed uncommitted edits to five files
  there, which by the end of this review had become `15afad0` (the primary checkout now carries only
  the pre-existing untracked `.githooks/`).
- External evidence gathered read-only: the GitHub Actions run list and job/step records for this
  repository (`gh run list` / `gh run view`), cmark-gfm `extensions/table.c` (`try_opening_table_header`,
  `unescape_pipes`), the Node.js `fs` API reference (`fs.cpSync` history), the Node.js release schedule
  (`nodejs/Release` `schedule.json`), and ECMA-262 lexical grammar (line terminators, optional-chaining
  punctuator lookahead, identifier characters, `\u{…}` code-point escapes — cited by section; the fetch
  tool returned only the specification's table of contents, so those four productions are quoted from
  the specification as known rather than re-fetched).
- Per the request, no test, validator, fixture runner, build, installer, package command, syntax
  checker, or other project executable was run, and no sub-agents were spawned. Mirror parity comes
  from index blob hashes; active-Codex-install parity from SHA-256 of the files on disk.

### Executive result

- **No P1 finding.**
- **One P2 finding**: the `[Unreleased]` changelog and the ledger were not collapsed into a net
  record as round 22 asked; they grew from five to twenty-five "cycle N is superseded by cycle N+1"
  paragraphs (`CHANGELOG.md:63-109`) and thirty-three matching ledger rows (`docs/reviews/README.md:34-66`),
  carrying per-cycle control counts, and still contain statements that are false at head
  ("CI/Node 16.7.0 remains pending and unpushed", `:109`) and a wrong technical rationale for the
  Node floor (`:59`, `fs.cpSync`). This is the record layer only; nothing in it weakens a shipped rule.
- **Five P3 findings**: the `fs.cpSync` rationale is factually wrong (it dates the *previous* floor,
  16.7.0); `0d6facb` is the one in-range commit that still has no body and no report; the fixture
  suite's own header describes roughly a third of what it contains; the round-22 dead-parameter nit
  moved from `onSpan` to `onOutside`; and a short list of precision nits (undefined "Sol-high" label,
  a `\u{…}` digit cap that is stricter than ECMA-262, a joined changelog paragraph, a `'([['` typo in a
  boundary character class, a redundant `validateInputs` entry, a Layout tree missing `bin/node-version.js`).
- **Round-22 closure**: all three P2 findings and P3 findings 4–7 are closed at head — the deleted
  fence/NBSP/CR controls are back (controls 98–105, 117), the ledger rows 27/28 and 33/34 read
  correctly, the parity convention is relabelled everywhere, the watchdog is 15 minutes and
  env-overridable, and — the decisive change — `main` was pushed and the `validate` workflow ran
  green on `15afad0` (run 34015308368, both jobs). Round 22's finding 2(d) (collapse the cycle
  paragraphs) is the one item that went backwards. See the closure matrix.
- **Executed evidence now exists**: GitHub Actions run 34015308368 (2026-09-06 05:58:47Z, `push`,
  `validate`) completed `success` on both `repository-checks` and `Node.js 24.0.0 floor`; the step
  that runs `node dev/validate.mjs` (which spawns the 375-control fixture suite) took 144 s on the
  Node 24 job and 130 s on the 24.0.0 floor job. That is the first CI execution of the validator
  since `19f6599` (2026-09-03), and it covers the head of this range end to end. Twenty-seven of the
  twenty-eight commits also carry a body naming what was run.
- **Static trace at head**: the anchored-table scaffold in `skill/SKILL.md` is unchanged (header/
  delimiter 174/175 and 303/304, end markers 301 and 418, `---` at 420, Category map 422, blank + Cross-
  reference note at 451/452; fences 52–58 and 506–533 close); 65 level-2 `§` headings, 59 numbered,
  identical id set to `v0.6.0`; mirror 13/13 blob-identical; active Codex install 13/13 SHA-256
  identical; `git diff --check` clean; all changed files `i/lf w/lf`.
- Overall verdict for the range: **APPROVE with P2 record-layer corrections** (nothing here weakens a
  shipped normative rule; the validator is stricter than at `3e8d433` and is now CI-evidenced).

### P2 findings

#### 1. The `[Unreleased]` changelog and ledger are a per-cycle session log, not a release record, and carry statements that are false at head

Locations: `CHANGELOG.md:11, 59, 63-109` (twenty-five cycle paragraphs; `:89-90` two paragraphs
joined by a missing blank line; `:109` "CI/Node 16.7.0 remains pending and unpushed");
`docs/reviews/README.md:34-66` (thirty-three "Superseded"/"Integrated" cycle rows, `:65` "CI/Node
16.7.0 remains pending and unpushed"); round-22 finding 2(d) and correction order step 3.

Round 22 asked for `CHANGELOG.md:61-73` to be collapsed into one paragraph stating the net tooling
change of the release. The range instead appended one paragraph per cycle (cycles 10 through 32),
each of which records the fixture-count of the moment (144, 155, 165/166, 181, 192, 217, 238, 245,
255, 261, 273, 277, 289, 313, 325, 339, 343, 347), restates that "CI remains pending", and ends "No new
category … PATCH-shaped". The result is that the paragraph which will ship as this release's notes
contains: twenty-two obsolete control counts (the head count is 375, stated nowhere in the changelog
except the Node paragraph's absence of it); nine statements that Node 16.7 CI is pending, one of
which (`:109`) is in the last cycle paragraph and reads "CI/Node 16.7.0 remains pending and unpushed"
when at head the branch is pushed, CI is green, and 16.7.0 is no longer the floor (`:11` says so, but
only by declaring every earlier mention "historical"); and a Tooling bullet (`:59`) whose only
technical rationale for the new floor is wrong (finding 2). The ledger mirrors this with rows 34–66,
of which only three (`:52`, `:65`, `:66`) are "Integrated"; a reader has to walk twenty-four
"Superseded" rows to learn that the net state is described by rows 43, 52, 65 and 66 together. The
ledger's own quality gate (`:73`) asks for a committed regression record, not a running commentary,
and Keep a Changelog (cited at `:3`) defines the `[Unreleased]` section as the list of upcoming
changes, not the history of how they were reached.

Correction: replace `:63-109` with one paragraph — the net tooling state (anchored two-table
contract, fence mask, budgeted code-span scanner, unsupported-style diagnostics, structurally parsed
and deep-frozen `MODULES`/`AUDIT_UNITS` with the pinned policy matrix and the SHA-256-pinned coverage
block, the bounded JavaScript mutation scanner and its documented limits, the Node 24 floor with its
guards and CI jobs, 375 fixture controls with the retired-versus-carried disposition) plus one
sentence pointing at the ledger for the cycle history; move the per-cycle verification transcript
into the ledger or drop it; delete the "pending and unpushed" sentences or rewrite them as past tense
with the CI run id; fix `:59` (finding 2); insert the missing blank line at `:89-90`.

### P3 findings

#### 2. `CHANGELOG.md:59` gives `fs.cpSync` as the reason for the Node 24.0.0 floor; `fs.cpSync` dates the previous floor

Location: `CHANGELOG.md:59` ("Node floor 24.0.0 (`fs.cpSync`) is enforced by hard startup guards");
compare the pre-range text of the same line at `3e8d433` ("Node floor 16.7.0 (`fs.cpSync`)").

The Node.js `fs` API reference lists `fs.cpSync(src, dest[, options])` as "Added in: v16.7.0" — that
is precisely why the old floor was 16.7.0, and the range's edit kept the parenthetical while changing
the number. Nothing in `dev/validate.mjs`, `dev/validate-fixtures.mjs`, `bin/*.js` or
`skill/audit-project.workflow.js` requires Node 24: the newest APIs used are `Array.prototype.at`
(Node 16.6), `String.prototype.replaceAll` (15), `fs.cpSync` (16.7), `fs.realpathSync.native` (9.2)
and `\p{ID_Start}` Unicode property escapes (10). The floor raise is a support-policy decision
(`15afad0` states no technical reason either), which is legitimate, but the changelog should say so
rather than attribute it to an API that predates the floor by eight major versions. Correction: "Node
floor 24.0.0 (support policy: current LTS line; `fs.cpSync` has been available since 16.7.0)".

#### 3. `0d6facb` is subject-only, and `15afad0` cites an unrecorded review

Locations: `git log --format=%B 0d6facb` ("fix: enforce unique category coverage", no body);
`15afad0` body ("independent Sol-high review found no P0-P3 issues"); ledger row 42
(`docs/reviews/README.md:42`).

Round 22 finding 3 asked for the commit-body convention to be restored for tooling fixes. Twenty-three
of the twenty-four `fix:` commits in the range comply (each names `npm run validate`, the fixture
runner's declared control count, syntax checks, and for six of them the mirror check and the
`skill-creator` quick validation). `0d6facb` — the first commit after the round-22 report, adding
duplicate-owner/duplicate-heading detection (`dev/validate.mjs:1606-1615, 1644-1650`) and controls
83–87 — has no body; its only record is ledger row 42 ("cycle 9"), which by convention "records the
closure scope without asserting test results". Separately, `15afad0`'s body cites a review that
"found no P0-P3 issues" without a report under `docs/reviews/` or a ledger row, so the claim is not
checkable. Neither is a defect in the code (CI at head is green), but both are the class of
provenance gap the ledger exists to prevent. Correction: a ledger row for `0d6facb` naming its
verification, and either a report for the `15afad0` review or removal of the sentence from the record.

#### 4. The fixture suite's self-description covers about a third of its contents

Location: `dev/validate-fixtures.mjs:5-8`.

The header now says "three hundred seventy-five hand-written controls" — the count is right (recounted
block by block: 1–4, 5–10, 11–12, 13, 14–15, 16, 17, 18, 19–22, 23–25, 26–29, 30–32, 33–34, 35–36,
37–38, 39, 40, 41, 42–48, 49–53, 54, 55–60, 61–65, 66–67, 68–71, 72–74, 75–82, 83–85, 86–87, 88–90,
91–96, 97–105, 106–111, 112–114, 115–116, 117–120, 121–131, 132–136, 137–141, 142, 143–145, 146,
147–151, 152–156, 157–159, 160–166, 167–170, 171–172, 173–176, 177–178, 179–181, 182–185, 186–188,
189–197, 198–199, 200–203, 204–212, 213–214, 215–216, 217, 218, 219–220, 221–224, 225–227, 228–234,
235–238, 239–240, 241–243, 244–245, 246, 247–248, 249–253, 254–255, 256–261, 262–269, 270–272, 273,
274–275, 276–277, 278–281, 282–285, 286–289, 290–293, 294–297, 298–301, 302–305, 306–313, 314–319,
320–321, 322–325, 326–329, 330–335, 336–339, 340–341, 342–343, 344–347, 348–349, 350–354, 355, 356,
357–360, 361–364, 365–366, 367, 368, 369–371, 372, 373–375 = 375; thirteen `ruleTextControls`; two
source probes). But the parenthetical that follows still lists only the table/fence families from
`ee86c0d`'s era. The ~215 workflow controls (75–82, 90, 119, 121–132, 135–152, 156–163, 167–178,
181–347: structural `MODULES`/`AUDIT_UNITS` parsing, deep-freeze pinning, the coverage-block hash,
alias/mutation/ASI/class-boundary/switch-label scanning) and the 28 Node-floor controls (348–375) are
not mentioned, and "hand-written" undersells that 13 of the 375 never spawn a validator child (the
junction-alias control 4 and the in-process oracles 115–116, 134, 153–155, 164–166, 179–180, 356). Correction:
one sentence per family, and state the spawn count so the watchdog sizing (finding 6 of round 22) stays
reviewable.

#### 5. Precision nits

- `dev/validate.mjs:1814, 1875`: `codeSpanTokens(text, onOutside, onSpan)` — `onSpan` is now used
  (`:1895`), but `onOutside` is passed by neither caller (`:1884`, `:1895`); round 22's dead-parameter
  nit has swapped names rather than closed.
- `dev/validate.mjs:984-991`: `identifierEscape` accepts at most six hex digits inside `\u{…}`.
  ECMA-262 (`UnicodeEscapeSequence :: u{ CodePoint }`, `CodePoint :: HexDigits` with the sole
  constraint MV ≤ 0x10FFFF) permits leading zeros of any length, so `class \u{0000041}x {}` is a legal
  class declaration that `classHeaderInfo` will not recognise. No exposure in the shipped workflow;
  the README contract (`README.md:42`) already declares escaped spellings a runtime-only boundary, so
  either widen the scanner (accept leading zeros, cap by value) or extend that sentence to class names.
- `dev/validate.mjs:1208`: the character class string `'=,+-*/%&|^!?<>.:([['` repeats `[`; harmless
  (a `{` before a line break is caught earlier at `:1203`), but the intent was evidently `'([{'`.
- `dev/validate-fixtures.mjs:134, 136`: `validateInputs` lists both `bin` and `bin/node-version.js`;
  the second copy overwrites the first with identical bytes.
- "Sol-high" (`CHANGELOG.md:63-109`, ledger rows 34–65, `15afad0` body) is a model/effort label defined
  nowhere in the tree; round 22 made the same point about "HS".
- `CHANGELOG.md:89-90`: two bold-led paragraphs with no blank line between them render as one
  paragraph.
- `README.md:72-104`: the Layout tree does not list `bin/node-version.js` (new in the range and shipped
  in the npm package via `files: ["bin/"]`), nor `dev/`, `examples/`, or `docs/reviews/`.

### Round-22 closure matrix

| Round-22 item | Round-23 disposition at `15afad0` |
|---|---|
| P2-1. `014382a` deleted the round-16–19 regression controls | **Closed** by `11dc3df` and `d7bdf66`: 4-tick fence / 3-tick interior (control 98, `dev/validate-fixtures.mjs:1157-1168`), tab-indented fake closer (99, `:1170-1180`) and fake opener (117, `:1509-1515`), form-feed suffix (100, `:1182-1192`), NBSP-only body line (101, `:1194-1204`), NBSP-wrapped delimiter (102, `:1206-1219`), CRLF and lone-CR whole-file copies (103–104, `:1221-1227`). Each asserts both the required diagnostic and the absence of the wrong one. The retired-versus-carried disposition is recorded coarsely in ledger row 43 (`:43`: "parser-only one-column, HTML-block, list-container, and `TABLE_VISITED` probes as moot; the carried fence, NBSP, CRLF/lone-CR, invalid-info, and raw-column-1 controls remain required"). |
| P2-2(a). Ledger row 33 (cycle 1) still `Corrected` while claiming optional 0–3-space pipes | **Closed**: now row 34, `Superseded`, and says `014382a` superseded the parser-emulation portions (`:34`). |
| P2-2(b). Row 32 / `CHANGELOG.md:59` named the removed `isFenceOpener` | **Closed**: row 33 and `CHANGELOG.md:61` now say "shared `projectFenceOpener` feeds the fence mask … no standalone table-boundary detector remains". |
| P2-2(c). `CHANGELOG.md:57` described the removed table machine as current | **Closed**: `:59` now reads "The round-15–19 implementation details — the stateful header/delimiter/body machine, `blockStartRe`, tab expansion … — are historical". The new `fs.cpSync` error in the same sentence is finding 2. |
| P2-2(d). Collapse `CHANGELOG.md:61-73` into one net paragraph; define or drop "HS" | **Open, regressed** (finding 1): five paragraphs became twenty-five; "HS" became "Sol-high", still undefined (finding 5). |
| P2-3. No evidence the rewritten validator was ever run; `main` 19 ahead of `origin/main` | **Closed**: commit bodies from `11dc3df` onward name the runs; `main` pushed; run 34015308368 green on both jobs at `15afad0` (144 s / 130 s validator steps). One residual subject-only commit (`0d6facb`, finding 3). |
| P3-4. Round-20 `` ```lang`invalid `` body-row control never added; NBSP counterexample not recorded as moot | **Closed**: control 105 (`:1229-1242`) inserts `` ```bad` `` into the anchored body and requires "code-pattern table body row has 1 cells; expected 2" at that line while forbidding "unclosed project fence"; ledger row 33 and `CHANGELOG.md:61` record the NBSP arbitrary-table case as moot; control 102 pins the NBSP delimiter anyway. |
| P3-5. Escaped-pipe parity labelled GFM/cmark-gfm conformance | **Closed**: `README.md:40`, `dev/validate-fixtures.mjs:376-377, 784-786`, ledger row 34 and `CHANGELOG.md:63` all call it a repository convention "not a claim about GFM/cmark-gfm behavior". Re-verified today against `extensions/table.c`: `unescape_pipes` strips one backslash before each `|` with no parity test (`if (res->ptr[r] == '\\' && res->ptr[r + 1] == '|') r++;`). |
| P3-6. 120 s aggregate wall-clock on the default path | **Closed**: default watchdog 15 min, overridable via `RUST_INTEL_FIXTURE_WATCHDOG_MS` with an explicit positive-integer check (`dev/validate.mjs:2302-2335`); the 120 s budget survives only for the three trivial installer CLI probes (`:2336-2350`). Per-control 30 s (`dev/validate-fixtures.mjs:169`) is retained; at ~0.35 s per control on CI (130–144 s / 375) that is a 85× margin. |
| P3-7. Row 27 rewritten in place to `Reopened` | **Closed**: original `Corrected` text restored at `:27`; a separate `Reopened` row 28 cites `8d4db70` and cmark-gfm `table.c`. Content re-verified today: `try_opening_table_header` returns early on `CMARK_NODE__TABLE_VISITED`, sets the flag when `!header_row \|\| header_row->n_columns != delimiter_row->n_columns`, and splits the paragraph at `header_row->paragraph_offset` only on success. |
| P3-8. Nits: subject-only commits; undefined "cycle"/"HS"; dead `onSpan`; no leading-whitespace diagnostic | **Mostly closed**: bodies on 27/28 commits; "cycle" numbers now correspond to ledger rows 34–65; leading-whitespace diagnostic implemented (`contractRow`/`leadingPipeDiagnostic`, `dev/validate.mjs:1792-1810`, controls 106–111). Open: dead parameter (now `onOutside`), "Sol-high" (finding 5). |
| Round-20 finding 3 (active Codex install stale) | **Closed and now recorded**: `2dc4e47` and ledger row 65 record the reinstall; verified today 13/13 SHA-256 identical to `skill/` (no `skill/` file changed after `848dbd4`, 01:12, so the 04:17 record still holds at head). |

### Per-commit completeness

"Claim" is the commit body (or, for the two subject-only commits, the ledger/changelog row added in the
same commit). "At head" locates the mechanism in `15afad0`.

| Commit | Claim | At head |
|---|---|---|
| `dbeddcd` (pre-range, subject-only) | ledger row "cycle 8"; fixture controls 69–78; single fixture aggregation path | Implemented: `package.json` `validate` runs only `validate.mjs`, `ci.yml` no longer runs the suite twice; controls 69–78 present (`:809-950`). |
| `0d6facb` (subject-only) | "enforce unique category coverage" | `specCategoryOwners` / `moduleHeaderOwners` duplicate detection (`dev/validate.mjs:1606-1615, 1644-1650`), controls 83–87, 91–96 (`:1024-1077, 1124-1143`). Complete; unrecorded (finding 3). |
| `11dc3df` | restore fence/NBSP/line-ending controls; reconcile ledger with net architecture | Controls 98–104 (`:1157-1227`); ledger rows 27/28 and 33/34 rewritten as round 22 asked. Complete. |
| `d7bdf66` | validate every `MODULES`/`AUDIT_UNITS` element; fence-aware Markdown coverage; remaining round-22 oracles; document Codex verification | `topLevelArrayElements`/`parseModulesLiteral`/`parseAuditUnit` (`dev/validate.mjs:595-733`); `fixtureFenceMask` in rule-text oracles (`:1382-1408`); control 105 and 106–111; README "Verify Codex" (`README.md:200-202`); `.gitignore` comment corrected. Complete. |
| `fa8ab55` | pin immutable initializers, exact artifact/docs policies, runtime result-module matching; real installer smoke at the CI floor | `auditUnitPolicy` matrix (`:1425-1456`); `auditResultModuleMatches` in the workflow (`skill/audit-project.workflow.js:357, 363`) — a **behavioural change to the shipped workflow** (a result whose `module` disagrees with its unit is now a missing input and gates `orchestrationComplete`), recorded in ledger rows 45–46; installer smoke on the floor job (then 16.7.0, now 24.0.0). Complete. |
| `68a2a6d` | deep-freeze `MODULES`/`AUDIT_UNITS`; pin policies; structural module-result gate | `deepFreezeRecords` (`workflow.js:27-35`, freezes record values, records, and the outer array — sufficient for this data shape); `deepFreezeHelper` regex pin (`dev/validate.mjs:521-528`). Complete. |
| `84be2bc` | immutable top-level helpers; live module-input loop and all orchestration gates structurally validated | `findTopLevelConstDeclarations`, `findTopLevelForLoop`, `orchestrationExpression` (`:464-555`); controls 147–151, 157–163. Complete. |
| `a60fa6d` | anchor declarations at live top-level positions; complete artifact/docs gate; reject transitive aliases; unique catalog/list oracles | `findTopLevelConstDeclarations` depth tracking; controls 143–145, 153–155, 164–166. Complete. |
| `9627995` | pin reachable missing-input implementation and semicolon-terminated gate; template substitutions | `orchestrationExpression` requires `;` (`:549`); workflow line 387 gained the `;`; `maskTemplate`/`maskCode` interpolation handling (`:329-392`); controls 171–172, 181. Complete. |
| `f709981` | hash-pin the coverage producer block; helper-before-call ordering | SHA-256 pin (`:557-572`); ordering checks (`:533-535, 553-555`); controls 182–188. Complete (CI green at head proves the pinned hash matches the shipped block). |
| `044aca9` | reject only reference aliases; allow primitive and derived values | Implemented then **reversed within the range** by `848dbd4` (derived `.map()`/`.filter()` bindings rejected); recorded in ledger rows 51–52. |
| `848dbd4` | reject bound `.map()`/`.filter()` results; rewrite live producers to primitive projections | `aliasRhsRe` + `isPureLengthExpression`/`hasOnlyLengthRootReferences` (`:841-953`); workflow `missingSlices`/`noSourceEvidence` explicit loops (`workflow.js:329-336, 404-416`, semantics unchanged); controls 198–199, 214, 221–224. Complete. |
| `154f951` | bound declarator RHS; primitive length vs alias; all update/compound assignments; isolated binding-site controls | `splitDeclaration`/`topLevelEquals`/declaration-end scan (`:756-953`); `assignmentRe`/`updateRe` (`:956-957`); controls 200–203, 219–238. Complete. |
| `b29c1af` | bracket mutators; fully parenthesized chains; comment-separated updates; deep freeze as fail-fast boundary | `quotedBracketProperty`, `parseDirectReference` outer-paren logic (`:1307-1372`); controls 239–245; README contract sentence (`README.md:42`). Complete. |
| `50ccd7a` | comments as whitespace in direct mutation syntax; control-header grouping vs factory-call | `isControlHeaderClose` (`:1293-1306`); controls 246–255. Complete. |
| `3e56bc8` | line-terminator-aware parsing; control headers vs keyword-named methods; else/do/ASI controls | `hasLineTerminator` (`:973`), `statementGroupKeywords` (`:959`); controls 256–261. Complete. |
| `adbcf40` | all four ECMAScript line terminators through comment masking; prefix updates after real statement blocks | `isJsLineTerminator` (`:37-39`) used by every lexer; `isStatementBlockClose` (`:1223-1252`); controls 262–273. Correct per ECMA-262 §12.3 (LF, CR, LS U+2028, PS U+2029) and §12.9 (single-line comments end at any LineTerminator). |
| `1714a40` | Unicode comment boundaries and same-line block closures; exclude keyword-named public/private method calls | `isControlHeaderClose` `.#?` exclusion (`:1298-1305`); controls 274–277. Complete. |
| `a34ddfb` | export-default, Unicode, escaped class identifiers before direct updates; keep class-expression/object-literal exclusions | `classHeaderInfo`/`isClassDeclarationBody`/`readIdentifierToken` (`:1020-1222`); controls 278–289. Complete. |
| `ec8e4a7` | braced Unicode escapes; case/default statement lists; ECMAScript identifier boundaries; escaped root spellings as runtime boundary | `identifierEscape` (`:978-1004`, see finding 5 for the digit cap), `rootBoundary` over `$_\u200C\u200D\p{ID_Continue}` (`:749-750`, matches ECMA-262 IdentifierPartChar), `isSwitchLabelColon` (`:1114-1193`); controls 290–313; README sentence. Complete. |
| `38129a9` | nested delimiters in switch labels; surrogate-aware postfix identifier checks; valid braced-Unicode controls | `groupStack` (`:1129-1189`), `identifierPartBefore` low-surrogate step-back (`:1014-1019`); controls 314–325. Complete. |
| `2d0e5a8` | case/default independent of previous clause ending; nested delimiter and ternary depth; sequential ledger | label reset on statement-level `:` (`:1156-1166`); controls 326–339 renumbered sequentially. Complete. |
| `fcb7bbb` | `?.` before a decimal digit is a conditional, not optional chaining | `optionalChain` test (`:1144-1145`) — correct per ECMA-262 §12.8 (`OptionalChainingPunctuator :: ?. [lookahead ∉ DecimalDigit]`); controls 340–341. Complete. |
| `5eb8691` | zero ternary depth at switch-label colons; genuine optional-chain controls via the class-boundary path | `ternaryDepth === 0` gate (`:1176`); controls 342–343. Complete. |
| `bd91e42` | balanced groups and zero ternary depth for labels; consume `??`/`??=` as one token | `:1148-1151, 1190`; controls 344–347. Complete. |
| `bd15e91` | header count 347 | Superseded by `15afad0` (375); header correct at head. |
| `2dc4e47` | record Codex reinstall, 13/13 parity | Verified today (SHA-256, 13/13). Complete. |
| `15afad0` | Node ≥24 floor; shared startup guards; CI on current 24 and exact 24.0.0 | `bin/node-version.js`; guards in four entry points; `engines` `>=24.0.0`; `ci.yml` two jobs; `runtimeGuardContracts`, engine/floor/`setup-node` checks and child-process guard probes (`dev/validate.mjs:2028-2121, 2289-2300`); controls 348–375; README `:27-30`; ledger row 66; CHANGELOG `:11`. Complete as code; the changelog rationale (finding 2), the unstated bump level (Part 2 finding A), and the Layout tree (finding 5) are the gaps. |

### Static verification record (Part 1)

| Check | Result |
|---|---|
| Commit range | 28 commits, 14 files, `+4770/-184` (`3e8d433..15afad0`); `main` = `origin/main` = `15afad0` |
| `git diff --check 3e8d433..15afad0` | PASS (no output) |
| Normative Markdown in range | none — all twelve `skill/*.md` blobs unchanged; only `skill/audit-project.workflow.js` (+ mirror) changed |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — 13/13 index blob hashes identical (`git ls-files -s`) |
| Canonical `skill/` vs active Codex installation (`~/.agents/skills/rust-intel/`) | PASS — 13/13 SHA-256 identical, 2026-09-06 |
| Line endings | all changed files `i/lf w/lf` under `.gitattributes` `text=auto eol=lf` |
| Numbered categories | 59 (A 3, B 29, C 12, D 5, E 6, F 4) from 65 level-2 `§` headings; id set identical to `v0.6.0` |
| `SKILL.md` scaffold at head | 174/175 prompt header+delimiter, 301 `**Triggered by code, not phrase**`, 303/304 code header+delimiter, 418 `When two or more triggers…`, 420 `---`, 422 `# Category map — which module holds each §`, 452 `**Cross-reference note:**`; fences 52–58, 506–533 |
| Category-count mentions | `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` "59 categories"; `SKILL.md:10` "fifty-nine categories", `:27` "~59 categories", `:93` "all 59 categories"; `README.md:7` "Numbered categories now **59**" |
| Fixture suite self-count | header says 375; recount 375 physically sequential; 13 `ruleTextControls`; 2 source probes; 13 controls without a validator child, 362 spawning |
| CI evidence | run 34015308368 (`push`, `15afad0`, 2026-09-06 05:58:47Z): `repository-checks` success (validator step 05:59:03→06:01:27), `Node.js 24.0.0 floor` success (validator step 05:58:58→06:01:08) |
| Prior CI | run 33807490076 (`19f6599`, 2026-09-03): failure at "Verify pinned Rust toolchain", exit 141 — see Part 2 finding B |
| cmark-gfm `extensions/table.c` | `try_opening_table_header` early-returns on `CMARK_NODE__TABLE_VISITED`; sets it on `!header_row \|\| n_columns` mismatch; `try_inserting_table_header_paragraph` at `header_row->paragraph_offset`; `unescape_pipes` has no parity rule — ledger row 28 and the parity relabel are correct |
| Node.js `fs.cpSync` | "Added in: v16.7.0" — `CHANGELOG.md:59` rationale wrong (finding 2) |
| ECMA-262 | LineTerminator = LF/CR/LS/PS; `?.` lookahead ∉ DecimalDigit; IdentifierStartChar = ID_Start \| `$` \| `_`; IdentifierPartChar = ID_Continue \| `$` \| ZWNJ \| ZWJ; `\u{CodePoint}` limited by value only — validator matches on all but the last (finding 5) |
| Node 24-only APIs in the tree | none found (`.at`, `replaceAll`, `fs.cpSync`, `realpathSync.native`, `\p{…}` are all ≤16.7) |
| Tests/validators/fixtures/build/install/package/syntax checks | **NOT RUN**, per request |
| Sub-agents | Not used |
| Primary checkout | not read, not modified; `.githooks/` untracked and untouched |

### Recommended correction order (Part 1)

1. Finding 1 — rewrite `CHANGELOG.md:63-109` into one net tooling paragraph, drop the stale
   "pending/unpushed" sentences, fix `:89-90`; add a one-line "net state = rows 43 + 52 + 65 + 66"
   pointer to the ledger.
2. Finding 2 — correct the `fs.cpSync` rationale at `CHANGELOG.md:59`.
3. Finding 3 — ledger row for `0d6facb`; report or retraction for the `15afad0` "Sol-high" review.
4. Findings 4–5 — fixture header families and spawn count; `onOutside`; `\u{…}` leading zeros or
   contract sentence; `'([['`; duplicate `validateInputs` entry; define "Sol-high"; Layout tree.

---

## Part 2 — whole-repository release-readiness assessment at `15afad0`

### Scope and method

Everything tracked at head was considered, not only the 28-commit window: the two workflows,
`package.json` and both plugin manifests, the release scripts, the installers, the validator and
fixture suite, the spec and its mirror, `README.md`, `CHANGELOG.md` since `v0.6.0`, and the ledger.
The 83 commits since `v0.6.0` (`d5b15ec`, 2026-08-19; 70 files, `+13727/-755`) were classified by the
project's own versioning rule (`CHANGELOG.md:5-7`). For the normative content, this round relies on
rounds 3–22, each of which reviewed its own window and accepted the PATCH framing; this round adds
only that no `skill/*.md` file changed after round 22's hand-trace, and that the numbered-category id
set is byte-for-byte the same 59 ids as at `v0.6.0`.

### Executive result

- **No P1 finding.**
- **Two P2 findings**: (A) the bump level for the Node-floor change is unstated and the project's own
  rule cannot classify it — cutting `0.6.1` as the changelog's uniform "PATCH-shaped" labelling
  implies would ship a backward-incompatible runtime requirement in a patch; (B) the `validate`
  workflow's toolchain-pin step is a race (`grep -q` under `pipefail`) that has already produced one
  red run out of three, so a tag push has a real chance of a red `validate` run against the release
  commit.
- **Three P3 findings**: the release notes are not release-note-ready (Part 1 finding 1 carried); the
  release checklist has unwritten steps (README banner and Status entry, `set-release-version.mjs`,
  CHANGELOG heading/date); and `README.md`'s Layout tree is stale.
- Everything else checked is consistent: version `0.6.0` in all three manifests with
  `check-release-version.mjs` verifying tag = manifests; `files` allowlist ships `bin/` (including the
  new `node-version.js`), `skill/`, `skills/`, `.codex-plugin/`, `commands/rust-intel-cc/`,
  `CHANGELOG.md`, both licenses; `npm pack --dry-run` and both installer smokes green in CI; mirror
  and active Codex install at parity; category count 59 stated consistently; the publish workflow
  runs the same validator (`npm-publish.yml:59`) on Node 24 and is idempotent on re-run.
- **Release-readiness verdict: ready modulo three items** — (1) decide and record the bump level
  (recommended `0.7.0`, MINOR, with `CHANGELOG.md:5-7` extended to cover runtime/tooling
  compatibility), (2) de-flake `ci.yml:31` before tagging, (3) rewrite `[Unreleased]` into release
  notes. None of the three touches shipped rule text or the validator's correctness.

### P2 findings (release readiness)

#### A. The Node-floor raise has no bump-level classification, and the changelog's rule cannot give it one

Locations: `CHANGELOG.md:5-7` (Major/Minor/Patch defined solely in terms of BANNED/REQUIRED wording
and numbered categories); `:11` (Node paragraph, the only `[Unreleased]` paragraph without a
"-shaped" label); `:15-109` (every other paragraph: "PATCH-shaped"); `package.json:23-25`
(`"node": ">=24.0.0"`, previously `>=16.7.0`); `bin/node-version.js:20-26` (hard failure, exit 1, on
anything below 24.0.0); `README.md:27-30`.

`npx rust-intel-cc` and `rust-intel-codex` on Node 16.7–23.x worked at `v0.6.0` and fail at head with
"rust-intel requires Node.js >=24.0.0". Per the Node.js release schedule (`nodejs/Release`
`schedule.json`), on 2026-09-06 Node 22 "Jod" is in Maintenance LTS until 2027-04-30, Node 24
"Krypton" is Active LTS (Maintenance from 2026-10-20), and Node 20 reached end-of-life on 2026-04-30 —
so the new floor drops one still-supported LTS line. That is a backward-incompatible change for
package consumers under SemVer 2.0.0 §8 in spirit and, for `0.x`, at minimum a MINOR under the
convention npm's caret ranges encode (`^0.6.0` admits `0.6.1` but not `0.7.0`; a dependent that
pinned `^0.6.0` on Node 22 would be broken by a `0.6.1`). The changelog's rule does not mention
runtime or tooling at all, and the twenty-six "PATCH-shaped" labels create the impression that the
whole `[Unreleased]` entry is a patch. There is no `npm`-side technical necessity for 24 (Part 1
finding 2), so the decision is policy — legitimate, but it must be stated, dated, and reflected in the
version number. Correction: add a fourth line to `CHANGELOG.md:5-7` ("Minor also = a raised runtime
floor or other change that makes a previously working install path fail"), state under `[Unreleased]`
that the next release is `0.7.0` because of it, and run `node dev/set-release-version.mjs 0.7.0`
before tagging.

#### B. The `validate` workflow's toolchain-pin step is a SIGPIPE race and has already failed once

Locations: `.github/workflows/ci.yml:26-31` (`shell: bash`; `rustc -vV | grep -q '^release: 1.97.0$'`);
GitHub Actions run 33807490076 on `19f6599` (2026-09-03 21:21 UTC): step "Verify pinned Rust
toolchain" → "Process completed with exit code 141", with the same step's log showing rustc had
already printed `release: 1.97.0`; run 34015308368 on `15afad0` (2026-09-06): same step green.

`shell: bash` on GitHub Actions runs `bash --noprofile --norc -eo pipefail {0}`. `grep -q` exits at
its first match and closes the read end of the pipe; if `rustc -vV` has not yet finished writing its
remaining lines (`host:`, `commit-hash:`, `LLVM version:` …), it receives SIGPIPE and exits 141, and
`pipefail` turns that into the step's status. Whether the race is won depends on scheduling, which is
why the identical step passed three days later on an unchanged toolchain. This is the only red
`validate` run since `v0.6.0`, it is unrelated to any project change, and it is exactly the
"wall-clock/ordering-dependent CI gate" shape the spec's own §D1 row warns about. A tag push triggers
`npm-publish.yml` (which does not have this step and would still publish) *and* `validate` on the
same commit; a red `validate` run against the release commit is not a publish blocker but is the
kind of evidence gap round 22 spent a P2 on. Correction (one line): `rustc -vV | grep '^release:
1.97.0$' >/dev/null` (grep reads to EOF), or `release="$(rustc -vV)"; grep -q '^release: 1.97.0$'
<<<"$release"`.

### P3 findings (release readiness)

#### C. `[Unreleased]` is not release-note-ready (Part 1 finding 1, carried)

The section that becomes `## [0.7.0] — 2026-09-…` on release currently runs `:11-109` with the
twenty-five cycle paragraphs, obsolete control counts, "pending and unpushed" statements, and the
`fs.cpSync` misattribution. Nothing in it is a correctness defect; all of it is a reader-facing
quality defect on the one artifact the npm package ships besides the skill (`files` includes
`CHANGELOG.md`). Round 22's correction text still applies.

#### D. Release checklist items that no script performs

- `README.md:7` banner and `:44-68` Status list carry `v0.6.0 (2026-08-19)`; the validator only
  requires the phrase "Numbered categories now **59**" to survive (`dev/validate.mjs:1706`), so a new
  banner must keep it.
- `CHANGELOG.md:9` `## [Unreleased]` must become the versioned heading with a date; the file has no
  link-reference footer to update.
- `node dev/set-release-version.mjs <version>` updates the three manifests; `dev/check-release-version.mjs`
  will refuse a tag that disagrees (`ci.yml:123-124`, `npm-publish.yml:44-45`). Both scripts are
  present and syntax-checked in CI.
- `docs/reviews/README.md` has no row for this round yet; the quality gate (`:73`) expects one when
  the release lands.

#### E. `README.md` Layout tree is stale

`README.md:72-104` omits `bin/node-version.js` (shipped), `dev/` (the validator, sync, and release
scripts the README elsewhere tells maintainers to run), `examples/fixtures/` (referenced at `:15`),
and `docs/reviews/` (referenced throughout the changelog). Pre-existing except for `node-version.js`.

### Release-readiness verification record

| Area | Result |
|---|---|
| Version manifests | `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` all `0.6.0`; `check-release-version.mjs` compares all three to the tag; `set-release-version.mjs` writes all three |
| Tags | last `v0.6.0` = `d5b15ec` (2026-08-19); 83 commits since; no tag in the window |
| Bump classification since `v0.6.0` | numbered ids: 59 at both ends, identical set (no add/remove/renumber); BANNED/REQUIRED changes: reviewed per window by rounds 3–22, each accepting PATCH; unclassified: Node floor 16.7.0 → 24.0.0 (finding A) |
| `package.json` `files` | `bin/` (incl. `node-version.js`), `skill/`, `skills/`, `.codex-plugin/`, `commands/rust-intel-cc/`, `CHANGELOG.md`, `LICENSE-MIT`, `LICENSE-APACHE`; `dev/`, `docs/`, `examples/` correctly excluded; `npm pack --dry-run` green in CI |
| `package.json` `scripts` | `validate` = `node dev/validate.mjs` (fixtures spawned inside, skip via `RUST_INTEL_SKIP_NESTED_FIXTURES=1`); `sync` = `dev/sync-mirror.mjs` |
| `engines` | `>=24.0.0`; enforced by `bin/node-version.js` in `bin/install.js:16-17`, `bin/install-codex.js:8-9`, `dev/validate.mjs:13-14`, `dev/validate-fixtures.mjs:23-24`; validator pins the string, the constant, the header comments, and probes the guard in a child (`dev/validate.mjs:2042-2065, 2289-2300`) |
| `ci.yml` | `repository-checks` (Node 24, rustc 1.97.0 pin, whitespace, mirror, validator+fixtures at `:39`, fixture compile, `node --check` ×7, shell-syntax, 7 overlap-guard cases, pack, tag/manifest check at `:124`, npx-installer smoke at `:125-138`) and `node-floor` (`:140-163`, Node 24.0.0: validator+fixtures, npx-installer smoke); concurrency cancel-in-progress; **`:31` flake (finding B)** |
| `npm-publish.yml` | on `v*` tags; Node 24; `check-release-version.mjs`; `node --check` ×6; `node dev/validate.mjs` (375 controls, ~2.5 min); npx and Codex installer smokes; integrity-compared idempotent publish with `--provenance`; `id-token: write`; queue-don't-cancel concurrency |
| Latest CI | run 34015308368 on `15afad0`: both jobs success; validator steps 144 s / 130 s |
| Mirror / installers | 13/13 blob-identical; `bin/install-codex.js` `--help`, missing/duplicate `--user-dir` probes exercised by the validator; README Codex section (`:160-170, 200-202`) matches the installer's argument surface; shell installers unaffected by the Node floor (documented as such at `README.md:27-30` by omission — acceptable) |
| Active Codex install | 13/13 SHA-256 identical to `skill/` |
| Category count consistency | 59 in `package.json`, both plugin manifests, `SKILL.md` (three spellings), `README.md` banner; derived count 59; validator's stale-count scan passes (CI) |
| CHANGELOG coherence | rule at `:5-7` spec-only; `[Unreleased]` = one Node paragraph + audit summary + rounds 4–19 groups + 25 cycle paragraphs; internal contradictions at `:11` vs `:109`; `:59` rationale wrong; `:89-90` join |
| Ledger coherence | rows 27/28, 33/34 correct; rows 34–66 cycle history; net state = rows 43, 52, 65, 66; row 65 "pending and unpushed" superseded by row 66 (append convention respected) |
| Outstanding round-22 risk (unevidenced validator) | **Resolved**: committed commit-body verification records on 27/28 commits plus one green CI run on the head that includes them all |
| Uncommitted state | worktree clean; primary checkout `?? .githooks/` only |

### Recommended order before tagging

1. Finding A — amend `CHANGELOG.md:5-7`, state the MINOR decision under `[Unreleased]`, run
   `node dev/set-release-version.mjs 0.7.0`, commit.
2. Finding B — replace `grep -q` at `ci.yml:31` with a form that reads rustc's output to EOF; push;
   confirm a green `validate` run before tagging.
3. Findings C/D — rewrite `[Unreleased]` into `## [0.7.0] — <date>` release notes (net tooling
   paragraph, corrected `fs.cpSync` sentence, no per-cycle transcript), update the README banner and
   Status entry, add this round's ledger row.
4. Finding E and the Part 1 P3 nits — at leisure; none gates the tag.
