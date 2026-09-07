# Round 37 review of the latest commits and v0.7.0 release readiness — 2026-09-07 02:54 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, also verified
  against the current remote `main` ref).
- Reviewed head: `933b31b1fce08a3bf0e10bb1efcd0b43e815288e`.
- Commit window: `origin/main..933b31b` — fifty-five commits, thirty-four changed files,
  `+7090/-632` before this report, inspected in an isolated linked worktree.
- Round 36 was read in full. Its one P1, two P2, and four P3 findings were traced through
  `671bd89`, `035ceac`, `f435b0a`, `b6d3531`, `5e6a19b`, and `933b31b`, then challenged at
  ordinary Bash entry, initial-journal, backup, replacement, rollback, recovery-restart,
  sparse-inventory, canonical-reference, regexp/division, matrix-oracle, and release-record
  boundaries.
- One complete timed `npm run validate` ran. Bounded checks covered real Node and Bash installer
  interruption/restart, reentrant recovery states, the JavaScript lexer and completion gate,
  release-version interruption calibration, JavaScript/Bash/PowerShell syntax, actionlint,
  mirrors, package contents, manifests, action pins, remote tags, and npm publication state.
- No product implementation, manifest version, tag, package, workflow run, or remote ref was
  changed. This report and its Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Two P2 and three P3 findings remain.** Installer recovery succeeds for the single forward
  interruption now exercised, but it is not reentrant: an interruption after a backup has been
  restored leaves an old, internally consistent installation that every recovery implementation
  rejects as an incomplete backup state. The CI matrices do not interrupt rollback or recovery,
  so they cannot expose that state.
- The shared JavaScript scanner still confuses division after a function/class *expression* with
  a regexp after a declaration. A valid expression can therefore hide a live workflow mutation or
  an unconditional fixture-completion call from both source gates. This is a systemic validator
  bypass, not only an unsupported JavaScript spelling.
- The installer matrix accepts the pre-operation snapshot after a successful restart even though
  its own header and CI comments require the clean-operation snapshot; it also omits rollback and
  recovery boundaries. Current README, changelog, fixture-header, and review-ledger prose is stale
  or arithmetically inconsistent after the final round-36 fixing commits.
- `npm run validate` exited 0 in **235.931 seconds** on Node `v24.12.0` / npm `11.13.0`, checking
  twelve skill Markdown files and the nested **414-control** fixture suite. The release calibration
  passed all 48 Windows process-interruption boundaries with exact exit `86`, its nonexistent-hook
  negative case, and failure-after 1–3 cases. All thirteen normative mirror files are byte-identical.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call `0.7.0`
  planned. Local and remote `v0.7.0` are absent, and npm returns `E404` for
  `rust-intel-cc@0.7.0`. This remains the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close both P2s and all three P3s, then run another
  independent review before the separately authorized version bump, tag, push, or publication.

## P2 findings

### 1. Installer rollback and recovery are not reentrant after restoring a backup

Locations: `bin/install-transaction.js:113-173`, `rust-cc-install.sh:215-273` and
`315-345`, `rust-cc-uninstall.sh:81-120` and `155-183`, `rust-cc-install.ps1:159-225` and
`307-338`, and `rust-cc-uninstall.ps1:80-119` and `159-183`.

The forward transaction fixes correctly distinguish replacement-renamed states and publish the
complete Node record set in the first journal. Recovery itself, however, moves each backup back to
its destination without durably recording that restore before proceeding to the next record or
deleting the transaction. If the recovery/rollback process is interrupted after
`backup -> destination` but before the terminal journal/cleanup, the next invocation sees:

```text
journal status = backed-up (or installed for a replaced record)
destination     = present, containing the restored old bytes
backup          = absent
```

Every surface treats at least the ordinary `backed-up` form as corruption. Node appends
`backup state is incomplete`; both Bash scripts emit their corresponding incomplete-backup error;
both PowerShell recovery functions do the same. Bash install additionally rejects the restored
`installed + originalPresent` form. The old installation is intact, but automatic recovery is
blocked until the transaction directory is edited or removed manually.

Two bounded reproductions constructed exactly this post-rename state from the recorded owned
inventory. Node Claude uninstall exited 1 and diagnosed all nine records as `backup state is
incomplete`. Bash install exited 1 on the first restored original path with `backup is missing for
an installed original path`. This state is reachable during recovery itself and during caught-error
rollback; it does not require corrupt bytes or an invented journal transition.

The test hooks do not cover it. Node and PowerShell expose some `before/after-rollback-*` hooks, but
the matrix never selects them and no hook interrupts the recovery loop. Bash sets
`RUST_INTEL_INSTALL_ROLLING_BACK=1` before rollback, which suppresses *all* of its rollback hooks.
That change fixes the recursive EXIT-trap failure from round 36, but also makes the named rollback
hooks unreachable.

