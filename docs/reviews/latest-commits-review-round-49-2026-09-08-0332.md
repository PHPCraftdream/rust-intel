# Round 49 review of the latest commits and v0.7.0 release readiness — 2026-09-08 03:32 CEST

## Scope and method

- Review base: `a971bc5` (round 48's report commit).
- Reviewed head: `a55772f61658aa2e858c6bc9de99a899063a2a3a`.
- Commit window: `a971bc5..HEAD` — **one** commit, confirmed by `git log --oneline a971bc5..HEAD`:
  `a55772f` ("fix: randomize anti-vacuity differential order, nonce error expectations"). Four
  changed files, `+199/−95`: `CHANGELOG.md`, `README.md`, `dev/validate-fixtures.mjs`,
  `docs/reviews/README.md`.
- Packaged surface untouched: `git diff --name-only a971bc5..HEAD -- bin skill skills commands
  .claude-plugin .codex-plugin package.json rust-cc-* examples` is empty. Normative rule text was
  therefore not re-audited.
- Whole-repo context: the reviewed head is **100 commits** ahead of `origin/main`
  (`git rev-parse origin/main` = `3ed04b9`, unchanged since round 42). Nothing in this window, or in
  the 99 commits before it, has been pushed.
- This review is **static plus channel-level measurement**, by instruction. The validator, the
  fixture runner, `npm run validate` and the coordinator were **not** executed (5–8 minute runs, and
  explicitly out of scope for this pass). What I did execute, and nothing else: a scratch script
  under `os.tmpdir()` that (a) applies the eight committed `mutate()` functions to a **copy** of
  `dev/js-lexer.mjs` and measures the resulting file sizes, and (b) imports each mutated copy and
  calls `literalTrueCompletionDiagnostics` on two inputs of **39 and 43 code units**. Total runtime
  under one second; the repository was read-only throughout, and the scratch tree was deleted. Every
  figure attributed to a full-suite run below comes from the commit message or `CHANGELOG.md` and is
  labelled as such; nothing of that kind was re-measured.
- Method: `git log`/`show`/`diff`/`status`/`rev-parse`/`worktree list`, direct file reads, byte-level
  re-verification of the four mutation anchors and `BUDGET_THROW` against `dev/js-lexer.mjs`,
  hand-tracing of every one of the eight `mutate`/`expected` pairs (including recomputing the
  diagnostic indexes and the operation counts), a read of `createControlRegistry` and its ordering
  assumptions, a read of `dev/validate.mjs`'s fixture-source contracts (control-count header,
  registry declaration, source-label inventory), and the size/behaviour measurement described above.
- Authored change set: this report file alone.

## Executive result

- **No P0 and no P1 finding**, in either part, under this series' calibration: nothing in the window
  touches a packaged artifact, installer behaviour, workflow semantics or normative rule text, and
  the only executable change is repository self-test tooling.
- **The round-48 fix does what it says at the level it examines.** The Fisher-Yates shuffle is
  correct and uniform, the registry genuinely has no cross-scope ordering requirement (I re-derived
  this from `createControlRegistry` rather than trusting the commit message), all four anchors still
  occur exactly once, `anchorOccursExactlyOnce` is correct, and all eight `mutate`/`expected` pairs
  are mutually consistent and arithmetically right — I recomputed `1_999_962`, `1_999_963`,
  `400_001`, `999_960`, the 39/43-unit marker/decoy lengths, and the exact-budget operation counts by
  hand. The round-48 invocation-ordinal facade is dead: with the ordinal gone, a per-argv counter
  guesses the eight-way assignment with probability 1/96 per run.
- **One new bypass, of an eighth class — and this one was *created* by the fix.** Round 48 measured
  the `fs.statSync` size channel explicitly and found it insufficient: it could not separate the
  identity run from M-A (`458`) or M-D (`491`), "which are length-preserving by construction … That
  residual alone would still force two full scans." Adding the nonce to controls 402 and 458 made
  their mutations **length-changing**, and that is exactly the property that was holding the channel
  back. Measured on the committed code: **within each probe argv, the mutated `dev/js-lexer.mjs`
  now has a unique size.** One `statSync` plus one baseline constant identifies which of the eight
  differentials an invocation is serving, with zero bytes of the lexer read and zero scanning — and
  the five success-valued controls (**401**, 491, 492, 493, 494), the ones the commit says "rely on
  the shuffle", are answerable from canned data. Control 401 — the control this entire gate exists
  to protect, and the one the size channel provably could *not* touch before this commit — is now
  the cheapest of the eight to fake. A second, independent channel needs no `statSync` at all:
  controls 492, 493 and 494 are identified by calling the lexer on a **39-** and a **43-unit** input
  (measured, not argued). See P2-1.
- What survives, and it is not nothing: the nonce/K construction genuinely forces a full-length scan
  for the three error-valued controls (402, 458, 459). I hand-verified that `step()` charges at most
  one operation per code unit consumed, so the budget cannot be tripped by any input shorter than the
  canonical one — the facade must run 402's and 458's inputs to their final charged operation. The
  coarse claim "some multi-million-unit scan really executes" therefore holds; what fails is the
  *exactness* of the operation-count pinning (both `≤` halves come from success-valued controls) and
  the whole of the masking-liveness pair.
