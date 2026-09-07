# Round 48 review of the latest commits and v0.7.0 release readiness — 2026-09-08 00:44 CEST

## Scope and method

- Review base: `10e6a05` (round 47's report commit).
- Reviewed head: `6defc276ed2d88214f34f636a5c6cd7cffb00447`.
- Commit window: `10e6a05..HEAD` — **one** commit, confirmed by `git log --oneline 10e6a05..HEAD`:
  `6defc27` ("fix: rebuild anti-vacuity gate as behavioral differentials, retire observation
  module"). Eight changed files, `+175/−471`: `.github/workflows/ci.yml`, `CHANGELOG.md`,
  `README.md`, `dev/validate-fixtures.mjs`, `dev/validate-lexer-observations.mjs` (deleted),
  `dev/validate-lexer-probes.mjs`, `dev/validate.mjs`, `docs/reviews/README.md`.
- Packaged surface untouched: `git diff --name-only 10e6a05..HEAD -- bin skill skills commands
  .claude-plugin .codex-plugin package.json rust-cc-* examples` is empty. Normative rule text was
  therefore not re-audited.
- Whole-repo context: the reviewed head is **98 commits** ahead of `origin/main`
  (`git rev-parse origin/main` = `3ed04b9`, unchanged since round 42). Nothing in this window, or
  in the 97 commits before it, has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, probe, coordinator,
  installer, build or package command was executed. Every dynamic figure below is attributed to its
  source (the commit body, the orchestrator's pre-merge verification, or earlier rounds) and
  labelled as such; nothing is re-measured. All arithmetic, offset, budget and control-flow claims
  are hand-traced against the committed source and the traces are shown.
- Method: `git log`/`show`/`diff`/`status`/`rev-parse`/`worktree list`, direct file reads,
  character-level hand-tracing of the marker/decoy offsets against `dev/js-lexer.mjs`'s scan loop
  and `completionDiagnostics`, an operation-by-operation trace of the 2,000,000-unit input against
  `step()`, byte comparison of the four mutation anchors against their lines in `dev/js-lexer.mjs`,
  reconstruction of the focused/validator spawn tally from every call site, and a full read of
  `runValidateAgainstMutatedFiles`, `expectJsLexerDifferential`, `expectLexerProbe` and the final
  `dev/validate-lexer-probes.mjs`.
- Authored change set: this report file alone.

## Executive result

- **No P0 and no P1 finding**, in either part, under this series' calibration: nothing in the window
  touches a packaged artifact, installer behaviour, workflow semantics or normative rule text, and
  the only executable change is repository self-test tooling.
- **The redesign is sound where it claims to be, and the arithmetic is exact.** Every number I could
  check by hand checks out: the 39-unit marker, the diagnostic indexes `1_999_962` / `1_999_963` /
  `400_001` / `999_960`, the fact that the scanner charges *exactly* one operation per input code
  unit (so 401 ∧ 458 pin the charged operations to the budget constant, and 402 ∧ 491 pin them for
  the 2,000,001-unit input), the four anchors byte-for-byte, and the tight, correct `[2, 1_999_961]`
  bound on control 459's random operation index. The retired module is gone from every live path.
  The six historically demonstrated facades are structurally dead, and I can show why in one
  sentence rather than by reconstruction: probe `401` now serves four controls that demand three
  mutually exclusive observations from a byte-identical vehicle.
- **One new bypass, of a third class** — neither "the vehicle greps the mutated lexer" nor "forgery
  inside `dev/js-lexer.mjs`", the two residuals the commit states. The parent's mapping from
  *invocation ordinal* to *expected outcome* is fixed, public, and already handed to the child (the
  probe loads `dev/validate-fixtures.mjs` at module scope, which contains all eight expected
  literals). A vehicle that keeps a counter across invocations answers seven of the eight
  differentials from canned data and executes only control 459's partial scan — **no 2,000,000-unit
  scan ever completes, and all 494 controls pass**. This commit also removed the last source-level
  pin on the probe vehicle, so nothing observes such a channel. See P2-1; the fix is cheap and
  structural (randomize the ordinal → mutation mapping).
- Part 1 additionally holds **five P3s**, all record/claims hygiene: unrecorded "re-verified by
  reconstruction" evidence, no fresh-run figures at this tree, an unreleased changelog that still
  presents the retired mechanisms (and a now-silently-ignored env knob) as delivered state, stale
  and asymmetric comments, and an unenforced anchor-uniqueness claim plus dead parameter.
- Part 2 holds **P2-A** (nothing pushed; ninth consecutive round), **P2-B** (behavioural gates rest
  on local evidence — now weaker than in round 47, because this window records no measurement at
  all), and **four P3s**, two of which are round-47 findings the fixing pass silently did not
  disposition.
- Release verdict: **NOT READY**.

## Part 1 — the `6defc27` merge

### P0 and P1

None. The window changes only repository self-test tooling; the suite is green at 494/494 per the
orchestrator's pre-merge run (attributed, not re-measured).

### P2-1. The differentials are ordered, and the order is the oracle: a counter in the probe vehicle answers seven of eight without scanning

Locations: `dev/validate-fixtures.mjs:448-477` (`expectJsLexerDifferential`), `:4056-4061`,
`:4334-4337`, `:4345-4354`, `:4497-4500`, `:4508-4511`, `:4520-4528`;
`dev/validate-lexer-probes.mjs:11-12`, `:47-70`, `:102-114`.

The redesign's load-bearing premise is stated in the code itself:

```
// The probe vehicle itself is byte-identical in both trees, so no text-level property
// of it (presence, arrangement, occurrence counts, position pins — the round-43 through round-47
// bypass class) can distinguish the runs; only executing the mutated spot can.
```

The first clause is true. The second does not follow, because *text* is not the only channel. The
vehicle can distinguish the runs by **how many times it has been invoked**, and that ordinal is a
total function of the control, fixed by source order and never randomized:

| Probe argv | Invocation | Control | Mutation | Expected observation |
|---|---|---|---|---|
| `401` | 1st | 401 | identity | `{diagnostics, 2_000_000, ids:[902], indexes:[1_999_962]}` |
| `402` | 1st | 402 | identity | `{error, 'JavaScript lexical scan exceeded its deterministic budget'}` |
| `401` | 2nd | 458 | budget − 1 | `{error, '…exceeded its deterministic budget'}` |
| `401` | 3rd | 459 | throw at random `K` in `step()` | `{error, 'lexical operation probe reached K at index K'}` |
| `402` | 2nd | 491 | budget + 1 | `{diagnostics, 2_000_001, ids:[902], indexes:[1_999_963]}` |
| `401` | 4th | 492 | `COMPLETION_NAME` renamed | `{diagnostics, 2_000_000, ids:[], indexes:[]}` |
| `493` | 1st | 493 | identity | `{diagnostics, 1_000_000, ids:[902], indexes:[400_001]}` |
| `493` | 2nd | 494 | comment branch disabled | `{diagnostics, 1_000_000, ids:[902,777], indexes:[400_001,999_960]}` |

A facade in `dev/validate-lexer-probes.mjs` that persists a per-`(ppid, argv)` counter outside the
temp tree (`os.tmpdir()` survives; the temp root does not) reads that table and emits the canned
answer for every row except the 459 row, whose `K` it cannot know. For that one row it must call the
real scanner — which throws at operation `K`, uniformly distributed in `[2, 1_999_961]`. Result:

- **no 2,000,000-unit scan ever runs to completion** — the single genuine call aborts at `K`
  (expected ≈ 1.0 M operations, and as low as 2);
- controls 401, 402, 458, 491, 492, 493 and 494 prove nothing they claim: not budget exactness, not
  masking liveness, not completion-name provenance;
- the suite still reports 494/494.

Three properties make this cheaper than it sounds, and all three are new in this commit:

1. **The expected answers are shipped to the child.** `dev/validate-lexer-probes.mjs:12` reads
   `dev/validate-fixtures.mjs` at module scope (a legitimate need — `completionMutation` anchors
   there). In the temp tree that file is the mutated-run copy, and it contains every one of the
   eight expected-observation literals verbatim. The facade does not need hard-coded constants; it
   can parse them out of the file it already holds.
2. **Nothing pins the vehicle any more.** After this commit no code anywhere reads
   `dev/validate-lexer-probes.mjs` as text: `lexerProbeSource` is deleted, control 458's
   `helperContract` is deleted, the file is absent from `dev/validate.mjs`'s `required` list and
   from CI's `node --check` list (verified: the only remaining references are
   `dev/validate-fixtures.mjs:292`, `:369`, `:460`, `:4362`, all path-valued). The state channel is
   therefore unobserved by construction.
3. **Ordinal is not the only weak channel, only the decisive one.** `fs.statSync` on the temp-tree
   lexer already separates M-B/M-C/M-E (length-changing mutations) from the identity run; it cannot
   separate identity from M-A/M-D, which are length-preserving by construction. That residual alone
   would still force two full scans; combined with an ordinal it forces none.

Why this is a *third* class, not the stated residual: the facade never reads the code under test —
not by `fs`, not by `Function.prototype.toString`. It is not "a second interpreter of the code under
test"; it is a lookup table plus a clock. The commit's residual paragraph ("Two residual limits
stated, not closed") is therefore short by one, and `CHANGELOG.md:99` and the new
`docs/reviews/README.md` row repeat the same enumeration. The commit does hedge correctly elsewhere
("Bypass class is not claimed fully closed beyond the six demonstrated cases"), so this is an
incomplete residual list, not a false closure claim.

Correction, cheap and structural — **destroy the ordinal**, do not try to pin it:

- Run the differentials for a given probe id in a **random order**, and complete the controls in id
  order from a result map. The registry requires ascending scope completion, not ascending
  execution: build the `(controlId, probeId, mutate, expected)` list, shuffle it (or at minimum
  shuffle within each probe id), execute, store, then `observeControls(id)` + compare + complete in
  id order. Fifteen lines, no new mechanism, and the ordinal carries zero information afterwards.
- Optionally interleave a run-time-random number of extra identity runs per probe id (the parent
  checking each), which additionally hides *how many* invocations a suite run performs.
- Where the expected outcome is an **error**, also give the mutation a run-time nonce the way
  control 459 already does (e.g. M-A/M-D can mutate the budget *and* its message to carry a nonce;
  M-C's negative half can throw a nonce from the comment branch instead of disabling it, which
  proves the branch is reached at least as well as the current liveness pair). Success-valued
  expectations cannot carry a nonce, which is exactly why the shuffle is the necessary part.
- Do **not** answer this with a source pin on the vehicle (`os.tmpdir`/`writeFileSync` bans). That
  is the retired class: finite, public, and arrangeable around.

### P3-1. "All six historically demonstrated facades re-verified caught by the new gate" has no recorded evidence, and its host module no longer exists

Locations: commit message; `CHANGELOG.md:99`; `docs/reviews/README.md:88`.

The claim is **true** — I checked it analytically, and it is stronger than a reconstruction can
show: probe `401` serves controls 401/458/459/492, which demand `diagnostics[902]@1_999_962`, a
budget error, a nonce-bearing `K` error, and empty diagnostics respectively, from a vehicle that is
byte-identical in all four runs. Any fabrication satisfies at most one of them, so every
round-43…47 facade shape (size-conditional early return, module-scope wrapper, length-gated path,
position-only pin, comment-hidden import + retained-buffer padding, comment-hidden scan call +
forged telemetry) dies at the first mutated sibling. But:

- The five of six facades that lived in `dev/validate-lexer-observations.mjs` cannot be
  reconstructed as written, because that module is deleted; what was actually re-verified is
  unspecified in every record.
- No control encodes any of it. Old control 492 *did* build two facades from the real module source
  and assert they are rejected; the new control 492 is a lexer mutation, so the facade-reconstruction
  coverage that existed at round 46 is gone with no successor.
- Round 47's P3-C ("closure prose states classes from single reconstructions", fifth consecutive
  round) is therefore recurring in a new shape: a class claim over six items, none of them recorded.

Also in the commit message: "`runValidateAgainstMutatedFiles` … already proven never-bypassed on
controls 485-490". "No bypass has been demonstrated in five rounds" is the supportable statement;
"proven never-bypassed" is not, and this series has spent five rounds on exactly that distinction.

### P3-2. This fixing pass records no measurement at all, breaking the evidence convention rounds 43–46 followed

`CHANGELOG.md:99` and `docs/reviews/README.md:88` contain no run figures. Rounds 43–46 each closed
their disposition with a sentence of the shape "ordinary `npm run validate` at this fixing pass's
tree (Node v24.12.0, Windows 10.0.19045) passed with exit 0 and N/N controls in T s". The commit
message says only "full `npm run validate` re-run in the primary checkout after merge (exit 0,
494/494 controls)" — no host, no Node version, no duration, and in the commit message rather than in
a release record.