Correction: make restoration an explicit, restartable journal transition (for example
`restoring -> restored`) and make the post-rename/pre-status state unambiguous. Instrument both the
restore rename and recovery loop, interrupt them repeatedly, and require a subsequent invocation
to converge without manual cleanup. Cover install and uninstall, original and fresh paths, sparse
inventories, and every Node/Bash/PowerShell surface.

### 2. Function/class expressions can hide executable code inside a false regexp

Locations: `dev/js-lexer.mjs:202-245`, `dev/js-lexer.mjs:301-302`,
`dev/validate.mjs:374` and `1637`, and `dev/validate-fixtures.mjs:3850-3960`.

`scanLexical()` marks a brace preceded by `)` or a pending `class` as a statement block. Closing
that brace sets `canStartRegex = true`. That is correct for a function/class declaration followed
by a regexp statement, but wrong when the body belongs to a function/class expression: the closed
construct is then an expression value and `/` is division.

Both of these are valid JavaScript (confirmed by `new Function(...)`), but the shared masker blanks
the helper call between the two division operators and the completion gate returns no diagnostic:

```js
const x = function(){} / completeCurrentControlScope(410, true) / 2;
const y = class {} / completeCurrentControlScope(411, true) / 2;
```

For each probe, `maskJsNonCode(source).includes('completeCurrentControlScope')` was `false` and
`literalTrueCompletionDiagnostics(source)` returned `[]`. The same context can hide a direct
`MODULES.push(...)` or `AUDIT_UNITS` mutation from `workflowMutationCheck`. Runtime deep-freezing
may make such a workflow crash later, but `npm run validate` can still approve and package the
broken workflow; an unconditional completion call can directly keep the fixture registry green.

Controls 390–414 cover declaration regexps, member/private-member division, aliases, indirect
references, and actual-loop mutations, but not the declaration-versus-expression role of a
function or class body. Thus controls 410–414 close round 36's exact sequence/array/object/argument
examples while the stated canonical-reference guarantee remains bypassable through the shared
lexical layer.

Correction: track whether each function/class body belongs to a declaration or an expression and
set the post-close slash role accordingly. Add paired declaration-regexp and expression-division
controls for anonymous/named functions and classes, including an actual completion-loop mutation
and a workflow-root mutation. Keep the existing deterministic depth and operation budgets.

## P3 findings

### 1. The exhaustive installer matrix omits rollback/recovery and accepts the wrong final state

Locations: `dev/test-installer-recovery.mjs:70-87` and `112-142`, and
`.github/workflows/ci.yml:129-212`, `385-415`, and `417-448`.

The helper's hard-coded boundary inventory includes initial journal, backup, replacement, commit,
and cleanup hooks only. It does not include any rollback hook or any boundary inside recovery, so
the P2 state above is outside the purported exhaustive matrix. The Bash 3.2 job runs one forward
sparse-backup interruption only. The POSIX Node Codex matrix also omits fresh-install replacement
boundaries; the bounded local `after-replacement-rename-0` fresh case passed, but CI does not retain
that evidence.

More importantly, after `restarted` exits 0, the helper accepts either `actual === initial` or
`actual === expected`. A restart runs the requested install/uninstall operation again, so its
successful postcondition is the clean-operation `expected` snapshot. Accepting `initial` lets an
installer return success while doing nothing. For a `before-journal` interruption, replacing the
restart with a successful no-op leaves `initial` and satisfies the current oracle, contradicting
the helper header and CI comment that require the clean-run byte snapshot.

The nonexistent-boundary branch itself behaved correctly in a bounded check: the child completed
normally, then the helper rejected the coverage case with exit 1. That protects listed-name typos;
it does not discover reachable implementation boundaries missing from the hard-coded inventory.

Correction: require `actual === expected` after a successful operation restart, add Node Codex
fresh replacement cases, and add explicit rollback/recovery interruption matrices. Bind the test
inventory mechanically to every implementation hook or otherwise fail when an implementation hook
is reachable but unlisted.

### 2. Current release status and round-36 provenance describe an earlier fixing state

Locations: `README.md:46`, `CHANGELOG.md:21-31` and `86`, and
`docs/reviews/README.md:36`, `38`, `62`, and `65`.

README Status and the Unreleased changelog still list the ordinary Bash abort-hook, empty Node
journal, replacement restart, sparse binding, and missing forward-boundary coverage as current
gaps even though `035ceac`, `b6d3531`, `5e6a19b`, and `933b31b` address those exact one-interruption
cases. Conversely, README and the changelog net state claim every noncanonical completion reference
is rejected, which P2-2 disproves.

