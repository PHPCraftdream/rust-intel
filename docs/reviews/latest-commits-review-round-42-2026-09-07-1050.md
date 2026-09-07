# Round 42 review of the latest commits and v0.7.0 release readiness — 2026-09-07 10:50 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, also
  confirmed by `git ls-remote origin refs/heads/main`).
- Reviewed head: `633a0daa182f1574ec182f89fdba22878f181a2c`.
- Commit window: `origin/main..633a0da` — eighty-three commits, forty changed files,
  `+9750/-631`, reviewed in an isolated linked worktree.
- Round 41 and its fixing commits `9a675f8`, `c5b959f`, `322a034`, and `633a0da` were
  traced against class-field initializer roles, the subject-only cross-operation corruption hook,
  focused-helper semantic results and argument parsing, child telemetry, the 460-control registry,
  and the release-facing disposition.
- No normative `skill/`, `skills/rust-intel/`, or command file differs from `origin/main`. The
  normative v0.7 spec text was therefore checked for mirror/package/release consistency rather than
  re-audited as a new semantic diff.
- Static review was supplemented by bounded counterexamples, action-ref resolution, syntax and
  package checks, representative recovery executions, the 48-boundary release calibration, a
  direct 460-control fixture run, focused control-401 repetitions, and ordinary validator attempts.
- No product code, manifest version, tag, remote ref, or release artifact was changed. This report
  and its ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Two P2 and three P3 findings remain.** The highest implementation finding is the same lexical
  false-negative class round 41 tried to close: class-element state advances for an identifier
  name, but not for private, string, numeric, or computed names. A genuine `function` expression
  after any of those fields is treated as another element name, and the following live completion
  or workflow mutation is masked as a regexp.
- The round-40/41 resource mitigation is real: a progress-enabled direct fixture run completed all
  460 controls, and focused control 401 completed six standalone times under the committed 64 MiB
  old-space cap. It is not a stable ordinary-validator proof on this Windows host. Two `npm run
  validate` attempts died almost immediately with Windows status `0xC0000409`; a direct `node
  dev/validate.mjs` attempt reached the focused phase but failed control 401 with V8 heap OOM and
  also lost the control-430 child. Thus exact-head CI remains necessary but is not sufficient to
  explain the Windows result, because the full validator currently runs only on Ubuntu jobs.
- The cross-operation expected side is now independent and the subject-only corruption invocation
  check would reject restoration of the prior helper-based self-replay. Representative same- and
  cross-operation cases passed for Node Claude, Node Codex, and Bash.
- Focused results are structured and the parent checks their ID, observation, and terminal child
  telemetry. The source anti-vacuity gate still accepts an expected-shaped constant in a helper
  branch; replacing control 401's real scan with `const diagnostics = []` leaves control 458's
  entire contract green and would let control 401 pass without running the large-input scan.
- The PowerShell transaction matrix executes only through `pwsh`. The documented `cmd.exe`
  wrappers invoke `powershell.exe`, and the README gives unqualified PowerShell instructions, so
  the supported Windows PowerShell 5.1 path is outside the recovery matrix and CI. A local 5.1
  parse plus ordinary install/uninstall passed, but it does not cover the new interruption states.
- Count arithmetic is internally consistent at **460 = 397 child-process controls (380 validator
  entrypoint + 17 focused lexer/helper) + 63 in-process controls**. The mirror has thirteen
  byte-identical files and the package dry run has thirty-nine entries.
- All three manifests and the README release banner remain at `0.6.0`; Status and CHANGELOG call
  `0.7.0` planned. Local/remote `v0.7.0` are absent, npm `latest` remains `0.6.0`, and remote `main`
  remains `3ed04b9`. This is the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close both P2s and the P3 oracle/runtime/documentation
  gaps, obtain clean ordinary validation on supported hosts plus exact-release-SHA CI, and only then
  perform the separately authorized bump/tag/publish sequence.

## P2 findings

### 1. Non-identifier class-field names still hide a genuine function initializer

Locations: `dev/js-lexer.mjs:106-143`, `dev/js-lexer.mjs:239-244`,
`dev/js-lexer.mjs:301-320`, `dev/js-lexer.mjs:343-344`, and
`dev/validate-fixtures.mjs:4160-4188`.

