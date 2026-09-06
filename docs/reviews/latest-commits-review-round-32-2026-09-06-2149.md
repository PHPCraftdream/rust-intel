# Round 32 review of the latest commits and v0.7.0 release readiness — 2026-09-06 21:49 CEST

## Scope and method

- Review base: `3ed04b907a10a4085203fa6af1f6876313609186` (`origin/main`, the pushed
  round-23 fixing commit).
- Reviewed head: `0c437faa1706ecac3d16cd71777de74eacc3fd43`.
- Commit window: `origin/main..HEAD` — thirty commits, eighteen changed files, `+2885/-298`
  before this report. The complete window and the whole repository state needed for the planned
  `0.7.0` release were inspected in an isolated linked worktree.
- Round 31 was read in full. Its two P3 findings were traced through `7b36749` and `0c437fa`, and
  the round-30 fixing disposition was checked directly in the ledger.
- Control 389's two real-source mutations were checked against the current control-1 and
  control-115 source. The literal-true guard was challenged with exact, whitespace/newline,
  comment-separated, parenthesized, extra-argument, template-text, template-expression, regexp,
  and postfix-division forms. These were bounded in-process probes; the complete fixture suite was
  not replayed recursively.
- One complete `npm run validate` was run and timed. Release manifests, README banner and Status,
  changelog transition, checklist ordering, workflows/action pins, Dependabot, package contents,
  installer/package surfaces, mirror/category state, tags, and review provenance were checked.
- No product, version, tag, workflow, package, or remote ref was changed. This report and its Open
  ledger row are the only authored changes.

## Executive result

- **No P0, P1, or P2 finding.** The real child and in-process body-removal mutations added by
  `7b36749` retain their source labels, registrations, and current completion expressions and fail
  closed with the expected outcomes. The complete validator finished in **277.947 seconds** and
  still executes one full fixture-suite equivalent.
- **Three P3 findings remain.** The new literal-true detector accepts parenthesized and
  extra-argument spellings of the same unconditional outcome; its duplicated JavaScript masker can
  hide a live completion after postfix division and can mistake a regexp statement for live code;
  and the ledger has no round-31 fixing disposition.
- The numeral **389** remains aligned across the fixture scope header, executable registry,
  contiguous source labels, successful runtime finalization, README Status/checklist, CHANGELOG,
  and ledger.
- Release surfaces outside these findings are coherent. All three manifests and the README banner
  remain at `0.6.0`; Status and CHANGELOG identify planned MINOR `0.7.0`; the checklist requires
  green validation on the exact release SHA before tagging; all seven workflow action uses are
  immutable SHA pins and monthly Dependabot covers GitHub Actions.
- **Release verdict: NOT READY for `v0.7.0`.** Close the three P3 findings and run another
  independent review before an explicitly authorized version bump, tag, push, or publication.

## P3 findings

### 1. The literal-true completion guard accepts equivalent unconditional spellings

Locations: `dev/validate-fixtures.mjs:3710-3713` and
`dev/validate-fixtures.mjs:3910-3921`.

The detector recognizes only a decimal control ID followed by the bare token `true` and then the
call's closing parenthesis:

```js
/completeCurrentControlScope\s*\(\s*(\d+)\s*,\s*true\s*\)/gu
```

The bounded calibration confirmed that exact, newline-separated, and comment-separated calls are
rejected, and that comment/string/template-text decoys are masked. However, these executable calls
returned no violations:

```js
completeCurrentControlScope(4, (true));
completeCurrentControlScope(5, ((true)));
completeCurrentControlScope(6, true, "ignored by the two-parameter helper");
```

All three pass the same literal boolean `true` as the outcome. JavaScript ignores the third
argument, so the last form is not semantically different. A future accounting-only rewrite can
therefore delete the semantic producer, retain the label/registration/completion action, use one of
these spellings, and keep both registry accounting and the new source guard green. This is the
counterfactual round 31 intended the guard to close.

