# Round 45 review of the latest commits and v0.7.0 release readiness — 2026-09-07 16:26 CEST

## Scope and method

- Review base: `c9a37cb` (round 44's report commit).
- Reviewed head: `1ba3956d14c4ae8fdf8f48633b7c411c808bba47`.
- Commit window: `c9a37cb..HEAD` — **one** commit, confirmed by `git log --oneline c9a37cb..HEAD`:
  `1ba3956` ("fix: address round 44 review findings"). Eight changed files, `+200/-46`:
  `.github/workflows/ci.yml`, `CHANGELOG.md`, `README.md`, `dev/validate-fixtures.mjs`,
  `dev/validate-lexer-observations.mjs`, `dev/validate-lexer-probes.mjs`, `dev/validate.mjs`,
  `docs/reviews/README.md`.
- Whole-repo context: the reviewed head is **92 commits** ahead of `origin/main`
  (`git ls-remote origin refs/heads/main` = `3ed04b9`, unchanged since round 42). Nothing in this
  window, or in the 91 commits before it, has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, probe, installer,
  build, or package command was executed. Every dynamic number below is attributed to its source
  (round 42's or round 44's measurements, the commit body, the release records, or `gh run list`)
  and labelled as such; nothing is re-measured. All regex, arithmetic, budget and control-flow
  claims are hand-traced against the committed source and shown here.
- Method: `git log`/`show`/`diff`/`cat-file`/`ls-files -s`/`ls-remote`, direct file reads, read-only
  `gh run list`, hand-tracing of the new control-401 marker arithmetic and lexical budget through
  `dev/js-lexer.mjs`, of control 458's `maskJsNonCode` reachability check against the shipped
  observation module, of the rewritten coordinator phase pins and the new job-timeout pin against
  both workflow files, of `dev/validate-lexer-probes.mjs`'s telemetry construction, and
  primary-source lookups for the ECMAScript identifier grammar, Node's `process.memoryUsage`,
  `process.resourceUsage` and `child_process` contracts, V8's `--max-old-space-size` semantics,
  and GitHub Actions job timeouts.
- `skill/`, `skills/rust-intel/`, `commands/`, `bin/`, both plugin manifests, `package.json` and
  every installer script are **byte-identical to the round-44 reviewed head**
  (`git diff --name-only c9a37cb..HEAD -- bin skill skills commands .claude-plugin .codex-plugin
  package.json rust-cc-*` is empty), so normative rule text was checked for release/mirror
  consistency only, not re-audited.
- Authored change set: this report file alone. As in rounds 43 and 44, the instruction for this
  round authorized exactly one new file, so the ledger row for round 45 remains outstanding work
  for the fixing pass.

## Executive result

- **No P0 and no P1 finding**, in either part.
- **Part 1 (commit window): one P2, five P3, ten P4 observations.**
- **Part 2 (whole repository): two P2, three P3.** Part 1's P2-1, P3-2, P3-3 and P3-4 are also
  release-gate items and are cross-referenced rather than double-counted.
- Round 44's **P3-2 is genuinely closed** (`README.md:48` now credits `49dd4f0` with creating
  `dev/validate-all.mjs` and `dev/validate-lexer-observations.mjs`), and Part 2's **P3-A is closed
  and mechanically pinned** (`ci.yml:19` `:219` `:309` are all 50; `npm-publish.yml:36` is 45;
  `dev/validate.mjs:2192-2212` derives the required minimum `2 × 20 + 5 = 45` from the
  coordinator's own parsed default, and I verified all four lanes satisfy it at this head with no
  self-breakage).
- Round 44's **P3-1 is substantially — not completely — closed.** The four layers are real and I
  hand-verified each: the marker id is 6 digits for every possible `Date.now()` value, the scan
  still charges exactly 2,000,000 of a 2,000,000 budget, the expected source index
  `2_000_000 − markerLength + 1` is exactly what `closeFrame` reports, and control 458's
  reachability check does correctly reject every facade placed *above* the scanner statement.
  Round 44's demonstrated facade is dead. What remains is narrower but real: the commit's central
  claim that "the expected result is unknowable from source" is **false** — the marker id is
  embedded in the very string the observation function receives, so a facade can read it back. The
  first-statement anchor constrains statement *position*, not callee *identity*, and neither the
  observation module's import line nor `dev/js-lexer.mjs`'s scan body is pinned. Two vectors
  therefore survive with control 458 and control 459 both green, gated only by the new memory
  floors.
- **Those memory floors are themselves the round's most serious finding.**
  `peakHeapUsed` is `Math.max(initialMemory.heapUsed, memory.heapUsed)`
  (`dev/validate-lexer-probes.mjs:140`) — two boundary samples, not a peak — and by the time the
  terminal sample is taken every allocation from the big scan is unreachable garbage, because the
  companion scan has already evicted it from the one-entry lexical cache
  (`dev/js-lexer.mjs:38`, `:451-452`). A 32 MB floor on uncollected garbage is a GC-scheduling
  assertion. `peakRss`'s 100 MB floor is an absolute byte constant calibrated on exactly one host
  (win32 10.0.19045), and both ubuntu lanes will evaluate it for the first time on the very CI run
  the release is waiting for.
- **Round 44's P3-3 is closed for the round-43 record and immediately regressed for the round-44
  record.** `CHANGELOG.md:211` and `docs/reviews/README.md:81` describe the round-44 fixing pass as
  "in one working tree on top of `6bc997b`; commit, push, bump, tag, and publication remain
  separate, explicit, human-authorized actions" — while shipping inside commit `1ba3956`. This is
  the third consecutive round with the same self-description defect.
- **Nothing has been pushed and no CI run exists for any current lane.** `origin/main` is still
  `3ed04b9`; the newest recorded run remains `34019219895` (`validate`, success, 2 m 37 s,
  2026-09-06) at `3ed04b9`. This is the **sixth consecutive round** (40, 41, 42, 43, 44, 45) to name
  it as the dominant blocker. New this round: the *packaged* executable surface has changed by
  `+1,416/−180` since `3ed04b9`, including the entirely new 419-line `bin/install-transaction.js`,
  and `package.json:9-18` puts `bin/` in the published tarball.
- All three manifests remain `0.6.0`, `engines.node` is `>=24.0.0`, no `v0.7.0` tag exists locally
  or remotely, the mirror is thirteen byte-identical files by blob hash, and **no packaged path
  changed in this window** — the round-23 `0.7.0` MINOR classification is intact for the window,
  though it has never been re-derived against the packaged `bin/` delta accumulated since it was
  made (Part 2 P3-A).
- **Release verdict: NOT READY for `v0.7.0`.**

## Part 1 — findings on the commit window

### P0 and P1

None. No security-relevant surface, packaged artifact, installer behaviour, or normative rule text
changed in this window; the only executable changes are repository tooling (`dev/validate.mjs`,
`dev/validate-fixtures.mjs`, `dev/validate-lexer-probes.mjs`,
`dev/validate-lexer-observations.mjs`), CI job timeouts, and release documentation.

### P2-1. Control 401's new work-was-done floors gate the whole suite on a non-deterministic, single-host-calibrated quantity

Locations: `dev/validate-fixtures.mjs:430-436`, `:461-482` (`:472`, `:475`), `:4057-4061`,
`dev/validate-lexer-probes.mjs:119`, `:131-145` (`:140`, `:142-143`), `:376` (`lexerProbeHeapMb`),
`dev/js-lexer.mjs:38`, `:451-452`.

Control 401 now fails unless the focused child reports `peakHeapUsed >= 32 MiB` **and**
`peakRss >= 100 MiB`. A failure of control 401 is a `failures.push` (`:479`), and any non-empty
`failures` array exits the fixture phase with status 1 (`dev/validate-fixtures.mjs:4496-4499`),
which the coordinator maps to a failed run. So both floors are hard release-suite gates. Two
independent problems:

