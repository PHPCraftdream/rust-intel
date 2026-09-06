# Round 33 review of the latest commits and v0.7.0 release readiness — 2026-09-06 23:04 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`).
- Reviewed head: `062d49c5a5559a7ca09c27e89984d113090d282b`.
- Commit window: `origin/main..HEAD` — thirty-three commits, twenty changed files,
  `+3137/-442` before this report. The complete window and the whole repository state needed for
  the planned `0.7.0` release were inspected in an isolated linked worktree.
- Round 32 was read in full. Its three findings were traced through `412a8cb` and `062d49c`, and
  the actual implementation was challenged beyond the exact counterexamples from that report.
- The `rust-intel` review discipline was applied as a module fan-out across async, unsafe/FFI,
  concurrency, data/types, security, Drop/RAII, dependencies/macros, lifetimes/API, testing, and
  semantic conformance, followed by a single synthesis pass.
- One complete `npm run validate` was run and timed. Bounded probes covered regexp/division token
  context, equivalent call forms, template interpolation, nesting depth, asymptotic behavior,
  package contents, installer migration, mirror state, syntax, workflow pins, and release metadata.
- No product, version, tag, workflow, package, or remote ref was changed. This report and its Open
  ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Four P2 and six P3 findings remain.** The shared lexical helper can be crashed or driven
  quadratically by repository input, still confuses live division with regexp data, and therefore
  cannot yet carry the two release-gate contracts delegated to it. The documented POSIX clone
  commands do not execute from a normal checkout, and the npm installer does not perform the
  promised legacy-layout migration. Additional P3 findings cover the literal-true call oracle,
  failure-atomic installation/version updates, shell/PowerShell path handling, and the missing
  round-32 fixing disposition.
- The complete validator exited 0 in **238.901 seconds** on Node `v24.12.0` / npm `11.13.0` and
  reported twelve skill Markdown files checked. That green result is necessary but not sufficient:
  the exact P2/P3 counterexamples below also survive the current oracle.
- The numeral **389** remains aligned across the fixture header, executable registry, contiguous
  labels, runtime finalization, README, CHANGELOG, and ledger. The normative `skill/` tree and its
  `skills/rust-intel/` mirror are byte-identical for all thirteen mirrored files.
- All three manifests and the README banner remain at `0.6.0`; README Status and CHANGELOG identify
  `0.7.0` as planned; `v0.7.0` is absent; npm reports `0.6.0` as current. This is the correct
  pre-release version state, not a finding.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P2/P3 finding below and perform another
  independent review before any explicitly authorized version bump, tag, push, or publication.

## P2 findings

### 1. Repository-controlled input can crash or quadratically stall the shared lexer

Locations: `dev/js-lexer.mjs:21-25`, `dev/js-lexer.mjs:76-96`, and
`dev/js-lexer.mjs:189-202`.

Three independent resource bounds are missing:

1. `maskTemplate()` and `maskCode()` recurse once per nested template interpolation. A bounded
   probe with 5,000 nested `${...}` interpolations raised
   `RangeError: Maximum call stack size exceeded` instead of producing a validation diagnostic.
2. Every candidate slash after `)` scans backward to the beginning of its line and then runs a
   regexp over the growing prefix. On the valid flat source `'f()/1;'.repeat(n)`, the synthesis
   probe measured 15.840 ms for 1,000 repetitions, 32.091 ms for 2,000, and 137.197 ms for 4,000;
   larger independent samples approached four times the cost for twice the input.
3. `literalTrueCompletionViolations()` invokes `findMatchingParen()` independently from every
   textual helper match. Repeated unmatched prefixes measured 47.725 ms at 1,000, 157.484 ms at
   2,000, and 630.464 ms at 4,000 — again approaching quadratic growth.

