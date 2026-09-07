# Round 46 review of the latest commits and v0.7.0 release readiness — 2026-09-07 18:26 CEST

## Scope and method

- Review base: `997f1f3` (round 45's report commit).
- Reviewed head: `1a9f1f85464e99c29385d5d6bfd009bb112b0646`.
- Commit window: `997f1f3..HEAD` — **one** commit, confirmed by `git log --oneline 997f1f3..HEAD`:
  `1a9f1f8` ("fix: address round 45 review findings"). Six changed files, `+274/−43`:
  `CHANGELOG.md`, `README.md`, `dev/validate-fixtures.mjs`, `dev/validate-lexer-probes.mjs`,
  `dev/validate.mjs`, `docs/reviews/README.md`.
- Whole-repo context: the reviewed head is **94 commits** ahead of `origin/main`
  (`git ls-remote origin refs/heads/main` = `3ed04b9`, unchanged since round 42). Nothing in this
  window, or in the 93 commits before it, has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, probe, coordinator,
  installer, build, or package command was executed. Every dynamic number below is attributed to
  its source (the commit body, the release records, rounds 42/44's measurements, or `gh run list`)
  and labelled as such; nothing is re-measured. All regex, arithmetic, slice-boundary and
  control-flow claims are hand-traced against the committed source and shown here.
- Method: `git log`/`show`/`diff`/`cat-file`/`ls-files -s`/`ls-remote`, direct file reads, read-only
  `gh run list`, hand-tracing of control 458's new callee-identity pin against `maskJsNonCode`'s
  documented masking behaviour, of the new same-child work-floor telemetry through
  `dev/validate-lexer-probes.mjs` and `dev/js-lexer.mjs`'s allocation and cache, of control 487's
  coordinator execution against `dev/validate-all.mjs`, of controls 488/489/490's mutations against
  the real coordinator and workflow text, of the rewritten phase-slice and `spawnSync` pins, and
  primary-source lookups for `process.memoryUsage().arrayBuffers`/`heapUsed` and
  `process.resourceUsage().maxRSS`.
- `skill/`, `skills/rust-intel/`, `commands/`, `bin/`, both plugin manifests, `package.json`,
  `dev/js-lexer.mjs`, `dev/validate-all.mjs`, both workflow files and every installer script are
  **byte-identical to the round-45 reviewed head**
  (`git diff --name-only 997f1f3..HEAD -- bin skill skills commands .claude-plugin .codex-plugin
  package.json rust-cc-*` is empty), so normative rule text was checked for release/mirror
  consistency only, not re-audited.
- Authored change set: this report file alone. As in rounds 43–45, the instruction for this round
  authorized exactly one new file, so the ledger row for round 46 remains outstanding work for the
  fixing pass — the same carry-forward the round-45 rows document.

## Executive result

- **No P0 and no P1 finding**, in either part.
- **Part 1 (commit window): two P2, four P3, eleven P4 observations.**
- **Part 2 (whole repository): two P2, three P3.** Part 1's P2-1, P2-2, P3-1 and P3-3 are also
  release-gate items and are cross-referenced rather than double-counted.
- **Round 45's P2-1 is genuinely and completely closed, and this is the strongest work in the
  window.** The heap floor is no longer a boundary sample over dead bytes: `scanMemory` is
  sampled at `dev/validate-lexer-probes.mjs:64`, on the statement immediately after the
  2,000,000-unit `observeLiteralTrueCompletion` returns and before the companion call at `:65`
  evicts the one-entry cache. The second signal is causal in a way the first never was: the
  scanner allocates `new Uint8Array(source.length)` (`dev/js-lexer.mjs:39`) and stores it in
  `lexicalCacheResult` (`:450-452`), so it is *reachable* at the sample and
  `process.memoryUsage().arrayBuffers` cannot shrink under collection. The two signals are OR'd
  (`dev/validate-fixtures.mjs:512-514`), so an aggressive Linux GC that flattens the heap ratio
  still passes on the delta. The absolute 100 MiB RSS floor is gone. The portability and flake
  risks round 45 rated P2 are both retired.
- **But the round's two headline defensive mechanisms each have a new, concrete bypass, and three
  release-facing records again assert closure that does not hold.** This is the fourth consecutive
  round in which the anti-vacuity closure prose exceeds what was verified.
  - **Control 458's callee-identity pin is defeated by an asymmetry inside the check itself.**
    `hasPinnedScannerImport` tests the **raw** source (`dev/validate-fixtures.mjs:4417`), while
    `scannerIdentityOccurrences` counts against the **masked** source (`:4418`). Putting the
    pinned import line inside a block comment satisfies the first (the raw line exists) and
    contributes zero to the second (`maskJsNonCode` blanks comment interiors,
    `dev/js-lexer.mjs:238-242`). A same-named module-scope wrapper then costs exactly two masked
    occurrences — its declaration and the anchored call — which is precisely what the pin
    requires. The exact facade class the commit says it closed still passes. Round-46 P2-1.
  - **The `dev/js-lexer.mjs`-internal fast path is not "closed structurally by the work floors".**
    The retained-array signal is satisfied by allocating and retaining one
    `new Uint8Array(source.length)` — which is what the comment at
    `dev/validate-fixtures.mjs:440-444` tells a forger to do. A length-gated fast path that
    allocates its own bitmap and returns the marker id recovered from the input tail passes both
    floors, control 457, control 458 and control 459, in about a millisecond.
    `CHANGELOG.md:269-272` ("an eliding fast path allocates neither signal"),
    `docs/reviews/README.md:83` and the commit body all state otherwise. Round-46 P3-1.
- **The fix also net-reduced the pinned surface of the file that produces the work proof.**
  `expectLexerProbe` no longer asserts `peakHeapSource` at all (the
  `=== 'terminal-boundary-sample'` assertion was deleted and not replaced with the new label), and
  none of control 458's ten `helperContract` patterns (`dev/validate-fixtures.mjs:4380-4391`)
  mentions `scanMemory`, `scanHeapSample`, `scanArrayBuffersSample` or `initialArrayBuffers`. The
  entire causal work proof now travels through five telemetry fields whose provenance no control
  inventories. Round-46 P2-2.
- **Round 45's P3-2/P3-3/P3-C are closed at the mechanism level, and the fix is a good one.**
  `docs/reviews/README.md:83` and `CHANGELOG.md:248-250` say "committed as the commit containing
  this row, on top of `997f1f3`" — true at authoring time, true after commit, and true forever
  without an amend. The round-44 rows now name `1ba3956` (`CHANGELOG.md:213`,
  `docs/reviews/README.md:81`). The 368 s and 344 s figures are now explicitly scoped to
  pre-final-edit trees with the reason stated (`CHANGELOG.md:238-243`, `README.md:48`). Three
  rounds of the same defect stop here.
- **Round 45's P3-4/P3-5 are substantially closed.** The `...phase.env` pin is anchored to the
  `spawnSync(` argument slice (`dev/validate.mjs:2188-2199`); the fixtures-arm slice is bounded at
  the phases array's `];` (`:2172-2178`); control 487 really does execute `dev/validate-all.mjs`;
  controls 488/489/490 are real negative controls and I hand-traced all three mutations against the
  live coordinator and workflow text — all three fire. What is missing is that the *two headline
  mechanisms of this very commit* — the work floors and the identity pin — got no negative control,
  while three lesser mechanisms did.
- **Nothing has been pushed and no CI run exists for any current lane.** `origin/main` is still
  `3ed04b9`; the newest recorded run remains `34019219895` (`validate`, success, 2 m 37 s,
  2026-09-06) at `3ed04b9`. This is the **seventh consecutive round** (40, 41, 42, 43, 44, 45, 46)
  to name it as the dominant blocker.
- All three manifests remain `0.6.0`, `engines.node` is `>=24.0.0`, no `v0.7.0` tag exists locally
  or remotely, the mirror is thirteen byte-identical files by blob hash, and no packaged path
  changed in this window. The `0.7.0` MINOR re-derivation was performed against `3ed04b9`, not
  against the released tag `v0.6.0`, where the packaged delta is 37 files and `+2448/−759`
  including the rule text (Part 2 P3-A).
- **Release verdict: NOT READY for `v0.7.0`.**

## Part 1 — findings on the commit window

### P0 and P1

None. No security-relevant surface, packaged artifact, installer behaviour, workflow definition, or
normative rule text changed in this window; the only executable changes are repository tooling
(`dev/validate.mjs`, `dev/validate-fixtures.mjs`, `dev/validate-lexer-probes.mjs`) and release
documentation.

### P2-1. Control 458's new callee-identity pin is bypassable: the import check reads raw source while the occurrence count reads masked source

Locations: `dev/validate-fixtures.mjs:4416-4419`, `:4429-4433`; `dev/js-lexer.mjs:232-242`,
`:460-469`; `dev/validate-lexer-observations.mjs:1-14`; `CHANGELOG.md:264-269`;
`docs/reviews/README.md:83`; commit body.

The pin is three lines:

```js
// dev/validate-fixtures.mjs:4416-4419
const pinnedScannerImportLine = "import { literalTrueCompletionDiagnostics } from './js-lexer.mjs';";
const hasPinnedScannerImport = observationModuleSource.split(/\r?\n/).some((line) => line === pinnedScannerImportLine);
const scannerIdentityOccurrences = [...observationModuleMasked.matchAll(/\bliteralTrueCompletionDiagnostics\b/gu)].length;
const hasPinnedScannerIdentity = hasPinnedScannerImport && scannerIdentityOccurrences === 2;
```

Line `:4417` reads `observationModuleSource` — the **raw** file. Line `:4418` reads
`observationModuleMasked` — the output of `maskJsNonCode`, which blanks comment and string
interiors while preserving offsets (`dev/js-lexer.mjs:232-233` for line comments, `:238-242` for
block comments, `:165-177` for string bodies). The two halves of the same pin therefore disagree
about whether a comment is source.

That disagreement is the bypass. Put the pinned line inside a block comment and it is
simultaneously *present* for `:4417` and *absent* for `:4418`:

```js
// dev/validate-lexer-observations.mjs, forged
/*
import { literalTrueCompletionDiagnostics } from './js-lexer.mjs';
*/
let retained = null;
function literalTrueCompletionDiagnostics(source) {          // masked occurrence 1
  retained = new Uint8Array(source.length);                  // satisfies the arrayBuffers floor
  const tail = source.slice(-64);
  const m = /;completeCurrentControlScope\((\d+), true\)$/u.exec(tail);
  if (m) return [{ id: Number(m[1]), index: source.length - m[0].length + 1 }];
  if (source === 'completeCurrentControlScope(901, true)') return [{ id: 901, index: 0 }];
  return [];
}
export function observeLiteralTrueCompletion(source) {
  const diagnostics = literalTrueCompletionDiagnostics(source);   // masked occurrence 2 — byte-identical anchor
  return {
    kind: 'diagnostics',
    inputLength: source.length,
    ids: diagnostics.map(({ id }) => id),
    indexes: diagnostics.map(({ index }) => index),
  };
}
```

Trace against every gate at this head:

- `hasPinnedScannerImport` — `observationModuleSource.split(/\r?\n/)` yields the commented line as
  its own array element, exactly equal to `pinnedScannerImportLine`. **True.**
- `scannerIdentityOccurrences` — the commented copy is blanked to spaces in
  `observationModuleMasked`; the function declaration is one match, the anchored call is one
  match. **Exactly 2.** So `hasPinnedScannerIdentity` is true.
- `hasUnguardedFirstStatementScannerCall` (`:4407`) — the anchored statement is byte-identical and
  the preamble is `"\n  "`. **True.**
- Control 458's companion assertion (`:4421`, `:4425`) — the forged callee answers the 38-byte
  companion input with `{ids:[901], indexes:[0]}`. **Passes.**
- Control 401's semantic oracle — id and index are recovered from the input tail, which round 45
  already established is possible and this commit's own comment (`dev/validate-lexer-probes.mjs:50-52`)
  now concedes. **Passes.**
- Control 401's work floors — `retained` holds a live 2,000,000-byte `Uint8Array` at the
  `scanMemory` sample (`dev/validate-lexer-probes.mjs:64`), so
  `scanArrayBuffersSample − initialArrayBuffers ≈ 2,000,000 ≥ 1,000,000`. The OR at
  `dev/validate-fixtures.mjs:512-514` is satisfied by the delta alone; the heap ratio never has to
  pass. **Passes.**
- Control 459 (`:4443-4459`) — its mutation replaces the anchored line with
  `const diagnostics = [];`, after which the facade is never called, `ids` is `[]`, the child exits
  1, and `facadeWouldPass` is false. Control 459 **passes** while the facade goes unnoticed, exactly
  as in round 45.
- Control 457 (`:4358-4369`) — reads `dev/js-lexer.mjs`, untouched. **Passes.**
- `dev/validate.mjs` — the observation module appears only in the `required` existence list
  (`:31`) and as a `node --check` needle for the workflow (`:2151`); the forged module is
  syntactically valid. **Passes.**

Cost of the bypass over the facade round 45 demonstrated: three added lines (the comment fence, the
`retained` binding, the allocation). The commit body's claim — "closing the module-scope wrapper
bypass" — and `CHANGELOG.md:264-269`'s "This rejects the module-scope wrapper facade the review
demonstrated" are true only of the *specific* wrapper that keeps a live `as`-aliased import; the
wrapper class is not closed.

Two smaller weaknesses in the same pin, both subsumed by the fix below:

- The count `=== 2` is a coincidence of the current file, not a structural claim. A legitimate
  future edit that mentions the identifier a third time in live code (a second call site, a
  re-export, a `typeof` guard) fails the control with a message that reads like tampering.
- The raw-line comparison is byte-exact, so a formatting change as small as a trailing space or a
  CRLF-vs-LF mismatch inside a mixed-ending file fails it. `split(/\r?\n/)` handles CRLF, so this
  is narrow, but the failure message would say "callee identity pin" for a whitespace defect.

Correction: derive `hasPinnedScannerImport` from `observationModuleMasked` rather than
`observationModuleSource` — masking preserves offsets, so line splitting is unaffected and a
commented-out import becomes a run of spaces that cannot equal the pinned line. Then add the
structural half the count is standing in for: assert that the masked module contains no
`(?:function|const|let|var|class)\s+literalTrueCompletionDiagnostics\b`, and no
`\bliteralTrueCompletionDiagnostics\s+as\b` / `\bas\s+literalTrueCompletionDiagnostics\b` rebinding.
That is a claim about bindings rather than about a total, and it does not break on a legitimate
third mention.

### P2-2. The work floors' entire input is unpinned telemetry, and the fix deleted the one telemetry-provenance assertion that existed

Locations: `dev/validate-lexer-probes.mjs:64`, `:66`, `:122-125`, `:138-161`;
`dev/validate-fixtures.mjs:490-500`, `:509-517`, `:4380-4391`.

Before `1a9f1f8`, `expectLexerProbe` asserted `telemetry.peakHeapSource === 'terminal-boundary-sample'`
— a cheap but real claim that the child had produced the sample by the documented route. That line
is deleted. The child now emits `peakHeapSource: 'sampled-around-scan-and-terminal'`
(`dev/validate-lexer-probes.mjs:158`) and **no control reads it**. In its place the parent consumes
five new fields:

```js
// dev/validate-fixtures.mjs:490-500
? telemetry.scanHeapSample / telemetry.initialHeapUsed
? telemetry.scanArrayBuffersSample - telemetry.initialArrayBuffers
```

Control 458 is the mechanism that exists to keep `dev/validate-lexer-probes.mjs` honest. Its ten
`helperContract` patterns (`:4380-4391`) pin the argv parse, the safe-integer guard, the marker
template, the filler arithmetic, both `observeLiteralTrueCompletion` call sites, the JSON emit,
`terminalSample: true` and `source: 'child'`. **Not one of them mentions `scanMemory`,
`companionMemory`, `scanHeapSample`, `scanArrayBuffersSample` or `initialArrayBuffers`.** Nothing
anywhere asserts that `scanMemory` is assigned from `process.memoryUsage()` on the statement
following the large scan, and nothing asserts it is assigned at all.

So the load-bearing anti-vacuity signal of round 46 is produced by unpinned source in the very file
control 458 was built to inventory. One line —

```js
scanMemory = { ...process.memoryUsage(), arrayBuffers: initialMemory.arrayBuffers + 2_000_000 };
```

— makes both floors vacuous with every control still green, and the diff for it is smaller than
the diff for the facade in P2-1. This is a net regression in pinning posture introduced by the same
commit that made the signal causal: the fix improved *what* is measured and simultaneously removed
the only guarantee about *who* measured it.

The parent-side guards fail closed on absence — if `scanHeapSample` or `scanArrayBuffersSample` is
missing or non-integral, the corresponding value is `null`, and with both `null` the OR at `:512-514`
is false — so this is a forgery gap, not a soundness gap. That is the same distinction round 45 drew
for P3-1, and it did not make that finding smaller.

Correction: add three `helperContract` patterns pinning `scanMemory = process.memoryUsage();`,
`companionMemory = process.memoryUsage();`, and the three telemetry expressions
(`scanHeapSample: scanMemory ? scanMemory.heapUsed : null`, `scanArrayBuffersSample: …`,
`initialArrayBuffers: initialMemory.arrayBuffers`); re-assert
`telemetry.peakHeapSource === 'sampled-around-scan-and-terminal'` in `expectLexerProbe`; and, to
pin ordering rather than presence, require the masked probe source to contain
`observeLiteralTrueCompletion('x'.repeat(fillerLength) + marker);` immediately followed by the
`scanMemory` assignment.

### P3-1. The `dev/js-lexer.mjs`-internal fast path is not closed by the work floors, and three records say it is

Locations: `dev/validate-fixtures.mjs:431-446`; `dev/js-lexer.mjs:37-39`, `:450-452`;
`CHANGELOG.md:269-272`; `docs/reviews/README.md:83`; commit body.

The claim under review, verbatim from `CHANGELOG.md:269-272`:

> The length-gated fast-path vector inside `dev/js-lexer.mjs` itself is covered structurally by
> control 401's work floors — an eliding fast path allocates neither signal — rather than by a
> brittle source pattern.

The premise is false as stated. The retained-array signal is defined by the comment at
`dev/validate-fixtures.mjs:440-444` as "the scanner retains a source.length-byte regex-start bitmap
in its one-entry cache, so `process.memoryUsage().arrayBuffers` must grow by at least half the
2,000,000-unit input". An eliding fast path inside the same module reproduces that in one
statement:

```js
// dev/js-lexer.mjs, forged fast path inside literalTrueCompletionDiagnostics
if (source.length === 2_000_000) {
  const m = /;completeCurrentControlScope\((\d+), true\)$/u.exec(source.slice(-64));
  if (m) {
    lexicalCacheSource = source;
    lexicalCacheResult = { regexStarts: new Uint8Array(source.length), masked: source, lineCommentRanges: [] };
    return [{ id: Number(m[1]), index: source.length - m[0].length + 1 }];
  }
}
```

`new Uint8Array(2_000_000)` is a single calloc; `source.slice(-64)` plus one anchored regex is
microseconds. Against the gates: the delta floor sees ≈2,000,000 and passes on its own; control 401's
semantic oracle sees the recovered id and index and passes; control 457 (`:4358-4369`) inspects only
the module prelude for `new Map()` and the two `let lexicalCache*` declarations and passes; control
458 never opens `dev/js-lexer.mjs`; control 402 uses 2,000,001 units and control 399/400 use other
lengths, so no length collides with the gate. The 32 MiB RSS tripwire is below Node 24's own
baseline RSS and cannot discriminate (see P4). Nothing objects.

The code comment two lines above the floors is more honest than the release records: "Neither
signal defeats an author who deliberately pads memory inside a forged callee, which is why control
458 pins callee identity independently" (`:445-446`). That is a defensible line to draw — the
project's threat model is a maintainer or model quietly hollowing out a control, not a determined
adversary — but the two-layer argument is circular where it matters. Memory padding is deferred to
control 458; control 458 does not reach `dev/js-lexer.mjs`; the `dev/js-lexer.mjs` vector is
deferred back to the floors. The intersection is exactly the case above, and it is unguarded.

I rate this P3 rather than P2 because the vector requires editing a third file that the change is
not about, whereas P2-1's does not. What makes it a finding rather than an accepted residual is the
prose: `CHANGELOG.md:272-274` also says "Closure prose in this changelog, the ledger, and the code
comments is narrowed to what was actually tested", and the allocating variant was, by the commit
body's own account, not among the reconstructions tested.

Correction: either state the residual honestly in all three records ("closed against a
non-allocating fast path; an allocating one is out of the threat model, as the code comment already
says"), or close it cheaply with a signal a fast path cannot fake — for example, have the probe
also report `process.hrtime.bigint()` around the scan and require the large scan to cost at least
some multiple of the companion scan in the same child. Elapsed time is currently and deliberately
excluded (`dev/validate-fixtures.mjs:4095-4096`), so that would be a policy change, not a tweak;
the prose fix is the cheaper and more honest option.

### P3-2. Control 487 proves less than the records claim: the one exit status it exercises is also the coordinator's fallback

Locations: `dev/validate-fixtures.mjs:4521-4545`; `dev/validate-all.mjs:42-60`;
`CHANGELOG.md:274-279`; `docs/reviews/README.md:83`.

Round 45's P3-4/P3-B asked for a control that actually runs the coordinator. It exists now, and I
verified it is well-formed: `validateInputs` (`dev/validate-fixtures.mjs:269-308`) copies both
`dev/validate-all.mjs` and `bin/`, so the temp coordinator resolves `../bin/node-version.js`; the
mutation prepends `process.exit(1);` after the shebang of `dev/validate.mjs`, which does start with
`#!/usr/bin/env node`; the coordinator's core phase spawns it, gets status 1, prints
`[validate-all] phase=core failed: exit status 1` (`dev/validate-all.mjs:53-56`) and exits. The
control's four assertions hold. It is a real execution and it closes the "never executed" half of
the finding.

What it does not prove, against the claim "asserting the exit-status mapping" (`docs/reviews/README.md:83`)
and "asserting the exit-status mapping (status 1)" (`CHANGELOG.md:276-278`):

- The coordinator's mapping is
  `process.exit(status !== null && status > 0 && status < 256 ? status : 1)`
  (`dev/validate-all.mjs:57`). The mutation makes the child exit **1**, which is also the
  expression's fallback. Replacing the whole expression with a literal `process.exit(1)` leaves
  control 487 green. The one value chosen is the one value that cannot discriminate. Using `3`
  (and asserting `result.status === 3`) would have proven forwarding at identical cost.
- `stdio: 'inherit'` (`:45`) remains unexercised. The mutated child writes nothing, so switching
  `'inherit'` to `'ignore'` or `'pipe'` changes nothing the control observes — the two matched
  needles both come from the coordinator's own `console.error`, not from the child.
- Argument forwarding (`...process.argv.slice(2)`, `:43`), `cwd: root` (`:44`), `timeout` and
  `killSignal` (`:46-47`) are still unexercised, as round 45 listed them.
- `!result.output.includes('phase=fixtures')` is weak. On a regression where the coordinator
  continued, the fixtures phase would run for minutes and the string would not appear before the
  control's 60 s timeout expired; the control would then fail through the `executionFailure`
  branch with a diagnostic that says the child failed to execute rather than that the coordinator
  did not stop. Asserting the absence of `[validate-all] phase=core passed` would be direct.

Correction: change the mutation to `process.exit(3);`, assert `result.status === 3` and
`output.includes('exit status 3')`, and add a second mutation variant that writes a sentinel to
stdout before exiting so the `stdio: 'inherit'` contract is covered by the same control.

### P3-3. The round's two headline mechanisms have no negative control, while three lesser ones got one each

Locations: `dev/validate-fixtures.mjs:431-448`, `:4416-4419`, `:4527-4544`, `:4548-4567`,
`:4571-4584`, `:4590-4597`.

`1a9f1f8` acts on round 45's P3-5 by adding controls 488 (reversed phase order), 489 (under-set lane
timeout) and 490 (workflow-level `RUST_INTEL_VALIDATE_TIMEOUT_MS`). I hand-traced all three
mutations and all three fire — see the static-verification record. That is real closure for the
three mechanisms round 45 named.

But the commit's own two new enforcement mechanisms are in the same position those three were:

| New mechanism in `1a9f1f8` | Location | Negative control |
|---|---|---|
| Scan-heap ratio floor (3×) | `:447`, `:512-514` | none |
| Retained-arrayBuffers delta floor (1,000,000) | `:448`, `:512-514` | none |
| Callee-identity pin (verbatim import) | `:4416-4417` | none |
| Callee-identity pin (occurrences === 2) | `:4418` | none |
| `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` parse/reject | `:457-464` | none |
| Bounded fixtures-arm phase slice | `dev/validate.mjs:2172-2178` | none (488 exercises order, not the bound) |
| `spawnSync`-anchored env pin | `dev/validate.mjs:2188-2199` | control 486 (pre-existing; unchanged mutation) |

The commit body says both bypasses were "independently re-reconstructed and confirmed caught by the
orchestrator after merging". That is a manual, unrecorded, one-time check of exactly the kind the
485/486/487/488/489/490 pattern exists to replace: the next edit to `dev/validate-fixtures.mjs:512-514`
or `:4416-4419` has nothing standing behind it. Given that P2-1 shows the identity pin does *not*
catch the wrapper class, the absence of an automated negative control is also why the manual check
could report success on one instance and miss the class.

Round 44's P4 about the execution-split check (`dev/validate-fixtures.mjs:4609-4627`) having no
negative control is also unchanged, so the count of unexercised enforcement mechanisms went from
four to at least seven.

Correction: add a negative control that mutates `dev/validate-lexer-observations.mjs` into the P2-1
facade shape and requires the fixture run to fail; add a second that mutates only
`dev/validate-lexer-probes.mjs`'s `scanMemory` assignment away and requires control 401 to fail on
the work floors. Both are single-file mutations through the existing
`runValidateAgainstMutatedFiles` machinery.

### P3-4. The new `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` knob is undocumented where every other knob is documented, and accepts a value that disables the tripwire

Locations: `dev/validate-fixtures.mjs:449-464`; `README.md:93-95`; `CHANGELOG.md:262-264`.

```js
// dev/validate-fixtures.mjs:456-464
const control401PeakRssFloorDefaultMb = 32;
const control401PeakRssFloorRaw = process.env.RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB;
let control401PeakRssFloor = control401PeakRssFloorDefaultMb * 1024 * 1024;
if (control401PeakRssFloorRaw !== undefined) {
  if (!/^[1-9]\d*$/u.test(control401PeakRssFloorRaw)) {
    failures.push(`RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB must be a positive integer in MiB; got ${JSON.stringify(control401PeakRssFloorRaw)}`);
  } else {
    control401PeakRssFloor = Number(control401PeakRssFloorRaw) * 1024 * 1024;
  }
}
```

Two problems, neither fatal on its own:

- `0` is rejected by `/^[1-9]\d*$/u`, which is the case the round's instruction asked about and the
  code handles correctly and loudly. But `1` is accepted, and `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB=1`
  silently reduces the tripwire to 1 MiB — below any conceivable Node process — with no record in
  the output that an override was in effect. The failure message interpolates the floor
  (`:521`), but only on failure; a passing run says nothing. Since the RSS assertion is explicitly
  demoted to "a conservative tripwire, not the gate" (`:449-450`), the practical blast radius is
  small — but the override is the one knob in this file that can only ever weaken a check, and it
  is unattributed in the passing path.
- The knob is not documented in `README.md`. The repository's established pattern is the tooling
  paragraph at `README.md:95`, which documents `RUST_INTEL_SKIP_NESTED_FIXTURES` and
  `RUST_INTEL_VALIDATE_TIMEOUT_MS` (both added there by round 43's fixing pass precisely as a
  P3-2/P3-3/P3-C correction), with `RUST_INTEL_POWERSHELL_EXECUTABLE` at `:93`. The new knob
  appears only in `CHANGELOG.md:262-264`, `docs/reviews/README.md:83`, and the code. A knob that
  exists to let a host relax a release-gating floor is exactly the kind a reader needs to find from
  the README.

Correction: document the knob in `README.md:95` alongside the other two; require a floor on the
floor (reject values below, say, 16) or echo the effective floor into the passing progress line so
an override is visible in the log; and add the malformed-value path to a negative control, since it
is currently the only `RUST_INTEL_*` parse in the fixture file with no coverage.

### P4 observations

- **The determinism comment round 45 asked to correct is unchanged.**
  `dev/validate-fixtures.mjs:4095-4096` still reads "These controls use deterministic
  exception/result oracles; elapsed time is intentionally not part of the assertion", five lines
  above a control whose expected id derives from `Date.now()` (`:417-419`) and whose pass condition
  is two allocation floors plus an RSS tripwire (`:4101-4103`). Round-45 P4, and item 8 of round
  45's correction order; not done.
- **The arrayBuffers floor cannot be enabled independently of the heap-ratio floor.** The whole
  work-floor clause is guarded by `scanHeapRatioFloor <= 0` (`:515`). Setting
  `scanHeapRatioFloor: 0` while leaving `scanArrayBuffersDeltaFloor: 1_000_000` disables *both*
  signals silently. Given that the delta is the stronger, GC-immune half, the enable condition is
  attached to the weaker one.
- **The 32 MiB RSS tripwire is below the child's own baseline and therefore discriminates nothing.**
  The comment concedes "a scan-eliding facade grows ~2 MB over the child's baseline" (`:454-455`).
  A Node 24 process's baseline RSS is comfortably above 32 MiB on both win32 and `ubuntu-latest`,
  so the tripwire is satisfied by a child that does no work at all. As a portability-safe
  liveness check that is fine and honestly labelled; as anything else it is decorative.
- **The delta signal's "GC-immune" property depends on an unpinned implementation detail.**
  `arrayBuffers` cannot shrink only because `regexStarts` is a member of the object stored in
  `lexicalCacheResult` (`dev/js-lexer.mjs:450-452`). Control 457 (`:4358-4369`) pins that the cache
  is a bounded one-entry cache — the two `let lexicalCache*` declarations and the absence of
  `new Map()` — but not that `regexStarts` is part of the cached result. A future change to cache
  only `{ masked }` would silently return the delta to GC-timing dependence, which is round 45's
  P2-1 defect class reintroduced without any check noticing.
- **Control 489's mutation anchor is positional.** It takes the first `    timeout-minutes: 50`
  at or after `  node-floor:` (`dev/validate-fixtures.mjs:4576-4581`). Today that is
  `.github/workflows/ci.yml:309`, correctly. If `node-floor`'s timeout were removed or moved below
  its `steps:` block, the mutation would silently retarget a later job or return `null`, and
  `expectFixture`'s `skipped` branch reports "required trigger-table anchor was not found"
  (`:708`) — a message that has nothing to do with this control.
- **Control 490 hard-codes a policy that a comment naming the knob is an error.** That was round
  45's P4 about `dev/validate.mjs:2227-2231`'s whole-file `includes`. The behaviour is now
  deliberate and documented at `dev/validate-fixtures.mjs:4587-4589` ("including as a comment,
  since the ban is a deliberate whole-file content check"), which closes the "undocumented"
  half — but it also means the knob can never be mentioned in either workflow, including in a note
  explaining why it must not be set.
- **The `spawnSync` env pin still inspects only the first `spawnSync(`.**
  `dev/validate.mjs:2188` takes `coordinatorSource.indexOf('spawnSync(')`. Today the coordinator
  has exactly one call site (`dev/validate-all.mjs:43`) and `stripJsComments` (`dev/validate.mjs:129`)
  removes comments before the search, so the anchor is correct; a second `spawnSync(` added above
  the phase loop would leave the real one unchecked. The comment's stated invariant — "The options
  object closes with `});` and contains no nested `});` of its own" — I verified holds at
  `dev/validate-all.mjs:43-49`.
- **`CHANGELOG.md:99` was not updated to match `README.md:48`'s new telemetry wording.** The README
  now says focused children return "heap/RSS telemetry sampled around the scan (with a terminal
  sample)"; the changelog's Net tooling state still says they "emit child-owned heap/RSS telemetry
  only with a terminal JSON sample". Both are true of the current code, but only the README
  describes the change this commit made.
- **`README.md:48` still summarizes three coordinator runs where there were two.** "The ordinary
  Windows coordinator has passed … in three runs against `49dd4f0`", followed by an enumeration of
  two `npm run validate` runs and one fixture-only run. Round-45 P4, unchanged.
- **Round-44/45 P4 carry-overs, all re-verified unchanged at this head:** the workflow run-step
  scanner's conservatism (`dev/validate.mjs:2091-2094`); `fs.existsSync` case-insensitivity on NTFS
  (`:2131`); the `validateInputs` coupling documented by instance rather than by rule
  (`dev/validate-fixtures.mjs:269-278`); the execution-split check without a negative control
  (`:4609-4627`); `dev/validate-lexer-observations.mjs:1` still calling the module "Pure semantic
  observations" while `literalTrueCompletionDiagnostics` writes the module-level lexical cache; the
  dead `spawnOptions.script === 'dev/validate-fixtures.mjs'` branch (`:313-315`) — still dead, since
  control 487 passes `'dev/validate-all.mjs'` and control 459 passes `'dev/validate-lexer-probes.mjs'`;
  `childSpawnsPending` declared `let` and only mutated in place (`:179`); `CHANGELOG.md:97` carrying
  the 484/409/75 historical split; the flat five-minute job-timeout margin (`dev/validate.mjs:2211`)
  with `publish` at exactly the computed minimum; and the `windows-install-smoke` pwsh-leg name
  overstating its coverage (`.github/workflows/ci.yml:333`, `:379`, `:407`).
- `1a9f1f8` has a full descriptive body with per-finding disposition, an explicit
  not-pushed/not-tagged statement, and — new and worth crediting — explicit attribution of which
  findings the orchestrator verified before delegating. The continuing defect is that the body
  states outcomes ("closed structurally") for reconstructions that were not run.

## Round-45 closure matrix

| Round-45 item | Disposition at `1a9f1f8` | Evidence |
|---|---|---|
| P2-1: control 401's work-was-done floors gate on a non-deterministic, single-host-calibrated quantity | **Closed.** | `peakHeapUsed` is no longer the assertion; the assertion is `scanHeapSample / initialHeapUsed >= 3` **or** `scanArrayBuffersSample − initialArrayBuffers >= 1_000_000` (`dev/validate-fixtures.mjs:490-500`, `:512-514`). `scanMemory` is sampled on the statement after the large scan (`dev/validate-lexer-probes.mjs:63-64`), before the companion call evicts the cache (`dev/js-lexer.mjs:38`, `:450-452`). The delta is over a *reachable* 2,000,000-byte `Uint8Array`, so it cannot shrink under GC; the OR means an aggressive Linux collector that flattens the ratio still passes. The 100 MiB absolute RSS floor is replaced by a 32 MiB tripwire (`:456`). Both the flake risk and the portability risk are retired. |
| P3-1: anti-vacuity gate narrower but open; "unknowable from source" claim false | **Claim withdrawn; gate re-opened by two new bypasses.** | The false claim is genuinely retracted in code (`dev/validate-fixtures.mjs:410-416`, `dev/validate-lexer-probes.mjs:50-54`) and records (`CHANGELOG.md:266-268`). The callee-identity pin was added (`:4416-4419`) — but its raw-vs-masked asymmetry admits a commented-out pinned import plus a same-named wrapper (round-46 P2-1), and the `dev/js-lexer.mjs` vector is not closed by the floors because an allocating fast path satisfies the delta (round-46 P3-1). Additionally the work signal's own provenance is unpinned (round-46 P2-2). |
| P3-2: round-44 fixing records describe themselves as uncommitted | **Closed, at the mechanism level.** | `CHANGELOG.md:213` and `docs/reviews/README.md:81` now read "Committed as `1ba3956` on top of `c9a37cb`". The round-45 rows use SHA-agnostic phrasing — "committed as the commit containing this row, on top of `997f1f3`" (`CHANGELOG.md:248-250`, `docs/reviews/README.md:83`) — which is true before and after the commit exists and needs no amend. Three consecutive rounds of this defect end here. |
| P3-3: fresh Windows evidence has no SHA and cannot be the committed tree | **Substantially closed.** | `CHANGELOG.md:238-243` now states the 368 s run was taken "immediately before its final documentation edits", names the three validator-input files that differ, and explains why (they are copied into every validator child). `README.md:48` mirrors it. The new 344 s / 490/490 figure is scoped the same way (`CHANGELOG.md:286-289`). Still not a SHA, and still unverifiable statically — but the under-specification round 45 objected to is now an explicit, mechanically-explained scope rather than a silent one. |
| P3-4: coordinator pins still textual, coordinator never executed | **Closed for execution and the env anchor; partially for the rest.** | The env pin is now bounded to the `spawnSync(` → `});` slice (`dev/validate.mjs:2188-2199`); the fixtures-arm slice is bounded at the phases array's `];` (`:2172-2178`) — I traced that `name: '` occurs nowhere after `name: 'fixtures',` in the comment-stripped coordinator and that the first `];` after it is the array terminator; control 487 executes the coordinator (`dev/validate-fixtures.mjs:4527-4544`). Phase *count*, argument forwarding, `cwd`, `stdio`, `timeout`/`killSignal` and the status-forwarding branch remain unexercised — round-46 P3-2. |
| P3-5: three new enforcement mechanisms have no negative control | **Closed for the three named; re-opened for the four introduced by this commit.** | Controls 488, 489, 490 added and hand-traced (see the verification record); all three fire. The work floors, the identity pin, the RSS knob's parse and the bounded fixtures slice have none — round-46 P3-3. |
| P4: control 401's oracle comment still claims determinism | **Open, unchanged.** | `dev/validate-fixtures.mjs:4095-4096`. |
| P4: control-401 failure not reproducible from the log | **Closed.** | `:519-521` now interpolates `control401MarkerId` plus both work-floor values and their floors into the failure message. |
| P4: `peakRssSource` mislabelled when `maxRSS === 0` | **Closed.** | `dev/validate-lexer-probes.mjs:141` now requires `usage.maxRSS > 0` before labelling the source `'process.resourceUsage.maxRSS'`. |
| P4: flat five-minute job-timeout margin | **Open, unchanged.** | `dev/validate.mjs:2211`; lanes 50/50/50/45 against the computed 45. |
| P4: `RUST_INTEL_VALIDATE_TIMEOUT_MS` ban is a whole-file `includes` | **Documented as intentional.** | `dev/validate-fixtures.mjs:4587-4589`, control 490. Behaviour unchanged; the undocumented-intent half is closed. |
| P4: `README.md:48` counts three coordinator runs | **Open, unchanged.** | `README.md:48`. |
| P4 carry-overs (run-step scanner, NTFS `existsSync`, `validateInputs` rule, execution-split control, "Pure semantic observations", dead script branch, `childSpawnsPending`, `CHANGELOG.md:97`) | **All open, unchanged.** | Cited individually in the P4 list above. |
| Part 2 P2-A: no CI run has ever exercised current tooling | **Open, unchanged (seventh consecutive round).** | `git ls-remote origin refs/heads/main` = `3ed04b9`; `git rev-list --count 3ed04b9..HEAD` = 94; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| Part 2 P2-B: behavioural gates rest on local, non-transferable evidence | **Partially addressed; substantively open.** | Provenance prose is materially better (P3-3 above). The Windows gate still has no CI run and no SHA-attributed measurement; the anti-vacuity gate's residual is now round-46 P2-1/P2-2/P3-1. |
| Part 2 P3-A: `0.7.0` MINOR not re-derived against the packaged delta | **Partially closed.** | `CHANGELOG.md:15` re-derives explicitly and names `bin/install-transaction.js` and `230ef59`. But the base is `3ed04b9` (the last CI'd commit), not the released tag `v0.6.0`: `git diff --stat v0.6.0^{}..HEAD` over the packaged paths is 37 files, `+2448/−759`, including `bin/node-version.js` (new) and ~2,000 lines of rule text across `skill/` and `skills/rust-intel/`. Round-46 P3-A. |
| Part 2 P3-B: coordinator is an unexecuted release entrypoint | **Closed for execution.** | Control 487 runs `dev/validate-all.mjs` end to end. Coverage narrowness is round-46 P3-2. |
| Part 2 P3-C: release-facing self-description defects persist by mechanism | **Closed for the authoring mechanism; a different overstatement recurs.** | The SHA-agnostic row phrasing removes the structural cause. But `CHANGELOG.md:269-272` and `docs/reviews/README.md:83` assert the `dev/js-lexer.mjs` fast path is "covered structurally by the work floors" and that control 458 "rejects the module-scope wrapper facade" — neither holds (round-46 P2-1, P3-1). The class of defect moved from provenance to closure scope. |

### Hand-trace: the callee-identity pin, character by character

**Raw vs masked.** `observationModuleSource` is the file as read
(`dev/validate-fixtures.mjs:4392`). `observationModuleMasked = maskJsNonCode(observationModuleSource)`
(`:4400`). `maskJsNonCode` returns `scanLexical(source).masked` (`dev/js-lexer.mjs:460-462`), and
`scanLexical` writes `0x20` into the masked buffer for every non-line-terminator character of a line
comment (`:232-233`) or block comment (`:238-242`), preserving offsets. So for any file, the masked
image of a commented region is spaces plus the original line terminators.

**Consequence for `:4417`.** `observationModuleSource.split(/\r?\n/)` operates on the raw image, in
which a commented line is still its own element and still byte-equal to the pinned string when the
comment fence is on adjacent lines. `some(...)` therefore returns `true`.

**Consequence for `:4418`.** `observationModuleMasked.matchAll(/\bliteralTrueCompletionDiagnostics\b/gu)`
sees spaces where that line was, contributing zero matches. The two live occurrences in the facade —
the module-scope `function` declaration and the anchored call — total exactly 2.

**Consequence for `:4419`.** `hasPinnedScannerIdentity = true && (2 === 2)` = `true`.

Every other conjunct of control 458's `passed` (`:4422-4427`) is unaffected by the facade: the ten
`helperContract` patterns test `lexerProbeSource`, not the observation module (`:4422`);
`hasUnguardedFirstStatementScannerCall` tests the anchor, which is byte-identical (`:4423`); the
companion JSON is answered by the facade (`:4425`); `violations` and the free-form-sentence check
read `lexerProbeSource` (`:4426-4427`). Control 458 passes.

### Hand-trace: the work floors against a genuine scan and against the facade

**Genuine.** `scanLexical` allocates `regexStarts = new Uint8Array(source.length)`
(`dev/js-lexer.mjs:38`) — 2,000,000 bytes for control 401's input — and stores it in
`lexicalCacheResult` at `:450-452`, which the module-level cache (`:14-15`) keeps alive until the
companion scan overwrites it at `:37`. `dev/validate-lexer-probes.mjs:64` samples between those two
events, so the bitmap is reachable. Per Node's documentation, `arrayBuffers` "refers to memory
allocated for ArrayBuffers and SharedArrayBuffers, including all Node.js Buffers" and is included in
`external`; a typed array's backing store therefore counts, and `heapUsed` does not include it. The
recorded genuine delta of 1,954,792 (`CHANGELOG.md:259-262`) is consistent with a 2,000,000-byte
backing store net of a small freed baseline buffer, and clears the 1,000,000 floor by ~2×.

**Facade (P2-1 / P3-1 shape).** One `new Uint8Array(source.length)` held in any live binding produces
the same ≈2,000,000 delta at the same sample. The OR at `dev/validate-fixtures.mjs:512-514` is
satisfied by the delta alone, so the ~1.5× heap ratio the records cite for a facade
(`CHANGELOG.md:261-262`) never has to be reached. The recorded facade measurement of "delta 0" is a
measurement of the *particular* facade reconstructed, not a property of eliding facades.

**Why the ratio alone would not be enough on Linux.** `heapUsed` is V8's used heap including
uncollected garbage; the numerator is dominated by scan garbage rather than by the 4 MB actually
retained. A major collection finalizing between the scan's last allocation and
`dev/validate-lexer-probes.mjs:64` would collapse the ratio. The delta is what makes the pair
portable, which is exactly the improvement round 45 asked for and got.

### Hand-trace: controls 488, 489 and 490 against the live sources

**Control 488** (`dev/validate-fixtures.mjs:4548-4567`). `coreIndex`/`fixturesIndex` locate
`name: 'core',` (`dev/validate-all.mjs:16`) and `name: 'fixtures',` (`:21`). `coreOpen` is the
`{` at `:15`. `coreClose` is `indexOf('},', coreIndex) + 2` — note this lands on the **env object's**
`'1' },` at `:18`, not on the phase object's `},` at `:19`; likewise `fixturesClose` lands on `:26`.
The four-way splice therefore emits: prefix through `const phases = [\n  `, the fixtures object
through its env line, the connective `\n  },\n  ` recovered from `slice(coreClose, fixturesOpen)`,
the core object through its env line, and the tail `\n  },\n];…`. The result is syntactically valid
and correctly reversed. Against the validator: `corePhaseIndex > fixturesPhaseIndex` fires
`must declare the core phase before the fixtures phase` (`dev/validate.mjs:2164-2166`) — the needle;
and both per-phase contracts still match their own objects (core is last, so its slice is bounded by
the new `];` rule; fixtures is first, bounded by `name: 'core',`), so the control isolates the order
check as its comment claims. ✔

**Control 489** (`:4571-4584`). `  node-floor:` is `.github/workflows/ci.yml:306`; the first
`    timeout-minutes: 50` at or after it is `:309`, node-floor's own. Rewriting it to `44` makes
`jobTimeoutMinutes = 44 < minimumJobTimeoutMinutes = 2 × 20 + 5 = 45`, firing
`… timeout-minutes must be an integer of at least 45 …` (`dev/validate.mjs:2223`) — the needle,
with the `45` produced by interpolation from `dev/validate-all.mjs:33`'s parsed `20`. ✔

**Control 490** (`:4590-4597`). `source.replace(/\n?$/u, '\n')` normalizes the trailing newline
(`$` without `m` anchors at end of input; the first successful match is the final `\n` if present,
otherwise the empty position at end) and appends the probe comment. `dev/validate.mjs:2227-2231`
performs a whole-file `source.includes('RUST_INTEL_VALIDATE_TIMEOUT_MS')` and fires
`… must not set RUST_INTEL_VALIDATE_TIMEOUT_MS …` — the needle. ✔

### Hand-trace: registry totals

`CONTROL_REGISTRY_TOTAL = 490` (`dev/validate-fixtures.mjs:100`) and the scope header's "490
hand-written controls" / "414 spawn child processes (390 validator children and 24 focused
lexer/helper children), and 76 run in-process" (`:5`, `:10-11`) agree, and the agreement is
machine-checked three ways (`:188-192`, `:4609-4627`). The four new controls route correctly:
487 calls `runValidateAgainstMutatedFiles` with `script: 'dev/validate-all.mjs'`, and
`tallyChildSpawn(spawnOptions.script && spawnOptions.script !== 'dev/validate.mjs' ? 'focused' : 'validator')`
(`:318`) tallies it **focused** (23 → 24); 488/489/490 use the default script and tally
**validator** (387 → 390). 390 + 24 = 414; 414 + 76 = 490. `README.md:48` and `CHANGELOG.md:99`
carry the same numbers. ✔

## Part 2 — whole-repository release readiness at `1a9f1f8`

### P2-A. No CI run has ever exercised any part of the current tooling (seventh consecutive round)

Locations: `git ls-remote origin refs/heads/main`, `gh run list`, `package.json:9-18`,
`.github/workflows/ci.yml:17-215`, `:216-231`, `:306-331`, `:332-433`, `:435-520`.

```text
git ls-remote origin refs/heads/main   -> 3ed04b907a10a4085203fa6af1f6876313609186
git rev-list --count 3ed04b9..HEAD     -> 94
gh run list --limit 8 (newest)         -> 34019219895  validate  success  2m37s  2026-09-06  main
```

`origin/main` has not moved since round 42. Rounds 40, 41, 42, 43, 44 and 45 each named this as the
dominant blocker; **this is the seventh.** Six fixing passes have now landed since the last
CI-verified commit without changing it, and the count of unpushed commits has gone 92 → 94.

What has *improved* since round 45 is the reason for going first: round 45 recommended fixing P2-1
before pushing so the long-awaited CI run would not be spent discovering a Windows-calibrated memory
floor on Linux. That is done and done well — the ratio-or-delta design is portable and the absolute
RSS floor is gone. The remaining obstacle to a useful first CI run is no longer a calibration risk;
it is simply that nobody has pushed.

The unexecuted delta is unchanged in shape from round 45 and unchanged in size: comparing the last
commit CI ever ran against to this head,

```text
git diff --stat 3ed04b9..HEAD -- bin
  bin/install-codex.js       |  38 ++--
  bin/install-transaction.js | 419 +++++++++++++++++++++++++
  bin/install.js             |  72 ++++----
  3 files changed, 479 insertions(+), 50 deletions(-)
