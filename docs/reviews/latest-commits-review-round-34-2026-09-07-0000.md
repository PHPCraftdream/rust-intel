# Round 34 review of the latest commits and v0.7.0 release readiness — 2026-09-07 00:00 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`).
- Reviewed head: `18dc58a10eb0177d52115e21166ee94a4e346b8c`.
- Commit window: `origin/main..HEAD` — thirty-eight commits, twenty-eight changed files,
  `+4385/-606` before this report. The whole planned `0.7.0` release surface was inspected in an
  isolated linked worktree.
- Round 33 was read in full. Each of its four P2 and six P3 findings was traced through `8d71231`,
  `230ef59`, `bf0112b`, and `18dc58a`, then challenged at the failure boundaries the fixing commits
  claim to close.
- One full `npm run validate` completed successfully. Bounded probes covered lexer complexity,
  regexp/division contexts, completion-call equivalence, a real PowerShell backup failure, release
  rollback calibration, package contents, mirror state, manifest agreement, workflow syntax,
  action pins, tags, and registry state.
- No product, version, tag, package, workflow run, or remote ref was changed. This report and its
  Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Three P2 and five P3 findings remain.** The new scanner is iterative, but its completion-call
  search is still quadratic and its token context still reproduces a round-33 false negative while
  adding statement-boundary false positives. The PowerShell transaction can remove the working
  skill during an ordinary backup failure, and the cross-platform installer transactions still do
  not recover an interrupted process.
- The completion guard still discards nonliteral-ID violations and accepts other executable callee
  spellings. The Windows, npm, POSIX, and Codex smoke tests do not exercise several contracts they
  claim to protect. PowerShell uninstall remains nontransactional, the release journal is not
  durable at directory-entry boundaries and its recovery path is uncalibrated, and the release
  record has no round-33 fixing disposition or changelog summary.
- The complete validator exited 0 on Node `v24.12.0` / npm `11.13.0`, reporting twelve skill
  Markdown files checked. The fixture authority remains **389** controls. All thirteen normative
  `skill/` files are byte-identical to their `skills/rust-intel/` mirror.
- All three manifests and the README banner remain at `0.6.0`; README Status and CHANGELOG identify
  `0.7.0` as planned; local and remote `v0.7.0` are absent; npm still reports `0.6.0`. That is the
  correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P2/P3 below and run another independent
  review before the separately authorized version bump, tag, push, or publication.

## P2 findings

### 1. Completion-call discovery reintroduces quadratic work outside the lexical budget

Locations: `dev/js-lexer.mjs:9-11` and `dev/js-lexer.mjs:239-297`.

`scanLexical()` is now iterative and caps its own operations, but `completionDiagnostics()` runs
three later passes that are outside that budget. In particular, its candidate regexp begins with
`(?:\(\s*)*` and retries the growing failed prefix at every opening parenthesis. Calling
`literalTrueCompletionDiagnostics('('.repeat(n))` measured:

| `n` | elapsed |
|---:|---:|
| 1,000 | 3.99 ms |
| 2,000 | 10.80 ms |
| 4,000 | 44.41 ms |
| 8,000 | 145.75 ms |
| 16,000 | 526.24 ms |

The near-fourfold growth remains below both declared scan budgets and therefore has no
deterministic fail-closed bound. Repository-controlled fixture text can still amplify validation
before the child watchdog applies. This leaves round-33 P2-1 only partially closed.

Correction: discover completion candidates during the same forward token pass, or use a strictly
linear candidate scan. Account for parenthesis matching, argument splitting, and candidate
inspection in one explicit operation budget. Add operation-count calibrations at and above the
budget; do not use elapsed-time assertions as the oracle.

### 2. The scanner still loses property-token context and misclassifies statement blocks

Locations: `dev/js-lexer.mjs:154-164`, `dev/js-lexer.mjs:180-205`, and
`dev/validate-fixtures.mjs:3775-3811`.

The identifier branch computes `propertyName`, then clears `previousWasDot`; the following `(`
classifies a call from `previousWord` alone. A keyword-named member is consequently treated as a
control header. The exact round-33 shape is still hidden:

```js
obj.if() / MODULES.push({}) / 2;
```

`maskJsNonCode()` returned `obj.if()                      2;`, so dormant live mutation remains
invisible to the static workflow check. The new brace heuristic has the reverse problem: it does
not retain `class` through the class name and does not recognize binding-less `catch` or labeled
blocks. These valid regexp-only statement boundaries remained unmasked and can impersonate live
mutations or completions:

