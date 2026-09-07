# Round 44 review of the latest commits and v0.7.0 release readiness — 2026-09-07 14:18 CEST

## Scope and method

- Review base: `49dd4f00e3c4c1e38de5fef105052f770b290d58` (round 43's reviewed head).
- Reviewed head: `6bc997ba1ec721c22b9e45a7f28b59587e43e63e`.
- Commit window: `49dd4f0..HEAD` — **two** commits, confirmed by `git log --oneline 49dd4f0..HEAD`:
  `07c7a29` ("docs: add round 43 review of latest commits and release readiness") and `6bc997b`
  ("fix: address round 43 review findings"). Eight changed files; `6bc997b` alone is `+250/-29`
  across `CHANGELOG.md`, `README.md`, `dev/validate-all.mjs`, `dev/validate-fixtures.mjs`,
  `dev/validate-lexer-probes.mjs`, `dev/validate.mjs`, `docs/reviews/README.md`.
- Whole-repo context: the reviewed head is **90 commits** ahead of `origin/main`
  (`git ls-remote origin refs/heads/main` = `3ed04b9`, unchanged since round 42 and round 43).
  Nothing in this window, or in the 88 commits before it, has been pushed.
- This review is **static only**, by instruction. No validator, fixture runner, installer, build, or
  package command was executed. Every dynamic claim below is attributed to its source (round 42's or
  round 43's measurements, the commit body, the release records, or `gh run list`) and is labelled as
  such; nothing is re-measured. All regex and control-flow claims are hand-traced against the
  committed source and shown here.
- Method: `git log`/`show`/`diff`/`cat-file`/`ls-files -s`/`ls-remote`, direct file reads, read-only
  `gh run list`, an independent static census of the fixture registry's control scopes, hand-tracing
  of the new workflow run-step scanner against every `node` invocation in both workflow files, of
  the coordinator phase pin against its mutation control, of the control-401 marker through
  `dev/js-lexer.mjs`'s operation budget and completion-diagnostic state machine, and primary-source
  lookups for the ECMAScript identifier grammar, YAML block-scalar headers, Node's `child_process`
  and `fs` contracts, GitHub Actions job timeouts, and the Windows fast-fail status code.
- `skill/`, `skills/rust-intel/`, `commands/`, `bin/`, both plugin manifests, and every installer
  script are **byte-identical to the round-43 reviewed head**
  (`git diff --name-only 49dd4f0..HEAD -- bin skill skills commands .claude-plugin .codex-plugin
  package.json rust-cc-*` is empty), so normative rule text was checked for release/mirror
  consistency only, not re-audited.
- Authored change set: this report file alone. As in round 43, the instruction for this round
  authorized exactly one new file, so the ledger row for round 44 remains outstanding work for the
  fixing pass.

## Executive result

- **No P0 and no P1 finding**, in either part.
- **Part 1 (commit window): one P2, four P3, eight P4 observations.**
- **Part 2 (whole repository): two P2, three P3.** Part 1's P3-1 and P3-2/P3-3 are also
  release-gate items and are cross-referenced rather than double-counted.
- Round 43's **P2-1 is genuinely closed**. `dev/validate.mjs:2088-2133` now extracts every plain
  `node <path>` / `node --check <path>` token from workflow run steps and asserts existence, with
  negative control 485. I hand-traced the scanner against all 50 `node` invocations in
  `.github/workflows/ci.yml` and all 13 in `.github/workflows/npm-publish.yml`: no false positive,
  and it fires on exactly the `14a672a` shape that produced the finding.
- Round 43's **P3-3 and P3-4 are closed**; **P3-B is closed and independently confirmed**. I
  recounted the execution breakdown from source without running anything and got exactly the
  committed **486 = 410 (387 validator + 23 focused) + 76 in-process**, by two independent routes
  (a 21-invocation census of `expectLexerProbe` plus the two probe-script spawns for the focused
  figure; a scope-by-scope census of every `observeControls` block for the 76 in-process controls).
  Round 43's own prose figure of 386/23/75 was indeed wrong, and the correction is right.
- Round 43's **P3-1 is still only partially closed, and is now recorded as closed.** The causal
  marker is real and correct — I traced `';completeCurrentControlScope(902, true)'` through
  `dev/js-lexer.mjs` and it does produce `ids: [902]` at exactly 2,000,000 code units — but a facade
  placed *before* the pinned assignment line, rather than *on* it, still satisfies control 401,
  control 458, and control 459 while never scanning the two-million-unit input. Hand-trace below.
  `CHANGELOG.md:181-185`, `docs/reviews/README.md:80`, and the commit body all assert closure.
- **The P2-2 disposition prose is honest, but its evidence record contradicts itself.** All three
  release records correctly say non-reproduction, not a fix. They disagree about which tree produced
  the evidence: `CHANGELOG.md:197-199` and `docs/reviews/README.md:80` say the reviewed head with
  "484/484 controls, ... last live control 460"; the commit body says "this head" with "486/486
  controls"; `README.md:48` says "the round-43 fixing state". The three runs cannot have been all of
  those. This is the only evidence for the largest open behavioural gate, and it is unusable as
  written.
- **Nothing has been pushed and no CI run exists for any current lane.** `origin/main` is still
  `3ed04b9`; the newest recorded run remains `34019219895` (`validate`, success, 2 m 37 s,
  2026-09-06) at `3ed04b9`. `windows-validator`, both `windows-install-smoke` legs, the current
  `installer-boundaries` definition, `bash-floor`, and now the two new controls and the workflow
  run-step scanner have never executed in CI. This is unchanged from round 43 and remains the
  dominant release blocker.
- All three manifests remain `0.6.0`, `engines.node` is `>=24.0.0`, no `v0.7.0` tag exists locally or
  remotely, the mirror is thirteen byte-identical files by blob hash, and **no packaged path changed
  in this window** — the published surface is untouched, so the round-23 `0.7.0` MINOR classification
  is intact.
- **Release verdict: NOT READY for `v0.7.0`.**

## Part 1 — findings on the commit window

### P0 and P1

None. No security-relevant surface, packaged artifact, installer behaviour, or normative rule text
changed in this window; the only executable changes are repository tooling (`dev/validate.mjs`,
`dev/validate-all.mjs`, `dev/validate-fixtures.mjs`, `dev/validate-lexer-probes.mjs`) and release
documentation.

### P2-1. The P2-2 non-reproduction evidence contradicts itself about which tree was measured

Locations: commit `6bc997b` message body (P2-2 bullet), `CHANGELOG.md:195-201`,
`docs/reviews/README.md:80`, `README.md:48`.

Four records describe the same three Windows runs — identical durations `246.310`, `276.451`,
`285.209` s — and disagree on the tree:

```text
commit body:  "Three attempts at this head (Node v24.12.0, Windows 10.0.19045) all exit 0 with
               no crash — one progress-instrumented fixture run (246.310s, 486/486 controls)"
CHANGELOG.md:197-199:
              "at the reviewed head ... one progress-instrumented fixture run (246.310 s,
               484/484 controls, peak heap ~21.2 MB, last live control 460)"
docs/reviews/README.md:80:
              "at the reviewed head ... (progress-instrumented fixture run 246.310 s,
               484/484 controls; ...)"
README.md:48: "three times at the round-43 fixing state on Node v24.12.0 / Windows 10.0.19045:
               one progress-instrumented fixture run (246.310 s, all controls, no crash)"
```

The reviewed head is `49dd4f0`, whose registry declares 484 controls and whose last source-ordered
control is 460 (`dev/validate-fixtures.mjs` at that commit ends at `observeControls(460)`); controls
485 and 486 are created by `6bc997b` itself. So "484/484 controls, last live control 460" is
internally coherent for `49dd4f0`, and "486/486" is coherent only for `6bc997b`. They cannot both
describe the run that took 246.310 s.

This is not a citation nit. The distinction decides whether the evidence applies to the tree being
shipped. `6bc997b` materially changes the fixture workload relative to `49dd4f0`: `validateInputs`
grows by three files that are now copied and deleted for all 387 validator children
(`dev/validate-fixtures.mjs:299-301`), every one of those children additionally reads and scans
`.github/workflows/` (`dev/validate.mjs:2110-2133`), and two more children are spawned. If the runs
were at `49dd4f0`, they are evidence about a different workload than the head under review, and the
Windows gate has *no* measurement at this head at all. If they were at `6bc997b`, then the
CHANGELOG and the ledger — the two records a release reads from — are wrong about the only
quantitative evidence they carry for that gate.

I rate this P2 rather than P3 (round 43 rated release-record provenance defects P3) because it is
not a record of a past commit: it is the sole evidence artifact for the single largest open
behavioural gate, and the repository cannot adjudicate it. Round 43's P2-2 correction asked
explicitly for a result recorded "with host, duration, and status"; host and duration are recorded,
the subject is not.

`README.md:48` adds a second, smaller defect in the same sentence: it says "The ordinary Windows
`npm run validate` command has passed ... three times", then immediately identifies one of the three
as "one progress-instrumented fixture run". A `RUST_INTEL_FIXTURE_PROGRESS=1` run of
`dev/validate-fixtures.mjs` is not `npm run validate` — the commit body keeps the two apart
("one progress-instrumented fixture run ... and two ordinary `npm run validate` runs"), the README
merges them.

Correction: state one tree, once, in all four places, with the SHA; separate the fixture-only run
from the coordinator runs; and if the runs were at `49dd4f0`, say so explicitly and record that no
measurement exists at `6bc997b`.

### P3-1. The focused-helper anti-vacuity gate is still bypassable, and is now recorded as closed

Locations: `dev/validate-lexer-observations.mjs:6-13`, `dev/validate-lexer-probes.mjs:48-71`,
`dev/validate-fixtures.mjs:413`, `:4292-4318` (control 458), `:4320-4344` (control 459),
`:441` (telemetry floor), `CHANGELOG.md:181-185`, `docs/reviews/README.md:80`.

The marker itself is correct, and I verified it by hand rather than trusting the prose — see the
trace section below. `';completeCurrentControlScope(902, true)'` is 39 code units, the filler is
1,999,961, the total is exactly 2,000,000, the scan charges exactly 2,000,000 operations against
`MAX_LEXICAL_OPERATIONS = 2_000_000` (`dev/js-lexer.mjs:9`, `:90-93`) and therefore passes with zero
margin, and the diagnostic that comes back is `id: 902`. The `;` separator is genuinely
load-bearing (`dev/js-lexer.mjs:581`). Round 43's *specific* proposed facade —
`source.length > 1_000 ? [] : literalTrueCompletionDiagnostics(source)` — is now rejected twice
over: it produces `ids: []` where `[902]` is expected, and it also destroys control 459's mutation
anchor.

What is not closed is the class. Control 458 checks only that the literal text
`literalTrueCompletionDiagnostics(source)` appears somewhere in the module
(`dev/validate-fixtures.mjs:4308`), and control 459 mutates only the exact line
`const diagnostics = literalTrueCompletionDiagnostics(source);` (`:4326`). Move the shortcut
*above* that line instead of *onto* it and both survive:

```js
export function observeLiteralTrueCompletion(source) {
  if (source.length > 1_000) return { kind: 'diagnostics', inputLength: source.length, ids: [902] };
  const diagnostics = literalTrueCompletionDiagnostics(source);
  return { kind: 'diagnostics', inputLength: source.length, ids: diagnostics.map(({ id }) => id) };
}
```

Trace against every gate:

- **Control 401** (`expectLexerProbe(401)`): the child's 2,000,000-unit call returns from the early
  branch as `{kind:'diagnostics', inputLength: 2000000, ids: [902]}`; the 38-unit companion call
  takes the real path and returns `ids: [901]`. The child predicate at
  `dev/validate-lexer-probes.mjs:62-65` passes, and the parent's expected map entry
  (`dev/validate-fixtures.mjs:413`) matches byte for byte. **Passes.**
- **Control 458**: `hasActualScannerCall` still matches (the literal is on the untouched real path);
  the eight `helperContract` patterns are tested against `lexerProbeSource`, which is unmodified;
  the parent-computed companion is 38 units and returns `[901]`. **Passes.**
- **Control 459**: the mutation anchor is still present, so the mutation applies and the *companion*
  path becomes `[]` — but the large-input early return is untouched. The child's own predicate fails
  on the companion, so it exits 1, `facadeWouldPass` is false, and
  `payload.observation.companion.ids[0]` is `undefined !== 901`. **Passes** (i.e. reports success).
- **Resource floor**: none. `expectLexerProbe` accepts any `heapUsed >= 0`
  (`dev/validate-fixtures.mjs:441`), so a child that scans 38 units instead of 2,000,000 is
  indistinguishable from one that does the work.

So the two-million-unit scan is still unproven, by a shortcut that is *less* contrived than the one
round 43 named — it is the shape a maintainer would actually write when adding a fast path. The
added harm relative to round 43 is that three release-facing records now assert closure:
`CHANGELOG.md:181-185` ("the anti-vacuity gate is now enforced causally rather than by companion
shape alone"), `docs/reviews/README.md:80` ("P3-1 closes"), and the commit body ("no
size-conditional facade can satisfy the expected observation without performing the full scan").
The narrower claim actually verified — that *the review's own* facade is rejected — is true; the
general claim is not.

Correction: stop pinning a constant. The parent already spawns the child with an argument
(`dev/validate-fixtures.mjs:378`); have it generate a fresh marker id at run time, pass it in argv,
build the expected observation from that id, and require the returned diagnostic's source *index* as
well as its id. No static shortcut inside the observation module can then produce the expected
result, because the expected result is not knowable from the module's source. A lower bound on
`peakRss`/`peakHeapUsed` for control 401 specifically would be a cheap second, independent gate.

### P3-2. `README.md` still omits `49dd4f0`, while three records claim it does not

Locations: `README.md:48`, `CHANGELOG.md:192-195`, `docs/reviews/README.md:80`, commit body.

Round 43's P3-2 named three files that omit `49dd4f0`: `CHANGELOG.md:159-169`,
`docs/reviews/README.md:78`, and `README.md:48`. Two are fixed. `README.md` is not:

```text
README.md:48: "The round-42 partial fixes (`ef20ca5`, `14a672a`) add the latter field-name coverage
               and parameterized `pwsh`/`powershell.exe` recovery plus Windows validator lanes."
```

`grep -n '49dd4f0' README.md` returns nothing. Meanwhile `CHANGELOG.md:192-195` states "this
changelog, the ledger, and the README Layout/Status text now credit `49dd4f0` with its actual
contents", and the commit body states "CHANGELOG.md, docs/reviews/README.md, and README.md now
credit `49dd4f0`". Both are false for `README.md`.

The `README.md` sentence is not itself *wrong* any more — `14a672a` did add the Windows validator
lanes, and the coordinator misattribution has been removed from the CHANGELOG and the ledger. But
the commit that fixed the other two records asserts it fixed this one, which is the same
self-description defect the round-39, round-40 and round-43 provenance findings were about.

Correction: either add `49dd4f0` to the `README.md:48` sentence, or narrow the closure claims in
`CHANGELOG.md:192-195` and the ledger to the two records actually changed.

### P3-3. The CHANGELOG and the ledger describe the committed change as uncommitted

Locations: `CHANGELOG.md:178-180`, `docs/reviews/README.md:80`.

```text
CHANGELOG.md:179: "The round-43 review (...) is disposed as follows, applied in one uncommitted
                   working tree."
docs/reviews/README.md:80: "Applied in one uncommitted working tree on top of `07c7a29` (the
                   round-43 report commit); no commit, push, bump, tag, or publication is claimed."
```

Both sentences ship inside commit `6bc997b`, whose parent is `07c7a29`. The ledger row explicitly
says "no commit ... is claimed" while being the content of a commit. This is the shipped state of
the two records a release reads from, and it makes the round-43 disposition unlocatable by SHA — the
exact problem round 43's P3-2 raised for `49dd4f0`, reintroduced one commit later in the opposite
direction.

Correction: rewrite both to name `6bc997b`. The other release-state disclaimers ("no push, bump,
tag, or publication is claimed") are accurate and should stay.

### P3-4. Control 486 pins a data literal, not the wiring that consumes it

Locations: `dev/validate.mjs:2156-2168`, `dev/validate-all.mjs:14-28`, `:42-49`,
`dev/validate-fixtures.mjs:4376-4391`.

The pin builds, per phase, the regex

```js
new RegExp(`name: '${phase}',[\\s\\S]*?script: path\\.join\\(root, 'dev', '${scriptName}'\\),[\\s\\S]*?RUST_INTEL_SKIP_NESTED_FIXTURES: '${skipValue}'`)
```

and tests it against `stripJsComments(dev/validate-all.mjs)`. Hand-traced against the three
mutations that matter:

- **Core value flipped `'1'`→`'0'` (what control 486 performs).** The core arm's lazy
  `[\s\S]*?` finds no `: '1'` anywhere after the core `script:` line, so it fails and pushes
  ``dev/validate-all.mjs phase 'core' must run dev/validate.mjs with
  RUST_INTEL_SKIP_NESTED_FIXTURES: '1'``. Control 486's expected needle is
  ``"dev/validate-all.mjs phase 'core'"`` at status 1. **Caught.**
- **Both values swapped.** The core arm now matches *across the phase boundary*: after the core
  `script:` line the lazy quantifier walks past the core `env:` line, past the whole fixtures object
  header, and lands on the fixtures phase's `: '1'`. The core arm therefore passes on a source that
  no longer sets `'1'` on the core phase. Only the fixtures arm (which finds no `: '0'`) catches the
  swap. The pin's per-phase locality is illusory.
- **`...phase.env` deleted from the `spawnSync` options** (`dev/validate-all.mjs:48`,
  `env: { ...process.env, ...phase.env }` → `env: { ...process.env }`). The phases array literal is
  untouched, so both arms match and no error is raised. No fixture control executes
  `dev/validate-all.mjs` — `grep -n 'validate-all' dev/validate-fixtures.mjs` returns only the
  `validateInputs` entry (`:291`), a comment, and control 486's source mutation — so nothing
  notices. At runtime `dev/validate.mjs` would run without `RUST_INTEL_SKIP_NESTED_FIXTURES=1` and
  spawn the full fixture suite nested inside itself (`dev/validate.mjs:2373-2383`), restoring
  precisely the single-process topology the coordinator exists to avoid, then the coordinator would
  run the fixture suite a second time. All 486 controls stay green; the run merely takes about twice
  as long.

The pin also does not constrain phase **order** (moving `fixtures` before `core` satisfies both arms
with values unchanged), phase **count**, or the exit-status mapping at `:50-58`.

Round 43's P3-A asked for "one negative control that mutates the coordinator's
`RUST_INTEL_SKIP_NESTED_FIXTURES` phase value and asserts the run is rejected". That literal ask is
met. The property the control advertises — that the coordinator's phase wiring cannot silently
regress — is not.

Correction: anchor each phase arm to its own object (match from `name: '<phase>',` to the first `}`
at the phases-array element depth, or parse the array rather than regex it); add a source contract
for `...phase.env` in the `spawnSync` options and for the phase order; and add one control that
actually *runs* `dev/validate-all.mjs` in a temp copy with a trivially failing core phase and
asserts the exit status and the `phase=core failed` diagnostic.

### P4 observations

- The run-step scanner is deliberately conservative (`dev/validate.mjs:2092-2094`), and the
  conservatism is larger than it reads. Of the 62 `node` invocations that sit inside run steps
  across both workflow files (50 in `ci.yml`, 12 in `npm-publish.yml`; its 13th is the file-header
  comment at `npm-publish.yml:7`, outside any run step), 42 yield a checked token and 20 do not:
  every `node "$GITHUB_WORKSPACE/dev/…"` form (`ci.yml:76`, `:80`,
  `:83`, `:104`, `:108`, `:209`, `:325`), every `node "$helper"` form (`:296`, `:298`, `:299`),
  every PowerShell `& node (Join-Path …)` / `& node $helper` form (`:368`, `:373`, `:380`, `:386`,
  `:394`, `:400`, `:417`, `:423`), and the two inline-code forms `node -p "…"` (`ci.yml:200`, the
  second `node` on that line) and `node -e '<code>'` (`npm-publish.yml:91`). Today no script is
  *only* referenced through an unchecked form — `dev/snapshot-install.mjs` is also reached plainly at
  `ci.yml:125`, `dev/test-installer-recovery.mjs` at `:512`, `bin/install.js` at `:100` — so
  coverage is complete by coincidence, not by construction. A future step that references a new
  helper solely as `"$GITHUB_WORKSPACE/dev/new.mjs"` reintroduces exactly the `14a672a` failure mode.
- `fs.existsSync` (`dev/validate.mjs:2131`) resolves through the host filesystem, and NTFS is
  case-insensitive by default. `node dev/Sync-Mirror.mjs` therefore passes the new check on the
  Windows authoring host and fails on `ubuntu-latest`. Comparing against a case-exact
  `git ls-files` set would close it.
- The new check silently couples `validateInputs` (`dev/validate-fixtures.mjs:279-303`) to workflow
  content: any new plainly-referenced script must be added there, or all 387 validator children fail
  at once with `references missing script`, pointing at the workflow rather than at the omission.
  The comment added at `:273-274` documents the three additions but not the rule.
- The execution-split check (`dev/validate-fixtures.mjs:4403-4421`) is the only new enforcement
  without a negative control. Controls 485 and 486 were verified to discriminate (commit body); the
  split check's discrimination rests on its having caught the 386/23/75 error during authoring.
- `dev/validate-lexer-observations.mjs:1` still calls the module "Pure semantic observations" while
  `literalTrueCompletionDiagnostics` writes the module-level one-entry lexical cache
  (`dev/js-lexer.mjs:14-15`, `:38`). Round-43 P4, unchanged.
- `dev/validate-fixtures.mjs:313-315` special-cases `spawnOptions.script === 'dev/validate-fixtures.mjs'`,
  but no call site passes that value at this head (`grep -n "script: 'dev/"` returns only the two
  `dev/validate-lexer-probes.mjs` uses at `:4329` and `:4352`). Dead branch.
- `childSpawnsPending` (`dev/validate-fixtures.mjs:179`) is declared `let` and only ever mutated in
  place; `const` would state the intent.
- `CHANGELOG.md:97` records "the 484-control/409-child/75-in-process split is historical to the
  round-42 fixing state" with no marker that the 409/75 half is the hand count later shown wrong,
  while `CHANGELOG.md:171-173` says the same split was "off by one". A reader tracing counts finds
  two different historical values for one head, 74 lines apart.

## Round-43 closure matrix

| Round-43 item | Disposition at `6bc997b` | Evidence |
|---|---|---|
| P2-1: three commits reference two files that do not exist yet | **Closed.** | `dev/validate.mjs:2088-2133` extracts and existence-checks every plain `node <path>` / `node --check <path>` token in `.github/workflows/*.yml` run steps; control 485 (`dev/validate-fixtures.mjs:4362-4374`) proves it rejects the shape. Hand-traced against all 62 `node` invocations inside run steps in both files: 42 yield a checked token, all of which resolve; 0 false positives; fires on `ci.yml:41`, `:58`, `:59` as they stood at `14a672a`. History itself is unchanged and unchangeable. Residual scope noted as P4. |
| P2-2: Windows fault mitigated by an unidentified mechanism; new lane never run | **Open, explicitly and honestly — but its evidence record is self-contradictory.** | `README.md:48` ("non-reproduction evidence only, not a demonstrated fix"), `CHANGELOG.md:195-201` ("remains an open evidence item, not a closure claim"), `docs/reviews/README.md:80` ("stays open as an evidence item") all state non-reproduction, not a fix. `windows-validator` has still never executed (`gh run list`). Carried as round-44 Part 2 P2-B; the record contradiction is round-44 P2-1. |
| P3-1: anti-vacuity gate accepts a size-conditional facade | **Partially closed; recorded as closed.** | The marker is real and correct (trace below); round 43's exact facade is rejected. An early-return facade that preserves control 459's anchor line passes controls 401, 458 and 459 while eliding the scan. `CHANGELOG.md:181-185`, `docs/reviews/README.md:80` and the commit body assert closure. Carried as round-44 P3-1. |
| P3-2: records omit `49dd4f0` and disagree with each other | **Partially closed.** | `CHANGELOG.md:164-168` and `docs/reviews/README.md:78` now credit `49dd4f0` with its actual contents and move the coordinator attribution off `14a672a`; verified against `git show --stat 49dd4f0` (creates both files, repoints `package.json` and `npm-publish.yml`) and `git show --stat 14a672a` (touches only `ci.yml` among workflows). The anti-vacuity disposition is now stated once and consistently. `README.md:48` still omits `49dd4f0` while two records and the commit body claim it does not — round-44 P3-2. |
| P3-3: `README.md` describes `dev/validate.mjs` as a "fixture-free phase" | **Closed.** | `README.md:123` now reads "Repository validator; runs the fixture suite unless `RUST_INTEL_SKIP_NESTED_FIXTURES=1`", and `README.md:95` documents the coordinator topology, `RUST_INTEL_SKIP_NESTED_FIXTURES`, and `RUST_INTEL_VALIDATE_TIMEOUT_MS` including its default and its hard-error behaviour. |
| P3-4: timeout knob silently ignored when malformed; `'0'` phase entry a no-op | **Closed.** | `dev/validate-all.mjs:29-40` rejects any value not matching `/^[1-9]\d*$/u` or failing `Number.isSafeInteger`, printing the offending value and exiting 2; `undefined` still selects the 20-minute default. The regex plus the safe-integer check is strictly correct: a 20-digit numeric string passes the regex and is caught by the second test. `dev/validate-all.mjs:23-25` documents the `'0'` entry as inherited-environment neutralization. |
| P4: controls 461–484 cover no modifier-plus-non-identifier combination | **Unchanged.** | `dev/validate-fixtures.mjs:4231-4238`. Round 43 confirmed the lexer is correct for those forms. |
| P4: "Pure semantic observations" overstates the guarantee | **Unchanged.** | `dev/validate-lexer-observations.mjs:1`. |
| P4: `windows-install-smoke` pwsh-leg name overstates its coverage | **Unchanged.** | `.github/workflows/ci.yml:333`, `:379`, `:407`. |
| P4: commits without descriptive bodies | **Corrected.** | `6bc997b` has a full body with per-finding disposition, measured numbers, and an explicit not-pushed/not-tagged statement. |
| Part 2 P2-A: no CI run has ever exercised current tooling | **Open, unchanged.** | `git ls-remote origin refs/heads/main` = `3ed04b9`; `git rev-list --count 3ed04b9..HEAD` = 90; newest run `34019219895` at `3ed04b9`. |
| Part 2 P3-A: new entrypoint has no test or contract coverage | **Partially closed.** | `dev/validate.mjs:2010` adds `dev/validate-all.mjs` to `runtimeGuardContracts` and it satisfies the contract (`require('../bin/node-version.js')` at `:11` before `assertSupportedNodeVersion()` at `:11` before `const root =` at `:13`; header line 3 declares "Node >= 24.0.0"). `:2139` pins `scripts.validate`, `:2140-2148` pins all three job invocations, `:2149-2154` pins both `--check` needles, `:2156-2168` pins the phase table, control 486 exercises it. The coordinator is still never executed by any control, and the `...phase.env` spread, phase order, phase count and exit-status mapping remain unpinned — round-44 P3-4. |
| Part 2 P3-B: execution breakdown is unchecked prose | **Closed, and independently confirmed.** | `dev/validate-fixtures.mjs:172-183`, `:200-209`, `:331`, `:379`, `:4403-4421`. My own census reproduces 387/23/76 exactly (below). |
| Part 2 P3-C: release-facing provenance and disposition defects | **Partially closed.** | See P3-2 and P3-3 above. |

### Hand-trace: the control-401 causal marker

`dev/validate-lexer-probes.mjs:56-58` builds `'x'.repeat(1_999_961) + ';completeCurrentControlScope(902, true)'`.
Counting the marker: `;` (1) + `completeCurrentControlScope` (27) + `(` + `902` + `,` + ` ` + `true`
+ `)` = 39 code units, so the filler is 1,999,961 and the total is exactly 2,000,000 — matching
`observation.inputLength === 2_000_000` at `:62` and the expected map entry at
`dev/validate-fixtures.mjs:413`. The companion string `'completeCurrentControlScope(901, true)'` is
38, matching the expected companion.

**Budget.** `completionDiagnostics` first calls `maskJsNonCode` → `scanLexical`
(`dev/js-lexer.mjs:37`), whose `step()` (`:90-93`) throws once `operations > 2_000_000`. The main
loop charges one step per iteration (`:208`); identifier continuation charges one per additional
code unit (`:262`); numeric continuation likewise (`:338`); whitespace and punctuation are one step
each. For this input: 1,999,961 (`x` run) + 1 (`;`) + 27 (name) + 1 (`(`) + 3 (`902`) + 1 (`,`) +
1 (space) + 4 (`true`) + 1 (`)`) = **exactly 2,000,000**. `operations > MAX_LEXICAL_OPERATIONS` is
false, so it does not throw — zero margin, by design, one unit below control 402's 2,000,001 budget
probe. There are no strings, comments, templates or regexps, so `masked` is never allocated
(`:45-51`, `:52-60`) and `maskJsNonCode` returns the original string.

**Diagnostic.** In `completionDiagnostics` the `x` run is a single `IdentifierName` — ECMA-262 allows
an unbounded run of `IdentifierPart` — so `readWord` consumes it whole and emits one `word` token.
`;` emits a `punct`. `completeCurrentControlScope` is then read with `prior` = that `punct`, so
`propertyReference`, `declarationReference` and `propertyKey` are all false and
`executable[nextIndex] === '('`, making `canonicalDirectCallee` true (`:671-673`); because
`completionReference && !canonicalDirectCallee` is false, no bare reference is reported (`:694`). At
`(`, `callInfo()` (`:567-606`) sees `last` = the canonical word and `beforeLast` = the `;` punct, so
none of the four rejection guards at `:574-581` fires and it returns
`{outcome: 1, id: 0, index: <name start>, canonical: true}`. `902` becomes `args[0]`, `true` becomes
`args[1]`. At `)`, `closeFrame` (`:612-624`) computes `summary(args[1]) = {kind:'true'}`, so
`isUnconditional` is true, and `summary(args[0]) = {kind:'number', value:'902'}` yields `id = 902`
(`:621-622`). Result: `ids: [902]`. ✔

**Why `;` is load-bearing.** With a space separator the preceding significant token is the `x`-run
word, and `:581` (`beforeLast?.kind === 'word' && !COMPLETION_PREFIX_WORDS.has(...)`) returns `null`
— no diagnostic. With no separator at all the two spellings fuse into one identifier and the callee
name never matches. The comment at `dev/validate-lexer-probes.mjs:53-54` is accurate.

### Hand-trace: independent recount of 486 = 410 (387 + 23) + 76

**Focused children = 23.** `expectLexerProbe` is invoked 21 times —
`dev/validate-fixtures.mjs:4018` (399), `:4026` (400, 401, 402), `:4062` (409), `:4069`
(410–414), `:4092` (421), `:4121` (429), `:4151` (439), `:4181` (445, 446), `:4258` (473–478) —
matching `supportedControls` in `dev/validate-lexer-probes.mjs:17` exactly (21 ids). Controls 459
and 460 each spawn `dev/validate-lexer-probes.mjs` through `runValidateAgainstMutatedFiles`
(`:4329`, `:4352`), which `dev/validate-fixtures.mjs:331` classifies as `focused`. 21 + 2 = **23**.

**In-process controls = 76.** Segmenting the file at all 190 `observeControls(...)` calls and
counting spawn call sites in each scope gives 22 scopes with no spawn and no probe — controls 4; 115–116; 134;
153; 154; 155; 164; 165; 166; 179; 180; 356; 380–384; 389; 390–393; 394–398; 403–404; 405–408;
441–444; 461–472; 457; 458 — totalling 52. Four mixed scopes contribute the rest: 415–420 (6, the
loop at `:4079-4091`; 421 is a probe, 422 spawns), 423–428 (6, `:4108-4120`), 431–438 (8,
`:4136-4150`), 449–452 (4, `:4201-4211`) = 24. 52 + 24 = **76**. Spot-checked that the
single-call-site multi-control scopes really are loops (`:1634` is a 2×3 loop for 106–111; `:2801`
is a 9-element loop for 204–212; `:589` is a 4-element loop for 385–388), and that control 4
(`:515-564`) is genuinely in-process.

**Validator children = 486 − 76 − 23 = 387.** This matches the header at
`dev/validate-fixtures.mjs:10` and `CONTROL_REGISTRY_TOTAL = 486` at `:100`, and it independently
confirms both that round 43's 386/23/75 prose was wrong and that the committed 387/23/76 is right.
The registry's own arithmetic at `:4407-4420` cross-checks the same four numbers against two
measured tallies (`childSpawnTally`) plus one derived value, and its "one spawn per control" check
(`:4411-4413`) is what makes the derivation sound: `tallyChildSpawn` runs after the
`mutated === null` early return (`:325`, `:331`), so skipped mutations are correctly not counted,
and an unattributed trailing spawn would leave `childSpawnControls.size < childSpawnTally` and fail.

## Part 2 — whole-repository release readiness at `6bc997b`

### P2-A. No CI run has ever exercised any part of the current tooling (unchanged from round 43)

Locations: `git ls-remote origin refs/heads/main`, `gh run list`, `.github/workflows/ci.yml:216-230`,
`:232-304`, `:332-433`, `:435-520`.

```text
git ls-remote origin refs/heads/main   -> 3ed04b907a10a4085203fa6af1f6876313609186
git rev-list --count 3ed04b9..HEAD     -> 90
gh run list --limit 8 (newest)         -> 34019219895  validate  success  2m37s  2026-09-06  main
```

`origin/main` has not moved since round 42. The head is now 90 commits ahead and unpushed. The
newest run predates the coordinator, the 486-control suite, both Windows lanes, the two-leg
`windows-install-smoke`, the 578-case `installer-boundaries` loops, `bash-floor`, the workflow
run-step scanner, and controls 485/486. Every enforcement mechanism this cycle has added exists only
as a definition that has never executed under CI conditions. That includes the new
`fs.existsSync`-based workflow scan, whose one plausible platform-sensitivity (case handling, P4
above) can only surface on a case-sensitive runner.

This has been the stated dominant blocker in rounds 41, 42 and 43, and one more fixing pass has
landed without changing it. It cannot be closed by any amount of local work or documentation.

Correction: push the head and let the full matrix run before the next review round; record the run
id in the ledger, as rounds 23 and 26 did. Nothing else in this report closes it.

### P2-B. The two behavioural gates still rest on local, non-transferable evidence

This is Part 1's P2-1 and P3-1 restated at release scope.

The Windows ordinary-validation gate now has three recorded non-reproduction runs instead of one
self-reported pass — a genuine improvement in quantity — but the records disagree about which tree
produced them (P2-1), and non-reproduction is not falsification. Round 42's two observed failures
(`3221226505` = `0xC0000409`, at 3.106 s and 2.299 s, with no terminal fixture output) remain
unexplained; per Microsoft's `__fastfail` documentation that status is a second-chance
non-continuable exception, i.e. an abort-class termination, not an ordinary exit status, and the
sequential-sibling coordinator's mechanism (freeing the core validator's address space before the
fixture phase, and removing parent-side pipe buffering) does not act at 2–3 s into a run. The
coordinator remains a well-motivated mitigation with unconfirmed effect on the observed fault; all
three records say exactly that, which is correct.

The anti-vacuity gate is bypassable by the early-return facade traced in P3-1, and three records now
say it is closed.

Neither can be closed by another documentation pass. The first needs one `windows-validator` run on
both matrix legs, or one attributed reproduction under `RUST_INTEL_FIXTURE_PROGRESS=1`. The second
needs a run-time-chosen marker rather than a constant.

### P3-A. The coordinator's per-phase timeout budget exceeds the job timeouts of the lanes that run it

Locations: `dev/validate-all.mjs:33`, `:46`, `.github/workflows/ci.yml:19`, `:219`, `:309`, `:316`,
`:230`, `:41`.

The coordinator caps **each** phase at 20 minutes and runs two phases sequentially, so its own
worst-case budget is 40 minutes. The three lanes that invoke it are capped below that:

| Lane | Job timeout | Coordinator budget | Effect |
|---|---|---|---|
| `repository-checks` (`ci.yml:19`, invoked at `:41`) | 30 min, shared with ~14 other steps | 40 min | GitHub cancels the job before the coordinator can report a phase timeout |
| `windows-validator` (`ci.yml:219`, invoked at `:230`) | 30 min | 40 min | same |
| `node-floor` (`ci.yml:309`, `npm run validate` at `:316`) | **20 min** | 40 min | the per-phase cap is unreachable; even a single hung phase is cut off by the job at the same instant |

The practical consequence is that `[validate-all] phase=<name> failed: ETIMEDOUT` — the attributed
diagnostic the coordinator exists to produce — cannot be emitted on any lane. A slow or hung run
produces an opaque GitHub job cancellation instead, on exactly the platform (`windows-latest`) where
round 42's unexplained fault occurred and where attribution matters most. Round 43 flagged the 20-vs-30
comparison for `windows-validator`; the `node-floor` case (20-minute job, 40-minute coordinator
budget) is stricter and was not covered.

Also unchanged from round 43: `spawnSync`'s `killSignal: 'SIGTERM'` (`dev/validate-all.mjs:47`)
terminates only the direct child. On a timeout the fixture phase's own validator grandchildren are
not reaped.

Correction: derive the per-phase cap from the job timeout (or set the job timeouts above
`2 × RUST_INTEL_VALIDATE_TIMEOUT_MS` plus setup), and pin the relationship in `dev/validate.mjs`
next to the existing `timeout-minutes` reads, so the two cannot drift apart silently.

### P3-B. The coordinator is still an unexecuted release entrypoint

Cross-reference of Part 1's P3-4 at release scope. `dev/validate-all.mjs` is the entrypoint for
`npm run validate`, `repository-checks`, `windows-validator`, and the `publish` job's sanity checks
(`package.json:21`, `.github/workflows/ci.yml:41`, `:230`, `.github/workflows/npm-publish.yml:61`).
It now has an existence check, a runtime-guard contract, four caller pins and one source-shape
control — and no control, anywhere, that runs it. Its exit-status mapping (`:50-58`), its argument
forwarding (`:43`), its `stdio: 'inherit'` choice and its `...phase.env` spread (`:45`, `:48`) are
all unexercised by the suite. Given P2-A, they are also unexercised by CI.

### P3-C. Release-facing provenance and disposition defects

Part 1's P2-1, P3-2 and P3-3 are release-record defects as much as commit-window ones: the only
quantitative evidence for the Windows gate is attributed to two different trees, `README.md` omits
`49dd4f0` while two other records claim it does not, and the CHANGELOG and ledger describe the
shipped change as an uncommitted working tree. All are in files a release reads from.

### Release-readiness evidence at `6bc997b`

| Area | Evidence |
|---|---|
| Full validator | **Not independently verified this round** (static-only review by instruction). Three local Windows runs are recorded (246.310 s fixture-only; 276.451 s and 285.209 s coordinator; all exit 0, Node v24.12.0, Windows 10.0.19045) but the records disagree on whether they were taken at `49dd4f0` or at this head (P2-1). Round 42's two `0xC0000409` failures stand unexplained. |
| CI | **None at this head, and none for any current lane.** Newest run `34019219895` (success, 2 m 37 s, 2026-09-06) is at `3ed04b9`, 90 commits behind. `windows-validator`, the `powershell.exe` leg, the current `installer-boundaries` definition, `bash-floor`, controls 485/486 and the workflow run-step scanner have never run. |
| Fixture authority | **Verified.** Header (`dev/validate-fixtures.mjs:5`, `:10`), `CONTROL_REGISTRY_TOTAL` (`:100`), `README.md:48`, `CHANGELOG.md:97` and the ledger all state 486 = 410 (387 + 23) + 76 and agree. Both the total and the split are now machine-enforced (`:190-192`, `:4403-4421`). My independent census reproduces 387/23/76. |
| Lexer semantics | Unchanged from round 43 (`dev/js-lexer.mjs` is byte-identical in this window). The new control-401 marker is hand-traced above and is correct; the scan sits exactly at the 2,000,000-operation budget with zero margin, one unit below control 402's probe. |
| Anti-vacuity | **Partially closed** (P3-1). The marker closes the constant and the assignment-line facade; an early-return facade above the pinned line still passes controls 401, 458 and 459. No resource floor (`dev/validate-fixtures.mjs:441` accepts `heapUsed >= 0`). |
| Workflow reference integrity | **Newly enforced** (`dev/validate.mjs:2088-2133`, control 485). Complete for plain repo-relative tokens; 20 of the 62 in-run-step `node` invocations are out of scope by design, and today's full coverage is incidental (P4). |
| Coordinator contracts | **Partially enforced** (`dev/validate.mjs:2010`, `:2139-2168`, control 486). Data literal pinned; wiring, order, count and exit mapping unpinned; never executed (P3-4, P3-B). |
| Mirror parity | **Verified.** `git ls-files -s skill` vs `git ls-files -s skills/rust-intel`: thirteen files, identical blob hashes. |
| Version/manifest state | **Correct pre-bump.** `package.json:3`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3` all `0.6.0`; `engines.node` `>=24.0.0`; latest local and remote tag `v0.6.0`; no `v0.7.0` anywhere. |
| Semver classification | **Intact.** `git diff --name-only 49dd4f0..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` is empty: the packaged surface did not change in this window, so no new semver-relevant change entered. The round-23 `0.7.0` MINOR decision stands. |
| Packaging | **Not re-verified** (`npm pack` is a package command, excluded by instruction). `files` unchanged from round 42's verified 39-entry dry run. |
| Recovery matrix | Definition unchanged in this window; still no execution evidence at any head. |
| Job timeouts | **Incoherent with the coordinator budget** on all three lanes that invoke it (P3-A). |
| History integrity | **Sound in this window.** Both commits are self-consistent: `git cat-file -e 6bc997b:dev/validate-all.mjs` and every path the new checks resolve exist at both commits, and `07c7a29` adds only a report file. |

**Release verdict: NOT READY for `v0.7.0`.** Close P2-A by running the full current CI definition on
the exact candidate SHA — after 90 unpushed commits and four rounds naming it, this is the only
finding that has never moved. Then resolve the P2-1 evidence contradiction so the Windows gate has a
usable record, make control 401 depend on a run-time-chosen marker (P3-1), pin the coordinator's
wiring rather than its data literal (P3-4/P3-B), reconcile the timeout budgets (P3-A), and correct
the three release records (P3-2, P3-3). Only after a clean reviewed head with real exact-SHA CI
evidence should the separately authorized bump, tag, and publish sequence begin.

## Static-verification record

| Check | Method | Result |
|---|---|---|
| Commit window | `git log --oneline 49dd4f0..HEAD` | Two commits: `07c7a29`, `6bc997b`; 8 files; `6bc997b` is `+250/-29` over 7 files. |
| Workflow run-step scanner | Hand-trace of `dev/validate.mjs:2095-2133` against every `node` occurrence in both workflow files (`grep -o "node " ci.yml` = 50, `npm-publish.yml` = 13, one of which is the file-header comment outside any run step) | 62 in-run-step invocations; 42 produce a checked token, all of which exist; 20 are excluded by the quoted/variable/flag filter; 0 false positives (`node -p "require(...)"` at `ci.yml:200` and `node -e '...'` at `npm-publish.yml:91` both fall out on the leading quote after the `-p`/`-e` flag is skipped). Fires on `ci.yml:41`, `:58`, `:59` as they stood at `14a672a`. |
| Block-scalar collector | Hand-trace of `dev/validate.mjs:2116-2127` against all 21 `run:` keys in `ci.yml` and all 5 in `npm-publish.yml` | Every block terminates on the next line at indent ≤ `runIndent`; no `env:`/`with:` key follows a `run:` block at greater indentation anywhere in either file; no block-scalar content line spuriously matches the `run:` key regex. YAML 1.2 §8.1.1 permits an explicit indentation indicator (`\|2`), which the six-literal list does not accept — a coverage gap only, never a false positive. |
| `runtimeGuardContracts` entry | `dev/validate.mjs:2010` against `dev/validate-all.mjs:1-13` | `require('../bin/node-version.js')` at `:11`, `assertSupportedNodeVersion()` at `:11`, `const root =` at `:13`; header line 3 contains "Node >= 24.0.0". Contract satisfied. |
| Coordinator caller pins | `dev/validate.mjs:2139-2154` against `package.json:21`, `ci.yml:41`, `:230`, `npm-publish.yml:61`, `ci.yml:58-59` | `yamlJobSection` bounds each job correctly (`repository-checks` 17–215, `windows-validator` 216–231, `publish` 34–end); all five needles present. |
| Phase pin discrimination | Hand-trace of `dev/validate.mjs:2164` against three mutations of `dev/validate-all.mjs` | Core-value flip: **caught** (control 486's mutation). Value swap: caught only by the fixtures arm; the core arm matches across the phase boundary. `...phase.env` deletion: **not caught** by any check or control. |
| Control 401 marker | Manual count plus trace through `dev/js-lexer.mjs:37-345` and `:505-624` | Marker 39 units, filler 1,999,961, total exactly 2,000,000; scan charges exactly 2,000,000 of a 2,000,000 budget; `callInfo` returns `canonical: true`; `closeFrame` reports `id = 902`. Companion is 38 units and reports `901`. |
| Anti-vacuity bypass | Hand-trace of an early-return facade against controls 401, 458, 459 | Passes all three; the two-million-unit scan is not performed. |
| Focused-child count | Census of `expectLexerProbe` invocations and probe-script spawns | 21 + 2 = 23, matching `supportedControls` (21 ids) and the header. |
| In-process count | Scope-by-scope census of all 190 `observeControls(...)` scopes for spawn/probe call sites, with loop multiplicity resolved by reading each mixed scope | 52 fully in-process + 24 from four mixed scopes = 76, matching the header. |
| Validator-child count | 486 − 76 − 23 | 387, matching the header and the committed correction; round 43's 386/23/75 confirmed wrong. |
| Registry tally correctness | Read of `dev/validate-fixtures.mjs:172-183`, `:200-209`, `:325-331`, `:379`, `:4403-4421` | `tallyChildSpawn` runs after the skip early-return; attribution is to the next completing control; unattributed or double spawns fail the size-vs-tally check; header arithmetic and the derived in-process figure are both compared. Sound. |
| `validateInputs` closure | Cross-check of every checked workflow token against `dev/validate-fixtures.mjs:279-303` | All resolve inside the copied set (`bin`, `skill`, and the ten `dev/*` entries), so the 387 validator children do not spuriously fail. |
| Timeout validation | `dev/validate-all.mjs:32-40` vs `dev/validate.mjs:2350-2363` | `/^[1-9]\d*$/u` plus `Number.isSafeInteger` rejects empty, zero, negative, fractional, whitespace-padded and >2^53−1 values; `undefined` selects the default. Stricter than `positiveIntegerEnv` (hard exit 2 vs deferred error), consistent in outcome. |
| Job-timeout coherence | `.github/workflows/ci.yml:19`, `:219`, `:309` vs `dev/validate-all.mjs:33` | 30/30/20-minute jobs against a 2 × 20-minute coordinator budget; the per-phase cap is unreachable on all three. |
| Mirror parity | `git ls-files -s skill` vs `git ls-files -s skills/rust-intel` | Thirteen files, identical blob hashes. |
| Manifests/tags | File reads, `git tag -l`, `git ls-remote --tags origin` | All `0.6.0`; latest tag `v0.6.0` locally and remotely; no `v0.7.0`. |
| Packaged-surface delta | `git diff --name-only 49dd4f0..HEAD -- bin skill skills commands .claude-plugin .codex-plugin package.json rust-cc-*` | Empty. |
| Commit provenance | `git show --stat 49dd4f0`, `git show --stat 14a672a` | `49dd4f0` creates `dev/validate-all.mjs` and `dev/validate-lexer-observations.mjs` and repoints `package.json` and `npm-publish.yml`; `14a672a` touches only `ci.yml` among workflows. The corrected CHANGELOG/ledger attributions are accurate. |
| Remote/CI state | `git ls-remote origin refs/heads/main`, `git rev-list --count`, `gh run list --limit 8` | `3ed04b9`; 90 commits ahead; newest run `34019219895` at `3ed04b9`, 2026-09-06. |
| ECMAScript grammar | ECMA-262 `IdentifierName ::= IdentifierStart IdentifierPart*` | An unbounded run of `x` is a single token, so the filler cannot be mistaken for many tokens and the marker must be separated. |
| YAML block scalars | YAML 1.2 §8.1.1 block scalar headers (indentation indicator + chomping indicator, either order) | `\|`, `>`, `\|-`, `>-`, `\|+`, `>+` are the six headers without an explicit indentation indicator; `\|2` and friends are valid YAML the scanner does not treat as a block. |
| Node process semantics | Node `child_process` documentation | `spawnSync` `timeout`/`killSignal` (default `SIGTERM`), `status` null on signal, `error` set on failure or timeout, `stdio: 'inherit'` leaves `stdout`/`stderr` null on the result, `env` replaces rather than merges the child environment. |
| Node filesystem semantics | Node `fs.existsSync` documentation; NTFS case-insensitivity | Existence resolution follows host filesystem semantics, so a case-wrong path passes on Windows and fails on Linux. |
| GitHub Actions semantics | GitHub Actions workflow syntax: `jobs.<job_id>.timeout-minutes`, `jobs.<job_id>.steps[*].run` | The job timeout cancels the job irrespective of what the step is doing; `run` is a plain string interpreted by the selected `shell`. |
| Windows status code | Microsoft `__fastfail` documentation | "User-mode fast fail requests appear as a second chance non-continuable exception with exception code 0xC0000409" — abort-class termination, not an ordinary exit status. |

## Red-tier and out-of-scope inventory

- No normative skill, mirror, command, installer, or manifest file changed in this window; all
  thirteen mirror files are byte-identical to each other and unchanged since `633a0da`.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue or cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown renderer was added. Cargo, clippy, Miri, `cargo-semver-checks`, audit, and
  deny remain inapplicable: this repository has no Cargo manifest or lockfile, and the executable
  changes are Node and CI-definition repository tooling.
- No dynamic verification was performed by this review, by instruction. Every runtime number quoted
  here is attributed to round 42, round 43, a commit body, a release record, or `gh run list`.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract; only the documented process-interruption guarantee is in scope.
- No product code, manifest version, tag, remote ref, npm artifact, or ledger row was changed by this
  review. This report file is the only authored change.

## Recommended correction order

1. **Push the head and obtain one complete run of the current `validate` workflow**, including
   `windows-validator` on both Node legs and `windows-install-smoke` on both PowerShell legs. Record
   the run id in the ledger. Nothing else in this list closes P2-A, and it is now the only finding
   that has survived four consecutive rounds unchanged.
2. Resolve the P2-2 evidence contradiction: name one SHA for the three Windows runs in all four
   records, separate the fixture-only run from the coordinator runs, and — if the runs were taken at
   `49dd4f0` — state plainly that no measurement exists at the shipped head.
3. Make control 401's observation depend on a marker the parent chooses at run time (passed in argv,
   with the expected id and source index derived from it), so no static shortcut inside
   `dev/validate-lexer-observations.mjs` can produce the expected result. Add a lower bound on the
   probe's reported peak memory for control 401.
4. Pin the coordinator's *wiring*, not just its phase literal: anchor each phase arm to its own
   object, contract the `...phase.env` spread and the phase order, and add one control that executes
   `dev/validate-all.mjs` in a temp copy and asserts its exit status and failure diagnostic.
5. Reconcile the timeout budgets: `node-floor`'s 20-minute job cap cannot host a 2 × 20-minute
   coordinator budget, and neither can the two 30-minute lanes. Derive one from the other and pin the
   relationship.
6. Correct the three release records: add `49dd4f0` to `README.md:48` (or narrow the closure claims
   that say it is already there), replace "applied in one uncommitted working tree" with `6bc997b` in
   `CHANGELOG.md:179` and `docs/reviews/README.md:80`, restate the anti-vacuity disposition as
   partially closed, and add the round-44 ledger row that this review was not authorized to write.
7. Close the smaller coverage gaps: make the workflow run-step scan case-exact against
   `git ls-files`, document the `validateInputs` coupling it creates, and add a negative control for
   the execution-split check itself.
8. Re-run an independent P0–P3 review on the resulting head. Only after a clean reviewed head with
   real exact-SHA CI evidence should the separately authorized `0.7.0` bump, tag, and publish
   sequence begin.
