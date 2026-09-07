# Round 41 review of the latest commits and v0.7.0 release readiness — 2026-09-07 09:23 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, also
  confirmed by `git ls-remote origin refs/heads/main`).
- Reviewed head: `b907ded4f42104704dbd151441ceeec2e83a6731`.
- Commit window: `origin/main..b907ded` — seventy-eight commits, thirty-nine changed files,
  `+9240/-629`, reviewed in an isolated linked worktree.
- The round-40 report and fixing commits `81b5d60`, `6b435f7`, `090844b`, `4afc629`,
  `7de2c56`, and `b907ded` were traced against whitespace-only POSIX inventories, independent
  cross-operation snapshots, every owned transaction prefix, the publish timeout, class-field
  lexical roles, bounded cache retention, controls 441–449, resource isolation, current release
  records, and the pre-bump release procedure.
- Review was primarily static and used bounded counterexamples. The host had forty-one unrelated
  Node processes and more than five hundred processes in total; none was stopped. A full validator
  run was therefore not started. The focused control-401 child was attempted twice under the
  committed 64 MiB old-space cap and terminated with V8 heap-allocation failures; a diagnostic
  128 MiB attempt also failed while the host still reported substantial free physical memory.
  These local failures do not by themselves distinguish repository behavior from the host/job
  resource envelope, so they are recorded as missing independent release evidence, not proof of a
  product memory regression. Earlier diagnostic progress-pass evidence remains prior evidence only.
- No normative skill file, installer, validator, workflow, manifest version, tag, remote ref, or
  product behavior was changed. This report and its Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Two P2 and three P3 findings remain.** The highest implementation finding is a live lexer false
  negative: the class-field fix treats every `function` token at class-body depth as an element
  name, including a genuine function expression inside another field's initializer. Its body then
  closes with declaration/block slash semantics and masks a following completion or workflow
  mutation as a regexp.
- The mandatory full validator is not independently green on this reviewed head. Resource-heavy
  probes are now isolated and cumulative cache retention is bounded, but focused control 401 could
  not complete on the reviewer host and no exact-head CI exists for this unpushed history.
- The cross-operation expected path is now structurally independent, both POSIX inventory lanes
  reject nonzero and whitespace-only producers, every declared transaction prefix is negatively
  exercised, and the tag-triggered publish job has a 45-minute timeout. However, the new
  cross-oracle negative is applied only after the equality assertion and would remain green if the
  old self-replaying expected path returned.
- Fifteen controls moved into `dev/validate-lexer-probes.mjs`, but the fixture's anti-vacuity source
  gate does not cover that helper. Replacing a helper branch with unconditional success makes the
  parent accept the exact expected line and complete the numbered control. The new peak-memory
  trace also samples only the parent fixture process, not the focused child whose allocation
  failure round 40 asked to attribute.
- Source/header arithmetic is **449 = 391 child-process + 58 in-process**: the prior 449-control
  state was 376 + 73 and `b907ded` moved fifteen controls to focused children. Release-facing prose
  incorrectly calls all 391 processes “validator children”, and the README Layout omits the new
  helper.
- All three manifests and the README release banner remain at `0.6.0`; Status and CHANGELOG call
  `0.7.0` planned. Local and remote `v0.7.0` are absent. This remains the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close the lexer and oracle/fixture findings, obtain a
  clean ordinary validator run on the Node 24 floor plus another independent review, and require
  exact-release-SHA CI before the separately authorized bump/tag/publish sequence.

## P2 findings

### 1. A real function expression inside a class-field initializer is still treated as a field name and hides live code

Locations: `dev/js-lexer.mjs:216-248` and `dev/validate-fixtures.mjs:4082-4116`.

The new `classElementName` predicate is true whenever the top delimiter is the class-body brace.
That is sufficient for the exact round-40 examples where `function` or `class` is the element's
name, but it is also true later in an initializer, where `function` is a real expression keyword:

```js
const X = class {
  field = function () {} / completeCurrentControlScope(450, true) / 2;
};
```

Node accepts this source. On `b907ded`, `literalTrueCompletionViolations` returns `[]`; the static
workflow twin with a named function expression also compiles and `maskJsNonCode` removes
`MODULES.push({})`. The false field-name classification prevents a pending function construct from
being recorded, so the function body closes as a generic block and the following division slash is
mistaken for a regexp opener. `static field = function named() {}` has the same result.

Controls 441–448 cover fields *named* `class`/`function`, but not genuine class/function expression
keywords after an element name, `=`, or another initializer token. This preserves the exact
mutation-hiding failure that the shared scanner is intended to reject.

Correction: track class-element position rather than treating every word at class-body delimiter
depth as an element name. Reset that position after the name/accessor and recognize expression
keywords within the initializer normally. Add valid declaration/expression twins for ordinary and
`static` fields, then mutate the real completion loop and both workflow roots with the function-
expression shape.

### 2. The required full-validator/OOM release gate is still not independently proved on this head

Locations: `dev/validate-fixtures.mjs:333-373`, `dev/validate-lexer-probes.mjs:29-61`, and
`dev/validate.mjs:2288-2296`.