```js
class X {} /MODULES.push({})/.test(x);
try {} catch {} /MODULES.push({})/.test(x);
label: {} /completeCurrentControlScope(11, true)/.test(x);
```

All three parse as JavaScript; the helper exposed their regexp bodies as code. The control-389
calibration covers the already-known `do`/`else` and postfix-update examples but none of these
surviving boundaries. Round-33 P2-2 therefore remains open.

Correction: carry token roles, not just the last word/character: preserve member/private-name
status into calls, model declaration and statement-block ownership (`class`, binding-less `catch`,
labels), ASI-restricted keywords, and delimiter closure. Add mutation-capable negative and
regexp-only positive controls for each boundary.

### 3. Installer rollback can destroy the active install and cannot recover hard interruption

Locations: `rust-cc-install.ps1:159-195`, `bin/install-transaction.js:45-88`,
`rust-cc-install.sh:215-314`, and `rust-cc-uninstall.sh:71-125`.

The PowerShell catch path removes **every** replacement destination, not only replacements already
moved into place. If backup of a later current path fails, that cleanup can delete or fail on an
unbacked live path before restoration begins. A bounded temporary-target probe seeded an old skill
and three old commands, held `rust-cc-audit.md` open with `FileShare.None`, and invoked the installer.
Backup of the skill succeeded, backup of the locked command failed, cleanup then failed on that same
locked file, and the command returned with `target/skills/` empty while the commands remained. The
old skill survived only in an undisclosed `.rust-intel-tx-*` backup.

The shared Node transaction and PowerShell implementation also have no persistent transaction
record or signal recovery. Termination after some backups/replacements leaves a partial or
mixed-version live layout with no automatic recovery. Bash handles ordinary shell exit through an
`EXIT` trap, but an uncatchable termination or power loss has the same gap; its rollback disables
error handling and deletes the transaction directory even if a restore failed. This does not close
round-33's explicit interrupted-process case.

Correction: record exactly which live paths were backed up and which staged paths were installed;
never remove an unbacked destination. Make rollback failures preserve every remaining backup and
surface their locations. Add a durable transaction/recovery protocol (or an equivalent single-tree
atomic layout) for process interruption on every supported installer, including uninstall, and
calibrate failure before backup, during every backup/replacement, during cleanup, and during
rollback.

## P3 findings

### 1. The live literal-true gate discards the nonliteral-ID diagnostic it now computes

Locations: `dev/js-lexer.mjs:281-307` and `dev/validate-fixtures.mjs:3775-3811`.

`completionDiagnostics()` correctly assigns `id: null` when the first argument is not a decimal
literal, but `literalTrueCompletionViolations()` filters every null ID. The actual release gate at
`dev/validate-fixtures.mjs:3790` uses that filtered function. Thus the production loop-shaped
regression named by round 33 still passes:

```js
completeCurrentControlScope(number, true);
```

The new calibration checks the unfiltered diagnostics only on synthetic text, so it is green while
the live source gate remains deletion-blind. Other valid callee forms also remain accepted, for
example `completeCurrent\u0043ontrolScope(1, true)`, an alias call, or
`completeCurrentControlScope.call(null, 4, true)`. The implementation catches one specially chosen
escaped `o`, but has not established either complete ECMAScript equivalence or a canonical-spelling
ban.

Correction: fail on the presence of any unconditional-completion diagnostic, using the ID only to
improve the message. Explicitly enforce one canonical call shape and reject aliases/escaped names/
`.call`/`.apply` forms, or parse all equivalent calls. Mutate the actual loop completion from
`passed` to `true` while retaining its nonliteral ID and require the complete validator to fail.

### 2. Installer CI smokes are green without proving the repaired contracts

Locations: `.github/workflows/ci.yml:58-98` and `.github/workflows/ci.yml:207-222`.

- POSIX and npm rollback compare only the skill tree. They do not compare the three current command
  files or the removed legacy paths, so a mixed-version rollback can pass.
- The npm migration smoke never runs `--uninstall`, despite round 33 requiring install **and**
  uninstall migration sentinels.
- No Codex upgrade/rollback/uninstall failure is exercised.
- The Windows job performs only a fresh successful install. Its bracket characters occur in the
  **target** path, while round-33 P3-5 was source-path expansion by `Copy-Item -Path`; the checked-out
  source has no wildcard metacharacter. It therefore could not have caught the old bug and does not
  exercise the current rollback failure.