The new class-body state machine calls `noteClassElementWord` only for ordinary identifier tokens.
The private-name, quoted-literal, numeric-literal, and computed-name branches do not resolve the
class element to `afterName`; the following `=` therefore cannot advance the frame to
`initializer`. When `function` arrives, `classElementNamePosition()` is still true and suppresses
the real construct role.

All four counterexamples compile under Node 24.12.0, but the scanner returned `[]` and removed the
completion helper from `maskJsNonCode` instead of returning the expected ID:

```js
const A = class { #value = function () {} / completeCurrentControlScope(901, true) / 2; };
const B = class { ["value"] = function () {} / completeCurrentControlScope(902, true) / 2; };
const C = class { "value" = function () {} / completeCurrentControlScope(903, true) / 2; };
const D = class { 1 = function () {} / completeCurrentControlScope(904, true) / 2; };
```

The same mask hides `MODULES.push({})` or `AUDIT_UNITS.push({})` when the expression is inserted in
a live workflow. Controls 449–456 cover only ordinary identifier names (`value` and `static value`),
so they cannot fail on these states.

Correction: make the class-element state machine consume every legal property-name form, including
private and computed names, before interpreting `=`. Add ordinary/static/private/computed/string/
numeric declaration-expression twins and causal completion/workflow mutations. Keep the property-
access `this.#name` role separate from a private name at class-element depth.

### 2. The ordinary full-validator gate is not independently stable on the reviewed Windows head

Locations: `dev/validate.mjs:2199-2219`, `dev/validate.mjs:2279-2296`,
`dev/validate-fixtures.mjs:337-415`, `.github/workflows/ci.yml:14-213`, and
`.github/workflows/ci.yml:290-313`.

The reviewed topology produced three distinct outcomes on the same Node 24.12.0 host:

- `npm run validate` failed twice after 3.106 s and 2.299 s because the fixture child exited with
  decimal status `3221226505` (`0xC0000409`) and no terminal fixture output.
- `node dev/validate.mjs` ran for 405.321 s, then failed control 401 with a focused-child V8
  `Committing semi space failed` OOM (status 134, no terminal sample) and failed control 430 because
  its validator child produced no accepted result.
- `RUST_INTEL_FIXTURE_PROGRESS=1 node dev/validate-fixtures.mjs` completed all 460 controls in
  368.715 s. Focused control 401 then passed six standalone invocations; a representative terminal
  sample reported about 70.9 MB heap and 152.4 MB RSS under the 64 MiB old-space setting.

The direct pass proves the earlier cumulative long-lived-fixture retention was mitigated. The
ordinary failures prove the release command itself is still sensitive to the enclosing process/job
resource envelope. They are not enough to attribute the cause solely to repository code or solely
to the loaded host, but they are enough to keep the release gate open. Both full-validator CI jobs
run on Ubuntu; the Windows job exercises installers only, so a green current CI run would not
reproduce this supported-host path.

Correction: reproduce the ordinary nested topology on clean Windows Node 24 and exact 24.0.0,
capture the last live control, and leave safe headroom rather than a cap that succeeds only as a
standalone child. Add a Windows ordinary-validator lane or explicitly narrow/document the supported
validator platform. Preserve the two-million-code-unit semantic budget; do not weaken the oracle to
make the cap pass.

## P3 findings

### 1. The focused-helper anti-vacuity gate accepts an expected-shaped constant result

Locations: `dev/validate-lexer-probes.mjs:38-61`, `dev/validate-fixtures.mjs:397-415`, and
`dev/validate-fixtures.mjs:4206-4250`.

The structured protocol is better than a success sentence, and control 459 proves that the parent
rejects one deliberately wrong observation (`ids: []` for control 409). It does not prove that the
helper performed the semantic work whose expected result it emits. For control 401, this mutation
removes the two-million-character scan while preserving the exact parent-accepted observation:

```diff
- const diagnostics = literalTrueCompletionDiagnostics('x'.repeat(inputLength));
+ const diagnostics = [];
```

An in-memory evaluation of control 458's own four regexes plus
`literalTrueCompletionViolations` reported `contractPatterns: true`, no completion violations, and
no legacy success sentence after that mutation. The helper would emit the expected control-401
JSON and exit zero. The same expected-shaped-facade risk exists in the other branch-local
observations.