The round-36 fixing ledger row records only the early calibration/prose commit and says the P1/P2
implementation and lexer/CI fixes still require companion commits; those commits are already
ancestors of the reviewed head. Older rows also call 409 the “current” suite despite the 414-control
head. There is no exact fixing disposition mapping all six commits to closed, partial, or newly
exposed states.

Correction: after implementation fixes land, rewrite Status and the Unreleased net state to the
actual head, preserve historical reviewed counts as revision-qualified facts, and add a complete
round-36 fixing disposition. Do not claim CI or release activity until it exists.

### 3. The 414-control scope header still describes the former 409-control breakdown

Locations: `dev/validate-fixtures.mjs:5-15` and `75`, plus `CHANGELOG.md:86`.

The authoritative total and registry both say 414, but the header says 371 controls spawn a child
and 38 are in-process. That adds to 409. Controls 410–414 are five new in-process completion
mutations, so the current breakdown is 371 child plus 43 in-process. The thirteen rule-text and two
source probes are classifications within the numbered suite, not an explanation for the missing
five.

The changelog also says the numbered fixture suite contains “installer-recovery” regressions.
Controls 365–366 only enforce the installers' shared Node-floor helper declaration; the actual
recovery matrix lives separately in `dev/test-installer-recovery.mjs` and CI and is not part of the
414-control runner.

Correction: update the header to 371/43 and describe installer recovery as a separate CI/helper
suite, unless executable numbered controls are intentionally added for it.

## P4 observations

- `dev/js-lexer.mjs:9` retains every distinct source and mask/bitset in a module-global Map. Current
  validator input cardinality is bounded, but the exported helper remains an unbounded-process
  retention surface.
- Bash's tab-delimited journal cannot represent an owned path containing a tab or newline. Strict
  validation fails closed, so this is an availability/portability edge rather than a silent
  cross-path restore under the current non-elevated threat model.
- README's Layout tree lists `snapshot-install.mjs` but omits the now release-critical
  `dev/test-installer-recovery.mjs`.
- Current [official OpenAI plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) confirms the repository's
  `.codex-plugin/plugin.json` plus `skills/<name>/SKILL.md` structure and relative `./skills/` path.
  The direct Codex skill installer and npm-packed plugin structure are coherent. README could also
  document the current `codex plugin marketplace add owner/repo` path, but the existing direct
  installer remains a working supported path, so this is discoverability rather than a blocker.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| Ordinary Bash under `set -e` | WSL/Linux Bash normal install/uninstall succeeded; selected sparse abort exited exactly 86 and restart succeeded. | Round-36 P1 closed. |
| First Node journal | Full records exist before the first publication; `after-journal` restart passed. | Round-36 P2-1 initial-journal case closed. |
| Node/PowerShell replacement state | Code distinguishes replacement-renamed from rename-not-run; bounded Node Claude upgrade and Node Codex fresh cases passed. | Round-36 P2-1 one-interruption case closed; reentrancy remains P2-1 here. |
| Sparse Bash owned index | Backup paths now use `owned_index`; real sparse forward interruption/restart succeeded. | Round-36 P2-2 closed. |
| Rollback/recovery interruption | Restored destination + absent backup + pre-restore journal is rejected by Node and Bash; matrix has no such boundary. | P2-1/P3-1 accepted. |
| Canonical completion references | Exact sequence/array/object/argument/nonliteral-ID mutations are covered by controls 410–414. | Round-36 P3-1 exact cases closed; function/class-expression masking remains P2-2. |
| Lexer complexity | Forward stack/token scans stay deterministically budgeted; mismatch and 2,000,000/2,000,001 controls pass. | Closed; cache retention remains P4. |
| Matrix final oracle | Successful restart accepts both initial and clean-operation state. | P3-1 accepted. |
| Unknown installer boundary | Child completed 0, helper rejected the unlisted boundary with exit 1. | Negative branch works; omitted-real-boundary detection remains partial. |
| Release interruption calibration | 48 Windows boundaries require exact 86; nonexistent hook completes 0; failures 1–3 and recursive cleanup pass. | Round-36 P3-3 closed. |
| Current records/count | Total 414 is synchronized in README/CHANGELOG/registry; 38 in-process and several “current 409” statements are stale. | P3-2/P3-3 accepted. |
| Mirror/package/version/actions | 13 mirrors agree; 39 package entries; three 0.6.0 manifests agree; action SHAs resolve to their pinned refs. | Closed. |
| Codex plugin shape | Required manifest and `skills/rust-intel/SKILL.md` layout match current official OpenAI packaging documentation. | Closed. |

## Round-36 closure matrix

