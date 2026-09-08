# Round 51 review of the latest commits and v0.7.0 release readiness — 2026-09-08 10:49 CEST

## Scope and method

- Review base: `56add5f` (round 50's report commit).
- Reviewed head: `ad77d075364504ce74ce5aadd6f18d17eb42d19e`.
- Commit window: `56add5f..HEAD` — **one** commit, confirmed by `git log --oneline 56add5f..HEAD`:
  `ad77d07` ("fix: replace anti-vacuity gate's shuffle/padding with scan-completion nonces"). Five
  changed files, `+153/−176`: `CHANGELOG.md`, `README.md`, `dev/validate-fixtures.mjs`,
  `dev/validate-lexer-probes.mjs`, `docs/reviews/README.md`.
- Packaged surface untouched: `git diff --name-only ad77d07^ ad77d07 -- bin skill skills commands
  .claude-plugin .codex-plugin package.json rust-cc-* examples` is empty. Normative rule text was
  therefore not re-audited. The Codex mirror is byte-identical (`diff -r skill skills/rust-intel`
  is empty).
- **Whole-repo context changed materially during this review.** At the start of the pass
  `git rev-parse origin/main` = `56add5f` and `main` was one commit ahead. At 2026-09-08 10:33:01
  +0200 — while this review was running — `ad77d07` was pushed. Re-confirmed against the network,
  not just the tracking ref: `git ls-remote origin refs/heads/main` =
  `ad77d075364504ce74ce5aadd6f18d17eb42d19e`, and `git rev-list --count origin/main..main` = **0**.
  See P2-A: the eleven-round "nothing has ever been pushed" formulation is retired, and what
  replaces it is worse.
- This review is **static plus measurement**, by instruction. `npm run validate`,
  `dev/validate-all.mjs`, `dev/validate.mjs` and `dev/validate-fixtures.mjs` were **not** executed
  (5–8 minute runs, explicitly out of scope). Every full-suite local figure quoted below comes from
  the commit message or `CHANGELOG.md` and is labelled as attributed, not re-measured. Exact-head
  **CI** figures are not attributed — they are read directly from the GitHub Actions run for
  `ad77d07` (`gh run view`, read-only).
- What I did execute — all of it under `os.tmpdir()` / a scratch directory outside the repository,
  with the working tree read-only throughout, and everything deleted afterwards except the
  scratch dir:
  1. **An eight-differential replica of the gate**: the nonce draws (`:4480-4493`),
     `applyScanCompletionNonce` (`:452-458`), every `mutate`/`expected` pair (`:4494-4574`), the
     temp-tree copy and spawn from `runValidateAgainstMutatedFiles` (`:308-358`), and the parent's
     pass predicate copied verbatim from `expectJsLexerDifferential` (`:523-525`). Validated
     against the honest vehicle and the honest lexer first: **8/8**, 2,858 ms.
  2. **An instrumented `dev/js-lexer.mjs`** exporting the final charged-operation counts of both
     layers, to re-derive all five `scanOps` values and both layers' costs independently.
  3. **A randomized ops-per-code-unit search** (192,609 freshly scanned inputs over a 40-character
     adversarial alphabet, cache hits excluded by an explicit reset hook).
  4. **A live-module leakage probe**: `Function.prototype.toString` over the whole export graph to
     depth 4, plus returned values, thrown `Error` objects and their stacks.
  5. **Two forged vehicles** (whole-file, and an 18-line insertion into the byte-identical real
     vehicle), 6 gate runs / 48 differential invocations.
  6. **Four scratch lexer defects** run against all eight differentials, to test the two
     accidental-defect claims the fix added to `README.md` and `CHANGELOG.md`.
  7. **A guard-ablation probe** for `source.length === inputLength`.
  8. **One local reproduction** of a red CI job: `node dev/test-installer-recovery.mjs node-claude
     install sparse before-commit cross` (writes only under `os.tmpdir()`).
  Total scratch runtime under five minutes.
- Method otherwise: `git log`/`show`/`diff`/`status`/`rev-parse`/`cat-file`/`reflog`/
  `ls-remote`/`worktree list`, `gh run list`/`gh run view --log-failed`, direct file reads,
  byte-level re-verification of all five mutation anchors, hand-derivation then re-measurement of
  every `mutate`/`expected` pair, and a read of the three record surfaces (`CHANGELOG.md:99`,
  `:375`, `:377`, `:379`; `README.md:48`; `docs/reviews/README.md:89-90`).
- Authored change set: this report file alone.

## Executive result

- **The scan-completion nonce mechanism itself is sound, and I could not break it.** I looked for a
  tenth channel class specifically against the new mechanism and did not find one. Three
  independent lines of evidence:
  - **Charged operations never exceed code units.** Every `step()` call site in `scanLexical` is
    paired with an `index` advance of ≥ 1 (read line by line: `:163`, `:174`, `:182`, `:208`,
    `:233`, `:240`, `:262`, `:324`, `:338`), and a randomized search over 192,609 freshly scanned
    inputs found a maximum ops/unit ratio of exactly **1.000**. Reaching `scanOps` therefore
    requires an input of at least `scanOps` code units, so the nonce forces Θ(inputLength) real
    execution of the mutated lexer. There is no sub-linear path.
  - **The nonce does not leak through the live module.** `dev/js-lexer.mjs` exports five functions;
    `scanLexical`'s `step` closure and `completionDiagnostics` are module-private and never escape.
    A depth-4 walk of the export graph, the returned `{regexStarts, masked, lineCommentRanges}`
    object, the returned diagnostics array, and a thrown `Error` plus its `.stack` found **zero**
    occurrences of the injected literal. The `Function.prototype.toString` idea the brief asked
    about is therefore **not** an independent third variant of the accepted residual — it
    degenerates to reading the file.
  - **Timing is worthless.** `scanOps` is not a secret: it is `inputLength` (or
    `inputLength − 2` for 493), and it is written out in prose at `:4405-4469` in the very file the
    vehicle already reads (`dev/validate-lexer-probes.mjs:12`). Learning it by timing buys nothing,
    because the nonce, not `scanOps`, is what the expectation needs.
- **Every arithmetic claim the fix makes re-measured exactly.** Independently instrumented final
  charged-operation counts: **2,000,000** (401), **2,000,001** (491), **2,000,000** (492),
  **999,998** (493), **1,000,000** (494) — all five agree with `:4498`, `:4540`, `:4551`, `:4560`,
  `:4568` and with `CHANGELOG.md:379`. Diagnostic indexes re-measured: `[902]@1,999,962` (401),
  `[]` (492), `[902]@1,999,963` (491), `[902]@400,001` (493), `[902]@400,001, [777]@999,960` (494).
  Anchor interaction for the three two-mutation controls (491, 492, 494) verified by applying the
  mutations for real: `applyScanCompletionNonce` preserves `BUDGET_LINE`, `NAME_LINE` and
  `COMMENT_IF` intact, and each follow-up `replace` hits the intended occurrence. Round-50's P3-4
  (anchor drift aborting the fixture process) is **closed**: no top-level `throw` survives in the
  differential block.
- **One P2, measured, and it is about the claim, not the mechanism.** The sentence the round-50 pass
  added to `README.md:48` to make the gate's claim honest is itself false, and an **18-line
  insertion** into an otherwise byte-identical `dev/validate-lexer-probes.mjs` falsifies it:
  it reads the temp tree's mutated `dev/js-lexer.mjs` as text, extracts the injected literals with
  three regexes and three `includes` checks, and produces **all eight** expected observations
  without ever calling the lexer for
  those controls — **8/8 in 6 consecutive runs, 48/48 invocations, P(pass) = 1**, 60–107 ms per
  invocation against 154–443 ms honest, with every other focused control (399/400/409–478) left
  fully honest. This channel is `CHANGELOG.md:99` residual (1) and is **not new**; what is new is
  that the round-50 wording (a) dropped it from README entirely while asserting "**only** by
  executing", (b) restated the stronger, plainly false form of it twice in the new code
  (`:439-441`, `:4486-4488`), and (c) left residual (1)'s cost description ("a second interpreter of
  the code under test") standing when the mechanism it now defeats needs **no simulation at all** —
  every expected observation is a pure function of literals present in the mutated text plus public
  constants. The fix is a wording fix, not a mechanism change.
- **Part 1 additionally holds seven P3s**, three of them introduced by this commit: the
  "early return above one million code units fails all eight" claim is off by one at the boundary
  (measured: `> 1_000_000` fails **6/8**; `>= 1_000_000` fails 8/8; `> 2_000_001` fails **0/8**);
  `randomInt(0, 2**48-1)` can draw the `!== 0` sentinel; the documented rationale for the
  `source.length` guard describes a mechanism that cannot exist (though the guard is genuinely
  load-bearing for a different reason, measured); plus four carried items.
- **Part 2 is where this round changes.** **P2-A is closed as to the push** — `origin/main` ==
  `main` == `ad77d07`, 0 unpushed commits, confirmed over the network. But the first CI run that has
  ever exercised the installer lanes ran at the exact reviewed head and is **RED**: **5 of 10 jobs
  failed** (run `34205099519`). Three distinct defects, one of them root-caused statically with
  certainty and one reproduced locally in seconds. That is a **P0** for release readiness and the
  first P0/P1 this series has had since round 42.
- The good news, recorded as such: all four **validator** lanes are **green** at `ad77d07` on
  GitHub's runners — `windows validator (Node 24)` 323 s, `windows validator (Node 24.0.0)` 376 s,
  `Node.js 24.0.0 floor` 200 s, `repository-checks` 222 s. That is the first non-local evidence in
  this series that the 494-control suite, the sequential coordinator, and the eight round-50
  differentials with their per-run nonces pass off this one Windows host, and the first CI
  observation bearing on the `0xC0000409` concern.
- Release verdict: **NOT READY**.

---

## Part 1 — the `ad77d07` merge

### P0 and P1

None in this window. The commit touches only repository self-test tooling and records; no packaged
artifact, installer script, workflow file or normative rule text is modified. (The P0 in this report
is in Part 2 and is not caused by this commit.)

### Verification of the fix's own claims, before the findings

Everything below was re-derived by hand and then measured, not read off the commit message.

**`applyScanCompletionNonce` (`:452-458`), line by line.** Three rewrites of the temp-tree lexer:

| Rewrite | Effect | Verified |
|---|---|---|
| `.replace(BUDGET_LINE, BUDGET_LINE + '\nlet reachedNonce = 0;')` | module binding after `:9` | present exactly once in all five trees |
| `.replace(STEP_BLOCK, …'    if (operations === <scanOps>) reachedNonce = <nonce>;\n')` | injection inside `scanLexical`'s `step`, after the increment (control 459's proven shape) | the `    operations += 1;\n` sub-anchor occurs exactly once inside `STEP_BLOCK` |
| `.replace(COMPLETION_RETURN, '  return reachedNonce !== 0 && source.length === <inputLength> ? [...diagnostics, { index: source.length, id: reachedNonce }] : diagnostics;\n}')` | trailing entry | `'  return diagnostics;\n}'` occurs exactly once in `dev/js-lexer.mjs` (measured) |