**(a) `peakHeapUsed` is not a peak; it is uncollected garbage at process exit.**

```js
// dev/validate-lexer-probes.mjs:140
peakHeapUsed: Math.max(initialMemory.heapUsed, memory.heapUsed),
peakHeapSource: 'terminal-boundary-sample',
```

`initialMemory` is sampled at `:119`, before `checkControl` runs; `memory` is sampled inside
`telemetry()` at `:132`, after it returns. There is no sampling in between. By the time the
terminal sample is taken, nothing from the 2,000,000-unit scan is reachable: `observation` and
`companion` hold only `kind`/`inputLength`/`ids`/`indexes`, the 2 MB source string and the
2 MB `regexStarts` buffer (`dev/js-lexer.mjs:39`) are unreferenced, and the module-level one-entry
lexical cache (`:14-15`, `:38`, `:451-452`) has already been overwritten by the *companion* scan,
which runs second (`dev/validate-lexer-probes.mjs:62-63`). `process.memoryUsage().heapUsed` reports
V8's used heap including garbage not yet collected, so the ≈71 MB figure the comment quotes is the
amount of dead data that happened not to have been collected yet at that instant. If V8 finalizes
a major collection anywhere between the last `report()` and `process.memoryUsage()` — including
during the tiny companion scan — `heapUsed` collapses to single-digit megabytes and control 401
fails on a correct scanner. That is a flake, not a detection.

The comment's own numbers make this concrete rather than theoretical. The child is spawned with
`--max-old-space-size=64` (`dev/validate-fixtures.mjs:376`, `:378`), yet the documented genuine
figure is ≈71 MB of `heapUsed`. Either the quoted number was not measured under the probe's actual
flags, or the child completes while over its own old-space budget — which is only possible because
V8 was collecting aggressively throughout, i.e. exactly the condition under which the terminal
sample is least stable. The repository has already observed the failure mode at the boundary: the
round-42 ledger row records "one focused-child V8 OOM" at this workload
(`docs/reviews/README.md:77`).

**(b) The 100 MiB `peakRss` floor is calibrated on one platform and will first execute on two
others.**

`peakRss` is the one honest high-water mark here — `process.resourceUsage().maxRSS × 1024`
(`dev/validate-lexer-probes.mjs:134`, `:142`), which libuv fills from `ru_maxrss` on Linux and
`PeakWorkingSetSize` on Windows. But 100 MiB is an absolute constant derived from a single
observation on `win32 10.0.19045 / Node v24.12.0` (`dev/validate-fixtures.mjs:430-434`). Windows
working sets are systematically larger than Linux RSS for the same Node workload, and Node 24's
baseline RSS on `ubuntu-latest` is in the 40–55 MB range before any workload. The measured work
here is modest — a 2 MB one-byte source string, a 2 MB `Uint8Array`, a handful of 2 MB slices
(`dev/js-lexer.mjs:263`, `:664`) — so a Linux peak in the 60–90 MB band is entirely plausible, and
that fails the floor.

Both ubuntu lanes run the full fixture phase: `repository-checks` invokes the coordinator directly
(`ci.yml:41`) and `node-floor` runs `npm run validate` (`ci.yml:316`). Given Part 2's P2-A, the
first execution of this floor on Linux will be the first CI run the release has been waiting six
rounds for. A tooling-calibration failure there is indistinguishable, on first sight, from a real
regression, and it is precisely the outcome that keeps P2-A open for a seventh round.

I rate this P2 rather than P3 because it is a newly introduced hard gate on a quantity that is
neither deterministic nor portable, it can fail a correct tree, it sits in the release-gating
suite with no retry or tolerance, and it was introduced as the load-bearing layer of the P3-1 fix
(see P3-1: with the "unknowable from source" claim falsified, the floors are the *only* thing
standing between the residual facade vectors and a green suite).

Correction: replace the boundary-sampled heap floor with something causal — e.g. have the probe
record `process.memoryUsage().heapUsed` *inside* the scan (a sampling callback, or one
`process.memoryUsage()` immediately after `literalTrueCompletionDiagnostics` returns and before the
companion call) and assert a *ratio* against the same child's companion-only measurement rather
than an absolute byte count. Ratios are portable; absolute byte floors are not. If an absolute
`peakRss` floor is kept, derive it per-platform, and do not merge it before one CI run on
`ubuntu-latest` has reported the actual value.

### P3-1. The anti-vacuity gate is narrower but still open, and the commit's central claim about it is false

Locations: `dev/validate-fixtures.mjs:410-429`, `:4328-4370` (`:4351-4360`), `:4372-4395`,
`dev/validate-lexer-observations.mjs:1`, `:4`, `:6-14`, `dev/validate-lexer-probes.mjs:50-71`,
`dev/js-lexer.mjs:505-759`, `CHANGELOG.md:211-222`, `docs/reviews/README.md:81`.

What the fix genuinely achieves, verified by hand rather than trusted from prose:

- The marker id is always six digits. `100_003 + (Date.now() % 800_000)` ranges over
  `[100_003, 900_002]` inclusive, and both endpoints are six digits. The comment at
  `dev/validate-fixtures.mjs:414-415` is correct.
- The budget still sits at exactly zero margin. Marker length is now 42
  (`;` + 27 + `(` + 6 + `,` + ` ` + `true` + `)`), filler `1_999_958`, total 2,000,000 code units.
  Every branch of `scanLexical`'s main loop charges exactly one operation per code unit
  (`dev/js-lexer.mjs:208`, `:262`, `:338`, `:257`), so the scan charges exactly 2,000,000 against
  `MAX_LEXICAL_OPERATIONS = 2_000_000` (`:9`, `:90-93`) and `operations > MAX` stays false. The
  invariant is marker-length-independent, so any 6-digit id works and control 402's 2,000,001-unit
  probe is still one unit above.
- The expected index is right. `callInfo` returns `index: last.start` (`:585`), the callee word
  starts at `fillerLength + 1`, and `expectedControl401Observation` computes
  `2_000_000 − markerLength + 1` (`dev/validate-fixtures.mjs:426`) — identical. The child's own
  predicate independently requires `indexes[0] === fillerLength + 1` (`:70` of the probe).
  `closeFrame` yields `id = Number('<markerId>')` via `:621-622`, so `ids: [markerId]`.
- Control 458's reachability check is correct for what it checks. `maskJsNonCode` preserves
  offsets and blanks comment and string interiors, so a preceding branch cannot hide in a comment
  and a comment cannot disguise a branch; `indexOf(scannerStatement, bodyOpen)` finds the *first*
  occurrence after the body brace, so a facade above the statement leaves non-whitespace in
  `scannerPreamble` and fails `/^[ \t\r\n]*$/u` (`:4357-4360`). Every degenerate case fails closed
  (anchor absent → `functionStart < 0` → `scannerPreamble === null` → false).
- Round 44's exact facade is now rejected twice over: its hard-coded `ids: [902]` cannot match a
  run-time id, and its position above the anchor fails control 458. The commit body's narrow claim
  is true.

What is not closed:

**The expected result *is* knowable from source.** The commit body says the marker id is "passed
via argv, so the expected result is unknowable from source"; `CHANGELOG.md:212-216` and
`docs/reviews/README.md:81` repeat it. But the value the oracle expects is a pure function of the
input string that `observeLiteralTrueCompletion` is handed. The marker sits at the end of that
string, in a fixed shape, and both expected fields are recoverable from it by one regex:

```js
const m = /;completeCurrentControlScope\((\d+), true\)$/u.exec(source);
// ids: [Number(m[1])], indexes: [source.length - m[0].length + 1]
```

`process.argv[3]` is also readable from any module in the child, so even without parsing the input
the id is available. Randomising the id raised the bar against a *constant*; it does nothing
against a facade that looks at its own argument.