- Part 1 additionally holds **five P3s**, all record/comment hygiene, two of them *introduced by this
  commit's own P3 fixes*: a heap-cap comment that now states a wrong input size, a README sentence
  that attributes the gate rebuild to the wrong round, an undocumented coupling between the new scope
  headers and `dev/validate.mjs`'s label regex, no recorded seed for a now-nondeterministic gate, and
  adversarial evidence that again consists of one reconstruction of one facade shape.
- Part 2 holds **P2-A** (nothing pushed; tenth consecutive round), **P2-B** (behavioural gates rest on
  local evidence), and the three carried P3s — **P3-C**, **P3-D**, **P3-E** — all confirmed open and
  untouched. Round 48's ledger findings **P3-A and P3-B are closed** (verified).
- Release verdict: **NOT READY**.

## Part 1 — the `a55772f` merge

### P0 and P1

None. The window changes only repository self-test tooling and records. The suite is green at
494/494 per the commit message and `CHANGELOG.md:375` (attributed, not re-measured).

### P2-1. The eighth class: the nonce turned file size into a complete fingerprint of the mutation, and the fix's own "rely on the shuffle" controls are the ones it frees

Locations: `dev/validate-fixtures.mjs:4398-4402` (nonces), `:4403-4476` (the eight differentials),
`:4477-4480` (shuffle), `:4481-4484` (execution loop), `:4338-4354` (threat-model paragraph),
`:473-492` (`expectJsLexerDifferential`), `:308-358` (`runValidateAgainstMutatedFiles`);
`CHANGELOG.md:375`; `docs/reviews/README.md:86`.

#### What the fix assumes

The commit and `CHANGELOG.md:375` state the premise plainly:

> Success-valued expectations (401, 491, 492, 493, 494) cannot carry a nonce without changing their
> verified semantics and rely on the shuffle.

and `dev/validate-fixtures.mjs:4344-4346`:

> Randomizing the order per run with a Fisher-Yates shuffle driven by `crypto.randomInt` destroys
> that mapping: the vehicle cannot know which mutation (or none) this invocation's temp tree carries.

The first sentence is true of the *ordinal*. The second does not follow, because the ordinal is not
the only channel that identifies the mutation — and the temp tree is where the mutation is.

#### The structural point

Every invocation of the probe vehicle differs from every other invocation in exactly three ways:
argv (`401`/`402`/`493`), a random temp-root path, and **the bytes of one file,
`dev/js-lexer.mjs`**. That is the whole per-invocation state; I enumerated it from
`runValidateAgainstMutatedFiles` (`:308-358`): the same `validateInputs` are copied, the same env is
passed (`RUST_INTEL_SKIP_NESTED_FIXTURES=1`, `RUST_INTEL_FIXTURE_PROGRESS=0`), the parent's pid is
constant, and the identity differentials rewrite their file too (`:320-325` writes unconditionally),
so not even an mtime asymmetry distinguishes them.

It follows that **any function of that one file is a discriminator** — its text (the stated
residual), its *metadata*, or its *behaviour on an input the vehicle chooses*. Mutation testing hands
the mutation to the vehicle by construction. The shuffle removes one derived channel (the ordinal);
it cannot make the mutation unidentifiable. The only defence that survives this is to make the
*expected answer* unknowable, which is precisely what the nonce does — for three of the eight.

#### Channel A — `statSync().size`, now complete, and complete *because of this commit*

Round 48 measured this channel and bounded it (its P2-1, point 3):

> `fs.statSync` on the temp-tree lexer already separates M-B/M-C/M-E (length-changing mutations) from
> the identity run; it cannot separate identity from M-A/M-D, which are length-preserving by
> construction. That residual alone would still force two full scans.

At `6defc27` that was exact. `458` rewrote `2_000_000` → `1_999_999` (both nine characters) and
`402`/`491` were `(source) => source` and `2_000_000` → `2_000_001` — all length-preserving, so the
size channel left `{401, 458}` and `{402, 491}` ambiguous, forcing one genuine scan per argv.

This commit gave 402 and 458 a nonce-bearing message. Measured against the committed `mutate()`
functions on a copy of the committed `dev/js-lexer.mjs` (baseline **35,770** bytes; the numbers below
are the measured run, the ranges are derived from the nonce/K digit counts):

| Control | probe argv | Mutation | Δ size | Δ range over all draws |
|---|---|---|---|---|
| 401 | 401 | identity | **+0** | {0} |
| 492 | 401 | `COMPLETION_NAME` + `_mutated` | **+8** | {8} |
| 458 | 401 | budget − 1 **+ nonce message** | **+29** | [15, 29] |
| 459 | 401 | injected K-throw | **+108** | [98, 110] |
| 491 | 402 | budget + 1 | **+0** | {0} |
| 402 | 402 | **nonce message only** | **+29** | [15, 29] |
| 493 | 493 | identity | **+0** | {0} |
| 494 | 493 | `false && ` inserted | **+9** | {9} |

The message delta is `len(" (gate nonce ") + digits(N) + len(")")` = `14 + digits(N)`, and
`digits(N) ∈ [1, 15]` for `randomInt(0, 2**48 - 1)`; the 459 delta is `96 + 2·digits(K)` with
`digits(K) ∈ [1, 7]`. **The ranges are pairwise disjoint within every argv group, for every possible
draw.** So:

- argv `401`: `+0` ⇒ control 401, `+8` ⇒ 492, `[15,29]` ⇒ 458, `[98,110]` ⇒ 459;
- argv `402`: `+0` ⇒ **491**, `[15,29]` ⇒ 402;
- argv `493`: `+0` ⇒ **493**, `+9` ⇒ 494.

