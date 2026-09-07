# Round 39 review of the latest commits and v0.7.0 release readiness — 2026-09-07 05:20 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, also
  confirmed by `git ls-remote origin refs/heads/main`).
- Reviewed head: `6ae9c3d4cf76cc50c1765ab7f07ab58a736ca1fd`.
- Commit window: `origin/main..6ae9c3d` — sixty-five commits, thirty-six changed files,
  `+8138/-629`, reviewed in an isolated linked worktree.
- Round 38 and its fixing commits `2948c85`, `5d9e8a8`, `7e3afb3`, and `6ae9c3d`
  were traced against the concrete class-heritage, generated-boundary, failure-depth,
  fresh/upgrade/sparse, repeated-restore, exact-status/hook, expected-only snapshot,
  sibling-cleanup, CI-runtime, and release-record claims.
- One complete timed `npm run validate` ran. The complete Node matrix and the complete
  current-Bash matrix were run from their generated inventories; bounded counterexamples
  covered cross-operation restart, the class-heritage scanner, POSIX process-substitution
  failure propagation, release recovery, syntax, mirrors, packaging, manifests, action pins,
  remote refs, and npm state. PowerShell source parsed under Windows PowerShell 5.1; the helper's
  PowerShell runtime matrix could not run locally because `pwsh` is not installed.
- No normative skill file, installer, validator, workflow, manifest version, tag, package,
  or remote ref was changed. This report and its Open ledger row are the only authored changes.

## Executive result

- **No P0 or P1 finding.**
- **Three P2 and five P3 findings remain.** The POSIX workflow can silently accept a failed
  matrix-inventory generator. The class-role fix still consumes the outer class construct when
  a direct function expression supplies the heritage value, hiding live completion and workflow
  mutations. Bash and PowerShell use operation-specific transaction prefixes, so the opposite
  command ignores an interrupted transaction over the same owned paths; the next invocation can
  then fail with destination-and-backup coexistence.
- The helper's transaction-debris oracle uses the install prefix even for Bash uninstall. Its
  replacement inventory is circularly derived from the implementation's own `before-replacement`
  hook, the child processes have no timeout, and Bash 3.2 receives only one of 230 generated
  boundary cases. README, CHANGELOG, and the round-38 disposition consequently overstate closure.
- `npm run validate` exited 0 in **238.890 seconds** on Node `v24.12.0` / npm
  `11.13.0`, checking twelve skill Markdown files and the 430-control suite. The current arithmetic
  remains **430 = 373 child-process + 57 in-process**: controls 423–429 are the seven new
  in-process cases and control 430 is the one new child case over the independently reviewed
  422 = 372 + 50 base.
- The generated same-operation matrices passed all **289 Node** cases and all **230 Bash 5.2.21**
  cases. This is useful implementation evidence but does not close the cross-operation,
  cleanup-oracle, generator-failure, timeout, or Bash-3.2 coverage findings below.
- Release-version calibration exited 0 in **8.049 seconds** on Windows and reported all 48
  process-interruption boundaries, failures after replacements 1–3, old-or-new manifest state,
  modes, recursive cleanup, and its nested-artifact negative control.
- All three manifests and the README banner remain at `0.6.0`; Status and CHANGELOG call
  `0.7.0` planned. Local and remote `v0.7.0` are absent, and npm returns `E404` for
  `rust-intel-cc@0.7.0`. That is still the correct pre-bump state.
- **Release verdict: NOT READY for `v0.7.0`.** Close every P2/P3 below, run another independent
  review and current-head CI, and only then perform the separately authorized bump/tag/publish
  sequence.

## P2 findings

### 1. A failed POSIX boundary-inventory generator is silently treated as an empty passing matrix

Locations: `.github/workflows/ci.yml:129-146`, especially line 143.

The workflow feeds `node ... --list` through process substitution:

```bash
while IFS= read -r boundary; do
  ...
done < <(node "$helper" --list "$surface" "$operation" "$mode")
```

`set -euo pipefail` does not propagate the exit status of the process-substitution producer to
the `while` command. A direct shell calibration with a producer exiting 7 continued past the loop
and the shell exited 0. Therefore a fixture/inventory/declaration regression that makes `--list`
fail can emit no boundaries and leave the supposedly exhaustive POSIX step green. The PowerShell
job correctly checks `$LASTEXITCODE` after its list command; the POSIX job does not.

Correction: materialize each list into a temporary file or array in a separately status-checked
command, require a non-empty inventory for every supported combination, then iterate it. Add a
negative CI/script calibration whose list producer exits nonzero and prove that the wrapper fails.

### 2. A direct function expression in `extends` still steals the outer class-body role

Locations: `dev/js-lexer.mjs:52-64`, `195-216`, and `263-283`, plus
`dev/validate-fixtures.mjs:3998-4040`.