Correction: bind each focused control to a causal source/API obligation that cannot be replaced by
its expected constant unnoticed. At minimum, extend the source contract to require the actual
scanner call in every supported branch and add a negative mutation for an expected-shaped constant,
not only a wrong-shaped constant. Prefer moving the deterministic observation calculation into a
shared pure function that the parent can invoke on a bounded companion input while the child owns
only the resource-heavy scale execution.

### 2. The supported Windows PowerShell path is outside the recovery matrix

Locations: `README.md:178-199`, `README.md:219-232`, `rust-cc-install.bat:1-8`,
`rust-cc-uninstall.bat:1-8`, `dev/test-installer-recovery.mjs:217-225`, and
`.github/workflows/ci.yml:316-402`.

The README documents `Windows (PowerShell)` and `cmd.exe` entry points without a PowerShell 7 floor.
Both `.bat` wrappers invoke `powershell.exe`, which is Windows PowerShell 5.1 on supported stock
Windows systems. The generated matrix hard-codes `pwsh`, and both Windows CI steps use `shell:
pwsh`; consequently every exhaustive recovery result is PowerShell 7 evidence.

On this host, PowerShell 5.1.19041 parsed both scripts and completed an ordinary install/uninstall,
while the matrix helper failed immediately with `spawnSync pwsh ENOENT` because PowerShell 7 is not
installed. That narrows the gap to the transaction/restart paths rather than proving an existing
5.1 runtime defect.

Correction: either declare PowerShell 7 as the supported floor and make the `.bat` wrappers invoke
it, or keep the current user surface and run at least the recovery-critical matrix under
`powershell.exe` in addition to `pwsh`. Parameterize the helper's PowerShell executable so local
Windows PowerShell users can reproduce the claimed matrix.

### 3. “Clean Node recovery-matrix memory evidence” is an undefined release gate

Locations: `README.md:46`, `CHANGELOG.md:142-153`, and `docs/reviews/README.md:76`.

The current Status and round-41 disposition require “clean Node recovery-matrix memory evidence”.
`dev/test-installer-recovery.mjs` records no memory telemetry or threshold, and the release checklist
does not define a command or acceptance criterion for such evidence. The only new memory protocol
belongs to focused lexer children. A release gate that has no observable pass condition cannot be
closed reproducibly.

Correction: replace the phrase with the intended executable evidence — for example, a complete
same/cross Node recovery matrix pass — and name its command/count, or add a real bounded memory
measurement and threshold if memory was genuinely intended. Keep validator-memory evidence as a
separate gate.

## P4 observations

- `dev/validate-fixtures.mjs:4190-4203` control 457 still recognizes one exact bounded-cache
  declaration and one spelling of `new Map()`. An unused pair of expected declarations plus an
  array/object cache or differently constructed map can satisfy it. This is a narrow regression
  tripwire, not proof of bounded retention.
- `dev/validate-lexer-probes.mjs:110-121` names `peakHeapUsed`, but its source is explicitly
  `terminal-boundary-sample`; only RSS uses the operating system's process high-water mark. The
  labels are accurate, though the field name can still be mistaken for a sampled heap peak by a
  consumer that ignores `peakHeapSource`.
- Recent commits `9a675f8` and `633a0da` have no descriptive body. Their diffs and the ledger are
  readable, but the omission is inconsistent with the evidence-rich release history.

## Round-41 closure matrix

| Round-41 item | Disposition at `633a0da` |
|---|---|
| P2-1: identifier-named class-field function initializers | **Closed for the exact controls; broader objective open.** Ordinary/static identifier fields and workflow mutations pass, but private/string/numeric/computed names retain the stale element state (round-42 P2-1). |
| P2-2: clean ordinary validator/OOM | **Implementation improved; release proof open.** Direct 460-control fixture and repeated standalone control 401 passed, but ordinary nested validation failed repeatedly on this host (round-42 P2-2). |
| P3-1: cross-operation independence negative | **Closed for the prior self-replay shape.** The expected side runs only the clean opposite operation; a helper-based expected replay would invoke the subject-only corruption hook twice. Representative same/cross cases passed. |
| P3-2: focused-helper anti-vacuity | **Partial.** Canonical arguments, structured results, parent semantic comparison, and a wrong-result negative exist; an expected-shaped constant bypass remains (round-42 P3-1). |
| P3-3: child telemetry and release inventory | **Core telemetry/count closed.** Child-owned terminal samples and the 380/17/63 split are accurate. The unrelated “recovery-matrix memory evidence” release phrase has no executable meaning (round-42 P3-3). |

