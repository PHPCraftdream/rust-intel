# Latest-commits review — round 54

**Reviewed:** 2026-09-09 02:13 CEST

**Base:** `fd728c457de254dd833d5d856839196d6a0c91c4`
**Scope:** the twelve commits from `09bb180` through `fd728c4`, the canonical
`skill/` tree and generated `skills/rust-intel/` mirror, installer recovery
paths, fixtures, release packaging, and CI evidence.

## Result

No open P0 or P1 finding remains. The release candidate is **ready**: the one
installer P1 introduced in the reviewed range is covered by a regression test,
and the remaining documentation accuracy findings found during the review are
fixed in this round.

## Findings and disposition

| Severity | Area | Disposition |
| --- | --- | --- |
| P1 | PowerShell uninstall recovery could recursively delete a pre-existing foreign skill directory after an interrupted install. | Fixed by `09bb180`: only the installed owned directory is removed. The recovery test now seeds a foreign directory and verifies its file survives. |
| P2 | The Windows dangling-symlink assertion in §C2 claimed that `OpenOptions::create_new(true)` followed a dangling final link and created its target. | Fixed here. A Windows probe shows the standard-library operation returns `AlreadyExists`; the rule now preserves the important conclusion that it is not a general symlink-containment boundary. |
| P2 | §B2 and Tier B repeated a precise field-report prevalence/causation claim which the source ledger explicitly withdraws. | Fixed here. Both locations now describe the report as directional motivation and name Tokio documentation as the normative basis. |

The last two fixes were mirrored from `skill/` into `skills/rust-intel/` using
the repository's synchronizer.

## Reviewed changes

- `09bb180`: PowerShell foreign-directory preservation.
- `213fca1` through `2029b9e`: security, async, data, unsafe/FFI,
  concurrency, lifetime/API, RAII, dependency, source-ledger, core-skill, and
  adapter corrections. The corrected rules agree with their cross-references
  and source-ledger caveats.
- `fd728c4`: adapter wording matches the repaired core rules.

In particular, destination policy remains mandatory before a request; disabling
redirects alone is not treated as an SSRF control. The cancellation example
keeps the split connection state and frame buffer outside the cancellable
future. The semaphore and transaction guidance retain their permit/error
provenance requirements.

## Verification

- `npm run sync` — regenerated the three changed mirror files.
- `npm run validate` — passed: core validation, then fixture validation with
  2 cases and 494 controls.
- `git diff --check` — passed.
- The prior full CI run for the reviewed base was green across all 10 jobs,
  including PowerShell and pwsh installer recovery/preservation coverage.
- `npm pack --dry-run`, actionlint, mirror checks, and the targeted
  PowerShell foreign-preservation recovery test were also green in the review
  run.

## Residual risk

The security rule deliberately does not present any path-string check as a
race-free containment control for an attacker-mutable tree. It directs callers
to handle-relative/capability APIs for that threat model. This is documented
scope, not an unresolved finding.
