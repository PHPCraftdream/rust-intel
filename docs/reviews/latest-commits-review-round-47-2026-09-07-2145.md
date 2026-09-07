# Round 47 review of the latest commits and v0.7.0 release readiness — 2026-09-07 21:45 CEST

## Scope and method

- Review base: `c2ee3fb` (round 46's report commit).
- Reviewed head: `46ca15b88c38f3cb30b1956aa5d550e26b1e3c36`.
- Commit window: `c2ee3fb..HEAD` — **one** commit, confirmed by `git log --oneline c2ee3fb..HEAD`:
  `46ca15b` ("fix: address round 46 review findings"). Four changed files, `+314/−67`:
  `CHANGELOG.md`, `README.md`, `dev/validate-fixtures.mjs`, `docs/reviews/README.md`.
- Whole-repo context: the reviewed head is **96 commits** ahead of `origin/main`
  (`git ls-remote origin refs/heads/main` = `3ed04b9`, unchanged since round 42). Nothing in this
  window, or in the 95 commits before it, has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, probe, coordinator,
  installer, build, or package command was executed. Every dynamic number below is attributed to
  its source (the commit body, the release records, earlier rounds' measurements, or `gh run list`)
  and labelled as such; nothing is re-measured. All regex, arithmetic, offset, masking and
  control-flow claims are hand-traced against the committed source and shown here.
- Method: `git log`/`show`/`diff`/`cat-file`/`ls-files -s`/`ls-remote`/`tag`, direct file reads,
  read-only `gh run list`, character-level hand-tracing of `evaluateObservationModuleContract()`
  against `maskJsNonCode`'s actual masking implementation (`dev/js-lexer.mjs:37-68`, `:230-254`,
  `:450-468`), of `evaluateWorkFloors()` against `dev/validate-lexer-probes.mjs`'s telemetry, of
  control 487's mutation against `dev/validate-all.mjs`'s exit-status mapping, of controls 491 and
  492 in full, of the eighteen `helperContract` patterns against the live probe source, and of the
  registry/header spawn arithmetic. Primary-source lookups for GFM table termination, ECMAScript
  module binding uniqueness, and Node's `process.stdout` write synchrony.
- `skill/`, `skills/rust-intel/`, `commands/`, `bin/`, both plugin manifests, `package.json`,
  `dev/js-lexer.mjs`, `dev/validate.mjs`, `dev/validate-all.mjs`, `dev/validate-lexer-probes.mjs`,
  `dev/validate-lexer-observations.mjs`, both workflow files and every installer script are
  **byte-identical to the round-46 reviewed head** (`git diff --name-only c2ee3fb..HEAD --
  bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` is empty), so
  normative rule text was checked for release/mirror consistency only, not re-audited.
- Authored change set: this report file alone. As in rounds 43–46, the instruction for this round
  authorized exactly one new file, so the ledger row for round 47 remains outstanding work for the
  fixing pass.

## Executive result

- **No P0 and no P1 finding**, in either part, under this series' established calibration (nothing
  in the window touches a packaged artifact, installer behaviour, workflow definition, or normative
  rule text; the only executable change is repository tooling). The P2 below would be a P1 in a
  product context — it is a complete, silent defeat of a release-gating mechanism — and is called
  out as such.
- **Part 1 (commit window): one P2, five P3, twelve P4 observations.**
- **Part 2 (whole repository): two P2, three P3.** Part 1's P2-1, P3-1 and P3-4 are also
  release-gate items and are cross-referenced rather than double-counted.
- **The structural half of the fix is real and deserves credit.** Round 46's demonstrated
  comment-hidden-import bypass is genuinely dead. `evaluateObservationModuleContract()`
  (`dev/validate-fixtures.mjs:4397-4453`) is a shared oracle, and I verified by hand that its
  masked half cannot be satisfied by a commented or stringified copy of the pinned line: masking
  blanks comment and string interiors while preserving offsets (`dev/js-lexer.mjs:230-245`,
  `:246-253`, `:61-66`), so a commented copy masks to 66 spaces while the pinned masked image is
  `import { literalTrueCompletionDiagnostics } from ` + 16 spaces + `;`. I also verified that the
  binding-shape assertions are *not* the load-bearing part but are also not wrong: given a live
  named import of the identifier, ECMAScript forbids any second module-scope binding of the same
  name outright, so the regexes' known gaps (destructuring, `function*`, `\u`-escaped spellings)
  are unreachable. Round 46's literal correction — "derive `hasPinnedScannerImport` from the masked
  source" — was itself unsound, and the fixing pass caught that and said so; that is exactly the
  behaviour this loop is supposed to produce.
- **But the same commit moved the raw-versus-masked asymmetry from one half of control 458 into the
  other half, and the other half is where the work proof actually lives.** All eighteen
  `helperContract` patterns are tested against the **raw** probe source
  (`dev/validate-fixtures.mjs:4498` against `:187`), including the five telemetry-provenance
  patterns this commit added specifically to close round 46's P2-2 (`:4483-4490`). A block comment
  carrying the pinned scan-call and sampling text, plus a null-preserving one-line `scanMemory`
  override, elides control 401's entire 2,000,000-unit scan while controls 401, 458, 459, 460, 491
  and 492 all stay green. Full hand-trace below; the exploit costs three edited lines in
  `dev/validate-lexer-probes.mjs`. **Round-47 P2-1.** This is the fifth consecutive round in which
  the anti-vacuity gate is defeated by two halves of one check disagreeing about what counts as
  code — and the first in which the commit that fixed one instance introduced the next.
- **The reworked import pin still cannot pin the live import's module specifier.** The masked half
  erases exactly the component the raw half exists to pin, and the two halves may be satisfied by
  two *different physical lines*: a commented decoy for the raw half, plus a live
  `import { literalTrueCompletionDiagnostics } from './f.mjs'/*aaa*/;` (masked image identical to
  the pinned one) for the masked half. Control 458 passes such a module. Two release records state
  the opposite (`CHANGELOG.md:305`, `dev/validate-fixtures.mjs:4393-4394`). The suite still fails —
  but at controls 459 and 492, for incidental reasons (a temp-tree file that does not exist, and a
  duplicate-binding `SyntaxError` in a facade 492 builds from the forged source), with diagnostics
  that report `realIdentityHeld=true`. **Round-47 P3-1.**
- **Control 491 was given only the negative half of the assertion its sibling control 492 got.**
  492 asserts `realEvaluation.identityHeld === true` before asserting the facades fail
  (`:4764-4765`). 491 asserts only `!evaluation.floorsSatisfied` (`:4709`) and never asserts that
  the *unmutated* telemetry satisfies the floors. Because `floorsSatisfied` is hard-gated on
  `scanHeapRatioFloor > 0` (`:511`), changing `const control401ScanHeapRatioFloor = 3;` to `0`
  (`:451`) disables **both** work signals and leaves control 491 green — the negative control for
  the floors is satisfied by turning the floors off. **Round-47 P3-2.**
- **Control 487's rework is correct and is the cleanest item in the window.** I traced the
  mutation, the coordinator's `process.exit(status !== null && status > 0 && status < 256 ? status : 1)`
  (`dev/validate-all.mjs:57`), and the `stdio: 'inherit'` path: status 7 is forwarded verbatim,
  a literal `process.exit(1)` regression now fails the control, and the sentinel only reaches the
  fixture parent because the coordinator inherits its stdout, so switching to `'ignore'`/`'pipe'`
  breaks it. The write is synchronous to a pipe on both Windows and POSIX per Node's documented
  `process.stdout` behaviour, so there is no flake window before `process.exit(7)`. Round-46 P3-2
  is closed, including the `phase=core passed` absence assertion round 46 asked for.
- **The P3-1 threat-model reframing is honest and is what round 46 recommended**, but the boundary
  is now materially broader than the one it cites as precedent: the pre-existing exclusion was "an
  author who deliberately pads memory inside a forged callee", deferred to control 458; the new one
  puts an entire third file, `dev/js-lexer.mjs`, outside the threat model
  (`dev/validate-fixtures.mjs:445-450`). A `source.length === 2_000_000` fast path in that file is
  a textbook "quietly rotted control", not a "deliberate lexer forgery". Recorded as P4, not a
  finding, because round 46 explicitly authorized the prose option.
- **The review ledger's table is broken Markdown and this commit extended the breakage.**
  `docs/reviews/README.md` now has blank lines at `:84`, `:86` and `:88`, on top of pre-existing
  ones at `:59`, `:61` and `:63`. Per the GFM tables extension a table is terminated by the first
  blank line, so everything from `:60` onward — including both round-46 rows this commit added —
  renders as literal pipe-delimited paragraphs, not ledger rows. In a repository whose entire
  product is Markdown-contract enforcement, and whose validator scans only `skill/`
  (`dev/validate.mjs:89-107`), nothing catches this. **Round-47 P3-4.**