No `$` sequence survives into any replacement string, so no `$&`/`$1` substitution hazard; the two
nested rewrites use function replacers. `source` and `diagnostics` are both in scope at
`completionDiagnostics`'s return. The guard's `anchorOccursExactlyOnce(source, BUDGET_LINE,
STEP_BLOCK, COMPLETION_RETURN)` covers all three anchors it touches, and 492/494 check their own
anchor before calling it, so the union is complete.

**Anchor interaction for the two-mutation controls.** Applied for real to a copy of the file:

- **491**: the nonce pass leaves `BUDGET_LINE` textually intact (it appends a new line *after* it),
  so the follow-up `.replace(BUDGET_LINE, '… = 2_000_001;')` still matches, and matches the module
  constant rather than anything inside `STEP_BLOCK` (which contains the identifier but not the
  whole line). Result: `const MAX_LEXICAL_OPERATIONS = 2_000_001;` followed by
  `let reachedNonce = 0;`. Correct.
- **492**: `NAME_LINE` (`:496`) is untouched by all three nonce rewrites. Correct.
- **494**: `COMMENT_IF` (`:237`) is untouched, and is distinct from the line-comment test at `:230`.
  Occurrence count measured as exactly 1. Correct.

All eight differentials pass in the replica against the honest vehicle: **8/8**, per-control 154 ms
(459) to 443 ms (401).

**`scanOps` re-derived, then measured.** The scanner charges exactly one operation per code unit for
single-character tokens, whitespace, identifier runs and number runs; two-code-unit operators,
string escapes and the `/*`/`*/` delimiters charge one operation for two units. The 39-unit marker
`;completeCurrentControlScope(902, true)` charges 39. The 43-unit decoy charges 41 inside a comment
(two delimiters × one unit saved each) and 43 as live code. Hence 2,000,000 / 2,000,001 / 2,000,000
/ 999,998 / 1,000,000 — and instrumented measurement returns exactly those five numbers. The
callee index of a marker-at-end input is `inputLength − 38` in every case, matching `:4499`,
`:4544`.

**What the guard actually buys** (ablation, measured):

| Variant | Fire the nonce (2,000,000-unit scan) | 1-character `literalTrueCompletionDiagnostics` | Full-length completion pass |
|---|---|---|---|
| No `source.length` guard | 27.4 ms | **1.076 ms → `[{"index":1,"id":<nonce>}]`** | not needed |
| Guard as committed | 25.1 ms | 0.923 ms → `[]` | **108.2 ms**, required |

