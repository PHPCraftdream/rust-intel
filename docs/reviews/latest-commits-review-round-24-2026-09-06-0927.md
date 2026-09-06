# Round 24 review of the latest commits and release readiness — 2026-09-06 09:27 CEST

## Part 1 — review of the latest commits

### Scope and method

- Review base: `15afad0633baa9de8d64d6897a2a7b338620dc7d` (`build: require Node.js 24`, the round-23
  head).
- Reviewed head: `3ed04b907a10a4085203fa6af1f6876313609186` (`fix: address round 23 review findings`,
  authored 2026-09-06 09:27:48 +0200), which is also `origin/main`.
- Range: `15afad0..3ed04b9` — 2 commits, 7 files, `+533/-106`: `decd5d3` (the round-23 report, one
  file, `+422`) and `3ed04b9` (`.github/workflows/ci.yml` `+2/-1`, `CHANGELOG.md` `+6/-50`,
  `README.md` `+41/-1`, `dev/validate-fixtures.mjs` `+45/-10`, `dev/validate.mjs` `+11/-11`,
  `docs/reviews/README.md` `+6/-33`; `+111/-106`). **No normative Markdown (`skill/*.md`) and no workflow
  JavaScript changed in the range**; all thirteen `skill/` blobs are identical to the `15afad0`
  blobs round 23 inspected, so rounds 22–23's Rust/crate fact verification carries forward unchanged
  and was not re-derived.
- Method: static, revision-qualified inspection only, from an isolated worktree on branch
  `round-24-review` at `3ed04b9`. Both commit messages, the full per-file diff of `3ed04b9`, and the
  head text of `ci.yml`, `CHANGELOG.md` `[Unreleased]`, `README.md`, the ledger, `package.json`, both
  plugin manifests, and the changed regions of `dev/validate.mjs` (`identifierEscape`,
  `statementBoundaryBefore`, `codeSpanTokens` and its callers) and `dev/validate-fixtures.mjs`
  (header, `validateInputs`, `runValidateAgainstMutatedFiles`, `insertWorkflowMutation`, controls
  372–379) were read; the pre-change `codeSpanTokens` was read from the `15afad0` blob for a
  side-by-side trace. Every commit hash cited by the rewritten ledger rows 34–36 was resolved with
  `git cat-file -t`. The round-23 report was read in full first.
- External evidence gathered read-only: the GitHub Actions run list and the job/step records of run
  34019219895 (`gh run list` / `gh run view`); `nodejs/Release` `schedule.json`; the GitHub Actions
  workflow-syntax reference (the `shell: bash` command line); the Node.js 16.7.0 release notes
  (`fs.cp`/`fs.cpSync` introduction). ECMA-262 productions are quoted from the specification as
  known (`UnicodeEscapeSequence :: u{ CodePoint }`, `CodePoint :: HexDigits[~Sep] but only if MV ≤
  0x10FFFF`).
- Per the request, no test, validator, fixture runner, build, installer, package command, syntax
  checker, or other project executable was run, and no sub-agents were spawned. The primary checkout
  at `D:\dev\rust\rust-intel` was not read or modified; the orchestrator's start-of-review snapshot
  showed the five files of `3ed04b9` as modified there plus the pre-existing untracked `.githooks/`,
  and this worktree (created from `3ed04b9`) is clean.

### Executive result

- **No P1 finding.**
- **No P2 finding.** Every round-23 P2 (Part 1 finding 1; Part 2 findings A and B) is closed at head
  by what actually landed, not merely by transcription: the twenty-five cycle paragraphs and
  thirty-three ledger rows are gone, no "pending"/"unpushed" sentence survives, the Node-floor
  rationale is corrected in all three places, the SemVer rule is amended and the `0.7.0` MINOR
  decision is recorded, and the toolchain-pin step is race-free by construction (hand-traced below)
  and has executed green once (run 34019219895).