A vehicle that does `fs.statSync(new URL('./js-lexer.mjs', import.meta.url)).size`, subtracts one
hard-coded baseline, and looks the answer up in the expected-observation literals it is already
handed (`dev/validate-lexer-probes.mjs:12` loads `dev/validate-fixtures.mjs`, which contains every
success-valued expectation verbatim at `:4408`, `:4450`, `:4459`, `:4465`, `:4474`) answers
**401, 491, 492, 493 and 494 with no scan at all**. It reads no byte of the code under test and calls
no `Function.prototype.toString`; it is a `stat` and a table.

This is not the stated residual. `CHANGELOG.md:99` and `docs/reviews/README.md:84` describe residual
(1) as "a vehicle that greps the mutated lexer for the specific mutation signatures and simulates the
expected effect … a second interpreter of the code under test". A size switch greps nothing and
simulates nothing. Round 48 drew the same distinction for the ordinal and enumerated the size channel
separately *as a bounded one*. The bound is what this commit removed.

The direction of the regression is the finding: **before `a55772f`, control 401 was one of the two
differentials the size channel could not touch. After `a55772f`, it is `+0` and unique in its argv
group.** The control that the entire gate is named for — "the gate meant to prove control 401's
2,000,000-unit scan really executes" (`CHANGELOG.md:99`) — became the cheapest of the eight to fake,
as a side effect of a change made to protect it.

#### Channel B — a 39-unit and a 43-unit input, no `statSync`, no baseline constant

Independent of size, three mutations are semantic changes to shared logic and are therefore visible
on trivially small inputs. Measured, by importing each mutated copy and calling the exported
`literalTrueCompletionDiagnostics`:

| Mutated tree | `'x;completeCurrentControlScope(902, true)'` (39 units) | `'x/*;completeCurrentControlScope(777, true)*/'` (43 units) |
|---|---|---|
| identity / 402 / 458 / 459 / 491 / 493 | `[902]` | `[]` |
| **492** (`COMPLETION_NAME` renamed) | **`[]`** | `[]` |
| **494** (comment branch disabled) | `[902]` | **`[777]`** |

