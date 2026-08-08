# Review of commit `458e821`

- **Commit:** `458e821d5b2ebcc9f7edd03cd23e3f1e4ba71f5c`
- **Parent:** `7929771b0f768e17002f1a199714f2433838232e`
- **Reviewed:** 2026-08-08
- **Verdict:** **REQUEST CHANGES**

This review covers the `458e821` delta and the resulting 0.5.0 release state. The branch moved from `7929771` to `458e821` while the review was in progress, so inherited release/install issues that remain observable at `HEAD` are included and identified as such.

## Findings

### P1 — The new `transmute` ban rejects valid Rust transmutations

**Location:** `skill/unsafe-and-ffi.md:15` and the generated mirror.

The new rule bans `transmute` whenever both types do not carry a pinned `#[repr(...)]`. That is not a Rust validity requirement. Primitive, array, pointer, reference, and function-pointer types generally do not need user-written repr attributes for their relevant representation to be specified. The Rust 1.97 standard-library documentation explicitly shows `transmute::<[u8; 4], u32>` and `transmute::<*const (), fn() -> i32>` as valid examples, subject to size and value-validity obligations.

This creates systematic false positives and conflicts with the next bullet, which correctly says that matching repr attributes are not sufficient. The actual contract is: equal size, a layout relationship sufficient for the particular conversion, and valid source/destination values. A repr proof is necessary when the conversion depends on aggregate field layout or ABI, not for every possible `transmute`.

**Recommended correction:** ban `transmute` when the required layout relationship or destination validity is unproven. Keep the checked-constructor preference, but do not require repr attributes on all source/destination types.