Consequences, both concrete: the newest duration figure in the changelog (432 s, `CHANGELOG.md:357`)
is now attached to the superseded 492-control state and to a mechanism that no longer exists, and
the window that *added six temp-tree copies and four additional multi-million-unit scans* records no
runtime at all — while the CI lane timeouts (50 minutes, pinned by `dev/validate.mjs`) are justified
in the records by "two per-phase defaults plus setup margin" derived from measured runs. Record the
figure with host, Node version and duration.

### P3-3. The unreleased changelog still presents the retired mechanisms as delivered state, including an env knob that is now silently ignored

Locations: `CHANGELOG.md:249-299` (round-45 fixing paragraph), `:300-362` (round-46 fixing
paragraph) — both inside `## [Unreleased]` (`:9`, next heading `## [0.6.0]` at `:363`);
`README.md:48`.

`CHANGELOG.md:265` still documents `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` as an available override
("overridable via …, and documented as not validated on Linux"). The knob is deleted. It is not a
hard error any more — it is read by nothing, so setting it does nothing at all, which is the
failure mode the round-46 fix explicitly rejected for the other `RUST_INTEL_*` knobs. README's
documentation of the knob was correctly removed in this commit; the changelog's was not.

Likewise `CHANGELOG.md:354-356` asserts, in the present tense, "the fixture suite **is** 492
controls … with header, registry, README, and this changelog in agreement", and `:320-330` describes
`helperContract`'s telemetry pins and controls 491/492's behaviour as current. The single retraction
is 150 lines above at `:99`. This project set its own precedent in round 46 — the false round-45
fast-path claim was "corrected in place" and the round-45 ledger row carries an inline "Round-46
correction:" retraction — and that precedent was not followed here. On release, all three paragraphs
ship inside the `0.7.0` notes.