Two calls costing under 100 charged operations identify 492 and 494 — and therefore also 493, which
is the only other member of argv `493`. The leading `x` in the second input is load-bearing (it makes
the decoy's `/` a division rather than a regexp start, exactly as the 1,000,000-unit input does); this
is the same reasoning the fixture itself uses at `:4391-4397`, applied at 1/23,000th of the scale.

Channel B matters separately from Channel A because **the obvious repair for A — pad the mutations to
a common length — does not close B.** Controls 492, 493 and 494 stay canned-answerable with a
39-unit and a 43-unit probe no matter what the file sizes are.

#### What this costs the gate

Honest work across the eight differentials is ≈ 13.0 M charged operations plus `K`. A facade using
Channel A performs 402's (2,000,001), 458's (2,000,000) and 459's (`K`, mean ≈ 1.0 M) — ≈ 5.0 M, about
38 % — and the following claims stop being supported:

- **Control 401** proves nothing. Round 48's verified "458 pins charged operations to the budget
  constant — Holds, exactly" is the conjunction 401 (`ops ≤ 2,000,000`) ∧ 458 (`ops ≥ 2,000,000`).
  Only the second half is still forced; the pin degrades from `=` to `≥`.
- **Control 491** likewise: 402 ∧ 491 pinned `ops = 2,000,001` for the longer input. Only `≥` remains.
- **Controls 493/494**, which round 48 called "the only masking-liveness evidence in the suite", are
  answered by a 43-unit probe. Block-comment masking is still shown to be live — on 43 units. The
  1,000,000-unit claim is unsupported.
- **Control 492**'s completion-name provenance is shown on 39 units, not 2,000,000.

What is *not* defeated, and deserves credit: the three error-valued controls. I hand-verified that
`step()` is charged at most once per code unit consumed on every path in `scanLexical` (main loop
`:207-208`; identifier `:262`; `skipQuoted` `:163`; `skipRegex` `:174`, `:182`; block comment `:240`;
two-character operators advance two units for one charge), so `operations ≤ source.length` always and
the budget cannot be tripped by any input shorter than the canonical one. `n402`, `n458` and `K` are
drawn independently per control, exist only in the parent's memory and in one temp tree at a time, and
cannot be replayed across invocations. A facade must run 402's and 458's inputs to their final charged
operation and 459's to operation `K`. That part of the fix is sound and is the only part doing work.

#### Correction, in priority order

1. **Do not answer this with a text/`stat` pin on the vehicle.** That is the retired round-43…47
   class. The channel is inherent: the vehicle holds the mutation.
2. **Make the answer unknowable rather than the mutation unidentifiable.** Extend the nonce principle
   to the success-valued controls by making the *accept/reject decision itself* unpredictable: draw
   the budget constant `B` and the probe input length `L` at run time (pass `L` in argv, mutate `B` in
   the tree), choosing `L ≤ B` or `L > B` at random. The accept-case diagnostic index is a public
   function of `L`, but *which* branch a run is in is not derivable from `L` alone, and reading `B`
   requires either the text (the stated residual) or a real scan. Eight such draws leave a guessing
   facade at 1/256 per run, and the honest cost is unchanged.
3. **Pad every mutation, including the identity ones, to a common file length** (fixed-width
   zero-padded nonce, and a length-equalising comment on the shorter mutations). This closes
   Channel A and restores round 48's measured bound; it is cheap and it is not sufficient alone.
4. **Restate the residual list.** It is now short by one for the third consecutive commit. The honest
   sentence is: "the gate forces a full-length scan for the three error-valued differentials; the five
   success-valued differentials are canned-answerable by a vehicle that identifies the mutation by
   file size or by a sub-50-unit behavioural probe".

### P3-1. The heap-cap comment, rewritten in this commit as the round-48 P3-4 fix, now states a wrong input size

`dev/validate-fixtures.mjs:370-376`:

> Cap each focused probe child (controls 399, 400, and 409-478 — synthetic inputs of at most
> ~100,001 code units) below the host's normal V8 reservation.

Controls 409–478 do not run on synthetic inputs. `dev/validate-lexer-probes.mjs:18-26`,`:91-93`
builds `completionMutation(...)` from the **whole fixture source** and passes it to
`literalTrueCompletionViolations`; `dev/validate-fixtures.mjs` is **266,387 bytes** today. The real
bound is ~266,000 code units, 2.7× the stated one, and it grows with every control added. Round 48's
own wording was correct ("no `runLexerProbe` control exceeds the 261 KB fixture source or 100,001
delimiters"); the fix replaced a correct statement with an incorrect number under a 64 MB heap cap —
the same failure mode (scrubbing precision out of a true statement) that round 48's P3-4 flagged in
the control-485 comment.

Same sentence, second inaccuracy: "The multi-million-unit differential inputs (controls 401/402/458/
459/491/492/493/494)". Controls 493 and 494 run on 1,000,000 units.

### P3-2. `README.md:48` attributes the gate rebuild to the wrong round

The provenance sentence now reads "… its then shared semantic oracle
(`dev/validate-lexer-observations.mjs`; retired and deleted by the **round-48** anti-vacuity gate
rebuild — see `CHANGELOG.md`)". The rebuild is `6defc27`, the **round-47** fixing pass; round 48 is
the review that found the ordinal bypass *in* it, and the round-48 fixing pass is `a55772f`, which
rebuilt nothing. `docs/reviews/README.md:84` labels the same work correctly ("rounds 43–47
anti-vacuity bypass series"). This sentence exists solely to carry provenance (it was added for
round-45 P3-2 and qualified here for round-48 P3-3); getting the round wrong in it is the specific
defect it is meant to prevent.

### P3-3. The two new scope headers are shaped to miss `dev/validate.mjs`'s label regex, and nothing says so

`dev/validate.mjs:1660` inventories source labels with
`/^\/\/ Controls? (\d+)(?:-(\d+))?:[ \t]/gm` and errors with "source label for control N occurs more
than once" on a duplicate (`:1675`). Controls 401 and 402 keep their inventory entry in the
`// Controls 400-402:` label at `dev/validate-fixtures.mjs:4060`. The new headers at `:4356` and
`:4359` are written as `// Control 401 (probe argv 401, identity run): …` and
`// Control 402 (probe argv 402): …` — they escape the regex only because a parenthesis, not a colon,
follows the number.

Normalising either header to `// Control 401: …` (an obvious tidy-up, and the shape used by the six
sibling headers in the same block at `:4365`, `:4373`, `:4380`, `:4385`, `:4391`) turns the **core**
validator phase red. The coupling is invisible at both ends: the comment at `:4071-4072` says the
scope headers "live there", and nothing warns that their punctuation is load-bearing. One clause —
"(kept out of the label inventory, which lives at the `Controls 400-402` label above)" — fixes it.

### P3-4. The gate is now nondeterministic and records no seed

The shuffle order, `n402`, `n458` and `K` are drawn per run from `crypto.randomInt` and are never
recorded. On failure the expected-observation text carries the nonce and `K` (`:490`), so a single
failure is diagnosable; the *execution order* is printed only under
`RUST_INTEL_FIXTURE_PROGRESS=1` (`:194-195`), and no run can be replayed identically. For a suite whose
release records are built on "this exact tree, this exact run" evidence, and which has spent five
rounds distinguishing reconstruction from measurement, a one-line
`console.error` of the order and the three draws on any differential failure (or a seed knob that
fails closed on malformed input, like the other `RUST_INTEL_*` knobs) is the difference between a
reproducible red run and a story about one.

### P3-5. The adversarial evidence is again one reconstruction of one facade shape (seventh round)

`CHANGELOG.md:375` records: "the review's reconstructed invocation-ordinal facade … fails the rebuilt
suite — observed exit 1 with controls 402, 458, 459, 491, 492, 493, and 494 all failing … control 401
being the only differential the canned table happened to satisfy that run". That is a real, specific,
falsifiable record and an improvement on round 48's evidence hygiene — and it tests exactly one
shape: the facade the previous round had already published. Nothing was run against a size-keyed or
behaviour-keyed vehicle, which is why P2-1 survived the pass. Round 47's P3-C ("closure prose states
classes from single reconstructions") recurs here for the seventh consecutive round, now in the form:
the disposition demonstrates that *this* facade dies, and the prose generalises to "the ordinal
carries zero information afterwards" — true, and not the claim that matters.

Also in the same entry: "control 401 being the only differential the canned table happened to satisfy
that run" is consistent with the mechanism (1/4 chance that the shuffle puts 401 first within argv
`401`), and the commit message's "the majority of the eight differentials mismatching each time" is
the correct hedge for a randomised result. No overclaim there.