`b907ded` makes real progress: it removes the multi-million-element object array for code-only
inputs, keeps only one lexical scan result, and reclaims process-scoped parser/native allocations
between selected controls. A focused control 445 passed. The exact large budget control 401 did
not: two invocations with the committed `--max-old-space-size=64` failed in V8 allocation, and a
diagnostic 128 MiB invocation failed as well on the currently overloaded host. Because the host is
known to constrain unrelated Node/Codex/Playwright work, this review does **not** infer that the
algorithm or the 64 MiB setting is intrinsically broken from those results.

The release requirement is nevertheless a successful ordinary `npm run validate` at the Node
floor, not an implementation argument or a prior diagnostic run. There is no successful independent
run at `b907ded` and no exact-head CI because the commit is local. The round-40 P2 therefore remains
open as a release-evidence gate.

Correction: run the focused probes and ordinary validator in a clean Node `24.0.0` environment with
the committed limits, record the exact head and terminal 449-control line, and fix the causal path
if that clean run fails. Then push only after all code findings are closed and require the complete
CI workflow on that exact release-candidate SHA.

## P3 findings

### 1. The cross-operation negative does not detect restoration of the old self-replaying oracle

Location: `dev/test-installer-recovery.mjs:359-395`, especially lines 377–385.

The expected snapshot itself is now correct: it applies the clean opposite operation directly to
the original fixture, while interruption happens only on the subject side. The advertised
counterfactual does not calibrate that independence, however. It adds an arbitrary file to the
subject **after** expected and actual have already compared equal, snapshots again, and checks that
the new subject-only file differs from expected.

If lines 363–367 regress to the round-40 self-replay — interrupt expected with the same boundary,
then run the opposite operation on both sides — this post-comparison extra-file check still differs
and still passes. It proves only that `snapshot()` sees an extra file, not that deterministic
recovery corruption is absent from the expected path.

Correction: inject deterministic corruption into every interrupted/recovery sequence before the
main comparison. The clean-opposite expected path must not execute that hook; the former self-replay
path would execute it on both sides and make the negative fail to detect the mutation. Add a bounded
source or behavioral mutation proving the old expected-path call cannot return unnoticed.

### 2. Focused lexer controls are outside the fixture's established anti-vacuity source gate

Locations: `dev/validate-lexer-probes.mjs:29-80`, `dev/validate-fixtures.mjs:366-373`, and
`dev/validate-fixtures.mjs:3860-3991`.

Controls 399–402, 409–414, 421, 429, 439, and 445–446 now reduce to “child exited zero and printed
this line” in the authoritative parent registry. The literal-true completion scan still protects
`dev/validate-fixtures.mjs`, but it never scans the new helper. Changing a `checkControl` branch to
`return true`, or setting `passed = true`, causes the helper to print the accepted line and the
parent to mark the control complete. In particular, controls 409–414 were created to prevent this
same unconditional-success facade in the real fixture completion path; relocating their predicates
outside the scanned file weakens that established invariant.

Correction: include the helper in the anti-vacuity contract and add a negative source mutation that
forces one helper predicate true while the underlying scanner result is wrong, requiring the
fixture run to fail. Prefer a shared structured result whose control ID and semantic assertion are
checked independently over trusting a freely emitted success string.

### 3. The new OOM attribution reports parent memory, not the failing child, and release-facing inventory is incomplete

Locations: `dev/validate-fixtures.mjs:71-93`, `333-364`; `README.md:46`, `82-120`; and
`CHANGELOG.md:97`, `123-134`.

`progressMemory()` calls `process.memoryUsage()` in the long-lived fixture parent before and after
`spawnSync`. It cannot report the focused child's peak heap/RSS, which is the process that can fail
and whose memory round 40 required to capture. The child output preserves V8's fatal diagnostics,
but the advertised “peak-memory attribution” is parent-only and therefore cannot validate or tune
the 64 MiB child envelope.

The same release-facing update calls all 391 out-of-process controls “validator children”, although
fifteen now execute the separate lexer-probe helper, and the README Layout does not list
`dev/validate-lexer-probes.mjs` at all. The arithmetic is correct; its type/provenance description is
not.

Correction: report child resource telemetry from a platform-appropriate bounded wrapper or have the
child emit its own sampled peak before normal completion, clearly labeling fatal-OOM runs where no
terminal sample is available. Say “child-process controls” in the header/Status, distinguish 376
validator children from fifteen lexer-probe children if that split remains useful, and add the
helper to Layout.

## P4 observations

- `dev/validate-fixtures.mjs:4118-4131` control 449 checks exact declaration spellings and only bans
  `new Map()` before `scanLexical`. An unbounded array/object cache, a differently spelled Map
  construction, or unused one-entry declarations can satisfy it. It catches the exact former code
  shape, not the claimed behavioral invariant that retention is bounded.