This work runs before or inside the fixture-child watchdog and is amplified because the fixture
runner launches 371 validator children over copied repository sources. A generated workflow or
fixture edit can therefore crash the parent or turn CI validation into its 15-minute outer timeout.
This is the unbounded-parser/resource-exhaustion shape from §B7 and the scale-oracle gap from §D3.

Correction: replace recursive template/code alternation with an iterative state stack, maintain
token/line context in one forward pass, discover completion calls during that pass, and enforce an
explicit nesting/operation budget that returns a deterministic validation error. Add deterministic
operation-count and depth-bound controls; do not use wall-clock thresholds as the oracle.

### 2. Regexp/division classification still hides live code and exposes regexp data

Locations: `dev/js-lexer.mjs:12-28`, `dev/js-lexer.mjs:128`,
`dev/validate.mjs:374`, and `dev/validate.mjs:1233-1274`.

The classifier reasons from raw preceding characters, a line-bounded control-header regexp, and a
trailing word. It does not track whether a word is a keyword token, a member property, or whether a
closing delimiter completed a control header, call, expression, or statement block.

Valid live expressions using keyword-named properties are masked as regexp bodies:

```js
const obj = { if: () => 2, return: 8 };
obj.if() / MODULES.push({}) / 2;
obj.return / completeCurrentControlScope(8, true) / 2;
```

The first direct workflow mutation disappears from the static source used by
`workflowMutationCheck`; inside a dormant function the runtime deep-freeze backstop never executes.
The second helper call executes but `literalTrueCompletionViolations()` returns `[]`. The same
misclassification occurs for properties named `delete`, `new`, `in`, `instanceof`, `await`, `do`,
and `else`.

The reverse error exposes ordinary regexp data as executable code. Every following snippet parses
as JavaScript, performs no completion call, but reports the named control ID:

```js
if (
  ready
) /completeCurrentControlScope(12, true)/.test(text);

if (ready) {} /completeCurrentControlScope(13, true)/.test(text);

function f() {
  return /* gap */ /completeCurrentControlScope(14, true)/;
}

const n = 1 / /completeCurrentControlScope(15, true)/.source.length;

loop: while (ready) {
  break
  /completeCurrentControlScope(16, true)/;
}
```

Round 32's exact postfix `++`/`--` and `do`/`else` examples are fixed, but the shared helper has not
established the broader lexical contract now relied on by both mutation and completion validation.

Correction: use a forward token-context state machine that distinguishes keyword tokens from
member/private names, carries delimiter ownership across line terminators and comments, models
statement boundaries and ASI-restricted keywords, and distinguishes division followed by a regexp.
Add both live-mutation/live-completion negatives and regexp-only positives for every boundary named
above. The external reference is ECMA-262's distinct lexical and regexp grammar goals, not a
line-local character heuristic.

### 3. The documented POSIX clone-install commands are not executable from a checkout

Locations: `README.md:165-169`, `README.md:204-207`, `rust-cc-install.sh`, and
`rust-cc-uninstall.sh`.

README tells macOS/Linux users to invoke `./rust-cc-install.sh` and
`./rust-cc-uninstall.sh`. Git records both blobs as mode `100644`, not `100755`, so a normal clone
rejects the documented command with “permission denied.” CI masks the defect by always invoking
the scripts through `bash` at `.github/workflows/ci.yml:55-66`.

Correction: commit executable bits for both scripts and add a Linux smoke that runs each directly
through its checked-out path. Keep `bash -n` as the syntax check, but do not treat it as execution
evidence for the advertised `./...` interface.

### 4. The npm installer violates the documented clean-migration contract

Locations: `README.md:151-159`, `README.md:184-188`, and `bin/install.js:113-149`.

README says the installer sweeps every prior install layout, and the npm entry point says it mirrors
the shell installers. Both its install and uninstall paths remove only the current skill directory
and the three current `rust-cc-*` command files. They never remove the v0.2.0
`commands/rust-intel-cc/` namespace or the v0.1.x `rust-{audit,fix,plan,intel}.md` files.