| Round-36 item | Disposition at `933b31b` |
|---|---|
| P1-1: ordinary Bash abort hook | **Closed (`035ceac`/`5e6a19b`).** Nonmatches return 0; EXIT rollback no longer recursively aborts at journal hooks. |
| P2-1: Node/PowerShell replacement and first-journal restart | **Closed for one forward interruption (`035ceac`/`b6d3531`), broader objective partial.** Replacement-renamed and full first-journal cases recover, but recovery/rollback is not reentrant (round-37 P2-1). |
| P2-2: sparse Bash backup binding | **Closed (`035ceac`/`b6d3531`).** Backup names use owned indices and sparse forward cases pass. |
| P3-1: canonical completion references | **Exact examples closed (`671bd89`, controls 410–414), broader objective open.** Function/class-expression division hides a live helper reference (round-37 P2-2). |
| P3-2: installer CI matrix | **Partial (`b6d3531`/`933b31b`).** Forward inventories are broad and unknown names fail, but rollback/recovery is absent and the final snapshot oracle accepts a no-op (round-37 P3-1). |
| P3-3: release abort status | **Closed (`f435b0a`).** Exact 86 and nonexistent-hook normal completion are enforced and calibrated. |
| P3-4: current release record | **Partial (`f435b0a`).** Overclaims were narrowed early, but final fixing commits/count breakdown were never accurately recorded (round-37 P3-2/P3-3). |

## Release-readiness evidence

| Area | Evidence at `933b31b` |
|---|---|
| Full validator | Passed in **235.931 s** on Node 24.12.0/npm 11.13.0; 12 skill Markdown files and the nested fixture run. |
| Fixture authority | Header/registry/docs total 414; executable breakdown should be 371 child plus 43 in-process, not the stated 38. |
| Syntax/workflow | Node checks, `bash -n`, Windows PowerShell 5.1 parser checks, `actionlint v1.7.12`, and `git diff --check origin/main..933b31b` passed. PowerShell 7 and Bash 3.2 were unavailable locally. |
| Lexical probes | Function/class-expression division is valid JavaScript but masks the live helper and returns no diagnostic. Existing depth/operation controls pass in the full suite. |
| Installers | Bounded Node Claude upgrade, Node Codex fresh, and Linux/WSL Bash sparse forward restart passed with exact 86. Synthetic exact post-restore states reproduced non-reentrant Node/Bash failures. |
| Installer negative inventory | An unknown Node Codex boundary completed normally and the helper rejected it with exit 1. This does not cover unlisted real rollback/recovery boundaries. |
| Release recovery | Calibration passed 48 Windows process-interruption boundaries, exact 86, nonexistent-hook status 0, failures after 1–3, modes, old-or-new state, and recursive cleanup. |
| Mirror/package | Mirror passed for 13 files. Dry-run: 39 entries, 614,655 packed / 1,712,319 unpacked bytes, integrity `sha512-atWf52lfaa5MdIri2iINC6sUaPSoikU3VuIPC5FysaUIy0qApBS5YdBfpQLAm7UZSaQLyrdP4V+UNgPm4dykkA==`. |
| Action pins | checkout v7, setup-node v7, and rust-toolchain 1.97.0 refs resolve to the committed full SHAs. |
| Version/status | 0.6.0 check passed; 0.7.0 check correctly failed against all three 0.6.0 manifests; local/remote tag absent; npm 0.7.0 E404. |
| Codex distribution | Npm tarball contains `.codex-plugin/plugin.json` and the complete `skills/rust-intel/` mirror; official manifest/path structure matches. |
| Provenance | 55 commits ahead of remote `main` at the reviewed head; no current-head CI/push/bump/tag/publication claim. |

## Red-tier and out-of-scope inventory

- No executable Rust dependency, `unsafe`, FFI, crypto, secret comparison, manual `Send`/`Sync`,
  attacker-extendable queue/cache, dropped Tokio task, blanket public impl, persisted wire-format
  change, or HTML/Markdown renderer was added. Normative prose examples are not executable.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: no Cargo manifest/lock exists.
- Exact Node 24.0.0, PowerShell 7, and Bash 3.2 were unavailable locally. The reviewed head is
  unpushed; no CI result exists for it.
- Publication, version edits, tags, pushes, and release creation are out of scope.

## Required correction order

1. Make installer restore/recovery journal transitions reentrant and test interruption during
   rollback and recovery on every surface (P2-1).
2. Distinguish function/class declarations from expressions in the shared slash-role scanner and
   add actual-source counterfactuals (P2-2).
3. Require the clean-operation final snapshot, cover Node Codex fresh replacement, and mechanically
   include rollback/recovery hooks in the CI inventory (P3-1).
4. Correct Status, Unreleased net state, round-36 disposition, Layout, and current/historical count
   wording; update 371/38 to 371/43 and separate installer recovery from numbered controls
   (P3-2/P3-3 and P4 documentation).
5. Run one complete timed validation and another independent review. Only no P0–P3 authorizes the
   separately requested `0.7.0` release transition.