`pendingClassConstructs` is depth-keyed, but `pendingFunctionBodyRole` is not represented in the
same construct ordering. At a brace, the scanner always chooses the pending class at that depth
before a pending function. A direct function expression is a valid class heritage value at the
same delimiter depth, so its body consumes the outer class role and the actual outer class body is
later inferred as a declaration block.

This valid source compiled and executed the completion call, while the scanner returned no
diagnostic:

```js
const C = class extends function() {} {} /
  completeCurrentControlScope(431, true) / 2;
```

The equivalent `AUDIT_UNITS.push({ mutated: true })` form executed one mutation while
`maskJsNonCode()` removed the call as if it were a regexp. The parenthesized function twin is
classified correctly, demonstrating that the missing shape is the direct same-depth construct.
Controls 423–430 cover calls, object literals, and nested classes, but not this valid function-
heritage form.

Correction: keep one ordered pending-construct stack per delimiter depth for both class and
function constructs, and consume the most recent construct that grammatically owns the brace.
Add direct anonymous and named function-heritage cases, including nested function-body braces,
actual completion-loop and workflow-root mutations, and declaration/expression twins.

### 3. Bash and PowerShell ignore interrupted transactions created by the opposite operation

Locations: `rust-cc-install.sh:297-302`, `rust-cc-uninstall.sh:142-147`,
`rust-cc-install.ps1:263-269`, `rust-cc-uninstall.ps1:163-166`, and
`dev/test-installer-recovery.mjs:64-68`, `248-315`.

Node deliberately uses the same `.rust-intel-tx-` namespace for install and uninstall, so either
next command recovers pending work over its owned inventory. Bash instead scans only
`.rust-intel-bash-tx.*` from install and only `.rust-intel-bash-uninstall.*` from uninstall;
PowerShell makes the same split between `.rust-intel-ps-tx-*` and
`.rust-intel-ps-uninstall-*`. Both commands mutate the same nine owned paths.

A concrete Bash process-interruption sequence produced:

```text
interrupted uninstall after-backup-rename-0: exit 86
opposite install: exit 0
pending uninstall transactions afterwards: 1
next uninstall: exit 1
```

The opposite install publishes a new destination while the ignored uninstall journal still owns
the old backup. The next uninstall recovery then sees destination and backup together and refuses
manual recovery. The reverse order likewise left the interrupted install transaction present
after a successful uninstall. PowerShell has the same deterministic namespace split in source.

Correction: before either shell operation starts, discover and recover both operation namespaces
in a defined order (or use one shared namespace/engine), and fail before touching live paths if
more than one incompatible transaction exists. Extend the matrix with install→uninstall and
uninstall→install restarts at every state that can leave a live path moved.

## P3 findings

### 1. The transaction-cleanup oracle cannot see leaked Bash uninstall transactions

Locations: `dev/test-installer-recovery.mjs:64-68` and `239-245`.

`transactionPrefixes()` returns `.rust-intel-bash-tx.` for every Bash operation. The uninstaller
actually creates `.rust-intel-bash-uninstall.*`. Consequently all 92 Bash uninstall boundary
cases can leave their own transaction directory and still pass `assertCleanTransactionParent()`.
The unrelated sibling assertion does not compensate: its deliberately foreign name matches
neither owned prefix.

Correction: select the operation-correct Bash prefix and add a negative control that creates one
owned-prefix stage/backup/journal tree and proves the cleanup assertion rejects it, while retaining
the existing foreign-sibling preservation case.

### 2. Replacement-boundary completeness is inferred from the hook being tested

Locations: `dev/test-installer-recovery.mjs:127-131`, `143-171`, and `248-257`.

Backup indices are independently derived from the fixture and owned-path order. Replacement
indices are instead derived only from `before-replacement-N` lines emitted by a successful
implementation run. If that exact hook is deleted, renamed, or stops logging, replacement indices
become empty; `boundaryInventory()` emits no replacement/installation-rollback cases and
`categoryIsReachable()` suppresses the declared templates. The installer still replaces files,
but CI silently shrinks the test domain.

Correction: derive expected replacement records independently from each surface's declared
operation inventory and compare the clean run's full hook set against it. Add the missing mutation
control that removes the sole inventory-seeding hook and require the matrix declaration to fail.

### 3. The recovery subprocesses and CI jobs have no finite timeout

Locations: `dev/test-installer-recovery.mjs:196-224`,
`dev/calibrate-release-version.mjs:54-61`, and every job in `.github/workflows/ci.yml`.