A bounded temporary-target probe seeded all five legacy paths. `node bin/install.js` exited 0 and
left all five paths; `--uninstall` also exited 0 and left all five paths. Cross-channel upgrades can
therefore retain stale or shadowing commands despite the explicit migration promise. Current CI and
publish smoke only fresh targets, so they cannot detect the defect.

Correction: use one explicit inventory of every owned current and legacy Claude path in both npm
install and uninstall flows, and add sentinel-based upgrade plus uninstall smoke tests. Verify that
unrelated sibling files remain untouched.

## P3 findings

### 1. Literal-true detection is neither complete nor specific at call/argument boundaries

Locations: `dev/js-lexer.mjs:86-88`, `dev/js-lexer.mjs:156-176`,
`dev/js-lexer.mjs:189-202`, and `dev/validate-fixtures.mjs:3770-3789`.

The detector looks only for the bare textual callee followed by `(` and records a finding only when
`Number.parseInt(firstArgument)` yields a safe integer. These executable unconditional completions
all return `[]`:

```js
completeCurrentControlScope((19), true);
const id = 20;
completeCurrentControlScope(id, true);
completeCurrentControlScope?.(21, true);
(completeCurrentControlScope)(22, true);
```

The loop-shaped production call `completeCurrentControlScope(number, passed)` is particularly
important: replacing `passed` with `true` would remain invisible because `number` is not a decimal
literal. The detector also accepts escaped identifiers such as
`completeCurrentControlSc\u006fpe(17, true)`.

There are false positives in the opposite direction:

```js
other.completeCurrentControlScope(23, true);
completeCurrentControlScope(1, `${true, condition}`);
```

The first is a different property call. In the second, masking removes the template delimiters but
leaves the interpolation comma, so `splitArguments()` invents a second top-level argument equal to
`true`; the actual second argument is one template string.

Correction: either parse every relevant ECMAScript callee/argument form, or make the repository
contract deliberately canonical and reject every noncanonical completion-call spelling. In either
case flag an unconditional second argument even when the first argument is nonliteral; report a
source location when no numeric ID can be recovered. Track template interpolation delimiter depth
instead of flattening it into call depth.

### 2. Installer upgrades are destructive before their replacements are validated

Locations: `bin/install.js:121-149`, `bin/install-codex.js:89-99`,
`rust-cc-install.sh:194-245`, and `rust-cc-install.ps1:105-154`.

All supported installers remove the prior working skill before the replacement tree is completely
copied. The npm Claude installer additionally checks each command source only after deleting the
old skill and starting the copy. A missing package entry, permissions change, full disk, interrupted
process, or later copy error leaves a partial skill or a mixed-version command set, with no backup
or rollback. Existing tests cover only successful fresh-target installation.

Correction: validate the complete source inventory first, stage owned outputs beside their final
destinations, validate the stage, then replace with a backup-and-restore transaction. Add an injected
mid-upgrade failure that starts from a known-good prior install and proves byte-for-byte restoration.

### 3. The release-version utility can leave a partial manifest bump

Location: `dev/set-release-version.mjs:20-24`.

The utility parses and overwrites the package, Claude, and Codex manifests sequentially. A parse or
write failure in the second or third file leaves earlier files at the new version; termination
during `writeFileSync` can truncate the active manifest. The later checker prevents publication of
a mismatched set but does not restore the release worktree.

Correction: read and validate all three manifests before writing, write sibling temporary files,
then replace all three with rollback on any failure. Add a bounded injected-failure calibration.

### 4. A dash-leading relative `CLAUDE_CONFIG_DIR` breaks the Bash interfaces

Locations: `rust-cc-install.sh:65-75`, `rust-cc-install.sh:197-245`,
`rust-cc-uninstall.sh:49-59`, and `rust-cc-uninstall.sh:65-92`.