- **Round-46 P2-2, P3-2, P3-3 (partly), P3-4 (partly) and Part 2 P3-A are genuinely closed.** The
  semver re-derivation is now anchored at `v0.6.0` and every number in it verifies: 37 files,
  `+2448/−759` over the packaged surface; 26 mirrored rule files at `+992/−574` = 1,566 changed
  lines; the `## §X` category-header set is byte-identical at both refs (I diffed the sets);
  `engines.node` `>=16` → `>=24.0.0`; both `bin` targets unchanged; `commands/` unchanged.
- **Nothing has been pushed and no CI run exists for any current lane.** `origin/main` is still
  `3ed04b9`; the newest recorded run remains `34019219895` (`validate`, success, 2 m 37 s,
  2026-09-06) at `3ed04b9`. This is the **eighth consecutive round** (40, 41, 42, 43, 44, 45, 46,
  47) to name it as the dominant blocker, and the unpushed count has gone 94 → 96.
- All three manifests remain `0.6.0`, `engines.node` is `>=24.0.0`, no `v0.7.0` tag exists locally
  or remotely, the mirror is thirteen byte-identical files by blob hash, and no packaged path
  changed in this window.
- **Release verdict: NOT READY for `v0.7.0`.**

## Part 1 — findings on the commit window

### P0 and P1

None, under this series' calibration. No security-relevant surface, packaged artifact, installer
behaviour, workflow definition, or normative rule text changed in this window; the only executable
change is `dev/validate-fixtures.mjs`. P2-1 below is a complete silent defeat of a release-gating
mechanism and would be P1 if the mechanism shipped to users; it does not.

### P2-1. Control 458's `helperContract` still reads raw source, so the anti-vacuity gate is fully bypassable in three lines — the same raw/masked asymmetry the commit fixed on the other side of the same control

Locations: `dev/validate-fixtures.mjs:187`, `:4467-4491`, `:4478-4482`, `:4483-4490`, `:4496`,
`:4498`, `:4503`; `dev/validate-lexer-probes.mjs:61-67`, `:124-126`, `:138-163`;
`CHANGELOG.md:326-330`; commit body ("eliminating the parallel-oracle-drift pattern every
round-43-46 bypass exploited").

`lexerProbeSource` is the **raw** file (`:187`). Control 458 tests every one of its eighteen
`helperContract` patterns against it (`:4498`), including the five patterns this commit added to
close round 46's P2-2:

```js
// dev/validate-fixtures.mjs:4483-4490
/const initialMemory = process\.memoryUsage\(\);/u,
/scanMemory = process\.memoryUsage\(\);/u,
/companionMemory = process\.memoryUsage\(\);/u,
/observeLiteralTrueCompletion\('x'\.repeat\(fillerLength\) \+ marker\);\s*\n\s*scanMemory = process\.memoryUsage\(\);/u,
/scanHeapSample: scanMemory \? scanMemory\.heapUsed : null/u,
/scanArrayBuffersSample: scanMemory \? scanMemory\.arrayBuffers : null/u,
/initialArrayBuffers: initialMemory\.arrayBuffers/u,
/peakHeapSource: 'sampled-around-scan-and-terminal'/u,
```

A regex over raw source cannot tell live code from a comment. Sixty lines below, the same commit
built `evaluateObservationModuleContract()` precisely because that distinction is load-bearing.

**The exploit.** Replace `dev/validate-lexer-probes.mjs:63-64` with:

```js
      const observation = { kind: 'diagnostics', inputLength: 2_000_000, ids: [markerId], indexes: [fillerLength + 1] };
      scanMemory = process.memoryUsage();
      scanMemory = scanMemory && { ...scanMemory, arrayBuffers: initialMemory.arrayBuffers + 2_000_000 };
      /* observeLiteralTrueCompletion('x'.repeat(fillerLength) + marker);
      scanMemory = process.memoryUsage(); */
```

Everything else in the file is untouched. `initialMemory` is declared at `:126`, before
`checkControl` is *called* at `:129`, so there is no TDZ.

Trace against every gate at this head:

- **Control 458, `helperContract`.** All eighteen patterns match the raw text. The four
  argv/marker/filler patterns and the two `observeLiteralTrueCompletion` patterns match live code
  or the comment; the adjacency pattern matches *inside the comment* — between `marker);` and
  `scanMemory` the raw bytes are `\n` + six spaces, which is exactly `\s*\n\s*`. The three
  `process.memoryUsage()` statement pins and the four telemetry-expression pins match live code.
  **All true.**
- **Control 458, remaining conjuncts** (`:4496-4503`). `literalTrueCompletionViolations(lexerProbeSource)`
  masks internally, and the forged source introduces no non-canonical `completeCurrentControlScope`
  reference (the marker template stays a template literal). The identity pin reads
  `dev/validate-lexer-observations.mjs`, which is **not modified**, so `identityHeld` is true. The
  companion call is in-process. `!includes('lexer probe passed (control')` holds. **Control 458
  passes.**
- **Control 401 / `expectLexerProbe`** (`:516-541`). The child exits 0; `controlId` is 401;
  `telemetry.source === 'child'`; `terminalSample === true`; `heapUsed`, `rss`, `peakHeapUsed`,
  `initialHeapUsed`, `peakRss` are all real and satisfy their integer/ordering guards;
  `peakHeapSource === 'sampled-around-scan-and-terminal'` (the label is emitted by untouched
  code at `:158`); `peakRssSource` is one of the two accepted labels; `peakRss` clears the 32 MiB
  tripwire on any real Node 24 process. `scanArrayBuffersDelta` = 2,000,000 ≥ 1,000,000, so
  `floorsSatisfied` is true on the delta arm alone (`:511-513`). The fabricated observation is
  `{kind, inputLength, ids, indexes}` spread with `companion`, in the same key order as
  `expectedControl401Observation` (`:421-430`), so the `JSON.stringify` comparison matches.
  **Control 401 passes, having scanned nothing larger than the 38-byte companion input.**
- **Control 491** (`:4684-4712`). Its mutation replaces the **first** occurrence of
  `scanMemory = process.memoryUsage();` — which in the forged layout is the live one, because it
  precedes the comment — with `;`. `scanMemory` then stays `null`, and the override line is
  `null && {...}` = `null`, so `scanHeapSample`/`scanArrayBuffersSample` are `null`,
  `floorsSatisfied` is false, the semantic oracle still matches, and the child still exits 0.
  **Control 491 passes.** The null-preserving `&&` is the entire trick, and it is one token.
- **Control 459** (`:4519-4546`). It mutates the *observation module*, so the forged probe's
  fabricated large observation is unaffected, but its companion call now returns `ids: []`. The
  child's own `ok` predicate fails, it exits 1 after printing the JSON, so `facadeWouldPass` is
  false, `payload.controlId === 401`, and `companion.ids[0]` is `undefined ≠ 901`.
  **Control 459 passes.**
- **Control 492** (`:4714-4772`). It reads and mutates `dev/validate-lexer-observations.mjs`, which
  is untouched. **Passes.**
- **Control 460** (`:4548-4562`), **controls 399/400/402/409–478**. The forged file keeps every
  other branch intact. **All pass.**
- **`dev/validate.mjs`.** The probe appears only in the `required` existence list (`:17-31`) and as
  a workflow `node --check` needle (`:2151`); the forged file is syntactically valid. **Passes.**
- **Elapsed time.** Explicitly excluded from the assertion (`dev/validate-fixtures.mjs:4112-4113`),
  so a control-401 child that returns in milliseconds instead of seconds is invisible.

Result: **492/492 controls green with the 2,000,000-unit scan never executed.** That is the exact
outcome round 46's P2-1 described, reproduced through the half of control 458 this commit did not
fix.

The commit body's framing makes this worse rather than better: it names parallel-oracle drift as
the root cause of every round-43-through-46 bypass and claims to have eliminated it, while leaving
eighteen raw-text patterns as the only source contract over the file that produces the work proof.
The code comment at `:4478-4482` states the consequence directly and incorrectly — "the pins make
the removal, the replacement with a forged sampling value, or a reordering visible at the source
contract" — when a block comment satisfies all three.

Correction: mask the probe source once (`const lexerProbeMasked = maskJsNonCode(lexerProbeSource);`)
and test the `helperContract` patterns against the masked image, exactly as
`evaluateObservationModuleContract` does; keep the raw source only for the free-form-sentence check,
where a comment is equally disqualifying. Then add an exclusivity assertion for `scanMemory`:
require that the masked probe contain exactly one `scanMemory =` assignment. Both are small; the
first is the one that closes the class.

### P3-1. The reworked import pin still cannot pin the module specifier: the raw and masked halves can be satisfied by two different physical lines

Locations: `dev/validate-fixtures.mjs:4388-4396`, `:4428-4429`, `:4435-4436`, `:4444`, `:4450-4451`,
`:4508`; `dev/js-lexer.mjs:246-253`, `:237-245`; `CHANGELOG.md:299-310` (specifically `:305`);
`docs/reviews/README.md:87`.

The conjunction is:

```js
// dev/validate-fixtures.mjs:4435-4436
const hasPinnedScannerImportRaw = observationModuleSource.split(/\r?\n/).some((line) => line === pinnedScannerImportLine);
const hasPinnedScannerImportMasked = masked.split(/\r?\n/).some((line) => line === pinnedScannerImportMaskedLine);
```

`pinnedScannerImportMaskedLine` is `maskJsNonCode(pinnedScannerImportLine)` (`:4429`). Hand-computed:
the pinned line is 66 UTF-16 units; the string literal `'./js-lexer.mjs'` occupies offsets 49–64
inclusive (16 units, both quotes included) and is blanked by `blank()` at `dev/js-lexer.mjs:251`
plus `skipQuoted` at `:161-170`. So the pinned masked image is

```text
import { literalTrueCompletionDiagnostics } from ················;      (· = U+0020, 16 of them)
```

**The masked half provably cannot see which module is imported.** Nothing else in that image is
maskable: `import` is a reserved word in modules, so the visible tokens can only come from a real
`ImportDeclaration`. The masked half therefore proves "a live named import of this identifier from
*some* specifier exists at module top level" — which is genuinely strong, and is what makes the
binding-shape regexes' gaps unreachable (ECMAScript forbids a second module-scope declaration of an
imported name; a bare assignment to one is a `TypeError`). But it says nothing about the specifier.