- The POSIX job has no relative dash-leading `CLAUDE_CONFIG_DIR` case and runs only the hosted
  runner's modern Bash, not the advertised Bash 3.2 floor.

Correction: snapshot the complete owned-path inventory with distinct old sentinels, plus unrelated
siblings, and compare it after each injected failure. Run install and uninstall migration checks,
Codex checks, a repository copy whose source path contains `[]`, relative dash-leading targets, and
the oldest supported Bash. Make each counterfactual fail against the pre-fix implementation.

### 3. PowerShell uninstall is still a sequential destructive operation

Location: `rust-cc-uninstall.ps1:58-91` (and therefore `rust-cc-uninstall.bat`).

The Bash and Node uninstall paths were moved behind backup transactions, but the PowerShell inverse
still deletes the skill and command paths one at a time. A locked or denied later command, process
termination, or filesystem error leaves earlier owned paths removed and later ones installed. This
is the same partial-layout failure the round-33 transaction work was meant to eliminate and makes
Windows semantics differ from the other advertised interfaces.

Correction: use the same staged backup/commit/rollback discipline as installation, with exact
current/namespace/legacy path inventory, unrelated sentinels, injected failure at every deletion,
and a Windows rollback smoke.

### 4. The release journal does not establish the durable recovery contract it claims

Locations: `dev/set-release-version.mjs:9-14`, `dev/set-release-version.mjs:34-53`,
`dev/set-release-version.mjs:162-192`, and `dev/calibrate-release-version.mjs:35-49`.

Temporary file contents are fsynced, but none of the directory entries are: journal replacement,
target-to-backup rename, temp-to-target rename, backup removal, and journal removal are not followed
by a parent-directory durability barrier. A power loss can therefore persist file data without a
coherent rename/journal sequence. The calibration injects one caught exception after replacement 2;
it does not terminate at any before/after-rename boundary, restart the utility against a prepared
journal, exercise `phase: committed` cleanup, test failures 1 and 3, or verify that no temp/backup/
journal artifact remains. It proves ordinary exception rollback, not interrupted durable recovery.

Correction: define the platform-specific durability boundary, fsync parent directories where the
platform supports it, and use a safe Windows replacement protocol where it does not. Add an abrupt
child-exit calibration at every journal/rename boundary plus a recovery-only entry point; verify
old-or-new manifest agreement, modes, byte restoration, and complete artifact cleanup after restart.

### 5. The release record omits the round-33 fixing pass

Locations: `CHANGELOG.md:9-65`, `README.md:46`, `README.md:82-133`, and
`docs/reviews/README.md:54-55`.

The ledger has the requested round-32 fixing disposition, but round 33 remains only an Open row;
there is no row mapping `8d71231`, `230ef59`, `bf0112b`, and `18dc58a` to their actual closed/partial
state. The Unreleased changelog does not mention the new shared lexer, transactional installer
work, migration, executable POSIX entry points, release transaction, or Windows job, although README
Status says the current release-tooling work is summarized there. README's Layout also omits
`bin/install-transaction.js`, `dev/js-lexer.mjs`, and `dev/calibrate-release-version.mjs`.

Correction: retain round 33's historical Open row and add a distinct fixing disposition with the
closure matrix below. Add a concise net-tooling changelog entry for the actual fixing commits and
make Status/Layout agree with the release tree without claiming CI, a bump, tag, or publication.

## P4 observations

- `README.md:46` still calls a tree with open P2/P3 release blockers “prepared.” “In preparation”
  would be more accurate until the clean-review gate closes.
- The module-level `lexicalCache` in `dev/js-lexer.mjs:9` has no size or lifetime bound. Current
  processes call it with a bounded small set, so this is not presently a demonstrated P0-P3 issue;
  document that call-site bound or use a one-entry/weak cache before broad reuse.
- PowerShell staging occurs before the transaction's `try` block, so a staging/hash failure leaves
  `.rust-intel-tx-*` debris even though the live installation remains intact.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| Iterative/budgeted lexer | Recursive template scanning is gone, but failed parenthesis prefixes scale approximately quadratically after the budgeted pass. | Accepted as P2-1. |