### P4 observations

- `expectJsLexerDifferential:479-484` still reads `result.stdout.trim()` on the `{skipped: true}`
  shape, where `stdout` is `undefined`; the surrounding `try/catch` absorbs the `TypeError`. Carried
  from round 48 P4, untouched. A skipped mutation also still produces a second, misleading
  execution-split failure (no spawn is tallied, so the control is counted as in-process).
- After this commit only controls **401** and **493** run the probe against a byte-identical tree;
  402's baseline is now a mutated tree (message text only). The commit states this and the rejection
  stays causal, but "the unmodified tree … rejects the 2,000,001-unit input" (`:4060-4065`,
  `CHANGELOG.md:99`) is now true only of the *condition*, not of the tree.
- `dev/validate-lexer-probes.mjs` is in neither `dev/validate.mjs`'s `required` list (`:17-34`) nor
  either workflow's `node --check` block (`.github/workflows/ci.yml:47-59`). Deliberate — pinning the
  vehicle is the retired class — but it also means a syntax error in the vehicle surfaces only as a
  fixture failure, never as a fast CI parse error.
- `anchorOccursExactlyOnce` (`:415-416`) is correct for these anchors: `split` counts
  non-overlapping occurrences, which is exactly `String.prototype.replace`'s semantics with a string
  pattern, so "split length 2" ⇔ "replace rewrites the only occurrence". Two edge cases exist and are
  unreachable here: an empty anchor (would test source length, not occurrence) and a self-overlapping
  anchor such as `'aa'` in `'aaa'` (split says one, there are two overlapping). All five literals are
  multi-character and non-self-overlapping; I re-measured occurrence counts of `BUDGET_LINE`,
  `STEP_BLOCK`, `NAME_LINE`, `COMMENT_IF` and `BUDGET_THROW` in `dev/js-lexer.mjs` — each is exactly 1.
  The nested `anchor.replace(BUDGET_THROW, …)` inside a matched `STEP_BLOCK` is uniqueness-safe by
  construction and correctly uses function replacements (no `$` hazard).
- The anchors are `\n`-spelled and the repository pins `* text=auto eol=lf` (`.gitattributes`);
  `dev/js-lexer.mjs` is 35,770 bytes with no CRLF, so the anchors match on this host. A checkout that
  materialised CRLF would fail all six anchored differentials closed (skip → control fails), which is
  the right direction but would read as six mysterious "anchor was not found" errors.

### Closure matrix — the round-48 recommendation and this commit's claims, claim by claim

| Claim | Verdict | Evidence |
|---|---|---|
| Differentials execute in a per-run randomized order | **Holds.** | `:4477-4480` is a textbook descending Fisher-Yates with `randomInt(0, i+1)` ⇒ uniform over `[0, i]`, uniform over all 8! permutations; `crypto.randomInt` is CSPRNG-backed and the draw is never logged, written, or embedded in a filename (`makeTempRootOutside` uses `mkdtemp`, `:255-266`). |
| The ordinal no longer maps to an outcome | **Holds.** | Per argv the groups are {401,458,459,492}, {402,491}, {493,494}; a pure counter facade must guess a permutation of 4 and two of 2 ⇒ 1/96 per run. |
| Registry has no cross-scope ordering requirement | **Holds; re-derived, not trusted.** | `createControlRegistry:101-167`: `declared`/`registered`/`completed` are Sets; `register` shifts only *completed* front scopes; `complete` inspects `scopes[0]` only; `finalize` checks membership. Register→spawn→complete is strictly serialised per differential (`:4481-4484`), so `scopes[0]` is always the current control. No id is registered twice, none is skipped. |
| One-spawn-per-control attribution unchanged | **Holds.** | `tallyChildSpawn` (`:180-183`) marks pending; `completeCurrentControlScope` (`:199-208`) claims it for the completing control. The loop keeps exactly one spawn between register and complete. Focused-spawn total is unchanged at 29 (19 `expectLexerProbe` sites + 8 differentials + 460 + 487) and is machine-checked at `:4632-4650`. |
| Error-valued expectations carry an unguessable nonce | **Holds, and it is the only part that forces work.** | `n402`, `n458` from `randomInt(0, 2**48-1)`, `K` from `randomInt(2, 1_999_962)`; independent per control; hand-verified that `operations ≤ source.length` on every path, so no short input trips a budget. |
| Success-valued expectations "rely on the shuffle" | **Fails — see P2-1.** | Measured: unique file size per mutation within each argv group, and 39-/43-unit behavioural discriminators for 492/493/494. The shuffle protects them from nothing. |
| 402's mutation leaves the rejection causal | **Holds.** | Only the message literal inside `STEP_BLOCK` is rewritten; `operations > MAX_LEXICAL_OPERATIONS` and the constant are byte-identical, so the throw still requires 2,000,001 charged operations. |
| All eight `mutate`/`expected` pairs match | **Holds; hand-recomputed.** | Table below. |
| Anchor uniqueness is now asserted (round-48 P3-5) | **Holds.** | `:415-416` + a call in every non-identity `mutate`; `expectLexerProbe`'s dead `{ expected }` option is gone (`:448`). |
| Ledger renders as a table again (round-48 P3-A) | **Holds.** | Blank lines removed; rows now run unbroken `docs/reviews/README.md:5-86`, with the next blank at `:87` before `## Historical-count erratum`. |
| Ledger rows commit-anchored and correctly dated (round-48 P3-B) | **Holds.** | `:84` re-dated to 2026-09-08 and anchored to `6defc27` on `10e6a05`; missing round-47 row added at `:83`; round-48 review and fixing rows at `:85`/`:86` carry their anchoring. |
| Superseded `## [Unreleased]` paragraphs annotated in place (round-48 P3-3) | **Holds.** | `CHANGELOG.md:266`, `:358`, `:366`, plus the in-place correction at `:99`; `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` is explicitly marked as read by no code. |
| Fresh measurement recorded with host/Node/duration (round-48 P3-2) | **Holds** (attributed). | `CHANGELOG.md:375`: Node v24.12.0, Windows 10.0.19045, exit 0, 494/494, 328 s. Not re-measured here. |
| Counts: 494 = 419 (390 + 29) + 75 | **Holds.** | `dev/validate-fixtures.mjs:5`/`:10`/`:100`, `README.md:48`/`:289`, `CHANGELOG.md:101` all agree; runtime cross-checks at `:4632-4664`, plus `dev/validate.mjs:1628-1651` (header ↔ registry) and `:1696-1726` (release-facing copies). |
| "Two residual limits stated, not closed" | **Incomplete — third consecutive commit.** | Channels A and B read no text and simulate nothing. |
| No push/bump/tag/publication claimed | **Holds.** | `origin/main` = `3ed04b9`; no tags added; `package.json` untouched at `0.6.0`. |