**The raw half proves the specifier appears somewhere in the file, not that it is live.** It is a
whole-file line scan (`:4435`), so a copy inside a block comment or a template literal satisfies it —
which is precisely the property round 46 exploited and which the fix documents as closed.

The conjunction of "the pinned line appears somewhere" and "a live import of that identifier
appears somewhere" is strictly weaker than "the pinned line is live", because the two halves may be
witnessed by different lines:

```js
// dev/validate-lexer-observations.mjs, forged
/*
import { literalTrueCompletionDiagnostics } from './js-lexer.mjs';
*/
import { literalTrueCompletionDiagnostics } from './f.mjs'/*aaa*/;

export function observeLiteralTrueCompletion(source) {
  const diagnostics = literalTrueCompletionDiagnostics(source);
  ...
}
```

The live line masks to 66 units with offsets 49–64 blanked: `'./f.mjs'` is 9 units (blanked by the
string rule) and `/*aaa*/` is 7 units (blanked by `dev/js-lexer.mjs:237-245`), 9 + 7 = 16. **Its
masked image is byte-identical to the pinned masked image.** The comment padding removes the
"specifier must be exactly 14 characters" constraint: any path of ≤ 14 characters works.
`hasPinnedScannerImportRaw` is true (the decoy), `hasPinnedScannerImportMasked` is true (the live
line), there is no declaration and no `as`, so `identityHeld` is **true** and **control 458 passes a
module that imports its scanner from an attacker-chosen file.**

Two records assert the property that fails:

- `CHANGELOG.md:305`: "a copy inside a comment or a string satisfies nothing; **a forged module
  path fails the raw half**". It does not, when a decoy copy is present.
- `dev/validate-fixtures.mjs:4393-4394`: same sentence, in the shared function's own comment.

**Why this is P3 and not P2.** The suite still fails, twice, incidentally:

1. Control 459 (`:4527-4531`) runs the probe against a temp tree populated only from
   `validateInputs` (`:279-303`). `dev/f.mjs` is not in that list, so the forged module's import
   fails to resolve, the child dies, `payload` is `null`, and control 459's `payload?.controlId === 401`
   conjunct is false. (One line added to `validateInputs` — in the same file the forger is already
   editing — restores it.)