| Regexp/division token context | `obj.if()` live division is still masked; class/catch/labeled regexp statements remain exposed. | Accepted as P2-2. |
| Installer rollback and interruption | A real locked PowerShell path leaves the active skill missing; Node/PowerShell have no restart record, and Bash can discard backups after a failed restore. | Accepted as P2-3. |
| Canonical completion enforcement | Nonliteral-ID diagnostics are filtered by the live gate; alternate escaped/aliased/call forms remain executable. | Accepted as P3-1. |
| Installer-test oracle | Existing jobs omit whole-layout rollback, npm uninstall, Codex rollback, source metacharacters, dash-relative paths, and Bash 3.2. | Accepted as P3-2. |
| PowerShell uninstall atomicity | It remains a sequential `Remove-Item` loop, unlike the Node/Bash revisions. | Accepted as P3-3. |
| Release-version durability | Ordinary injected exception rollback passes, but directory-entry durability and restarted recovery are untested. | Accepted as P3-4. |
| Round-33 release record | No fixing disposition exists and the Unreleased tooling summary predates all four fixing commits. | Accepted as P3-5. |
| POSIX executable entry points | Both Git modes are `100755`; CI runs install and uninstall directly. | Rejected; round-33 P2-3 is closed. |
| npm legacy inventory | Current code owns current, namespace, and v0.1.x paths for install and uninstall. | Rejected as a functionality bug; its incomplete oracle remains P3-2. |
| Bash dash-leading operands | Target derivation makes relative overrides absolute before utility use. | Rejected as a current implementation bug; missing floor calibration remains P3-2. |
| PowerShell literal copy | `Install-File` now uses `Copy-Item -LiteralPath`. | Rejected as a current implementation bug; the ineffective regression remains P3-2. |
| Round-32 disposition | `bf0112b` added the distinct historical/partial mapping. | Rejected; closed. |
| Package/mirror/action pins/count/version | Package inventory, mirror, action refs, 389 count, and `0.6.0` pre-bump surfaces agree. | Rejected; evidence is recorded below. |

## Round-33 closure matrix

| Round-33 item | Disposition at `18dc58a` |
|---|---|
| P2-1: recursive/quadratic/unbudgeted lexer | **Partially closed by `8d71231`.** Recursive template scanning and the former line-prefix scan are gone; completion candidate discovery remains quadratic outside the operation budget (P2-1 above). |
| P2-2: regexp/division token context | **Open.** `8d71231` closes several named cases, but keyword-named member calls and class/catch/labeled statement blocks still misclassify live code and regexp data (P2-2). |
| P2-3: POSIX scripts are not directly executable | **Closed by `230ef59`.** Git records both scripts as `100755` and CI invokes both through `./...`. |
| P2-4: npm legacy migration absent | **Functionally closed by `230ef59`; coverage partial.** One owned-path inventory now covers current and historical Claude layouts in install/uninstall code, but CI never exercises npm uninstall and does not verify whole-layout rollback (P3-2). |
| P3-1: completion-call boundaries | **Partially closed by `8d71231`.** Parenthesized/optional/nonliteral diagnostics improved, but the live gate filters nonliteral IDs and equivalent callees remain (P3-1). |
| P3-2: installer upgrade atomicity | **Partially closed by `230ef59`/`18dc58a`.** Staging precedes live replacement and injected ordinary failures exist, but PowerShell backup failure is destructive and interrupted-process recovery is absent (P2-3). |
| P3-3: release-version atomicity | **Partially closed by `bf0112b`.** Caught failure 2 restores bytes; durable rename/journal recovery is not established or calibrated (P3-4). |
| P3-4: dash-leading Bash targets | **Implementation closed by `230ef59`; regression coverage incomplete.** Operands are made absolute, but no relative dash-leading/Bash-3.2 execution control exists (P3-2). |
| P3-5: PowerShell literal source paths | **Implementation closed by `230ef59`; regression coverage ineffective.** `Copy-Item -LiteralPath` is present, but the Windows smoke puts brackets only in the target path (P3-2). |
| P3-6: round-32 fixing disposition | **Closed by `bf0112b`.** The historical Open row remains and the distinct mapping is present. |

## Primary references and project contracts