The current workflows generate 519 POSIX and 230 PowerShell boundary cases. Their helper performs
roughly 2,639 installer child invocations plus snapshots, yet both `spawnSync` calls omit a
timeout and the jobs omit `timeout-minutes`. A recovery regression that waits indefinitely does
not become a bounded failing case; it occupies the runner until the hosting platform's outer job
limit. That is particularly weak for a suite whose purpose is to prove interruption/restart
behavior.

Correction: give each child a generous measured timeout, diagnose `ETIMEDOUT` distinctly, and set
job-level `timeout-minutes` above a recorded p99/full-matrix baseline. Consider sharding the 749
cases by surface/operation so one stalled or slow lane does not hide all remaining evidence.

### 4. The advertised Bash 3.2 floor executes only one generated boundary case

Locations: `.github/workflows/ci.yml:338-369`.

The exhaustive Bash surface runs in `repository-checks` on Ubuntu's current Bash. The macOS job
does verify `3.2.*`, but after ordinary rollback/install/uninstall smoke it runs only
`bash install sparse after-backup-rename-5`. It does not exercise restore-state rewrites,
multi-record rollback depths, uninstall recovery, or the fresh/upgrade inventories on the oldest
advertised shell. The independent local full matrix passed under Bash 5.2.21, not 3.2.

Correction: run the generated Bash matrix on the Bash-3.2 job, preferably sharded/bounded after
the timeout work above, or narrow the documented supported floor. Keep at least the deepest
upgrade restore/rollback and cross-operation cases on 3.2 if cost requires a formally documented
reduced matrix.

### 5. Current release records overstate the round-38 fixing disposition

Locations: `README.md:46`, `CHANGELOG.md:26-38` and `90-98`, and
`docs/reviews/README.md:68`.

The records say the fixing pass addressed sibling cleanup and brace-bearing `extends` cases and
present the full Node/Bash matrices as the remaining implementation evidence. P2-2 and P3-1 show
that both broad closure claims remain false; P2-3 and P3-4 show that same-operation current-Bash
coverage is narrower than the release-facing installer-recovery objective.

Correction: after implementation fixes, record round 39 separately, distinguish current-Bash
same-operation evidence from the Bash-3.2 and cross-operation evidence, and do not claim current-
head CI until both relevant jobs are green on the exact pushed SHA.

## P4 observations

- `dev/js-lexer.mjs:9` still retains each distinct source and its mask/bitset in a module-global
  Map. Current validator cardinality is finite, so this is not a release blocker, but the exported
  helper remains an unbounded long-lived-process retention surface.
- The 373/57 execution-mode split is still prose-derived. The executable registry proves 430
  completed IDs but not which IDs spawned a validator child, so a future mode move can stale the
  release-facing split without failing validation.
- Several historical fixing commits retain subject-only messages. The linked review/disposition
  chain makes the current history auditable, but this remains weaker than the repository's
  descriptive-body practice.

## Candidate inventory

| Candidate | Calibration/result | Disposition |
|---|---|---|
| POSIX `--list` propagation | A producer exiting 7 under the committed process-substitution shape was followed by normal completion and shell exit 0. | P2-1 accepted. |
| Direct function heritage | Valid source executed completion/mutation; diagnostics were `[]` and the mutation was masked. | P2-2 accepted; round-38 class objective reopened. |
| Node same-operation matrix | All 289 generated cases passed in 176.888 s. | Round-38 rollback depth/index/fresh/sparse/repeated-restore examples closed for Node. |
| Current-Bash same-operation matrix | All 230 generated cases passed under Bash 5.2.21; deep upgrade/sparse install/uninstall samples were also rerun separately. | Same-operation current-Bash examples closed; P2-3/P3-1/P3-4 remain. |
| Cross-operation restart | Interrupted Bash uninstall → install left one uninstall transaction; the next uninstall exited 1. Reverse direction also left the install transaction after uninstall. | P2-3 accepted. |
| PowerShell source | Both scripts parsed under Windows PowerShell 5.1.19041.7548; corrected record-index loops are present. | Round-38 wrong-index source defect closed; runtime matrix pending CI and cross-operation namespace defect remains. |
| Release interruption calibration | 48 Windows boundaries and failures after 1–3 passed in 8.049 s. | Closed for the documented process-interruption contract. |
| Fixture total | Full validator observed 430 controls; 422 historical base plus seven in-process and one child control gives 373 + 57. | Closed; execution-mode authority remains P4. |
| Package/mirrors/manifests/actions | 13 mirrors agree; dry-run has 39 entries; all manifests are 0.6.0; action refs resolve to their pinned SHAs. | Closed for pre-bump state. |
| Release records | Planned 0.7.0, old banner/manifests, and absence of tag/package are accurate. | Installer/lexer closure wording remains P3-5. |

## Round-38 closure matrix