The documented environment override may remain relative. Derived operands are quoted but passed to
`rm`, `mkdir`, `dirname`, `cp`, and `ln` without an end-of-options delimiter. A value such as
`CLAUDE_CONFIG_DIR=-config` therefore creates operands beginning with `-config/...`, which the
utilities interpret as options and reject. Quoting prevents shell expansion, not option parsing.

Correction: normalize the configured target to an absolute path before deriving children and use
`--` consistently for utilities that support it. Add install/uninstall controls for relative,
space-containing, and dash-leading targets on the oldest advertised Bash.

### 5. The PowerShell installer reinterprets enumerated source paths as wildcards

Location: `rust-cc-install.ps1:137-154`.

The source tree is enumerated with `Get-ChildItem -LiteralPath`, but `Install-File` passes each exact
source to `Copy-Item -Path`. A repository file containing PowerShell wildcard metacharacters such as
`[` or `]` is re-expanded and can fail or select a sibling rather than the enumerated file. The same
helper copies the three command files. CI has no Windows execution job.

Correction: use `Copy-Item -LiteralPath $Source` and add a PowerShell smoke with metacharacters and
spaces in a staged source/target path.

### 6. Round 32 has no fixing-pass disposition

Location: `docs/reviews/README.md:53`.

The historical round-32 Open row is correct, but there is no distinct row mapping its fixes:

- `412a8cb` closes round-32 P3-3 by recording the round-31 fixing disposition.
- `062d49c` closes the exact parenthesized-second-argument, ignored-extra-argument,
  postfix-division, `do`/`else` regexp, and duplicate-masker examples. Findings P2-1/P2-2 and
  P3-1 above show that the broader resource, regexp/division, and completion-call contracts remain
  open.

Correction: retain the historical Open row and add a round-32 fixing disposition with this exact
closed/partial mapping. Make no CI, version, tag, push, or publication claim for the local head.

## P4 observations

- `README.md:46` calls the current state “Unreleased (prepared, not tagged).” Its following text
  correctly says `0.7.0` is planned and manifests remain `0.6.0`, so this is not a false release
  claim. “In preparation, not tagged” would be less ambiguous while release-gate findings remain.
- The duplicate-publication branch in `.github/workflows/npm-publish.yml:77-98` verifies registry
  tarball integrity but not the existing version's provenance attestation. An identical historical
  manual publication without provenance is accepted as a successful duplicate. Requiring registry
  attestation would harden the provenance claim, but it does not affect the first publication path.
- The overlap guards are canonicalize-then-operate checks. They match the documented same-user,
  non-adversarial config-tree model, but an elevated installer under an attacker-mutable parent
  remains TOCTOU-prone. Document “do not run elevated” or adopt handle-relative/no-follow operations
  before claiming protection against hostile local races.

## Round-32 closure matrix

| Round-32 item | Disposition at `062d49c` |
|---|---|
| P3-1: parenthesized and ignored-extra-argument literal true bypasses | **Exact examples closed; semantic objective remains open.** Balanced arguments and redundant parentheses now reject the report's second-argument forms, but nonliteral/parenthesized IDs and equivalent callees still bypass, while property/template forms false-positive (P3-1). |
| P3-2: copied masker mishandles postfix division and `do`/`else` regexp contexts | **Exact examples closed; broader objective remains open.** One shared helper now exists and fixes those named cases. Keyword-named properties, multiline/block/comment/ASI regexp contexts, recursive nesting, and repeated scans remain P2-1/P2-2. |
| P3-3: no round-31 fixing disposition | **Closed by `412a8cb`.** The ledger records the exact partial/closed round-31 state without remote or release claims. The missing round-32 fixing disposition is the new P3-6 record gap. |

## Candidate inventory and calibration

