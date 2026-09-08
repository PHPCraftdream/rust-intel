# Round 50 review of the latest commits and v0.7.0 release readiness — 2026-09-08 07:21 CEST

## Scope and method

- Review base: `4811697` (round 49's report commit).
- Reviewed head: `4287100a6d2c30e145d26772f1c39b53689ee510`.
- Commit window: `4811697..HEAD` — **one** commit, confirmed by `git log --oneline 4811697..HEAD`:
  `4287100` ("fix: close anti-vacuity size/behavior side channels with padding and scan-locked
  branches"). Five changed files, `+212/−67`: `CHANGELOG.md`, `README.md`,
  `dev/validate-fixtures.mjs`, `dev/validate-lexer-probes.mjs`, `docs/reviews/README.md`.
- Packaged surface untouched: `git diff --name-only 4287100^ 4287100 -- bin skill skills commands
  .claude-plugin .codex-plugin package.json rust-cc-* examples` is empty. Normative rule text was
  therefore not re-audited. The Codex mirror is byte-identical (`diff -r skill skills/rust-intel`
  is empty).
- Whole-repo context: the reviewed head is **102 commits** ahead of `origin/main`
  (`git rev-parse origin/main` = `3ed04b9`, unchanged since round 42). Nothing in this window, or
  in the 101 commits before it, has been pushed.
- This review is **static plus measurement**, by instruction. `dev/validate.mjs`,
  `dev/validate-fixtures.mjs`, `dev/validate-all.mjs` and `npm run validate` were **not** executed
  (5–8 minute runs, explicitly out of scope). Every full-suite figure quoted below comes from the
  commit message or `CHANGELOG.md` and is labelled as attributed, not re-measured.
- What I did execute — all of it under `os.tmpdir()`, with the repository read-only throughout and
  every scratch tree deleted afterwards:
  1. **An eight-differential replica of the gate**: the draws (`:4462-4484`), the padding wrapper
     (`:4576-4600`), the Fisher-Yates shuffle (`:4601-4604`), the temp-tree write and spawn, and
     the parent's pass predicate copied verbatim from `expectJsLexerDifferential` (`:489-491`).
     Validated against the **honest** `dev/js-lexer.mjs` first: 8/8 in both baseline runs.
  2. **Facade A** — a forged `dev/js-lexer.mjs` (the round-45/46 out-of-scope model), in two
     variants; 8 runs, all four branch draws covered.
  3. **Facade B** — a forged `dev/validate-lexer-probes.mjs` (the in-scope vehicle model); 12 runs.
  4. **Boundary measurements** for controls 459 and 494 against the honest lexer.
  5. **A 4,000-run simulation** of `commonDifferentialTreeSize` against the real lexer bytes.
  6. **A stack-geometry probe** across all seven distinct mutated trees.
  Total scratch runtime under four minutes.
- Method otherwise: `git log`/`show`/`diff`/`status`/`rev-parse`/`cat-file`/`worktree list`, direct
  file reads, byte-level re-verification of the four mutation anchors and `BUDGET_THROW` against
  `dev/js-lexer.mjs`, hand-tracing plus re-measurement of all eight `mutate`/`expected` pairs, a
  read of `runValidateAgainstMutatedFiles`, `expectJsLexerDifferential`, control 457, the probe
  vehicle, and the three record surfaces (`CHANGELOG.md:99`,`:375`,`:377`; `README.md:48`;
  `docs/reviews/README.md:87-88`).
- Authored change set: this report file alone.

## Executive result

- **No P0 and no P1.** Nothing in the window touches a packaged artifact, installer behaviour,
  workflow semantics or normative rule text; the only executable changes are repository self-test
  tooling.
- **Everything the fix says it built, it built, and I re-measured all of it.** The padding is
  exact: across all eight trees of a run the on-disk `dev/js-lexer.mjs` has **one** size (measured:
  36,058 / 36,056 bytes in the two baseline runs, one distinct value each). A 4,000-run simulation
  shows control 459 is the size argmax in **4000/4000** runs, so the common size is a function of
  `digits(probeOperation459)` **alone** and is statistically independent of both new branch draws —
  the padding does not leak `acceptsAtRaisedBudget491` or `acceptsDespiteRenamedConstant492`. Every
  arithmetic claim in the block re-measured exactly: `index === K` at K = 2, 3, 1000, 999,958,
  1,999,960 and **1,999,961** (the inclusive upper bound of the draw); `T ≤ 999,957` leaves the
  decoy live and `T = 999,958` masks it, exactly as the comment states; the decoy begins at index
  999,957 and is reported at 999,960; the identity trees produce `[902]@1,999,962` and
  `[902]@400,001`. The Fisher-Yates shuffle, the anchor-uniqueness assertions, the argv-length
  transport and the P3-4 reproduction line are all correct as written.
- **Two P2s, both measured, and both about the same thing: what the gate's *entropy* is, and where
  it lives.** Every random value this gate has ever drawn — the nonces, `K`, `T`, the budget
  constants, and now the two branch bits — is written **into `dev/js-lexer.mjs`**, the file under
  test. That is the one place the code being measured can read for free.
  - **P2-1 (in the declared threat model, deterministic, measured over 12 runs):** a lying probe
    vehicle that scans honestly wherever the answer is genuinely unknowable and uses nothing but
    argv, a 39-unit rename probe and per-run elimination state in `os.tmpdir()` passes **8/8 with
    certainty, no gamble**, while never scanning one of controls 493/494 in **any** run and never
    scanning **control 401** — the control the gate is named after — in a third of runs (measured:
    3 of 8). The committed "≈ 1/64 per run" figure is the wrong quantity and is wrong by ~16× in
    the attacker's favour: a facade that literally scans nothing passes with probability **0** (it
    cannot produce three nonces), and a maximally-skipping facade passes with probability **≈ 1/4**
    while skipping 38–54 % of the honest work. Its published decomposition ("401: 1/4;
    491/492/493/494: 1/2 each") double-counts 492 and treats the 493/494 pair as independent when
    exactly one of the two invocations is the identity run.
  - **P2-2 (the ninth channel class; declared out of scope, and that scope is now carrying the
    whole claim):** because the mutation is applied to the file that then *executes*, a forged
    `dev/js-lexer.mjs` reads it out of its own module scope. `MAX_LEXICAL_OPERATIONS` and
    `COMPLETION_NAME` are ordinary live bindings; `let operations = 0;` (`dev/js-lexer.mjs:88`) is
    **not part of any anchor**, so the counter's start value is attacker-chosen, which turns every
    nonce-bearing budget throw from a 2,000,001-operation event into an O(1) one. Measured: **8/8
    in 8 consecutive runs**, covering both 491 branches and both 492 branches, with **no `fs`, no
    `statSync`, no argv trick, no invocation ordinal, no persisted state and — in the primary
    variant — no reading of any source text**; child wall time falls from 1,972 ms to 517–647 ms
    and none of the ≈13.0 M charged operations is spent. This is squarely `CHANGELOG.md:99`
    residual (2) ("a deliberate forgery inside `dev/js-lexer.mjs` itself remains outside the threat
    model"). It is reported as P2 because that exclusion now covers exactly the file whose
    behaviour the gate's stated purpose is about, and because **no other control in the suite
    exercises the lexer above 277,046 code units**: if `dev/js-lexer.mjs` ever grows a fast path
    for large inputs, these eight differentials are the only thing that could notice, and they do
    not.
- **Part 1 additionally holds five P3s**, one of them again introduced by this commit's own P3 fix:
  a new (in-model) Error-stack line-geometry channel the block's channel enumeration does not
  mention; a heap-cap comment whose "~266,000 code units today" was already 277,046 at its own
  commit; an imprecise "the size channel has nothing to read"; an anchor-drift path that now aborts
  the whole fixture process instead of failing its controls closed (and leaves `:492`'s designed
  message unreachable); and round-49's P3-5 unchanged for an eighth round.
- **Part 2** holds **P2-A** (nothing pushed; eleventh consecutive round), **P2-B**, and the three
  carried P3s — **P3-C**, **P3-D**, **P3-E** — all confirmed open and untouched.
- Release verdict: **NOT READY**.

## Part 1 — the `4287100` merge

### P0 and P1

None. The window changes only repository self-test tooling and records.

### Verification of the fix's own claims, before the findings

Round 49's recommendation had three parts. All three are implemented, and all three do what they
claim at the level they examine. I re-measured rather than re-read:

| Claim (commit message / `CHANGELOG.md:377`) | Verified how | Result |
|---|---|---|
| Every mutated tree, identity runs included, is written at one common byte length | Replica of `:4576-4600`, `fs.statSync` on all eight trees of a run | **Holds.** One distinct size per run (36,058 and 36,056 bytes in the two baseline runs). |
| The common length is computed from that run's own draws | 4,000-run simulation over the real lexer bytes | **Holds**, and it is determined by control 459 in 4000/4000 runs, i.e. by `digits(K)` only. |
| Padding does not leak the branch draws | Same simulation, partitioned by `acceptsAtRaisedBudget491` / `acceptsDespiteRenamedConstant492` | **Holds.** The observed common sizes overlap completely across both values of both bits. |
| The pad is inert and moves no asserted index | Baseline replica against the honest lexer | **Holds.** 8/8 with padding applied to all eight trees, indexes unchanged. |
| `offset491 ∈ [1, 63]`, `h ∈ [offset+1, 64]`, so argv's distribution is branch-independent | Hand-check of `randomInt` half-open semantics at `:4471-4475` | **Holds.** `randomInt(1, 64)` → `[1,63]`; `randomInt(offset+1, 65)` → `[offset+1, 64]`; `L = 2,000,001 + offset` on both branches. |
| `T ∈ [2, 999,957]`; the decoy's comment check is at operation 999,958 | Direct measurement at T = 999,956/957/958/959 | **Holds exactly.** 999,956 and 999,957 → `ids [902,777]`, `indexes [400001,999960]`; 999,958 and 999,959 → `ids [902]`. |
| Control 459's message index equals K | Direct measurement at K = 2, 3, 1000, 999,958, 1,999,960, 1,999,961 | **Holds at every point tested, including the inclusive bound.** |
| `+286` size delta observed in the fixing pass's own re-test | Arithmetic against my measured deltas | **Consistent.** The pad note is 178 bytes and control 459's delta is `96 + 2·digits(K)`; a 6-digit K gives `178 + 108 = 286` exactly. |
| Sub-1,000,000-operation probes cannot separate 493 from 494 | Analysis of the uniform draw | **Holds, and is optimal.** A partial probe of `n` operations detects the gate with probability `n/999,956`; expected cost is `n + (1 − n/10⁶)·10⁶ = 10⁶` — exactly flat, so no partial probe beats an honest scan. |
| 491's and 492's branches cannot be read below full cost *by the vehicle* | Reasoning over the scanner's per-unit charging | **Holds.** Both branches differ only in `MAX_LEXICAL_OPERATIONS`, and `step()` charges at most one operation per code unit on every path, so learning the constant costs what the honest scan costs. |

So the two mechanisms this commit added are sound **within the model they were designed against**.
What follows is not a defect in their construction.

### P2-1. In the declared threat model the gate is still deterministically skippable — controls 493/494 every run, control 401 in a third of runs — and the committed "≈ 1/64" is the wrong quantity

Locations: `dev/validate-fixtures.mjs:4342-4349` (the shuffle rationale, including its own
concession that `os.tmpdir()` outlives the temp tree), `:4485-4575` (the eight differentials),
`:4601-4611` (shuffle and execution loop); `CHANGELOG.md:377`; `docs/reviews/README.md:88`.

#### What the record claims

`CHANGELOG.md:377`, repeated in the ledger at `docs/reviews/README.md:88`:

> Residual restated honestly …: the three error-valued differentials force a full-length scan
> outright; the five success-valued differentials force a scan up to a per-run guessing
> probability — a facade that scans nothing and answers its argv's most likely canned shape passes
> with probability ≈ 1/64 per run (401: 1/4; 491/492/493/494: 1/2 each) …

#### The elimination channel the shuffle does not close

The shuffle destroys the *ordinal → differential* mapping. It does not destroy the *set*. Every run
executes exactly the same eight differentials, in three argv groups — `401` × 4 (controls 401, 458,
459, 492), `402` × 2 (402, 491, separated by the argv length), `493` × 2 (493, 494) — and the
fixture's own comment (`:4345-4346`) already concedes that a vehicle may persist state in
`os.tmpdir()` across invocations. The consequence the fix does not account for:

**Every honest invocation self-identifies from its own result.** A vehicle that runs a differential
genuinely learns which one it was — a budget throw with a nonce is 458 (or 492's reject branch,
already excluded by the 39-unit rename probe), a `probe reached K` throw is 459, `[902]@1,999,962`
is 401, `[]` is 492-accept, `ids.length === 2` is 494, `ids.length === 1` is 493. Persisting that
identity makes the **last member of every argv group derivable by elimination**, with certainty,
no matter how the shuffle ordered them.

Two of the five success-valued controls fall out immediately:

- **The `493` group has only two members**, so the second invocation is *always* free: whatever the
  first one turned out to be, the second is the other one, and both have fully public canned
  answers (`[902]@400,001` and `[902,777]@[400,001, 999,960]`). This costs the gate 1,000,000
  charged operations in **every** run, deterministically. Control 494's random `T` — the fix's
  answer to round 49's 43-unit probe — is irrelevant to it: the vehicle never has to distinguish
  anything, it only has to remember.
- **Control 401 is free whenever it is drawn last among `{401, 458, 459}`** (probability 1/3, or
  1/2 if the vehicle also spends the line-geometry probe of P3-1 to identify 459 up front). That is
  another 2,000,000 charged operations, and it is the control the entire gate exists for.

#### Measured

Facade B is a replacement `dev/validate-lexer-probes.mjs`, **byte-identical in all eight trees** (as
the design requires), which uses only: argv; one 39-unit marker input to detect the rename;
elimination state in `os.tmpdir()` keyed by `process.ppid`; and an honest scan wherever the answer
is genuinely unknowable. It reads no lexer text, calls no `statSync`, and never guesses.

Twelve runs against the honest lexer under my replica of the parent loop:

| Runs | Result | Charged operations (counting 459's scan at its full input length; honest reference 14.0 M in the same units) |
|---|---|---|
| 4 (with the P3-1 line probe) | **8/8, every run** | 13.3 M ×3, 11.3 M ×1 |
| 8 (elimination only, no line probe) | **8/8, every run** | 13.0 M ×5, 11.0 M ×3 |

The 11.0 M runs are the ones in which control 401 came last in its group: the facade emitted
`[902]@1,999,962` from canned data and **never scanned the 2,000,000-unit input at all**, and the
suite's differential predicate accepted it. Observed frequency 3/8, against the predicted 1/3.
Every run also skipped one of 493/494 entirely (`charged 0` for that control in the per-control
table).

There is no luck in this. `P(pass) = 1`.

#### The "≈ 1/64" figure

I could not reconstruct it from any coherent facade, and its own decomposition does not hold up:

- **"A facade that scans nothing" passes with probability 0, not 1/64.** Controls 402, 458 and 459
  carry per-run nonces and a per-run `K`; a vehicle that never executes the scanner cannot produce
  any of the three messages. The 1/64 is computed only over the success-valued half while the
  quantifier ("scans nothing") ranges over all eight.
- **401 is not a 1/4 guess.** Control 492 is identified by a 39-unit probe — the fix says so itself
  at `:4374-4375` ("a facade can detect the rename with a small marker probe") — so the argv-401
  group a guesser faces has three members, not four. Without elimination the figure is 1/3; with
  elimination it is 1 (in a third of runs) or an honest scan (otherwise).
- **493 and 494 are not two independent 1/2 draws.** Exactly one of the two argv-493 invocations is
  the identity run, so a guesser that answers both independently is right on both with probability
  1/4, and one that respects the constraint is right with probability 1/2 *for the pair*; a vehicle
  with elimination is right with probability 1 on the second.
- **The right number for a maximally-skipping facade is ≈ 1/4.** Take facade B and additionally
  gamble the two genuinely scan-locked bits — 491's branch (answer the accept shape,
  `[902]@L−38`, computable from argv) and 492's branch (answer `[]`). Each is an honest 1/2; every
  other invocation is either certain or honestly scanned. `P(pass) = 1/4`, and the skipped work is
  1.0 M + 2.0 M + 2.0 M + (2.0 M with probability 1/3) ≈ 5.0–7.0 M of ≈13.0 M + K, i.e. **38–54 %**.

So the honest restatement is: *two* of the five success-valued differentials are free without any
guess at all (one always, one in a third of runs), and the remaining three cost a facade one
coin-flip each, not six.

#### Correction, in priority order

1. **Destroy the elimination channel by making the executed multiset non-fixed.** Draw, per run, a
   small random number of extra invocations of randomly chosen differentials (registered as
   repetitions of their own controls, so the registry's one-spawn-per-control accounting has to be
   revisited — that is the real cost), or draw which identity run each argv group carries. As long
   as every run executes exactly the same eight, the last of each group is free and no shuffle can
   change that.
2. **Restate the residual with the quantity that matters.** Not "probability a canned facade
   passes" but "*honest operations a facade that always passes can skip*": today that is
   1,000,000 always and 3,000,000 in a third of runs, out of ≈13.0 M + K.
3. Correct the 1/64 decomposition wherever it is recorded (`CHANGELOG.md:377`,
   `docs/reviews/README.md:88`) or drop the number; a wrong quantified claim is worse than a
   qualitative one, and this is the fourth consecutive commit whose residual list was short.

### P2-2. The ninth class: the mutation executes inside the facade's own module scope, so a forged `dev/js-lexer.mjs` answers all eight differentials at O(1) — deterministically, with no `fs`, no `statSync` and no source-text read

Locations: `dev/js-lexer.mjs:9`, `:88-93`, `:237`, `:496`; `dev/validate-fixtures.mjs:417-427`
(anchors), `:4369-4379` (the "scan-locked" rationale), `:4485-4575`; `CHANGELOG.md:99` residual (2),
`:377`.

#### Scope, stated first

`CHANGELOG.md:99` residual (2) says: *"a deliberate forgery inside `dev/js-lexer.mjs` itself remains
outside the threat model, unchanged from the round-45/46 scoping."* Everything in this finding sits
inside that exclusion. I am not claiming the fix failed to do what it promised. I am reporting
three things: what the exclusion actually costs, that it has grown to carry the entire claim, and
that the enabling detail is one unanchored line.

#### The structural point

Round 49 wrote the correct general statement: two invocations differ in exactly one file, so *any
function of that file* is a discriminator. Rounds 43–49 then enumerated functions of that file
computed **from outside** it — its text, its `statSync` metadata, its behaviour on a chosen input.
There is a fourth family, and it is the cheapest of all: the mutated file is the file that **runs**.
Its own code sees the mutation as ordinary program state.

- `const MAX_LEXICAL_OPERATIONS = 2_000_000;` (`dev/js-lexer.mjs:9`) is a live module binding.
  Controls 458, 491 and 492 all mutate exactly this value. Reading it is one identifier reference.
  **Control 491's 50/50 branch is decided by `source.length > MAX_LEXICAL_OPERATIONS`** — one
  comparison — and control 492's by the same comparison. Neither is a guess, and neither requires
  "a second interpreter of the code under test" (`:4370-4371`); it requires a `>`.
- `const COMPLETION_NAME = 'completeCurrentControlScope';` (`:496`) is likewise a live binding, so
  control 492's mutation is detected by a string compare.
- **`let operations = 0;` (`:88`) belongs to no anchor.** `STEP_BLOCK` starts at
  `  const step = () => {` on line 90. The counter the entire error-valued half depends on is
  initialised by a line the fixture never constrains, so the file under test may start it wherever
  it likes. Setting it to `MAX_LEXICAL_OPERATIONS` and calling the scanner on a one-character input
  fires the mutated throw — nonce and all — on the first charged operation. Controls **402, 458,
  491-reject and 492-reject are answered in O(1)**, not in 2,000,001 operations.
- The same seeding defeats control 494's threshold: `operations <= T` with `T ≤ 999,957` is false
  from the first step if the counter starts at 999,957, so a **43-unit** probe (`'x' + decoy`) tells
  the mutated tree from the identity tree — the exact probe round 49 found, restored to working
  order by choosing the counter's initial value. The "mutually ambiguous below ~1,000,000 charged
  operations" property (`:4447-4449`) holds only for a scanner that starts counting at zero.
- Control 459's `K` is the one value not exposed as a binding. It is exposed two other ways:
  `String(step)` on the captured closure returns the mutated arrow function's source at O(1)
  (variant "reflect"), or the captured `step` can simply be driven directly until it throws
  (variant "exec") — `K` bare arrow-function calls, with no character reads, no masking and no
  regex work.

#### Measured

Facade A is `dev/js-lexer.mjs` with the four anchors preserved byte-exactly, the real scanner intact
for every input the rest of the suite uses, and an O(1) fast path for the two fixture-shaped giant
inputs. It uses **no `fs`, no `statSync`, no argv, no invocation ordinal and no persisted state**;
the "exec" variant additionally reads **no source text of any kind**.

| Variant | Runs | Result | Child wall time (8 invocations) |
|---|---|---|---|
| honest `dev/js-lexer.mjs` (baseline) | 2 | 8/8 | 1,972 ms, 2,001 ms |
| facade A, "exec" (live bindings + seeded counter + driven `step`) | 5 | **8/8, every run** | 517–647 ms |
| facade A, "reflect" (adds `Function.prototype.toString`) | 3 | **8/8, every run** | 518–602 ms |

The eight facade runs cover `acceptsAtRaisedBudget491` true and false and
`acceptsDespiteRenamedConstant492` true and false. Not one of the ≈13.0 M charged operations is
performed; the residual wall time is Node startup plus building the 1–2 MB input strings, which the
byte-identical vehicle does regardless.

Compatibility with the rest of the suite was checked, not assumed: the fast path is gated on
`length ≥ 1,000,000`, so controls 399/400 (100,001 and 100,000 units) and 409–478 (the 277,046-unit
fixture source) take the untouched path, and control 457's predicate — re-run against the facade's
prelude — passes (`scanStart ≥ 0`, no `new Map()`, both bounded-cache lines present). I did **not**
run the full 494-control suite with facade A installed; that step, and only that step, is
argued rather than measured, and it is the orchestrator's to confirm if this finding is taken up.

#### Why it is P2 and not P4, given the exclusion

- The gate's stated purpose (`CHANGELOG.md:99`, `README.md:48`) is *"to prove control 401's
  2,000,000-unit scan really executes"*. That is a claim about the behaviour of `dev/js-lexer.mjs`.
  The exclusion removes `dev/js-lexer.mjs` from the threat model. After nine rounds of hardening
  the vehicle side, the exclusion is now the only thing standing between the gate and the claim.
- **Nothing else in the suite covers it.** The largest input any other lexer control feeds the
  scanner is `dev/validate-fixtures.mjs` itself, 277,046 code units (measured at this commit). A
  lexer that grew an input-length-gated fast path — the single most ordinary "optimisation" shape
  there is, and precisely the class this repository's own skill text warns about — would be caught
  by exactly these eight differentials and by nothing else, and facade A is that shape.
- The enabling detail is one line. `let operations = 0;` is the only line in the scanner's preamble
  that the fix's own error-valued half depends on and does not constrain.

#### Correction, and why the obvious fix is the wrong one

Anchoring `let operations = 0;` (or the whole preamble) would work against facade A as written and
is a two-line change — but it is the retired round-43…47 class: a text pin on the file under test,
defeated by the next arrangement of text around it. The residual is not a missing pin; it is
structural, and it has a structural answer:

> **Move the per-run entropy out of the file under test and into the input under scan.**

Today 100 % of the gate's entropy — three nonces, `K`, `T`, the budget constants and the two branch
bits — is written into `dev/js-lexer.mjs`, i.e. into the address space of the code being measured.
Entropy that lives in the *input string* cannot be read that way: observing it requires traversing
the input, which is exactly the work the gate exists to prove. Concretely:

1. Draw a random completion id `N` and a random marker offset `R` in, say, the last 5 % of the
   input; the expected diagnostic becomes `ids [N]`, `indexes [R]`.
2. Deliver `N` and `R` as **content, not as argv**: the parent writes the fully built input into the
   temp tree as a data file and the vehicle reads it and hands the string to the lexer. If `N`/`R`
   travel in argv or the environment, a facade recomputes the answer in O(1) and nothing is gained.
3. Keep the masking-liveness shape of 493/494 but randomise the decoy's id and offset too, so that
   comment-state tracking across the whole input — not just a linear traversal — is required.

Under that construction there is no canned answer to hold, no branch bit to read out of a module
binding, and no `Function.prototype.toString` that helps: the answer is a function of two megabytes
the facade has to consume. It also collapses P2-1's elimination channel, because the last member of
an argv group no longer has a publicly known answer. Cost: one extra ~2 MB file write and read per
differential invocation, against a whole-repository tree copy that already happens per invocation;
the honest scan cost is unchanged.

If that is judged too large a change for this release, the honest alternative is the cheap one:
**state the scope where the claim is made.** `README.md:48` and `CHANGELOG.md:99` should say that
the gate proves the *fixture's* control-401 evidence is not vacuous, and that vacuity inside
`dev/js-lexer.mjs` above ~277,000 units is covered by no control at all.

### P3-1. A new in-model observable: the mutated lexer's line geometry, readable through a cheap thrown error

`dev/validate-fixtures.mjs:4351-4359` enumerates the channels a vehicle can use — the file's text
(the stated residual), its metadata, and its behaviour on a chosen input — and both closed channels
(A: `statSync`, B: sub-50-unit probes) are instances of the last two. There is a third kind of
metadata that neither padding nor scan-locking touches: **the line and column numbers V8 reports in
a stack trace**, which are metadata of the mutated text obtained without reading it.

Measured across all seven distinct mutated trees, using control 399's own input
(`'('.repeat(100_001)`, 100,001 charged operations, ~26 ms) and reading the first `js-lexer.mjs`
frame of the resulting `JavaScript lexical nesting exceeded its deterministic budget` error:

| Tree | Throw site reported |
|---|---|
| 401/493 identity, 402, 458, 491, 492, 494 | `95:50` |
| **459** (injects one line into `step()`) | **`96:50`** |

Control 459 is the only line-count-changing mutation, so the probe identifies it — and only it —
deterministically, with no `statSync`, no text read and 5 % of one differential's scan. The padding
does not interfere: the pad is a single trailing line after all code, so no earlier line moves
(confirmed in the same measurement, which pads every tree).

On its own this channel is not profitable — knowing an invocation is 459 does not reveal `K`, and
the 100,001-operation cost slightly exceeds what the resulting sharper elimination saves (measured:
13.3 M charged with the probe versus 13.0 M without). It is reported because the block's channel
enumeration is the document a future fixing pass will reason from, and it is short by one: any
mutation that changes the *shape* of the file, not just its bytes, is observable at O(1) through an
exception the vehicle can raise cheaply. A future differential that adds or removes a line — the
natural way to write a new mutation — would be identified for free.

### P3-2. The heap-cap comment rewritten as round-49's P3-1 fix was already stale at its own commit

`dev/validate-fixtures.mjs:370-372`:

> Cap each focused probe child (controls 399, 400, and 409-478 — the largest of their inputs is the
> whole dev/validate-fixtures.mjs source, ~266,000 code units today and growing with every control
> added …

Round 49's P3-1 was that this sentence stated a wrong size; the fix replaced "~100,001 code units"
with "~266,000 code units today". Measured at the very commit that wrote it:
`git cat-file -s 4287100^:dev/validate-fixtures.mjs` = **266,387**;
`git cat-file -s 4287100:dev/validate-fixtures.mjs` = **277,201** (277,046 code units). The commit
grew the file by 10,814 bytes and left "today" pointing at the pre-commit figure — 4.1 % low the
moment it was committed. The "and growing with every control added" hedge keeps it from being
false, but "today" is not today.

This is the third consecutive round in which a P3 comment-correction ships a number that is wrong at
its own commit (round 48's P3-4 → round 49's P3-1 → this). The durable fix is not another number:
either state the bound without a figure, or derive the figure at run time (the fixture already reads
its own source).

### P3-3. "The size channel has nothing to read" is imprecise — it reads exactly one thing

`dev/validate-fixtures.mjs:4362-4365` and `CHANGELOG.md:377` state that padding leaves the size
channel with nothing to read. Within a run that is exactly true and I confirmed it (one distinct
size across all eight trees). Across runs it is not quite: the common length is
`base + 96 + 2·digits(K459) + 178`, so the file size discloses the **number of decimal digits of
`probeOperation459`** — measured range 36,044 + 2·d for d ∈ [1,7], i.e. six distinct values in
practice. It is harmless (it narrows `K` to a decade, leaving ~1/1.8 M inside it, and `K` is only
needed by the one control that must be scanned anyway), and I record it only so that the next round
does not have to rediscover that the sentence is a simplification. If it is to be exact, pad to a
constant that does not depend on any draw — e.g. `base + 512` — and assert the deficit.

### P3-4. Anchor drift now aborts the fixture process instead of failing its controls closed, and `:492`'s designed message is unreachable

`dev/validate-fixtures.mjs:412-416` documents the fail-closed contract:

> every `mutate()` below therefore asserts exactly-one-occurrence at run time via
> `anchorOccursExactlyOnce` and returns null otherwise (the differential reports that as skipped and
> the control fails closed)

and `:492` implements it: `Control ${controlId}: required dev/js-lexer.mjs anchor was not found or
does not occur exactly once`.

The padding pass added at `:4586-4590` now calls every `mutate()` at module top level, before any
control runs, and converts the same condition into an **uncaught throw**:

```js
if (mutated === null) throw new Error('anti-vacuity differential anchor is missing from dev/js-lexer.mjs');
```

with a second uncaught throw at `:4597` for a negative padding deficit. Neither is inside a `try`.
An anchor that drifts therefore takes down the whole fixture process at that point — after ~490
controls have run and before controls 460, 485–490 and the registry's completion accounting — with
a stack trace instead of the designed one-line control failure, and `:492`'s branch becomes
unreachable for the case it was written for (the temp-tree copy is byte-identical to the file the
sizing pass already validated, so `mutate` can no longer return `null` at spawn time).

Still red, so no false pass — but it is a worse failure than the one the comment promises, and it is
a three-line fix: catch both conditions in the sizing pass, push the same `failures.push(...)`
message for each affected control id, and skip the group.

### P3-5. Adversarial evidence is still a replay of previously published facades — eighth consecutive round

Round 49's P3-5, carried unchanged. This window's re-tests (`CHANGELOG.md:377`) are two
reconstructions: round 48's invocation-ordinal facade and round 49's size/behaviour facade. Both
are shapes the reviews themselves published, and both were expected to fail. No search for a new
shape is recorded, and the two shapes found in this report — a lying vehicle that only *remembers*
(P2-1) and a lexer that reads its own module scope (P2-2) — were not covered by either. The
disposition prose continues to generalise ("closed structurally") from evidence that is specific.

The cheap structural improvement is the same one round 49 asked for: keep the reconstructions, and
add one adversarial run whose facade is written **against the current fix** rather than against the
previous review's finding.

### P4 observations

- `dev/validate-lexer-probes.mjs:58` now takes control 402's input length from argv, so the
  "one unit above the budget" property lives only in the parent's constant (`:4495`). It fails
  closed (a wrong length makes the expected error not fire), and `:124-127` rejects a malformed
  argument, so this is a note, not a finding.
- The P3-4 reproduction line (`:4616`) prints `probeInputLength491`, which discloses `offset491`;
  it prints only on failure and only to the parent's stderr, so nothing observable by a vehicle.
  Correct as designed.
- `runValidateAgainstMutatedFiles` removes each temp tree in a `finally` (`:355-357`), so an
  ordinary run leaves nothing behind; an aborted run (timeout, `SIGINT`) leaves one padded tree
  whose trailing-space count identifies its differential. Post-hoc forensics only.
- Both identity trees (401 and 493) are byte-identical after padding — 110 trailing spaces each in
  the sampled run — but they live in different argv groups, so this leaks nothing.

### Hand-trace and re-measurement: every `mutate`/`expected` pair

| Control | Mutation | Expectation | Re-derived / measured |
|---|---|---|---|
| 401 | none (identity) + pad | `diagnostics`, len 2,000,000, `[902]@1,999,962` | marker is 39 units (counted), callee at `L − 38` = 1,999,962; **measured `[902]@1999962`** |
| 402 | budget throw message ← nonce | `error`, that message; `L = 2,000,001` from argv | one operation above the budget; **8/8 baseline** |
| 458 | budget → 1,999,999, message ← nonce | `error`, that message | throws at operation 2,000,000 on the 401 input |
| 459 | throw injected at `operations === K`, `K ∈ [2, 1,999,961]` | `error`, `…reached K at index K` | **measured `index === K` at K = 2, 3, 1000, 999,958, 1,999,960, 1,999,961** |
| 491 | budget → 2,000,000 + h; `L = 2,000,001 + m` | accept: `[902]@L−38`; reject: nonce'd error | `randomInt` bounds re-derived: `m ∈ [1,63]`, `h ∈ [m+1,64]` on accept, `h = m` on reject ⇒ `L = budget + 1` exactly; **both branches 8/8 in baseline runs** |
| 492 | `COMPLETION_NAME` renamed (+ budget−1 and nonce on the reject branch) | accept: `diagnostics`, `ids []`; reject: nonce'd error | **both branches measured** |
| 493 | none (identity) + pad | `[902]@400,001` | decoy is 43 units, begins at index 999,957 (measured); marker callee at 400,001; **measured** |
| 494 | comment branch gated behind `operations <= T`, `T ∈ [2, 999,957]` | `[902,777]@[400,001, 999,960]` | **measured at T = 999,956/957 (live) and 999,958/959 (masked)** — the documented boundary is exact |

No arithmetic error found. This is the first round in this series in which the block's numbers
needed no correction at all.

### Round-49 disposition matrix

| Round-49 finding | Claimed disposition | Verified state |
|---|---|---|
| P2-1 (statSync size + 39/43-unit probes) | Closed structurally | **Channel A closed** (measured: one size per run, independent of the branch draws). **Channel B closed against the vehicle** (the 43-unit probe no longer separates 493/494 — but see P2-2: it works again if the counter's start value is chosen by the file under test). New residuals in P2-1 and P2-2. |
| P3-1 (heap-cap comment figures) | Closed | **Reopened as P3-2**: the replacement figure was already 4.1 % low at its own commit. |
| P3-2 (README credits the wrong round) | Closed | **Closed.** `README.md:48` now says "the round-47 anti-vacuity gate rebuild". |
| P3-3 (scope-header punctuation undocumented) | Closed | **Closed.** `:4453-4461` documents it in both directions. |
| P3-4 (no seed/order for a nondeterministic gate) | Closed | **Closed.** `:4612-4617` prints order and every draw on any differential failure, and nothing on a green run. |
| P3-5 (single-shape adversarial evidence) | Open | **Open**, eighth round (P3-5 here). |
| P2-A / P2-B / P3-C / P3-D / P3-E | Open | **Open**, all confirmed below. |

## Part 2 — whole-repository release readiness at `4287100`

### P2-A. Nothing has ever been pushed; no CI run has ever exercised any current tooling (eleventh consecutive round)

`git rev-parse origin/main` = `3ed04b907a10a4085203fa6af1f6876313609186` (`fix: address round 23
review findings`); `main` is **102 commits** ahead (`git rev-list --count origin/main..main` = 102).
Every mechanism rounds 42–50 built, rebuilt and repaired — the coordinator, the execution-split
check, all 494 controls, both Windows lanes, the differential gate, its shuffle, its nonces, its
padding and its branch draws — has run on exactly one Windows host. Recorded, not actioned: pushing
is a separate, explicitly human-authorized act and was not requested by this review.

### P2-B. The behavioural gates rest on local, non-transferable evidence

Unchanged in substance. `CHANGELOG.md:377` records one fresh ordinary `npm run validate` at this
fixing pass's tree (Node v24.12.0, Windows 10.0.19045, exit 0, 494/494 controls, **293 s**, against
328 s at `a55772f`). Attributed, not re-measured here. The Windows `0xC0000409` gate still has no
CI run and no SHA-attributed measurement, and the two ubuntu lanes will evaluate the differential
path — now with a per-run random order, three per-run random draws and two per-run branch bits —
for the first time whenever a first push happens. The runtime remains variance-bearing by design
(control 459 aborts at a uniform `K`), so 293 s is a sample, not a bound; the 35 s drop from 328 s
is within that variance and should not be read as a speedup.

### P3-C. The coordinator's option surface is still unexercised

Round-47 P3-B / round-48 P3-C / round-49 P3-C, unfixed and undispositioned. `dev/validate-all.mjs`
is untouched in this window (`git diff --name-only 4287100^ 4287100` does not list it). Argument
forwarding, `cwd`, the 20-minute default timeout, the `SIGTERM` kill signal and
`RUST_INTEL_VALIDATE_TIMEOUT_MS`'s malformed-value rejection remain covered by no control; control
487 exercises only status forwarding, `stdio: 'inherit'`, the phase name in the failure line, and
the fact that the fixtures phase does not run after a failed core phase.

### P3-D. Two `dev/` scripts are referenced by nothing executable

Unchanged. A repository-wide grep for `calibrate-release-version` and `review-modules.workflow`
outside `docs/` returns exactly one hit — a self-reference in
`dev/review-modules.workflow.js:4`. Neither file appears in a workflow step, in `package.json`
(`scripts` = `sync`, `validate` only), in `dev/validate.mjs`'s `required` list, or in
`.github/workflows/ci.yml:49-59`'s `node --check` block.
`dev/calibrate-release-version.mjs` (10,348 bytes) remains documented in README's layout tree, so it
is a shipped-in-repo tool that CI never even parses.

### P3-E. The primary checkout carries an untracked hooks directory that is wired into git

Unchanged and confirmed read-only: the primary working copy at `D:/dev/rust/rust-intel` has
`git status --short` = `?? .githooks/` and `git config core.hooksPath` =
`D:\dev\rust\rust-intel\.githooks` (one 51-byte `pre-push` script, unrelated to this repository).
Repository config points at an uncommitted path, so every "clean tree" statement in the release
records has to be read past it. This review's worktree is clean. Track it, ignore it, or move it out
of the repository.

### Release-readiness evidence at `4287100`

| Gate | State |
|---|---|
| Ordinary validation | **Not re-run** (out of scope for this pass). Attributed: `npm run validate`, Node v24.12.0, Windows 10.0.19045, exit 0, 494/494 controls, 293 s (`CHANGELOG.md:377`). |
| Recovery matrix | Not re-run; unchanged in this window. |
| Independent review | This report. |
| Exact-head CI | **Never run** (P2-A). |
| Packaging | Not re-verified (`npm pack` excluded); `files` unchanged; packaged surface byte-identical in this window. |
| Version state | Pre-bump; `package.json` and banner at `v0.6.0`, planned `0.7.0` MINOR, re-derivation against `v0.6.0` unchanged since round 46. |
| Counts | 494 / 419 (390 + 29) / 75, in agreement across `dev/validate-fixtures.mjs:5`,`:10`,`:100`, `README.md:48`, `CHANGELOG.md:101`, and machine-checked at runtime. |
| Mirror | In sync and untouched in this window (`diff -r skill skills/rust-intel` empty). |
| Anti-vacuity gate | **Padding and scan-locking verified sound.** Residual: deterministically skippable in 1 of 8 differentials every run and 2 of 8 in a third of runs, with `P(pass) = 1` (P2-1); fully answerable at O(1) by a forged `dev/js-lexer.mjs` (P2-2, out of the declared threat model). |

## Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| P2-1 | P2 | The shuffle does not close elimination: every run executes the same eight differentials in three argv groups, each honest invocation self-identifies from its own result, and `os.tmpdir()` persistence (conceded at `:4345`) makes the last member of each group derivable. Measured over 12 runs of a byte-identical lying vehicle: **8/8 every run with `P(pass) = 1`**, one of 493/494 never scanned in **any** run and control 401 never scanned in **3 of 8**. The recorded "≈ 1/64 per run (401: 1/4; 491/492/493/494: 1/2 each)" is the wrong quantity — a facade that scans nothing passes with probability 0, a maximally-skipping one with ≈ 1/4 while skipping 38–54 % of the work — and its decomposition double-counts 492 and treats the anti-correlated 493/494 pair as independent. | `dev/validate-fixtures.mjs:4342-4349`, `:4485-4575`, `:4601-4611`; `CHANGELOG.md:377`; `docs/reviews/README.md:88` |
| P2-2 | P2 | Ninth channel class: the mutated file is the file that executes, so a forged `dev/js-lexer.mjs` reads `MAX_LEXICAL_OPERATIONS` and `COMPLETION_NAME` as live bindings (deciding both new 50/50 branches with one comparison each), starts `operations` where it likes — `dev/js-lexer.mjs:88` is in no anchor — turning every nonce'd budget throw into an O(1) event and re-enabling the 43-unit 493/494 probe, and recovers `K` by driving the captured `step` or by `String(step)`. Measured **8/8 in 8 runs**, both branch bits covered, with no `fs`, no `statSync`, no argv, no ordinal, no persistence and (in the primary variant) no source-text read; ≈13.0 M charged operations become none. Declared out of scope by `CHANGELOG.md:99` residual (2) — but that exclusion now covers the only file whose behaviour the gate's stated purpose is about, and no other control exercises the lexer above 277,046 units. | `dev/js-lexer.mjs:9`,`:88-93`,`:237`,`:496`; `dev/validate-fixtures.mjs:417-427`, `:4369-4379`; `CHANGELOG.md:99`,`:377`; `README.md:48` |
| P3-1 | P3 | New in-model observable the block's channel enumeration omits: V8 stack-trace line geometry. Control 459 (the only line-count-changing mutation) reports the nesting throw at `js-lexer.mjs:96` where every other tree reports `:95` — measured across all seven mutated trees, via control 399's own 100,001-unit input, with no `statSync` and no text read, and unaffected by the trailing pad. | `dev/validate-fixtures.mjs:4351-4359`; `dev/js-lexer.mjs:95` |
| P3-2 | P3 | The heap-cap comment rewritten as round-49's P3-1 fix says "~266,000 code units today"; the same commit grew `dev/validate-fixtures.mjs` to 277,046 code units (266,387 → 277,201 bytes), so the corrected figure was 4.1 % low at its own commit — third consecutive round in which a P3 comment fix ships a stale number. | `dev/validate-fixtures.mjs:370-372` |
| P3-3 | P3 | "The size channel has nothing to read" is a simplification: the common padded length is `base + 96 + 2·digits(K459) + 178`, so file size still discloses the decimal digit count of `probeOperation459` across runs (harmless; six distinct values in practice). | `dev/validate-fixtures.mjs:4362-4365`, `:4576-4600`; `CHANGELOG.md:377` |
| P3-4 | P3 | The padding pass turns anchor drift into an uncaught top-level throw (`:4588`, `:4597`), aborting the whole fixture process instead of failing the eight controls closed as `:412-416` promises, and making `:492`'s designed message unreachable. | `dev/validate-fixtures.mjs:4586-4599`, `:412-416`, `:492` |
| P3-5 | P3 | Adversarial re-test still replays only previously published facade shapes (round 48's ordinal facade, round 49's size/behaviour facade), for the eighth consecutive round, while the disposition prose generalises. Neither shape found in this report was covered. | `CHANGELOG.md:377`; `docs/reviews/README.md:88` |
| P2-A | P2 | Nothing pushed; `origin/main` = `3ed04b9`, head 102 commits ahead; no CI has ever run current tooling (eleventh round). Recorded only — no push was requested. | repository state |
| P2-B | P2 | Behavioural gates rest on local, non-transferable evidence; the single recorded figure (293 s) is variance-bearing by design. | release records |
| P3-C | P3 | Coordinator option surface (argument forwarding, `cwd`, `timeout`, `killSignal`, malformed-timeout rejection) still exercised by no control. | `dev/validate-all.mjs:32-48`; `dev/validate-fixtures.mjs` control 487 |
| P3-D | P3 | `dev/calibrate-release-version.mjs` and `dev/review-modules.workflow.js` referenced by no workflow, script, `required` entry or `node --check`. | `.github/workflows/ci.yml:49-59`; `dev/validate.mjs:17-34` |
| P3-E | P3 | Untracked `.githooks/` wired in via `core.hooksPath` keeps the primary checkout permanently dirty. | repository config |

Totals: **0 P0, 0 P1, 4 P2 (two new: P2-1, P2-2; P2-A and P2-B carried), 8 P3.**

## Recommended correction order

1. **P2-1** — it falsifies a sentence the project has committed about itself, and the fix is cheap
   in concept: make the executed multiset of differentials non-fixed so no group has a derivable
   last member, and restate the residual as *work a certain-to-pass facade can skip* rather than as
   a guessing probability. Correct or drop the "≈ 1/64" in `CHANGELOG.md:377` and
   `docs/reviews/README.md:88`.
2. **P2-2** — decide, explicitly and in writing, which of the two is true: either the gate's stated
   purpose is narrowed to "the fixture's control-401 evidence is not vacuous" (a one-paragraph edit
   to `README.md:48` and `CHANGELOG.md:99`, and the finding closes), or the gate is meant to cover
   `dev/js-lexer.mjs` and the entropy must move out of the file under test and into the input under
   scan, as sketched above. Do **not** answer it by anchoring `let operations = 0;` — that is the
   retired round-43…47 text-pin class and it will be defeated next round.
3. **P3-4** — three lines, and it restores the fail-closed behaviour the surrounding comment
   promises.
4. **P3-2 / P3-3** — two record-accuracy corrections in files the release notes point at. For P3-2,
   prefer deriving the figure at run time over writing another number.
5. **P3-1, P3-5** — record P3-1 in the block's channel enumeration before the next differential is
   written; for P3-5, add one adversarial run authored against the current fix rather than against
   the previous review.
6. **P3-C, P3-D, P3-E** — unchanged; none blocks a release on its own.
7. Unchanged and dominant: **P2-A**. Independent of everything above, no CI has ever executed any of
   this tooling, and the head is now 102 commits ahead of `origin/main`.

## Verdict

**NOT READY.**

This is the first round in this series in which the fix's own construction survives review intact:
the padding is exact and provably branch-independent, the boundary arithmetic is right to the unit
at every point I could measure, and the two scan-locked branches genuinely cannot be read below full
cost *by the vehicle the model is about*. Round 49 asked for three things and got all three.

What has not changed in nine rounds is the shape of the answer. Every hardening pass has moved the
gate's secret to a new place inside `dev/js-lexer.mjs` — a nonce, a random `K`, a random `T`, a
budget constant, now two branch bits — and each round has found a cheaper way to read that place.
The two findings here are the two ends of that pattern. Inside the declared model, the secret does
not even have to be read: the eight differentials are a fixed set, so a vehicle that merely
*remembers* what it has already seen gets the last of each group for free — one of 493/494 in every
run, control 401 in a third of them, with no guess and no luck. Outside it, the secret is in the
address space of the code being measured, and one unanchored line (`let operations = 0;`) collapses
the entire error-valued half from 2,000,001 operations to one.

The lesson round 49 wrote down — *make the answer unknowable, not the mutation invisible* — is
right, and this commit is the first honest attempt at it. It is incomplete for one reason: an
answer stored in the file under test is knowable to that file by construction. The only place a
2,000,000-unit scan's secret can live and still be secret is inside the 2,000,000 units.

No push, bump, tag, or publication is claimed by this report.