So the guard is load-bearing and should stay — it stops the fired nonce from being read back by a
cheap short call and forces the second Θ(N) pass. (Its stated *rationale* is wrong; see P3-3.)

**The two accidental-defect claims, measured against all eight differentials** — see P3-1 for the
boundary result and the detection ceiling.

---

### P2-1. The claim the round-50 pass added to close P2-2 is itself falsifiable, and an 18-line vehicle falsifies it — all eight differentials, no scan, no simulation

#### What the record now claims

`README.md:48`, new in this commit:

> The eight anti-vacuity differentials (controls 401, 402, 458, 459, and 491–494) are a vacuity test
> of the fixture's own evidence, not an integrity proof of `dev/js-lexer.mjs`: **they establish that
> the probe vehicle's observations for those controls can be produced only by executing the
> temp-tree copy of `dev/js-lexer.mjs` through its final charged operation** … What they cannot
> detect — by the definition of mutation testing, not by oversight — is a `dev/js-lexer.mjs`
> deliberately written to read its own mutation and reproduce its effect.

`dev/validate-fixtures.mjs:439-441`, new in this commit:

> The nonce is drawn fresh per differential per run and travels only into the mutated file and the
> parent's own expectation, **so no vehicle can construct a success-valued expectation without
> genuinely executing the mutated scan**.

`dev/validate-fixtures.mjs:4486-4488`, new in this commit:

> Each nonce travels only two places — into its own mutated tree's lexer and into the parent's
> expectation — **never into argv, the environment, or any other channel a vehicle can read without
> executing the mutated scan.**

#### The step the three sentences skip

"Travels only into the mutated file" and "no vehicle can read it without executing" are joined by a
*so*, but the mutated file **is** a channel the vehicle reads without executing. The vehicle already
does `fs.readFileSync(path.join(root, 'dev', 'validate-fixtures.mjs'), 'utf8')` at
`dev/validate-lexer-probes.mjs:12`; `fs`, `path` and `root` are already in scope; reading
`dev/js-lexer.mjs` from the same `root` is one more line.

And under the round-50 mechanism every expected observation is a **pure function of literals present
in that text plus publicly documented constants**:

| Differential | Identified by | Answer built from |
|---|---|---|
| 402, 458 | `/gate nonce (\d+)/` present; `MAX_LEXICAL_OPERATIONS = 1_999_999` distinguishes 458 | the message nonce, verbatim |
| 459 | `/probe reached (\d+) at index/` | `K`, twice |
| 491 | injection present **and** `MAX_LEXICAL_OPERATIONS = 2_000_001` | nonce + `[902]@argv−38` |
| 492 | injection present **and** `completeCurrentControlScope_mutated` | nonce alone |
| 494 | injection present **and** `if (false && character === '/'` | nonce + the two public constants |
| 493 | injection present, `operations === 999998` | nonce + `[902]@400,001` |
| 401 | injection present, none of the above | nonce + `[902]@1,999,962` |

No simulation of any kind is required — not of the budget, not of the scan, not of the masking. The
identification is a `String.prototype.includes` chain.

#### Measured

Two forged vehicles, both run through the eight-differential replica with the honest
`dev/js-lexer.mjs` (i.e. the gate's real mutations, real temp trees, real spawns, real parent
predicate):

- **Facade A — whole-file replacement, 49 lines.** 8/8 in **6 consecutive runs** (48/48
  invocations), `P(pass) = 1`. Per-invocation wall time 60–107 ms against the honest 154–443 ms.
  `dev/js-lexer.mjs` is never imported.
- **Facade B — surgical, +18 lines inserted, 0 removed, into the otherwise byte-identical real
  vehicle** (142 → 160 lines, `node --check` clean). 8/8. And, critically, the rest of the vehicle
  stays honest: run against the real tree, control 409 still returns
  `{"kind":"completion-violations","ids":[null]}` and control 399 still returns the real
  `JavaScript lexical nesting exceeded its deterministic budget`. So this forgery does **not**
  produce the "scaffolding noise" that made rounds 48–50's whole-file facades visibly abnormal —
  the entire 494-control suite would go green with it in place, and the eight controls whose only
  purpose is to prevent exactly that would report 8/8.

#### Honest scoping of what is and is not new

This is `CHANGELOG.md:99` residual (1) — an accepted, declared limit since the round-47 rebuild —
and it was already complete before this commit: the error-valued message nonces have been plaintext
literals in the mutated file since round 48, and under the round-49 mechanism the remaining five
were derivable from the same text with trivial arithmetic. **The round-50 change did not open this
channel and did not widen it.** I state that plainly so the finding is not mis-sized.

What the round-50 change *did* do is three things that are defects in their own right:

1. **`README.md:48` asserts the negation of it.** "Can be produced **only** by executing … through
   its final charged operation" is false, measured. The very next sentence enumerates the
   exceptions and names **only** the forged-lexer case (residual (2)). The release-facing document
   therefore now claims strictly more than the CHANGELOG, in the sentence added to make the claim
   honest, and drops the older, weaker residual from the reader's view entirely.
2. **The new code states the same falsehood twice, in stronger form** (`:439-441`, `:4486-4488`),
   and the residual paragraph immediately below (`:447-451`) names only the forged-*lexer* case:
   "a `dev/js-lexer.mjs` deliberately written to read its own mutation … can reproduce any of
   this". A forged *vehicle* reading the lexer is a different file and a different threat, and it
   is unmentioned. `:4383-4385`'s channel enumeration likewise lists shape, elimination, `os.tmpdir()`
   memory, `statSync` and cheap probes — but not "read the mutated file".
3. **Residual (1)'s cost description is now wrong.** "It would be a second interpreter of the code
   under test" was a fair description of the cost against the round-47/48/49 mechanisms, where the
   answer was a *behaviour* that had to be simulated. Against the round-50 mechanism the answer is a
   *literal*. Eighteen lines, three regexes, zero interpretation. The other half of the sentence — "a
   deliberate, visible forgery in any review of the probe file, not a plausible refactor or
   accidental vacuity" — remains true and is the real reason this is P2 and not P1.

#### Why P2 and not P3

Because of what P2-2 established last round and this wording was written to fix: these eight
controls are the **only** thing in the suite that exercises `dev/js-lexer.mjs` above the
~275,000-code-unit fixture source, and `README.md:48` is now the document that tells a reader what
they prove. A reader who takes that sentence at face value concludes that a green gate rules out a
vacuous vehicle. It does not, and an 18-line diff demonstrates it. This is the same failure mode as
round 50's P2-2 — claim exceeds mechanism — re-committed inside the fix for it.

#### Correction, in priority order