### Hand-trace: every `mutate`/`expected` pair, recomputed

Marker `;completeCurrentControlScope(902, true)` = 39 code units; decoy `/*…*/` = 43. The scanner
charges exactly one operation per code unit for these inputs (`x`-run: 1 main-loop step at index 0
plus one inner step per subsequent identifier character; then 39 for the marker).

| Control | argv | Input | Mutation | Forced outcome | Committed expectation | ✓ |
|---|---|---|---|---|---|---|
| 401 | 401 | 2,000,000 | none | ops = 2,000,000 = budget ⇒ accepted; marker `;` at 1,999,961, callee at 1,999,962 | `{diagnostics, 2_000_000, ids:[902], indexes:[1_999_962]}` | ✓ |
| 402 | 402 | 2,000,001 | throw message ← nonce | ops = 2,000,001 > 2,000,000 ⇒ throws the mutated message | `{error, Error, budgetMessage402}` | ✓ |
| 458 | 401 | 2,000,000 | budget 1,999,999 + nonce | throws on the **final** charged operation (2,000,000 > 1,999,999) | `{error, Error, budgetMessage458}` | ✓ |
| 459 | 401 | 2,000,000 | `if (operations === K) throw` after `operations += 1`, before the budget check | fires at `K ∈ [2, 1_999_961]` with `index === K` | `lexical operation probe reached K at index K` | ✓ |
| 491 | 402 | 2,000,001 | budget 2,000,001 | ops = 2,000,001 ≤ budget ⇒ accepted; marker `;` at 1,999,962, callee at 1,999,963 | `{diagnostics, 2_000_001, ids:[902], indexes:[1_999_963]}` | ✓ |
| 492 | 401 | 2,000,000 | `COMPLETION_NAME` renamed | `completionName()` never matches ⇒ no diagnostic; still 2,000,000 ops, so no budget throw | `{diagnostics, 2_000_000, ids:[], indexes:[]}` | ✓ |
| 493 | 493 | 1,000,000 | none | filler 400,000 ⇒ callee at 400,001; decoy masked by the comment branch | `{diagnostics, 1_000_000, ids:[902], indexes:[400_001]}` | ✓ |
| 494 | 493 | 1,000,000 | comment branch `false &&` | decoy live: `/` at 999,957 with `canStartRegex === false` (previous token is a word) ⇒ division, `;` at 999,959, callee at **999,960** | `{diagnostics, 1_000_000, ids:[902,777], indexes:[400_001, 999_960]}` | ✓ |

No pair is mismatched, no `mutate` is applied to the wrong `probeId`, and the four argv-401
differentials still demand three mutually exclusive observations from a byte-identical vehicle (the
structural argument that kills every round-43…47 facade). Middle filler for 493/494 recomputed:
1,000,000 − 400,000 − 39 − 43 = 599,918, putting the decoy at 999,957.

### Round-48 disposition matrix

| Round-48 finding | Status at `a55772f` | Evidence |
|---|---|---|
| P2-1: invocation-ordinal facade | **Closed as stated; superseded by P2-1 of this report.** | Shuffle at `:4477-4480` + nonces at `:4398-4402`; a counter now guesses at 1/96. The *class* ("a channel that identifies the mutation without reading it") is open and wider than before. |
| P3-1: unrecorded facade re-verification | **Closed.** | `CHANGELOG.md:99` carries an in-place correction reclassifying the claim as analytical; `docs/reviews/README.md:84` repeats it. |
| P3-2: no measurement recorded | **Closed** (attributed). | `CHANGELOG.md:375`: Node v24.12.0, Windows 10.0.19045, 328 s, 494/494. |
| P3-3: `## [Unreleased]` presents retired mechanisms as current; README names the deleted module | **Closed**, with a new defect. | Annotations at `:266`, `:358`, `:366`; README qualified — but with the wrong round (P3-2 above). |
| P3-4: stale heap-cap comment; asymmetric control-485 comment | **Half closed, half regressed.** | Control-485 comment realigned with `dev/validate.mjs:2087-2093` (verified identical wording). Heap-cap comment rewritten to a wrong input size (P3-1 above). |
| P3-5: anchor uniqueness is prose; dead `{ expected }` option | **Closed.** | `anchorOccursExactlyOnce` asserted in every non-identity `mutate`; option removed. |
| P3-A: ledger does not render | **Closed.** | Table unbroken at `:5-86`. |
| P3-B: ledger row anchoring/date; missing round-47 row | **Closed.** | `:83`, `:84`, `:85`, `:86`. |
| P3-C: coordinator option surface unexercised | **Open, unchanged** (Part 2). | |
| P3-D: two unreferenced `dev/` scripts | **Open, unchanged** (Part 2). | |
| P3-E: untracked `.githooks/` wired via `core.hooksPath` | **Open, unchanged** (Part 2). | |
| P2-A / P2-B | **Open** (Part 2). | |