**The first-statement anchor pins statement position, not callee identity.** Control 458 requires
the literal text `const diagnostics = literalTrueCompletionDiagnostics(source);` to be the first
statement of `observeLiteralTrueCompletion`. Nothing pins what that identifier resolves to.
`dev/validate-lexer-observations.mjs:4` — the import line — is unpinned: it appears in no
`helperContract` pattern (those eight patterns are all tested against `lexerProbeSource`,
`:4363`), in no `dev/validate.mjs` source contract (the module appears there only in the `required`
existence list at `:31` and as a `node --check` needle at `:2151`), and in no other control. So:

```js
import { literalTrueCompletionDiagnostics as realScan } from './js-lexer.mjs';
function literalTrueCompletionDiagnostics(source) {
  if (source.length === 2_000_000) {
    const m = /;completeCurrentControlScope\((\d+), true\)$/u.exec(source);
    if (m) return [{ id: Number(m[1]), index: source.length - m[0].length + 1 }];
  }
  return realScan(source);
}
export function observeLiteralTrueCompletion(source) {
  const diagnostics = literalTrueCompletionDiagnostics(source);   // byte-identical first statement
  ...
}
```

Trace against every gate: control 401's expected observation matches exactly (id and index both
derived from the input); control 458's anchored preamble is still pure whitespace and the companion
still takes the real path, so it passes; control 459 replaces the anchor line with
`const diagnostics = [];` in its temp copy, the wrapper is then never called, the child returns
`ids: []` and exits 1, so control 459 *passes* while the facade goes unnoticed. Only the P2-1
memory floors object — and an author who is deliberately faking the scan defeats a 32 MB/100 MB
floor with one `'y'.repeat(40e6)`, which costs milliseconds.

**The same applies one file down.** A length-gated fast path inside `dev/js-lexer.mjs`'s
`completionDiagnostics` keyed on `source.length === 2_000_000` leaves every character of the
observation module untouched. Control 457 (`:4310-4326`) pins only the bounded lexical cache;
control 399 uses 100,001 units, control 400 100,000, control 402 2,000,001 — none collides with the
gated length. Again, only the memory floors remain.

The residual class is materially narrower than round 43's or round 44's: it no longer matches the
shape a maintainer would write by accident, and both surviving vectors require touching a file the
change is not obviously about. That is real progress. But three release-facing records again assert
more than was verified — the ledger's "a stronger argv-forging facade … still rejected by the
anchored contract" describes a facade placed *above* the anchor; the module-scope variant that
leaves the anchor intact was not among the reconstructed tests.

Correction: pin callee identity, not just position — require the observation module's import to be
exactly `import { literalTrueCompletionDiagnostics } from './js-lexer.mjs';` and require that
identifier to have no other binding in the module (a `maskJsNonCode` scan for a second
`literalTrueCompletionDiagnostics` declaration/assignment is enough). Then narrow the closure
prose: what is proven is that no facade *positioned above the anchored statement in the observation
module* can pass, not that no facade can.

### P3-2. The round-44 fixing records describe themselves as uncommitted while shipping inside `1ba3956`

Locations: `CHANGELOG.md:209-211`, `docs/reviews/README.md:81`.

```text
CHANGELOG.md:210-211: "The round-44 review (...) is disposed as follows, in one working tree on top
                       of `6bc997b`; commit, push, bump, tag, and publication remain separate,
                       explicit, human-authorized actions."
docs/reviews/README.md:81: "Implemented in one working tree on top of `6bc997b`; commit, push,
                       bump, tag, and publication remain separate, explicit, human-authorized
                       actions."
```

Both sentences are the content of commit `1ba3956`, whose parent is `c9a37cb`. Round 44's P3-3
raised exactly this defect for the round-43 records; the fix corrected the *round-43* row
(`CHANGELOG.md:179` now reads "committed as `6bc997b`", `docs/reviews/README.md:80` reads
"Committed as `6bc997b`") and simultaneously recreated the defect one row down for round 44. The
round-43 disposition is now locatable by SHA; the round-44 disposition is not, and it explicitly
disclaims a commit it is part of.