`README.md:48` still reads "and — in `49dd4f0` — the sequential core/fixture coordinator
(`dev/validate-all.mjs`) and its shared semantic oracle (`dev/validate-lexer-observations.mjs`)".
The provenance sentence is historically true (round-45 P3-2 required it), but it names, with no
qualifier, a file that no longer exists three paragraphs above the layout tree from which this
commit removed it.

### P3-4. Stale and asymmetric comments left by the removal

- `dev/validate-fixtures.mjs:370-374`: "Keep each resource-heavy probe below the host's normal V8
  reservation … the probes' deterministic 2,000,001-code-unit workload fits comfortably within it"
  — attached to `lexerProbeHeapMb = 64`, which is applied *only* by `runLexerProbe`. After this
  commit no `runLexerProbe` control exceeds the 261 KB fixture source or 100,001 delimiters; all six
  multi-million-unit workloads moved to `expectJsLexerDifferential`, which spawns through
  `runValidateAgainstMutatedFiles` **without** `--max-old-space-size`. The rationale now describes a
  workload that no longer runs under the cap. (This is a documentation defect, not a risk: removing
  the 64 MB ceiling from the heavy probes removes the OOM tension rounds 45–46 flagged.)
- `dev/validate-fixtures.mjs:4372-4375` vs `dev/validate.mjs:2087-2093`: the same comment exists in
  both files. The fixture copy was de-specified to "Recent rounds shipped ci.yml steps invoking
  dev/validate-all.mjs and a helper script before either file existed" and left with a ragged
  three-word wrap; the validator copy still carries the precise original ("Three commits in the
  round-42 window …") and still names `dev/validate-lexer-observations.mjs`. Either the historical
  fact is worth stating precisely in both places or in neither; scrubbing one copy of a true
  historical statement lost accuracy without gaining consistency.

### P3-5. The anchor-uniqueness guarantee is prose, and one option is now dead

`dev/validate-fixtures.mjs:407-413`: "Each is verified to occur exactly once in the file, so a lost
anchor means the mutation did not apply". Nothing asserts it. `String.prototype.replace` with a
string pattern rewrites the *first* occurrence, so a future duplicate — a doc comment quoting
`const MAX_LEXICAL_OPERATIONS = 2_000_000;`, say — would silently move the mutation. Today every
such miss fails closed (the differential then observes the unmutated behaviour and the control
fails), so this is a guarantee-quality finding, not a live hole; `source.split(anchor).length === 2`
inside each `mutate` would make the sentence true. I verified by hand that all four anchors are
currently unique and byte-exact against `dev/js-lexer.mjs:9`, `:90-93`, `:237`, `:496` — including
that `STEP_BLOCK` does not collide with the second, differently-shaped `const step = (count = 1) =>`
at `:512`.

Related dead code: `expectLexerProbe(controlId, { expected } = {})`
(`dev/validate-fixtures.mjs:436-438`) — no call site passes `expected` any more (all nine call sites
are bare), so the option and the `expected ??` branch are unreachable.

### P4 observations

- "the same byte-identical probe vehicle runs against **the real** `dev/js-lexer.mjs` and against a
  temp-tree copy" (commit message, `CHANGELOG.md:99`) is loose: the positive baselines are
  `(source) => source` runs in a temp tree too, so after this commit *no* control runs the 401/402
  probe against the working-tree lexer. The copy is byte-identical (`readFileSync(…, 'utf8')` →
  `writeFileSync` round-trips ASCII exactly, and `dev/js-lexer.mjs` is ASCII), so the claim is
  substantively true; the wording is not.
- Control 459's `source.replace(STEP_BLOCK, (anchor) => mutatedStepBlock)` correctly uses a function
  replacement — the injected text contains `${index}`, and a string replacement would still be safe
  for `$` handling here only by luck. Worth keeping as-is, and worth a comment.
- `expectJsLexerDifferential` reads `result.stdout.trim()` on the `{skipped:true}` shape, where
  `stdout` is `undefined`; the surrounding `try/catch` absorbs the `TypeError` and the skip is then
  reported correctly. Correct by accident rather than by construction.
- A skipped mutation also fails the execution-split check (no spawn is tallied, so the control is
  counted as in-process), producing a second, misleading failure line beside the real one.
- Controls 409–478 still compare against constant expectations (`{completion-violations, ids:[null]}`)
  produced by an unpinned vehicle, and control 458's old `literalTrueCompletionViolations(lexerProbeSource)`
  hygiene scan disappeared with it. This is disclosed ("source-inventory pins … removed with it") and
  is outside the anti-vacuity gate, but it is now the case that *nothing* in the repository inspects
  the probe file's text.

### Closure matrix — the design recommendation and the commit message, claim by claim

| Claim | Verdict | Evidence |
|---|---|---|
| Observation module retired from every live path | **Holds.** | File deleted; import gone from `dev/validate-lexer-probes.mjs:9` and `dev/validate-fixtures.mjs:28-31`; `required` entry gone (`dev/validate.mjs:17-34`); `node --check` line gone (`.github/workflows/ci.yml:44-59`) together with the validator needle that pinned it (`dev/validate.mjs:2148-2152`); `validateInputs` entry gone (`:278-301`). Remaining mentions are comments/history only: `dev/validate.mjs:2089`, `README.md:48`, `CHANGELOG.md:169`/`:265`/`:352`. |
| No self-reporting oracle remains on the anti-vacuity path | **Holds.** | `dev/validate-lexer-probes.mjs:102-114` emits only `{kind, inputLength, ids, indexes}` or `{kind, name, message}`; controls 401/402/493 return no `ok`, and `:130` fires only on an explicit `false`. All telemetry, the RSS knob, both work floors and `evaluateWorkFloors`/`evaluateObservationModuleContract` are gone. The child's `inputLength` is self-reported but not load-bearing: the diagnostic index is not forgeable at a false length. |
| All six historically demonstrated facades are dead | **Holds structurally** (P3-1 on the evidence). | Probe `401` serves four controls with three mutually exclusive expectations from a byte-identical vehicle. |
| 458 pins charged operations to the budget constant | **Holds, exactly.** | 401 (budget 2,000,000, accepted ⇒ ops ≤ 2,000,000) ∧ 458 (budget 1,999,999, rejected ⇒ ops ≥ 2,000,000). Hand-trace below confirms ops = 2,000,000 exactly. |
| 491 pins the same for the 2,000,001-unit input | **Holds.** | 402 (rejected ⇒ ops ≥ 2,000,001) ∧ 491 (budget 2,000,001, accepted ⇒ ops ≤ 2,000,001). |
| 459's `K` is unreachable without executing `step()` | **Holds.** | `K` is `randomInt(2, 1_999_962)` at parent run time, appears nowhere but in the mutated lexer, and the message embeds `index` as well as `K`. |
| 492 proves the diagnostic comes from the lexer's own constant | **Holds.** | `COMPLETION_NAME` (`dev/js-lexer.mjs:496`) feeds `completionName()` at `:502`, used by `callInfo()` at `:572`, `:586`. |
| 493/494 close the "unmasked source" facade | **Holds, and is genuinely new.** | Every other differential input is comment-free; the pair is the only masking-liveness evidence in the suite. |
| Counts: 494 = 419 (390 + 29) + 75 | **Holds; reconciled independently.** | Focused spawns: 19 `expectLexerProbe` call sites (399, 400, 409–414, 421, 429, 439, 445, 446, 473–478) + 8 differentials + control 460 + control 487 = 29. Machine-checked at `dev/validate-fixtures.mjs:4540-4558`. |
| "Two residual limits stated, not closed" | **Incomplete — see P2-1.** | A third class exists that reads neither the lexer's text nor its bytes. |
| No push/bump/tag/publication claimed | **Holds.** | Verified: `origin/main` = `3ed04b9`; no tags added; `package.json` untouched. |

### Round-47 disposition matrix

| Round-47 finding | Status at `6defc27` | Evidence |
|---|---|---|
| P2-1: control 458's `helperContract` reads raw source ⇒ three-line bypass | **Closed by removal.** | `helperContract` and the whole control-458 body are deleted; 458 is now a lexer differential. |
| P3-1: the import pin cannot pin the module specifier | **Moot by removal.** | Pin and module deleted. |
| P3-2: control 491 has only a negative half | **Closed.** | 491 is now a positive-outcome differential (budget + 1 ⇒ accepted at `indexes:[1_999_963]`). |
| P3-3: "the pins close the replacement forgery" true only in place | **Moot by removal**, but the prose asserting it is still live in `## [Unreleased]` (P3-3 above). |
| P3-5: RSS knob's `=1` acceptance and missing negative control | **Closed by removal** in code; **stale in the changelog** (P3-3 above). |
| P3-4 / Part 2 P3-A: the review ledger no longer renders as a ledger | **Open, undispositioned.** | Blank lines still inside the row block at `docs/reviews/README.md:59`, `:61`, `:63`, `:84`, `:86`; this commit added its row adjacent to the previous one (so it did not worsen it) and fixed nothing. |
| Part 2 P3-B: coordinator option surface unexercised | **Open, undispositioned.** | `dev/validate-all.mjs` argument forwarding, `cwd`, `timeout`/`killSignal` still exercised by no control. |
| Part 2 P3-C: closure prose states classes from single reconstructions | **Recurring, sixth round.** | See P3-1. |
| Round 47's own ledger row ("outstanding work for the fixing pass", its `Scope and method`) | **Not delivered.** | `docs/reviews/README.md` contains no row for the round-47 review; rounds 42, 43, 45 and 46 each have one. The new combined row cites the report only inside a `round-{43,44,45,46,47}-*.md` brace glob. |
| Part 2 P2-A / P2-B | **Open** (Part 2 below). | |

### Hand-trace: marker arithmetic

`;completeCurrentControlScope(902, true)` = 1 + 27 + 1 + 3 + 1 + 1 + 4 + 1 = **39** code units;
`completeCurrentControlScope` is 27. `/*` + 39 + `*/` = **43** for the decoy.

| Control | Filler | Marker starts | Identifier index | Asserted |
|---|---|---|---|---|
| 401 / 458 / 459 / 492 | 2,000,000 − 39 = 1,999,961 | 1,999,961 (`;`) | **1,999,962** | `indexes:[1_999_962]` ✓ |
| 402 / 491 | 2,000,001 − 39 = 1,999,962 | 1,999,962 | **1,999,963** | `indexes:[1_999_963]` ✓ |
| 493 / 494 marker | 400,000 | 400,000 | **400,001** | `indexes:[400_001, …]` ✓ |
| 493 / 494 decoy | middle filler = 1,000,000 − 400,000 − 39 − 43 = 599,918 | decoy at 999,957 | **999,960** | `indexes:[…, 999_960]` ✓ |

`index` in a diagnostic is `last.start`, the callee word's own offset (`dev/js-lexer.mjs:582-587`),
which is what these numbers are.

### Hand-trace: the scanner charges exactly one operation per code unit

`step()` is called once at the top of each main-loop iteration (`dev/js-lexer.mjs:207-208`) and once
per identifier-continue character *after* `index` advances (`:262`). For the 2,000,000-unit input:

- x-run (1,999,961 units): 1 main step (at `index` 0) + 1,999,960 inner steps = **1,999,961**;
- `;` 1; `completeCurrentControlScope` 1 + 26 = 27; `(` 1; `902` 1 + 2 = 3; `,` 1; ` ` 1;
  `true` 1 + 3 = 4; `)` 1 → **39**;
- total **2,000,000** — equal to the input length and to `MAX_LEXICAL_OPERATIONS`.

So 401 passes at exactly the budget, 458 (budget 1,999,999) must throw, 402 (2,000,001 operations)
must throw, and 491 (budget 2,000,001) must pass. All four expectations are forced, not calibrated.

### Hand-trace: control 459's `index === operations` invariant and its bounds

Inside the identifier loop the order is `index += 1; step();`, so at the *k*-th step `operations = k`
and `index = k` for every `k` in `[2, 1,999,961]`:

- `k = 1` is the main-loop step taken with `index = 0` — excluded, correctly;
- `k = 1,999,961` is the last inner step, `index = 1,999,961` (the `;`) — the upper bound;
- `k = 1,999,962` is the main-loop step for `;` taken with `index` still 1,999,961 — excluded,
  correctly.

`randomInt(2, 1_999_962)` yields `[2, 1_999_961]`. The bounds are exactly tight in both directions:
no flake, and no wasted range. The injected `if (operations === K) throw …` sits after
`operations += 1` and before the budget check, and closes over the outer `let index` at
`dev/js-lexer.mjs:89` (the `index` bindings at `:465`, `:473`, `:540` are in other functions).

## Part 2 — whole-repository release readiness at `6defc27`

### P2-A. Nothing has ever been pushed; no CI run has ever exercised any current tooling (ninth consecutive round)

`git rev-parse origin/main` = `3ed04b9`; `main` is **98 commits** ahead. Every mechanism this series
has built and rebuilt over rounds 42–48 — the coordinator, the execution-split check, all 494
controls, both new Windows lanes, and now the differential gate — has run only on one Windows host.
Recorded, not actioned: pushing is a separate, explicitly human-authorized act and was not requested.

### P2-B. The behavioural gates rest on local, non-transferable evidence — and this window weakened the record

Unchanged from round 47 in substance, worse in form: the only figure attached to the 494-control
state is "exit 0, 494/494" in a commit message, with no host, Node version or duration (P3-2). The
Windows `0xC0000409` gate still has no CI run and no SHA-attributed measurement. The two ubuntu
lanes still evaluate the whole differential path for the first time whenever the first push happens
— and that path now spawns six additional temp-tree children per run.

### P3-A. `docs/reviews/README.md` still does not render as a ledger

Round-47 P3-A, unfixed and undispositioned. Blank lines at `:59`, `:61`, `:63`, `:84`, `:86` sit
inside the row block that begins at `:5-6`, so in GFM the table ends at `:58` and every later row
renders as a paragraph of literal pipes. This commit added its row at `:88` without a preceding
blank line — correct, and the only reason it did not add a sixth break.

### P3-B. The new ledger row breaks two conventions this series established for itself

- It omits the commit anchoring that rounds 45 and 46 introduced precisely to fix round-45 P3-2
  ("Committed as the commit containing this row, on top of `<report commit>`"), so the row does not
  say which commit implemented it.
- It is labelled "(2026-09-07 disposition)" while the commit it lives in is dated
  **2026-09-08 00:26:20 +0200**. Every earlier fixing commit (`6bc997b`, `1ba3956`, `1a9f1f8`,
  `46ca15b`) really is 2026-09-07; this one crossed midnight.

Together with the missing round-47 review row (matrix above), the ledger no longer lets a reader
reconstruct what round 47 found or where it was answered.

### P3-C. The coordinator's option surface is still unexercised

Round-47 P3-B, unfixed and undispositioned: `dev/validate-all.mjs`'s argument forwarding, `cwd`,
`timeout` and `killSignal` are covered by no control; control 487 still exercises only status
forwarding and `stdio: 'inherit'`.

### P3-D. Two `dev/` scripts are referenced by nothing executable

`dev/calibrate-release-version.mjs` (10 KB) and `dev/review-modules.workflow.js` (5 KB) appear in no
workflow, no `package.json` script, no `required` list and no `node --check` line — verified by grep
over `.github/workflows/`, `package.json` and `dev/validate.mjs`. `calibrate-release-version.mjs` is
documented in README's layout tree, so it is a shipped-in-repo tool that CI never even parses. Long
tail, plausibly a known carry-over; recorded for completeness.

### P3-E. The primary checkout carries an untracked hooks directory that is wired into git

The primary working copy holds an untracked `.githooks/` (one `pre-push` script running a Rust build-cache
sweep, unrelated to this repository) and `core.hooksPath` points at it, so `git status` there is
permanently dirty and every "clean tree" statement in the release records has to be read past it.
The review worktree is clean (`git status --short` empty). Either track and document the hook
directory, add it to `.gitignore`, or move it out of the repository; do not leave repository config
pointing at an uncommitted path.

### Release-readiness evidence at `6defc27`

| Gate | State |
|---|---|
| Ordinary validation | **Not re-run** (static review). Attributed: exit 0, 494/494 controls, primary checkout after merge — no host/Node/duration recorded (P3-2). |
| Recovery matrix | Not re-run; unchanged in this window. |
| Independent review | This report. |
| Exact-head CI | **Never run** (P2-A). |
| Packaging | Not re-verified (`npm pack` is a package command, excluded by instruction); `files` unchanged. |
| Version state | Pre-bump; manifests and banner at `v0.6.0`, planned `0.7.0` MINOR, re-derivation against `v0.6.0` unchanged since round 46. |
| Counts | `dev/validate-fixtures.mjs:5`/`:10`/`:100`, `README.md:48`/`:289`, `CHANGELOG.md:101` all read 494 / 419 (390 + 29) / 75 and agree with the hand-reconciled call sites. |
| Mirror | Untouched in this window (`skill/`, `skills/` byte-identical to `10e6a05`). |

## Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| P2-1 | P2 | Invocation-ordinal facade: a counter persisted outside the temp tree answers 7 of the 8 differentials from canned data (which the vehicle is even handed, via the fixture source it loads); no 2,000,000-unit scan completes and all 494 controls pass. Third residual class, unstated. | `dev/validate-fixtures.mjs:448-477`, `:4056-4061`, `:4334-4354`, `:4497-4528`; `dev/validate-lexer-probes.mjs:11-12` |
| P3-1 | P3 | "All six facades re-verified by reconstruction" is unrecorded and unreconstructable as written (host module deleted); facade-reconstruction coverage lost with old control 492; "proven never-bypassed" overstates. | commit message; `CHANGELOG.md:99`; `docs/reviews/README.md:88` |
| P3-2 | P3 | No measurement recorded at this tree (no host, Node version or duration); newest recorded duration belongs to the superseded 492-control state. | `CHANGELOG.md:99`, `:357` |
| P3-3 | P3 | `## [Unreleased]` still presents retired mechanisms as delivered state, including the now-inert `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB`; README still calls the deleted module "its shared semantic oracle". | `CHANGELOG.md:249-299`, `:300-362`; `README.md:48` |
| P3-4 | P3 | Stale heap-cap rationale (the 2,000,001-unit workload no longer runs through `runLexerProbe`); the twin control-485 comment scrubbed in one file and not the other, losing precision and leaving a ragged wrap. | `dev/validate-fixtures.mjs:370-374`, `:4372-4375`; `dev/validate.mjs:2087-2093` |
| P3-5 | P3 | Anchor-uniqueness is prose, not an assertion (fails closed today); `expectLexerProbe`'s `{ expected }` option is dead. | `dev/validate-fixtures.mjs:407-413`, `:436-438` |
| P2-A | P2 | Nothing pushed; `origin/main` = `3ed04b9`, head 98 commits ahead; no CI has ever run current tooling (ninth round). Recorded only — no push was requested. | repository state |
| P2-B | P2 | Behavioural gates rest on local, non-transferable evidence; this window records none at all. | release records |
| P3-A | P3 | Review ledger still does not render as a table (round-47 P3-A, undispositioned). | `docs/reviews/README.md:59`, `:61`, `:63`, `:84`, `:86` |
| P3-B | P3 | New ledger row omits its commit anchoring and is dated a day before its own commit; no row exists for the round-47 review, which round 47 explicitly left to the fixing pass. | `docs/reviews/README.md:88` |
| P3-C | P3 | Coordinator option surface still unexercised (round-47 P3-B, undispositioned). | `dev/validate-all.mjs:43-47` |
| P3-D | P3 | `dev/calibrate-release-version.mjs` and `dev/review-modules.workflow.js` are referenced by no workflow, script, `required` entry or `node --check`. | `.github/workflows/ci.yml:47-59` |
| P3-E | P3 | Untracked `.githooks/` wired in via `core.hooksPath` keeps the primary checkout permanently dirty. | repository config |

Totals: **0 P0, 0 P1, 3 P2 (one new: P2-1; P2-A and P2-B carried), 10 P3.**

## Recommended correction order

1. **P2-1** — shuffle the differential execution order per probe id (complete controls in id order
   from a result map), and add a run-time nonce to the error-valued mutations. This is the only
   finding that touches a claim the project makes about itself.
2. **P3-3** — annotate the two superseded `## [Unreleased]` paragraphs in place (the round-46
   precedent) and qualify `README.md:48`; nothing may ship in the `0.7.0` notes advertising a knob
   that is read by no code.
3. **P3-2** — record the 494-control run with host, Node version and duration, in the changelog
   entry rather than only in a commit message.
4. **P3-A / P3-B** — repair the ledger's table (delete the five blank lines) and add the missing
   round-47 review row plus the missing anchoring/date on the new row.
5. **P3-1, P3-4, P3-5, P3-C, P3-D, P3-E** — record or fix as convenient; none blocks a release on
   its own.
6. Unchanged and dominant: **P2-A**. Independent of every item above, no CI has ever executed any of
   this tooling.

## Verdict

**NOT READY.** The rebuild is the right architecture and the first version of this gate whose
positive claims I could verify by arithmetic rather than by trusting a heuristic — but the
invocation ordinal is an unrandomized oracle that a canned-answer vehicle can read, and the commit
removed the last observation of the vehicle at the same time. Round 48 is therefore the sixth
consecutive round to find a working bypass, though the first to find one that leaves the mechanism's
design intact: the fix is a shuffle, not another rewrite. No push, bump, tag or publication is
claimed by this report.