## Part 2 — whole-repository release readiness at `a55772f`

### P2-A. Nothing has ever been pushed; no CI run has ever exercised any current tooling (tenth consecutive round)

`git rev-parse origin/main` = `3ed04b907a10a4085203fa6af1f6876313609186` (`fix: address round 23
review findings`); `main` is **100 commits** ahead (`git rev-list --count origin/main..main` = 100).
Every mechanism rounds 42–49 built, rebuilt and repaired — the coordinator, the execution-split
check, all 494 controls, both Windows lanes, the differential gate, and now its shuffle and nonces —
has run on exactly one Windows host. Recorded, not actioned: pushing is a separate, explicitly
human-authorized act and was not requested by this review.

### P2-B. The behavioural gates rest on local, non-transferable evidence

Improved in form since round 48 (`CHANGELOG.md:375` now carries host, Node version, duration and
control count for one run at this fixing pass's tree, 328 s), unchanged in substance: the Windows
`0xC0000409` gate still has no CI run and no SHA-attributed measurement, and the two ubuntu lanes
will evaluate the whole differential path — now with a per-run random execution order and three
per-run random draws — for the first time whenever a first push happens. The gate's runtime is also
now variance-bearing by design (control 459 aborts at a uniform `K ∈ [2, 1_999_961]`), so the 328 s
figure is a sample, not a bound.

### P3-C. The coordinator's option surface is still unexercised

Round-47 P3-B / round-48 P3-C, unfixed and undispositioned, confirmed by reading both files:
`dev/validate-all.mjs:43-48` forwards `process.argv.slice(2)` and sets `cwd`, `timeout` and
`killSignal`; control 487 (`dev/validate-fixtures.mjs:4548-4565`) exercises only status forwarding,
`stdio: 'inherit'`, the phase name in the failure line and the fact that the fixtures phase does not
run after a failed core phase. Argument forwarding, `cwd`, the 20-minute default timeout and the
`SIGTERM` kill signal are covered by no control. `RUST_INTEL_VALIDATE_TIMEOUT_MS`'s malformed-value
rejection (`:32-40`) is likewise uncovered, though the workflow-level ban on the knob is (control 490).

### P3-D. Two `dev/` scripts are referenced by nothing executable

Unchanged: `dev/calibrate-release-version.mjs` (217 lines) and `dev/review-modules.workflow.js`
(97 lines) appear in no workflow step, no `package.json` script (`scripts` = `sync`, `validate`
only), no `required` entry (`dev/validate.mjs:17-34`) and no `node --check` line
(`.github/workflows/ci.yml:49-59`, `npm-publish.yml:50-56`). Grep for their names outside
documentation returns only the files themselves. `calibrate-release-version.mjs` remains documented
in README's layout tree, so it is a shipped-in-repo tool that CI never even parses.

### P3-E. The primary checkout carries an untracked hooks directory that is wired into git

Unchanged and confirmed read-only: the primary working copy at `D:/dev/rust/rust-intel` has
`git status --short` = `?? .githooks/` and `git config core.hooksPath` = `D:\dev\rust\rust-intel\.githooks`
(one 51-byte `pre-push` script, unrelated to this repository). Repository config therefore points at
an uncommitted path, and every "clean tree" statement in the release records has to be read past it.
This review's worktree is clean. Track it, ignore it, or move it out of the repository.

### Release-readiness evidence at `a55772f`

| Gate | State |
|---|---|
| Ordinary validation | **Not re-run** (out of scope for this pass). Attributed: `npm run validate`, Node v24.12.0, Windows 10.0.19045, exit 0, 494/494 controls, 328 s (`CHANGELOG.md:375`). |
| Recovery matrix | Not re-run; unchanged in this window. |
| Independent review | This report. |
| Exact-head CI | **Never run** (P2-A). |
| Packaging | Not re-verified (`npm pack` excluded); `files` unchanged. |
| Version state | Pre-bump; `package.json` and banner at `v0.6.0`, planned `0.7.0` MINOR, re-derivation against `v0.6.0` unchanged since round 46. |
| Counts | 494 / 419 (390 + 29) / 75, in agreement across `dev/validate-fixtures.mjs:5`,`:10`,`:100`, `README.md:48`,`:289`, `CHANGELOG.md:101`, and machine-checked at runtime. |
| Mirror | Untouched in this window (`skill/`, `skills/` byte-identical to `a971bc5`). |
| Anti-vacuity gate | **Bypassable in five of eight differentials** (P2-1), including control 401. Three differentials still force a full-length scan. |

## Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| P2-1 | P2 | Eighth bypass class, created by the fix: nonce-bearing messages made controls 402/458 length-changing, so the mutated `dev/js-lexer.mjs` now has a unique size within every probe argv. One `statSync` answers controls 401, 491, 492, 493, 494 from canned data with no scan — including control 401, which the size channel provably could not touch before this commit. A second channel (39-/43-unit behavioural probes) identifies 492/493/494 without `statSync` and survives any size padding. Round 48 measured this channel as forcing two full scans; it now forces none on the success-valued half. Residual list short by one, third consecutive commit. | `dev/validate-fixtures.mjs:4398-4402`, `:4403-4484`, `:4338-4354`; `CHANGELOG.md:375`; `docs/reviews/README.md:86` |
| P3-1 | P3 | The heap-cap comment rewritten as the round-48 P3-4 fix states "synthetic inputs of at most ~100,001 code units" for controls 409–478, which actually scan the 266,387-byte fixture source; 493/494 called "multi-million-unit" are 1,000,000. | `dev/validate-fixtures.mjs:370-376` |
| P3-2 | P3 | README's provenance sentence attributes the gate rebuild (`6defc27`, the round-47 fixing pass) to "the round-48 anti-vacuity gate rebuild". | `README.md:48` |
| P3-3 | P3 | Controls 401/402's new scope headers escape `dev/validate.mjs`'s label-inventory regex only via their parenthetical; normalising them to `// Control 401:` makes the core validator phase fail with a duplicate-label error. Undocumented at both ends. | `dev/validate-fixtures.mjs:4356`, `:4359`, `:4060`; `dev/validate.mjs:1660`, `:1675` |
| P3-4 | P3 | The gate is now nondeterministic (shuffle + three per-run draws) and records no seed or order outside progress mode; a failing run cannot be replayed. | `dev/validate-fixtures.mjs:4398-4402`, `:4477-4484` |
| P3-5 | P3 | Adversarial re-test covers exactly one facade shape — the one the previous round published — while the disposition prose generalises; "closure from single reconstructions" recurs for the seventh round. | `CHANGELOG.md:375`; `docs/reviews/README.md:86` |
| P2-A | P2 | Nothing pushed; `origin/main` = `3ed04b9`, head 100 commits ahead; no CI has ever run current tooling (tenth round). Recorded only — no push was requested. | repository state |
| P2-B | P2 | Behavioural gates rest on local, non-transferable evidence; the single recorded figure is now also variance-bearing by design. | release records |
| P3-C | P3 | Coordinator option surface (argument forwarding, `cwd`, `timeout`, `killSignal`, malformed-timeout rejection) still exercised by no control. | `dev/validate-all.mjs:32-48`; `dev/validate-fixtures.mjs:4548-4565` |
| P3-D | P3 | `dev/calibrate-release-version.mjs` and `dev/review-modules.workflow.js` referenced by no workflow, script, `required` entry or `node --check`. | `.github/workflows/ci.yml:49-59`; `dev/validate.mjs:17-34` |
| P3-E | P3 | Untracked `.githooks/` wired in via `core.hooksPath` keeps the primary checkout permanently dirty. | repository config |

Totals: **0 P0, 0 P1, 3 P2 (one new: P2-1; P2-A and P2-B carried), 8 P3.**

## Recommended correction order

1. **P2-1** — the only finding that touches a claim the project makes about itself. Order:
   (a) restate the residual list honestly (five of eight differentials are canned-answerable);
   (b) pad every mutated tree, identity runs included, to one common file length;
   (c) give the success-valued differentials a run-time-random accept/reject decision (random budget
   `B` in the tree, random input length `L` in argv), so that no invocation has an answer that is a
   public function of what the vehicle can cheaply observe. Do **not** answer it with a text or
   `stat` pin on the vehicle — that is the retired round-43…47 class.
2. **P3-1 / P3-2** — two wrong facts introduced by this pass's own P3 fixes; both are one-line
   corrections and both sit in files the release notes point at.
3. **P3-3** — add the missing clause about the label inventory before someone tidies the punctuation
   and reds the core phase.
4. **P3-4** — log the shuffle order and the three draws on any differential failure, or accept a
   seed knob that fails closed on malformed input.
5. **P3-5, P3-C, P3-D, P3-E** — record or fix as convenient; none blocks a release on its own.
6. Unchanged and dominant: **P2-A**. Independent of everything above, no CI has ever executed any of
   this tooling, and the head is now 100 commits ahead of `origin/main`.

## Verdict

**NOT READY.** The fix is correct about the thing it examined — the shuffle is sound, the registry
tolerates it, the anchors and every expectation check out by hand, and the nonce genuinely forces a
full-length scan on the three error-valued controls, which is the first mechanism in this series that
provably cannot be answered without doing the work. But round 49 is the eighth consecutive round to
find a working bypass of this gate, and this one is different in kind from its predecessors: it was
*introduced* by the fix. Making two mutations nonce-bearing made them length-changing, which completed
a side channel the previous round had measured and bounded — and the control it freed first is control
401, the one the gate is named after. The lesson the last eight rounds keep re-teaching is visible in
this one: as long as the differential's *expected answer* is a public constant, every round will find
another way to identify which differential is running. Make the answer unknowable, not the mutation
invisible. No push, bump, tag or publication is claimed by this report.