```

and `package.json:9-18` lists `bin/` in `files`, so a 419-line published module has still never run
under CI on any platform.

Correction: push the head and let the full matrix run before the next review round; record the run
id in the ledger, as rounds 23 and 26 did. Nothing else in this report closes it.

### P2-B. The two behavioural gates still rest on local, non-transferable evidence

This is Part 1's P2-1, P2-2, P3-1 and P3-3 restated at release scope.

**The Windows ordinary-validation gate.** The records are now honest about attribution in a way they
were not in round 45: `CHANGELOG.md:238-243` explains exactly why the 368 s measurement cannot be
the committed tree and names the three differing files, and `CHANGELOG.md:286-289` scopes the new
344 s / 490/490 figure the same way. What has not changed is that both figures are unverifiable
local runs with no SHA, that round 42's two `0xC0000409` (`__fastfail`, a second-chance
non-continuable exception — an abort-class termination) failures remain unexplained, and that
`windows-validator` has still never executed.

**The anti-vacuity gate.** Round 45 said its remaining defense was a pair of memory floors that were
themselves a portability risk. The portability risk is gone; the defense is not sound. Control 458's
identity pin does not close the wrapper class (P2-1), the work floors do not close the
`dev/js-lexer.mjs` class against an allocating fast path (P3-1), and the floors' own inputs are
produced by unpinned source (P2-2). Three release-facing records assert closure on the first two.

Neither gate can be closed by another documentation pass. The first needs one `windows-validator`
run on both matrix legs. The second needs the masked-source fix in P2-1, the `helperContract`
additions in P2-2, and honest prose for P3-1.

### P3-A. The `0.7.0` MINOR re-derivation was anchored at the last CI'd commit, not at the released tag

Locations: `CHANGELOG.md:13`, `:15`; `package.json:3`, `:5-18`;
`git diff --stat v0.6.0^{}..HEAD -- <packaged paths>`.

Round 45's P3-A asked for the classification to be restated against `git diff v0.6.0..<candidate>`
over the packaged file set. The new paragraph (`CHANGELOG.md:15`) restates it against `3ed04b9..HEAD`
instead — "the MINOR call above was made in round 23 at `3ed04b9`, before the packaged `bin/` surface
changed by `+479/−50` … the rule text … is byte-identical to `3ed04b9`." Everything in that sentence
is true, and the `bin/` analysis it contains (both `package.json` `bin` targets unchanged, the
transaction module additive, installer CLI arguments and installed paths unchanged) is the right
analysis. It answers "what changed since the decision", which is a useful question — but it is not
the question a semver classification answers.

Against the released tag the packaged delta is much larger:

```text
git diff --stat v0.6.0^{}..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*
  37 files changed, 2448 insertions(+), 759 deletions(-)
  .claude-plugin/marketplace.json |   2 +-      bin/node-version.js |  28 ++ (new)
  .claude-plugin/plugin.json      |   2 +-      package.json        |   6 +-
  bin/install-codex.js            |  42 ++-     rust-cc-install.ps1 | 309 +++--
  bin/install-transaction.js      | 419 ++++     rust-cc-install.sh  | 311 +++--
  bin/install.js                  |  77 ++--     rust-cc-uninstall.* | 445 +++--
  skill/ + skills/rust-intel/     ~2,000 lines across 24 rule-text files