| Candidate | Calibration / counterfactual | Disposition |
|---|---|---|
| Shared helper duplication | Both validators import `dev/js-lexer.mjs`; mutation temp copies include it. | Closed by `062d49c`; no duplicate implementation remains. |
| Postfix update and `do`/`else` examples | Round-32 `x++ / call / 2` and regexp after `do`/`else` are covered. | Exact cases closed; not accepted as a new finding. |
| Keyword-named property before division | `obj.if() / MODULES.push({}) / 2` is live, but the mutator is blanked. | Accepted as P2-2. |
| Regexp after multiline control/block/comment/ASI | All probes parse; no helper call executes; IDs 12–16 are reported. | Accepted as P2-2. |
| Nested templates | 5,000 nested interpolations raise `RangeError`. | Accepted as P2-1. |
| Repeated slash/call candidates | Doubling input approaches 4× work. | Accepted as P2-1. |
| Equivalent completion calls | Parenthesized/nonliteral ID, optional call, parenthesized callee, escaped identifier return `[]`. | Accepted as P3-1. |
| Completion false positives | Foreign property and template-comma calls report IDs 23 and 1. | Accepted as P3-1. |
| Runtime amplification | 371 fixture children reprocess copied validator inputs; parent has only a 15-minute watchdog. | Accepted as impact evidence for P2-1, not a separate finding. |
| Missing direct `node --check dev/js-lexer.mjs` in CI | `node dev/validate.mjs` imports the helper and fixture runner, so syntax/load failure already fails both CI and publish. | Rejected; an explicit line would be clarity only. |
| Helper absent from npm tarball | Published installers do not use repository validation helpers; `dev/` is intentionally excluded. | Rejected; no package runtime dependency. |
| POSIX script mode | Both advertised `./...` scripts are Git mode `100644`. | Accepted as P2-3. |
| npm legacy migration | Install and uninstall leave five seeded legacy paths. | Accepted as P2-4. |
| Failure-atomic upgrades | Forced/interrupted failure can destroy the previous install or split manifests. | Accepted as P3-2/P3-3. |
| Shell/PowerShell path semantics | Dash-leading Bash operand and wildcard-bearing PowerShell source retain special meaning. | Accepted as P3-4/P3-5. |
| Package completeness | Dry-run tarball has 38 entries, including both skill layouts, manifests, installers, commands, evidence, and licenses. | Rejected; package inventory is complete. |
| Workflow/action supply chain | All seven `uses:` refs are full SHAs; monthly Actions Dependabot is configured. | Rejected; no mutable action ref or new dependency. |
| Manifest/status/changelog mismatch | All manifests/banner are `0.6.0`; prose consistently calls `0.7.0` planned. | Rejected; correct pre-bump state. |
| Mirror/category/count drift | Thirteen mirror files are hash-identical; validator executes all 389 controls. | Rejected. |

## Primary references and project contracts