## Release-readiness evidence

| Area | Evidence at `633a0da` |
|---|---|
| Full validator | **Not independently green.** Two ordinary npm invocations failed with `0xC0000409`; direct `node dev/validate.mjs` failed after 405.321 s at controls 401 and 430. A direct progress-enabled fixture run passed all 460 controls in 368.715 s, so the failure is topology/resource-sensitive rather than a blanket fixture failure. |
| Focused lexer resource probe | Control 401 passed six standalone 64 MiB invocations and emitted valid structured observations plus terminal child telemetry. It failed once inside the ordinary nested validator with V8 OOM and no terminal sample. |
| Fixture authority | Header, executable registry, README, CHANGELOG, and ledger agree on 460 = 380 validator children + 17 focused/helper children + 63 in-process. Direct terminal completion was observed once. |
| Lexer semantics | Round-41 identifier ordinary/static controls pass. Node-valid private/computed/string/numeric field-name counterexamples hide a real `function` initializer and completion/workflow mutation. |
| Recovery matrix | Inventories materialized for Node Claude (230 boundaries across five mode/operation combinations), Node Codex (59), and Bash (230). One representative same/cross case passed per surface. PowerShell listing was unavailable because the helper hard-codes absent `pwsh`; PowerShell 5.1 ordinary install/uninstall passed separately. |
| Release transaction | `node dev/calibrate-release-version.mjs` passed all 48 abrupt boundaries, failures after replacements 1–3, old-or-new manifests, recursive cleanup, and the nested-artifact negative in 9.602 s. |
| Syntax/workflow/mirror | `node --check` passed for installer, lexer, validator, fixture, focused-helper, recovery, and release scripts; Bash syntax, `actionlint`, `git diff --check origin/main..HEAD`, and the thirteen-file mirror check passed. |
| Action/runtime currency | `actions/checkout@v7` resolved to `3d3c42e...`, `actions/setup-node@v7` to `8207627...`, and `dtolnay/rust-toolchain` branch `1.97.0` to `86e7197...`, matching all committed pins. The official Node release table lists v24 as LTS and the latest LTS line. |
| Package | `npm pack --dry-run --json` passed with 39 entries, 618,532 packed / 1,725,711 unpacked bytes, integrity `sha512-OraqYZOnJo+JPzBn91ha4p7IITEhtEAn1WgDXHUaSC6RrzlGP/sU69SFRULMAoVl7QLKLyZ5LdiTwG29N9339g==`. npm `latest` is still 0.6.0; its published integrity intentionally differs from this unreleased 0.6.0-named local tree. |
| Version/status | The 0.6.0 check passed; the 0.7.0 check correctly failed against all three 0.6.0 manifests. README/CHANGELOG say planned 0.7.0 and the banner remains v0.6.0. |
| Remote/tag provenance | Remote `main` is `3ed04b9`; reviewed head is eighty-three local commits ahead. Local and remote `v0.7.0` are absent. No current-head CI, push, bump, tag, or publication claim is valid. |

## Red-tier and out-of-scope inventory

- No normative skill or command file differs from `origin/main`; all thirteen mirror files are
  byte-identical.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue/cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added in this window.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: this repository has no Cargo
  manifest or lockfile and the executable changes are Node/Bash/PowerShell repository tooling.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract. This review evaluates the documented process-interruption guarantee only.

## Required next pass

1. Advance class-element state for private, computed, string, and numeric names; add causal
   completion and workflow controls for the function-initializer counterexamples.
2. Make the focused-helper anti-vacuity gate reject expected-shaped constants, not only wrong
   structured results.
3. Stabilize ordinary nested validation on clean Windows Node 24 without weakening the two-million-
   code-unit probe, and add supported-host CI evidence.
4. Cover the actual `powershell.exe`/`.bat` surface or declare a PowerShell 7 floor; rewrite the
   undefined recovery-matrix memory gate to an executable acceptance criterion.
5. Run another independent P0–P3 review, then require complete CI on the exact release-candidate
   SHA. Only after a clean reviewed head should the separately authorized 0.7.0 bump, tag, and
   publish sequence begin.