This is now three consecutive rounds of the same pattern (round 43's P3-2 about `49dd4f0`, round
44's P3-3 about the round-43 rows, this one), and the mechanism is structural, not careless: the
fixing pass writes its own disposition text before its SHA exists and never amends it afterwards.
A fix that only edits the previous row will regress again next round.

Correction: write the disposition rows with a placeholder and amend the commit to substitute the
real SHA, or state the parent plus "committed as the commit containing this row" — a form that
stays true without knowing the hash. Correcting only the round-44 row leaves the mechanism in
place.

### P3-3. The fresh Windows evidence has no SHA and cannot have been taken at the committed tree

Locations: `CHANGELOG.md:236-238`, `docs/reviews/README.md:81`, `README.md:48`, commit body.

Round 44's P2-1 asked for one tree, named once, with the SHA. For the three historical runs that is
now delivered: all three records say `49dd4f0`, 484/484 controls, last live control 460, durations
`246.310`/`276.451`/`285.209` s, and all three state that no measurement exists at `6bc997b`. I
cross-read `CHANGELOG.md:195-208`, `docs/reviews/README.md:80` and `README.md:48` and found no
remaining contradiction. That half is closed.

The new evidence reintroduces the defect:

```text
CHANGELOG.md:236-238: "ordinary `npm run validate` on this round-44 fixing tree (Node v24.12.0,
                       Windows 10.0.19045) passed in 368 s with exit 0 and 486/486 controls"
docs/reviews/README.md:81: "ordinary `npm run validate` at this fixing tree ... passed in 368 s"
README.md:48:          "the round-44 fixing run recorded in the CHANGELOG (368 s, exit 0,
                       486/486 controls, same host)"
commit body:           "Fresh evidence recorded for the current tree: 368s, exit 0, 486/486
                       controls."
```

"This fixing tree" / "the current tree" is not a SHA, and by the records' own account (P3-2) it is
an uncommitted working tree. It also cannot be the committed tree: the three files that describe
the run — `CHANGELOG.md`, `README.md`, `docs/reviews/README.md` — are part of the tree, and they
were necessarily written after the run finished. That is not a pedantic point here.
`dev/validate.mjs` performs a large number of content checks against `CHANGELOG.md` and `README.md`,
and `dev/validate-fixtures.mjs:279-303` copies both into every one of the 387 validator temp copies,
so a changed `CHANGELOG.md`/`README.md` changes what those 387 children actually check. The 368 s
result is therefore evidence about a tree that differs from `1ba3956` in three of the validator's
own inputs, and the repository cannot say by how much.

Since this is again the sole quantitative evidence at (approximately) the shipped head for the
largest open behavioural gate, and it is again unattributable, round 44's P2-1 is closed
retrospectively and reopened prospectively. I rate it P3 rather than P2 only because the records no
longer *contradict* each other — the defect is now under-specification, not conflict.

Correction: run the measurement last, after all documentation edits, record it against the exact
`git rev-parse HEAD` of the tree measured, and if that means amending the commit, amend it.

### P3-4. The coordinator's wiring pins are still textual, and the coordinator is still never executed

Locations: `dev/validate.mjs:2162-2186`, `dev/validate-all.mjs:14-28`, `:42-49`,
`dev/validate-fixtures.mjs:4427-4450`.

Three of round 44's P3-4 sub-findings are genuinely fixed, hand-verified:

- **The value swap is caught now.** Each phase's contract is matched inside a slice bounded by the
  next `name: '` (`:2172-2175`), so the core arm can no longer walk past the phase boundary to find
  the fixtures phase's `: '1'`. Swapping the two values fails the core arm.
- **`...phase.env` is pinned** (`:2184-2186`), and control 486 now applies both mutations to one
  copy and requires both diagnostics (`dev/validate-fixtures.mjs:4442-4449`). I checked the needle
  logic: `expectFixture` requires every needle to be present (`:665`), and the two error strings
  `dev/validate-all.mjs phase 'core' …` and `… env: { ...process.env, ...phase.env }` come from two
  independent checks, so removing either check fails the control. That is a real improvement over a
  single-needle assertion.
- **Phase order is pinned** (`:2163-2167`).

What round 44 actually asked for is still absent:

- The `...phase.env` pin is a whole-file regex, not a structural claim about the `spawnSync` options
  object. `const unusedOptions = { env: { ...process.env, ...phase.env } };` alongside a
  `spawnSync(..., { env: { ...process.env } })` satisfies it. The pin moved one level closer to the
  wiring; it is still text.
- **No control executes `dev/validate-all.mjs`.** `grep -n 'validate-all' dev/validate-fixtures.mjs`
  yields only the `validateInputs` entry (`:291`), two comments (`:4415`, `:4427-4432`), control
  486's mutation target (`:4435`) and its needle (`:4449`). The exit-status mapping
  (`dev/validate-all.mjs:50-58`), argument forwarding (`:43`), `cwd`, `stdio: 'inherit'`,
  `killSignal`, and the phase *count* remain unexercised by any control — and, given P2-A, by
  anything at all. Round 44's correction ("add one control that actually *runs*
  `dev/validate-all.mjs` in a temp copy with a trivially failing core phase and asserts the exit
  status and the `phase=core failed` diagnostic") was not implemented.
- The fixtures arm's slice is unbounded to end-of-file (`:2174`), so its lazy `[\s\S]*?` may match a
  `RUST_INTEL_SKIP_NESTED_FIXTURES: '0'` occurring anywhere after the phase object. There is none
  today; the asymmetry with the core arm is latent.

### P3-5. Three of the five new enforcement mechanisms have no negative control

Locations: `dev/validate.mjs:2163-2167`, `:2192-2212`, `:2213-2217`;
`dev/validate-fixtures.mjs:4427-4450`, `:4462-4480`.

`1ba3956` adds five distinct checks to `dev/validate.mjs`. Control 486 exercises two of them (the
per-phase contract via the escape-hatch flip, the env spread via its deletion). The other three
have no control:

| New check | Location | Negative control |
|---|---|---|
| Core phase declared before fixtures | `:2163-2167` | none |
| Per-phase slice (value-swap case) | `:2172-2179` | none (486 only flips the core value) |
| `...phase.env` spread reaches `spawnSync` | `:2184-2186` | control 486 |
| Job timeout ≥ `2 × default + 5` on four lanes | `:2192-2212` | none |
| No workflow-level `RUST_INTEL_VALIDATE_TIMEOUT_MS` | `:2213-2217` | none |

The repository's own established pattern is one negative control per new enforcement — that is what
controls 485 and 486 exist for, and it is why round 43's P2-1 and round 44's P3-4 could be
adjudicated at all. The job-timeout pin is the one that most needs it: it parses two different
sources (a JavaScript literal via `/let timeoutMs = (\d+) \* 60 \* 1000;/u` and YAML via
`yamlJobSection` plus `/^ {4}timeout-minutes:\s*(\d+)\s*$/u`), and a silent regression in either
parse makes it pass vacuously. `timeoutDefaultMatch` failing produces a loud error (`:2194-2195`),
but `jobLines` returning `null` for a renamed job, or a job whose timeout is written as
`timeout-minutes: ${{ … }}`, produces `NaN` and *does* error — so the failure modes are closed;
what is unproven is that the check fires on an under-set timeout, which is its entire purpose.

Round 44's P4 about the execution-split check (`dev/validate-fixtures.mjs:4462-4480`) having no
negative control is unchanged, so this is now four unexercised enforcement mechanisms.

### P4 observations

- Control 401's oracle is no longer deterministic, but the comment introducing it still says it is:
  `dev/validate-fixtures.mjs:4053-4054` reads "These controls use deterministic exception/result
  oracles; elapsed time is intentionally not part of the assertion", three lines above a control
  whose expected id derives from `Date.now()` (`:416-419`) and whose pass condition includes two
  absolute memory floors (`:4059-4060`).
- A control-401 failure is not reproducible from the log. The failure message
  (`dev/validate-fixtures.mjs:479`) prints the child's output — which contains the observed ids —
  but never the *expected* marker id, and the id changes every 800 s of wall clock. Printing
  `control401MarkerId` in the failure string costs one interpolation.
- `peakRssSource` can be mislabelled. `Number.isFinite(usage?.maxRSS)` is true for `0`
  (`dev/validate-lexer-probes.mjs:134`), so a platform reporting `maxRSS === 0` yields
  `peakRss` from the boundary samples while `peakRssSource` still claims
  `'process.resourceUsage.maxRSS'` (`:143`).
- The job-timeout margin is a flat five minutes regardless of what else the lane runs
  (`dev/validate.mjs:2197`). `repository-checks` hosts roughly fourteen other steps inside the same
  50 minutes, and `npm-publish.yml`'s `publish` job sits at exactly the computed minimum (45 vs 45)
  while also running checkout, setup-node, `npm ci`, pack and publish. The records state the 45
  satisfies the minimum, which is accurate; the margin is nonetheless the smallest of the four
  lanes and the least head-room per non-coordinator step.
- The `RUST_INTEL_VALIDATE_TIMEOUT_MS` ban is a whole-file `source.includes(...)`
  (`dev/validate.mjs:2214`), so a *comment* in either workflow that merely names the knob is an
  error, and the knob can never be used to give one lane a different budget. Both are defensible
  choices; neither is documented as intentional at the check.
- `README.md:48` still says "The ordinary Windows coordinator has passed … in three runs against
  `49dd4f0`" and then enumerates two coordinator runs and one fixture-only run. The enumeration
  immediately disambiguates, so this is much weaker than round 44's P2-1 conflation, but the
  summary clause still counts three coordinator runs where there were two.
- Round-44 P4 carry-overs, all unchanged and re-verified at this head: the workflow run-step
  scanner's conservatism (`dev/validate.mjs:2091-2094`); `fs.existsSync` case-insensitivity on NTFS
  (`:2131`); the undocumented `validateInputs` coupling rule
  (`dev/validate-fixtures.mjs:273-278`); the execution-split check without a negative control
  (`:4462-4480`); `dev/validate-lexer-observations.mjs:1` still calling the module "Pure semantic
  observations" while `literalTrueCompletionDiagnostics` writes the module-level lexical cache; the
  dead `spawnOptions.script === 'dev/validate-fixtures.mjs'` branch (`:313-315`); `childSpawnsPending`
  declared `let` and only mutated in place (`:179`); and `CHANGELOG.md:97` carrying the
  484/409/75 historical split with no marker that its 409/75 half is the hand count later shown
  wrong, 74 lines above `CHANGELOG.md:171-173` which says exactly that.
- The `windows-install-smoke` pwsh-leg name still overstates its coverage
  (`.github/workflows/ci.yml:333`, `:379`, `:407`). Round-43 P4, unchanged.
- `1ba3956` has a full descriptive body with per-finding disposition and an explicit
  not-pushed/not-tagged statement, continuing the correction round 44 recorded.

## Round-44 closure matrix

| Round-44 item | Disposition at `1ba3956` | Evidence |
|---|---|---|
| P2-1: Windows non-reproduction evidence contradicts itself about the tree | **Closed for the historical runs; reopened for the new one.** | `CHANGELOG.md:195-208`, `docs/reviews/README.md:80` and `README.md:48` now all say `49dd4f0`, 484/484 controls, last live control 460, and all state that no measurement exists at `6bc997b`; the `6bc997b` body's "486/486 at this head" is explicitly superseded (`CHANGELOG.md:204-206`). The fixture-only run is separated from the two `npm run validate` runs in all three. The new 368 s figure is attributed only to "this fixing tree" and cannot be the committed tree — round-45 P3-3. |
| P3-1: anti-vacuity gate bypassable by an early-return facade, recorded as closed | **Substantially closed; residual class open; closure prose still overstated.** | Marker id is 6 digits for every `Date.now()`; budget still exactly 2,000,000/2,000,000; expected index `2_000_000 − markerLength + 1` equals `callInfo`'s `last.start` (`dev/js-lexer.mjs:585`); control 458's `maskJsNonCode` preamble check (`dev/validate-fixtures.mjs:4351-4360`) rejects every facade above the anchor and fails closed on a missing anchor. Round 44's exact facade is dead. But the expected result is recoverable from the input (and from `process.argv[3]`), the anchor pins position not callee identity, and `dev/validate-lexer-observations.mjs:4` is unpinned — a module-scope wrapper, or a length-gated path in `dev/js-lexer.mjs`, passes 401/458/459 with only the P2-1 memory floors objecting. Round-45 P3-1. |
| P3-2: `README.md` omits `49dd4f0` while three records claim otherwise | **Closed.** | `README.md:48` now reads "The round-42 partial fixes (`ef20ca5`, `14a672a`, `49dd4f0`) … and — in `49dd4f0` — the sequential core/fixture coordinator (`dev/validate-all.mjs`) and its shared semantic oracle (`dev/validate-lexer-observations.mjs`)". Verified against `git show --stat 49dd4f0`. |
| P3-3: CHANGELOG and ledger describe the committed change as uncommitted | **Closed for the round-43 row; regressed for the round-44 row.** | `CHANGELOG.md:179` and `docs/reviews/README.md:80` now name `6bc997b`. `CHANGELOG.md:211` and `docs/reviews/README.md:81` say the round-44 pass is "in one working tree on top of `6bc997b`; commit … remain separate, explicit, human-authorized actions" — inside commit `1ba3956`. Round-45 P3-2. |
| P3-4: control 486 pins a data literal, not the wiring | **Partially closed.** | Value swap now caught (per-phase slices, `dev/validate.mjs:2172-2179`); `...phase.env` pinned (`:2184-2186`) and regression-tested by control 486's two-mutation copy (`dev/validate-fixtures.mjs:4442-4449`); phase order pinned (`:2163-2167`). Still: the env pin is a whole-file regex, phase count / exit-status mapping / argument forwarding are unpinned, the fixtures-arm slice is unbounded, and no control executes the coordinator. Round-45 P3-4. |
| P4: run-step scanner conservatism (20 of 62 invocations out of scope) | **Unchanged.** | `dev/validate.mjs:2095-2133` byte-identical in this window. |
| P4: `fs.existsSync` case-insensitivity on NTFS | **Unchanged.** | `dev/validate.mjs:2131`. |
| P4: `validateInputs` coupling documented by instance, not by rule | **Unchanged.** | `dev/validate-fixtures.mjs:273-278`. |
| P4: execution-split check has no negative control | **Unchanged.** | `dev/validate-fixtures.mjs:4462-4480`. Now one of four unexercised enforcement mechanisms — round-45 P3-5. |
| P4: "Pure semantic observations" overstates the guarantee | **Unchanged.** | `dev/validate-lexer-observations.mjs:1`. |
| P4: dead `dev/validate-fixtures.mjs` script branch | **Unchanged.** | `:313-315`; the only `script:` call sites are `:4380` and `:4403`, both `dev/validate-lexer-probes.mjs`. |
| P4: `childSpawnsPending` declared `let` | **Unchanged.** | `dev/validate-fixtures.mjs:179`. |
| P4: `CHANGELOG.md:97` historical split unmarked | **Unchanged.** | `CHANGELOG.md:97` vs `:171-173`. |
| Part 2 P2-A: no CI run has ever exercised current tooling | **Open, unchanged (sixth consecutive round).** | `git ls-remote origin refs/heads/main` = `3ed04b9`; `git rev-list --count 3ed04b9..HEAD` = 92; newest run `34019219895` at `3ed04b9`. |
| Part 2 P2-B: behavioural gates rest on local, non-transferable evidence | **Partially addressed; substantively open.** | Record contradictions resolved (P2-1 above); the underlying Windows gate still has no CI run and no attributed measurement at the shipped head, and the anti-vacuity gate's remaining defense is now the P2-1 memory floors. |
| Part 2 P3-A: coordinator budget exceeds the job timeouts of its lanes | **Closed, and mechanically pinned.** | `ci.yml:19` 30→50, `:219` 30→50, `:309` 20→50; `npm-publish.yml:36` stays 45. `dev/validate.mjs:2192-2212` parses `let timeoutMs = 20 * 60 * 1000;` from `dev/validate-all.mjs:33`, requires `2 × 20 + 5 = 45` on all four coordinator lanes, and I verified all four satisfy it (50/50/50/45) with no self-breakage; `:2213-2217` additionally rejects any workflow-level override, and neither workflow contains the string. `killSignal: 'SIGTERM'` still reaps only the direct child (`dev/validate-all.mjs:47`) — unchanged, and out of the finding's scope. |
| Part 2 P3-B: coordinator is an unexecuted release entrypoint | **Open, unchanged.** | No control runs `dev/validate-all.mjs`; round-45 P3-4. |
| Part 2 P3-C: release-facing provenance and disposition defects | **Partially closed, partially regressed.** | See P3-2 and P3-3 above. |

### Hand-trace: the run-time marker, end to end

**Marker id range.** `chooseControl401MarkerId()` = `100_003 + (Date.now() % 800_000)`
(`dev/validate-fixtures.mjs:417`). `Date.now() % 800_000 ∈ [0, 799_999]`, so the id ranges over
`[100_003, 900_002]`. Both endpoints are six digits, so the comment's "bounded to six digits" claim
holds for every possible clock value. It is not random, only clock-derived: two runs in the same
millisecond produce the same id and the sequence repeats every 800 s. That matters only for the
"unknowable from source" claim (P3-1), not for the arithmetic.

**Marker length and filler.** `` `;completeCurrentControlScope(${markerId}, true)` `` is
`;`(1) + `completeCurrentControlScope`(27) + `(`(1) + 6 + `,`(1) + ` `(1) + `true`(4) + `)`(1) = 42.
`fillerLength = 2_000_000 − 42 = 1_999_958` (`dev/validate-lexer-probes.mjs:61`), total exactly
2,000,000 — matching `inputLength: 2_000_000` at `dev/validate-fixtures.mjs:424`.

**Budget.** `scanLexical`'s main loop charges one step per iteration (`dev/js-lexer.mjs:208`),
identifier continuation one per additional code unit (`:262`), numeric continuation likewise
(`:338`), whitespace and punctuation one each. For this input: 1,999,958 (`x` run) + 1 (`;`) +
27 (name) + 1 (`(`) + 6 (digits) + 1 (`,`) + 1 (space) + 4 (`true`) + 1 (`)`) = **exactly
2,000,000**, so `operations > MAX_LEXICAL_OPERATIONS` (`:92`) is false — zero margin, unchanged from
round 44's trace, and invariant to the marker's digit count because every code unit costs exactly
one operation. No strings, comments, templates or regexps appear, so `masked` is never allocated
(`:45-51`) and `maskJsNonCode` returns the original string.

**Diagnostic.** In `completionDiagnostics` the `x` run is one `IdentifierName` (ECMA-262
`IdentifierName ::= IdentifierStart IdentifierPart*` permits an unbounded run), `;` emits a
`punct`, and `completeCurrentControlScope` is read with `prior` = that `punct`, so
`propertyReference`/`declarationReference`/`propertyKey` are all false and
`executable[nextIndex] === '('` makes `canonicalDirectCallee` true (`:671-673`); no bare reference
is reported (`:694`). At `(`, `callInfo()` passes all four rejection guards (`:574-581`) and returns
`{outcome: 1, id: 0, index: last.start, canonical: true}` where `last.start = fillerLength + 1`
(`:585`, `:680`). At `)`, `closeFrame` sees `summary(args[1]) = {kind:'true'}` so `isUnconditional`
holds, and `summary(args[0]) = {kind:'number', value:'<markerId>'}` passes
`/^(?:0|[1-9][0-9]*)$/u` and `Number.isSafeInteger`, yielding `id = markerId` (`:621-622`). Result:
`ids: [markerId]`, `indexes: [fillerLength + 1]`. Both parent (`:426`) and child (`:70`) expect
exactly that. ✔

**Why the ≈71 MB figure is fragile.** Everything the scan allocates is unreachable at the terminal
sample: the 2 MB source, the 2 MB `regexStarts` (`dev/js-lexer.mjs:39`), the two 2 MB slices
(`:263`, `:664`), and the cached scan result, which the companion call overwrites
(`:38`, `:451-452`). `heapUsed` therefore reports dead-but-uncollected bytes, and the assertion
`peakHeapUsed >= 32 MiB` is an assertion about GC scheduling. See P2-1.

## Part 2 — whole-repository release readiness at `1ba3956`

### P2-A. No CI run has ever exercised any part of the current tooling (sixth consecutive round)

Locations: `git ls-remote origin refs/heads/main`, `gh run list`, `package.json:9-18`,
`.github/workflows/ci.yml:17-215`, `:216-231`, `:306-331`, `:332-433`, `:435-520`.

```text
git ls-remote origin refs/heads/main   -> 3ed04b907a10a4085203fa6af1f6876313609186
git rev-list --count 3ed04b9..HEAD     -> 92
gh run list --limit 8 (newest)         -> 34019219895  validate  success  2m37s  2026-09-06  main
```

`origin/main` has not moved since round 42. Rounds 40, 41, 42, 43 and 44 each named this as the
dominant blocker; this is the sixth. Five fixing passes have landed since the last CI-verified
commit without changing it.

New framing this round, which sharpens what is at stake. The unexecuted delta is not confined to
repository tooling. Comparing the last commit CI ever ran against to the reviewed head:

```text
git diff --stat 3ed04b9..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*
  bin/install-codex.js        |  38 ++--
  bin/install-transaction.js  | 419 +++++++++++++++  (new file, added by 230ef59)
  bin/install.js              |  72 ++++----
  package.json                |   2 +-
  rust-cc-install.ps1         | 309 ++++++++++++++++-----
  rust-cc-install.sh          | 311 +++++++++++++++++----
  rust-cc-uninstall.ps1       | 204 +++++++++++++---
  rust-cc-uninstall.sh        | 241 +++++++++++++++---
  8 files changed, 1416 insertions(+), 180 deletions(-)
```

`package.json:9-18` lists `bin/` in `files`, so `bin/install-transaction.js` — a 419-line module
that has never run under CI on any platform — is inside the published tarball. `skill/`, `skills/`,
`commands/`, `.claude-plugin/` and `.codex-plugin/` are byte-identical to `3ed04b9`, so the rule
text is not part of this gap; the installer runtime is.

Correction: push the head and let the full matrix run before the next review round; record the run
id in the ledger, as rounds 23 and 26 did. Nothing else in this report closes it — and note P2-1:
the first Linux execution of control 401's memory floors happens on that same run, so a
calibration failure there would keep P2-A open for a seventh round for a non-defect reason. Fixing
P2-1 before pushing is the cheaper order.

### P2-B. The two behavioural gates still rest on local, non-transferable evidence

This is Part 1's P3-1 and P3-3 restated at release scope.

The Windows ordinary-validation gate's record is now internally consistent for the three historical
runs and honestly labelled as non-reproduction rather than a fix (`README.md:48`,
`CHANGELOG.md:195-208`, `docs/reviews/README.md:80`). The one measurement claimed for the current
state — 368 s, exit 0, 486/486 controls — is attributed to an unnamed tree that cannot be the
committed one (P3-3). Round 42's two observed failures (`3221226505` = `0xC0000409`, at 3.106 s and
2.299 s) remain unexplained; per Microsoft's `__fastfail` documentation that status is a
second-chance non-continuable exception, i.e. an abort-class termination, and the coordinator's
mechanism does not act 2–3 s into a run. `windows-validator` has still never executed.

