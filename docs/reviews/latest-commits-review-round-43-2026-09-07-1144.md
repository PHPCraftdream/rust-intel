# Round 43 review of the latest commits and v0.7.0 release readiness — 2026-09-07 11:44 CEST

## Scope and method

- Review base: `633a0daa182f1574ec182f89fdba22878f181a2c` (round 42's reviewed head).
- Reviewed head: `49dd4f00e3c4c1e38de5fef105052f770b290d58`.
- Commit window: `633a0da..HEAD` — **five** commits, not one. `git log` resolves the window to
  `724fc87` (round-42 report), `14a672a`, `ef20ca5`, `ccdabe1`, and `49dd4f0`; fourteen changed
  files, `+530/-53`. The task brief named only `49dd4f0`; the three intervening fixing commits are
  in scope and are where two of this round's findings live.
- Whole-repo context: the reviewed head is **88 commits** ahead of `origin/main`
  (`git ls-remote origin refs/heads/main` = `3ed04b9`, unchanged since round 42). Nothing in this
  window has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, installer, build,
  or package command was executed. Every dynamic claim below is attributed to its source (round 42's
  measurements, the commit bodies, or `gh run list`) and is labelled as such; nothing is re-measured.
- Method: `git log`/`show`/`diff`/`cat-file`/`ls-files -s`/`ls-remote`, direct file reads, read-only
  `gh run list`, hand-tracing of the lexer state machine and the coordinator process topology
  against the committed source, and primary-source lookups for the ECMAScript class-element
  grammar, Node's `child_process.spawnSync` contract, GitHub Actions context availability, and the
  Windows fast-fail status code.
- `skill/`, `skills/rust-intel/`, `commands/`, `bin/`, and both plugin manifests are **byte-identical
  to the round-42 reviewed head** (`git diff --name-only 633a0da..HEAD` over those paths is empty),
  so normative rule text was checked for release/mirror consistency only, not re-audited.
- Authored change set: this report file alone. Unlike previous rounds, **no ledger row was added**
  to `docs/reviews/README.md`; the instruction for this round authorized exactly one new file, so
  the ledger row for round 43 remains outstanding work for the fixing pass.

## Executive result

- **No P0 and no P1 finding**, in either part.
- **Part 1 (commit window): two P2, four P3, four P4 observations.**
- **Part 2 (whole repository): two P2, three P3.** Part 1's P3-1 through P3-3 are also release-gate
  items and are cross-referenced rather than double-counted.
- Round 42's headline finding is genuinely **closed**. `ef20ca5` advances the class-element state
  machine for private, computed, string, and numeric names; all four of round 42's Node-valid
  counterexamples are hand-traced below to the correct `initializer` state, so the following
  `function` expression is a construct, the `/` after its body is division, and the completion or
  workflow mutation stays visible. Controls 461–484 pin all six spellings in three layers
  (in-process twin, focused completion probe, live workflow mutation).
- The Windows ordinary-validator gate is **mitigated, not proven**. The sequential-sibling topology
  is a real reduction in peak commit charge and in parent-side pipe buffering, and I hand-traced it.
  It does not explain the failure round 42 actually observed: a fast-fail termination
  (`3221226505` = `0xC0000409`) **2.3–3.1 s** into the run, before 484 controls can accumulate
  anything. A fix whose mechanism was never identified plus one self-reported local pass is not a
  demonstrated closure.
- The focused-helper anti-vacuity gate is **partially** closed. Round 42's recommended design
  (shared pure observation + bounded companion input verified by the parent) was implemented, and
  control 459 now rejects the exact constant facade. A size-conditional facade still passes every
  check while eliding the two-million-code-unit scan.
- Three commits in the window — `14a672a`, `ef20ca5`, `ccdabe1` — ship a `ci.yml` that invokes
  `dev/validate-all.mjs` and `node --check dev/validate-lexer-observations.mjs` while **neither file
  exists in the tree**; they were created two and three commits later, by `49dd4f0`. Those three
  commits cannot pass their own CI definition, and `ccdabe1`'s documentation asserts a
  409/386/23/75 execution breakdown that its own fixture header contradicts.
- Count arithmetic at HEAD is internally consistent and independently confirmed where it is
  checkable: **484 = 409 child-process (386 validator-entrypoint + 23 focused lexer/helper) + 75
  in-process**. I counted the 23 focused children directly from the source (21 `expectLexerProbe`
  invocations plus the two controls that spawn the probe script). The mirror is thirteen
  byte-identical files, verified by blob hash.
- All three manifests remain `0.6.0`, no `v0.7.0` tag exists locally or remotely, and the
  round-23 `0.7.0` MINOR decision is intact and correctly recorded. No new semver-relevant change
  entered this window: the packaged surface is untouched.
- **Release verdict: NOT READY for `v0.7.0`.** The blocking facts are that no CI run has ever
  exercised any part of the current tooling, and that the two remaining behavioural gates
  (ordinary Windows validation, focused-helper anti-vacuity) rest on unreproduced local evidence.

## Part 1 — findings on the commit window

### P0 and P1

None. No security-relevant surface, packaged artifact, installer behaviour, or normative rule text
changed in this window; the only executable changes are repository tooling and CI definitions.

### P2-1. Three commits in the window reference two files that do not exist yet

Locations: `.github/workflows/ci.yml:41`, `.github/workflows/ci.yml:58-59`,
`.github/workflows/ci.yml:230` (as committed at `14a672a`), the `README.md` Layout tree (at `14a672a`),
`CHANGELOG.md` and `docs/reviews/README.md` (at `ccdabe1`), against `dev/validate-all.mjs` and
`dev/validate-lexer-observations.mjs`, both created by `49dd4f0`.

Evidence, exactly as produced:

```text
724fc87: validate-all MISSING     ef20ca5: validate-all MISSING
14a672a: validate-all MISSING     ccdabe1: validate-all MISSING
49dd4f0: validate-all EXISTS
(identical result for dev/validate-lexer-observations.mjs)

git show 14a672a:.github/workflows/ci.yml | grep -n validate-all
41:        run: node dev/validate-all.mjs
58:          node --check dev/validate-all.mjs
230:        run: node dev/validate-all.mjs
```

At `14a672a`, `ef20ca5`, and `ccdabe1` the `repository-checks` job's "Validate docs, manifests,
links, and fixtures" step, its "Check JavaScript syntax" step, and the newly added
`windows-validator` job all invoke a module that is not in the tree; Node exits non-zero with
`ERR_MODULE_NOT_FOUND`. The workflow is red by construction on all three commits, and the
repository's own validator could not have caught it either: `dev/validate.mjs`'s `required` list
gained both paths only in `49dd4f0` (`dev/validate.mjs:30-31`).

`ccdabe1` compounds it on the documentation side. Its message claims it "Synchronize[s] the current
fixture inventory at 484 controls", and it writes `409 child-process controls (386
validator-entrypoint and 23 focused lexer/helper children) plus 75 in-process` into both
`CHANGELOG.md` and the ledger — while the fixture header at that same commit still reads:

```text
git show ccdabe1:dev/validate-fixtures.mjs (line 10)
// 403 spawn child processes (386 validator children and 17 focused lexer/helper children), and 81
```

so the documentation it commits is false about its own tree until `49dd4f0` corrects the header.

HEAD itself is coherent — this is a history-integrity defect, not a defect in the reviewed tree.
It still matters: it breaks bisect across the window, it means the per-commit validation discipline
this project advertises was not applied to three of the five commits, and it removes any basis for
"CI was green on the branch" for those SHAs.

Correction: land workflow and documentation references in the same commit as the file they name.
Mechanically, add a validator check that extracts every `node <path>` and `node --check <path>`
argument from `.github/workflows/*.yml` run steps and asserts the path exists in the tree; that
check fails at `14a672a` and would have prevented the split. The hand-maintained `required` list
(`dev/validate.mjs:17-35`) does not provide this, because it is edited by the same commit that adds
the file.

### P2-2. The ordinary Windows validator gate is mitigated by an unidentified mechanism, and its only new proof lane has never run

Locations: `dev/validate-all.mjs:14-49`, `dev/validate.mjs:2281-2299`,
`dev/validate-fixtures.mjs:285-334`, `.github/workflows/ci.yml:216-230`, `package.json:21`,
`.github/workflows/npm-publish.yml:61`.

The topology change is real, and it does remove two concrete costs. Hand-trace of both shapes:

- Before (`633a0da`): `npm run validate` → `cmd.exe` → node A (`dev/validate.mjs`) performs every
  core check, then at `dev/validate.mjs:2289-2299` calls `runNodeProbe([… validate-fixtures.mjs])`,
  which is `spawnSync` with `encoding: 'utf8'` — piped stdio, default `maxBuffer` of `1024 * 1024`
  (Node `child_process` documentation) — and **A stays resident for the whole fixture run**, holding
  its heap: every scanned markdown file, the masked copies of the 126 KB validator and 246 KB
  fixture sources, and all retained scan results.
- After (`49dd4f0`): `npm run validate` → `cmd.exe` → node C (`dev/validate-all.mjs`, 49 lines) →
  `spawnSync` node A with `RUST_INTEL_SKIP_NESTED_FIXTURES=1` and `stdio: 'inherit'`
  (`dev/validate-all.mjs:31-38`); A **exits**, releasing its address space; only then does C spawn
  node B (the fixture suite), also with inherited stdio. Peak concurrent commit charge drops by
  A's entire working set, and B's output is no longer buffered in a live parent.

The process depth from `cmd.exe` to the fixture process is unchanged (`cmd` → node → node), so
nothing about handle-inheritance depth differs; the improvement is entirely (1) A's memory being
freed and (2) pipe removal.

What this does not explain is the failure round 42 recorded. Two `npm run validate` attempts died
after **3.106 s** and **2.299 s** with the fixture child at decimal status `3221226505` = `0xC0000409`
and no terminal fixture output. Per Microsoft's `__fastfail` documentation, "User-mode fast fail
requests appear as a second chance non-continuable exception with exception code 0xC0000409" — that
is an abort-class termination (the class V8 uses for fatal errors), not an ordinary exit status. At
two to three seconds the fixture process has at most entered control 1, which copies the
`validateInputs` subtree into a fresh temp root and spawns one validator child
(`dev/validate-fixtures.mjs:285-307`). Cumulative retention across 484 controls cannot be the cause
of a fault at that point in the run. The commit therefore removes a genuine source of pressure
without demonstrating that it removes the observed fault; the single successful local run recorded
in the commit body is equally consistent with round 42's own conclusion that the cause could not be
attributed solely to repository code or solely to the loaded host.

The new `windows-validator` job (`.github/workflows/ci.yml:216-230`) is the right structural answer
to round 42's correction, and its wiring is sound: pinned `actions/checkout`/`actions/setup-node`
SHAs, matrix `[24, 24.0.0]`, `node dev/validate-all.mjs`. It has never executed — the newest run
for this repository is `34019219895` (`validate`, success, 2 m 37 s, 2026-09-06) at `3ed04b9`, which
predates the coordinator, the 484-control suite, and both Windows lanes.

Two secondary risks in the same lane, both untested:

- The coordinator caps each phase at 20 minutes (`dev/validate-all.mjs:26-29`) while the job's own
  timeout is 30 minutes. 386 of the 409 children are each preceded by a full `validateInputs` tree
  copy and a recursive delete (`dev/validate-fixtures.mjs:286-296`, `:331-333`). Round 42's local
  Windows reference was 368.715 s for 460 controls; a runner 3.2× slower on that I/O trips the
  coordinator's cap first and reports `ETIMEDOUT` rather than a control failure.
- `spawnSync`'s `killSignal: 'SIGTERM'` terminates only the direct child; on a timeout the fixture
  process's own grandchildren are not reaped.

Correction: keep the coordinator (it is a net improvement), but obtain the missing evidence rather
than inferring it — push the head so `windows-validator` runs on both matrix legs, and capture one
failing reproduction of the `0xC0000409` shape with `RUST_INTEL_FIXTURE_PROGRESS=1` so the last live
control is attributed. Until one of those exists, this gate stays open.

### P3-1. The focused-helper anti-vacuity gate still accepts a size-conditional facade

Locations: `dev/validate-lexer-observations.mjs:6-13`, `dev/validate-lexer-probes.mjs:48-58`,
`dev/validate-fixtures.mjs:386`, `dev/validate-fixtures.mjs:4265-4315`.

What was implemented is exactly round 42's recommended shape: the deterministic calculation moved
into a shared pure module, the parent computes the bounded companion itself
(`dev/validate-fixtures.mjs:4281`), and the expected observation for control 401 now carries the
companion (`dev/validate-fixtures.mjs:386`). The companion's constants check out —
`'completeCurrentControlScope(901, true)'` is 38 code units, and I traced
`completionDiagnostics` over it: the word is a canonical direct callee, the `(` frame records
`{outcome: 1, id: 0, canonical: true}`, argument 1 summarizes to `{kind: 'true'}`, so `closeFrame`
reports id `901`. Control 459's mutation now produces `companion.ids === []`, the child's own
predicate fails, and the parent rejects it.

The residual is the branch form round 42 named. Replace the shared scanner line with:

```js
const diagnostics = source.length > 1_000 ? [] : literalTrueCompletionDiagnostics(source);
```

Then: control 458's source contract still passes, because it only requires the literal
`/literalTrueCompletionDiagnostics\(source\)/u` to appear in the module
(`dev/validate-fixtures.mjs:4279`); the parent-computed companion still returns `[901]`, because it
is 38 characters; the child still emits `{kind: 'diagnostics', inputLength: 2000000, ids: [],
companion: {…ids: [901]}}`, which is byte-identical to the expected map entry; and control 459's
mutation text no longer matches, so it returns `skipped` — which the control treats as a failure,
but only because the literal string moved, not because the semantics were caught. The
two-million-code-unit scan is still unproven, and nothing bounds the child's resources from below:
`expectLexerProbe` accepts any `heapUsed >= 0` (`dev/validate-fixtures.mjs:414-418`).

Correction: make the observation itself depend on the large scan. Put a causal marker inside the
large input — for example scan `'x'.repeat(n) + 'completeCurrentControlScope(902, true)'` and require
`{inputLength: n + 38, ids: [902]}`. No constant and no size-conditional branch can then produce the
expected result without performing the full-length scan, and the existing 2,000,001-unit budget
control (402) is unaffected.

### P3-2. The release-facing records omit `49dd4f0` and disagree with each other

Locations: `CHANGELOG.md:159-169`, `docs/reviews/README.md:78`, `README.md:48`.

All three name the round-42 fixing pass as `ef20ca5` and `14a672a` only. `49dd4f0` — which created
`dev/validate-all.mjs` and `dev/validate-lexer-observations.mjs`, repointed `package.json:21` and
`.github/workflows/npm-publish.yml:61` at the coordinator, corrected the 484-control execution
breakdown, and implemented the anti-vacuity companion — is named nowhere. Worse, the ledger and
CHANGELOG both attribute the coordinator to the wrong commit: "`14a672a` adds isolated Windows
validator lanes through `dev/validate-all.mjs`", when at `14a672a` that file did not exist (P2-1).

The same two records also disagree on a disposition. `CHANGELOG.md:167-169` lists "Focused-helper
anti-vacuity" among the items that "remain release gates"; `docs/reviews/README.md:78` states
"Focused-helper anti-vacuity is included in that local run". One of them has to be rewritten — and
on the evidence in P3-1 the CHANGELOG's "still a gate" reading is the correct one.

This is the defect class this project has corrected twice before (the round-39 and round-40
provenance rows). Correction: add `49dd4f0` to the round-42 disposition paragraph and the ledger
row with its actual contents, move the coordinator attribution off `14a672a`, and make the
anti-vacuity disposition identical in both records.

### P3-3. `README.md` describes `dev/validate.mjs` as a "fixture-free phase" that it is not

Locations: `README.md:123`, `dev/validate.mjs:2281-2299`, `dev/validate-all.mjs:18`.

The Layout tree now reads:

```text
│   ├── validate-all.mjs                # Isolated core + fixture validation coordinator
│   ├── validate.mjs                    # Core repository validator (fixture-free phase)
```

`dev/validate.mjs` is fixture-free only when `RUST_INTEL_SKIP_NESTED_FIXTURES=1`, which is set by
the coordinator (`dev/validate-all.mjs:18`) and by nothing else. Run directly — the documented,
obvious thing to do given that description — it still spawns the entire fixture suite as a nested
child, which is precisely the topology `49dd4f0` exists to avoid, and the topology under which round
42 recorded a 405.321 s failure. The env var is documented nowhere in `README.md` or `CHANGELOG.md`
(the only `RUST_INTEL_*` knob either file mentions is `RUST_INTEL_POWERSHELL_EXECUTABLE`, at
`README.md:93`).

Correction: describe `dev/validate.mjs` as what it is ("repository validator; also runs the fixture
suite unless `RUST_INTEL_SKIP_NESTED_FIXTURES=1`"), or invert the default so the coordinator is the
only thing that turns nested fixtures on. Document the knob wherever the coordinator is described.

### P3-4. The coordinator's new timeout knob is silently ignored when malformed, and one of its phase env entries is a no-op

Locations: `dev/validate-all.mjs:26-29`, `dev/validate-all.mjs:23`, `dev/validate.mjs:2266-2288`,
`dev/validate-fixtures.mjs:312`, `dev/validate-fixtures.mjs:1811`.

`Number(process.env.RUST_INTEL_VALIDATE_TIMEOUT_MS)` yields `NaN` for any malformed value and the
coordinator silently substitutes its 20-minute default. The repository's established contract for
its other env knobs is the opposite: `positiveIntegerEnv` pushes an explicit error for a malformed
`RUST_INTEL_FIXTURE_WATCHDOG_MS` (`dev/validate.mjs:2266-2279`), and a malformed
`RUST_INTEL_SKIP_NESTED_FIXTURES` is a hard error with a dedicated fixture control
(`dev/validate.mjs:2285-2288`, `dev/validate-fixtures.mjs:1811`). The new entrypoint reintroduces
the behaviour those two checks were written to prevent, on the one knob that can now silently kill a
release-gating run.

Separately, `RUST_INTEL_SKIP_NESTED_FIXTURES: '0'` on the fixtures phase (`dev/validate-all.mjs:23`)
has no effect: `dev/validate-fixtures.mjs` never reads that variable — it only sets `'1'` for the
validator children it spawns (`dev/validate-fixtures.mjs:312`). The entry reads as if it enabled
something. It has one incidental benefit worth keeping deliberately (it neutralizes an inherited
`=1` from the caller's environment), which is worth a one-line comment rather than an implied
mechanism.

### P4 observations

- Controls 461–484 cover six name forms, but no modifier-plus-non-identifier combination
  (`static #value`, `static ["value"]`, `static "value"`, `static 1`) and no identifier name written
  with a Unicode escape. I hand-traced all of them against `dev/js-lexer.mjs:110-151`: `static` moves the
  frame to `candidate`, and each of the three new branches resolves `candidate` to `afterName`
  exactly as it resolves `name`, so the lexer is correct for them. This is inventory breadth, not a
  defect, and round 42's stated correction asked for precisely the six that were delivered.
- `dev/validate-lexer-observations.mjs:1` calls the module "Pure semantic observations". The
  function is deterministic but not side-effect-free: `literalTrueCompletionDiagnostics` reaches
  `scanLexical`, which writes the module-level one-entry cache (`dev/js-lexer.mjs:14-15`,
  `:451-452`). In this case the side effect is beneficial — the companion call immediately after the
  two-million-unit scan evicts that 2 MB source and its mask from the cache — but the header
  overstates the guarantee.
- `windows-install-smoke` now performs the successful install and uninstall through the `.bat`
  wrappers in **both** matrix legs (`.github/workflows/ci.yml:379`, `:407`), and those wrappers
  always dispatch to `powershell.exe` (`rust-cc-install.bat:7`). The `pwsh` leg therefore no longer
  proves anything about PowerShell 7 for the ordinary path; the leg distinction now covers only the
  two abrupt `Start-Process` cases and the recovery-matrix helper. The job name
  `Windows installer and recovery (pwsh)` overstates that leg's coverage.
- `14a672a`'s subject is `fix-windows-powershell-recovery`: not the repository's
  `type: imperative summary` convention, no body at all, and it under-describes a commit that also
  repoints the primary validate step and adds a whole new CI job. Round 42 flagged missing commit
  bodies as a P4; this is a recurrence, and the mis-scoped subject is part of how P2-1 happened.

## Round-42 closure matrix

| Round-42 item | Disposition at `49dd4f0` | Evidence |
|---|---|---|
| P2-1: non-identifier class-field names hide a genuine function initializer | **Closed.** | `dev/js-lexer.mjs:128-134` (computed), `:246-250` (string), `:316-320` (private), `:332-336` (numeric), `:362-368` and `:413-416` (bracket pair ownership). All four round-42 counterexamples hand-traced below. Controls 461–472 (twins), 473–478 (focused completion probes), 479–484 (live workflow mutations). |
| P2-2: ordinary full-validator gate not stable on Windows | **Partially closed; release proof open.** | Real topology fix (`dev/validate-all.mjs:14-49`) and a new `windows-validator` lane (`.github/workflows/ci.yml:216-230`), but the observed `0xC0000409` fast-fail at 2–3 s is unexplained by the mechanism changed, evidence is one self-reported local run, and the new lane has never executed. Carried as round-43 P2-2. |
| P3-1: anti-vacuity gate accepts an expected-shaped constant | **Partially closed.** | Shared observation module plus parent-verified bounded companion implemented exactly as recommended (`dev/validate-lexer-observations.mjs:6-13`, `dev/validate-fixtures.mjs:4281-4284`); control 459 rewritten to the constant mutation. A size-conditional branch still satisfies every check. Carried as round-43 P3-1. |
| P3-2: supported Windows PowerShell path outside the recovery matrix | **Closed in definition; unexecuted.** | `dev/test-installer-recovery.mjs:34-36` parameterizes the runtime; `.github/workflows/ci.yml:336-343` adds the `[pwsh, powershell.exe]` matrix with the executable exported at job level; `:379` and `:407` route the ordinary path through the `.bat` wrappers; `README.md:93-95` and `CHANGELOG.md:154-156` document the knob. A static scan of both `.ps1` files found no PowerShell-7-only construct (`$IsWindows`, `??`, `-AsByteStream`, `utf8NoBOM`, three-part `Join-Path`), so the 5.1 leg is plausible — but no run of it exists anywhere. |
| P3-3: "clean Node recovery-matrix memory evidence" is an undefined gate | **Closed.** | The phrase is gone from every live record; it survives only inside the quoted round-42 ledger row (`docs/reviews/README.md:77`). It is replaced by an executable criterion — the `installer-boundaries` job's generated `--list` loops over every same/cross Node case, "578/578 cases across `node-claude` and `node-codex`" (`CHANGELOG.md:152-153`, `README.md` release-gate sentence) — which matches the job definition at `.github/workflows/ci.yml:292-304` and round 42's measured inventories (230 + 59 = 289 boundaries, each run same and cross). |
| P4: control 457 recognizes one cache spelling | **Unchanged.** | `dev/validate-fixtures.mjs:4249-4263`. |
| P4: `peakHeapUsed` naming | **Unchanged.** | `dev/validate-lexer-probes.mjs:112-126`; labels remain accurate, `peakHeapSource` still says `terminal-boundary-sample`. |
| P4: commits without descriptive bodies | **Recurred.** | `14a672a` has no body and a non-conventional subject. |

### Hand-trace of round 42's four counterexamples at HEAD

For `const A = class { #value = function () {} / completeCurrentControlScope(901, true) / 2; };`:
`class` is seen with `previousToken` an operator, so `declarationOrExpression` returns `expression`
(`dev/js-lexer.mjs:152-160`); the `{` pushes a frame with `classBody: true, elementState: 'name'`
(`:387-395`); `#value` hits the private-name branch, which now resolves `name` → `afterName`
(`:316-320`); `=` reaches `noteClassElementToken`, whose `afterName` arm sets `initializer`
(`:142-145`); `function` therefore sees `classElementNamePosition() === false` (`:278`, `:294`) and
registers a construct with `bodyRole: 'expression'`; its body brace gets
`closeCanStartRegex: false` (`:394`), so at `}` `canStartRegex` is false (`:431`) and the following
`/` is division. The completion call stays unmasked and reports id `901`.

`B` (`["value"]`) takes the bracket path: at `[` the frame is `name`, so `classComputedName` is
recorded on the pushed bracket entry and the element state becomes `computedName` (`:362-368`,
`:128-134`); while inside the brackets `classBodyFrame()` returns null, so the string literal cannot
disturb the class frame and a nested `function` would correctly remain a construct; at `]` the entry
flag restores the enclosing class frame to `afterName` (`:413-416`). `C` (`"value"`) and `D` (`1`)
resolve through the string and numeric branches respectively, then follow the same `=` →
`initializer` path. The declaration twins (462, 464, …, 472) close the class body with
`closeCanStartRegex = block = true`, so their trailing `/` opens a regexp and the expected violation
list is empty — which is exactly what controls 461–472 assert.

The six spellings are also exhaustive against the grammar: ECMA-262 defines
`ClassElementName : PropertyName | PrivateIdentifier` and
`PropertyName : LiteralPropertyName | ComputedPropertyName` with
`LiteralPropertyName : IdentifierName | StringLiteral | NumericLiteral`, so identifier, string,
numeric, computed, and private are the complete set of name forms, with `static` and the
accessor/generator modifiers layered on top (all handled by the `candidate` state at `:110-124`).

## Part 2 — whole-repository release readiness at `49dd4f0`

### P2-A. No CI run has ever exercised any part of the current tooling

Locations: `gh run list`, `git ls-remote origin refs/heads/main`, `.github/workflows/ci.yml:216-230`,
`:232-304`, `:332-433`, `:435-520`.

`origin/main` is `3ed04b9`; the reviewed head is 88 commits ahead and unpushed. The most recent
recorded run is `34019219895` (`validate`, success, 2 m 37 s, 2026-09-06) at `3ed04b9`, and the
CHANGELOG's cited run `34015308368` is older still, at the 375-control head. Every lane that is
supposed to supply release evidence — `windows-validator`, the two-leg `windows-install-smoke`, the
578-case `installer-boundaries` loops, `bash-floor` — postdates that run. A workflow definition that
has never executed is a plan, not evidence; the 2 m 37 s reference time is also no guide to whether
the current definition fits inside its timeouts. This is the single largest gap between the
repository's stated release gate ("exact-head CI") and its actual state.

Correction: push the head and let the full matrix run before any further review round; treat the
first complete run as the evidence artifact and record its run id, as rounds 23 and 26 did.

### P2-B. The two remaining behavioural gates rest on unreproduced local evidence

This is Part 1's P2-2 and P3-1 restated at release scope. The ordinary Windows validation claim
(`CHANGELOG.md:163-166`, `README.md:48`, `docs/reviews/README.md:78`) is one run, self-reported in
the commit that introduced the change, with no host, duration, or run identifier — a weaker evidence
record than this repository's own norm (round 42 cited 368.715 s, 405.321 s, and exact statuses).
The anti-vacuity gate remains bypassable by a size-conditional facade. Neither can be closed by
another documentation pass.

### P3-A. The new release entrypoint has no test or contract coverage

Locations: `dev/validate.mjs:2006-2011`, `dev/validate.mjs:17-35`, `package.json:21`,
`.github/workflows/ci.yml:41`, `:230`, `.github/workflows/npm-publish.yml:61`.

`dev/validate-all.mjs` is now the entrypoint for `npm run validate`, `repository-checks`,
`windows-validator`, and the `publish` job's sanity checks. It is covered by exactly one check —
existence (`dev/validate.mjs:30`). It is not in `runtimeGuardContracts` (`dev/validate.mjs:2006-2011`
covers `bin/install.js`, `bin/install-codex.js`, `dev/validate.mjs`, `dev/validate-fixtures.mjs`), so
nothing enforces that it calls `assertSupportedNodeVersion` before doing work or declares the Node
floor in its header — it does both today (`dev/validate-all.mjs:3`, `:10-11`), by hand. No fixture
control mutates it, so its phase table, its skip-variable wiring, and its exit-status mapping have
no negative control. Nothing pins `package.json`'s `scripts.validate` or the workflow `run:` targets
either, so a silent regression to `node dev/validate.mjs` — the exact topology this round is about —
would be invisible to the suite.

Correction: add `dev/validate-all.mjs` to `runtimeGuardContracts`; add one negative control that
mutates the coordinator's `RUST_INTEL_SKIP_NESTED_FIXTURES` phase value and asserts the run is
rejected; pin `scripts.validate` and the three workflow invocations to the coordinator path with the
same style of source contract already used for the workflow Node versions
(`dev/validate.mjs:2075-2085`).

### P3-B. The execution breakdown is prose with no executable check

Locations: `dev/validate-fixtures.mjs:5-16`, `:100`, `:175-179`.

The registry enforces the **total** — `CONTROL_REGISTRY_TOTAL = 484` is compared against the scope
header by regex and every control must be registered and completed exactly once
(`dev/validate-fixtures.mjs:175-179`, `:4342-4356`). The 386/23/75 split is unchecked prose, and it was
wrong for two commits (`ef20ca5` and `ccdabe1` both carried `403 … 386 … 17 … 81`) until `49dd4f0`
corrected it. I verified the focused-child figure independently — 21 `expectLexerProbe` invocations
at `dev/validate-fixtures.mjs:3991`, `:3999`, `:4035`, `:4042`, `:4065`, `:4094`, `:4124`, `:4154`,
`:4231` plus the two probe-script spawns at `:4300` and `:4322-4325` gives exactly 23 — and derived
386 and 75 from round 42's verified 380/17/63 baseline plus this window's `+6/+6/+12` diff. Since the
split is the number the README, CHANGELOG, and ledger all republish, it should be counted by the
registry rather than restated by hand.

Correction: have the registry tally the child spawns it already routes through
`runValidateAgainstMutatedFiles` and `runLexerProbe`, and compare that tally against the header the
same way the total already is.

### P3-C. Release-facing provenance and disposition defects

Part 1's P3-2 and P3-3 are release-record defects as much as commit-window ones: the fixing pass is
credited to the wrong commits, `49dd4f0` is unrecorded, the CHANGELOG and the ledger state opposite
dispositions for the anti-vacuity gate, and the Layout tree misdescribes the validator's default
behaviour. All four are in files that a release reads from.

### Release-readiness evidence at `49dd4f0`

| Area | Evidence |
|---|---|
| Full validator | **Not independently verified this round** (static-only review by instruction). The commit body claims one ordinary `npm run validate` pass on Windows with all 484 controls; no host, duration, or artifact is recorded. Round 42's contradicting failures stand unexplained. |
| CI | **None at this head, and none for any current lane.** Latest run `34019219895` (success, 2 m 37 s, 2026-09-06) is at `3ed04b9`, 88 commits behind. `windows-validator`, the `powershell.exe` leg, and the current `installer-boundaries` definition have never run. |
| Fixture authority | Header, `CONTROL_REGISTRY_TOTAL`, README, CHANGELOG, and ledger all state 484 = 409 (386 + 23) + 75 and agree. Total is machine-enforced; the split is prose (P3-B). 23 focused children counted directly from source. |
| Lexer semantics | Round 42's four counterexamples hand-traced to the correct `initializer` state; the six legal name forms are exhaustive against the ECMA-262 `ClassElementName` grammar; declaration twins keep the regexp role. No new false positive found in the three added branches, because `classBodyFrame()` only matches when the class body is the innermost open delimiter (`dev/js-lexer.mjs:102-105`). |
| Mirror parity | **Verified.** `git ls-files -s skill` and `git ls-files -s skills/rust-intel` produce identical blob hashes for all thirteen files. |
| Version/manifest state | **Correct pre-bump.** `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` all `0.6.0`; `engines.node` `>=24.0.0` (`package.json:24`); README banner `v0.6.0`; latest tag `v0.6.0`; no local or remote `v0.7.0`. |
| Semver classification | **Intact and still correct.** The `0.7.0` MINOR decision is recorded at `README.md:46`, `README.md:282-285`, and `CHANGELOG.md:13`, and the floor raise is real (`git show v0.6.0:package.json` declares `"node": ">=16"`). **No new semver-relevant change in this window**: `git diff --name-only 633a0da..HEAD` touches no packaged path except `package.json`'s `scripts.validate` and `CHANGELOG.md` prose; `dev/` is not in `files`, so the published surface is unchanged. |
| Packaging | **Not re-verified** (`npm pack` is a package command, excluded by instruction). The `files` list is unchanged from round 42's verified 39-entry dry run. |
| Recovery matrix | Definition improved and now covers the documented `powershell.exe`/`.bat` surface; no execution evidence exists at this head for any surface. The 578/578 gate is arithmetically consistent with round 42's measured inventories and with `.github/workflows/ci.yml:292-304`. |
| Workflow wiring | `matrix` is available in `jobs.<job_id>.env` per GitHub's context-availability table, so `RUST_INTEL_POWERSHELL_EXECUTABLE: ${{ matrix.powershell }}` (`.github/workflows/ci.yml:342-343`) reaches `dev/test-installer-recovery.mjs:36` correctly. Action pins are unchanged from round 42's resolved SHAs. |
| History integrity | **Defective in this window.** Three of five commits reference two files that do not exist (P2-1). |

**Release verdict: NOT READY for `v0.7.0`.** Close P2-A by running the full current CI definition on
the exact candidate SHA; close P2-B by reproducing (or falsifying) the Windows fault with attributed
progress output and by making the focused observation causally depend on the large scan; correct the
records in P3-C; then re-review. Only after a clean reviewed head with real CI evidence should the
separately authorized bump, tag, and publish sequence begin.

## Static-verification record

| Check | Method | Result |
|---|---|---|
| Commit window | `git log --format=… 633a0da..HEAD` | Five commits: `724fc87`, `14a672a`, `ef20ca5`, `ccdabe1`, `49dd4f0`; 14 files, `+530/-53`. |
| Missing-file history | `git cat-file -e <sha>:dev/validate-all.mjs` and `:dev/validate-lexer-observations.mjs` for all five | Both missing at `724fc87`, `14a672a`, `ef20ca5`, `ccdabe1`; present only at `49dd4f0`. |
| Broken workflow references | `git show <sha>:.github/workflows/ci.yml` | Lines 41, 58, 59, 230 reference the missing modules at all three intervening commits. |
| Header/doc mismatch | `git show ccdabe1:dev/validate-fixtures.mjs` line 10 vs `ccdabe1` CHANGELOG/ledger text | `403 … 386 … 17 … 81` in code vs `409 … 386 … 23 … 75` in docs, same commit. |
| Focused-child count | Source count of `expectLexerProbe(` call sites and probe-script spawns | 21 + 2 = 23, matching the header. |
| Control totals | `dev/validate-fixtures.mjs:100`, `:175-179` vs header line 5 | 484 enforced on both sides; registry rejects duplicate/missing registration and completion. |
| Lexer counterexamples | Hand-trace of all four round-42 sources plus the six declaration twins through `dev/js-lexer.mjs` | All reach `initializer` before `function`; expression twins report their id, declaration twins report none. |
| Coordinator topology | Hand-trace of `dev/validate-all.mjs:31-47` against `dev/validate.mjs:2285-2299` and Node's `spawnSync` contract | Sequential siblings; core phase skips nested fixtures; non-zero/`signal`/`error` mapped to exit 1; statuses outside `1..255` collapsed to 1. |
| Anti-vacuity bypass | Hand-trace of a size-conditional mutation against controls 458 and 459 and the expected-observation map | Passes every check; the large-input scan remains unproven. |
| Companion constant | Manual count of `'completeCurrentControlScope(901, true)'` and trace of `completionDiagnostics` | 38 code units; reports id `901`; matches `dev/validate-fixtures.mjs:386`. |
| Mirror parity | `git ls-files -s skill` vs `git ls-files -s skills/rust-intel` | Thirteen files, identical blob hashes. |
| Manifests/tags | File reads, `git tag -l`, `git ls-remote origin` | All `0.6.0`; latest tag `v0.6.0`; remote `main` `3ed04b9`; no `v0.7.0` anywhere. |
| Packaged-surface delta | `git diff --name-only 633a0da..HEAD -- bin skill skills commands .claude-plugin .codex-plugin` | Empty. |
| Semver basis | `git show v0.6.0:package.json` | `"node": ">=16"` then vs `>=24.0.0` now — MINOR classification stands. |
| CI state | `gh run list --limit 8` | Newest run `34019219895`, success, at `3ed04b9`; nothing at or after this window. |
| PowerShell 5.1 compatibility | Static scan of `rust-cc-install.ps1` / `rust-cc-uninstall.ps1` for `$IsWindows`, `??`, `-AsByteStream`, `utf8NoBOM`, multi-part `Join-Path`, `-LeafBase`, `-AsHashtable` | No PowerShell-7-only construct found; no `#Requires` version floor either. |
| ECMAScript grammar | ECMA-262 `ClassElementName` / `PropertyName` / `LiteralPropertyName` productions | The six covered name forms are the complete set. |
| Node process semantics | Node `child_process` documentation | `timeout`, `killSignal` default `SIGTERM`, `status` null on signal, `error` set on failure/timeout, `maxBuffer` default `1024 * 1024`, `stdio: 'inherit'` passes the parent streams through. |
| Windows status code | Microsoft `__fastfail` documentation | "User-mode fast fail requests appear as a second chance non-continuable exception with exception code 0xC0000409" — an abort-class termination, not an ordinary exit status. |
| GitHub Actions contexts | GitHub Actions contexts reference, context-availability table | `jobs.<job_id>.env` accepts `github, needs, strategy, matrix, vars, secrets, inputs`; the matrix wiring is valid. |

## Red-tier and out-of-scope inventory

- No normative skill, mirror, or command file changed in this window; all thirteen mirror files are
  byte-identical to `origin/main` and to each other.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue or cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown renderer was added. Cargo, clippy, Miri, `cargo-semver-checks`, audit, and
  deny remain inapplicable: this repository has no Cargo manifest or lockfile, and the executable
  changes are Node and CI-definition repository tooling.
- No dynamic verification was performed by this review, by instruction. Every runtime number quoted
  here is attributed to round 42, to a commit body, or to `gh run list`.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract; only the documented process-interruption guarantee is in scope.
- No product code, manifest version, tag, remote ref, npm artifact, or ledger row was changed by this
  review. This report file is the only authored change.

## Recommended correction order

1. Push the head and obtain one complete run of the current `validate` workflow, including
   `windows-validator` on both Node legs and `windows-install-smoke` on both PowerShell legs. Record
   the run id in the ledger. Nothing else in this list closes P2-A.
2. Reproduce or falsify the Windows `0xC0000409` fixture fault under
   `RUST_INTEL_FIXTURE_PROGRESS=1` so the last live control is attributed, and record the result with
   host, duration, and status — or state explicitly that the fault is not reproducible at this head
   and treat the coordinator as a mitigation rather than a fix.
3. Make control 401's observation causally depend on the large scan (marker inside the
   two-million-unit input), so no constant and no size-conditional branch can produce the expected
   result.
4. Correct the release records: name `49dd4f0` and its actual contents, move the coordinator
   attribution off `14a672a`, reconcile the anti-vacuity disposition between `CHANGELOG.md:167-169`
   and `docs/reviews/README.md:78`, fix the `README.md:123` "fixture-free phase" description, and add
   the round-43 ledger row that this review was not authorized to write.
5. Close the coverage gaps that let this window's defects through: a workflow-path existence check
   (P2-1), `dev/validate-all.mjs` in `runtimeGuardContracts` plus a negative control and pinned
   entrypoints (P3-A), a registry-counted execution breakdown (P3-B), and explicit validation of
   `RUST_INTEL_VALIDATE_TIMEOUT_MS` (P3-4).
6. Re-run an independent P0–P3 review on the resulting head. Only after a clean reviewed head with
   real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish
   sequence begin.