2. Control 492 (`:4739-4742`) builds its facade by wrapping the **first** occurrence of the pinned
   line in `/*` … `*/`. In the forged module that first occurrence is already inside a block
   comment, so the result is `/*\n/*\n…\n*/\n*/` — the comment closes at the first `*/`, the second
   `*/` is a syntax error, the probe child cannot load the module, `facadeChildWouldPass` is false,
   and control 492 fails. Even if the decoy is hidden in a template literal instead (which survives
   492's wrap), 492 also injects a module-scope `function literalTrueCompletionDiagnostics` before
   the export anchor (`:4727-4741`), which collides with the forged module's live import binding —
   a duplicate-declaration `SyntaxError`. This second collision is unavoidable while the masked
   half demands a live import, so the detection is deterministic.

But it is *accidental*: no comment or record identifies control 492's facade builder as load-bearing
for specifier integrity, and the natural hardening a reviewer would ask for — build the facade from
a fixed template instead of from `realSource`, so 492 becomes hermetic — would remove it silently.
The diagnostic is also misattributing: it prints `facadeChildWouldPass=false, realIdentityHeld=true`
(`:4770`), which reads as "control 492's own construction broke", not "the observation module is
forged".

Correction: exploit the fact that masking **preserves offsets** (`dev/js-lexer.mjs:61-66` never
changes length). Locate the pinned masked image's offset in `masked`, then require the *raw* bytes
at the same offset to equal the pinned line:

```js
const at = masked.indexOf(pinnedScannerImportMaskedLine);
const livePinnedImport = at >= 0
  && (at === 0 || masked[at - 1] === '\n' || masked[at - 1] === '\r')
  && observationModuleSource.slice(at, at + pinnedScannerImportLine.length) === pinnedScannerImportLine;
```

That is a single-line change, it makes the two halves witness the *same* line by construction, and
it retires both this finding and the whole "which half saw what" class for this pin.

### P3-2. Control 491 got only the negative half of its assertion, so zeroing one constant disables the work floors with the control still green

Locations: `dev/validate-fixtures.mjs:451-452`, `:497-515` (specifically `:511`), `:531`,
`:4684-4712` (specifically `:4703`, `:4709`), `:4762-4769`; `CHANGELOG.md:337-343`.

`evaluateWorkFloors` gates everything on the ratio floor:

```js
// dev/validate-fixtures.mjs:511-513
floorsSatisfied: scanHeapRatioFloor > 0
  && ((scanHeapRatio !== null && scanHeapRatio >= scanHeapRatioFloor)
    || (scanArrayBuffersDelta !== null && scanArrayBuffersDelta >= scanArrayBuffersDeltaFloor)),
```

and `expectLexerProbe` short-circuits the same way (`:531`: `scanHeapRatioFloor <= 0 || floorsSatisfied`).
Round 46 raised the coupling as a P4. It is now worse than a P4, because control 491 — the control
added to prove the floors detect anything — asserts only `!evaluation.floorsSatisfied` (`:4709`).

Change `const control401ScanHeapRatioFloor = 3;` (`:451`) to `0` and trace:

- Control 401: `scanHeapRatioFloor <= 0` is true, so the whole floor clause is skipped. Both work
  signals are dead. **Passes.**
- Control 491: `evaluateWorkFloors(telemetry, 0, 1_000_000)` returns `floorsSatisfied: false` for
  the trivial reason that `0 > 0` is false. `observationStillPasses` is true, `status` is 0.
  **Passes.**

One character removes the round's headline mechanism and its own negative control reports success.
Its sibling control 492 does not have this problem, because it asserts the positive half first
(`realEvaluation.identityHeld === true`, `:4764`) before asserting the facades fail. The asymmetry
between two controls written in the same commit, for the same purpose, is the finding.

Correction: give control 491 the positive half — run the *unmutated* probe once (or reuse control
401's payload) and assert `evaluateWorkFloors(realTelemetry, control401ScanHeapRatioFloor,
control401ScanArrayBuffersDeltaFloor).floorsSatisfied === true` alongside the negative assertion.
Separately, move the enable condition off the weaker signal: make the clause
`(scanHeapRatioFloor > 0 || scanArrayBuffersDeltaFloor > 0)` so the GC-immune delta arm can stand
alone.

### P3-3. "The pins additionally close the replacement forgery" is true only for the in-place spelling

Locations: `CHANGELOG.md:326-330`; `dev/validate-fixtures.mjs:4478-4482`, `:4483-4490`.

`CHANGELOG.md:328` states: "the pins additionally close the replacement forgery (a fabricated
`scanMemory` value no longer passes control 458's source contract)."

The pins are presence assertions, not exclusivity assertions. Replacing
`scanMemory = process.memoryUsage();` **in place** with a literal object does fail them. *Appending*

```js
scanMemory = scanMemory && { ...scanMemory, arrayBuffers: initialMemory.arrayBuffers + 2_000_000 };
```

after the pinned statement does not: every pattern still matches, the adjacency pattern still
matches, and (because the override is null-preserving) control 491's mutation still drives the
telemetry to `null`. This is the same object used in P2-1's exploit and is stated separately here
because it does not need the comment trick — it is a record-accuracy defect on its own.

This is the fifth consecutive round in which a fixing pass states the closure of a *class* from a
single tested *reconstruction* (round 43: size-conditional facade; round 44: early-return facade;
round 45: `as`-alias wrapper; round 46: comment-hidden wrapper; round 47: in-place replacement).
The round-46 commit body explicitly adopted "closure below is stated per reconstruction actually
run, not per class" (`CHANGELOG.md:302-303`) and then wrote a class claim two paragraphs later.

Correction: state "an in-place replacement of the sampling statement is rejected; a subsequent
overwrite is not asserted against", or add the exclusivity pin proposed in P2-1.

### P3-4. The review ledger's table is broken Markdown, and this commit added three more blank lines inside it

Locations: `docs/reviews/README.md:59`, `:61`, `:63`, `:84`, `:86`, `:88`; `dev/validate.mjs:89-107`,
`:2323`.

The ledger is a GFM table starting well above line 30. Blank lines now sit at `:59`, `:61`, `:63`
(pre-existing, introduced with the round-34/35 rows) and `:84`, `:86`, `:88` (added by `46ca15b`).
Per the GFM tables extension, "the table is broken at the first empty line, or beginning of another
block-level structure" (github.github.com/gfm, §4.10 Tables). Consequently:

- Rows up to `:58` render as the ledger table.
- Lines `:60`, `:62`, and the contiguous block `:64`–`:83` render as ordinary paragraphs of
  literal `|`-delimited text (no header row precedes them).
- **Both rows this commit added — the round-46 review row (`:85`) and the round-46 fixing-pass row
  (`:87`) — render as literal text, not as ledger rows.**

Nothing detects this: `dev/validate.mjs` only walks Markdown under `skill/` and `skills/`
(`:89-107`, `:2323`), so `docs/reviews/README.md` is outside every table-boundary, delimiter and
body-width contract the repository ships. The irony is load-bearing for a release: the ledger is
the artifact a reviewer is pointed at, and this repository's entire product is Markdown-contract
enforcement.

Correction: delete the six blank lines so the table is contiguous. Optionally extend the validator's
existing table-boundary check to `docs/reviews/README.md` — a two-line addition to the file list —
so the ledger is held to the contract the skill text is held to.

### P3-5. The `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` knob is documented now, but the rest of round 46's P3-4 is untouched

Locations: `README.md:95`; `dev/validate-fixtures.mjs:453-469`, `:538`.

The documentation half is closed: `README.md:95` now carries "`RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB`
relaxes focused control 401's peak-RSS tripwire in MiB (default 32; a positive integer, and a
malformed value is a fixture failure)", beside the other three knobs, which is exactly where round
46 asked for it. Three residuals from the same finding are unaddressed:

- `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB=1` is still accepted by `/^[1-9]\d*$/u` (`:464`) and
  silently reduces the tripwire to 1 MiB. Round 46 asked for a floor on the floor.
- The effective floor is still interpolated only into the **failure** message (`:538`); a passing
  run records nothing, so an override that weakened a release gate leaves no trace in the log.
- The malformed-value path (`:465`, a top-level `failures.push`) still has no negative control. It
  remains the only `RUST_INTEL_*` parse in the fixture file with no coverage — while three lesser
  mechanisms got controls 488/489/490 and two more got 491/492.
- Minor wording: "relaxes" is one-directional; a value above 32 tightens the tripwire.

### P4 observations

- **The `dev/js-lexer.mjs` threat-model boundary is now honest but broader than the precedent it
  cites.** `dev/validate-fixtures.mjs:445-450` reads "That third file is outside this project's
  threat model — a deliberate lexer forgery, not a quietly rotted control". The pre-existing
  exclusion was narrower: memory padding *inside a forged callee*, explicitly deferred to control
  458. A `if (source.length === 2_000_000)` fast path that allocates one `new Uint8Array` and
  returns tail-recovered diagnostics is not a "deliberate lexer forgery" in any ordinary sense — it
  is the canonical shape of a quietly rotted control, and control 457 (`:4372-4386`) inspects only
  the module prelude for `new Map()` and the two `let lexicalCache*` declarations, so nothing in
  the suite would see it. Round 46 authorized the prose option explicitly, so this is not a finding;
  it is a note that the boundary was widened in the act of stating it, and that `dev/js-lexer.mjs`
  is now the one file in the anti-vacuity chain with no identity contract at all.
- **The determinism comment round 45 and round 46 both asked to correct is unchanged**, now for a
  third round. `dev/validate-fixtures.mjs:4112-4113` still reads "These controls use deterministic
  exception/result oracles; elapsed time is intentionally not part of the assertion", four lines
  above a control whose expected id derives from `Date.now()` (`:417-419`) and whose pass condition
  is two allocation floors plus an RSS tripwire (`:4116-4121`). Item 9 of round 46's correction
  order; not done.
- **`evaluateObservationModuleContract` recomputes `maskJsNonCode(pinnedScannerImportLine)` on
  every call** (`:4429`), four times per run, each time evicting the module-level one-entry lexical
  cache (`dev/js-lexer.mjs:14-15`, `:451-452`). Harmless — the parent process's cache is not the
  one the work floors depend on — but the constant could be hoisted.
- **Control 492 spawns nothing when the real module's shape changes.** If `commentHiddenFacade` is
  `null` (`:4739-4742`), the control fails *and* the focused spawn tally drops to 25, producing a
  second, unrelated "execution breakdown mismatch" diagnostic (`:4789-4791`). Fail-closed, but the
  operator sees two failures for one cause.
- **Control 492's alias assertion is weaker than it looks.** `aliasEvaluation.identityHeld === false`
  (`:4768`) is already forced by the raw half, because the alias facade *replaces* the pinned line
  rather than adding a decoy. The binding/alias half is only checked through the OR at `:4769`,
  which the wrapper's `function` declaration satisfies on its own; the `as`-alias regex is never
  independently exercised.
- **The pinned raw line is still byte-exact.** A trailing space, a switch to double quotes, or a
  reformat that splits the import across lines fails control 458 with a message that says "callee
  identity pin" for a whitespace defect. `.gitattributes` pins `* text=auto eol=lf`, so CRLF drift
  is not a realistic trigger; the other spellings are.
- **The work floors' GC-immunity still rests on an unpinned implementation detail.** `arrayBuffers`
  cannot shrink only because `regexStarts` is a member of the object stored in `lexicalCacheResult`
  (`dev/js-lexer.mjs:450-452`). Control 457 pins the cache's *shape*, not `regexStarts`'s membership
  in the cached result. Round-46 P4, unchanged.
- **The 32 MiB RSS tripwire is still below a Node 24 process's own baseline** and discriminates
  nothing; honestly labelled at `:453-459`, unchanged.
- **Control 489's mutation anchor is still positional** (`:4658-4667`); `.github/workflows/ci.yml:306`
  → `:309` is correct today. Unchanged.
- **`CHANGELOG.md:99` still describes the old telemetry shape** — "Focused lexer children emit
  child-owned heap/RSS telemetry only with a terminal JSON sample" — while `README.md:48` says
  "sampled around the scan (with a terminal sample)". Round-46 P4, unchanged.
- **`README.md:48` still says the coordinator passed "in three runs"** and then enumerates two
  coordinator runs plus one fixture-only run. Round-45 and round-46 P4, unchanged.
- **Round-44/45/46 P4 carry-overs, all re-verified unchanged at this head:** the workflow run-step
  scanner's conservatism (`dev/validate.mjs:2091-2094`); `fs.existsSync` case-insensitivity on NTFS
  (`:2131`); the `spawnSync` env pin inspecting only the first `spawnSync(` (`:2188`); the
  `validateInputs` coupling documented by instance rather than by rule
  (`dev/validate-fixtures.mjs:269-278`); the execution-split check with no negative control
  (`:4784-4802`); `dev/validate-lexer-observations.mjs:1` still calling the module "Pure semantic
  observations" while `literalTrueCompletionDiagnostics` writes the module-level lexical cache; the
  dead `spawnOptions.script === 'dev/validate-fixtures.mjs'` branch (`:313-315`) — still dead, since
  the only non-default scripts passed are `dev/validate-all.mjs` and `dev/validate-lexer-probes.mjs`;
  `childSpawnsPending` declared `let` and only mutated in place (`:179`); the flat five-minute
  job-timeout margin (`dev/validate.mjs:2211`) with `publish` at exactly the computed minimum; and
  the `windows-install-smoke` pwsh-leg name overstating its coverage
  (`.github/workflows/ci.yml:332`, `:335`).
- `46ca15b` has a full descriptive body with per-finding disposition, an explicit
  not-pushed/not-tagged statement, an explicit statement that the orchestrator verified the exploit
  before delegating, and — genuinely creditable — a disclosure that the sub-agent's first fix
  attempt was unsound and was caught by its own testing. The continuing defect is P3-3's: a class
  claim written two paragraphs after adopting a per-reconstruction rule.

## Round-46 closure matrix

| Round-46 item | Disposition at `46ca15b` | Evidence |
|---|---|---|
| P2-1: control 458's callee-identity pin bypassable (raw import check vs masked occurrence count) | **Closed for the demonstrated facade; the pin's specifier half re-opens as round-47 P3-1; the asymmetry class migrates to `helperContract` as round-47 P2-1.** | The comment-hidden wrapper is dead: a commented copy masks to 66 spaces and cannot equal the pinned masked image (`dev/validate-fixtures.mjs:4429`, `:4436`; `dev/js-lexer.mjs:237-245`, `:61-66`). The binding-shape assertions (`:4437-4439`) replace the count and are structurally redundant-but-correct given a live import. What the conjunction still cannot see is the module specifier — masking blanks it by construction — so a decoy line plus a live `from './f.mjs'/*aaa*/;` satisfies both halves (round-47 P3-1). And the *other* half of the same control still reads raw source (`:4498` over `:187`), which is a full bypass (round-47 P2-1). |
| P2-2: work-floor telemetry unpinned; `peakHeapSource` assertion deleted | **Closed at the level round 46 asked for; the pins are raw-text (round-47 P2-1) and presence-only (round-47 P3-3).** | Eight new `helperContract` patterns (`:4483-4490`) pin `initialMemory`/`scanMemory`/`companionMemory` sampling, the scan-then-sample adjacency, the three telemetry expressions and the `peakHeapSource` label; `expectLexerProbe` re-asserts `peakHeapSource === 'sampled-around-scan-and-terminal'` (`:528`) and constrains `peakRssSource` to two values (`:529`). Round 46's requested list is delivered item for item. |
| P3-1: `dev/js-lexer.mjs` fast path not closed by the floors; three records say it is | **Closed.** | `CHANGELOG.md:270-277` now says "NOT closed by the work floors" and marks the round-45 text as corrected in place; the code comment (`:445-450`) and control 459's comment (`:4519-4524`) both scope the floors to non-allocating eliding facades. `docs/reviews/README.md:87`'s round-46 row carries the same correction, and the round-45 row (`:83`) carries an inline "Round-46 correction" retraction. This is the option round 46 recommended. Boundary-breadth note recorded as P4. |
| P3-2: control 487 exercises only the exit status that equals the coordinator's fallback | **Closed.** | `:4612-4627`: the mutated core phase writes `control 487 core-phase stdout sentinel` and exits 7. Traced against `dev/validate-all.mjs:50-58`: `status` is 7, `7 > 0 && 7 < 256`, so `process.exit(7)` — a literal `process.exit(1)` regression now fails. `stdio: 'inherit'` (`:45`) is what carries the sentinel into the fixture parent's captured stdout, so `'ignore'`/`'pipe'` also fail. `!includes('phase=core passed')` is the direct assertion round 46 asked for. Node documents pipe writes from `process.stdout` as synchronous on Windows and POSIX, so there is no lost-output window before the exit. |
| P3-3: the round's own two mechanisms have no negative control | **Closed for the identity pin; partially for the work floors.** | Control 492 (`:4714-4772`) is a real negative control with a positive half (`realEvaluation.identityHeld === true`, `:4764`), and it also proves the facade passes the child's own oracle, which is the right thing to prove. Control 491 (`:4684-4712`) exercises the shared predicate but has no positive half, so it is satisfied by disabling the floors (round-47 P3-2). |
| P3-4: RSS knob undocumented; accepts a value that disables the tripwire | **Partially closed.** | Documented at `README.md:95`. The `=1` acceptance (`:464`), the silent passing path (`:538` interpolates only on failure), and the missing negative control for the malformed-value branch are unchanged (round-47 P3-5). |
| P4: determinism comment | **Open, unchanged** (third round). `:4112-4113`. |
| P4: arrayBuffers floor cannot be enabled independently of the heap-ratio floor | **Open, and now more serious.** `:511`, `:531`; combined with control 491's missing positive half it is round-47 P3-2. |
| P4: 32 MiB RSS tripwire below the child's baseline | **Open, unchanged.** `:453-460`. |
| P4: delta's GC-immunity rests on unpinned `regexStarts` membership | **Open, unchanged.** Control 457 (`:4372-4386`) still pins only the cache shape. |
| P4: control 489's positional anchor | **Open, unchanged.** `:4658-4667` vs `.github/workflows/ci.yml:306`, `:309`. |
| P4: control 490 bans the knob even in a comment | **Documented as intentional; unchanged.** `:4672-4674`. |
| P4: `spawnSync` env pin inspects only the first `spawnSync(` | **Open, unchanged.** `dev/validate.mjs:2188`. |
| P4: `CHANGELOG.md:99` vs `README.md:48` telemetry wording | **Open, unchanged.** |
| P4: `README.md:48` counts three coordinator runs | **Open, unchanged.** |
| P4 carry-overs (run-step scanner, NTFS `existsSync`, `validateInputs` rule, execution-split control, "Pure semantic observations", dead script branch, `childSpawnsPending`) | **All open, unchanged.** | Cited individually above. |
| Part 2 P2-A: no CI run has ever exercised current tooling | **Open, unchanged (eighth consecutive round).** | `git ls-remote origin refs/heads/main` = `3ed04b9`; `git rev-list --count 3ed04b9..HEAD` = 96; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| Part 2 P2-B: behavioural gates rest on local, non-transferable evidence | **Substantively open.** | The Windows gate still has no CI run and no SHA-attributed measurement (the new 432 s / 492 of 492 figure is scoped the same way as its predecessors, `CHANGELOG.md:353-356`). The anti-vacuity gate's residual is now round-47 P2-1 and P3-1. |
| Part 2 P3-A: `0.7.0` MINOR re-derived against the wrong base | **Closed, and every number verifies.** | `CHANGELOG.md:15` is re-anchored at `v0.6.0` (`d5b15ec`). Verified: packaged delta 37 files `+2448/−759`; rule-text delta 26 files `+992/−574` = 1,566 lines; `## §X` header sets byte-identical at both refs (`diff` of the sorted sets is empty, 65 headers each, 59 numbered); `engines.node` `>=16` → `>=24.0.0`; both `bin` targets unchanged; `commands/` unchanged (`git diff --name-only v0.6.0^{}..HEAD -- commands` empty). |
| Part 2 P3-B: coordinator executed only along its narrowest path | **Substantially closed.** | Control 487 now exercises status forwarding and `stdio: 'inherit'`. Argument forwarding (`dev/validate-all.mjs:43`), `cwd` (`:44`), `timeout`/`killSignal` (`:46-47`) remain unexercised — round-47 P3-B. |
| Part 2 P3-C: closure prose asserts more than was tested | **Mechanism adopted, habit recurs.** | `CHANGELOG.md:302-303` adopts per-reconstruction phrasing and `:305`/`:328` then state class claims that do not hold (round-47 P3-1, P3-3). Fifth consecutive instance. |

### Hand-trace: the pinned import line's masked image, offset by offset

`pinnedScannerImportLine` (`dev/validate-fixtures.mjs:4428`) is 66 UTF-16 units:

| offsets | raw | masked |
|---|---|---|
| 0–6 | `import ` | unchanged |
| 7–8 | `{ ` | unchanged |
| 9–40 | `literalTrueCompletionDiagnostics` (32 units) | unchanged |
| 41–43 | ` } ` | unchanged |
| 44–48 | `from ` | unchanged |
| 49–64 | `'./js-lexer.mjs'` (16 units incl. both quotes) | 16 × U+0020 |
| 65 | `;` | unchanged |

The opening quote is blanked at `dev/js-lexer.mjs:251`; `skipQuoted` (`:161-170`) blanks every
remaining unit including the closing quote; `blank()` (`:61-63`) writes U+0020 and never touches a
line terminator, so length and line structure are preserved. `maskedString()` (`:52-60`) rebuilds
the string from the `Uint16Array`.

Consequences:

- A copy inside a block comment masks to 66 spaces (`:237-245` blanks `/*`, the interior and `*/`),
  which cannot equal the pinned masked image. **Round-46 P2-1's facade is dead.**
- A copy inside a template literal or a string masks to 66 spaces as well (`:211-227`, `:246-253`).
- A live `import { literalTrueCompletionDiagnostics } from <any 16 masked units>;` masks to the
  pinned image. Sixteen masked units can be `'<14-char path>'`, or `'<shorter path>'` followed by a
  block comment padding to 16 — for example `'./f.mjs'` (9) + `/*aaa*/` (7). **Round-47 P3-1.**
- No non-import construct can produce this image: `import` is a reserved word in module code
  (ECMAScript, `ImportDeclaration`; `import` is in the reserved-word set for Module goal symbols),
  and `from`/`{`/`}` are not maskable, so the only production that yields these visible tokens in
  this order is a named `ImportDeclaration`. That is why the binding-shape regexes' gaps
  (`const { X } = …`, `function* X`, `\u`-escaped spellings) are unreachable: a module may not
  declare a second module-scope binding for an imported name, and assignment to one is a
  `TypeError`.

### Hand-trace: control 487 against the coordinator's exit-status mapping

`dev/validate-all.mjs:50-58`:

```js
const status = Number.isInteger(result.status) ? result.status : null;
if (error || result.signal || status !== 0) {
  const reason = … : `exit status ${status ?? 'unknown'}`;
  console.error(`[validate-all] phase=${phase.name} failed: ${reason}`);
  process.exit(status !== null && status > 0 && status < 256 ? status : 1);
}
```

The mutation (`dev/validate-fixtures.mjs:4612-4616`) prepends, after the `#!/usr/bin/env node`
shebang of the copied `dev/validate.mjs`, a stdout write and `process.exit(7)`. `validateInputs`
copies `bin/` and `dev/validate-all.mjs` (`:287`, `:291`), so `require('../bin/node-version.js')`
resolves inside the temp tree. Then:

- `result.status` = 7 → `status !== 0` → the failure branch runs.
- `reason` = `exit status 7`; the coordinator prints `[validate-all] phase=core failed: exit status 7`
  to stderr, which the fixture parent captures (`spawnSync` with `encoding: 'utf8'`, default
  `'pipe'` stdio, `:333-342`) and concatenates into `result.output` (`:353`).
- `7 > 0 && 7 < 256` → `process.exit(7)`. The control's `result.status === 7` (`:4618`) is therefore
  a **discriminating** assertion: replacing the whole conditional with `process.exit(1)` fails it.
- The child's sentinel reaches the fixture parent **only** through `stdio: 'inherit'` (`:45`): the
  mutated child's fd 1 is the coordinator's fd 1, which is the pipe. `'ignore'` or `'pipe'` would
  drop it and fail `:4621`.
- The loop `process.exit`s inside the first iteration, so neither `phase=core passed` (`:59`) nor
  any `phase=fixtures` string is emitted; `:4622-4623` hold.

All six conjuncts hold. Round-46 P3-2 closed.

### Hand-trace: controls 491 and 492 against the live sources

**Control 491** (`:4684-4712`). The mutation replaces the first occurrence of
`scanMemory = process.memoryUsage();` with `;`. In the unmodified probe that string occurs exactly
once, at `dev/validate-lexer-probes.mjs:64` (`:124` is `let scanMemory = null;`, different text). After
the mutation `scanMemory` stays `null`, so `telemetry()` (`:147-148`) emits `scanHeapSample: null`
and `scanArrayBuffersSample: null`; `evaluateWorkFloors` returns both derived values `null` and
`floorsSatisfied: false`. The child's own `ok` predicate (`:69-74`) is unaffected by sampling, so it
exits 0 and the observation still equals `expectedControl401Observation`. All four conjuncts of
`passed` hold. ✔ — with the caveat in P3-2 that the assertion is also satisfied when the floors are
switched off.

**Control 492** (`:4714-4772`). `commentHiddenFacade` wraps the real module's import line in
`/*` … `*/` and prepends a nine-line wrapper before the export anchor. Traced:

- The wrapper's `const m = /;completeCurrentControlScope\((\d+), true\)$/u.exec(tail);` is masked as
  a regexp: `canStartRegex` is `true` after `=` (`dev/js-lexer.mjs:443`), `skipRegex` (`:171-190`)
  blanks the literal and its `u` flag, so the wrapper contributes no spurious identifier match.
- `facadeChildWouldPass`: for the 2,000,000-unit input, `source.slice(-64)` contains the whole
  42-unit marker (`;` + 27 + `(` + 6 digits + `, true)`), the anchored regexp matches, and
  `index = 2_000_000 - 42 + 1 = 1_999_959`, which equals
  `expectedControl401Observation`'s `2_000_000 - markerLength + 1`. For the 38-unit companion the
  regexp needs a leading `;` and fails, so the string equality branch returns `[{id: 901, index: 0}]`.
  The child's `ok` predicate holds and it exits 0. ✔ The control's point — that the facade passes
  the child's own oracle, so a parent-level pin is required — is correctly demonstrated.
- `facadeEvaluation`: raw half true (the commented copy), masked half false (66 spaces),
  `hasScannerBindingDeclaration` true (the wrapper's `function`), so `identityHeld` false and
  `hasPinnedScannerImport` false. `hasUnguardedFirstStatementScannerCall` remains true because the
  wrapper is inserted *before* the export anchor. ✔
- `aliasEvaluation`: the alias facade replaces the pinned line, so the raw half is already false;
  `hasScannerAliasBinding` matches `literalTrueCompletionDiagnostics as` and
  `hasScannerBindingDeclaration` matches the wrapper. The OR at `:4769` holds. ✔ (P4: the raw half
  alone would carry this assertion, so the alias regex is not independently exercised.)
- `realEvaluation.identityHeld === true` — verified by hand against the real module: line 4 is the
  pinned line verbatim (raw half), its masked image equals the pinned masked image (masked half),
  and the module contains no declaration or alias of the identifier. **No false rejection.** ✔

### Hand-trace: registry totals

`CONTROL_REGISTRY_TOTAL = 492` (`:100`) and the scope header's "492 hand-written controls" /
"416 spawn child processes (390 validator children and 26 focused lexer/helper children), and 76
run in-process" (`:5`, `:10-11`) agree, and the agreement is machine-checked three ways (`:188-192`,
`:4784-4802`). Focused spawns counted by hand: 21 `expectLexerProbe` invocations (399, 400, 401,
402, 409, 410–414, 421, 429, 439, 445, 446, 473–478) plus five `runValidateAgainstMutatedFiles`
calls with a non-`dev/validate.mjs` script (`:4531` control 459, `:4554` control 460, `:4616`
control 487, `:4696` control 491, `:4748` control 492) = **26**. 390 + 26 = 416; 416 + 76 = 492.
`README.md:48` and `CHANGELOG.md:99` carry the same numbers. ✔

## Part 2 — whole-repository release readiness at `46ca15b`

### P2-A. No CI run has ever exercised any part of the current tooling (eighth consecutive round)

Locations: `git ls-remote origin refs/heads/main`, `gh run list`, `package.json:9-18`,
`.github/workflows/ci.yml:17-215`, `:216-231`, `:306-331`, `:332-433`, `:435-520`.

```text
git ls-remote origin refs/heads/main   -> 3ed04b907a10a4085203fa6af1f6876313609186
git rev-list --count 3ed04b9..HEAD     -> 96
gh run list --limit 8 (newest)         -> 34019219895  validate  success  2m37s  2026-09-06  main
```

`origin/main` has not moved since round 42. Rounds 40, 41, 42, 43, 44, 45 and 46 each named this as
the dominant blocker; **this is the eighth.** Seven fixing passes have now landed since the last
CI-verified commit without changing it, and the count of unpushed commits has gone 92 → 94 → 96.

Round 45 had a technical reason to defer (an unportable memory floor). Round 46 recorded that reason
as retired. Round 47 finds no technical reason at all: `bin/install-transaction.js` (419 published
lines), `bin/node-version.js` (28 published lines), `windows-validator`, the `powershell.exe` leg,
`bash-floor`, controls 485–492, the workflow run-step scanner, the coordinator pins, the job-timeout
pin and control 401's work floors have all still never run on any CI runner, on any platform.

There is now a second-order cost: **P2-1 is exactly the kind of defect a first CI run would not
catch either** (a green suite is green on every runner), which is an argument for pushing *and*
fixing, not for sequencing one behind the other.

Correction: push the head and let the full matrix run before the next review round; record the run
id in the ledger, as rounds 23 and 26 did. Nothing else in this report closes it.

### P2-B. The two behavioural gates still rest on local, non-transferable evidence — and the anti-vacuity gate is open again

This is Part 1's P2-1, P3-1, P3-2 and P3-3 restated at release scope.

**The Windows ordinary-validation gate.** The new figure (`CHANGELOG.md:353-356`) is "exit 0 and
492/492 controls in 432 s", scoped to "this fixing pass's tree … the run predates only the insertion
of its own figures". That is the same honest, mechanically-explained scoping round 45's fixing pass
introduced and round 46 credited. It is still an unverifiable local run with no SHA, round 42's two
`0xC0000409` (`__fastfail`) failures remain unexplained, and `windows-validator` has still never
executed. Note also the runtime trend: 344 s at 490 controls → 432 s at 492 controls (+26 % for two
controls, because each new control performs a full `validateInputs` temp-tree copy). Still far below
the 20-minute per-phase and 50-minute job ceilings, but the margin is being consumed by controls
that copy the tree.

**The anti-vacuity gate.** Round 46 said the gate's defence was a callee-identity pin plus two work
floors. The pin's identity half is now sound against the demonstrated facade and unsound against
specifier laundering (P3-1); the pin's `helperContract` half is fully bypassable (P2-1); the floors'
negative control is satisfied by disabling the floors (P3-2). Net: after five consecutive rounds of
targeted repair, a three-line edit to `dev/validate-lexer-probes.mjs` still makes control 401
vacuous with the whole 492-control suite green.

The structural lesson this round supplies, which the previous four did not, is that the defect is
not "a missing pattern" but **"a check that reads raw text"**. Every surviving instance of the class
is a raw-source `.test()`/`.includes()` in `dev/validate-fixtures.mjs` where the corresponding
masked read exists two functions away. That is a mechanical, greppable remediation, not another
point patch.

Neither gate can be closed by another documentation pass. The first needs one `windows-validator`
run on both matrix legs. The second needs the masked-source conversion in P2-1, the offset-anchored
import pin in P3-1, and the positive half in P3-2.

### P3-A. The review ledger no longer renders as a ledger

Cross-reference of Part 1's P3-4 at release scope. `docs/reviews/README.md` is the artifact every
release record points a reviewer at (`CHANGELOG.md` cites it by name in at least four Unreleased
paragraphs). Rows `:60`, `:62`, `:64`–`:83`, `:85` and `:87` — including both round-46 rows added by
this commit — do not render as table rows because of blank lines at `:59`, `:61`, `:63`, `:84`,
`:86` and `:88`. Because `dev/validate.mjs` restricts its Markdown contracts to `skill/` and
`skills/` (`:89-107`), no control in the repository sees it. For a project that ships Markdown-
contract enforcement as its product, a broken table in its own governance record is a release-facing
defect, not cosmetic.

### P3-B. The coordinator's remaining option surface is still unexercised

Cross-reference of Part 1's closure of round-46 P3-2. Control 487 now covers exit-status forwarding
and `stdio: 'inherit'`, which were the two round 46 named. Still unexercised by any control, and —
given P2-A — by anything at all: argument forwarding (`dev/validate-all.mjs:43`), `cwd: root`
(`:44`), `timeout` (`:46`), `killSignal` (`:47`), the `RUST_INTEL_VALIDATE_TIMEOUT_MS` malformed
branch (`:34-40`), and the phase *count*. `dev/validate-all.mjs` is the entrypoint for
`npm run validate`, `repository-checks`, `windows-validator`, `node-floor` and the `publish` job's
sanity checks (`package.json:21`, `.github/workflows/ci.yml:41`, `:230`, `:316`,
`.github/workflows/npm-publish.yml:61`).

### P3-C. Closure prose still states classes from single reconstructions — fifth consecutive round

Part 1's P3-1 and P3-3 are release-record defects as much as code ones.
`CHANGELOG.md:302-303` explicitly adopts the rule round 46 recommended ("Closure below is stated per
reconstruction actually run, not per class"), and then `:305` states "a copy inside a comment or a
string satisfies nothing; a forged module path fails the raw half" and `:328` states "the pins
additionally close the replacement forgery". Neither is a per-reconstruction statement, and neither
holds. `docs/reviews/README.md:87` carries the same two claims.

The pattern is now five deep: round 43 ("a size-conditional facade still passed"), round 44 ("an
early-return facade above the marker line still passed"), round 45 ("a module-scope wrapper still
passed"), round 46 ("a comment-hidden wrapper still passed"), round 47 (a raw-text `helperContract`
still passes). Each round's fix was correct for the instance it was given and each round's *record*
generalized it. The cure remains procedural: enumerate the reconstructions run, and let the class
claim be made by the reviewer.

### Release-readiness evidence at `46ca15b`

| Area | Evidence |
|---|---|
| Full validator | **Not independently verified this round** (static-only review by instruction). One local Windows run is recorded for the current state (432 s, exit 0, 492/492 controls, `CHANGELOG.md:353-356`), scoped to the tree before its own figures were inserted; no SHA. Earlier runs remain attributed to `49dd4f0` and to named pre-final-edit trees. Round 42's two `0xC0000409` failures stand unexplained. |
| CI | **None at this head, and none for any current lane.** Newest run `34019219895` (success, 2 m 37 s, 2026-09-06) is at `3ed04b9`, 96 commits behind. |
| Fixture authority | **Verified.** Header (`dev/validate-fixtures.mjs:5`, `:10-11`), `CONTROL_REGISTRY_TOTAL = 492` (`:100`), `README.md:48` and `CHANGELOG.md:99` all state 492 = 416 (390 + 26) + 76 and agree; the focused count of 26 is confirmed by hand (21 `expectLexerProbe` + 5 non-default-script spawns). |
| Lexer semantics | Unchanged (`dev/js-lexer.mjs` byte-identical in this window). The 42-unit marker / 1,999,958 filler / index 1,999,959 trace re-verified against `expectedControl401Observation` and control 492's facade. |
| Anti-vacuity | **Open, with one full bypass (P2-1) and one specifier hole (P3-1).** Round-46's demonstrated facade is genuinely dead; the class is not. |
| Work-was-done floors | **Design sound, enforcement forgeable.** The ratio-or-delta pair is causal and portable; its inputs are pinned only by raw-text patterns (P2-1) and its negative control is satisfied by disabling it (P3-2). |
| Coordinator contracts | **Executed and now discriminating on status and stdio.** Argument forwarding, `cwd`, `timeout`, `killSignal` and the timeout-parse branch remain unexercised (P3-B). |
| Job timeouts | **Coherent and pinned.** `repository-checks` 50, `windows-validator` 50, `node-floor` 50, `publish` 45 against a computed minimum of 45; controls 489/490 prove both pins fire. |
| Workflow reference integrity | **Unchanged** (`dev/validate.mjs:2088-2133`, control 485). |
| Mirror parity | **Verified.** `git ls-files -s skill` vs `git ls-files -s skills/rust-intel`: thirteen files, identical blob hashes (diff of the hash lists is empty). |
| Version/manifest state | **Correct pre-bump.** `package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; `engines.node` `>=24.0.0`; latest local and remote tag `v0.6.0`; no `v0.7.0` anywhere. |
| Semver classification | **Re-derived against `v0.6.0` and fully verified** (round-46 Part 2 P3-A closed): 37 packaged files `+2448/−759`; rule text 26 files `+992/−574` = 1,566 lines; category-header sets identical; `bin` targets unchanged; `commands/` unchanged; `engines.node` `>=16` → `>=24.0.0` is the MINOR trigger. |
| Packaging | **Not re-verified** (`npm pack` is a package command, excluded by instruction). `files` unchanged from round 42's verified dry run. |
| Recovery matrix | Definition unchanged in this window; still no execution evidence at any head. |
| Environment knobs | **Now all four documented** (`README.md:93`, `:95`). `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` still accepts a tripwire-disabling value and is silent on the passing path (P3-5). |
| Release records | **Ledger table structurally broken** (P3-A); two closure claims in `CHANGELOG.md` and the ledger do not hold (P3-C). |
| History integrity | **Sound in this window.** `46ca15b` is self-consistent: every path its new controls resolve exists at that commit, controls 491/492's mutations apply to files present in `validateInputs`, and the registry/header arithmetic balances. |

**Release verdict: NOT READY for `v0.7.0`.** P2-A is now in its eighth round and remains the only
finding that has never moved. P2-1 is a regression in substance — the anti-vacuity gate is bypassable
again, by the same mechanism class, introduced by the commit that closed the previous instance —
and it is the item that should be fixed first, because it is cheap (mask the probe source), because
it is greppable (every remaining raw-source `.test()` in the fixture file is a candidate), and
because a first CI run will not find it. Push the head, fix P2-1 and P3-1 with the two one-line
structural changes proposed, give control 491 the positive half its sibling already has, repair the
ledger table, and correct the two class claims. Only after a clean reviewed head with real
exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish sequence begin.

## Static-verification record

| Check | Method | Result |
|---|---|---|
| Commit window | `git log --oneline c2ee3fb..HEAD` | One commit, `46ca15b`; 4 files, `+314/−67`. |
| Packaged-surface delta (window) | `git diff --name-only c2ee3fb..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` | Empty. |
| `helperContract` source | Read of `dev/validate-fixtures.mjs:187`, `:4498` | Tested against the **raw** probe file; no masked variant of `lexerProbeSource` exists anywhere in the file (`grep` for `maskJsNonCode(lexerProbeSource)`/`lexerProbeMasked` returns nothing). **Bypassable** — round-47 P2-1. |
| Full-suite bypass trace | Hand-trace of a three-line forged `dev/validate-lexer-probes.mjs` against controls 401, 458, 459, 460, 491, 492, 399/400/402/409–478 and `dev/validate.mjs:31`, `:2151` | All pass; the 2,000,000-unit scan never runs. The comment preserves the adjacency pattern (`\n` + six spaces between `marker);` and `scanMemory`); the `scanMemory = scanMemory && {…}` override is null-preserving, so control 491's mutation still drives the floors to `null`. |
| Pinned import masked image | Offset-by-offset trace of `maskJsNonCode` (`dev/js-lexer.mjs:61-66`, `:161-170`, `:237-253`, `:450-468`) over the 66-unit pinned line | Offsets 49–64 blanked; image is `import { literalTrueCompletionDiagnostics } from ` + 16 spaces + `;`. Commented/stringified copies mask to 66 spaces. **Round-46 P2-1 closed.** |
| Specifier laundering | Constructed `import { literalTrueCompletionDiagnostics } from './f.mjs'/*aaa*/;` (9 + 7 = 16 masked units) + commented decoy, traced against `:4435-4436`, `:4450-4451` | Both halves satisfied by different lines; `identityHeld` true; control 458 passes. Caught only incidentally by control 459 (missing temp-tree file) and control 492 (duplicate-binding `SyntaxError` in its facade). **Round-47 P3-1.** |
| Binding-shape regex completeness | Enumeration against ECMAScript declaration forms | `const {X} = …`, `let [X] = …`, `function* X`, `\u`-escaped spellings and comma-expression assignments all evade the regexes — and are all unreachable, because a live named import forbids a second module-scope binding of the same name and makes assignment to it a `TypeError`, while the first-statement pin forbids a preceding shadow in the function body. **No exploitable gap.** |
| Non-import construct producing the masked image | Enumeration of maskable spans | Only a named `ImportDeclaration` can produce these visible tokens: `import` is reserved in module code; a block comment in the specifier position (`from /*…*/;`) is a `SyntaxError`; `/` after `from` is division, not a regexp (`canStartRegex` is false after a non-prefix word, `dev/js-lexer.mjs:308`). **Masked half is sound for liveness.** |
| Work-floor gate | Read of `dev/validate-fixtures.mjs:451`, `:511`, `:531`, `:4703`, `:4709` | `control401ScanHeapRatioFloor = 0` disables both signals in control 401 **and** satisfies control 491's `!floorsSatisfied`. **Round-47 P3-2.** |
| Control 491 mutation semantics | Read of `:4692-4711` against `dev/validate-lexer-probes.mjs:64`, `:124`, `:147-148` | The anchor occurs exactly once; after replacement both signals are `null` and the child stays green. The negative direction works; there is no positive assertion. |
| Control 492 construction | Full read of `:4722-4771`; trace of the facade's masking, the 42-unit marker tail recovery, and the alias facade | `facadeChildWouldPass` holds (index 1,999,959 = expected); `facadeEvaluation.identityHeld === false`, `hasPinnedScannerImport === false`, `hasUnguardedFirstStatementScannerCall === true`; `realEvaluation.identityHeld === true` (no false rejection). ✔ Alias assertion is carried by the raw half rather than the alias regex (P4). |
| Control 487 exit mapping | Read of `:4612-4627` against `dev/validate-all.mjs:42-59` | Status 7 forwarded verbatim (`7 > 0 && 7 < 256`); a literal `process.exit(1)` fails the control; the sentinel reaches the parent only via `stdio: 'inherit'`; neither `phase=core passed` nor `phase=fixtures` is emitted. ✔ **Round-46 P3-2 closed.** |
| `process.stdout` write synchrony | Node `process` documentation, "A note on process I/O" ([nodejs.org/api/process.html#a-note-on-process-io](https://nodejs.org/api/process.html#a-note-on-process-io)) | Writes to pipes are synchronous on both Windows and POSIX, so control 487's sentinel cannot be lost to the immediately following `process.exit(7)`. Files are synchronous on both; only TTYs are asynchronous, and only on Windows. |
| GFM table termination | GFM spec, §4.10 Tables ([github.github.com/gfm/#tables-extension-](https://github.github.com/gfm/#tables-extension-)) | "The table is broken at the first empty line, or beginning of another block-level structure." Blank lines at `docs/reviews/README.md:59`, `:61`, `:63`, `:84`, `:86`, `:88` split the ledger; rows after `:58` render as paragraphs. **Round-47 P3-4.** |
| Ledger coverage by the validator | Read of `dev/validate.mjs:76-107`, `:2323` | Markdown contracts are applied only to files under `skill/` and `skills/`; `docs/reviews/README.md` is outside every table/fence/body-width check. |
| Registry totals | `dev/validate-fixtures.mjs:5`, `:10-11`, `:100`, `:331`, `:379`, `:4784-4802`; hand count of spawn sites | 492 = 416 (390 validator + 26 focused) + 76. Focused = 21 `expectLexerProbe` + 5 non-default-script spawns (459, 460, 487, 491, 492). ✔ |
| Semver re-derivation | `git diff --stat v0.6.0^{}..HEAD` over packaged paths; over `skill skills`; `git diff --name-only … -- commands`; sorted `## §X` header-set diff at both refs; `git show v0.6.0^{}:package.json` | 37 files `+2448/−759`; 26 files `+992/−574` = 1,566 lines; `commands/` empty; header sets identical (65 headers, 59 numbered); `engines.node` `>=16` at `v0.6.0`, `>=24.0.0` at HEAD; `bin` targets identical. **Every number in `CHANGELOG.md:15` verifies.** |
| Mirror parity | `git ls-files -s skill` vs `git ls-files -s skills/rust-intel` | Thirteen files, identical blob hashes. |
| Manifests/tags | File reads, `git tag -l`, `git ls-remote --tags origin` | All `0.6.0`; latest tag `v0.6.0` locally (`b3f77ab`, peeled `d5b15ec`) and remotely; no `v0.7.0`. |
| Job timeouts | `.github/workflows/ci.yml:19`, `:219`, `:235`, `:309`, `:335`, `:438`; `.github/workflows/npm-publish.yml:36` | 50/50/45/50/45/45 and publish 45; the three coordinator lanes and publish satisfy the computed minimum 45. Control 489's anchor (`  node-floor:` at `:306`, first `    timeout-minutes: 50` at `:309`) is still correct. |
| Determinism comment | Read of `dev/validate-fixtures.mjs:4112-4113` | Unchanged for a third round. |
| Remote/CI state | `git ls-remote origin refs/heads/main`, `git rev-list --count`, `gh run list --limit 8` | `3ed04b9`; 96 commits ahead; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| Prior-round P2-A continuity | Cross-read of rounds 40–46 Part 2 | Every round from 40 through 46 names it; round 47 is the eighth consecutive. |
| ECMAScript module binding uniqueness | ECMAScript, *Module Semantics* — early errors for duplicate `LexicallyDeclaredNames`/`VarDeclaredNames` in a `Module`, and `ImportBinding` immutability | A module may not declare a second module-scope binding for an imported name (early `SyntaxError`), and assignment to an import binding is a `TypeError` in strict-mode module code. This is what makes the binding-shape regexes' gaps unreachable and what makes control 492's facade builder collide with any laundered live import. |

## Red-tier and out-of-scope inventory

- No normative skill, mirror, command, installer, manifest, or workflow file changed in this window;
  all thirteen mirror files are byte-identical to each other and unchanged since `633a0da`.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue or cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added. Cargo, clippy, Miri,
  `cargo-semver-checks`, audit, and deny remain inapplicable: this repository has no Cargo manifest
  or lockfile, and the executable change is Node repository tooling.
- The forged modules quoted in P2-1 and P3-1 exist only in this report. Neither was written to any
  file, staged, committed, or executed; both are hand-traces against the committed source.
- No dynamic verification was performed by this review, by instruction. Every runtime number quoted
  here is attributed to a commit body, a release record, or `gh run list`.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract; only the documented process-interruption guarantee is in scope.
- No product code, manifest version, tag, remote ref, npm artifact, or ledger row was changed by
  this review. This report file is the only authored change; the ledger row for round 47 is
  outstanding work for the fixing pass.

## Recommended correction order

1. **Mask the probe source before applying `helperContract`** (P2-1). One added line
   (`const lexerProbeMasked = maskJsNonCode(lexerProbeSource);`) and one changed argument at
   `dev/validate-fixtures.mjs:4498`. Then audit the file for every remaining raw-source
   `.test(`/`.includes(` over a JavaScript input and convert or justify each one — that grep is the
   mechanical form of the class this loop has been chasing for five rounds. Add an exclusivity pin
   requiring exactly one `scanMemory =` assignment in the masked probe.
2. **Make the import pin's two halves witness the same line** (P3-1). Masking preserves offsets, so
   locate the pinned masked image in `masked`, require it to start a line, and require the raw bytes
   at the same offset to equal the pinned line. One line; retires the specifier hole and stops
   relying on controls 459 and 492 to catch it by accident.
3. **Give control 491 the positive half control 492 already has** (P3-2): assert that the unmutated
   telemetry satisfies `evaluateWorkFloors` at the real floors, and change the enable condition from
   `scanHeapRatioFloor > 0` to `scanHeapRatioFloor > 0 || scanArrayBuffersDeltaFloor > 0` so the
   GC-immune arm can stand alone.
4. **Push the head and obtain one complete run of the current `validate` workflow** (P2-A),
   including `windows-validator` on both Node legs and `windows-install-smoke` on both PowerShell
   legs. Record the run id in the ledger, as rounds 23 and 26 did. Eight rounds is enough; note
   explicitly that CI will not find items 1–3, so this is parallel work, not sequential.
5. **Repair the ledger table** (P3-4/P3-A): delete the six blank lines at
   `docs/reviews/README.md:59`, `:61`, `:63`, `:84`, `:86`, `:88`. Optionally add
   `docs/reviews/README.md` to the validator's Markdown file set so the ledger is held to the
   contract the skill text is held to.
6. **Correct the two class claims** (P3-3/P3-C) at `CHANGELOG.md:305` and `:328` and in
   `docs/reviews/README.md:87`: "a copy inside a comment or a string satisfies the raw half but not
   the masked half; the module specifier is not pinned" and "an in-place replacement of the sampling
   statement is rejected; a subsequent overwrite is not asserted against".
7. **Finish round 46's P3-4** (P3-5): floor the `RUST_INTEL_CONTROL401_MIN_PEAK_RSS_MB` override (or
   echo the effective value on the passing path), and add a negative control for its malformed-value
   branch — the only `RUST_INTEL_*` parse in the fixture file still uncovered.
8. Close the smaller gaps: correct the determinism comment at `dev/validate-fixtures.mjs:4112-4113`
   (third round), pin `regexStarts`'s membership in the cached result so the delta stays GC-immune,
   align `CHANGELOG.md:99` with `README.md:48`'s telemetry wording, fix `README.md:48`'s "three
   runs" clause, hoist the recomputed `pinnedScannerImportMaskedLine`, and clear the round-44/45/46
   P4 carry-overs.
9. Re-run an independent P0–P3 review on the resulting head. Only after a clean reviewed head with
   real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish
   sequence begin.