Primary source: [Rust 1.97 `std::mem::transmute`](https://doc.rust-lang.org/std/mem/fn.transmute.html).

### P1 — `Coverage: COMPLETE` can be emitted after reviewing zero Rust source files

**Location:** `skill/audit-project.workflow.js:331-353`, synthesis instructions at `:364-373`, and the generated mirror.

`coverageStatus.complete` no longer considers `sourceSampling.reviewed`. If every agent returns under the expected label and satisfies its non-Rust artifact obligations, a crate with 100 inventoried Rust files and `sourceFilesReviewed: []` from every unit gets:

```text
Coverage: COMPLETE — reviewed 0 of 100 source files
```

That is orchestration completeness, not audit coverage. Grepping candidates is useful, but the workflow also contains contextual rules that cannot be proven from a pattern hit alone. The appended sampling count does not make the word `COMPLETE` accurate.

**Recommended correction:** either rename the status to `Orchestration: COMPLETE` and report audit depth separately, or make zero/insufficient source review a coverage failure. The stronger design is to assign candidate/source obligations per unit and require each unit to account for its assigned set, while allowing explicit `not applicable` evidence.

### P1 — The tag workflow does not synchronize versions in the tagged plugin source

**Locations:** `.github/workflows/npm-publish.yml:31-32`, `dev/set-release-version.mjs:14-18`, `package.json:9-19`, and the claim in `CHANGELOG.md:55`.

The action rewrites manifests only in the runner's checkout *after* the tag already points at a commit. It does not change the Git tree behind that tag. In addition, `.claude-plugin/` is excluded from the npm package, which the `npm pack --dry-run` file list confirms. Therefore, on a future tag created without a committed version bump:

- the npm tarball gets the rewritten `package.json` and `.codex-plugin/plugin.json`;
- the Git tag still exposes stale `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` files;
- the Claude plugin manifest is not published through npm at all;
- the CHANGELOG statement that the manifests “cannot drift” is false.

**Recommended correction:** commit all three version changes before creating the tag. The tag-triggered workflow should verify that `${GITHUB_REF_NAME#v}` equals all three committed manifest versions and fail on mismatch, rather than rewriting them after checkout.

GitHub's immutable-release guidance reinforces that a release tag identifies a specific commit/tree: [Using immutable releases and tags](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases).

### P2 — The shell installer now depends on non-portable `realpath -m`

**Locations:** `rust-cc-install.sh:82-95`; the README advertises the script for macOS/Linux at `README.md:113-121`.

The overlap guard requires an external `realpath` command and specifically its `-m`/canonicalize-missing behavior. That option is characteristic of GNU coreutils and is not consistently available in older macOS, BSD, BusyBox, or minimal Linux environments. CI only runs `bash -n` on Ubuntu; it does not exercise the installer on the advertised macOS path.

**Recommended correction:** implement canonical-candidate resolution without a GNU-only option (for example, resolve the nearest existing ancestor and append the missing suffix), or use the already-required Node runtime for the guard. Add an execution smoke test on both Ubuntu and macOS.

### P2 — The “strict semver” regex accepts invalid SemVer versions

**Locations:** `dev/set-release-version.mjs:9` and `dev/validate.mjs:106`.

The regex accepts, among others:

```text
01.2.3
1.2.3-alpha..1
1.2.3-alpha.01
```

These violate SemVer rules for leading zeroes and empty/numeric prerelease identifiers. The validator nevertheless labels the check “strict semver”, and a malformed release tag can pass this gate before failing later or producing inconsistent metadata.

**Recommended correction:** use a conforming SemVer parser or the full SemVer grammar, with regression cases for leading zeroes, empty identifiers, and numeric prerelease identifiers.

Primary source: [Semantic Versioning 2.0.0](https://semver.org/).

### P2 — Duplicate-trigger validation does not parse Markdown table cells safely

**Location:** `dev/validate.mjs:91-94`.

The validator obtains the first cell using `line.slice(1).split('|')[0]`. A Rust trigger containing an escaped Markdown pipe or closure syntax is truncated at that pipe. There is already such a row in `skill/SKILL.md` (`std::thread::scope(\|s\| ...)`). Its inline-code signature is not parsed as intended, so duplicates in this class are silently missed.

The check also intentionally ignores prose-only trigger rows, meaning the CHANGELOG's broad “duplicate trigger rows” wording overstates the implemented coverage.

**Recommended correction:** parse table separators while respecting backslash escapes and inline-code spans, and describe the check as mechanical code-pattern deduplication unless phrase rows are covered too. Add a fixture containing a closure/bitwise-OR pattern.

### P3 — The shift fixture detector treats naming style as proof of constness

**Location:** `dev/validate-fixtures.mjs:29-34`.

The detector ignores every SCREAMING_CASE right-hand identifier, even when it is a function parameter or mutable local derived from input. Conversely, it flags a lowercase `const`. The file calls these probes crude, so this is not release-blocking, but the new “structural” framing should not imply semantic const detection.

**Recommended correction:** either keep the fixture syntax fixed and remove the pseudo-const exception, or minimally locate an actual `const` declaration before exempting the identifier.

## Confirmed good changes

- The canonical `skill/` tree and `skills/rust-intel/` mirror are byte-identical, and `dev/sync-mirror.mjs --check` detects current drift.
- Per-unit artifact groups prevent one agent from satisfying another unit's mandatory manifest/config/CI/FFI obligations.
- Unknown audit labels are now reported and block completeness.
- The Codex default personal skill path is aligned with `$HOME/.agents/skills`; the explicit `CODEX_HOME/skills` branch remains consistent with current Codex state-location documentation when `CODEX_HOME` is set.
- The Serde duplicate-key wording is materially more accurate than the earlier universal “last wins” statement.
- The Rust 1.97.0 CI toolchain is pinned and its release value is verified.
- The host-neutral fan-out instructions correctly distinguish Claude `Workflow(...)` from Codex-native delegation and retain a manual fallback.

## Verification performed

The following checks passed at `458e821`:

- `npm run validate`
- `node dev/sync-mirror.mjs --check`
- `node --check` for the new release/mirror scripts
- `bash -n rust-cc-install.sh rust-cc-uninstall.sh`
- PowerShell parser validation for `rust-cc-install.ps1`
- `rustc --crate-type lib` for both fixture files on Rust 1.97.0
- `npm pack --dry-run --json`
- `git diff --check`

Passing checks do not exercise the release-tag tree, non-GNU shell environments, or the semantic accuracy of the new `transmute` rule; those are the principal remaining gaps.