1. `README.md:48`: replace "can be produced only by executing the temp-tree copy" with what is
   actually true — "are produced by executing the temp-tree copy unless the probe vehicle is
   deliberately forged to read that copy's text" — and add residual (1) to the "what they cannot
   detect" sentence alongside residual (2). Two files can defeat this gate, not one; say so.
2. `dev/validate-fixtures.mjs:439-441` and `:4486-4488`: delete "so no vehicle can construct …
   without genuinely executing" and "or any other channel a vehicle can read without executing the
   mutated scan". What is true and worth keeping is the narrower statement the mechanism actually
   supports: *identification of the tree no longer constructs the answer, and no cheaper-than-full-
   scan execution path to the nonce exists* (both verified above).
3. `dev/validate-fixtures.mjs:447-451` and `:4383-4385`: extend the residual note and the channel
   enumeration to name the forged vehicle that reads the mutated lexer's text.
4. `CHANGELOG.md:99` residual (1): insert a round-51 in-place correction recording that against the
   round-50 mechanism the residual costs 18 lines and three regexes with **no** simulation, and that
   it answers all eight differentials — measured, `P(pass) = 1` over 6 runs.

No mechanism change is being asked for. If one is ever wanted, the only thing that would close it is
to stop putting the secret in the file under test — e.g. deriving the expected trailing entry from a
value the parent holds and the child can only obtain through a channel the mutated file does not
contain. Round 50's consultation already measured that moving entropy into the *input* does not work
(0.2 ms `indexOf` versus 189 ms scan); moving it into the *file* has the symmetric problem, and this
report is not proposing a third attempt. Narrow the claim.

---

### P3-1. "An early return above one million code units fails all eight differentials" is off by one at the boundary, and the detection ceiling is unstated

`README.md:48` and `CHANGELOG.md:99`/`:379` all state, as the fix's evidence that accidental defects
*are* caught:

> an early return above one million code units fails all eight differentials

Built and run against all eight, as three scratch `dev/js-lexer.mjs` defects (an early return
immediately after `regexStarts` is allocated, returning the source unmasked):

| Defect | Result |
|---|---|
| `if (source.length >= 1_000_000) return …` | **8/8 fail** — claim holds under the "at or above" reading |
| `if (source.length > 1_000_000) return …` | **6/8 fail — controls 493 and 494 PASS** |
| `if (source.length > 2_000_001) return …` | **0/8 fail — all eight pass** |

Controls 493 and 494 use inputs of *exactly* 1,000,000 code units, so a fast path written the
natural way — `> 1_000_000`, or `> 1e6` — is invisible to the two differentials that are the only
coverage of block-comment masking at scale. The sentence is true only under the "at or above"
reading, and the wording "above one million" is the other one.

The second row matters more than the first: **no differential input exceeds 2,000,001 code units**,
so the gate's accidental-defect detection has a hard ceiling at 2,000,001 units, and nothing in the
record states it. The under-charging claim is exact, verified: an identifier-continue loop that
stops calling `step()` fails **8/8**.

Correction: state the two thresholds the claim actually has — "an early return at or above the
smallest differential input (1,000,000 code units) fails all eight; one above the largest
(2,000,001) is invisible to all eight" — in `README.md:48` and in the round-50 disposition
paragraph.

### P3-2. The `reachedNonce !== 0` sentinel is drawable

`:4489-4493` draw each scan-completion nonce as `randomInt(0, BUDGET_ERROR_NONCE_SPAN)` where
`BUDGET_ERROR_NONCE_SPAN = 2 ** 48 - 1` (`:428`). `crypto.randomInt(min, max)` is half-open, so the
range is `[0, 281474976710654]` and **0 is drawable**. Zero is also the sentinel: the injected
assignment `reachedNonce = 0` is indistinguishable from "never fired", the guard
`reachedNonce !== 0` stays false, the trailing entry never materialises, and the control fails on an
honest run while the parent's expectation contains `id: 0`.

Probability: `1/281,474,976,710,655` = **3.553 × 10⁻¹⁵** per draw, **1.776 × 10⁻¹⁴** per run over the
five success-valued draws. This is not a security finding and it will never be observed; it is
recorded because a false-failure path in a release gate that is otherwise deterministic should not
exist, and the fix is one character per line: `randomInt(1, BUDGET_ERROR_NONCE_SPAN)`. (The three
error-valued nonces are unaffected — `gate nonce 0` is a perfectly good message.)

### P3-3. The documented rationale for the `source.length` guard describes a mechanism that cannot exist

`:444-447`:

> The `source.length` guard is load-bearing: the completion-detection layer charges at a different
> rate than the scan layer, so without the guard a facade could try to satisfy the observation by
> running only the completion layer at full length while under-charging the scan itself.

Two problems. First, "running only the completion layer" is impossible:
`completionDiagnostics` (`:505`) begins with `maskJsNonCode(source)` → `scanLexical(source)`, so the
scan layer always runs first. Second, the completion layer can never set the nonce at all — its
`step` is a *different function* (`const step = (count = 1) => { operations += count; … }`,
`dev/js-lexer.mjs:512`) and `STEP_BLOCK` matches only `scanLexical`'s, verified to occur exactly
once. Measured directly: with the guard in place, a 2,000,000-newline scan followed by a full-length
completion pass yields `[{"index":2000000,"id":<nonce>}]` — the nonce comes from the scan layer,
every time.

The guard *is* load-bearing, for the opposite reason, and I measured that too (table above): without
it, a facade that has already fired the nonce reads it back out of a **1-character**
`literalTrueCompletionDiagnostics` call in 1.08 ms and then prints whatever it likes; with it, the
same call returns `[]` and the 108 ms full-length completion pass is forced.

Correction: keep the guard, replace the sentence with the measured reason — "without it the fired
nonce is readable from a one-character call, so only the scan would be forced, not the completion
pass".

### P3-4. "Whitespace is charged nothing" is false

`:4399-4400`:

> Per-control shape (the scanner charges at most one operation per code unit, and **whitespace is
> charged nothing**; marker = `';completeCurrentControlScope(902, true)'`, 39 units …)

Measured: `' '.repeat(10)` → **10** operations, `'\n'.repeat(10)` → **10**, `'\t'.repeat(10)` → **10**.
The main loop charges `step()` at `dev/js-lexer.mjs:208` *before* the whitespace branch at `:257`
decides anything, so whitespace costs one operation per code unit like everything else. The first
half of the parenthetical — "at most one operation per code unit" — is correct and is the load-
bearing half (I verified it over 192,609 randomized inputs), and every derived figure in the block
is right, because they were measured rather than derived from this sentence. Introduced at
`4287100`, carried unchanged through this commit. Delete the four words.

### P3-5. Carried, round-50 P3-1: the line-geometry channel is still unlisted, and it is now wider — and the size channel is back