| Round-38 item | Disposition at `6ae9c3d` |
|---|---|
| P1-1: unreachable rollback depths | **Closed for generated same-operation Node/current-Bash cases.** Target-specific failure depth and exact one-hook assertions pass. Generator failure propagation remains P2-1. |
| P2-1: Bash/PowerShell restore indices | **Exact source defect closed.** Full Node/current-Bash repeated-restore cases pass; PowerShell uses current record indices. Cross-operation recovery is a distinct P2-3. |
| P2-2: brace-bearing class heritage | **Partial.** Object/nested-class cases close, but a direct function heritage at the same depth still consumes the outer role (P2-2). |
| P3-1: truthful fresh/concrete inventory | **Partial.** Fresh fixtures and backup derivation are correct; replacement reachability remains self-referential (P3-2) and POSIX list failures are masked (P2-1). |
| P3-2: sibling transaction cleanup | **Partial.** Node/install prefixes are checked, but Bash uninstall uses an unrecognized prefix (P3-1), and opposite-operation transactions are ignored (P2-3). |
| P3-3: release records | **Reopened.** Counts and pre-bump status are accurate, but broad installer/lexer closure language is contradicted by this review (P3-5). |

## Release-readiness evidence

| Area | Evidence at `6ae9c3d` |
|---|---|
| Full validator | Passed in 238.890 s on Node 24.12.0/npm 11.13.0; 12 skill Markdown files and 430 controls. |
| Fixture authority | Registry/header/README/CHANGELOG agree on 430; delta recount gives 373 child + 57 in-process. |
| Installer matrices | 289/289 Node and 230/230 Bash 5.2.21 same-operation cases passed. Bash cross-operation counterexamples failed; PowerShell full runtime is pending CI. |
| Syntax/workflow | JavaScript checks, Bash syntax, Windows PowerShell 5.1 AST parsing, `actionlint`, mirror check, and `git diff --check origin/main..6ae9c3d` passed. |
| Release recovery | Windows process-interruption calibration passed 48 boundaries in 8.049 s, including exact 86, failures 1–3, old-or-new state, modes, and recursive cleanup. |
| Mirror/package | Thirteen mirrors agree. Dry-run: 39 entries, 615,806 packed / 1,717,829 unpacked bytes, integrity `sha512-S+8ckctVhtQ4SXTQq/Zrp+1rfpDqQsY1q/iPATnsdiS7xKFFtiH3ROJmtMbY6v4yHONFOnrXh4g+XkQ9SZl9Cg==` on Node 24.12.0/npm 11.13.0. |
| Action pins | checkout v7, setup-node v7, and rust-toolchain 1.97.0 refs resolve to the committed full SHAs. |
| Toolchain | `rustc 1.97.0` (`2d8144b7`, x86_64-pc-windows-msvc) and Cargo 1.97.0 (`c980f486`) match CI's pinned release. |
| Version/status | 0.6.0 check passed; 0.7.0 correctly failed against all three 0.6.0 manifests; local/remote tag absent; npm 0.7.0 E404. |
| Provenance | Remote `main` remains `3ed04b9`; reviewed head is sixty-five local commits ahead. No current-head CI, push, bump, tag, or publication claim is valid. |

## Red-tier and out-of-scope inventory

- No normative `skill/` or `skills/rust-intel/` file differs from `origin/main`; all thirteen
  mirror files are byte-identical.
- No executable Rust dependency, `unsafe`, FFI, cryptography, secret comparison, manual
  `Send`/`Sync`, attacker-extendable queue/cache, dropped Tokio task, blanket public impl,
  persisted wire-format change, or HTML/Markdown renderer was added in this window.
- Cargo/clippy/Rust tests/Miri/semver-check/audit/deny do not apply: this repository has no Cargo
  manifest or lockfile and the executable changes are Node/Bash/PowerShell repository tooling.
- Sudden-power-loss durability on Windows remains explicitly outside the installer and release
  transaction contract. This review tests and reports process-interruption behavior only.

## Required next pass

1. Fail closed when POSIX inventory generation fails, independently derive replacement records,
   correct the Bash-uninstall debris prefix, and add negative controls for all three oracles.
2. Make Bash and PowerShell recover both install and uninstall transaction namespaces before either
   operation mutates live paths; add both cross-operation restart directions to the generated matrix.
3. Unify same-depth class/function construct ownership and add direct-function-heritage completion
   and workflow mutations while retaining the lexical operation/depth limits.
4. Add per-child and job timeouts, calibrate/shard the 749-case CI load, and run the generated
   matrix on Bash 3.2 plus PowerShell CI.
5. Update Status/CHANGELOG/ledger only after the fixes and run another independent P0–P3 review.
   Only a clean reviewed head plus green exact-SHA CI licenses the separately authorized v0.7.0
   bump, tag, and publication sequence.