- `dev/validate-lexer-probes.mjs:16-17` parses the control argument with `Number.parseInt`, so a
  manual argument such as `401junk` selects control 401 rather than failing as malformed. The CI
  caller supplies canonical integers, making this a developer-interface precision issue only.
- `README.md:84-89` still says the installer matrix does not by itself establish independent
  cross-operation postconditions. That was a useful round-40 qualification, but it should be
  rewritten after the corrected oracle and a genuine independence negative are both proved.
- Commit `4afc629` has no descriptive body. Its diff is understandable and this is not a runtime
  defect, but it is inconsistent with the release history's otherwise explicit evidence bodies.

## Round-40 closure matrix

| Round-40 item | Disposition at `b907ded` |
|---|---|
| P2-1: whitespace-only POSIX inventory | **Closed statically.** Both current-Bash/Node and Bash-3.2 materialize trimmed nonblank records and independently reject producer failure plus whitespace-only success. |
| P2-2: keyword-named class fields | **Partial.** Exact named-field controls 441–448 pass, but a genuine function expression in another field initializer is misclassified at the same class-body depth (round-41 P2-1). |
| P2-3: full-validator OOM | **Implementation mitigated; proof open.** Cache retention and probe lifetime are bounded, but this review could not obtain a successful focused control 401 or full validator under the current host envelope, and exact-head CI does not exist (round-41 P2-2). |
| P3-1: independent cross-operation oracle | **Implementation corrected; calibration partial.** Expected now uses a clean direct opposite operation, but the negative cannot detect reintroduction of self-replay (round-41 P3-1). |
| P3-2: every cleanup prefix negative | **Closed.** A surface-keyed independent prefix inventory seeds and rejects every owned namespace while preserving a foreign sibling. |
| P3-3: publish timeout | **Closed.** `jobs.publish.timeout-minutes` is 45, matching the documented measured envelope. |
| P3-4: round-39 provenance/release records | **Closed for the reported hashes.** `7042ce8` is the implementation parent and `8b2d576` its documentation disposition; later counts are revision-qualified. New helper/progress wording needs round-41 correction. |

## Release-readiness evidence

| Area | Evidence at `b907ded` |
|---|---|
| Full validator | **Not independently completed.** Not started because of the known host process pressure; focused control 401 failed twice at the committed 64 MiB old-space setting and once diagnostically at 128 MiB, while focused control 445 passed. Prior diagnostic progress-pass evidence is not substituted for a clean independent run or exact-head CI. |
| Fixture authority | Static arithmetic agrees on 449 = 391 child-process + 58 in-process; fifteen controls moved from the earlier 376/73 split. The “validator child” wording is inaccurate, and terminal runtime completion is not proved by this review. |
| Lexer counterexample | Both ordinary and `static` class fields with a genuine function expression compile; the completion diagnostic is `[]` and the workflow mutation is masked. |
| Installer matrix | A bounded Bash-install/upgrade inventory generation passed and emitted 80 nonblank concrete boundaries. Full current matrices were not rerun under the loaded host. The new clean-opposite expected path and all-prefix loop are present statically. |
| Syntax/workflow | `node --check` passed for the lexer, fixture runner, focused helper, and installer recovery helper. `actionlint` passed for both workflows; `git diff --check origin/main..HEAD` passed. |
| Mirror/package | Thirteen mirror files agree. `npm pack --dry-run --json` passed with 39 entries, 617,642 packed / 1,723,073 unpacked bytes, integrity `sha512-Ze0YkbPyEJhRBvPeYvPUI7hVcmHOpBR0/07VE6IW7ntQnPrGNRpYxf3mMkdHuIuZi+83HtDh9dmKHUyNvFEjiw==`. |
| Version/status | The 0.6.0 release check passed; the 0.7.0 check correctly failed against all three 0.6.0 manifests. README/CHANGELOG say planned 0.7.0 and no bump was performed. |
| Remote/tag provenance | Remote `main` remains `3ed04b9`; reviewed head is seventy-eight local commits ahead. Local and remote `v0.7.0` are absent. No current-head CI, push, bump, tag, or publication claim is valid. |

## Red-tier and out-of-scope inventory

- No normative `skill/` or `skills/rust-intel/` file differs from `origin/main`; all thirteen mirror
  files are byte-identical.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue/cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added in this window.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: this repository has no Cargo
  manifest or lockfile and the executable changes are Node/Bash/PowerShell repository tooling.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract. This review evaluates the documented process-interruption guarantee only.

## Required next pass

1. Track true class-element-name position and add function-expression initializer completion and
   workflow counterfactuals, including `static` fields.
2. Make the cross-operation negative fail if the former self-replaying expected sequence returns.
3. Bind focused-helper outcomes to the anti-vacuity contract and report child, not parent, resource
   attribution; correct the 391-child wording and Layout.
4. Obtain an ordinary 449-control `npm run validate` pass in a clean Node 24.0.0 environment, then
   run another independent P0–P3 review and exact-release-SHA CI.
5. Only after a clean reviewed head and green exact-SHA CI, perform the separately authorized
   `0.7.0` manifest/banner/changelog bump, tag, and publish sequence.