- **Three P3 findings**: `3ed04b9` is itself subject-only — the third consecutive round in which a
  commit that changes validator logic carries no body, and this one is the commit that closes a
  review which flagged exactly that; controls 378–379 pin "exit 0" on JavaScript that is a
  `SyntaxError`, which turns a future explicit diagnostic (the project's stated preference) into a
  red build; and a short list of precision nits (a process instruction inside the release notes, a
  one-column misalignment in the new Layout rows, curly quotes and an inverted clause in ledger row
  38, an unreachable post-loop range check, and an inaccuracy in round 23's own finding D that the
  ledger's rule says should get a row).
- **Round-23 closure**: all ten items are closed or closed-as-record at head; one (Part 2 finding D,
  the release checklist) is partially closed because the checklist it introduced encodes a push
  ordering that defeats its own CI-confirmation step (Part 2 finding A of this round). See the
  closure matrix.
- **Executed evidence exists for the head**: GitHub Actions run 34019219895 (2026-09-06 07:27:58Z,
  `push`, `validate`) on `3ed04b9` completed `success` on both jobs; the rewritten "Verify pinned
  Rust toolchain" step passed (07:28:12Z, sub-second), and the validator step — which spawns the
  379-control fixture suite — took 138 s on the Node 24 job and 117 s on the 24.0.0 floor job. The
  ledger's "passed local `npm run validate`" claim (row 38) is therefore corroborated by CI even
  though the commit body does not name it.
- **Static trace at head**: `skill/` and `skills/rust-intel/` 13/13 blob-identical (`git ls-files
  -s`); `git diff --check 15afad0..HEAD` clean; all six changed files `i/lf w/lf`; the fixture suite
  is physically sequential through 379 (controls 376–379 appended after 375 at
  `dev/validate-fixtures.mjs:3167-3198`, nothing renumbered).
- Overall verdict for the range: **APPROVE** (nothing here touches a shipped normative rule; the
  validator's only semantic change — accepting leading zeros in `\u{…}` — moves it toward ECMA-262,
  is pinned by four new controls, and is CI-evidenced).

### P2 findings

None.

### P3 findings

#### 1. `3ed04b9` has no commit body; its verification record lives only in a ledger row

Locations: `git log --format=%B 3ed04b9` (subject only); `docs/reviews/README.md:38` ("The
subsequent fixing pass has the current 379-control header and passed local `npm run validate`");
round 22 finding 3, round 23 finding 3 and closure-matrix row P3-8.

The commit changes scanner semantics (`identifierEscape` now accepts unbounded leading zeros,
`dev/validate.mjs:988, 1000-1005`), removes a parameter from a function with two callers
(`codeSpanTokens`, `:1819, 1884, 1895`), adds four child-process controls, and edits the CI
gate — and says nothing about what was run. Round 23's matrix credited 27 of 28 in-range commits
with bodies naming their verification and spent a P3 on the one that did not; this commit is the
one that closes round 23. The gap is real but bounded: run 34019219895 executed the head end to end
on both jobs, so the evidence exists — it is just not where the ledger's quality gate (`:46`) and
rounds 22–23 asked for it to be. Correction: none possible for the committed message without a
rewrite; for the next commit, restore the body convention (what was run, the declared control
count, and — since a CI run now exists for every pushed head — the run id).

#### 2. Controls 378–379 pin "exit 0" on JavaScript that cannot parse

Location: `dev/validate-fixtures.mjs:3183-3198`; `dev/validate.mjs:1000-1008`.

`class \u{0000000000110000}Invalid378 {}` and `export default class \u{00000000000D800}Invalid379 {}`
are not "identifier spellings that the scanner leaves alone" — they are early `SyntaxError`s under
ECMA-262 (`CodePoint :: HexDigits but only if MV ≤ 0x10FFFF`; a surrogate is not `ID_Start`), so
the mutated workflow file would never load. The validator does not syntax-check the mutated copy
(`runValidateAgainstMutatedFiles` only spawns `dev/validate.mjs`, `:169`), which is why exit 0 is
reachable at all. The controls' own comment says they exist "so a future parser that throws,
truncates, or otherwise accepts either invalid code point becomes observable" — a legitimate
change-detector — but `expectFixture(result, …, 0)` asserts *silence*, so the day the scanner is
taught to say "invalid Unicode escape in class name" (the "explicit unsupported-style diagnostics"
philosophy recorded at `README.md:39` and `CHANGELOG.md:61, 65`) these two controls go red for
doing the right thing. Correction: assert the absence of the *specific* wrong diagnostic (the
`workflow` mutation finding) rather than exit 0, or state in the comment that a future explicit
diagnostic is the expected way to retire the controls.

#### 3. Precision nits

- `CHANGELOG.md:13`: "**The next release must be `0.7.0` (MINOR).**" is a process instruction to the
  maintainer, not a release note; when `## [Unreleased]` becomes `## [0.7.0] — <date>` it will read
  as a stale imperative inside the shipped notes (`CHANGELOG.md` is in the npm `files` allowlist).
  The new checklist step 4 (`README.md:235`) replaces the heading but does not say to rewrite this
  sentence to "This release is `0.7.0` (MINOR) because …".
- `README.md:89, 98, 120`: the three new directory rows (`dev/`, `.github/workflows/ci.yml`,
  `reviews/`) put their `#` at column 48; every sibling row at the same depth uses 47 (nested rows
  use 49). Cosmetic, but the round-23 finding being closed was "the Layout tree is stale", so the
  fix should not introduce the only misaligned rows in the block.
- `docs/reviews/README.md:38`: the only curly quotes in the file (`“no P0–P3”`; the `15afad0` body
  actually says "no P0-P3 issues" with a hyphen), and the clause "round 23 itself found the
  record/release-readiness issues closed here" inverts its meaning (round 23 found them *open*; this
  pass closes them) — "the record and release-readiness issues round 23 found are closed here".
- `dev/validate.mjs:1007`: after the per-digit loop's early return (`:1004`, `value > 0x10FFFF →
  null`) the post-loop `value > 0x10FFFF` test is unreachable; harmless, but it reads as if the loop
  could overshoot, which it cannot (the early return also bounds `value` below `0x10FFFF·16 + 15`, so
  arbitrarily long digit strings can never reach `Number.MAX_SAFE_INTEGER`).
- Round 23's own text: Part 2 finding D (`latest-commits-review-round-23-2026-09-06-0810.md:375`)
  says "`README.md:7` banner and `:44-68` Status list carry `v0.6.0 (2026-08-19)`". Only the banner
  does; the Status list's newest entry is `v0.5.0 (2026-08-08)` at `:46` (at both `15afad0` and
  head — `git show 15afad0:README.md`), i.e. the 0.6.0 release updated the banner and never added
  a Status entry. This matters for the new checklist's step 3 (Part 2 finding B below). Per the
  ledger's rule ("a row in the table above whenever the review corrects an earlier one", `:46`),
  the next ledger edit should carry a one-line row for this.

### Round-23 closure matrix

| Round-23 item | Round-24 disposition at `3ed04b9` |
|---|---|
| P2-1. `[Unreleased]` and ledger are a per-cycle session log with statements false at head | **Closed.** `CHANGELOG.md:63-109` (25 cycle paragraphs) → one "Net tooling state" paragraph at `:65` naming the anchored two-table contract, fence mask, budgeted code-span scanner, unsupported-style diagnostics, structurally parsed/deep-frozen `MODULES`/`AUDIT_UNITS` with policy matrix and SHA-256 coverage pin, the bounded mutation scanner and its runtime backstop, the Node 24 floor with both CI jobs, the 379-control suite with its carried-versus-retired disposition, and a pointer to the ledger and the round-23 report — exactly the list round 23 asked for. Ledger rows 34–66 (33 rows) → rows 34–38: three "Superseded" bundles (cycles 1–8, 9–19, 20–32) each carrying a git-history trace (all 33 cited hashes resolve, `git cat-file -t`), the Node row, and a round-23 disposition row. No "pending"/"unpushed" text remains in either file (the only grep hits are unrelated historical bullets at `CHANGELOG.md:695, 936, 1061` and ledger `:27`). The `:89-90` join went with the block. |
| P3-2. `fs.cpSync` given as the reason for the 24.0.0 floor | **Closed.** `CHANGELOG.md:11` ("a support-policy choice targeting the current LTS line, not an API requirement: `fs.cpSync` has been available since Node 16.7.0 and explains the former floor"), `:61` (Tooling bullet now defers to that paragraph), ledger row 37. Re-verified: Node.js 16.7.0 release notes, Notable Changes — "fs: experimental: add recursive cp method (#39372)", commit `0dc167a03f` (SEMVER-MINOR). "Current LTS line" re-verified against `schedule.json`: v24 `lts` 2025-10-28, `maintenance` 2026-10-20 → Active LTS on 2026-09-06; v26 `lts` 2026-10-28; v22 `end` 2027-04-30 (still supported, dropped by the floor — the reason the bump is MINOR). |
| P3-3. `0d6facb` subject-only and unrecorded; `15afad0` cites an unfiled review | **Closed as a record.** Ledger row 38 records `0d6facb`'s duplicate-owner/heading controls as covered by run 34015308368 on descendant `15afad0` (`0d6facb` is an ancestor: `git merge-base --is-ancestor`), and labels the `15afad0` "no P0–P3" claim uncheckable and superseded by the committed round-23 review — the "removal" branch of round 23's correction. The *convention* regressed in the same commit (finding 1). |
| P3-4. Fixture header describes a third of the suite | **Closed.** `dev/validate-fixtures.mjs:5-16` now lists every family (README/temp-path, anchored tables, fence state, table-boundary, code-span/unsupported-style, workflow parsing/deep-freeze/coverage/declaration/mutation/lexical-boundary, Node floor/guard/CI-job) and states 366 spawning / 13 in-process. Arithmetic checks: round 23 counted 362 spawning + 13 in-process = 375; controls 376–379 each call `runValidateAgainstMutatedFiles` (`:3175, 3192` → `spawnSync`, `:169`) → 366 + 13 = 379; controls 1–375 are untouched by the diff (three hunks: header, `validateInputs`, appended controls). |
| P3-5(a). Dead `onOutside` parameter | **Closed.** `codeSpanTokens(text, onSpan)` (`:1819`); both callers updated (`:1884` one-argument, `:1895` callback in second position); no third caller (`grep codeSpanTokens(`). The deleted branch also dropped a `charge()` call — it was a *duplicate* of the loop-head charge at `:1856`, so the budget still charges once per iteration and the throw at `:1829` stays reachable for any rescan bug; token output is unchanged. |
| P3-5(b). `\u{…}` capped at six hex digits | **Closed.** `:988` reads all hex digits; `:1000-1005` accumulates by value with an early `null` above `0x10FFFF`; surrogate rejection at `:1007` retained. Hand trace of the four controls: `\u{000000000000041}` → 15 digits, value 0x41 → `{length: 19, character: 'A'}` → `identifierStartRe` true → class declaration → statement boundary → `++MODULES.length` is a prefix update on the protected root → `workflow` diagnostic (control 376 expects status 1 + needle `workflow` ✓); `\u{000000000000394}` → U+0394, `ID_Start`, via the `export default` path whose previous significant character is the `;` closing the `deepFreezeRecords` declaration (`insertWorkflowMutation` splices after the array end, `:2286`) → boundary ✓ (377); `\u{0000000000110000}` → early return at the sixteenth digit (0x110000) → no name → not a declaration → `}` not a boundary → silent, status 0 ✓ (378); `\u{00000000000D800}` → 0xD800 → surrogate → `null` ✓ (379). Matches ECMA-262 (`CodePoint :: HexDigits[~Sep]`, constrained by value only). |
| P3-5(c). `'([['` typo | **Closed.** `:1213` now `'=,+-*/%&\|^!?<>.:([{'`. |
| P3-5(d). Duplicate `validateInputs` entry | **Closed.** `bin/node-version.js` removed from `:130-146`; `bin` (`:137`) is copied recursively (`:157`), so the guard module still reaches the temp copy — required by controls 348–375 and by the child validator's own startup guard (`dev/validate.mjs:13-14`). |
| P3-5(e). "Sol-high" undefined | **Closed.** No occurrence in `CHANGELOG.md`, `README.md`, or the ledger (`git grep`); it survives only in immutable commit bodies (`15afad0`) and historical review reports, which is correct. |
| P3-5(f). `CHANGELOG.md:89-90` joined paragraphs | **Closed** by deletion of the block. |
| P3-5(g). Layout tree missing `bin/node-version.js`, `dev/`, `examples/`, `docs/reviews/` | **Closed.** `README.md:87, 89-96, 98, 105-110, 117-121`; every listed path exists (`git ls-files dev examples docs`: seven `dev/` scripts, `examples/README.md`, `examples/fixtures/{cases.json,positive.rs,negative.rs}`, `docs/{roadmap.md,sources.md,reviews/README.md}`). Alignment nit: finding 3. |
| Part 2 P2-A. Node-floor bump level unclassified | **Closed as a decision.** Rule amended at `CHANGELOG.md:6` ("it also covers a raised runtime/install floor or other compatibility-breaking tooling change that makes a previously working install path fail"); decision recorded at `:13` and `README.md:228-232`; version deliberately not moved (`package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; `dev/validate.mjs:2151` enforces three-way parity) — the bump is step 2 of the new checklist and a separate human action. No document claims a release happened: the README banner (`:7`) still reads `v0.6.0 (2026-08-19)`, and `CHANGELOG.md:67` is still the `## [0.6.0]` heading directly under `[Unreleased]`. |
| Part 2 P2-B. `grep -q` SIGPIPE race in the toolchain-pin step | **Closed.** `ci.yml:31-32` — see the hand trace in Part 2. Executed green in run 34019219895 (step 07:28:12Z). |
| Part 2 P3-C. `[Unreleased]` not release-note-ready | **Closed** modulo the `:13` rewrite at release time (finding 3). |
| Part 2 P3-D. Unscripted release-checklist steps | **Partially closed.** `README.md:226-246` writes the checklist (bump decision, `set-release-version.mjs`, banner + Status, CHANGELOG heading, checks, commit, tag, confirm) and ledger row 38 is the round-23 row the finding asked for; open: the push ordering in step 7 contradicts step 5 and round 23's own correction order (Part 2 finding A), step 3 has no Status precedent to follow and does not mention the validator-pinned banner phrase (Part 2 finding B). |
| Part 2 P3-E. Layout tree stale | **Closed** (see P3-5(g)). |

### Per-commit completeness

| Commit | Claim | At head |
|---|---|---|
| `decd5d3` (`docs: add round 23 review…`, subject-only) | adds the round-23 report | One file, `+422`; no code. The report's verification-record rows re-checked today where they bear on this window (mirror 13/13; `git diff --check`; `.githooks/` untracked in the primary checkout) still hold. Its finding-D sentence about the README Status list is inaccurate (finding 3). |
| `3ed04b9` (`fix: address round 23 review findings`, subject-only) | (no body; intent inferred from the diff) close round 23's P2-1, P3-2–5, P2-A, P2-B, P3-C–E | Ten of ten items addressed; nine closed, one partially (P3-D). Nothing regressed. New in the diff and correct: the value-bounded `\u{…}` loop, controls 376–379, the `'([{'` fix, the `codeSpanTokens` signature, the here-string toolchain check, the SemVer-rule amendment, the release checklist. New and imperfect: the checklist's push ordering (Part 2 finding A), the "quiet on `SyntaxError`" controls (finding 2), the nits (finding 3), and — recursively — the missing body (finding 1). |

### Static verification record (Part 1)

| Check | Result |
|---|---|
| Commit range | 2 commits, 7 files, `+533/-106` (`15afad0..3ed04b9`); `main` = `origin/main` = `3ed04b9` |
| `git diff --check 15afad0..HEAD` | PASS (no output) |
| Normative Markdown / workflow JS in range | none — all thirteen `skill/` blobs unchanged; `skill/audit-project.workflow.js` unchanged |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — 13/13 index blob hashes identical (`git ls-files -s`) |
| Line endings | all six changed files `i/lf w/lf` under `.gitattributes` `text=auto eol=lf` |
| Ledger hashes (rows 34–36) | 33/33 resolve to commits (`a28b905` … `bd91e42`); `0d6facb` is an ancestor of `15afad0` |
| Fixture suite self-count | header 379; controls 376–379 appended sequentially after 375 (`:3167-3198`); 366 spawning + 13 in-process = 379 (arithmetic from round 23's 362 + 13 = 375 plus four `runValidateAgainstMutatedFiles` controls) |
| `identifierEscape` | hand-traced on all four new controls (matrix row P3-5(b)); post-loop range test unreachable (finding 3) |
| `codeSpanTokens` | side-by-side with the `15afad0` blob: removed branch = `charge()` (duplicate of loop-head charge) + never-invoked `onOutside`; tokens unchanged; budget still per-iteration |
| "pending"/"unpushed" remnants | none in `[Unreleased]` or ledger rows 34–38 |
| "Sol-high" remnants | none in tracked docs outside historical review reports and commit bodies |
| CI evidence | run 34019219895 (`push`, `3ed04b9`, 2026-09-06 07:27:58Z): `repository-checks` success (toolchain step 07:28:12Z; validator 07:28:12→07:30:30), `Node.js 24.0.0 floor` success (validator 07:28:09→07:30:06) |
| Node.js release schedule | v24 Active LTS until 2026-10-20 (Maintenance to 2028-04-30); v22 Maintenance to 2027-04-30; v20 ended 2026-04-30; v26 LTS from 2026-10-28 — `CHANGELOG.md:11` "current LTS line" correct today |
| `fs.cpSync` | Node.js 16.7.0 release notes: "fs: experimental: add recursive cp method" — `CHANGELOG.md:11`/ledger `:37` correct |
| GitHub Actions `shell: bash` | reference: explicit `bash` → `bash --noprofile --norc -eo pipefail {0}`; unspecified → `bash -e {0}` |
| Tests/validators/fixtures/build/install/package/syntax checks | **NOT RUN**, per request |
| Sub-agents | Not used |
| Primary checkout | not read, not modified; worktree `round-24-review` clean before this report |

### Recommended correction order (Part 1)

1. Finding 2 — make controls 378–379 assert the absence of the specific `workflow` diagnostic (or
   document that an explicit invalid-escape diagnostic is the intended retirement path).
2. Finding 3 — `CHANGELOG.md:13` wording (or a checklist step to rewrite it at release), Layout
   column alignment, ledger row 38 quotes/clause, the unreachable test at `:1007`, and a ledger row
   for round 23's Status-list misstatement.
3. Finding 1 — commit bodies from here on (with the CI run id now that every pushed head has one).

---

## Part 2 — whole-repository release-readiness assessment at `3ed04b9`

### Scope and method

Everything tracked at head was considered, not only the 2-commit window: the two workflows (the
`validate` workflow diff and full text; `npm-publish.yml` is unchanged in the window — not in
`3ed04b9`'s file list — so round 23's step-by-step record of it is relied on), `package.json` and both
plugin manifests, the release scripts (listed, existence-checked), the validator and fixture suite
(changed regions), the spec and its mirror (blob parity), `README.md`, `CHANGELOG.md` since
`v0.6.0`, and the ledger. The bump classification for the 85 commits since `v0.6.0` follows the
amended rule at `CHANGELOG.md:5-7`: the numbered-category id set is unchanged (rounds 22–23), no
BANNED/REQUIRED shape moved (rounds 3–23), and the Node-floor raise is now explicitly MINOR under
the new clause.

### Executive result

- **No P1 finding.**
- **One P2 finding**: (A) the release checklist introduced to close round 23's finding D pushes
  `main` and the tag in one command (`README.md:243`) after asking the maintainer to "confirm CI is
  green" at a point where the release commit does not yet exist (`:236-238`), so the first
  `validate` run of the release commit and the tag-triggered `npm-publish` start concurrently — the
  precise "red validate run against the release commit" exposure round 23 spent P2-B on, and the
  opposite of round 23's correction order ("push; confirm a green `validate` run before tagging").
- **Two P3 findings**: (B) checklist step 3 ("update the README version banner and the matching
  entry in **Status**") has no precedent — the Status list has no `v0.6.0` entry, its three newest
  entries render as one paragraph, and the step does not say that the banner must keep the
  validator-pinned phrase `Numbered categories now **59**`; (C) the checklist sits under the
  user-facing "How to use it" section of the README that npm ships in every tarball, and the release
  notes carry one point-in-time count (379) and one imperative sentence (`:13`) that must be
  re-checked and rewritten at release time.
- Everything else checked is consistent: three manifests at `0.6.0` with the parity check at
  `dev/validate.mjs:2151` and `check-release-version.mjs` in both workflows; `files` allowlist
  unchanged (`bin/` incl. `node-version.js`, `skill/`, `skills/`, `.codex-plugin/`,
  `commands/rust-intel-cc/`, `CHANGELOG.md`, both licenses); mirror 13/13; category count 59 stated
  consistently; no document claims a release has already happened; `validate` green on the head;
  the toolchain-pin step is now deterministic.
- **Release-readiness verdict: ready.** The three items round 23 required before tagging are
  closed (bump level decided and recorded as `0.7.0` MINOR; `ci.yml:31` de-flaked and executed
  green; `[Unreleased]` collapsed into release notes). What remains is (1) fixing the checklist's push
  ordering before it is followed (finding A, a one-line edit), and (2) the explicit release actions
  themselves — `node dev/set-release-version.mjs 0.7.0`, the README banner/Status update, the
  `## [0.7.0] — <date>` heading with the `:13` sentence rewritten — which are correctly *not* in this
  commit.

### P2 findings (release readiness)

#### A. The release checklist pushes `main` and the tag together, so `npm-publish` cannot be gated on a green `validate` run of the release commit

Locations: `README.md:236-238` (step 5 "confirm CI is green", step 6 "Commit the release changes");
`:239-244` (step 7: `git push origin main v<version>`); `:246` (step 8 "Confirm the tag-triggered
validation and npm publish workflows completed successfully"); `.github/workflows/ci.yml:3-5, 12-14`
(`on: push` for every ref; concurrency group keyed by `github.ref`, so a branch push and a tag push
of the same commit run separately); round 23 Part 2 finding B and correction-order step 2
(`latest-commits-review-round-23-2026-09-06-0810.md:417-418`).

Step 5 asks for green CI before step 6 creates the release commit, so the confirmation can only
refer to the pre-release commit. Step 7 then pushes the release commit and its tag in one command;
GitHub starts `validate` (branch push), `validate` (tag push) and `npm-publish` (tag push) at the
same moment, and `npm-publish` does not depend on either `validate` run. `npm-publish.yml` runs
`check-release-version.mjs`, `node --check` ×6, `node dev/validate.mjs` and both installer smokes
(round 23's record), so a release commit that breaks the validator still cannot publish — but the
steps that only `ci.yml` runs (the toolchain pin, the whole-tree whitespace check, the fixture
`rustc` compile, the seven shell-installer overlap cases, `npm pack --dry-run`) are not in the
publish path, and a publish with `--provenance` is not reversible once it succeeds. Step 8 then
"confirms" what has already happened. The fix is the ordering round 23 already wrote: push `main`,
wait for the `validate` run on the release commit to finish green, then push the tag — i.e. split
step 7 into `git push origin main` → (step 8a: confirm `validate` green on that SHA) → `git push
origin v<version>` → (step 8b: confirm `npm-publish`).

### P3 findings (release readiness)

#### B. Checklist step 3 has no Status precedent and omits the validator's banner constraint

Locations: `README.md:234` (step 3); `:7` (banner `v0.6.0 (2026-08-19)`); `:44-48` (`## Status`;
newest entry `v0.5.0 (2026-08-08)` at `:46`; `:46-48` are three consecutive bold-led lines with no
blank line between them, so `v0.5.0`, `v0.4.7` and `v0.4.6` render as one paragraph — the same
defect class as round 23's `CHANGELOG.md:89-90`); `dev/validate.mjs:1711` (README must contain
`Numbered categories now **59**`); `dev/validate-fixtures.mjs:200-205` (control 1 mutates that
phrase and fails the suite if it cannot find it).

The `v0.6.0` release updated the banner and never added a Status entry, so "the matching entry in
Status" has nothing to match; a maintainer following step 3 literally will either add a `v0.7.0`
entry above `v0.5.0` (leaving a hole) or back-fill `v0.6.0` as well — the step should say which.
Independently, the banner rewrite must keep the exact phrase the validator pins, or `npm run
validate` in step 5 fails on the release commit; round 23 finding D stated this constraint and the
checklist dropped it. Correction: step 3 → "Update the banner (keep the sentence `Numbered categories
now **N**` — `dev/validate.mjs` pins it) and add a Status entry for the release (back-filling
`v0.6.0`, which has none); separate Status entries with blank lines."

#### C. Placement and release-time rewrites

- `README.md:226-246` lives under `## How to use it` (`:124`), between "As a checklist for humans"
  and "Commands", in the file npm includes in every tarball; a consumer reading install instructions
  meets the maintainer's tagging procedure. A `## Maintaining` section at the end of the README (or
  `docs/`) would keep the user path clean; not gating.
- `CHANGELOG.md:65` states "the fixture suite has 379 controls" and `:13` "The next release must be
  `0.7.0`"; both are correct at head, and both must be re-checked/rewritten when the heading is cut
  (a further control landing before the tag makes the count stale — the class of defect round 23's
  finding 1 was about, at 1/22 the scale). Add "re-verify the control count against the fixture
  header and rewrite the bump sentence in the past tense" to checklist step 4.
- `docs/reviews/README.md` has no row for this round; the quality gate (`:46`) expects one when a
  review corrects an earlier one (Part 1 finding 3, the round-23 Status-list sentence).

### Hand trace of the corrected toolchain-pin step

```
rustc_release="$(rustc -vV)"
grep '^release: 1.97.0$' >/dev/null <<<"$rustc_release"
```

- Under `shell: bash` the step runs as `bash --noprofile --norc -eo pipefail {0}` (GitHub Actions
  workflow-syntax reference, re-fetched today).
- Line 1: a command substitution. Bash reads the child's stdout to EOF before the assignment
  completes; there is no reader that can close early, so `rustc` cannot receive `SIGPIPE`. The exit
  status of a bare assignment whose value is a command substitution is the substitution's status, so
  under `-e` a failing `rustc -vV` fails the step.
- Line 2: no pipeline, so `pipefail` is irrelevant. The here-string is materialised by bash before
  `grep` is exec'd (a temporary file, or — for bash ≥ 5.1 when the content fits the pipe buffer, as
  ~200 bytes of `rustc -vV` output does — a pipe pre-filled and closed by the parent), so the writer
  has finished before the reader starts and can never be signalled; and `grep` without `-q` reads to
  EOF regardless. Exit status is 0 iff some line matches `^release: 1.97.0$`, otherwise 1, which `-e`
  turns into a failed step; output is discarded.
- No other `| grep` / `| head` / `| tail` pipeline exists in either workflow; the six remaining
  `grep -q` calls in `ci.yml` (`:73, 79, 86, 94, 107, 118`) read `/tmp/rci-err` from a file.
- Executed: run 34019219895, step "Verify pinned Rust toolchain", `success`, 07:28:12Z. One green
  execution is not a statistical proof of de-flaking — the previous form also passed two of three
  times — but the new form has no early-exiting reader, so there is no race to sample.

### Release-readiness verification record

| Area | Result |
|---|---|
| Version manifests | `package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; parity enforced at `dev/validate.mjs:2151`; `check-release-version.mjs` runs in `ci.yml:125` and `npm-publish.yml` |
| Tags | last `v0.6.0` = `d5b15ec` (2026-08-19); 85 commits since; no tag in the window |
| Bump classification | numbered ids: 59, unchanged set (rounds 22–23); BANNED/REQUIRED: unchanged (rounds 3–23); Node floor 16.7.0 → 24.0.0: **MINOR** under the amended `CHANGELOG.md:6`; decision recorded `:13`, `README.md:228-232`; target `0.7.0` |
| Release-happened claims | none: README banner `:7` still `v0.6.0 (2026-08-19)`; `CHANGELOG.md:9` still `## [Unreleased]`, `:67` `## [0.6.0]` |
| `package.json` `files` | `bin/` (incl. `node-version.js`), `skill/`, `skills/`, `.codex-plugin/`, `commands/rust-intel-cc/`, `CHANGELOG.md`, `LICENSE-MIT`, `LICENSE-APACHE`; `dev/`, `docs/`, `examples/` excluded; unchanged in window |
| `engines` / guards | `>=24.0.0` (`package.json:24`); `assertSupportedNodeVersion()` at `bin/install.js:17`, `bin/install-codex.js:9`, `dev/validate.mjs:14`, `dev/validate-fixtures.mjs:27`; validator pins the call (`dev/validate.mjs:2053-2056`) and probes it in a child (`:2295`) |
| `ci.yml` | `repository-checks` (Node 24; toolchain pin **now deterministic**, `:31-32`; whitespace; mirror; validator+fixtures `:40`; fixture compile; `node --check` ×7; shell syntax; 7 overlap cases; pack; tag/manifest check `:125`; npx smoke) and `node-floor` (Node 24.0.0: `npm run validate`, npx smoke); concurrency cancel-in-progress keyed by ref |
| `npm-publish.yml` | unchanged in window; per round 23: `v*` tags, Node 24, `check-release-version.mjs`, `node --check` ×6, `node dev/validate.mjs`, npx + Codex installer smokes, idempotent `--provenance` publish, queue-don't-cancel |
| Latest CI | run 34019219895 on `3ed04b9`: both jobs success; validator steps 138 s / 117 s; toolchain step sub-second |
| Mirror / active install | 13/13 blob-identical; active Codex install not re-hashed this round (no `skill/` change since round 23's 13/13 SHA-256 check, so that record still holds) |
| Category count consistency | 59 in `package.json`, both plugin manifests, `SKILL.md`, README banner; unchanged in window |
| CHANGELOG coherence | rule `:5-7` now covers runtime/install floors; `[Unreleased]` = Node paragraph (`:11`), bump decision (`:13`), citation note, audit summary, rounds 4–19 groups, rounds 20–21 closure (`:63`), net tooling state (`:65`); no internal contradiction found; `:13` imperative and `:65` count are release-time rewrites (finding C) |
| Ledger coherence | rows 34–36 historical bundles with resolvable traces; row 37 Node; row 38 round-23 disposition (nits: Part 1 finding 3); net state = rows 37 + 38 |
| Release checklist | present (`README.md:226-246`); **push ordering wrong** (finding A); step 3 under-specified (finding B); placement (finding C) |
| Uncommitted state | worktree clean; primary checkout (per orchestrator snapshot) `?? .githooks/` only after `3ed04b9` |

### Recommended order before tagging

1. Finding A — split checklist step 7 (push `main` → confirm `validate` green on the release SHA →
   push the tag); one edit, and then *follow* that order.
2. Finding B — rewrite step 3 (banner phrase constraint; Status entry policy, back-filling
   `v0.6.0`; blank lines between entries).
3. The release actions themselves (human-authorized, not review edits): `node
   dev/set-release-version.mjs 0.7.0`; README banner/Status; `## [0.7.0] — <date>` with `:13`
   rewritten and `:65`'s count re-verified against the fixture header; ledger row for this round;
   commit with a body; push `main`; green `validate`; push `v0.7.0`; confirm `npm-publish`.
4. Finding C and the Part 1 P3s — at leisure; none gates the tag.