The anti-vacuity gate is materially harder to bypass than in rounds 43 and 44, but not closed
(P3-1), and its remaining defense is a pair of memory floors that are themselves a portability risk
(P2-1). Three release-facing records again assert a broader closure than was tested.

Neither gate can be closed by another documentation pass. The first needs one `windows-validator`
run on both matrix legs. The second needs the callee-identity pin described in P3-1.

### P3-A. The `0.7.0` MINOR classification has not been re-derived since the packaged `bin/` surface changed

Locations: `package.json:3`, `:9-18`, `git diff --stat 3ed04b9..HEAD -- bin`,
`docs/reviews/README.md` (round-23 row), `CHANGELOG.md:97`.

The `0.7.0` MINOR decision was taken in round 23, at `3ed04b9`. Since then the packaged rule text
has not changed at all, which is the half the classification was mostly about — but `bin/` has
changed by `+479/−50` across three files including a new module (`bin/install-transaction.js`,
added by `230ef59` "fix: make installer upgrades transactional"), and `bin/` is published. The two CLI
entrypoints (`package.json:5-8`) are unchanged and no documented behaviour is removed, so MINOR
still looks correct to me on inspection; the point is that no round since 23 has re-derived it
against this delta, and the release records do not mention the installer-transaction change as a
semver input at all. A classification carried forward across 92 commits without re-derivation is a
release-record gap, not a resolved question.