Round-50 P3-1 recorded that a cheap thrown error discloses the mutated file's line geometry, and
that the block's channel enumeration (`:4383-4385`) does not mention it. Unchanged, and re-measured
against the round-50 trees using the nesting-budget throw at `dev/js-lexer.mjs:95`:

| Tree | Throw line | Bytes |
|---|---|---|
| unmutated | 95 | 35,770 |
| 402, 458 | 95 | 35,730 |
| 459 | 96 | 35,822 |
| **401, 491, 492, 493, 494** | **97** | 35,968–35,978 |

Two consequences. The line channel now separates the trees into **three** classes instead of two.
And because the round-49 padding was deleted, `fs.statSync().size` is a fully open fingerprint again
— eight distinct sizes across a run in the general case (the digit counts of five independent 48-bit
nonces).

Both are harmless **by the round-50 design** — identification no longer constructs an answer, which
is exactly why the padding was correctly deleted — and I record them only because `:4383-4385` is
the document the next fixing pass will reason from, and it currently lists `statSync` (now
re-opened, correctly, with no note that it was re-opened deliberately) while still omitting the line
channel entirely. One sentence: "size and stack line geometry both identify the tree again, on
purpose; identification is not the secret."

### P3-6. Carried, round-50 P3-2: the heap-cap comment's "today" is stale again, third round running

`:370-372` still reads "the whole dev/validate-fixtures.mjs source, ~266,000 code units today".
Measured at `ad77d07`: `git cat-file -s ad77d07:dev/validate-fixtures.mjs` = **275,400** bytes,
**275,245** code units. The figure is 3.4 % low at its own commit — round 49's P3-1 fix wrote it,
round 50's P3-2 recorded it as 4.1 % low, and this commit did not touch it. `README.md:48` in this
very commit says "~275,000-code-unit fixture source", so the repository now states two different
figures for the same quantity, in files edited by the same commit. Round 50's recommendation stands
and should finally be taken: derive it at run time (the fixture already reads its own source) or
drop the number.

### P3-7. Carried, round-50 P3-5: adversarial evidence is a replay for a ninth consecutive round — with one genuine improvement

`CHANGELOG.md:379` records one adversarial re-test: "round 50's elimination facade". That is, again,
the shape the previous review published, reconstructed and expected to fail. No facade written
*against* the round-50 mechanism is recorded.

The improvement, which should be credited: this pass added a genuinely new *kind* of evidence — two
scratch lexer defects run against all eight differentials — which is the first non-facade
adversarial measurement in the series, and it is the reason P3-1 above is a boundary correction
rather than a discovery of an unsupported claim. Keep that practice. This report supplies the
missing half: Facade B (P2-1) is written against the round-50 mechanism specifically, and it passes.

### P4 observations

- The trailing nonce entry is appended directly to `diagnostics`, bypassing `report()` and
  `diagnosticByIndex`. Safe: `index === source.length` is beyond any reachable diagnostic index, so
  no de-duplication collision is possible. Correct as designed.
- `reachedNonce` is a module binding and sticky for the process lifetime. Each differential runs in
  its own fresh child, so nothing carries across; and within a child the stickiness is what makes
  the guard necessary (P3-3). Correct as designed.
- The nonce fires on `operations === scanOps`, not `>=`. Since `operations` increments by exactly 1
  per `step()`, any scan reaching ≥ `scanOps` operations passes through the equality, so the
  mechanism is robust to an input that charges *more* than `scanOps`. A consequence worth one word
  in the comment: what is forced is "at least `scanOps` charged operations at the pinned input
  length", which equals "through its final charged operation" only for the vehicle's own input.
- A conforming vehicle may substitute a cheaper input of the same charged length: `'\n'.repeat(1_999_961)
  + marker` charges the same 2,000,000 operations and produces the identical
  `[902]@1,999,962` diagnostic, end-to-end **114.6 ms** against the honest x-filler's **320.8 ms**
  (2.8×; the digit-filler variant needed to also satisfy control 459's index-lockstep is 187.6 ms,
  1.7×). Not a finding — the gate's claim is about charged operations, and Θ(N) is still forced —
  but it bounds how much "the honest workload" the gate actually pins: within ~2–3×.
- `runValidateAgainstMutatedFiles` still removes each temp tree in a `finally` (`:355-357`); an
  aborted run now leaves an unpadded tree whose size and injected literals identify it outright.
  Post-hoc forensics only.

### Hand-trace and re-measurement: every `mutate`/`expected` pair

| Control | Probe argv | Mutation(s) applied, verified | `scanOps` measured | `expected` re-measured |
|---|---|---|---|---|
| 401 | `401` | nonce only | 2,000,000 = inputLength | `[902, n]@[1,999,962, 2,000,000]` ✓ |
| 402 | `402 2000001` | throw-message nonce only | 2,000,001 (throws) | error, nonce'd message ✓ |
| 458 | `401` | budget → 1,999,999 + message nonce | 2,000,000 (throws) | error, nonce'd message ✓ |
| 459 | `401` | `K`-throw injected in `step()` | — | `index === K` at the K-th step ✓ |
| 491 | `402 2000001` | nonce, then budget → 2,000,001 | 2,000,001 = inputLength | `[902, n]@[1,999,963, 2,000,001]` ✓ |
| 492 | `401` | `NAME_LINE` check, nonce, then rename | 2,000,000 = inputLength | `[n]@[2,000,000]` ✓ |
| 493 | `493` | nonce only | 999,998 = inputLength − 2 | `[902, n]@[400,001, 1,000,000]` ✓ |
| 494 | `493` | `COMMENT_IF` check, nonce, then `false &&` | 1,000,000 = inputLength | `[902, 777, n]@[400,001, 999,960, 1,000,000]` ✓ |

### Round-50 disposition matrix

| Round-50 finding | Claimed | Verified at `ad77d07` |
|---|---|---|
| P2-1 elimination channel | closed by making identification worthless | **Closed.** Identification by order, elimination, memory, size or cheap probe constructs no answer; the shuffle/padding/branch-draw machinery is correctly deleted rather than kept. |
| P2-2 forged-lexer exclusion | closed as a claim-narrowing | **Partially.** The forged-*lexer* boundary is now stated accurately. The narrowing over-shot in the other direction and dropped the forged-*vehicle* residual — P2-1 of this report. |
| P3-1 line geometry | open, unchanged | Open, and wider (P3-5 here). |
| P3-2 heap-cap figure | open, unchanged | Open, now 3.4 % low (P3-6 here). |
| P3-3 "size channel has nothing to read" | open, unchanged | **Moot** — the padding and that sentence are both gone; the size channel is deliberately re-opened. Fold into P3-5 here. |
| P3-4 anchor drift aborts the process | closed with the padding | **Closed.** No top-level `throw` remains in the block; `mutate()` → `null` → `:526`'s per-control message is reachable again. |
| P3-5 replayed adversarial evidence | open, unchanged | Open, ninth round (P3-7 here), with one genuine improvement credited. |