- ECMA-262, [Lexical and RegExp Grammars](https://tc39.es/ecma262/#sec-lexical-and-regexp-grammars),
  is the source of truth for choosing regexp versus division lexical goals; ECMAScript token context,
  not a line-local character rule, determines which grammar applies.
- ECMA-262, [Template Literal Lexical Components](https://tc39.es/ecma262/#sec-template-literal-lexical-components)
  and [Optional Chaining](https://tc39.es/ecma262/#sec-optional-chaining), are the sources for the
  interpolation and equivalent-call calibrations.
- Git's [`update-index --chmod`](https://git-scm.com/docs/git-update-index#Documentation/git-update-index.txt---chmod-executable-bit-files)
  documents that the executable bit is tracked in the index; the repository's `100644` entries are
  therefore release artifact state, not a local checkout accident.
- The Open Group [Utility Syntax Guidelines](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
  are the external basis for treating dash-leading operands and `--` as an argument-boundary issue.
- Microsoft [`Copy-Item`](https://learn.microsoft.com/powershell/module/microsoft.powershell.management/copy-item)
  documents separate `-Path` and `-LiteralPath` parameter sets; the latter performs no wildcard
  interpretation.
- Project contracts: README install/migration/release text, the `rust-intel` §B7/§D3/§F2 rules,
  round 32, and the review ledger quality gate.

## Release-readiness evidence

| Area | Evidence at `062d49c` |
|---|---|
| Full validator/runtime | `npm run validate` exited 0 in **238.901 s** on Node `v24.12.0` / npm `11.13.0`, reporting 12 skill Markdown files checked. |
| Fixture authority | Header and executable registry say 389; all 389 IDs are labelled, registered, completed, and finalized. There are 371 child-spawn controls and 18 in-process controls. |
| JavaScript syntax | `node --check` passed for both validators, the shared lexer, both npm installers, all release/mirror/semver helpers, and the audit workflow. |
| Shell/workflow syntax | `bash -n` passed for install/uninstall; `actionlint` passed. Both are syntax evidence only and do not close installer behavior findings. |
| Mirror/category | `node dev/sync-mirror.mjs --check` passed for 13 files; SHA-256 pairs match for every normative file. Full validation checked all 12 skill Markdown files and the 59-category contract. |
| Package | `npm pack --dry-run --json` passed: 38 entries, 609,163 packed bytes / 1,692,131 unpacked, integrity `sha512-gBpwogsJF7jN150R5hkm0CIFysFSHlDs1sFKqMqQM5F6NzPh847feP456LFdCrDG5I6ECyuw/XLkzJ4cSxLY3Q==`. |
| Version/status | All three manifests and README banner are `0.6.0`; `node dev/check-release-version.mjs 0.6.0` passed; README/CHANGELOG say planned MINOR `0.7.0`; local `v0.7.0` is absent; npm reports `0.6.0`. |
| Actions | All seven workflow actions use full commit SHAs. CI has Node 24 plus exact 24.0.0 jobs; Rust is pinned and verified as 1.97.0; Dependabot covers Actions monthly. |
| Formatting | `git diff --check origin/main..HEAD` passed before authoring this report. |
| Provenance | Thirty-three commits are ahead of local `origin/main`; no CI, push, version-bump, tag, or publication claim is made for reviewed head `062d49c`. |

## Red-tier and out-of-scope inventory

- No executable Rust dependency, `unsafe`, FFI, crypto, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue/cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown rendering path was added in `origin/main..HEAD`. The corresponding
  rust-intel red-tier categories have no executable occurrence to surface.
- Normative rule prose contains examples of those constructs; they are documentation under review,
  not executable product occurrences.
- No crate build, clippy, cargo test, Miri, semver-check, cargo-audit, or cargo-deny run applies:
  this repository ships Markdown/JavaScript/shell tooling and has no `Cargo.toml`/`Cargo.lock`.
- Exact Node 24.0.0 was not installed locally. The current local head is unpushed, so no CI evidence
  exists for it; local Node 24.12.0 plus workflow inspection are not represented as equivalent CI.
- Network publication, version edits, Git tags, pushes, and release creation are deliberately out of
  scope for this review.

## Required correction order

1. Replace the shared approximate lexer with an iterative, budgeted, forward token-context scanner;
   close both resource and regexp/division cases with mutation-capable negative controls (P2-1/P2-2).
2. Make completion-call enforcement complete or explicitly canonical, including nonliteral IDs,
   equivalent callees, property exclusion, and template depth (P3-1).
3. Fix POSIX executable bits and direct-execution CI; make npm migration sweep every documented
   legacy path and test upgrade/uninstall sentinels (P2-3/P2-4).
4. Make installers and the three-manifest bump failure-atomic, then calibrate rollback (P3-2/P3-3).
5. Normalize/delimit Bash operands and use PowerShell `-LiteralPath`; add platform controls
   (P3-4/P3-5).
6. Add the distinct round-32 fixing disposition with exact commit mappings (P3-6).
7. Run one complete timed validation and another independent review. Only a result with no P0–P3
   should authorize the separately requested `0.7.0` release transition.