Correction: before the bump, restate the semver classification against
`git diff v0.6.0..<candidate> -- $(node -e "…files…")` explicitly, naming the installer-transaction
change, and record the result next to the round-23 decision rather than silently inheriting it.

### P3-B. The coordinator is still an unexecuted release entrypoint

Cross-reference of Part 1's P3-4 at release scope. `dev/validate-all.mjs` is the entrypoint for
`npm run validate`, `repository-checks`, `windows-validator`, `node-floor` and the `publish` job's
sanity checks (`package.json:21`, `.github/workflows/ci.yml:41`, `:230`, `:316`,
`.github/workflows/npm-publish.yml:61`). It now has an existence check, a runtime-guard contract,
four caller pins, three source-shape pins, a job-timeout coherence pin and one negative control —
and no control, anywhere, that runs it. Its exit-status mapping (`:50-58`), argument forwarding
(`:43`), `stdio: 'inherit'` choice and `timeout`/`killSignal` behaviour (`:46-47`) are all
unexercised by the suite; given P2-A, they are unexercised by CI too.

### P3-C. Release-facing self-description defects persist by mechanism, not by oversight

Part 1's P3-2 and P3-3 are release-record defects: the round-44 disposition rows in
`CHANGELOG.md:209-238` and `docs/reviews/README.md:81` disclaim the commit that contains them, and
the one measurement offered for the current state names no SHA. Round 43 raised this class, round
44 raised it again, and the round-44 fix corrected the previous instance while creating the next
one. Three rounds is enough to treat it as a process defect in how disposition text is authored,
not as three independent mistakes.

### Release-readiness evidence at `1ba3956`