Correction: locate `completeCurrentControlScope(...)` calls with balanced delimiters, isolate the
second argument, strip balanced redundant parentheses, and reject a literal `true` even when later
ignored arguments are present. Keep exact positive controls for all equivalent spellings and
negative controls for comments, strings, template text, and nonconstant predicates.

### 2. The copied JavaScript masker can hide an executable completion and misclassify regexp text

Locations: `dev/validate-fixtures.mjs:3581-3707` and
`dev/validate-fixtures.mjs:3710-3713`.

`7b36749` copied the repository validator's lightweight JavaScript lexer into the fixture runner.
Its `isRegexLiteralStart` treats a slash after `+` or `-` as a regexp opener without distinguishing
binary/unary operators from postfix `++`/`--`. This valid executable source was therefore reported
as having no literal-true completion:

```js
let x = 2;
x++ / completeCurrentControlScope(10, true) / 2;
```

The first slash is division, but the masker treats it as a regexp opener and blanks the live helper
call through the second slash. The corresponding `x--` form also returned `[]`. This is a direct
false negative: the completion call executes and records an unconditional outcome while the new
release gate does not see it.

The opposite boundary is also wrong. A regexp expression statement immediately after `do` (and
similarly after `else`) is treated as division, so regexp body text impersonates executable code:

```js
do /completeCurrentControlScope(12, true)/.test("x"); while (false);
```

The probe returned `[12]` even though the helper spelling is only regexp data. The shipped comment
claims regexp bodies cannot impersonate live completions, but no regexp decoy calibrates that
claim. Because the same approximate lexer now has two copies, fixes can also drift between the
repository validator and the fixture guard.

Correction: use one shared, directly tested lexical helper rather than maintaining a second copy,
and make its token context distinguish postfix updates from operators and regexp-statement contexts
such as `do`/`else`. Add bounded controls for both the live postfix-division call and regexp-body
decoys; preserve template interpolation as executable while template text remains masked.

### 3. The ledger has no round-31 fixing disposition

Location: `docs/reviews/README.md:51`.

The ledger correctly preserves round 31's historical Open row and now contains the round-30 fixing
disposition requested by that review. It does not map the commits made after round 31:

- `7b36749` adds the requested actual control-1/control-115 retained-completion mutations and the
  first literal-true source guard. It closes the real-source-mutation portion of round-31 P3-1, but
  the guard portion remains only partially integrated because findings 1 and 2 above still allow
  executable unconditional outcomes to escape it.
- `0c437fa` closes round-31 P3-2 by adding the distinct round-30 fixing disposition while retaining
  the historical round-30 Open row and avoiding CI/version/tag/push claims.

Without a distinct fixing row, the repository record leaves both round-31 items Open and makes the
closed/partial split discoverable only by reconstructing commit history.

Correction: retain the historical round-31 Open row and add a separate round-31 fixing-pass row
mapping `7b36749` and `0c437fa` to the exact partial/closed state above. Make no CI, version, tag,
push, or publication claim for the unpushed head.

## P4 observations

- README Status still says “Unreleased (prepared, not tagged).” The following sentences correctly
  say that `0.7.0` is only planned and all manifests remain at `0.6.0`, so this is editorial
  ambiguity rather than a false state claim. “In preparation, not tagged” would be clearer until
  the clean-review gate closes.
- The historical commit bodies for `6255730`, `ade4441`, `f085c36`, and `e5989b2` contain literal
  `\n\n` text where paragraph breaks were intended. Their substantive provenance remains readable;
  rewriting the local history is not required for release readiness.

## Round-31 closure matrix

| Round-31 item | Disposition at `0c437fa` |
|---|---|
| P3-1: no representative real retained-completion mutations and bare literal true accepted | **Partially closed by `7b36749`.** Control 389 now mutates the actual control-1 and control-115 source while retaining labels, registrations, and completion expressions; both fail closed with exact expected outcomes. Bare exact/newline/comment-separated literal `true` is rejected and non-code decoys are masked. Parenthesized/extra-argument literal true and the postfix-division lexer boundary still bypass the guard, so findings 1 and 2 remain. |
| P3-2: no round-30 fixing disposition | **Closed by `0c437fa`.** The ledger maps `d3d1c0e`, `6255730`, and `ade4441` to their exact closed/partial states, retains the historical Open row, and makes no release or remote-state claim. The missing round-31 fixing disposition is the new record gap in finding 3. |