```

`commands/` is unchanged since `v0.6.0`; `bin/node-version.js` is new and published. The rule-text
delta is the substance of the release and is described elsewhere in the Unreleased section, so
MINOR still looks correct to me on inspection — the point is that the sentence a reader will use to
check the classification is anchored at a commit that has no release meaning, and it explicitly
asserts rule-text byte-identity that is true only relative to that anchor. A reader who runs the
obvious command (`git diff v0.6.0..HEAD`) sees 37 files where the record led them to expect three.

Correction: re-anchor the paragraph at `v0.6.0`, keep the `bin/` analysis it already contains, and
state the rule-text delta explicitly rather than as byte-identity to a non-release commit.

### P3-B. The coordinator is executed now, but only along its narrowest path

Cross-reference of Part 1's P3-2 at release scope. `dev/validate-all.mjs` is the entrypoint for
`npm run validate`, `repository-checks`, `windows-validator`, `node-floor` and the `publish` job's
sanity checks (`package.json:21`, `.github/workflows/ci.yml:41`, `:230`, `:316`,
`.github/workflows/npm-publish.yml:61`). Round 45's "no control, anywhere, that runs it" is closed —
control 487 runs it. But the single scenario it runs is a child that exits 1 and prints nothing, and
1 is also the coordinator's fallback status, so status forwarding, `stdio: 'inherit'`, argument
forwarding, `cwd`, `timeout` and `killSignal` are all still unexercised by the suite and, given
P2-A, by anything at all.

### P3-C. Release-facing closure prose still asserts more than was tested — a different defect from the one that was fixed

Part 1's P2-1 and P3-1 are release-record defects as much as code ones.
`CHANGELOG.md:264-272` and `docs/reviews/README.md:83` state that control 458's identity pin
"rejects the module-scope wrapper facade" and that the `dev/js-lexer.mjs` fast path "is covered
structurally by the work floors". Neither holds, and the same paragraph claims that "closure prose
… is narrowed to what was actually tested".

The authoring mechanism round 43, 44 and 45 chased — a disposition row that disclaims its own
commit — is genuinely fixed, and the SHA-agnostic phrasing is a good, durable solution. What
persists is the adjacent habit: recording the outcome of one reconstructed bypass as the closure of
its class. Rounds 43 ("a size-conditional facade still passed"), 44 ("an early-return facade above
the marker line still passed"), 45 ("a module-scope wrapper still passed") and now 46 (a
commented-import wrapper, and an allocating fast path) are four instances of the same pattern. The
cure is procedural, not textual: state closure as "the following N reconstructions were run and
rejected", enumerate them, and let the class claim be made by the reviewer, not the fixer.

### Release-readiness evidence at `1a9f1f8`

| Area | Evidence |
|---|---|
| Full validator | **Not independently verified this round** (static-only review by instruction). One local Windows run is recorded for the current state (344 s, exit 0, 490/490 controls, Node v24.12.0, Windows 10.0.19045), scoped to the tree before its own figures were inserted; no SHA. The three older runs remain attributed to `49dd4f0`; the round-44 run remains attributed to a named pre-final-edit tree. Round 42's two `0xC0000409` failures stand unexplained. |
| CI | **None at this head, and none for any current lane.** Newest run `34019219895` (success, 2 m 37 s, 2026-09-06) is at `3ed04b9`, 94 commits behind. `windows-validator`, the `powershell.exe` leg, the current `installer-boundaries` definition, `bash-floor`, controls 485–490, the workflow run-step scanner, the coordinator pins, the job-timeout pin and control 401's work floors have never run. |
| Fixture authority | **Verified.** Header (`dev/validate-fixtures.mjs:5`, `:10-11`), `CONTROL_REGISTRY_TOTAL = 490` (`:100`), `README.md:48` and `CHANGELOG.md:99` all state 490 = 414 (390 + 24) + 76 and agree; the split is machine-checked (`:188-192`, `:4609-4627`). Four controls added (487–490); the spawn topology is consistent (487 focused, 488–490 validator). |
| Lexer semantics | Unchanged (`dev/js-lexer.mjs` byte-identical in this window). Round 45's marker trace still holds: 42-unit marker, 1,999,958 filler, exactly 2,000,000 operations of a 2,000,000 budget, `ids: [markerId]`, `indexes: [1_999_959]`. |
| Anti-vacuity | **Open, with two new bypasses** (P2-1, P3-1) and an unpinned signal source (P2-2). Round 45's demonstrated wrapper is dead only in its `as`-aliased form; the commented-import form passes controls 401, 457, 458 and 459. Records assert closure. |
| Work-was-done floors | **Design closed, provenance open.** The ratio-or-delta pair is causal, same-child, portable and GC-immune on the delta arm (round-45 P2-1 closed). Its five telemetry inputs are pinned by no control, and the previously pinned `peakHeapSource` assertion was deleted (P2-2). |
| Coordinator contracts | **Now executed, still narrowly.** Control 487 runs `dev/validate-all.mjs`; env pin anchored to the `spawnSync(` slice; fixtures-arm slice bounded; phase order negatively controlled (488). Status forwarding, `stdio`, argument forwarding, `cwd`, `timeout`/`killSignal` unexercised (P3-2, P3-B). |
| Job timeouts | **Coherent, pinned, and now negatively controlled.** 50/50/50/45 against a computed minimum of 45; control 489 proves the pin fires; control 490 proves the `RUST_INTEL_VALIDATE_TIMEOUT_MS` ban fires. |
| Workflow reference integrity | **Unchanged** (`dev/validate.mjs:2088-2133`, control 485). Residual scope from round 44 still stands as P4. |
| Mirror parity | **Verified.** `git ls-files -s skill` vs `git ls-files -s skills/rust-intel`: thirteen files, identical blob hashes. |
| Version/manifest state | **Correct pre-bump.** `package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; `engines.node` `>=24.0.0`; latest local and remote tag `v0.6.0`; no `v0.7.0`. |
| Semver classification | **Re-derived, but against the wrong base.** `git diff --name-only 997f1f3..HEAD -- <packaged paths>` is empty for the window. `CHANGELOG.md:15` re-derives against `3ed04b9`; against `v0.6.0^{}` the packaged delta is 37 files, `+2448/−759` (P3-A). |
| Packaging | **Not re-verified** (`npm pack` is a package command, excluded by instruction). `files` unchanged from round 42's verified 39-entry dry run. |
| Recovery matrix | Definition unchanged in this window; still no execution evidence at any head. |
| Environment knobs | **One new, undocumented in the README.** `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` (`dev/validate-fixtures.mjs:457`) is documented in `CHANGELOG.md:262-264` and the ledger but not in `README.md:95` where the other three live (P3-4). |
| History integrity | **Sound in this window.** `1a9f1f8` is self-consistent: every path its new controls resolve exists at that commit; controls 487–490's mutations all apply to files present in `validateInputs`; and all four of the `dev/validate.mjs` pins it touches still pass at this tree by hand-trace. |

**Release verdict: NOT READY for `v0.7.0`.** P2-A is now in its seventh round and is the only finding
that has never moved — and the one reason round 45 gave for not pushing first (an unportable memory
floor) has been removed, so nothing technical stands in the way of a first CI run. Push it. In
parallel, close the identity-pin asymmetry (P2-1) and pin the telemetry that carries the work proof
(P2-2), correct the two false closure statements (P3-1), broaden control 487 to a discriminating
exit status (P3-2), give the round's own mechanisms negative controls (P3-3), document the new knob
(P3-4), and re-anchor the semver paragraph at `v0.6.0` (P3-A). Only after a clean reviewed head with
real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish sequence
begin.

## Static-verification record

| Check | Method | Result |
|---|---|---|
| Commit window | `git log --oneline 997f1f3..HEAD` | One commit, `1a9f1f8`; 6 files, `+274/−43`. |
| Callee-identity pin: raw vs masked | Read of `dev/validate-fixtures.mjs:4416-4419` against `dev/js-lexer.mjs:232-242`, `:460-462` | `hasPinnedScannerImport` tests the raw source; `scannerIdentityOccurrences` tests the masked source. A block-commented copy of the pinned line satisfies the first and contributes 0 to the second. **Bypassable** — round-46 P2-1. |
| Facade trace against all gates | Hand-trace of the P2-1 module against controls 401, 457, 458, 459 and `dev/validate.mjs:31`, `:2151` | All pass. Control 459 passes *because* the facade is bypassed by its mutation. |
| Work-floor OR logic | Hand-trace of `dev/validate-fixtures.mjs:490-500`, `:512-514` | Gate is skipped entirely when `scanHeapRatioFloor <= 0`; otherwise ratio ≥ 3 **or** delta ≥ 1,000,000. Both `null` (missing/invalid telemetry) → `passed` false. Fails closed on absence; forgeable on content. |
| Sampling causality | Read of `dev/validate-lexer-probes.mjs:63-66`, `:122-126` | `scanMemory` assigned on the statement after the large scan and before the companion call; `let` declarations at `:124-125` precede the `checkControl` invocation at `:129`, so no TDZ. Round-45 P2-1(a) **closed**. |
| Retained-bitmap reachability | Read of `dev/js-lexer.mjs:37-39`, `:450-452`, `:14-15` | `regexStarts = new Uint8Array(source.length)` is stored in `lexicalCacheResult` and kept alive by the module cache until the companion scan overwrites it. Reachable at the `scanMemory` sample, so the delta cannot shrink under GC. |
| Allocating-fast-path bypass | Constructed fast path inside `literalTrueCompletionDiagnostics`, traced against controls 399–402, 457, 458, 459 and both floors | Delta ≥ 1,000,000 satisfied by one `new Uint8Array(source.length)`; no control inspects `dev/js-lexer.mjs` beyond control 457's prelude patterns. **Not closed** — round-46 P3-1. |
| Telemetry provenance | `helperContract` array (`dev/validate-fixtures.mjs:4380-4391`) vs the new telemetry fields | None of the ten patterns mentions `scanMemory`, `scanHeapSample`, `scanArrayBuffersSample`, `initialArrayBuffers` or `peakHeapSource`; `expectLexerProbe` no longer asserts `peakHeapSource`. **Unpinned** — round-46 P2-2. |
| `peakRss` knob parse | Read of `dev/validate-fixtures.mjs:456-464`; `failures` declared at `:70` | `0` and non-numeric values are rejected loudly (a top-level `failures.push`, so a hard fixture failure); `1` is accepted and silently reduces the tripwire to 1 MiB. No control covers either path; not documented in `README.md:95`. |
| Control 487 mutation semantics | Read of `:4527-4544` against `dev/validate-all.mjs:42-60` and `validateInputs` (`:269-308`) | Real execution; `bin/` and `dev/validate-all.mjs` are copied; all four assertions hold. Child exit status 1 equals the coordinator's fallback, so the mapping expression is not discriminated; `stdio: 'inherit'` is not observed because the mutated child emits nothing. |
| Control 488 mutation splice | Character-level trace against `dev/validate-all.mjs:14-28` | `coreClose`/`fixturesClose` land on the **env** object's `},`, not the phase object's; the four-way splice nonetheless emits a valid, correctly reversed phases array. Fires `must declare the core phase before the fixtures phase` while both per-phase contracts still match. ✔ |
| Control 489 mutation anchor | `.github/workflows/ci.yml:306`, `:309` vs `dev/validate-fixtures.mjs:4576-4581` | First `    timeout-minutes: 50` at/after `  node-floor:` is node-floor's own; 44 < 45 fires the needle `timeout-minutes must be an integer of at least 45`. ✔ Anchor is positional (P4). |
| Control 490 mutation | Regex trace of `/\n?$/u` (no `m` flag) plus `dev/validate.mjs:2227-2231` | Trailing newline normalized, probe comment appended; whole-file `includes` fires `must not set RUST_INTEL_VALIDATE_TIMEOUT_MS`. ✔ |
| Fixtures-arm phase slice bound | `dev/validate.mjs:2172-2178` against `stripJsComments(dev/validate-all.mjs)` | No `name: '` occurs after `name: 'fixtures',` (`phase.name}` at `:56` does not match); first `];` after it is the array terminator at `:28`. Slice correctly bounded; both `phaseStart < 0` and `phaseEnd < 0` degenerate to `''` → contract error → fails closed. Round-45 P3-4 sub-item **closed**. |
| `spawnSync` env anchor | `dev/validate.mjs:2188-2199` against `dev/validate-all.mjs:43-49` | Single `spawnSync(` call site after comment stripping (the `import { spawnSync }` line has no `(`); no nested `});` inside the options object; slice is exactly the call. Round-45 P3-4 sub-item **closed**; first-occurrence-only remains a P4. |
| Job-timeout pin at this head | `dev/validate.mjs:2205-2226` vs `ci.yml:19`, `:219`, `:309`, `npm-publish.yml:36`, `dev/validate-all.mjs:33` | Parses `20`; minimum 45; lanes 50/50/50/45 — all satisfy it, `publish` exactly. No self-breakage. |
| Registry totals | `dev/validate-fixtures.mjs:5`, `:10-11`, `:100`, `:318`, `:4609-4627` | 490 = 414 (390 validator + 24 focused) + 76; control 487 tallies focused, 488–490 validator; header, registry, README and CHANGELOG agree. |
| Determinism comment | Read of `dev/validate-fixtures.mjs:4095-4096` | Unchanged; still claims deterministic oracles five lines above control 401's clock-derived id and allocation floors. Round-45 P4 **open**. |
| Failure-message improvements | Read of `:519-521`; `dev/validate-lexer-probes.mjs:141` | Expected marker id, both work-floor values and their floors now printed; `peakRssSource` no longer mislabelled when `maxRSS === 0`. Two round-45 P4s **closed**. |
| Disposition-row phrasing | Read of `CHANGELOG.md:213`, `:248-250`; `docs/reviews/README.md:81`, `:83` | Round-44 rows name `1ba3956`; round-45 rows use "committed as the commit containing this row, on top of `997f1f3`" — true irrespective of the SHA. Round-45 P3-2/P3-C **closed at the mechanism**. |
| Evidence attribution | Read of `CHANGELOG.md:238-243`, `:286-289`; `README.md:48` | Both the 368 s and 344 s figures are scoped to named pre-final-edit trees with the validator-input mechanism stated. No SHA; unverifiable statically. Round-45 P3-3 **substantially closed**. |
| Semver re-derivation base | `CHANGELOG.md:15`; `git diff --stat v0.6.0^{}..HEAD -- <packaged paths>` and `3ed04b9..HEAD -- bin` | Paragraph anchored at `3ed04b9` (3 files, `+479/−50`). Against `v0.6.0^{}` = `d5b15ec`: 37 files, `+2448/−759`, including new `bin/node-version.js` and ~2,000 lines of rule text. Round-46 P3-A. |
| Mirror parity | `git ls-files -s skill` vs `git ls-files -s skills/rust-intel` | Thirteen files, identical blob hashes. |
| Manifests/tags | File reads, `git tag -l`, `git ls-remote --tags origin` | All `0.6.0`; latest tag `v0.6.0` locally and remotely; no `v0.7.0`. |
| Packaged-surface delta (window) | `git diff --name-only 997f1f3..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` | Empty. |
| Remote/CI state | `git ls-remote origin refs/heads/main`, `git rev-list --count`, `gh run list --limit 8` | `3ed04b9`; 94 commits ahead; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| Prior-round P2-A continuity | Cross-read of rounds 40–45 Part 2 | Every round from 40 through 45 names it; round 46 is the seventh consecutive. |
| Node memory semantics | Node `process.memoryUsage()` documentation ([nodejs.org/api/process.html#processmemoryusage](https://nodejs.org/api/process.html#processmemoryusage)) | `arrayBuffers` "refers to memory allocated for ArrayBuffers and SharedArrayBuffers, including all Node.js Buffers. This is also included in the `external` value"; it "may be 0" only when Node is used as an embedded library (a host-supplied `ArrayBuffer::Allocator`), which does not apply to the standalone `node` binary used by the probes. Typed-array backing stores therefore count in `arrayBuffers`/`external` and **not** in `heapUsed`, which is why the delta is the causal signal and the ratio is the incidental one. Field added in v13.9.0 / v12.17.0 ([nodejs/node#31550](https://github.com/nodejs/node/commit/5ec9295034)). |
| Node resource semantics | Node `process.resourceUsage()` documentation | `maxRSS` maps to `ru_maxrss`, the maximum resident set size in kilobytes; `dev/validate-lexer-probes.mjs:141` multiplies by 1024 correctly and now guards `> 0`. |
| V8 heap flag | `--max-old-space-size` semantics (`dev/validate-fixtures.mjs:376`, `:378`) | Bounds the old generation. Round 45's tension between the 64 MB cap and a documented ≈71 MB `heapUsed` no longer matters: no absolute heap figure is asserted, only a same-child ratio, and the delta arm is independent of the cap because backing stores are external to the heap. |
| Windows status code | Microsoft `__fastfail` documentation | `0xC0000409` is a second-chance non-continuable exception — abort-class termination, not an ordinary exit status. Round 42's two occurrences remain unexplained. |

## Red-tier and out-of-scope inventory

- No normative skill, mirror, command, installer, manifest, or workflow file changed in this window;
  all thirteen mirror files are byte-identical to each other and unchanged since `633a0da`.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue or cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added. Cargo, clippy, Miri,
  `cargo-semver-checks`, audit, and deny remain inapplicable: this repository has no Cargo manifest
  or lockfile, and the executable changes are Node repository tooling.
- The forged modules quoted in P2-1 and P3-1 exist only in this report. Neither was written to any
  file, staged, committed, or executed; both are hand-traces against the committed source.
- No dynamic verification was performed by this review, by instruction. Every runtime number quoted
  here is attributed to a commit body, a release record, round 42's or round 44's measurements, or
  `gh run list`.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract; only the documented process-interruption guarantee is in scope.
- No product code, manifest version, tag, remote ref, npm artifact, or ledger row was changed by
  this review. This report file is the only authored change; the ledger row for round 46 is
  outstanding work for the fixing pass.

## Recommended correction order

1. **Fix the callee-identity pin's raw-vs-masked asymmetry** (P2-1). Test
   `hasPinnedScannerImport` against `observationModuleMasked` instead of `observationModuleSource`,
   and add a binding-shape assertion (no `(?:function|const|let|var|class)\s+literalTrueCompletionDiagnostics\b`,
   no `\bas\s+literalTrueCompletionDiagnostics\b` / `\bliteralTrueCompletionDiagnostics\s+as\b`) so
   the check states a property rather than a count. This is a three-line change and it closes the
   cheapest surviving facade.
2. **Pin the source that produces the work proof** (P2-2). Add `helperContract` patterns for
   `scanMemory = process.memoryUsage();`, `companionMemory = process.memoryUsage();` and the three
   telemetry field expressions; restore an assertion on `peakHeapSource`
   (`=== 'sampled-around-scan-and-terminal'`); pin the scan/sample adjacency.
3. **Correct the two false closure statements** (P3-1) in `CHANGELOG.md:264-272`,
   `docs/reviews/README.md:83` and the code comment at `dev/validate-fixtures.mjs:410-416`. State
   what was reconstructed and rejected, enumerated; do not state the class.
4. **Push the head and obtain one complete run of the current `validate` workflow** (P2-A),
   including `windows-validator` on both Node legs and `windows-install-smoke` on both PowerShell
   legs. Record the run id in the ledger, as rounds 23 and 26 did. Round 45's reason for deferring
   this — an unportable memory floor — no longer applies.
5. **Give this round's own mechanisms negative controls** (P3-3): one control mutating
   `dev/validate-lexer-observations.mjs` into the P2-1 facade shape and requiring the fixture run to
   fail; one mutating away `dev/validate-lexer-probes.mjs`'s `scanMemory` assignment and requiring
   control 401 to fail on the work floors; plus the malformed-knob path and the bounded fixtures
   slice.
6. **Broaden control 487** (P3-2/P3-B): make the mutated child exit `3`, assert `status === 3` and
   `exit status 3`, and add a variant that writes to stdout so `stdio: 'inherit'` is covered.
7. **Document `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` in `README.md:95`** beside the other knobs,
   and either floor the override or echo the effective value on the passing path (P3-4).
8. **Re-anchor the semver paragraph at `v0.6.0`** (P3-A), keeping the existing `bin/` analysis and
   stating the rule-text delta rather than byte-identity to `3ed04b9`.
9. Close the smaller gaps: correct the determinism comment at `dev/validate-fixtures.mjs:4095-4096`
   (round-45 carry-over), move the work-floor enable off `scanHeapRatioFloor`, pin `regexStarts`'s
   membership in the cached result so the delta stays GC-immune, align `CHANGELOG.md:99` with
   `README.md:48`'s telemetry wording, fix `README.md:48`'s "three runs" clause, and clear the
   round-44 P4 carry-overs.
10. Re-run an independent P0–P3 review on the resulting head. Only after a clean reviewed head with
    real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish
    sequence begin.