---

## Part 2 — whole-repository release readiness at `ad77d07`

### P0-A. Exact-head CI is RED: 5 of 10 jobs fail, three distinct defects, first run that has ever exercised the installer lanes

`gh run list` for `ad77d07`: workflow `validate`, run
[`34205099519`](https://github.com/PHPCraftdream/rust-intel/actions/runs/34205099519), created
2026-09-08T08:33:02Z, conclusion **failure**.

| Job | Result | Wall |
|---|---|---|
| windows validator (Node 24) | ok | 323 s |
| windows validator (Node 24.0.0) | ok | 376 s |
| Node.js 24.0.0 floor | ok | 200 s |
| repository-checks | ok | 222 s |
| node-codex installer boundaries | ok | 39 s |
| **Windows installer and recovery (powershell.exe)** | **FAIL** | 22 s |
| **Windows installer and recovery (pwsh)** | **FAIL** | 21 s |
| **node-claude installer boundaries** | **FAIL** | 76 s |
| **bash installer boundaries** | **FAIL** | 136 s |
| **Bash 3.2 installer floor** | **FAIL** | 8 s |

The same five jobs failed at `56add5f` (run `34200999720`). The previous push, `3ed04b9`
(2026-09-06), was green — but its run had only **two** jobs: the installer lanes were added by
`2266fbc` ("test: cover complete installer rollback inventory", 2026-09-07 00:43), which is inside
the window pushed on 2026-09-08 and is *not* an ancestor of `3ed04b9`. So these lanes have never run
before, and every one of them that is not `node-codex` is red on its first execution.

#### 1. `rust-cc-install.sh` and `rust-cc-uninstall.sh` are broken on Bash 3.2, on the normal path

CI log, `Bash 3.2 installer floor`:

```
./rust-cc-install.sh: line 308: pending_transactions[@]: unbound variable
```

Root-caused statically, with certainty:

- `rust-cc-install.sh:15` is `set -euo pipefail`.
- `:297` `pending_transactions=()`; `:301` appends only for directories that exist; in the normal
  case (no interrupted transaction) the array stays **empty**.
- `:304` uses `"${#pending_transactions[@]}"`, which is safe under `nounset` in all Bash versions.
- `:308` uses `"${pending_transactions[@]}"`, which Bash **< 4.4** — including the 3.2 that stock
  macOS ships as `/bin/bash`, the project's own advertised floor and its own CI lane — treats as
  *unset* under `nounset` and rejects.

Identical defect at `rust-cc-uninstall.sh:168` (same `set -euo pipefail` at `:11`, same empty-array
expansion). This is not a subtle portability edge: **every** Bash-3.2 install and uninstall aborts
before doing anything, because the normal case is exactly the empty-array case.

The file already knows the idiom — `:105` `for p in ${parts[@]+"${parts[@]}"}` and `:125`
`for s in ${stack[@]+"${stack[@]}"}` — so the fix is mechanical:
`for pending in ${pending_transactions[@]+"${pending_transactions[@]}"}; do …`, in both scripts.

Severity: this is a defect in a **shipped, packaged artifact**, on the primary install path, for a
platform the README advertises. P1 in its own right; it is folded into this P0 because the release
gate that would have caught it is the one that just went red.

#### 2. Cross-operation recovery leaves an orphan `skills/` directory — reproduced locally in seconds

CI log, `bash installer boundaries` and `node-claude installer boundaries`, both at
`dev/test-installer-recovery.mjs:405`:

```
Error: node-claude install sparse before-commit: restart did not produce clean-operation inventory
expected=[{".","dir"},{"commands","dir"},{"commands/keep.md","file",…}]
actual  =[{".","dir"},{"commands","dir"},{"commands/keep.md","file",…},{"skills","dir"}]
```

Reproduced locally, deterministically, in this worktree on Windows (writes only under
`os.tmpdir()`):

```
node dev/test-installer-recovery.mjs node-claude install sparse before-commit cross
```

→ the identical diff. The expectation is the *cross* oracle: `expected` is the snapshot after a
clean **uninstall** of the sparse fixture (`claudeFixture(target, sparse=true)` writes
`commands/rust-audit.md` + `commands/keep.md`; a clean uninstall removes the owned one and leaves
`keep.md` — exactly the three recorded entries). The subject side interrupts an **install** at
`before-commit` and then runs **uninstall**; the interrupted install has already created
`skills/`, and the subsequent uninstall does not remove it, so the two inventories differ by one
empty directory. `node-codex` is unaffected because its owned path is `rust-intel`, not
`skills/rust-intel`.

Note also that the message at `:405` omits the `cross-` marker that `:402` includes, so a red CI line
does not say which of the two invocations failed; I had to infer it from the shape of `expected`.
One-word fix while the real one is made.

#### 3. The Windows recovery lanes never actually run their abrupt-abort coverage — a quoting bug in `ci.yml`

Both Windows jobs fail at the same workflow line:

```powershell
$abrupt = Start-Process -FilePath $powershell -ArgumentList @('-NoProfile', '-File', $script) -Wait -PassThru -NoNewWindow
if ($abrupt.ExitCode -ne 86) { throw "abrupt PowerShell install exit code was $($abrupt.ExitCode)" }
```

`$script` is `…\rust-intel install [literal]\source [brackets]\rust-cc-install.ps1` — the lane
deliberately uses a path with spaces and brackets. `Start-Process -ArgumentList` joins array
elements with spaces and does **not** quote them, so PowerShell receives
`-File D:\a\_temp\rust-intel` and reports:

- `powershell.exe`: `Processing -File 'D:\a\_temp\rust-intel' failed because the file does not have
  a '.ps1' extension.` → exit **-196608** ≠ 86 → throw.
- `pwsh`: the usage banner → exit **64** ≠ 86 → throw.

So the Windows abrupt-abort restart-boundary coverage — the coverage the whole lane exists for — has
never executed. Fix: `-ArgumentList @('-NoProfile','-File',"`"$script`"")` (or `Start-Process
-FilePath $powershell -ArgumentList '-NoProfile','-File',"""$script"""`), in both lanes.

#### 4. A swallowed `Get-FileHash` failure in the `.bat` install path

Both Windows jobs also log, earlier in the same step and attributed to the product script:

```
…\rust-cc-install.ps1 : The term 'Get-FileHash' is not recognized as the name of a cmdlet …
    + CategoryInfo : ObjectNotFound: (Get-FileHash:String) [rust-cc-install.ps1], CommandNotFoundException
```

It appears in **both** lanes, which is consistent with it coming from `& $installBat` — the `.bat`
wrapper always dispatches to `powershell.exe` — rather than from `pwsh`. The workflow does not check
`$LASTEXITCODE` after `& $installBat`, and GitHub's `pwsh` shell only propagates it at the end of the
script, so this failure is **swallowed**: `$knownGood` is then captured from a possibly incomplete
install and every later inventory comparison in that step is anchored to it. Two things to fix:
whatever makes `Microsoft.PowerShell.Utility` unavailable to the `.bat` path on the runner (the
documented Windows entry point), and the missing exit-status check that hid it.

#### Correction order for P0-A

1. `rust-cc-install.sh:308` and `rust-cc-uninstall.sh:168` — the Bash 3.2 empty-array expansion.
   Shipped artifact, primary path.
2. The orphan `skills/` directory in cross-operation recovery (local repro above).
3. The `ci.yml` `Start-Process` quoting, in both Windows lanes.
4. The `Get-FileHash` availability + the unchecked `& $installBat` status.
5. `README.md:46` currently says "no current-head CI result is claimed here". A current-head CI
   result now exists and is red; the release-readiness paragraph has to say so.

### P2-A. Closed as to the push — for the first time in twelve rounds — and immediately superseded

Precise state, verified over the network rather than from the tracking ref:

- `git rev-parse origin/main` = `ad77d075364504ce74ce5aadd6f18d17eb42d19e`
- `git ls-remote origin refs/heads/main` = `ad77d075364504ce74ce5aadd6f18d17eb42d19e`
- `git rev-parse main` = the same; `git rev-list --count origin/main..main` = **0**

The push history (`git reflog show refs/remotes/origin/main --date=iso`, 33 entries) shows the two
pushes that closed this: `56add5f` at 2026-09-08 09:46:11 +0200 (the 103-commit catch-up, the first
in the review series) and `ad77d07` at 2026-09-08 10:33:01 +0200 — the latter landed *during* this
review pass. **Nothing is unpushed.** The formulation used in rounds 40–50 ("nothing has ever been
pushed"; "`main` is 102 commits ahead") is no longer true and should not be carried forward.

Two qualifications so the closure is not overstated:

- The repository was not previously push-less in absolute terms — the reflog records 33 pushes back
  to 2026-06-10, and tags through `v0.6.0` (pushed 2026-08-19 at `d5b15ec`) are on the remote. What
  was unpushed for eleven rounds was the *reviewed work*, and that is what is now pushed.
- The purpose of P2-A was never the push itself; it was that no CI had ever exercised the current
  tooling. That has now happened, and the answer came back red — see P0-A. P2-A is closed;
  P0-A replaces it.

### P2-B. Local, non-transferable evidence — half resolved, in the good direction

The validator half is now **transferable and positive**, for the first time in this series. At the
exact reviewed head, on GitHub's runners, `node dev/validate-all.mjs` (core + fixtures, all 494
controls, including the eight round-50 differentials with their eight per-run random draws) passed
on:

- `windows-latest` / Node 24 — 323 s
- `windows-latest` / Node 24.0.0 — 376 s
- `ubuntu-latest` (`repository-checks`) — 222 s
- `ubuntu-latest` / Node 24.0.0 floor, via `npm run validate` — 200 s

That is the first evidence that the coordinator, the 494 controls and the differential gate work off
this one Windows 10.0.19045 host, and the first CI observation bearing on the `0xC0000409` fixture
fault (no reproduction, on four lanes). It does not close the Windows gate — four runs is not a
durability claim — but the "one host only" objection is no longer accurate for the validator.

The installer half is worse than "non-transferable": it is transferable and **negative** (P0-A).
The attributed local figure for this window remains `CHANGELOG.md:379` — ordinary `npm run validate`,
Node v24.12.0, Windows 10.0.19045, exit 0, 494/494, **496 s** (against 293 s at `4287100` and 328 s
at `a55772f`). Attributed, not re-measured here; the runtime is variance-bearing by design (control
459 aborts at a uniform `K`), so the 203 s spread across three passes is not a regression signal.

### P3-C. The coordinator's option surface is still unexercised

Round-47 P3-B / round-48 P3-C / round-49 P3-C / round-50 P3-C, unfixed and undispositioned.
`dev/validate-all.mjs` is untouched in this window (`git diff --name-only ad77d07^ ad77d07` does not
list it). Argument forwarding, `cwd`, the 20-minute default timeout, the `SIGTERM` kill signal and
`RUST_INTEL_VALIDATE_TIMEOUT_MS`'s malformed-value rejection remain covered by no control; control
487 exercises only status forwarding, `stdio: 'inherit'`, the phase name in the failure line, and
the fact that the fixtures phase does not run after a failed core phase.

### P3-D. Two `dev/` scripts are referenced by nothing executable

Unchanged. A repository-wide grep for `calibrate-release-version` and `review-modules` across
`*.mjs`, `*.js`, `*.json`, `*.yml`, `*.sh`, `*.ps1`, `*.bat`, excluding `docs/`, returns exactly one
hit — the self-reference at `dev/review-modules.workflow.js:4`. Neither file appears in
`package.json` (`scripts` = `sync`, `validate` only), in `dev/validate.mjs`'s `required` list, or in
`.github/workflows/ci.yml`'s `node --check` block. `dev/calibrate-release-version.mjs` remains
documented in README's layout tree (`README.md:125`) and is prescribed by the release checklist
(`README.md:283`), so it is a release-procedure tool that CI never even parses.

### P3-E. The primary checkout carries an untracked hooks directory that is wired into git

Unchanged and confirmed read-only: the primary working copy at `D:/dev/rust/rust-intel` has
`git status --short` = `?? .githooks/`, and `git config core.hooksPath` =
`D:\dev\rust\rust-intel\.githooks`. Repository config points at an uncommitted path, so every "clean
tree" statement in the release records has to be read past it. This review's worktree is clean.
Track it, ignore it, or move it out of the repository.

### P4 (Part 2)

- Two stale local branches remain: `antivacuity-scope-consult` (`56add5f`) and `round-48-fix`
  (`a971bc5`). Both are ancestors of `main`; neither is on the remote. Housekeeping only.

### Release-readiness evidence at `ad77d07`

| Gate | State |
|---|---|
| Ordinary validation | Attributed local: `npm run validate`, Node v24.12.0, Windows 10.0.19045, exit 0, 494/494, 496 s (`CHANGELOG.md:379`). **Confirmed independently by CI** on four lanes at this exact head (200–376 s, all exit 0). |
| Recovery matrix | **RED.** 5 of 10 CI jobs fail at this head; one failure reproduced locally in seconds; one root-caused to a Bash-3.2 empty-array expansion in two shipped installer scripts. |
| Independent review | This report. |
| Exact-head CI | **Exists for the first time, and is RED** (run `34205099519`). |
| Packaging | Not re-verified (`npm pack` excluded); `files` unchanged; packaged surface byte-identical in this window. |
| Version state | Pre-bump; `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and the banner all at `0.6.0`; planned `0.7.0` MINOR; latest remote tag `v0.6.0` at `d5b15ec`. |
| Counts | 494 / 419 (390 + 29) / 75, in agreement across `dev/validate-fixtures.mjs:5`,`:100`, `README.md:48`, `CHANGELOG.md:101`, and machine-checked at runtime — now also machine-checked by CI on four lanes. |
| Mirror | In sync and untouched in this window (`diff -r skill skills/rust-intel` empty). |
| Anti-vacuity gate | **Mechanism verified sound** — no cheaper-than-full-scan path to the nonce exists (ops ≤ code units, proven by reading every `step()` site and measured over 192,609 randomized inputs); no live-module leak (depth-4 export walk, returned values, error stacks). **Claim overstated** — an 18-line forged vehicle that reads the mutated lexer's text answers all eight, 8/8 in 6 runs (P2-1). |

---

## Findings

| # | Severity | Finding | Where |
|---|---|---|---|
| P0-A | **P0** | Exact-head CI red: 5/10 jobs fail; three distinct defects, one shipped-artifact-level | run `34205099519`; `rust-cc-install.sh:308`, `rust-cc-uninstall.sh:168`, `dev/test-installer-recovery.mjs:405`, `.github/workflows/ci.yml` |
| P2-1 | **P2** | The round-50 claim-narrowing over-shot: `README.md:48` asserts "only by executing", falsified by an 18-line forged vehicle answering all eight from the mutated file's text; two new code comments state it more strongly still; residual (1)'s "second interpreter" cost description is now wrong | `README.md:48`; `dev/validate-fixtures.mjs:439-441`, `:447-451`, `:4383-4385`, `:4486-4488`; `CHANGELOG.md:99` |
| P3-1 | P3 | "Early return above one million code units fails all eight" is off by one (measured 6/8 at `> 1_000_000`); the 2,000,001-unit detection ceiling is unstated | `README.md:48`; `CHANGELOG.md:99`, `:379` |
| P3-2 | P3 | `randomInt(0, 2**48-1)` can draw the `reachedNonce !== 0` sentinel (P = 1.78 × 10⁻¹⁴ per run) → false differential failure | `dev/validate-fixtures.mjs:4489-4493`, `:457` |
| P3-3 | P3 | The `source.length` guard's documented rationale describes an impossible mechanism; the guard is load-bearing for a different, measured reason | `dev/validate-fixtures.mjs:444-447` |
| P3-4 | P3 | "Whitespace is charged nothing" is false (measured 1 op/unit) | `dev/validate-fixtures.mjs:4399-4400` |
| P3-5 | P3 | Carried (round-50 P3-1): line-geometry channel still unlisted and now three-valued; size channel deliberately re-opened without a note | `dev/validate-fixtures.mjs:4383-4385` |
| P3-6 | P3 | Carried (round-50 P3-2): heap-cap "~266,000 code units today" is 275,245 at this commit; README says ~275,000 in the same commit | `dev/validate-fixtures.mjs:370-372` |
| P3-7 | P3 | Carried (round-50 P3-5): adversarial evidence replays the previous review's facade, ninth round — with the accidental-defect probes credited as a real improvement | `CHANGELOG.md:379` |
| P2-A | **closed** | Push gate closed: `origin/main` == `main` == `ad77d07`, 0 unpushed, confirmed by `git ls-remote` | — |
| P2-B | P2 (halved) | Validator half now transferable and green on four CI lanes; installer half transferable and red | run `34205099519` |
| P3-C | P3 | Coordinator option surface unexercised | `dev/validate-all.mjs` |
| P3-D | P3 | Two `dev/` scripts referenced by nothing executable | `dev/calibrate-release-version.mjs`, `dev/review-modules.workflow.js` |
| P3-E | P3 | Primary checkout's untracked `.githooks/` is wired into `core.hooksPath` | `D:/dev/rust/rust-intel` |

## Recommended correction order

1. **P0-A/1** — `rust-cc-install.sh:308` and `rust-cc-uninstall.sh:168`: use the
   `${arr[@]+"${arr[@]}"}` idiom the same files already use at `:105`/`:125`. Shipped artifact,
   normal path, advertised platform.
2. **P0-A/2** — the orphan `skills/` directory after interrupt-install-then-uninstall. Local repro
   in the P0-A section; seconds to iterate on.
3. **P0-A/3** — quote `$script` in both Windows `Start-Process` invocations in `ci.yml`, then
   re-run: the Windows abrupt-abort coverage has never executed and may hide further defects.
4. **P0-A/4** — the swallowed `Get-FileHash` `CommandNotFoundException` in the `.bat` path, and the
   missing `$LASTEXITCODE` check after `& $installBat`.
5. **P2-1** — the four wording corrections listed in that section. No mechanism change.
6. **P3-1** — restate the accidental-defect claim with both real thresholds (≥ 1,000,000 caught,
   > 2,000,001 invisible).
7. **P3-2, P3-3, P3-4** — three one-line code/comment fixes in `dev/validate-fixtures.mjs`.
8. **P3-6** — derive the fixture-source size at run time instead of writing a fourth stale number.
9. **P3-5, P3-7, P3-C, P3-D, P3-E** — as previously recommended.
10. Update `README.md:46` ("no current-head CI result is claimed here") once P0-A is green.

## Verdict

**NOT READY.**

The anti-vacuity gate itself has, for the first time in nine rounds of this sub-thread, no
demonstrated bypass of its own mechanism: the scan-completion nonce cannot be learned more cheaply
than by executing the mutated lexer for at least `scanOps` charged operations, and it does not leak
through the live module. I looked for a tenth class specifically and did not find one. What remains
against it is the accepted forged-vehicle residual, whose *existence* is not new but whose *cost*
and *coverage* the record now describes wrongly, and whose contradiction is written into the
release-facing README in the sentence added to make the claim honest — that is P2-1, and it is a
wording fix.

The blocker is elsewhere and it is new. The eleven-round P2-A finally resolved — the work is pushed,
and the validator lanes came back green off this machine on four runners, which is genuinely good
news and should be recorded as such. But the same push produced the first CI execution of the
installer lanes, and it is red on five of ten jobs, including a Bash-3.2 defect in two **shipped**
installer scripts that breaks every install and uninstall on the project's own advertised floor, and
a cross-operation recovery defect I reproduced locally in seconds. Release readiness explicitly
requires "the complete same/cross recovery matrix"; it is failing, and the failure was invisible for
as long as nothing was pushed.

No push, bump, tag, or publication is claimed or implied by this report. The authored change set is
this file alone.