## Release-readiness evidence

| Area | Evidence at `0c437fa` |
|---|---|
| Full validator/runtime | `npm run validate` exited 0 in **277.947 s** on Node `v24.12.0` / npm `11.13.0`, reporting 12 skill Markdown files checked. The fixture runner still has one full execution path; control 389's new checks are bounded in-process source mutations. |
| Real-source mutations | Control 1 retains its label, `observeControls(1)`, and exact completion expression after its `result` producer is removed; execution raises the expected `ReferenceError` and registry finalization reports its missing completion. Control 115 retains its range registration and exact completion while its semantic body is replaced by `let passed = false`; it emits exactly `control 115 completed with a false outcome predicate`. |
| Literal-true challenge | Exact/newline/comment-separated calls were detected; quoted and template-text decoys were masked; a template interpolation remained executable. Parenthesized, double-parenthesized, and ignored-extra-argument forms returned `[]`. Postfix-division `x++ / completeCurrentControlScope(10, true) / 2` also returned `[]`; a regexp statement after `do` returned a false-positive ID. |
| Counts | Header, executable registry, contiguous labels, successful runtime finalization, README, CHANGELOG, and ledger say 389. Runtime established registration and completion for all 389 IDs. |
| Version/status | `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` are `0.6.0`; README banner is `v0.6.0`; Status and CHANGELOG identify planned MINOR `0.7.0`. `node dev/check-release-version.mjs 0.6.0` passed. No bump was performed. |
| Release transition | README requires manifest bump, banner/Status conversion, fresh empty Unreleased plus versioned changelog section, release commit, push of `main`, green `validate` on that exact SHA, and only then tag/publish. `v0.7.0` is absent locally and npm registry metadata lists releases only through `0.6.0`. |
| Workflows/actions | `actionlint` passed. All seven `uses:` values are full SHAs. Live refs resolved to checkout v7/v7.0.1 `3d3c42e...`, setup-node v7/v7.0.0 `82076278...`, and rust-toolchain branch 1.97.0 `86e71974...`. Dependabot covers GitHub Actions monthly. |
| Toolchains | Local rustc `1.97.0 (2d8144b78)` and Cargo `1.97.0 (c980f4866)` match the CI pin. Exact Node 24.0.0 was not locally installed, and the unpushed reviewed head has no CI result. |
| Mirror/category | `node dev/sync-mirror.mjs --check` passed for 13 files. Full validation checked 12 skill Markdown files and the 59-category contract. No normative skill file changed in `origin/main..HEAD`. |
| Package/install surface | `npm pack --dry-run --json` passed: 38 entries, 609,163 bytes packed / 1,692,131 unpacked. Both licenses, both skill layouts, both npm installers, the Node guard, Codex manifest, Claude commands, README, and CHANGELOG are present. |
| Syntax/format | Both validators, both installers, release helpers, mirror helper, semver helper, and the canonical workflow script passed `node --check`; shell installers passed `bash -n`; `git diff --check origin/main..HEAD` passed. |
| Git/provenance | Thirty commits are ahead of `origin/main`; no remote branch contains `0c437fa`; tag `v0.7.0` is absent. No CI, push, release, or publication claim is made for this head. |

## Required correction order

1. Replace the exact-call regex with balanced second-argument inspection and reject parenthesized
   or extra-argument literal-true completions (P3-1).
2. Remove/fix the duplicated masker and calibrate postfix-division live code plus regexp/template
   decoys without replaying the suite (P3-2).
3. Add the distinct round-31 fixing disposition with exact commit mappings and partial state
   (P3-3).
4. Re-run one complete timed validation and another independent review. Only a result with no
   P0-P3 should authorize the explicitly requested `0.7.0` release bump and release sequence.