- ECMA-262, [Lexical and RegExp Grammars](https://tc39.es/ecma262/#sec-lexical-and-regexp-grammars),
  remains the source of truth for regexp-versus-division grammar goals. The accepted counterexamples
  are valid programs, not attempts to make this repository checker parse invalid JavaScript.
- The Linux [`fsync(2)` manual](https://man7.org/linux/man-pages/man2/fsync.2.html) states that
  syncing a file does not necessarily persist its directory entry and that the containing directory
  also needs an explicit sync. This is the basis for P3-4's distinction between fsynced contents and
  a durable rename transaction.
- Microsoft documents [`FileShare.None`](https://learn.microsoft.com/dotnet/api/system.io.fileshare)
  as declining file sharing. The P2-3 probe used that ordinary Windows API to make a later backup
  move fail, then observed the installer-created partial layout.
- Microsoft [`Copy-Item`](https://learn.microsoft.com/powershell/module/microsoft.powershell.management/copy-item)
  distinguishes `-LiteralPath` from wildcard-capable `-Path`; the code correction is present, while
  P3-2 concerns the source-less regression oracle.
- Git's [`update-index --chmod`](https://git-scm.com/docs/git-update-index#Documentation/git-update-index.txt---chmod-executable-bit-files)
  documents the tracked executable bit used to close round-33 P2-3.
- Project contracts: README installation/migration/Status/release-checklist text, CHANGELOG's
  Unreleased record, round 33, the review-ledger quality gate, and rust-intel §B7/§D1a/§D3/§F2.

## Release-readiness evidence

| Area | Evidence at `18dc58a` |
|---|---|
| Full validator | `npm run validate` exited 0 on Node `v24.12.0` / npm `11.13.0`, reporting 12 skill Markdown files checked. |
| Fixture authority | Header, executable registry, README, CHANGELOG, and ledger remain at 389 controls; successful validation finalized the suite. |
| Syntax/format | `node --check` passed for every tracked `.js`/`.mjs`; `bash -n` passed both shell scripts; `actionlint` and `git diff --check origin/main..HEAD` passed. |
| Mirror | `node dev/sync-mirror.mjs --check` passed for 13 files. |
| Release utility | `node dev/calibrate-release-version.mjs` passed its single injected failure-2 case and successful three-manifest update; this is bounded exception evidence only, as P3-4 explains. |
| Package | `npm pack --dry-run --json` passed with 39 entries, 610,976 packed bytes / 1,698,306 unpacked bytes, integrity `sha512-oUhkMQr9673LCrmmSOVNMlSvGkFeB4OjoRCbvHhF6dc4rbElMAKWmLaAO6GWNvgKaQ5Np+fyDjcMWXUAEY3AqA==`; the shared installer helper and both distribution layouts are included. |
| Version/status | All three manifests and the banner are `0.6.0`; `node dev/check-release-version.mjs 0.6.0` passed; Status/CHANGELOG say planned `0.7.0`; local/remote `v0.7.0` are absent; npm reports `0.6.0`. |
| Actions/toolchains | Live refs still resolve to checkout `3d3c42e...`, setup-node `82076278...`, and rust-toolchain `86e71974...`; all workflow `uses:` values are full SHAs. Local rustc/Cargo are 1.97.0 as pinned. |
| Installer failure probe | A real Windows file lock during PowerShell backup exited nonzero and left the active skill missing; this is causal evidence for P2-3, not a hypothetical path. |
| Provenance | `18dc58a` is 38 commits ahead of local `origin/main`; no remote branch contains it. No current-head CI, push, bump, tag, or publication claim is made. |

## Red-tier and out-of-scope inventory

- No normative Rust skill file changed in `origin/main..HEAD`; the mirror remains identical.
- No executable Rust dependency, `unsafe`, FFI, crypto, secret comparison, manual `Send`/`Sync`,
  persisted wire-format change, or new dependency was introduced in the reviewed window.
- There is no `Cargo.toml`/`Cargo.lock`; crate build, clippy, cargo test, Miri, semver-check,
  cargo-audit, and cargo-deny do not apply to this JavaScript/shell/prose repository.
- Exact Node 24.0.0 was not installed locally, and the reviewed head is unpushed. Local Node 24.12.0
  evidence is not represented as current-head CI evidence.
- Product/version edits, tag creation, push, package publication, and release creation are out of
  scope for this review.

## Required correction order

1. Make completion discovery truly linear/budgeted and close the surviving regexp/division token
   contexts with mutation-capable controls (P2-1/P2-2).
2. Repair PowerShell's rollback state machine and add interruption recovery that preserves backups
   across all install/uninstall channels (P2-3/P3-3).
3. Make the literal-true live gate fail on nonliteral IDs and enforce the chosen canonical-callee
   contract (P3-1).
4. Replace the vacuous/partial installer smokes with whole-layout, source-metacharacter, oldest-Bash,
   Codex, migration, uninstall, and per-phase failure controls (P3-2).
5. Establish and calibrate durable release-journal recovery (P3-4).
6. Record the round-33 fixing disposition and current net tooling state in the release documents
   (P3-5), then run one complete validation and another independent review.