| Area | Evidence |
|---|---|
| Full validator | **Not independently verified this round** (static-only review by instruction). One local Windows run is recorded for the current state (368 s, exit 0, 486/486 controls, Node v24.12.0, Windows 10.0.19045) but names no SHA and cannot be the committed tree (P3-3). The three older runs are now consistently attributed to `49dd4f0`. Round 42's two `0xC0000409` failures stand unexplained. |
| CI | **None at this head, and none for any current lane.** Newest run `34019219895` (success, 2 m 37 s, 2026-09-06) is at `3ed04b9`, 92 commits behind. `windows-validator`, the `powershell.exe` leg, the current `installer-boundaries` definition, `bash-floor`, controls 485/486, the workflow run-step scanner, the new coordinator pins, the new job-timeout pin and control 401's memory floors have never run. |
| Fixture authority | **Verified.** Header (`dev/validate-fixtures.mjs:5`, `:10`), `CONTROL_REGISTRY_TOTAL = 486` (`:100`), `README.md:48`, `CHANGELOG.md:97` and the ledger all state 486 = 410 (387 + 23) + 76 and agree; the split is machine-checked (`:190-192`, `:4462-4480`). No control was added or removed in this window, and the spawn topology is unchanged (control 401 still one focused spawn, control 459 still one). |
| Lexer semantics | Unchanged (`dev/js-lexer.mjs` byte-identical in this window). The new marker is hand-traced above: 42-unit marker, 1,999,958 filler, exactly 2,000,000 operations of a 2,000,000 budget, `ids: [markerId]`, `indexes: [1_999_959]`. |
| Anti-vacuity | **Substantially closed, not closed** (P3-1). Round 44's facade is dead. A module-scope callee wrapper, or a length-gated path in `dev/js-lexer.mjs`, still passes controls 401, 458 and 459; only the memory floors object, and those are themselves P2-1. |
| Work-was-done floors | **New risk** (P2-1). `peakHeapUsed` is `max(initial, terminal)` over dead-but-uncollected bytes; `peakRss`'s 100 MiB floor is calibrated on win32 only and first executes on `ubuntu-latest`. |
| Coordinator contracts | **Better enforced, still textual and unexecuted** (`dev/validate.mjs:2162-2217`, control 486). Value swap, env spread and phase order now pinned; phase count, exit mapping, argument forwarding unpinned; no control runs the coordinator (P3-4, P3-B). |
| Job timeouts | **Coherent and pinned** (Part 1 closure matrix, Part 2 P3-A of round 44). 50/50/50/45 against a computed minimum of 45; no workflow sets `RUST_INTEL_VALIDATE_TIMEOUT_MS`. |
| Workflow reference integrity | **Unchanged** (`dev/validate.mjs:2088-2133`, control 485). Residual scope from round 44 still stands as P4. |
| Mirror parity | **Verified.** `git ls-files -s skill` vs `git ls-files -s skills/rust-intel`: thirteen files, identical blob hashes. |
| Version/manifest state | **Correct pre-bump.** `package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; `engines.node` `>=24.0.0`; latest local and remote tag `v0.6.0`; no `v0.7.0`. |
| Semver classification | **Intact for the window; not re-derived for the release.** `git diff --name-only c9a37cb..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` is empty. Since `3ed04b9`, where the MINOR call was made, `bin/` has changed by `+479/−50` including a new published module (P3-A). |
| Packaging | **Not re-verified** (`npm pack` is a package command, excluded by instruction). `files` unchanged from round 42's verified 39-entry dry run. |
| Recovery matrix | Definition unchanged in this window; still no execution evidence at any head. |
| History integrity | **Sound in this window.** `1ba3956` is self-consistent: every path its new checks resolve exists at that commit, and its four new `dev/validate.mjs` checks all pass at that tree by hand-trace (phase order, both phase contracts, the env spread regex, and 50/50/50/45 against the computed minimum 45). |

**Release verdict: NOT READY for `v0.7.0`.** Close P2-A by running the full current CI definition on
the exact candidate SHA — after 92 unpushed commits and six rounds naming it, this is still the only
finding that has never moved. Fix P2-1 first, so that run is not spent discovering a
single-host-calibrated memory floor on Linux. Then pin callee identity for the anti-vacuity gate
(P3-1), give the three unexercised enforcement mechanisms negative controls (P3-5), execute the
coordinator from at least one control (P3-4/P3-B), and fix the disposition-authoring mechanism
rather than the current instance of it (P3-2/P3-3/P3-C). Only after a clean reviewed head with real
exact-SHA CI evidence, and a restated semver classification (P3-A), should the separately authorized
bump, tag, and publish sequence begin.

## Static-verification record

| Check | Method | Result |
|---|---|---|
| Commit window | `git log --oneline c9a37cb..HEAD` | One commit, `1ba3956`; 8 files, `+200/−46`. |
| Marker-id digit width | Interval arithmetic on `100_003 + (Date.now() % 800_000)` | Range `[100_003, 900_002]`; both endpoints six digits, so the marker length is 42 for every clock value. Comment at `dev/validate-fixtures.mjs:414-415` correct. |
| Lexical budget with the new marker | Per-branch operation count through `dev/js-lexer.mjs:208`, `:257`, `:262`, `:338` | 1,999,958 + 1 + 27 + 1 + 6 + 1 + 1 + 4 + 1 = exactly 2,000,000 of a 2,000,000 budget; `operations > MAX` false. Zero margin preserved; invariant to marker digit count. |
| Expected source index | Trace of `callInfo` → `closeFrame` → `report` (`dev/js-lexer.mjs:585`, `:612-624`, `:524-533`) | `index = last.start = fillerLength + 1 = 1_999_959`; parent's `2_000_000 − 42 + 1` (`dev/validate-fixtures.mjs:426`) and child's `fillerLength + 1` (`dev/validate-lexer-probes.mjs:70`) agree. |
| Expected-observation key order | Object-literal order in `expectedControl401Observation` vs `{ ...observation, companion }` | `kind, inputLength, ids, indexes, companion`; identical, so the `JSON.stringify` comparison at `dev/validate-fixtures.mjs:476` is well-founded. |
| Missing-401 map entry | `expectedLexerObservations` (`:437-460`) has no `401` key | A bare `expectLexerProbe(401)` would compare a string to `undefined` and fail — fails closed. |
| Control 458 reachability check | Hand-trace of `dev/validate-fixtures.mjs:4351-4360` against the shipped module and four facade placements | Passes at this head (preamble = `"\n  "`). Rejects: facade above the anchor (non-whitespace preamble), missing anchor (`indexOf` = −1), renamed function (`functionStart` < 0), `;`-only preamble. **Does not constrain** what `literalTrueCompletionDiagnostics` resolves to, nor anything after the first statement. |
| Control 458 `helperContract` patterns | Character-by-character de-escaping of all eight regexes against `dev/validate-lexer-probes.mjs:14-15`, `:57-63`, `:135-144` | All eight match the current source; the three new ones pin the argv parse, the safe-integer guard and the template-literal marker. |
| Control 459 behaviour | Trace of the mutation against the child predicate | `const diagnostics = [];` → `ids: []`, `indexes: []` → child exits 1, `facadeWouldPass` false, `companion.ids[0]` undefined ≠ 901 → control passes. Blind to a facade that leaves the anchor line dead-but-present. |
| Coordinator phase pins | Hand-trace of `dev/validate.mjs:2163-2179` against `dev/validate-all.mjs:14-28` and three mutations | Core arm bounded by the next `name: '`; value swap now **caught**; escape-hatch flip **caught**; phase order **pinned**. Fixtures-arm slice runs to EOF (latent asymmetry). |
| `...phase.env` pin | `dev/validate.mjs:2184-2186` vs `dev/validate-all.mjs:48` | Matches at this head; deleting the spread fires the error (control 486's second mutation). Not anchored to the `spawnSync` options object — an unrelated object literal with the same text satisfies it. |
| Control 486 needle logic | `expectFixture` (`dev/validate-fixtures.mjs:664-672`) with two needles | Both needles required; each comes from an independent check, so removing either check fails the control. |
| Job-timeout pin | `dev/validate.mjs:2192-2212` vs `ci.yml:19`, `:219`, `:309`, `npm-publish.yml:36`, `dev/validate-all.mjs:33` | Parses `20`; minimum `2 × 20 + 5 = 45`; lanes are 50/50/50/45 — all satisfy it, `publish` exactly. `yamlJobSection` bounds `repository-checks` 17–215, `windows-validator` 216–231, `node-floor` 306–331, `publish` 34–EOF; each contains exactly one 4-space `timeout-minutes`. No self-breakage at this head. |
| Coordinator-lane completeness | `grep -n "validate-all\|npm run validate" .github/workflows/*.yml` | Exactly four coordinator invocations: `ci.yml:41`, `:230`, `:316`, `npm-publish.yml:61` — matching the four pinned lanes. `installer-boundaries`, `windows-install-smoke` and `bash-floor` do not run it. |
| `RUST_INTEL_VALIDATE_TIMEOUT_MS` ban | `grep -rn RUST_INTEL_VALIDATE_TIMEOUT_MS .github/` | No occurrence; the check at `dev/validate.mjs:2213-2217` is satisfied. Whole-file `includes`, so a comment naming the knob would be an error. |
| Telemetry construction | Read of `dev/validate-lexer-probes.mjs:119`, `:131-145` | `peakHeapUsed = max(initial, terminal)` — two boundary samples, no in-scan sampling. `peakRss` uses `resourceUsage().maxRSS × 1024` when finite, else boundary samples, but always labels the source `'process.resourceUsage.maxRSS'` when `maxRSS === 0`. |
| Garbage reachability at the terminal sample | Read of `dev/js-lexer.mjs:14-15`, `:38`, `:39`, `:263`, `:451-452`, `:664` and the probe's call order | The companion scan (second) overwrites the one-entry cache, so every big-scan allocation is unreachable when `telemetry()` samples. `heapUsed >= 32 MiB` therefore asserts that a major GC has *not* run. |
| Heap-cap tension | `dev/validate-fixtures.mjs:376`, `:378` vs the comment at `:430-434` | Child runs with `--max-old-space-size=64`; documented genuine `peakHeapUsed` is ≈71 MB. Either the figure was not measured under those flags, or the child finishes over its own old-space budget. |
| Registry totals | `dev/validate-fixtures.mjs:5`, `:100`, `:4462-4480`; spawn call sites | 486 unchanged; no `observeControls` added or removed by `1ba3956`; control 401 still one focused spawn (`:378`), control 459 still one (`:4380`). The 387/23/76 split is unaffected. |
| Mirror parity | `git ls-files -s skill` vs `git ls-files -s skills/rust-intel` | Thirteen files, identical blob hashes. |
| Manifests/tags | File reads, `git tag -l`, `git ls-remote --tags origin` | All `0.6.0`; latest tag `v0.6.0` locally and remotely; no `v0.7.0`. |
| Packaged-surface delta (window) | `git diff --name-only c9a37cb..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` | Empty. |
| Packaged-surface delta (since last CI) | `git diff --stat 3ed04b9..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` | 8 files, `+1416/−180`; `bin/install-transaction.js` new (419 lines, added by `230ef59`); `skill/`, `skills/`, `commands/`, both plugin manifests unchanged. `bin/` is in `package.json`'s `files`. |
| Release-record consistency | Cross-read of `CHANGELOG.md:177-238`, `README.md:48`, `:95`, `docs/reviews/README.md:78-81` | Historical Windows evidence now consistent (`49dd4f0`, 484/484, control 460, three durations, fixture-only run separated). New 368 s figure names no SHA. Round-44 rows disclaim the commit that contains them. |
| Remote/CI state | `git ls-remote origin refs/heads/main`, `git rev-list --count`, `gh run list --limit 8` | `3ed04b9`; 92 commits ahead; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| Prior-round P2-A continuity | `grep -c "origin/main\|not been pushed\|unpushed"` over rounds 40–44 | Every round from 40 through 44 names it; round 45 is the sixth consecutive. |
| ECMAScript grammar | ECMA-262 `IdentifierName ::= IdentifierStart IdentifierPart*` | An unbounded run of `x` is a single token, so the filler is one word token and the `;` separator remains load-bearing. |
| Node process semantics | Node `process.memoryUsage`, `process.resourceUsage`, `child_process` documentation | `heapUsed` is V8's used heap including uncollected garbage; `maxRSS` is a kilobyte high-water mark filled by libuv from `ru_maxrss` / `PeakWorkingSetSize`; `spawnSync` `env` replaces rather than merges. |
| V8 heap flags | `--max-old-space-size` semantics | Bounds the old generation (including large-object space); a reported `heapUsed` above the cap implies aggressive concurrent collection during the run. |
| GitHub Actions semantics | `jobs.<job_id>.timeout-minutes`, `jobs.<job_id>.steps[*].run` | The job timeout cancels the job irrespective of the step; matrix legs each get the job timeout. |
| Windows status code | Microsoft `__fastfail` documentation | `0xC0000409` is a second-chance non-continuable exception — abort-class termination, not an ordinary exit status. |

## Red-tier and out-of-scope inventory

- No normative skill, mirror, command, installer, or manifest file changed in this window; all
  thirteen mirror files are byte-identical to each other and unchanged since `633a0da`.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue or cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added. Cargo, clippy, Miri,
  `cargo-semver-checks`, audit, and deny remain inapplicable: this repository has no Cargo manifest
  or lockfile, and the executable changes are Node and CI-definition repository tooling.
- No dynamic verification was performed by this review, by instruction. Every runtime number quoted
  here is attributed to round 42, round 44, a commit body, a release record, or `gh run list`.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract; only the documented process-interruption guarantee is in scope.
- No product code, manifest version, tag, remote ref, npm artifact, or ledger row was changed by
  this review. This report file is the only authored change.

## Recommended correction order

1. **Fix the control-401 work-was-done floors before pushing** (P2-1). Replace the boundary-sampled
   heap assertion with an in-scan measurement or a same-child ratio, and either drop the absolute
   `peakRss` floor or derive it per platform. Pushing first spends the six-rounds-awaited CI run on
   a calibration failure with better-than-even odds on `ubuntu-latest`.
2. **Push the head and obtain one complete run of the current `validate` workflow**, including
   `windows-validator` on both Node legs and `windows-install-smoke` on both PowerShell legs.
   Record the run id in the ledger, as rounds 23 and 26 did. Nothing else closes P2-A, and the
   unexecuted delta now includes a 419-line published installer module.
3. Pin callee identity for the anti-vacuity gate (P3-1): require the observation module's import
   line verbatim and require `literalTrueCompletionDiagnostics` to have no second binding in that
   module. Then narrow the closure prose in `CHANGELOG.md:212-216` and `docs/reviews/README.md:81`
   to what was actually tested.
4. Fix the disposition-authoring mechanism, not the current instance (P3-2/P3-3/P3-C): amend the
   fixing commit so its own rows name its own SHA, take the acceptance measurement after the
   documentation edits, and record it against `git rev-parse HEAD`.
5. Give the three unexercised enforcement mechanisms negative controls (P3-5) — phase order, the
   job-timeout pin, the `RUST_INTEL_VALIDATE_TIMEOUT_MS` ban — plus the execution-split check
   carried from round 44, and add the value-swap case to control 486.
6. Execute the coordinator from at least one control (P3-4/P3-B): a temp copy with a trivially
   failing core phase, asserting the exit status and the `[validate-all] phase=core failed`
   diagnostic. Anchor the `...phase.env` pin to the `spawnSync` options object while there.
7. Restate the `0.7.0` semver classification against the full `v0.6.0..<candidate>` packaged delta,
   naming `bin/install-transaction.js` explicitly (P3-A).
8. Close the smaller gaps: correct the determinism comment at `dev/validate-fixtures.mjs:4053-4054`,
   print the expected marker id on a control-401 failure, bound the fixtures-arm phase slice, and
   clear the round-44 P4 carry-overs.
9. Re-run an independent P0–P3 review on the resulting head. Only after a clean reviewed head with
   real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish
   sequence begin.
