# Changelog

Format — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning — [SemVer](https://semver.org/).

Major = breaking changes to BANNED/REQUIRED wording that tooling depends on.
Minor = new categories or substantive additions.
Patch = wording refinements, fixes, new sources.

## [0.5.1] — 2026-08-09

**Performance gates measure the wrong thing — §E6 + §D1.** **PATCH-shaped:** bullets, sub-clauses, two trigger rows and one source entry; numbered category count unchanged (still **58**).

Triggered by an external profiling write-up, but the write-up's own figures are not the grounding — it is a vendor blog for a profiler crate, and its numbers are self-produced demos. Four of its six lessons were already covered, two of them by verbatim-matching examples (§E1 already illustrates serialized `.await`s with `let a = fetch_a().await; let b = fetch_b().await;`; §E5 already routes `Regex::new` in a hot function to `LazyLock`; the Substitution catalog already lists `Arc<str>` for cloned immutable payloads; §E4 already bans a critical section "spanning I/O, allocation, or `format!`"). What survived verification was a **contradiction inside this spec**, grounded in first-party documentation:

- **`skill/testing.md` — §E6 "Lock the win".** The rule told the reader to "guard it with a `criterion` benchmark in CI that fails on regression" — which is precisely what Criterion's own FAQ advises against: cloud-CI virtualization (it names GitHub Actions) "introduces a great deal of noise into the benchmarking process, and Criterion.rs' statistical analysis can only do so much to mitigate that." Rewritten so *what* you gate on is the point: the **failing** gate must be a deterministic counter (allocation bytes/counts, query/syscall/comparison counts, or instruction counts from a Valgrind/callgrind harness — Linux CI only, Valgrind has no Windows support), with wall-clock kept as a trend rather than a red build unless it runs on dedicated hardware. Adds an §A1 pointer: Criterion's FAQ still recommends `iai`, unreleased since **2021** — the technique is stable, the crate name is not.
- **`skill/testing.md` — §D1, new BANNED bullet: a wall-clock threshold asserted as a test.** `assert!(t.elapsed() < Duration::from_millis(100))` has no useful setting — **tight** flakes on a loaded runner or noisy co-tenant VM (the `sleep` failure above, wearing an assertion), **loose** is structurally unable to fail (the vacuous-test/coverage-theater bullet below it). And neither reading describes the shipped binary, because `cargo test` runs the **debug** profile (§D3) while production runs release. Calibrated against its legitimate twin: asserting that a *timeout fires* is a behavioural postcondition and stays allowed — driven by `tokio::time::pause()`/`advance()`, not real elapsed time. This is the §B26/§D3 shape reused — §E6 owns the discipline, §D1 is the testing-side enforcement.
- **`skill/SKILL.md`** — the "benchmark this / lock in the speedup / guard against regression" phrase row previously restated the advice Criterion warns against; it now routes to the deterministic-counter gate. New code-pattern row for a wall-clock threshold inside a `#[test]`.
- **`skill/references/sources.md`** — new entry quoting Criterion's FAQ and analysis chapters verbatim, with the `iai` staleness recorded as a live §A1 example of a documentation recommendation that rotted.

## [0.5.0] — 2026-08-08

**Second distribution channel (Codex), a review-of-reviews pass over v0.4.7, and the repo's first CI.** **Numbered category count is unchanged (still 58)** — no category was added, split, or retired.

**Why MINOR.** The bump is earned by the *distribution* half, not the spec half: a second installable target (Codex plugin manifest, the `rust-intel-codex` binary, the `skills/rust-intel/` layout) is a substantive addition under this repo's rule. The spec half is PATCH-shaped — corrections to existing bullets and their calibration, no new numbered categories. **Explicitly not MAJOR:** the corrected §B5/§B12/§B20 bullets narrow or sharpen claims that were overstated, and each keeps a mechanically-matchable form for the case tooling actually keys on (a tagged-union read with no tag `match`; a struct returned by value that holds key material; an untrusted-request struct without `deny_unknown_fields`). No BANNED/REQUIRED rule was withdrawn.

### Spec corrections — the second pass over v0.4.7 (`docs/reviews/README.md`)

Five audits shipped in v0.4.7 in five independently-written releases; this is the merge-time review they never got as a set. The ledger in `docs/reviews/README.md` records what each correction was, and the historical gap-audit reports are now banner-marked non-normative.

- **`skill/unsafe-and-ffi.md` — §B5 `union` reads.** v0.4.7 claimed a tag check is required for *every* union read; that is false for deliberate type-punning between mutually valid representations (`u32` ↔ `[u8; 4]`). The rule now demands a **local validity proof**, and names which proof applies where: for a tagged union — the `bindgen`-emitted C shape that dominates FFI — the proof *is* the tag check and a read with no preceding `match` is still the finding; for type-punning it is a stated bit-validity argument. The non-`#[repr(C)]`-union-for-FFI ban is retained verbatim.
- **`skill/unsafe-and-ffi.md` — §B5 `transmute`.** (Superseded by the third-pass correction below — see that entry for the version that shipped.)
- **`skill/security.md` — §B12 zeroize.** v0.4.7 overstated the mechanism ("every Rust move is a `memcpy`"). Restated as **best-effort memory hygiene, not a guarantee** — the compiler may elide, duplicate, or combine copies — while keeping both worked failure modes (a secret returned by value from `load()`; a `String` secret grown past its capacity) and the `Zeroize` documentation's own reallocation caveat. Adds `zeroize`'s custom-`Drop` pattern for types whose all-zero state would break an invariant.
- **`skill/data-and-types.md` — §B20 duplicate keys.** v0.4.7 asserted flat "JSON duplicate keys are last-wins". Corrected: a direct Serde struct visitor normally *errors* on a duplicate known field; last-wins is the behavior of an intermediate `serde_json::Value`/map path. The proxy-vs-service parser-differential hazard is preserved — the policy must be chosen and tested at the boundary.
- **`skill/data-and-types.md` — §B26 shift counts.** New BANNED bullet, stated to the module's own precision standard: a count at or beyond the type's bit width **panics in debug** and **masks to `n % BITS` in release**, so `x << 32` on a `u32` yields `x`, not `0` — defined behavior, wrong answer, green tests. Notes that the masking is on the *count*, so `wrapping_shl` does not mean "the bits shifted away".
- **`skill/lifetimes-and-api.md` — §C1 `#[repr(transparent)]`.** No longer implies transmutability: it gives ABI compatibility, and §B5's value-validity/provenance/ownership proofs still apply on top.
- **`skill/unsafe-and-ffi.md` §B7 + `skill/security.md` §C2 — archive extraction, split along the correct axis.** v0.4.7 filed the whole of archive safety under §B7 (resource exhaustion). The traversal half is not exhaustion: **zip-slip/tar-slip** (attacker-authored entry names, absolute/rooted paths, and link entries extracted first so a later write escapes the tree — CWE-22) now lives in §C2 next to the `Path::join` rule that already carries the component-rejection / `canonicalize` / `openat`-`cap-std` recipe. §B7 keeps the part that *is* exhaustion: no **aggregate** cap on extracted bytes, entry count, or nesting depth — per-entry limits do not bound the archive. Both bullets cross-reference each other; a traversal-safe extractor can still fill the disk, and a quota-bounded one can still write to `/etc`.
- **`serde_yaml` wording made version-aware** everywhere it appears — the uncontrolled-recursion abort was fixed in 0.8.4 (RUSTSEC-2018-0005) and the crate is now unmaintained, so the instruction is to verify the pinned version, not to assume "no limit". This corrects a residue in `commands/rust-intel-cc/fix.md` that the v0.4.9 pass had missed.
- **`skill/SKILL.md` — trigger tables.** Duplicate `x << n` code-pattern row removed (two independently-added rows for one rule); the `union` row regained its grep anchor ("no preceding tag/discriminant `match`", "not `#[repr(C)]`"); archive extraction split into a §C2 traversal row and a §B7 quota row; toolchain-as-artifact added to Version pins; `cargo audit`/`cargo deny` added to the command block as release/CI gates with an explicit "record the reason if you can't run them" clause. `commands/rust-intel-cc/fix.md` gains matching zip-slip and aggregate-quota symptom rows.
- **`skill/SKILL.md` — fan-out fallback.** Rewritten host-neutrally (Claude `Workflow(...)` / Codex native delegation) **without** losing the hand-rolled fallback: the order is now explicitly workflow → one sub-agent per module written by hand → bounded single-context pass *with the report marked incomplete*.

### Third pass — independent commit review (`docs/reviews/commit-458e821-review.md`)

An independent review of the second-pass commit (`458e821`) filed REQUEST CHANGES with 7 findings against the still-unpublished 0.5.0 tree, verified individually before acting on them (one — a `.claude-plugin`/npm claim drafted while writing this entry — was caught and corrected during that verification, not in the review itself).

- **`skill/unsafe-and-ffi.md` — §B5 `transmute` (P1).** The second-pass rewrite banned `transmute` whenever *either* side lacked a pinned `#[repr(...)]` — but per the standard library's own documentation, primitive/array/pointer/fn-pointer conversions (`[u8; 4]` ↔ `u32`, `*const ()` ↔ `fn() -> i32`) have specified layout without a user-written repr, and the rule both rejected valid, idiomatic transmutes and contradicted the union bullet immediately below it (which correctly allows exactly this kind of type-punning with a bit-validity proof instead of a tag). (Superseded again by the fourth-pass correction below — see that entry for the version that shipped.)
- **`skill/audit-project.workflow.js` — coverage status (P1).** The second-pass `coverageStatus.complete` dropped source-file sweep from its gate entirely, which meant a crate with 100 inventoried files and every unit returning `sourceFilesReviewed: []` reported `Coverage: COMPLETE — reviewed 0 of 100`. Split into two independent signals so orchestration success can never read as audit coverage: `orchestrationComplete` (did every unit run under its label with its required inputs) and a `noSourceEvidence` floor (a unit whose module had non-empty grep-candidate rows and whose scope had source files, yet reviewed none, is a per-unit failure regardless of orchestration status). The synthesis report now prints both lines separately. (`noSourceEvidence`'s scope check was itself gapped — see the fourth-pass entry below.)
- **Release workflow inverted to verify-not-rewrite (P1).** `npm-publish.yml` rewrote manifests in the runner's checkout *after* the tag already existed — a git tag is immutable and points at a specific tree, so this changed only the npm tarball, never the tagged tree itself, making the CHANGELOG's "cannot drift" claim false. `dev/set-release-version.mjs` is now a manual bump-before-tagging utility; a new `dev/check-release-version.mjs` verifies `${GITHUB_REF_NAME#v}` against all three committed manifests and **fails the release** on mismatch, in both `npm-publish.yml` (on tag) and `ci.yml` (on every push, against `package.json`'s current version, so drift is caught before a tag ever exists). Also documented, having verified it directly: `.claude-plugin/` is intentionally absent from the npm `files` list (Claude installs via the git-based marketplace, not npm) and `.codex-plugin/` ships despite `bin/install-codex.js` not reading it (for a future Codex marketplace-style path).
- **`rust-cc-install.sh` — portable overlap guard (P2).** The overlap guard added in the second pass required GNU coreutils' `realpath -m`, which stock macOS/BSD `realpath`, BusyBox, and minimal Linux do not support — breaking the installer on a platform the README advertises it for, unverified by CI (which only runs `bash -n` on Ubuntu). Replaced with a POSIX-only `canonical_candidate()` (resolve the nearest existing ancestor via `cd`+`pwd -P`, re-append the missing tail) mirroring the equivalent helper already in `bin/install.js`/`rust-cc-install.ps1`. (That replacement had its own bypass — see the fourth-pass entry below.)
- **`dev/semver.mjs` (new) — real SemVer grammar (P2).** The "strict semver" regex in `dev/set-release-version.mjs` and `dev/validate.mjs` accepted `01.2.3`, `1.2.3-alpha.01`, and `1.2.3-alpha..1` — all invalid per SemVer 2.0.0's leading-zero and empty-identifier rules. Replaced with semver.org's own regex, shared by both scripts and the new `dev/check-release-version.mjs`, with `dev/validate.mjs` regression-asserting both the valid and invalid cases above.
- **`dev/validate.mjs` — duplicate-trigger cell parsing (P2).** The duplicate-trigger check split a table row on the first `|`, which truncates a cell containing a Markdown-escaped pipe inside inline code — exactly the shape of the existing `` `std::thread::scope(\|s\| ...)` `` row — silently missing duplicates in that class. Replaced with a splitter that respects the `\|` escape. Narrowed the CHANGELOG wording for this check from "trigger rows" to "code-pattern rows", since prose-only rows with no inline code were never in scope.
- **`dev/validate-fixtures.mjs` — shift-count probe (P3).** The runtime-shift detector exempted any SCREAMING_CASE identifier as "probably a constant" — naming convention, not proof; a lowercase `const` would have evaded it either way. Removed the exemption; the probe is documented as what it is, a crude "any identifier on the right of `<<`/`>>`" textual check, not a const-vs-runtime analysis.

### Fourth pass — independent review of the third pass (`docs/reviews/commit-0a31099-review.md`)

A second independent review, of the commit that fixed the first review's 7 findings, filed REQUEST CHANGES with 4 more findings — two of them regressions surviving inside the very fixes meant to close the prior round. All four verified individually before acting (the `canonical_candidate` bypass was reproduced directly against real POSIX `-e` semantics, not just read as plausible — Windows/MSYS's lexical `..`-normalizing `-e` masks the bug, so it had to be traced by hand and independently confirmed rather than trusted from a single local repro).

- **`skill/unsafe-and-ffi.md` — §B5 `transmute`, corrected again (P1).** The third-pass fix still overstated the contract in two ways. First, it required "every source bit pattern" to be a valid destination value — that is the obligation for a *generic/unchecked* conversion API accepting arbitrary source values (`bytemuck::Pod`/`zerocopy::FromBytes` bounds), not for an individual `transmute` call: a `u8` statically known to be `0` or `1` transmutes soundly to `bool` even though most `u8` values do not, because the contract is about *this call's actual argument and result*, not the source type's whole value space. Second, it said struct-to-bytes needs "both sides on a matching pinned repr" — but a byte array has no representation attribute to match, and `#[repr(C)]` on the struct does not by itself guarantee the by-value operation preserves padding or that the destination bytes are initialized. Restated both obligations in value-specific, per-conversion terms, and pointed the struct-to-bytes case at the existing padding-byte bullet (the actual proof obligation there) instead of implying a repr attribute settles it.
- **`rust-cc-install.sh` — `canonical_candidate` missing-component/`..` bypass (P1).** The portable replacement for `realpath -m` resolved the nearest existing ancestor and re-appended the missing tail **without normalizing `.`/`..` inside that tail**. A destination like `<repo>/.does-not-exist/../skill` never reaches an existing path until it walks all the way up to the repo root (each intermediate component fails `-e` because `.does-not-exist` doesn't exist to resolve `..` through), so the *entire* remaining suffix — including the literal `..` — gets glued back on verbatim, while `mkdir -p`/`find`/the kernel normalize it and land inside `skill/`, defeating the guard whose only job is to prevent exactly that. Added `normalize_path_components()` — a stack-based `.`/`..` collapse applied to the resolved-ancestor-plus-tail before comparison — written without bash 4.3+ features (namerefs, negative array indices) since stock macOS still ships bash 3.2. Added five execution tests to `ci.yml` (normal install, existing-target overlap, fully-missing-target overlap, the missing-component-then-`..` bypass itself, and a symlink into the source tree), so the guard's actual runtime behavior is asserted on every push, not just its syntax. (Those ingredients turned out to be insufficient *composed* — see the fifth-pass entry below.)
- **`skill/audit-project.workflow.js` — `noSourceEvidence` accepted out-of-scope paths (P2).** The per-unit floor added in the third pass only checked `sourceFilesReviewed.length > 0`, so a unit could dodge it by reporting `README.md`, a typo'd path, or a hallucinated filename — none of which is evidence that any *scoped* Rust source file was reviewed. Now intersects each unit's reported paths against `scoperResult.files` before counting, and surfaces any out-of-scope paths separately as `coverageStatus.invalidSourceEvidence` (named in the report, never silently counted as evidence).
- **Trailing whitespace + a standing invariant (P3).** The three metadata lines in `docs/reviews/commit-458e821-review.md` used Markdown hard-break trailing spaces — the only trailing whitespace in the entire tracked tree, and enough to fail `git diff --check`. Reformatted as a plain list (matching the format already used in the newer review doc). Added a whole-tree trailing-whitespace check to `ci.yml` (`git diff --check` against the empty tree, so every tracked line is checked, not just a PR's diff) so this becomes a standing invariant instead of a one-off cleanup.

### Fifth pass — independent review of the fourth pass (`docs/reviews/commit-c9fb62a-review.md`)

A third independent review confirmed three of the previous four findings closed and found the installer fix still incomplete: the two path shapes it had newly tested were each rejected *alone*, but their **composition** was not.

- **`rust-cc-install.sh` — `missing/..` followed by a symlink (P1).** The fourth-pass helper ran physical resolution and lexical normalization **once each, in that order** — and the two steps feed each other. Nothing can be traversed *through* a nonexistent directory, so the physical walk stops before it ever reaches a later component; the lexical pass then collapses the `missing/..` pair and **exposes** that component. If it is a symlink, it is returned unresolved, and a destination like `<anywhere>/absent/../link` (where `link` → the source tree) compares as an unrelated path while `mkdir -p` and the kernel follow it straight into `skill/` — reinstating the recursive self-copy the guard exists to prevent. Restructured `canonical_candidate()` to iterate walk → `cd`+`pwd -P` → normalize **to a fixpoint** rather than once; each iteration either converges or resolves at least one more symlink, with a 64-iteration cap as a backstop against symlink cycles. The inner walk also now tests `-d` rather than `-e`, so a plain file on the path can never become a `cd` target (which would abort the script under `set -e`). Added CI cases 6 and 6b: the composed traversal-plus-symlink against the skill tree, and the same construction against the **commands** tree — the latter passes the skill comparison and can only be caught by the commands comparison, so it exercises that second guard specifically.
- **Verification note.** This class of bug is invisible on the maintainer's Windows/MSYS shell, where `-e`/`-d` normalize `..` lexically and silently "fix" the traversal before the guard sees it — the same masking that hid the fourth-pass bug. It was therefore confirmed twice: by hand-tracing the walk against real POSIX semantics, and by re-implementing the exact algorithm against a modelled POSIX filesystem where traversal through a nonexistent component fails, which reproduces the bypass on the single-pass version and shows the fixpoint version returning the physical path for all five shapes. `bin/install.js` and `bin/install-codex.js` were checked and are **not** affected: `path.resolve()` collapses `.`/`..` *before* the existence walk, so the symlink is already inside the resolved prefix when `realpathSync` runs.

### Codex distribution — new channel

- **`.codex-plugin/plugin.json`** — Codex plugin manifest with an `interface` block (display name, descriptions, category, capabilities, default prompt), validated field-by-field in CI against the documented schema (allowed fields, length limits, HTTPS-only URLs, strict semver, `./`-relative paths without traversal).
- **`bin/install-codex.js`** — zero-dependency installer, exposed from the npm package as `rust-intel-codex`. Installs to `$CODEX_HOME/skills/rust-intel`, else `~/.agents/skills/rust-intel`; `--user-dir <path>` overrides, `--uninstall` removes. Argument parsing is strict: unknown flags, repeated flags, and a missing `--user-dir` value are hard errors (CI asserts each).
- **`skills/rust-intel/`** — the Codex manifest requires a `skills/<name>/` layout, so a byte-identical mirror of `skill/` is checked in (a git-based plugin install has no build step). It is a **derived artifact**: generated by `npm run sync` (`dev/sync-mirror.mjs`), byte-identity enforced in CI, never edited by hand. Documented as such in `README.md` and `commands/README.md`, which is where the repo's "duplication of knowledge is forbidden by design" rule is stated.
- **`.claude-plugin/` is intentionally absent from `package.json`'s `files` list** (confirmed via `npm pack --dry-run`) — the Claude Code plugin installs through the git-based marketplace (`.claude-plugin/marketplace.json` → `/plugin marketplace add`), never through npm, so it has nothing to do in the npm tarball. `.codex-plugin/` *is* listed even though `bin/install-codex.js` never reads it (that installer only copies `skill/`) — it ships so the manifest is available to a future Codex marketplace-style install path, the Codex analogue of `.claude-plugin/marketplace.json`.

### Evidence base moved inside the skill

- **`docs/sources.md` → `skill/references/sources.md`.** The evidence base now ships with the skill instead of living one directory outside it, so every in-skill citation resolves after installation. `docs/sources.md` remains as a compatibility page (the ~25 historical CHANGELOG links to it keep working), and `dev/validate.mjs` now fails any skill link that escapes the installable tree. All three installers copy `skill/**` recursively, so `references/` actually lands at the target.

### Audit workflow — evidence obligations

- **`skill/audit-project.workflow.js`** — the scoper now inventories non-Rust artifacts by group (manifests, lockfiles, toolchains, configs, CI, scripts, FFI/bindgen/linker), and each unit declares which groups it *must* open: deps/macros gets all of manifests+lockfiles+toolchains+configs+CI+scripts, unsafe/FFI gets build scripts and headers, testing gets CI/config/scripts, semantics gets the project's docs. Units return the exact paths they actually opened (`sourceFilesReviewed`/`artifactsReviewed`/`docsReviewed`) plus their assigned `label`, and the synthesis prompt is told never to infer one unit's coverage from another's evidence.
- **Coverage gating is scoped to what the run owed each unit** — missing scope fields, missing slices, missing per-unit required inputs, unrecognized labels, and dropped agents. It deliberately does **not** gate on a total sweep of every `*.rs` file: units grep for candidates rather than reading the whole tree, so that condition is false on every real crate, and an always-red flag would drown the per-unit gaps that actually invalidate a finding. Source depth is reported instead as "reviewed R of T source files (grep-candidate sampling)".

### Installers hardened

- **Source/destination overlap is now a hard error** in all three installers (`bin/install.js`, `bin/install-codex.js`, `rust-cc-install.ps1`, `rust-cc-install.sh`) for both the skill and the commands directory, checked against canonicalized paths that tolerate not-yet-existing targets. Installing into the repo's own `skill/` used to delete the source mid-copy.
- **Recursive copy** of `skill/**/*.{md,js}` replaces the flat `*.md` sweep plus a one-off `audit-project.workflow.js` line (which the PowerShell installer had been copying twice).

### CI and repository checks — new

- **`.github/workflows/ci.yml`** — the repo had none. Runs on every push and PR: pinned Rust toolchain (1.97.0), Codex-mirror sync check, `dev/validate.mjs`, `dev/validate-fixtures.mjs`, `rustc` compilation of both fixtures, `node --check` on every shipped script, `bash -n` on the shell installers, and `npm pack --dry-run`.
- **`dev/validate.mjs`** — required-file existence; markdown link integrity for both the canonical skill and the mirror, including a check that no skill link escapes the installable tree; the workflow's module list and coverage contract; full Codex-manifest schema validation; version agreement across `package.json`/`.claude-plugin`/`.codex-plugin`; mirror byte-identity; Codex-installer CLI rejection cases; and **duplicate code-pattern trigger rows** — two rows in one `SKILL.md` table keyed off the same set of inline-code tokens are the same rule stated twice, which is exactly how the `x << n` duplicate got in. Table cells are split respecting Markdown's `\|` escape, so a row whose code span itself contains a pipe (`` `std::thread::scope(\|s\| ...)` ``) is compared correctly instead of being truncated. Scope is code-pattern rows only — prose-only trigger cells with no inline code have nothing mechanical to key off and are not covered.
- **`dev/validate-fixtures.mjs` + `examples/fixtures/`** — a two-case calibration seed (§B5 union validity, §B26 runtime shift) with positive and negative controls. Scope is stated honestly in `examples/README.md`: a regression tripwire and a structural check that the cited categories still exist and are still routed — **not** a coverage figure. It deliberately asserts nothing about rule *wording*; pinning prose in CI would make every legitimate rewrite a red build and freeze whichever phrasing shipped first.
- **`dev/set-release-version.mjs`** (manual bump) **+ `dev/check-release-version.mjs`** (CI gate) — a tag is immutable and points at a specific tree, so the version is bumped and committed locally *before* tagging, never rewritten in the runner after the tag exists; `npm-publish.yml` only verifies `${GITHUB_REF_NAME#v}` against the three committed manifests and fails the release on any mismatch. `ci.yml` runs the same check against `package.json`'s current version on every push, so drift is caught before a tag is ever created.
- **`dev/semver.mjs`** — the full SemVer 2.0.0 grammar (semver.org's own regex), shared by the manifest bump/check scripts and `dev/validate.mjs`'s Codex-manifest schema check; rejects leading-zero and empty-identifier forms (`01.2.3`, `1.2.3-alpha.01`, `1.2.3-alpha..1`) that a looser pattern let through, with regression cases for both valid and invalid inputs in `dev/validate.mjs`.
- **`dev/sync-mirror.mjs`** — regenerates (or with `--check`, verifies) the Codex mirror, including removal of files stale after a rename in `skill/`.

## [0.4.7] — 2026-07-09

**Gap-cluster release: five dedicated audits close 25 findings across crypto, FFI/unsafe, deserialization, concurrency, and supply-chain.** Sourced from five parallel gap audits (`docs/reviews/gap-audit-*.md`); each finding was verified still-uncovered against the exact existing bullet text, grounded in a citable primary source, and independently reviewed before merge. **Numbered category count is unchanged (still 58)** — one new lettered sub-category (§B25a) is counted under §B25, exactly as §B18a is under §B18 ("the count is of numbered categories; lettered sub-sections are counted under their parent"). This is a **PATCH** bump: bullets/sub-clauses/documentation plus one lettered sub-category that leaves the numbered count untouched is this repo's established PATCH-shaped event (precedent: §B18a/§C1a shipped PATCH in v0.3.2), and `Major = breaking BANNED/REQUIRED wording tooling depends on` does not apply.

### Crypto & secrets — §B12/§B24 (`docs/reviews/gap-audit-crypto-secrets.md`)

The words "salt", "certificate", and "aud" appeared nowhere in the skill before this release — the three highest-frequency crypto mistakes in LLM-generated web-service code.

- **`skill/security.md` — §B12** gains five bullets:
  - **JWT claims beyond `alg`** — verification that pins the algorithm but leaves `aud`/`iss` at their `None` default authenticates a token minted by the same IdP key for a *different service/tenant*; `jsonwebtoken` checks `aud` only when the token contains one. REQUIRED: `set_audience`/`set_issuer`/`set_required_spec_claims`. Plus a BANNED bullet on `validate_exp = false` / `insecure_disable_signature_validation()` outside `#[cfg(test)]`.
  - **TLS validation bypass** — `danger_accept_invalid_certs(true)`, `danger_accept_invalid_hostnames(true)`, or a no-op `rustls` `ServerCertVerifier`, outside `#[cfg(test)]` → silent full MITM (CWE-295). REQUIRED: pin the internal CA via `tls_certs_only`/`tls_certs_merge` (the current, non-deprecated form). Calibration preserved: a `#[cfg(test)]`-scoped `danger_accept_invalid_certs` is fine.
  - **KDF salt misuse + below-floor parameters** — fixed/hardcoded/per-username salts (identical passwords → identical hashes) and degenerate Argon2/PBKDF2 work factors chosen for test speed, reaching *production* hashing. REQUIRED: per-credential `SaltString::generate(&mut OsRng)` and parameters at/above the OWASP floor, cited as a *living* reference (Argon2id m ≥ 19 MiB/t ≥ 2/p = 1; PBKDF2-HMAC-SHA256 ≥ 600 000 as of citation) so the numbers can be re-verified rather than silently rotting. Calibration: a `#[cfg(test)]`-scoped reduced-cost config is fine.
  - **Zeroize defeated by moves/reallocation** — the derive zeroes only the final location, and Rust moves are `memcpy`, so a returned/moved secret or a realloc'd `String`/`Vec` leaves a live copy. REQUIRED: `Box`/`secrecy::SecretBox` at creation; pre-size secret buffers.
  - **`cargo audit` / RUSTSEC before adding crypto deps** — a maintained, correctly-used crate can carry an open-by-design advisory; `rsa`'s non-constant-time private-key ops are network-observable (Marvin, RUSTSEC-2023-0071). Keep advisory-carrying ops off attacker-timed paths.
- **`skill/security.md` — §B24** widened from "timing of `==`" to "side channels on secret-dependent branches" (title + trap intro): one BANNED bullet (distinguishable decrypt-failure errors — padding vs MAC vs post-decrypt-parse — across a trust boundary are a padding oracle, CWE-208/209) and one REQUIRED bullet (collapse to one opaque error; AEAD crates' `aead::Error` is opaque by design — preserve it). 🔴 across a network boundary, 🟡 logs-only.
- **§C2/§B24 calibration carve-out (internal-consistency fix).** §C2's "carry error context, don't collapse `?`-errors" is good general practice but the *opposite* of correct at a crypto boundary. Added a cross-referenced carve-out both ways: §C2's `#[from]` bullet now states "error context stops at the crypto boundary — see §B24", and §B24's REQUIRED bullet cites the §C2 carve-out back.

### FFI/unsafe boundary — §B5/§B25 + new §B25a (`docs/reviews/gap-audit-ffi-unsafe.md`)

The word "union" appeared nowhere in the skill before this release. **Why §B25a is its own section (the §B18a split test):** §B18a was split from §B18 because "there is no `unsafe` token at the site that decides variance" — a separate failure locus. §B25a passes the same test: §B25 is about the boundary code *you* write (panics, ABI, pointer ownership); §B25a is about a contract of code you did **not** write — whether the C library is thread-safe/reentrant and what it demands of `init`/globals. The reflexive §B18 per-handle `Arc<Mutex<_>>` fix *actively masks* it: two independently-locked handles still race on the library's process-global state — so it is its own 🔴 section, cross-referenced from §B18's body at the point a reader would misapply that fix.

- **`skill/unsafe-and-ffi.md` — new §B25a "The C library's own concurrency contract"** (🔴). BANNED: `unsafe impl Send`/`Sync` for an FFI handle without citing the library's documented thread-safety level; giving a non-reentrant library per-handle locks (the §B18 fix misapplied); reading `last_os_error()`/`errno` after an intervening call. REQUIRED: audit the library's contract first (per-handle thread-safe → §B18 per-handle lock; global-lock-required → one process-global lock or a dedicated owning thread; init-once → `Once`/`OnceLock`); capture `errno` immediately. Grounded in CVE-2020-26235 / RUSTSEC-2020-0071/0159 (`time`/`chrono` `localtime_r`↔`getenv`/`setenv` race, shipped for years).
- **`skill/unsafe-and-ffi.md` — §B25** gains three BANNED and three REQUIRED bullets: **callback/context UAF** (freeing a callback context before unregistration+in-flight-drain is confirmed; reclaiming `user_data` as an owning `Box<F>` in a re-invocable trampoline → UAF+double-free; REQUIRED unregister → drain → free, trampoline **borrows**); **exported entry points trusting the type system** (a `#[no_mangle] extern "C"` fn taking `&T`/`&str`/`bool`/`enum` from the foreign caller → immediate UB on NULL/non-UTF-8/bad-discriminant; REQUIRED take `*const/*mut`+primitives and validate first — the **read-direction mirror** of §B5's validate-before-mint); **per-function ownership audit** (the `// SAFETY:` block states copies/takes/returns-borrowed/returns-owned *with a citation to the C doc line*, since libraries are inconsistent across functions).
- **`skill/unsafe-and-ffi.md` — §B5** gains one BANNED and one REQUIRED bullet on **`union` field reads**: reading a union field without checking the tag/discriminant is instant UB (no active-field tracking); a non-`#[repr(C)]` union for FFI has unspecified offsets. REQUIRED — a tag-checked safe accessor with `// SAFETY:`; and if the union only pairs with a Rust flag, use an `enum`.
- **`skill/audit-project.workflow.js`** — `unsafe-and-ffi.md` category list gains `B25a`. **`skill/SKILL.md`** — §B25 added to the lettered-split parent list, §B25a to the sub-section enumeration, the category→module map, and the 🔴 Enforcement-tiers list.

### Deserialization & parsing DoS — §B7/§B20/§B26 (`docs/reviews/gap-audit-deserialization-dos.md`)

- **`skill/unsafe-and-ffi.md` — §B7** gains a **decompression-bomb** BANNED bullet (🔴 — capping the *compressed* input does not cap the *decompressed* output; `GzDecoder::read_to_end` amplifies ~1 KiB → multi-GiB with no clampable `n`; the `zip` crate's internal `.take(compressed_size)` is active false safety; fix: `.take(MAX+1)` on the *decoder*, CWE-409), a **parser-recursion sub-clause** on the existing depth bullet (serde_json's 128 limit is parse-phase only — re-deserializing an already-built `Value` via `from_value`/`IgnoredAny`/`flatten`/`untagged` bypasses it → uncatchable stack overflow; serde_yaml's alias/anchor recursion was fixed in 0.8.4/RUSTSEC-2018-0005 but the crate is unmaintained; mitigate with `serde_stacker`), and a one-line **`checked_mul`** cross-ref (a wrapping `count * item_size` in release *passes* a size clamp, then the original count OOMs, CWE-190→789; mirrored from §B26).
- **`skill/data-and-types.md` — §B20** extends the existing `flatten` bullet with the **buffer-everything cliff** (`flatten`/tagged enums flip serde from streaming into materialize-the-whole-`Content`-tree — ~2× slower per serde #2363's ~50–86%, allocates the full body, errors lose position; cross-ref §E2) and adds the missing **`deny_unknown_fields`** direction (REQUIRED on untrusted request structs so unknown/typo'd/mass-assignment fields are rejected — the opposite of the existing self-typo warning; OWASP API8:2023) plus **JSON duplicate-key last-wins** (RFC 8259 §4, a parser-differential smuggling vector). Calibration: `flatten` is not banned; `deny_unknown_fields` is REQUIRED only where rejection matters, not on a forward-compatible API.

### Concurrency & admission-control exhaustion — §B14/§B3a/§B13/§B17 (`docs/reviews/gap-audit-concurrency-exhaustion.md`)

Thesis: both concurrency modules are dense on unbounded *data* growth (§B14) and *leaked* resources (§F3/§B21) but blind to unbounded *admission* — object counts, key cardinality, synchronized load.

- **`skill/concurrency-and-state.md` — §B14** gains **unbounded task/connection admission** (🔴 peer-extendable — an accept loop spawning one task per connection with no cap; the task/socket *count* is the resource, CWE-770; fix: `Arc<Semaphore>` + `acquire_owned().await` **before** `tokio::spawn`, permit **moved into** the task — the two LLM-typical wrong fixes are named), **accept-error classification** (🟡 — `?` on `accept()` kills the loop; `warn!;continue` busy-spins on `EMFILE`; classify fatal vs transient-with-backoff, explicitly *not* §B3a's release-and-return), and **insert-only unbounded caches** (🔴 attacker keys — a cache has a consumer so the `Vec`-no-consumer bullet doesn't match; the defect is *no eviction*; bound via `lru`/`moka`, CWE-770/400), plus a warning line on §B13's endorsed per-key `Arc<OnceCell>` map.
- **`skill/async.md` — §B3a** REQUIRED backoff clause amended **in place**: back off exponentially **with jitter** — deterministic backoff synchronizes N instances into thundering-herd waves; add a retry budget when the caller fans out.
- **`skill/concurrency-and-state.md` — §B17** gains a third reentrance flavor (RefCell→panic, tokio Mutex→deadlock, **`RwLock` reentrant read→deadlock** — std's priority policy is OS-dependent, tokio's is documented write-preferring), with an §E4 cross-ref. Bans undisciplined reentrant reads through a hidden call graph, not `RwLock` itself. (The two cache CVEs CVE-2026-33012/CVE-2026-41310 are cited as cross-language *pattern* grounding, not Rust incidents.)

### Supply-chain lifecycle — §A1 (`docs/reviews/gap-audit-supply-chain-build.md`)

§A1 was dense on *which crate name* (slopsquatting, dependency confusion, the malicious-dep build-time-execution vector, the `cargo-deny`/`cargo-vet` mitigation stack) but blind to what happens to a *trusted* dependency's bytes over time.

- **`skill/deps-macros-ergonomics.md` — §A1** gains **yanked-version handling under `--locked`** (🟡 — `cargo build --locked` against a yanked pin warns-not-errors, green in CI for months; REQUIRED `cargo deny check advisories`/`cargo audit -D warnings`, targeted `cargo update -p <crate>` not a blanket `cargo update`), **network access in your own `build.rs`** (🟡 — the **write-direction twin** of the existing read-direction malicious-dependency rule: `curl`/`git clone`/`reqwest` in your build script pulls unpinned bytes outside the lockfile, so `--locked`/`--offline`/`cargo vendor` give zero integrity; REQUIRED vendor or fetch in a separate CI step with a hardcoded SHA-256; local codegen is fine), and **unpinned `[patch]`/git overrides** (🔴 unpinned-HEAD/unnamed fork, 🟡 rev-pinned user-approved patch — a git/`[patch]` override with no `rev` follows HEAD and walks around the registry-keyed `cargo audit`/`vet`/RUSTSEC stack; REQUIRED a full-commit `rev`, an approved repo, a post-flight flag, a removal condition). The incident base is refreshed (`evm-units`/`uniswap-utils`, `finch-rust`/`sha-rust`, the 2026-02 crates.io policy update, TrapDoor) and §A1's proc-macro-trust sentence now cites the serde_derive precompiled-binary episode (2023, reverted v1.0.184).

### Meta (all five clusters)

- **`skill/SKILL.md`** — ~21 phrase-trigger + ~20 code-pattern rows added across the five clusters. **`commands/rust-intel-cc/fix.md`** — 27 routing rows added. **`docs/sources.md`** — five new grounding subsections (crypto, FFI, deserialization, concurrency, supply-chain) plus four refreshed incident entries; every new claim carries a citable source, the two non-Rust CVEs are flagged as cross-language pattern grounding, and the one numeric anchor (serde #2363's ~50–86%, the OWASP floors) is cited as re-verifiable.
- **`package.json` + `.claude-plugin/plugin.json` + `README.md`** — version 0.4.6 → 0.4.7.
- Each of the five clusters was implemented and independently reviewed in isolation, then verified end-to-end for cross-cluster consistency: every `§`-reference across all added lines resolves to a real category; no duplicate trigger/routing rows across clusters; the 58-count invariant and the §B25a threading hold in every location.

## [0.4.6] — 2026-07-07

**§B5 gains the padding-byte info-leak on serialize.** One bullet-pair, no new categories (still **58**), no tier change. The write-direction dual of §B5's existing "validate bytes → `Result` before minting" rule: turning a struct into `&[u8]` by a raw cast copies its inter-field padding, which is uninitialized — reading it is UB (miri flags it) *and* it carries stale memory out of the process (Heartbleed-class disclosure; a §B12 secret-leak when those bytes are sensitive). Compiles and passes `cargo test` because the value round-trips fine locally. Surfaced by miri-assisted LLM audits of real crates (Levin/Shnatsel 2026).

### Changed

- **`skill/unsafe-and-ffi.md` — §B5** gains one BANNED bullet (serializing a padded struct to bytes via a raw cast — `from_raw_parts(&t as *const _ as *const u8, size_of)` / `bytes_of` / `transmute` — across a trust boundary; and the `unsafe impl NoUninit`/`Pod`-to-force-it anti-pattern) and one REQUIRED bullet (derive `bytemuck::NoUninit` / `zerocopy::IntoBytes` and let them reject padded types at compile time — the rejection *is* the leak being caught; else make the layout padding-free with explicit zero-initialized `_pad` fields or serialize field-by-field; `#[repr(packed)]` removes padding but reintroduces the unaligned-access hazard). Calibration: scoped to bytes that cross a trust boundary (network/disk/IPC/log), not every struct-to-bytes.
- **`skill/SKILL.md`** — one code-pattern trigger row (`&t as *const _ as *const u8` + `from_raw_parts`, or `bytes_of`/`transmute` on a struct, written to a socket/file/log → §B5 padding leak).
- **`docs/sources.md`** — one grounding entry: `bytemuck::NoUninit` / `zerocopy::IntoBytes` reject-padding-at-compile-time contracts, CWE-212 (sensitive-info exposure) + CWE-908 (uninitialized resource), and the miri-assisted-audit field observation. Documented-mechanism grounding; no numeric claims.

## [0.4.5] — 2026-06-17

**Distribution: Claude Code plugin marketplace + npm.** Two install paths that need no clone, alongside the existing shell installers.

### Added (distribution)

- **`.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`** — the repo is now a Claude Code plugin *and* its own marketplace. Install: `/plugin marketplace add PHPCraftdream/rust-intel` → `/plugin install rust-intel@rust-intel`. The plugin loads the skill from `./skill/` (single-skill layout — `SKILL.md` frontmatter gains the `name: rust-intel` field so the invocation name survives cache-directory renames) and the commands from `./commands/rust-intel-cc/` under the plugin namespace (`/rust-intel:audit`, `/rust-intel:fix`, `/rust-intel:plan`). Updates flow through `/plugin` — no more uninstall/reinstall. **Release-checklist note:** `plugin.json`'s explicit `version` gates plugin updates — bump it in every release alongside README/CHANGELOG.
- **npm package `rust-intel-cc`** — `npx rust-intel-cc` installs project-locally (`./.claude/`), `--user` for global, `--uninstall` for the inverse; honors `CLAUDE_CONFIG_DIR`. Zero-dependency Node installer (`bin/install.js`) mirroring the shell installers' layout (flat `/rust-cc-*` command names). Package ships `skill/`, `commands/rust-intel-cc/`, both licenses, README, CHANGELOG.
- **`.github/workflows/npm-publish.yml`** — publishes to npm on every `v*` tag with `--provenance`; the package version is derived from the tag at publish time (`npm version "${GITHUB_REF_NAME#v}"`), so `package.json`'s version field can never drift from the release tag. Pipeline sanity-checks (`node --check` both JS files, file-presence asserts) and smoke-tests the installer in a sandbox before publishing. Requires the `NPM_TOKEN` repository secret.
- **`README.md`** — the Install section now leads with the plugin (recommended, auto-updates), then npx, then the shell installers; Layout tree gains `.claude-plugin/`, `bin/install.js`, `package.json`, and the workflow.

**Substitution catalog — a cheaper representation for the same job.** A Tier E appendix in `skill/data-and-types.md`: a write-time lookup table (pattern → cheaper alternative → gate) so the agent can *propose* representation swaps instead of only flagging hazards. No new categories (still **58**), no tier changes — the catalog rides §E2/§E3/§E4 and is bound by §E6's measure-first law.

### Added

- **`skill/data-and-types.md` — Substitution catalog** (after §E3), four groups, ~22 rows: **ownership & allocation** (`Cow` instead of clone, `Arc<T>`/`Arc<str>` for shared immutables, `bytes::Bytes` for zero-copy pipelines, `compact_str`/`smol_str`, `SmallVec`/`arrayvec`/`tinyvec`, `write!`+`itoa`/`ryu` instead of hot `format!`); **lookup & complexity** (hoist to `HashSet`, `VecDeque`, sort-once/`BinaryHeap`, dense-key `Vec`/`slab`/`slotmap` instead of `HashMap<usize,_>`, bitsets, `match`/`phf` for fixed key sets, linear-scan `Vec<(K,V)>` for tiny dynamic maps, `BTreeMap` for range/order, `indexmap` for deterministic iteration — also the honest fix for iteration-order-dependent tests (§D1), `memchr`); **keys & hashing** (the hasher ladder — `FxHashMap` for integer keys, `foldhash` as the balanced string default, `ahash`; `fnv` marked obsolete, `gxhash`/`wyhash` niche behind §A1 + target-CPU; all behind §B16's trust boundary; `Borrow<str>` lookup instead of `get(&key.to_string())`, `entry()` instead of `contains_key`+`insert`); **concurrent maps by access shape** (the three architectural families: sharded locks — `dashmap`; per-bucket/lock-free reads — `scc`, `papaya`/`flurry` behind §A1; read-copy snapshots — `arc-swap`, `evmap`/left-right with the consistency-model gate; ordered concurrent — `crossbeam-skiplist`/`scc::TreeIndex`; plus the "global `Mutex<HashMap>` → first ask §A2/§E4's design question" row). Calibration built in: every row 🟡 under §E6, new crates via §A1, §B2's guard-across-`.await` rule restated for every guard-returning concurrent API, closing "when NOT to substitute" paragraph (cold path, unmeasured win, public-API type = semver event §C1, lost properties).
- **`skill/SKILL.md`** — one phrase-trigger row ("which container should I use", "avoid this clone", "too many allocations", "can this be cheaper", "which concurrent map / hasher" → §E2/§E3/§E4 + catalog).
- **`skill/concurrency-and-state.md` — §E4** gains a pointer to the catalog's concurrent-map selection table and hasher ladder.
- **`docs/sources.md`** — one documented-mechanism entry grounding the catalog's crates (bytes, smallvec, compact_str, slab/slotmap, fixedbitset, phf, memchr, itoa/ryu, indexmap, dashmap, scc, papaya/flurry, evmap/left-right, arc-swap, crossbeam-skiplist) and std's `Borrow<str>`/`entry()` contracts; no numeric claims, per the Tier E precedent.

## [0.4.4] — 2026-06-15

**§D1a gains a fourth shape — the façade fitted to the test.** One bullet, no new categories (still **58**), no new tier. A defect class observed at scale in LLM-generated Rust: where the *circular oracle* (§D1a shape 1) writes the test from the code, the *façade fitted to the test* (new shape 4) writes the code from the test. Given the goal "make this test pass," an agent emits the declaration the test probes (a config key, a header, a status string) and nothing behind it. Unlike shapes 1–3, the test itself is valid — it merely under-specifies the feature, and the model optimizes into the gap (Goodhart on the suite).

### Changed

- **`skill/testing.md` — §D1a** gains shape (4) in the trap intro, one BANNED bullet ("treating a declaration-only test as evidence a behavioral feature works" — with the Grit SHA-256 example), and one REQUIRED clause sharpening the audit-mode counterfactual against this shape: *would a stub that emits exactly the observables this suite checks — and nothing else — still pass?* If yes, the suite specifies a façade, not the feature; ship at least one end-to-end test that **uses** it. Calibration carried in the BANNED bullet: the declaration test itself is fine (§D1's "contract pins are not vacuous" carve-out); *relying on it as behavioral evidence* is the defect.
- **`skill/SKILL.md`** — one phrase-trigger row added ("make this test pass", "implement just enough to pass", "get the suite green", "satisfy these assertions" → §D1a façade).
- **`commands/rust-intel-cc/fix.md`** — one routing row added (a feature's tests are green but using it end-to-end fails or corrupts data; tests only check a config flag/header/status string → §D1a façade).
- **`docs/sources.md`** — new entry in the test-oracle-validity subsection: **Chacon 2026, "Grit"** — narrative field report of a ~360k-LOC LLM-generated Rust reimplementation of Git that reported 41,715 / 42,001 (99.3%) of Git's test suite green while its author publicly stated the build is "not *tested*" and "may even corrupt stuff," with the SHA-256 façade documented in his own words. Observed-pattern grounding (criterion c). Doubles as external corroboration of the spec's central premise that `cargo test` green ≠ correct.
- **`README.md`** — status block for v0.4.4.

## [0.4.3] — 2026-06-15

**Siblings of safe-looking primitives** — three bullets, no new categories (still **58**). Each is a sibling-framed addition to an existing §: a safe-looking primitive has a look-alike that reintroduces the very hazard the primitive removes. The category count, tier list, module headers, `MODULES`/`AUDIT_UNITS`, and lettered-split parent list are all unchanged. Calibrated by an independent review pass: §B9 panic-propagation event corrected (`scope` *returns* via `resume_unwind`, not `Scope::drop`); §B16 REQUIRED gains the untrusted-*pattern* defense (`RegexBuilder::size_limit` + pattern-length cap — stacked counted repetition blows up program size on the linear engine too); `sources.md` no longer overstates `regex` as an "explicit linear-time guarantee" (the doc states `O(m·n)` worst case, with `O(m·n²)` for iterator methods).

### Changed

- **`skill/security.md` — §C2 path-traversal recipe gains a TOCTOU caveat (CWE-367).** The existing recipe (reject `Component::Prefix`/`RootDir`/`ParentDir`; join; `canonicalize` + re-verify `starts_with(base)`) closes the *static* symlink case (a pre-existing link inside `base` pointing out) — but step (3) is not race-free against an attacker who can swap a component between the `canonicalize` and the subsequent `open` (a privileged process operating over an attacker-writable directory). The bullet now names the threat model: when the directory tree is not mutable by an untrusted party during the operation, the static check suffices; when it is, the check + `open` is a TOCTOU, and the race-free answer is component-wise `openat` + `O_NOFOLLOW` (or Linux `openat2(RESOLVE_BENEATH)`) — in Rust, the `cap-std` crate.
- **`skill/concurrency-and-state.md` — §B9 gains `std::thread::scope` (sync mirror of §B21).** Where `tokio::spawn` *detaches* work and loses it (§B21), `std::thread::scope` (stable 1.63) *force-joins* every child on the closing brace. Two silent consequences: (a) a child waiting on a resource the parent only releases *after* the scope deadlocks the closing brace — a non-lock deadlock invisible to §B9 lock-graph analysis; (b) a child panic re-panics the parent on scope drop (documented propagation), skipping any cleanup between the spawn site and the brace. REQUIRED: ensure children are reachable to completion before the brace (close channels / drop senders / signal cancellation *before* the scope ends); inspect each `ScopedJoinHandle::join()` when cleanup must run regardless. 🟡.
- **`skill/data-and-types.md` — §B16 gains ReDoS as the sibling of HashDoS (CWE-1333).** Same "untrusted input × non-linear primitive" shape, different primitive. The `regex` crate is linear by construction (RE2-style automaton; *why* it lacks lookaround/backreferences); LLMs reach for `fancy-regex`/`onig`/`pcre2` to recover those features and reintroduce backtracking — and with it catastrophic backtracking. BANNED: matching untrusted input with a backtracking-engine regex without an enforced input-size cap *and* a hard match timeout; an attacker-controlled *pattern* on any engine without those guards. REQUIRED: keep untrusted input on the `regex` crate; if a backtracking-only feature is genuinely needed, size-cap input and wrap the match in a hard timeout.

### Infrastructure (consistency)

- **`skill/SKILL.md`** — five trigger rows added: two phrase ("open a path from untrusted input" → §C2 TOCTOU; "scoped threads / `std::thread::scope`" → §B9; "lookahead/lookbehind / fancy-regex / onig / pcre2" → §B16), three code-pattern (`canonicalize`+`open` under attacker-mutable dir → §C2; `std::thread::scope` child awaiting parent-controlled resource → §B9; `fancy_regex::Regex::new` / `onig::Regex::new` / `pcre2` on untrusted input → §B16).
- **`commands/rust-intel-cc/fix.md`** — three routing rows added (canonicalize+open TOCTOU → §C2; `thread::scope` hang / cleanup-skipped-by-panic → §B9; worker pinned at 100% CPU on regex match → §B16 ReDoS).
- **`docs/sources.md`** — new "Siblings of safe-looking primitives" subsection grounding §C2 TOCTOU (CWE-367 + `openat`/`openat2`/`cap-std`), §B9 `thread::scope` (std docs: auto-join + panic propagation), §B16 ReDoS (`regex` crate's untrusted-input section + CWE-1333). Documented-mechanism + observed-pattern; no numeric claims.
- **`docs/roadmap.md`** — new "Backlog — confirmed siblings, lower frequency" subsection holds the `tokio::sync::Semaphore` permit-lifecycle sibling (drafted, grounded, frequency too low to ship inline; promote on incident or reviewer flag).
- **`README.md`** — recall-honesty note after the "every category is backed by a source" paragraph: per-rule grounding ≠ measured coverage; an `examples/` regression corpus is the next infrastructure step (roadmap §4). Status block for v0.4.3.

## [0.4.2] — 2026-06-14

**Concurrency / hang / flaky-test patterns** extracted and reviewed from real fixes: two new numbered categories plus three extensions. **56 → 58 categories** (§B3a is a lettered sub-section, counted under §B3; §D4/§D5 are new numbered categories). The two new categories and §B3a ship in the modules' `**The trap**`/`**BANNED**`/`**REQUIRED**` format and are grounded in `docs/sources.md` (the spec's "every category ships with a source" gate). Calibrated by an independent review pass: §B3a now distinguishes a bare `return` (a silent stall when the loop is the sole driver — escalate instead) from the livelock it fixes, and pairs the flag release with an `Acquire` on election (§B13); §B21 qualifies `Weak` (lifetime-coupled tasks) against `AbortHandle`/`CancellationToken` (explicit shutdown); §D1 no longer overstates `start_paused` (a lone interval auto-advances); §D5 drops an ungrounded lazy-handle aside; `fix.md` gains a §B21 "owner's `Drop` never runs" row.

### Added

- **`skill/async.md` — §B3a Coordinator loops need a circuit-breaker on persistent error** (sub-section of §B3): a leader/drain/flush loop that retries a fallible op forever — completing waiters with `Err` but never *exiting* — livelocks on a persistent failure. REQUIRED: release leadership and `return` on a write/sync error so a fresh attempt re-enters from clean state; the leadership flag is released on every exit path, error included. 🟡.
- **`skill/testing.md` — §D4 Filtering test-runner output through `grep`/`head` hides hangs**: the filter silently drops `SLOW`/`TIMEOUT` lines (the only lines naming a hanging test) and, without `set -o pipefail`, masks the runner's non-zero exit so a deadlock reads as green. The `pipefail` foot-gun is generic; the `| grep`-on-every-test-run reflex is the agentic-Rust angle. BANNED: gating "passed" on a filtered live pipe without `pipefail`; raising a timeout to silence `SLOW`/`TIMEOUT`. REQUIRED: gate on the runner directly or tee-to-file-then-grep-the-file; root-cause every `SLOW`/`TIMEOUT` as a deadlock. 🟡.
- **`skill/testing.md` — §D5 Windows: a hung test process wedges the next link (LNK1104)**: a lingering zombie test process holds its own hashed `.exe`, failing the next link step (`LNK1104`) — one flake becomes a build cascade. Framed as CI-hygiene defense-in-depth: the root fix is the hang itself (§D4); REQUIRED on Windows CI is reaping stray `<crate>-<hex>.exe` at run start. 🟡.

### Changed

- **`skill/async.md` — §B2** extended: a `dashmap::DashMap` / `scc::HashMap` `Ref`/`RefMut` held across `.await` is a synchronous per-shard `RwLock` invisible to `clippy::await_holding_lock`; holding it across an init `.await` deadlocks the shard. REQUIRED for async lazy-init in a concurrent map: store `Arc<OnceCell<T>>`, clone out of the map, drop the shard guard before awaiting the initializer. Cross-note added at §B13's `entry().or_insert_with()` endorsement ("synchronous only — see §B2").
- **`skill/async.md` — §B21** extended: a spawned periodic task (timer-driven flush/reaper/sweeper) must hold a `Weak<T>`, not a strong `Arc<T>`, to its owner and exit on `upgrade() == None` — a strong clone inverts RAII. Pair with a `..._exits_on_drop` test.
- **`skill/testing.md` — §D1** extended: for `interval`-driven background tasks under `start_paused`, `advance(period)` once per tick needed (the first tick fires immediately) and `yield_now().await` between advances so the spawned task runs between virtual-time steps.
- **`skill/SKILL.md`** — category count 56 → 58; §B3 added to the lettered-split parent list and §B3a to the sub-section enumeration; category→module map updated (§B3a → `async.md`; §D4/§D5 → `testing.md`); Tier D overview range §D1–§D3 → §D1–§D5; three self-monitoring trigger rows added (DashMap/concurrent-map lazy init + await → §B2; coordinator/leader/flush loop → §B3a; grep/filter test output → §D4).
- **`README.md`** — Tier D spec-architecture range §D1–§D3 → §D1–§D5 (threaded with the SKILL.md change; the recurring "range not propagated to README" gap, caught in review).
- **`docs/sources.md`** — new "Concurrency liveness & test-harness honesty" subsection grounding §B3a (circuit-breaker / bounded retry — Fowler, AWS Builders' Library), §D4 (`pipefail` Bash semantics + `cargo nextest` slow/timeout reporting), and §D5 (MSVC `LNK1104` + Windows image locking). Documented-mechanism + observed-pattern, no numeric claims — on the Tier E/F precedent.

## [0.4.1] — 2026-06-10

**Tier F — Semantic conformance** (new tier, 4 categories) plus two testing additions: **51 → 56 categories**. Defects of *meaning* — code that compiles, passes its own tests and clippy, and implements the wrong thing. Unlike Tiers A–E these are not found by pattern-matching; the reviewer reads the *claim* (spec, README, function name) and checks the code against it counterfactually.

### Added

- **`skill/semantics-and-conformance.md`** — new (10th) theme module holding Tier F:
  - **§F1 Spec / reference conformance** — the code names an external source of truth (RFC, format, "port of X") and diverges from it; both halves of a round-trip can share the same misreading, so self-round-trip is not conformance. BANNED: implementing a named spec from memory; `_ =>` absorbing spec-mandated states; undocumented deviations. REQUIRED: cite the reference at the implementation site, test against external vectors/the reference implementation, enumerate spec states before checking. 🔴 when the divergence affects a wire format, security guarantee, or persisted data; 🟡 otherwise.
  - **§F2 Documented guarantees** — the project's own README/SECURITY.md/design docs state guarantees in prose ("tokens are never logged", "this port is untrusted") and a locally-reasonable diff violates one. The doc, not the call graph, defines the trust boundary; a Tier-F review that cites no project doc has not performed §F2. Same 🔴/🟡 split as §F1.
  - **§F3 Boundary / error-path resource lifecycle** — cleanup reachable from fewer paths than the acquisition (early-`?` leaks), no read deadline on an untrusted peer (connect-then-silence DoS), `Ok(0)`-EOF mishandling, proxy shutdown propagation, per-connection sibling tasks not aborted on every exit. 🟡; 🔴 when the leak is attacker-extendable.
  - **§F4 Round-trip obligations for inverse pairs** — `encode`/`decode`, `parse`/`Display`, `encrypt`/`decrypt` written together but never proven inverse over the domain; one `proptest` round-trip property per pair, shipped in the same change; knows the difference between `decode(encode(x)) == x` and the canonical-form law. 🟡.
- **`skill/testing.md` — §D1a Oracle validity** (sub-section of §D1): the circular oracle (test written from the implementation; snapshot-blessing a new implementation), the world-erasing stub (in-memory transport hiding fragmentation/partial reads), and the missing negative control (a test that passes with the fix reverted is not evidence). The audit-mode counterfactual: *what mutation would this test catch?*
- **`skill/testing.md` — §D3 Test/prod divergence**: `cargo test` runs debug profile, toy sizes, single-task — production runs release, real scale, real concurrency. Release-profile CI run when arithmetic/`debug_assert!` is load-bearing; one boundary-scale test per documented limit; `loom`/stress for concurrency claims. (§B26 owns the debug-vs-release fixes; §D3 is its testing-side enforcement plus the scale and concurrency axes.)
- **`skill/SKILL.md`** — "Tier F — how to review for meaning" stance section (fetch the reference first; reason counterfactually; enumerate, don't sample; read the project's promises as a checklist); 6 phrase-trigger + 7 code-pattern rows for §F1–§F4/§D1a/§D3; conditional 🔴 entries for §F1/§F2 (wire format / security guarantee / persisted data) and §F3 (attacker-extendable); pre-flight grows 7 → 9 (reference claim check; inverse-pair round-trip obligation); category count and map updated (56; §D1 (a), §D3; §F1–§F4 → `semantics-and-conformance.md`).
- **`skill/audit-project.workflow.js`** — 11th audit agent (`semantics`); the scoper now inventories guarantee-bearing docs (`docsFiles`) and extracts a verbatim guarantee/spec-claim digest (`docsDigest`); only the semantics agent receives the digest — §F1/§F2 are unauditable from source alone.
- **`docs/sources.md`** — "Semantic conformance & test-oracle validity" section grounding the new categories on the Tier E precedent (normative/methodological, no numeric claims): RFC test-vector practice (RFC 8439 §2.8.2) for §F1; QuickCheck (ICFP 2000) + the proptest book round-trip for §F4; mutation testing / `cargo-mutants` for §D1a; CWE-404/772/400 + slowloris-class and the std/tokio `Ok(0)`-EOF contracts for §F3; Cargo Book profile defaults + `loom` for §D3; §F2 marked definitional. CRUST-Bench "Used in" extended with the external-oracle premise (§F1/§D1a).

### Changed (conformance pass on the addition itself)

- **`commands/rust-intel-cc/audit.md` — Tier F was invisible to `/rust-cc-audit`** (recurrence of the v0.3.x "Tier D invisible" bug, caught in review this time): the category walk stopped at §E6 and grouping stopped at E. Now walks §A1 → §F4, groups A → … → E → F, carries the Tier F review stance (obtain reference + project docs first, enumerate, report unavailable references), and the Post-flight illustrative list gains the two conditional-🔴 Tier F lines.
- **`commands/rust-intel-cc/fix.md`** — routing table gains six symptom rows: green-on-pre-fix-code → §D1a; works-in-tests-breaks-in-prod → §D3; interop-fails-against-real-peer → §F1; behavior-contradicts-README → §F2; connection/FD leak on error paths / stalled-peer pin → §F3; round-trip corrupts on special characters → §F4.
- **`skill/SKILL.md`** — the fan-out section's theme enumeration now includes semantics/conformance (was missing the 10th theme).
- **`skill/semantics-and-conformance.md`** — header tier-line aligned to the other modules' template ("Derived from SKILL.md → Enforcement tiers (canonical)").
- **`README.md`** — six tiers + Tier F row in the spec-architecture table; Verify range §A1–§F4.

## [0.4.0] — 2026-06-10

Fan-out audit workflow + module header enrichment for agent audit ergonomics. **No category changes** (still **51**).

### Added

- **`skill/audit-project.workflow.js`** — shipped fan-out workflow for auditing a Rust project against the skill. One agent per module (async splits into two: await-discipline vs machinery/cost), with a Prepare phase that slices SKILL.md's trigger tables at runtime (zero knowledge duplication), structured FINDINGS_SCHEMA per agent, and a Synthesize phase that merges into the `/rust-cc-audit` report format with a Post-flight 🔴-summary. Closes G1 (trigger-table slicing), G3 (canonical finding schema), G5 (artifact-vs-process semantics), G6 (async split). Launched via `Workflow({scriptPath: '<skill-dir>/audit-project.workflow.js', args: {target, skillDir}})`.
- **Module headers enriched (all 9 theme modules).** Each module's blockquote header now carries a `Tiers in this module` line (derived from SKILL.md's Enforcement tiers — the canonical source) and an `Audit semantics` line (🔴/🟡/🟢 meaning + artifact-vs-process rule). Closes G2 (tier badges) and G4 (dangling operational references).

### Changed

- **`skill/SKILL.md` — "Running a full pass" section** now points to the shipped `audit-project.workflow.js` instead of telling the reader to "write the equivalent fan-out". `dev/review-modules.workflow.js` (maintainer self-review) reference preserved.
- **`commands/rust-intel-cc/audit.md` — step 4** gains a "Fan-out preferred for broad scope" note directing to the workflow for whole-crate audits (serial walk remains the single-file fallback). Closes G7.
- **Installers** (`rust-cc-install.sh`, `rust-cc-install.ps1`) now copy `audit-project.workflow.js` alongside the `*.md` modules.

## [0.3.3] — 2026-06-10

Accuracy pass — a completeness/correctness audit against the high-level Rust hazard map plus a version-date re-verification against primary sources. **No category changes** (still **51**); these are factual fixes and small clarifications to existing bodies.

### Fixed (factual / dating)

- **`SKILL.md` version pins — `clippy::await_holding_lock` group history.** Previously claimed "warn-by-default (suspicious group) since clippy 1.45". Corrected: introduced in 1.45 (`correctness`, deny), downgraded to `pedantic` (allow) around 1.50, promoted to `suspicious` (warn-by-default) only in **Rust 1.61** — so on a 1.50–1.60 toolchain the bare `cargo clippy` does *not* emit it and the explicit `-W` is required. The present-day "bare clippy emits it" claim was already right; only the dating was wrong.
- **`SKILL.md` MSRV floor `1.84` → `1.85`.** Edition 2024 (which the spec targets) stabilized in **Rust 1.85**; a crate with `edition = "2024"` cannot build on 1.84, so the stated floor was internally contradictory. The strict-provenance API (stable 1.84) is subsumed by the 1.85 floor. The `Vec::into_raw_parts` pin's "MSRV floor is 1.84" line updated to match.
- **§B4a (`drop-and-raii.md`) — `never_type_fallback_flowing_into_unsafe` dating.** Previously "deny-by-default in edition 2024 (Rust 1.92)". Corrected: warn-by-default in all editions since **1.80**, deny-by-default in edition 2024, which stabilized in **Rust 1.85**. "1.92" was phantom precision.
- **§C7 (`deps-macros-ergonomics.md`) — target-specific feature unification.** The "`features = [...]` activates globally, not per-target (cargo#2524)" claim is **resolver v1** behavior. Under resolver v2 (default since edition 2021; the spec targets 2024) target-specific dependency features are not enabled for targets not being built. Now version-qualified and consistent with §C10's v1/v2 split.

### Changed (clarity)

- **§B9 (`concurrency-and-state.md`)** — note that `parking_lot::deadlock::check_deadlock()` requires the `deadlock_detection` cargo feature (the module is absent without it).
- **§B12 (`security.md`)** — flagged that `rust-crypto` (in the API-hallucination example list) is itself unmaintained since 2016 (RUSTSEC-2022-0011) and must never be *proposed*; pointed to the maintained `RustCrypto` crates.
- **§B2 / §B15a (`async.md`)** — trimmed two internal duplications (the `await_holding_lock` blind-spot list; the RPITIT-vs-AFIT desugar explanation) to single statements with back-references.

---

## [0.3.2] — 2026-06-09

Content additions from a study of Microsoft's *Rust Patterns & Engineering How-Tos* training book, filtered hard through the spec's grounding bar (most of the book is either already covered, deliberately out-of-scope because the compiler catches it — e.g. `&` to a `repr(packed)` field is now the hard error `E0793` — or general style that does not clear the "systematic LLM mistake" test). Four additions survived; all are **within-category sub-sections / body expansions**, so the headline count stays **51** (sub-sections are counted under their parent, like §B1a/b, §B4a, §B15a–e).

### Added

- **§C1a — missing `#[non_exhaustive]` on a published API's enums/structs** (`lifetimes-and-api.md`, 🟡). Author-side semver rule: a public enum/struct (especially an **error enum**) in a *published* crate without `#[non_exhaustive]` makes adding a variant/field a major break on consumer CI. Includes the struct-literal-construction cost (ship a constructor) and calibration (published-lib only; not for closed types; not retroactive). Complements the existing consumer-side §B6.
- **§B18a — variance & `PhantomData` soundness in raw-pointer wrappers** (`unsafe-and-ffi.md`, 🔴). Wrong/absent `PhantomData` on a hand-written `*const T`/`*mut T`/`NonNull<T>` type silently picks the wrong variance (covariance where invariance is needed → use-after-free with no `unsafe` at the call site), drop-check, or auto-traits. The hole is in the *type declaration*, not any `unsafe` block, so a per-block `// SAFETY:` (§B5) cannot catch it — hence its own 🔴 check, with `PhantomData`-selection guidance and a `compile_fail`-doctest recommendation.

### Changed

- **§B4 expanded** (`drop-and-raii.md`) with three drop hazards: (1) the **memory-vs-resource fork at process exit** — memory-only `Drop` (a huge tree/map/arena) is wasted work at shutdown and may be skipped via `mem::forget`/`process::exit`, while resource-cleanup `Drop` must still run (resolves the apparent tension with the existing `process::exit`-skips-Drop ban); (2) **recursive auto-`Drop` overflows the stack** on deep self-owning structures (the §B7 DoS shape via the destructor) — write an iterative `Drop`; (3) the **drop-order shutdown deadlock** (a `JoinHandle` joined before its `Sender` closes → `join()` blocks forever) made concrete with the field/local drop-order rule and fix.
- **§B5 gained the unsafe→safe boundary principle** (`unsafe-and-ffi.md`): split invariants into **value-invariants** (runtime-checkable → a total fallible `&[u8] → Result<Typed, _>` constructor that runs *on the bytes before minting the type* and never panics on adversarial input) and **relational invariants** (lifetime/aliasing/provenance/`Send` — not runtime-checkable; the only defense is the upstream `// SAFETY:` proof + correct variance/markers). §B18a is the concrete relational-class special case.
- **`SKILL.md`** — trigger table and code-pattern table gained rows for all four additions; the 🔴 enforcement list gained §B18a; the category→module map now shows §C1 (a) and §B18 (a); the scope note now distinguishes safe-code variance (compile-caught, out of scope) from §B18a unsafe variance soundness (not caught).
- **`docs/sources.md`** — added normative references (the Rustonomicon variance/PhantomData/dropck chapters, the Cargo Book SemVer chapter, the Rust Reference destructors page, the `from_utf8`/`TryFromBytes`/`Pod` constructors) plus the Microsoft RustTraining book for provenance.

---

## [0.3.1] — 2026-05-31

Structural repackaging — **no rule changes, no category changes** (still **51**). The single-file spec was split into a **modular skill**: `SKILL.md` (core — scope, blocking protocol, operating mode, enforcement tiers, the trigger table, version pins, and a new **category→module map**) plus nine theme modules under `skill/` holding the category bodies. Motivation: a single ~50k-token file overloads a reviewing/auditing agent — it loses detail mid-document; per-module files let one agent go deep on one theme.

### Changed

- **Split `rust-intel.md` → `skill/` modules** by theme: `async`, `unsafe-and-ffi`, `concurrency-and-state`, `data-and-types`, `security`, `drop-and-raii`, `deps-macros-ergonomics`, `lifetimes-and-api`, `testing`. Tier (A–E) is now a per-category **label**, not a file. Content is byte-complete — every original content line was verified present in the modules. The single-file `rust-intel.md` is **retired** (kept in git history under `v0.3.0`); cross-references between modules (e.g. `§B22 → §B4`) are navigational by design.
- **`SKILL.md` gained a `category→module map`** (which module holds each §) and a **"Running a full pass"** section: it instructs the agent, for a full audit/review, to **fan out one sub-agent per module** (via the Workflow tool) and synthesize — instead of grinding all ~51 categories in one context. A single trigger or one category match still applies inline.
- **Installers** now copy `skill/*.md` → `<target>/skills/rust-intel/` (the single-file reference is no longer installed); a prior monolithic `SKILL.md` is swept like any prior layout. `install.sh`/`install.ps1` updated and prove-tested; `uninstall.*` unchanged (already removes the whole directory).
- **Docs** — `README.md`, `commands/README.md`, `docs/roadmap.md`, `docs/sources.md` updated for the modular layout.

### Added

- **`dev/review-modules.workflow.js`** — maintainer workflow: one agent per module (all lenses) → synthesis agent. The repeatable, one-command fan-out for reviewing the skill.

---

## [0.3.0] — 2026-05-29

Release 0.3.0 — the first tagged release since 0.2.2, collapsing all interim work (drafted under provisional 0.3.x / 0.4.0 labels and an `[Unreleased]` staging area, none of which were ever tagged on GitHub) into a single version. Net effect since 0.2.2: the taxonomy grew from **26 to 51 categories** across **five tiers (A–E)**. Work batches in this release: a fifth-pass accuracy/content batch, a sixth-pass **usability refactor**, a seventh-pass **final consistency/usability fix pass**, an eighth-pass **corrective pass** (external review — one verified bug, a 🔴-propagation gap, three undisclosed-precondition gaps, meta-layer recalibration), a **Tier E content batch** that opens a new top-level axis (systemic cost / performance) alongside the correctness tiers, and a **discipline-hardening batch** of within-category bullets (vacuous-test ban §D1, workspace version-unification + crate-boundary timing §C10, benchmark-as-regression-guard §E6). The first four batches left the category count unchanged at **44** (no categories added, cut, merged, or renumbered); the Tier E batch raises it to **50** (§E1–§E6) and the tier count from **four** to **five**; the discipline-hardening batch adds bullets only and keeps the count at **50**; the latest **review-driven pass** (external multi-agent review) adds one category (§B29) to bring it to **51**, alongside accuracy fixes, within-category completeness bullets, and anti-dogmatism calibration. Two subsequent verification passes — a second- and a third-review correction batch — fix residual defects, recalibrate a few rules, and add within-category security bullets (OS-command and SQL injection, allocation-size DoS, a Miri/FFI caveat, `cargo-vet`); both keep the count at **51**. Full per-iteration detail is preserved in the sub-sections below.

---

### Iteration: third-review corrections + security bullets

A six-lens internal agent review (correctness, internal consistency, signal-density, fix-precision, anti-zealotry, anti-stupidity) over the 0.3.0 content, cross-checked against three further external reviews (which contributed the SQL-injection, Miri/FFI, and `cargo-vet` items). Every edit is within-category — the count stays at **51**.

#### Fixed (factual)

- **§B17** — `Arc<RefCell<T>>` no longer described as "does not compile": it is `!Send`+`!Sync` (fine single-threaded), so it fails to compile only when *sent across threads* — now matching §A2's correct phrasing.
- **§B18** — `NonNull<T>` removed as a phantom `Send`/`Sync` remedy (it is `!Send`/`!Sync` like the raw pointer and closes no race); the real fix (`Arc<Mutex<RawHandle>>`, or a cited happens-before via `join`) is now the only one offered.
- **§B16** — inconsistent-comparator sort softened from "**panics**" to "**may** panic; in any case yields an unspecified order, never UB" (the std contract); `f64::to_bits` "conflates −0.0/+0.0" corrected to "splits them into two distinct keys" (the verb was backwards — the parenthetical was already right).
- **§B5** — `mem::uninitialized` deprecation date corrected October → November 2019.

#### Fixed (fix-precision)

- **§B4** — panic-in-`Drop` now names `std::thread::panicking()` as the primary guard (skip the fallible work while already unwinding); `catch_unwind` demoted to the secondary, non-panicking-path guard.
- **§C9** — the `spawn_blocking` span-restore fix now notes that `tokio::task_local!` values do **not** cross the `spawn_blocking` boundary, so request context (tenant/auth/request-id) must be captured explicitly before the call — otherwise the closure reads whatever last touched that pool thread.
- **§B13** — the "insert if absent" remedy split into a sync form (`entry` + `&mut`-borrow on `std::HashMap` — the false "bucket lock" claim removed — or a `DashMap` shard lock) and an async form (`OnceCell`-per-key), the latter now primary for the lazy-cache example the category opens with.
- **§B16** — the BANNED manual-`PartialEq`-without-`Hash` bullet scoped to types that actually implement/derive `Hash` or are used as keys (a never-hashed manual `PartialEq` is sound).
- **§B7** — `Box::<[u8]>::new_uninit_slice` flagged as UB on the partial-read pattern (a `read` returning `n < N` leaves an uninit tail that must never be sliced); `vec![0u8; N]` remains the safe form for partial-read buffers.
- **§C2** — the `Path::join` traversal guard rewritten as a sequence (reject a leading `Prefix`/`RootDir` **and** any `..`; join; then `canonicalize` + `starts_with(base)` only on the read path, to defeat symlink escape) rather than "reject `..` *or* canonicalize".

#### Changed (calibration)

- **§B2** — "note each `.lock().unwrap()` inline" relaxed to a codebase-level poison policy, flagged inline only where a cascade is a live concern (the idiom is too common to annotate per call — it was contradicting the inline-flag policy).
- **§B12** — the secret-field-name `Debug` trigger scoped by *role*: a lexer `Token`, a map/cache `key`, a deterministic-PRNG `seed` are not secrets — require a second crypto/auth signal before redacting (mirrors the §B24 `"HS256"` carve-out).
- **§B11** — the "CPU > ~100µs → `spawn_blocking`" line reframed as a judgment (a rough floor, not a trigger to offload every burst); short/frequent bursts → `consume_budget`/`yield_now`, data-parallel → `rayon`.
- **§B13 / 🔴 list** — the 🔴 entry rescoped to the `Relaxed`-publish data race only; the broader check-then-act/TOCTOU body is 🟡 (write-time), now stated in both the 🔴 list and the §B13 Detection note.
- **trigger table / version pins** — the "trait object" row now reads §B15a AFIT/RPITIT with the "not `dyn`-compatible without `async-trait`" risk; the "fifty-one" headline gained a note that §B1/§B4/§B15 split into individually-referenced lettered sub-sections; `Vec::into_raw_parts` (1.93) and match-guard let-chains (1.95) hedged "verify against your pinned toolchain".

#### Added (within-category security bullets — count unchanged)

- **§C2** — **OS command / argument injection**: `Command::new("sh").arg("-c").arg(format!(…))` (RCE) and leading-`-` argument injection; spawn the program directly, insert `--` before positional input, allowlist the executable. Plus phrase + code-pattern triggers.
- **§C2** — **SQL injection**: `sqlx::query(&format!(…))` / `diesel::sql_query(format!(…))`; bind parameters (`$1` + `.bind` / `sqlx::query!` / `QueryBuilder`), allowlist dynamic column/table identifiers. Plus phrase + code-pattern triggers.
- **§B7** — **attacker-controlled allocation size**: `Vec::with_capacity(attacker_n)` / `vec![_; n]` → OOM/abort DoS; clamp before allocating and prefer `Read::take(limit)`. Plus phrase + code-pattern triggers.
- **§B25** — Miri caveat: it interprets Rust, not native code, so a real `extern "C"` call aborts ("can't call foreign function"); point Miri at the Rust side and isolate the foreign call behind `#[cfg(not(miri))]`.
- **§A1** — `cargo-vet` (human-audit attestations) added to the supply-chain defenses alongside `cargo-deny`/`cargo-audit`.

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Iteration: second-review corrections

A second external multi-agent review (max-model, over the 0.3.0 content) verified the prior edits and surfaced a few defects to fix before tagging.

#### Fixed

- **§B26** — `dbg!` removed from the "compiled out in release" list: `debug_assert!`/`debug_assert_eq!` are stripped, but `dbg!` evaluates and prints in release too (a forgotten `dbg!` leaks to stderr) — now noted as the converse trap.
- **§B19** — `mem::replace` corrected: it leaves the *passed-in* value, not a `Default` (only `mem::take`/`Option::take` leave a `Default`); the data-loss hazard is unchanged.
- **README** — spec-architecture table Tier B range `§B1–§B28` → `§B1–§B29` (missed when §B29 landed).

#### Changed (calibration)

- **§A1 build-time** — the "audit any dependency that ships a `build.rs`/proc-macro" mandate narrowed to a *newly-added, non-well-known direct* dependency (the transitive graph is covered by `cargo-deny`/`cargo-audit`/committed `Cargo.lock`/`--locked`, not by hand); the "code you are about to run" aphorism dropped.
- **§B29** — the `Vec::dedup` BANNED bullet reframed from "on an unsorted collection" (hard to prove locally) to "no `sort`/grouping visibly preceding it"; the chunk-size trigger now notes literal sizes are fine.
- **§B16** — the float-sort bullet gained a provably-non-`NaN` exception (`NotNan`/`OrderedFloat`/`Duration`/validated).
- **§C9** — log-injection scoped to plain-text/terminal sinks (a structured/JSON sink is largely immune).

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Review-driven pass — accuracy fixes, completeness (§B29), calibration (external multi-agent review)

An external multi-agent review (technical accuracy, completeness/currency, anti-dogmatism, internal consistency, evidence-base fact-check) drove this batch. One new category (§B29) raises the count **50 → 51**; everything else is within-category bullets, accuracy fixes, and calibration. Shipped as part of release 0.3.0.

#### Added

- **§B29 — Iterator and slice adapter traps** (new Tier B category; count 50 → 51). `zip` truncates to the shorter side (silent data loss); `Vec::dedup` removes only *consecutive* duplicates (not a set); `chunks(0)`/`windows(0)`/`step_by(0)` panic; `collect` into a `HashMap`/`HashSet` silently overwrites duplicate keys (last wins). The highest-frequency LLM surface, previously under-covered.
- **§A1 — build-time supply-chain vector.** A dependency's `build.rs` and proc-macros execute arbitrary code at `cargo build` (before any runtime guard), reading credentials/keys/CI secrets; plus `-`↔`_` typosquats and dependency confusion. Defenses: pin + commit `Cargo.lock`, audit `build.rs`/proc-macro deps, `cargo-deny`/`cargo-audit`, `--locked`/vendored builds.
- **Within-category bullets:** §B4a (edition-2024 `impl Trait` lifetime capture / `+ use<>`), §B16 (`partial_cmp().unwrap()` NaN-panic in float sort → `total_cmp`; inconsistent comparator now panics), §B19 (`mem::take`/`replace`/`Option::take` leave a `Default` on early-return/`?`/panic), §B26 (`debug_assert!`/`dbg!` compiled out in release), §C4 (`BufWriter`/`BufReader` drop-flush discards `io::Result`), §C9 (log/ANSI/control-char injection from untrusted input), §B14 (long sync step inside `FuturesUnordered`/`buffer_unordered` buries siblings → spurious timeout / semaphore self-deadlock).

#### Changed (triggers, counts, calibration)

- Both trigger tables gain a §B29 row (phrase + code-pattern). Counts propagated: "fifty" → "fifty-one", "all 50" → "all 51", "twenty-eight" (Tier B) → "twenty-nine", `(§B1–§B28)` → `(§B1–§B29)`. README spec range `§A1–§D2` → `§A1–§E6` (Tier E was uncovered).
- **Calibration (anti-dogmatism):** §A2/§B2 `Rc`/`RefCell` "forbidden" narrowed (legitimate under `spawn_local`/`LocalSet` and in synchronous single-threaded code; cross-thread misuse is already a compiler error); §B24 trigger narrowed to *secret* operands (no longer flags `algo == "HS256"`) plus a scope note; Post-flight drops the noisy `clippy::expect_used` and annotates `unwrap_used` as hand-triaged; §B26 overflow-checks flagged as a binary-crate lever (libraries use per-site `checked_*`) with softened tone; §B5 strict-provenance scoped to genuine address↔integer round-trips (not a blanket cast replacement); §B3 title `THE BIG ONE` → `invisible in signatures`; §B10 OOM phrasing softened.

#### Fixed (accuracy / evidence base)

- **§C2** — corrected the UNC-path claim: `\\server\share` parses as `[Component::Prefix, Component::RootDir]` (so `has_root()` / `is_absolute()` are `true`, not `false`); the first-component `Prefix`/`RootDir` guard is unchanged and correct.
- **Evidence base (spec intro, §B12, §A1 + `docs/sources.md`):** removed the unverifiable "~57% / CodeQL / crypto-Rust" SafeGenBench figure (the benchmark is multi-language, Semgrep-class, with no Rust track); corrected the Faros "+242.7%" framing (org-level incidents-to-PR at low→high adoption, not AI-vs-human PRs); removed the fabricated Rust-specific scope from the Lightrun "very confident" figure (it concerns AI-generated code in general); `rust_decimal` downloads `~3.5M` → `~100M` (the 3.5M figure was the repo's GitHub star count); supply-chain "~130%" → directional "~70–75% ecosystem-wide, with no crates.io-specific figure published".

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Discipline hardening — vacuous-test ban, workspace boundaries, benchmark-as-guard (bullets within existing categories; count stays 50)

A small follow-on pass integrating three pieces of engineering wisdom *into existing categories* rather than as new ones — keeping the taxonomy at 50 and avoiding bloat. The set was deliberately filtered ("not everything, the important parts, wisely placed"): project-hygiene items such as "keep a changelog" were judged out of scope for a silent-failure spec, "create a `crates/` folder up front / extract everything" was reframed (premature extraction is itself a hazard), and "benchmark everything" was reframed to fit §E6's measure-first discipline rather than contradict it.

#### Added (bullets inside existing categories — count stays 50)

- **§D1 — vacuous tests / coverage theater.** A test asserting a value against its own definition (`assert_eq!(MAX_RETRIES, 3)`), re-checking what the compiler / `std` / a `#[derive]` already guarantees, or exercising a dependency's behavior — inflates coverage and confidence while being structurally unable to fail. The silent twin of the happy-path mock. **Exception:** contract pins (FFI layout/size §B25, wire-protocol constants, serialized golden snapshots §B20) are *not* vacuous — changing them is a breaking change worth catching.
- **§C10 — workspace version unification + crate-boundary timing.** Declare shared deps once in `[workspace.dependencies]` (drifting per-member versions link multiple incompatible copies into one binary); and extract a crate *late, not early* — a premature boundary freezes an unproven API (§C1) and forces the very feature/version coordination §C10 is about, while copy-paste drift across members signals extraction is overdue.
- **§E6 — benchmark as regression-guard.** Lock a measured win with a `criterion` CI benchmark that fails on regression; bench only the paths actually optimized (benching cold/trivial code is its own coverage theater, §D1) — consistent with §E6's measure-first discipline, not "benchmark everything".

#### Changed (triggers)

- Phrase table gains rows → §D1 ("add tests / increase coverage" → test behavior/contracts, not tautologies), §C10 ("extract a crate / new workspace member"), §E6 ("benchmark this / lock in the speedup"). Code-pattern table gains a §D1 row (`assert_eq!(CONST, <literal>)` / `assert!(true)` / setter-then-getter).

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Tier E — Systemic-cost performance block (new content; 44 → 50 categories; four → five tiers)

A new top-level tier — **TIER E — Systemic cost: correct in the small, wrong at scale** (§E1–§E6) — opens a *different axis* from the correctness tiers A–D. This is a reframing of the frontier of failure: as the safe, locally-correct code in a system accumulates, the system breaks **as a whole** — latency, allocation pressure, accidental complexity, lock contention — even though no single line is "wrong". The cost is paid only under load, *outlives* correctness (a passing test on a small input proves nothing about it), and is invisible to `rustc` / `clippy` / `cargo test` exactly the way the Tier B/C/D bugs are. Tier E therefore does not use the BANNED/REQUIRED grammar of the correctness tiers; each law is framed as **where the cost hides / the cheap move / when not to touch it**. Nothing in Tier E is **🔴** (it is entirely 🟡/🟢) — a systemic-cost finding is never a hard blocker — and §E6 (measure-first) is built in specifically to keep the tier from degenerating into over-flagging: only accidental-O(n²) (§E3) and `clippy::perf`-obvious wins are proactive; everything else is profile-gated.

#### Added

- **New tier — TIER E (Systemic cost), §E1–§E6.** Sixth conceptual axis after the meta-layer and A/B/C/D; 🟡/🟢 only; profile-disciplined via §E6.
- **§E1 — Serialism that need not exist.** Independent `.await`s run sequentially → `join!` / `try_join!` / `buffer_unordered` / `JoinSet`; CPU-bound work on the async runtime → `spawn_blocking` / `rayon`.
- **§E2 — Allocation that need not happen.** Reflexive `clone` / `collect` / `format!`; `Vec::with_capacity` for known sizes; `Cow` / `&str` over owned `String`; reuse buffers; `bytes` for shared/zero-copy slices.
- **§E3 — Complexity that compounds.** Accidental O(n²) (the one always-fix case); the wrong container (`HashSet` / `VecDeque` / `SmallVec` / `BTreeMap` / `phf` chosen by access pattern).
- **§E4 — Contention that serializes.** `Arc<Mutex<_>>` on a hot path → atomic / `ArcSwap` / sharding / channel-ownership; shrink the critical section; pick the hasher by trust boundary (fast `FxHashMap` / `foldhash` / `ahash` for trusted keys, DoS-resistant default for untrusted — see §B16); false sharing → `CachePadded`.
- **§E5 — Work already done.** `Regex::new` / parsing repeated per call → `LazyLock` / `OnceLock`; unbuffered I/O → `BufReader` / `BufWriter`; reuse scratch buffers; lazy `tracing` evaluation; `dyn` dispatch in a hot path → generics / enum.
- **§E6 — Measure before you spend.** Profile-first discipline: `cargo flamegraph` / `perf`, `dhat` / `heaptrack`, `tokio-console`, `criterion`. §E3 and the `clippy::perf`-obvious wins are proactive; the rest is profile-gated — do not optimize on a guess.

#### Changed (structural propagation)

- **Category count 44 → 50** and **"four tiers" → "five"** propagated across every place either number is stated: the spec opening ("forty-four categories" and "The categories split into four tiers…" + tier list gains a Tier E line), the Enforcement-tiers preamble ("all 44 categories"), and the README's spec-architecture table (new Tier E row, count to 50).
- **Front-matter `description`** extended so the skill matches performance/scale queries (systemic-cost / latency / allocation / contention), without disturbing the existing correctness-hazard list.
- **Both trigger tables** route performance symptoms to §E*: the phrase table (slow at scale, two sequential `.await`s, too many allocations, lock contention, "faster HashMap", recompiles `Regex`) and the code-pattern table map onto §E1–§E6, with the hasher row split by trust boundary (§E4 + §B16).
- **`commands/rust-intel-cc/audit.md`** — the category walk now iterates §A1 → … → **§E6** and groups findings A → B → C → D → **E**, with an explicit note that Tier E is a different axis (systemic cost, never 🔴) and so never enters the 🔴-only Post-flight summary.
- **`commands/rust-intel-cc/fix.md`** — routing table gains performance rows (slow/high-latency-at-scale, sequential `.await`s, allocation churn, quadratic-at-scale, lock contention, "faster HashMap", `Regex`-in-loop / unbuffered I/O) mapping the symptom shape onto the right §E law, all under §E6 (measure first).
- **`docs/roadmap.md`** and **`docs/sources.md`** — Tier E logged as shipped content; normative performance sources added under §E* (see the sources.md entry in this batch).

This is a **MINOR** change by SemVer (new categories) — shipped in 0.3.0.

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Corrective pass (eighth review pass — external review: one verified bug, a 🔴-propagation gap, three undisclosed-precondition gaps, meta-layer recalibration)

The eighth pass was opened in response to an external review of the frozen spec — so the seventh pass's **"frozen"** verdict is hereby **superseded** (the freeze held for content saturation, not for correctness or for gaps the review surfaced from outside the loop). It found and closed one verified factual error (§C2's path-traversal guard), one propagation gap in the 🔴 list (§B13 lived in the tiers but never reached the operating-mode / audit / fix surfaces that consume it), and three in-scope gaps that were **unstated preconditions of the spec's own remedies** (`catch_unwind` × `panic = "abort"`, `thread_local!` × `.await`, `block_in_place` on a current-thread runtime — each a case where following an existing recommendation silently does nothing or panics unless the precondition is known). It also recalibrated several meta-rituals so that strictness is proportional. No category was added, cut, or renumbered — the count stays **44**; the seventh-pass block below is left intact as a historical record.

#### Fixed (correctness / consistency)

- **§C2 — verified factual error.** The path-traversal guard for `Path::join` was `has_root()`, which lets a bare `\\server\share` through (on Windows that is a `Component::Prefix` with no `RootDir` → `has_root() == false`), even though `join` discards the base anyway. The primary guard is now: reject a leading `Component::Prefix`/`RootDir` component.
- **§B3 — `write_all_buf` reclassified** from "cancel-safe-with-caveat" to cancel-safe (on cancellation the buffer is partially advanced — resume from the remainder).
- **🔴 list de-duplicated and propagated.** §B13 (`Relaxed`-publish) had lived only in "Enforcement tiers": Operating mode step 7 now **references** the canonical list instead of re-listing it; `commands/rust-intel-cc/audit.md` (step 6 and the summary header) likewise reference the canon; the Post-flight summary template in `audit.md` gained a §B13 line; `commands/rust-intel-cc/fix.md` gained a routing row for the atomic-ordering (ARM) symptom → §B13.
- **§B13 trigger-gap closed** — new row in the code-pattern table for `Ordering::Relaxed`-publication.
- **Operating mode step 1 ↔ Blocking protocol** — contradiction over unknown versions resolved ("ask" → "proceed with stated assumptions, ask to confirm"), aligning step 1 with the sixth-pass Blocking protocol.
- **Version pins** — `extern "C-unwind"` marked stable 1.71 (distinct from 1.81 = abort-by-default for plain `extern "C"`); `clippy::await_holding_lock` marked warn-by-default (`suspicious` group, since 1.45) — a manual `-W` is redundant.
- **`README.md`** — "Three tiers plus a meta-layer" → "Four" (a relic from before Tier D). **`docs/roadmap.md`** — the §B15a–e split marked ✅ shipped (sixth pass), the remaining dedup/rebalance separated out. **`CHANGELOG.md`** — removed the duplicated sixth-pass header (this same entry).

#### Added (bullets inside existing categories — count stays 44)

- **§B4 + §B25** — `catch_unwind` is inert under `panic = "abort"` (it catches nothing, and the guard code behind it never runs) and requires `UnwindSafe`; this was an unstated precondition of the spec's own recommendations.
- **§C9** — a `thread_local!` read after `.await` reads another worker's value or the default on a multi-thread runtime (the task can migrate between threads) → use `tokio::task_local!`.
- **§B11** — `spawn_blocking` pool starvation (default 512).
- **§B15c** — `block_in_place` panics on a current-thread runtime.
- **§B16** — HashDoS: for keys from untrusted input, do **not** swap the default `RandomState` for a fixed-seed `FxHashMap`/`fnv`/`ahash`.
- **§B20** — `#[serde(flatten)]` silently disables `deny_unknown_fields` and breaks `u128` / non-string map keys.
- **§B21** — a panic in a detached task (dropped `JoinHandle`) is silently swallowed.
- **§B26** — `saturating_sub` on `usize` (lengths / cursors) masks a logic bug.
- **§B5** — strict-provenance list extended (`map_addr` / `dangling` / `without_provenance`, stable 1.84); `Vec::into_raw_parts` preferred on ≥ 1.93.
- **§B4a** — let-chains have spread to `if let` match-guards (stable 1.95); the one silent-runtime never-type-fallback case is deny-by-default (edition 2024 / 1.92) and out of focus.
- **Version pins** — recent tokio APIs: `biased` in `join!` / `try_join!` (1.46), `SetOnce` (1.47), the coop module (1.44).

#### Changed (calibration / usability — strictness made proportional, no rule removed)

- The "Principle" section was condensed (~13 → 4 lines).
- Operating mode step 3 (text-first for traits) scoped to the public API of a published library.
- Operating mode step 5 (`/// cancel-safe:`) narrowed to functions actually in a cancellation context.
- Enforcement tiers: narrowing `as` stays 🟢 but with a trust-boundary caveat; the canonical "inline-flag policy" is stated once, in 🟡.
- **§A2** — "`Box<T>` for a small `Sized` is almost always wrong" softened (recursion / `Pin` / `dyn` are exceptions).
- **§B7** — the 64 KiB stack threshold moved from BANNED to a guideline (escalate on recursion / deep chains / a reduced stack); "2 MiB on tokio tasks" → "worker thread".
- **§B12** — "mandatory human cryptographer review" reserved for custom / protocol-level crypto.
- **§B16** — the inline flag for a manual `PartialEq`/`Ord` narrowed to non-trivial contracts.
- **§C4** — algorithmic O(n²) (always fix) separated from micro-allocations (profile-gated).
- Trigger table: three duplicated phrase rows merged. Tier A intro: the residual compile-only list collapsed to a pointer.

#### Tooling/docs

- `commands/rust-intel-cc/audit.md`, `commands/rust-intel-cc/fix.md`, `README.md`, `docs/roadmap.md` — see above.

_Shipped as part of release 0.3.0 (2026-05-29)._

---

### Final fix pass (seventh review pass — resolve refactor seams, close one currency gap, then freeze content)

The seventh pass found the content saturated but the sixth-pass refactor had left a few seams (the rebuilt post-flight contradicted leftover "surface every X" tails in category bodies; the closing manifesto still said "every rule is a HARD constraint" against the new tiers; §B26 had been *over*-softened into under-flagging). It also surfaced one genuinely new coverage gap (edition-2024 drop-order changes) and verdict'd that the review loop has hit diminishing returns — this is the last content pass; further signal should come from *using* the spec, not another audit.

#### Fixed (contradictions and one regression)

- **§B26 under-flagging regression.** The refactor had made `overflow-checks = true` the primary defense and gated manual `checked_*` to (a) untrusted boundaries and (b) typed-error-on-wraparound — leaving an ordinary long-lived counter in a project that doesn't set the global flag (the default) and isn't from a trust boundary protected by *nothing* in release. Restored a third case: `checked_*` covers any monotonically accumulating value when `overflow-checks = true` is not guaranteed in the build profile. Routine bounded `i + 1` / `(lo + hi) / 2` remain explicitly out (no return to over-flagging).
- **Post-flight ↔ category bodies contradiction.** The refactor rebuilt the post-flight checklist as "surface ONLY the 🔴 tier", but nine non-🔴 category bodies (§A3, §B1b, §B2, §B8, §B9, §B15a, §B16, §B20, §C5) still ended with "Surface every X **in the post-flight summary**" — pointing into a list that now excludes them. Those nine now say "flag inline (at write time)"; the rule stays, the contradiction is gone. Operating mode step 7 likewise rewritten to "surface the 🔴-tier (canonical list in Enforcement tiers), note the rest inline." The five remaining "in the post-flight summary" mentions are all 🔴 categories, where the reference is correct.
- **Closing manifesto vs Enforcement tiers.** The final "When this command is loaded" section still said "Treat every rule above as a HARD constraint … surface violations as blocking" — a direct contradiction of the just-added tier model. Reworded to: 🔴 are hard constraints (surface always, block per the Blocking protocol); 🟡 applied while writing without per-occurrence reporting; 🟢 owned by clippy.
- **§C5 "surface every clone".** Narrowed to: a `.clone()` introduced *to silence a borrow error* gets an inline one-line justification; routine / `Arc::clone` / `Copy`-type clones are 🟢 (clippy) / 🟡 (write-time), not surfaced — consistent with the tiers.

#### Added (one currency gap; a subsection, not a new category — count stays 44)

- **§B4a — Edition-2024 temporary-scope drop-order changes** (subsection of §B4, like §B1a/§B1b). The spec targets edition 2024 but had not covered edition 2024's own *silent* behavior changes. Two are genuine "compiles, tests green, drop order silently shifted" hazards: the `if let … {} else {}` scrutinee temporary now drops before the `else` block (`if_let_rescope`; the canonical case is an `RwLock` deadlock that 2021 has and 2024 silently fixes — or code relying on the extended temporary lifetime that now drops early), and tail-expression temporaries now drop before the block's locals (`tail_expr_drop_order`, advisory lint with **no autofix**). Pairs with let-chains (1.88). Plus a phrase trigger, a code-pattern trigger, and a version-pins note. (RPIT `use<>` capture, `unsafe extern`, `gen` blocks, static-mut `&raw`, never-type fallback were all evaluated and correctly left out — each is compile-only or deny-by-default, not a silent post-compilation bug.)

#### Changed (usability / dedup)

- **🔴 list de-duplicated.** The ~11-item 🔴 set lived identically in both "Enforcement tiers" and the post-flight checklist. Enforcement tiers is now the single canonical list; the post-flight references it and keeps only the toolchain commands (clippy/miri/test) and optional tools. Removes the fifth duplication surface the refactor had inadvertently created.
- **§C1 blanket-impl 🔴 scoped to published libraries.** Marked 🔴 only for a *published* library's public API (a semver hazard); for bin/internal crates it is not a 🔴 concern.
- **§B13 atomic `Relaxed`-publish promoted to 🔴.** A `Relaxed` store/load used to publish data to another thread is a data race invisible to tooling and to tests on x86 (the dev machine's strong memory model hides it) that breaks on ARM — it fits the 🔴 criteria (invisible to tooling, not caught by tests, silent corruption) better than some items already there.

#### Minor

- **§A2/§B2** — note that a `LazyLock`/`OnceLock` init closure that panics poisons the cell (every later access panics, not just the first); don't panic in lazy init.
- **§B3** — the `/// cancel-safe:` annotation requirement aligned with the softened Operating mode step 5 ("every *non-trivial* async fn").
- **§B8** — `async ||` closures (stable 1.85) added to the list of future-producing forms that are inert until polled.
- **§C1** — fixed a dangling "§B5/T4" cross-reference to "§B5".
- **`commands/rust-intel-cc/audit.md`** — the report-format example aligned to the 🔴-only post-flight (it had still listed `unwrap`/`Arc<Mutex<_>>`/`.lock().unwrap()` counts as mandatory summary lines).
- **`docs/sources.md`** — added the USENIX Security 2025 package-hallucination study (19.7% non-existent packages, 58% repeatable across runs) as a quantified slopsquatting anchor, with an explicit PyPI/npm-not-crates.io caveat.

The trigger table's risk column was reviewed for consolidation but left intact — on inspection each entry carries disambiguation or a memorable code signature rather than a verbatim restatement, so collapsing it would cost navigation nuance for little gain.

With these seams closed, the post-compilation content taxonomy is treated as **frozen**; the next signal comes from running the spec on real code, not from further review passes.

---

### Usability refactor (sixth review pass — "make it easier to apply", not new content)

The sixth pass found the content saturated and accurate, but the document bloated and ritualistic: a 56-bullet post-flight that duplicated category bodies, "everything is a HARD constraint" with no triage, and over-flagging (every `as`, every `+`, every `clone`) that trains the reader to ignore the whole spec. This refactor reorganizes for **applicability** without removing a single rule.

#### Added

- **"Enforcement tiers" section** — the core change. Three tiers tell the reader *how strictly* to act on each category, orthogonally to the A/B/C/D *what-kind-of-bug* tiers: **🔴 surface-always / may block** (~11 high-blast-radius classes: unsafe, crypto, FFI, slopsquatting/new-dep, manual `Send`/`Sync`, async-`Drop`, secret-`==`, unbounded channel, blanket impl, `Pin::new_unchecked`, dropped `JoinHandle`), **🟢 delegate to clippy** (narrowing `as`, `clone_on_copy`/`redundant_clone`, `unexpected_cfgs` — don't hand-check what the linter catches), **🟡 apply while writing** (everything else — write it right, don't spam the summary). Goal: a summary a human reads in ten seconds where every line is worth acting on.

#### Changed

- **Post-flight checklist rebuilt: ~56 bullets → ~11.** Now a flat signature list of only the 🔴-tier occurrences, with the "why/how" left in the category bodies (where it already lived) instead of duplicated. The clippy command gains `-W clippy::arithmetic_side_effects` (see accuracy fix below). All the dropped 🟡-bullets (`as`, `+`/`sum`, `clone`/`to_string`, `sort_unstable`, `pub fn` lifetimes, `RefCell::borrow_mut`, `Path::join`, `read`/`write`, …) **remain as rules in their category bodies** — only the noisy re-surfacing mandate was removed.
- **§B26 over-flagging softened.** `overflow-checks = true` (release profile) is now the *primary* defense; manual `checked_*` is reserved for untrusted boundaries and typed-error-on-wraparound. The BANNED wording no longer reads as "every arithmetic" — it targets values from untrusted input, unbounded growth, or monotonic accumulation; routine `i + 1` / `(lo + hi) / 2` are explicitly out.
- **Operating mode mandates narrowed.** `/// cancel-safe:` annotation is required only for an `async fn` with more than one side-effecting `.await` or one documented to run under `select!`/`timeout` — not every async fn (the old mandate generated noise the spec itself calls ~50% unreliable). "Show the caller" is required only when the returned reference binds more than one input lifetime (the actual §B1a shape), not every `&T`.
- **Blocking protocol narrowed.** Refuse-to-generate is now limited to three cases where the cost of guessing is catastrophic or irreversible: crypto without a threat model (§B12), `unsafe` with caller invariants unstated (§B5), and adding an unnamed/unverified dependency (§A1). Everything else (unknown crate versions, missing trait defs, drop semantics) switches to "proceed with explicitly stated assumptions" — generate the code, flag the assumptions, ask to confirm — instead of blocking the user.
- **§B15 split into labeled subsections** §B15a (AFIT vs RPITIT) / §B15b (Pin, Waker) / §B15c (sync↔async bridging) / §B15d (`Stream` vs `Iterator`) / §B15e (tokio sync/timing primitives), as sub-headings under the unchanged `## §B15` — like the existing §B1a/§B1b. No renumber; every bullet preserved; trigger references point at the sub-anchors where natural.
- **Opening de-duplicated.** The scope thesis ("compiles + tests ≠ correct") and the compile-only-exclusions list were restated 3–5 times across front-matter, the opening, the tier intro, "Principle", and the Tier B intro; each is now stated once canonically. The giant sentence that re-listed all 44 categories in prose was trimmed to a scope line plus a pointer to `docs/sources.md` for the empirical figures.

#### Accuracy fixes folded into the same pass

- **§B26 — `clippy::arithmetic_side_effects` is in the `restriction` group, not `pedantic`.** The text claimed it was pedantic and a "same blind spot as the cast lint"; in fact `-W clippy::pedantic` (which the post-flight runs) catches the lossy-cast lint but **not** integer overflow — you must enable `arithmetic_side_effects` explicitly. Reworded, and the flag added to the post-flight clippy command.
- **§C2 — `Path::join` guard corrected for Windows.** `is_absolute()` is the wrong check: `join` discards the base on `has_root()`, and `/etc/passwd` or `\\server\\share` give `is_absolute() == false` while still dropping the base. Now recommends `has_root()` (or rejecting a leading `RootDir`/`Prefix` component).
- **§B26 — `overflow-checks = true` hot-path caveat.** Noted the global runtime cost (~5–15%, inhibits autovectorization); for numeric hot paths, prefer targeted `checked_*` at the few real overflow sites over the global flag.
- **§B12 — unsourced "~23%" figure removed** (it had no entry in `docs/sources.md`); the documented "~57% of crypto vulnerabilities missed by static analyzers" is kept.

#### Tooling/docs (this pass)

- **`README.md`** — one paragraph distinguishing the A/B/C/D category tiers (what kind of bug) from the 🔴/🟡/🟢 enforcement tiers (how strictly to act). No version/Status/count change.
- **`docs/roadmap.md`** — the rejected `§B18 #[no_std]` draft moved to an explicit "Rejected — out of scope by design" section; the "add ~5 more trigger patterns" item inverted to "consolidate, don't grow"; the per-tier-file split question closed ("one `SKILL.md`; consolidate internally instead"); infrastructure (`examples/` corpus, CI link-checker) promoted to highest-value-next.

---

### Fifth review pass (accuracy + content)

A fifth review pass (empirical, against rustc 1.93 / tokio 1.52.3) found three fresh inaccuracies in the v0.4.0 text, one content gap (integer overflow) that survived the saturation sweep, and a command-file bug that survived all five rounds. Integer overflow was folded into §B26 rather than made a new category.

### Changed (accuracy fixes — regressions from v0.4.0)

- **§B15 — `watch::Receiver` `changed()` claim corrected.** v0.4.0 said `changed().await` "returns immediately the first time" on a fresh receiver. Verified false on tokio 1.52.3: the initial value is marked **seen** at receiver creation, so `changed().await` is *pending until the next `send`* — it does not fire for the initial value. `borrow()`-returns-initial is correct and kept; the loop example now uses `borrow_and_update()`.
- **§B28 — `ß` case-mapping example was backwards.** The length-changing example `ß → ss` was attributed to the wrong direction: `ß` is unchanged by `to_lowercase()` and becomes `SS` under `to_uppercase()`. Corrected to `ß → SS` under `to_uppercase`; the Turkish `İ → i̇` example correctly illustrates `to_lowercase`.
- **§B27 — `Instant::saturating_add` does not exist on stable.** The overflow bullet recommended it; `Instant` has `checked_add` and `saturating_duration_since` but no `saturating_add` (that is a `Duration` method). Reworded to split the two types.

### Added (content — folded into existing categories, no new category, count stays 44)

- **§B26 (renamed "Lossy numeric conversions and integer overflow") — integer overflow + div/rem-by-zero + index OOB.** The headline addition: bare integer `+`/`-`/`*`/`pow`/`sum` on untrusted or accumulating values **panics in debug but silently wraps in release** (`overflow-checks = false` is the release default), so `cargo test` (debug) stays green while the shipped release binary wraps a counter/offset/size through zero — the most dangerous debug-vs-release divergence in the language, caught by no default lint. Plus `a / b` / `a % b` panic on a zero divisor (debug *and* release), and `slice[i]`/`split_at` panic on an untrusted out-of-bounds index. REQUIRED: `checked_*`/`saturating_*`/`wrapping_*`, `overflow-checks = true` for prod release builds, `slice.get(..)`.
- **§C4 — partial `Read`/`Write`.** A single `read`/`write` may transfer fewer bytes than requested even without EOF (sockets, pipes); use `read_exact`/`write_all`/`read_to_end` or loop.
- **§C2 — `Path::join` with an absolute segment.** `base.join(untrusted)` silently discards `base` if the segment is absolute — a path-traversal hazard; validate with `Path::is_absolute` / reject `..` / canonicalize-and-check.

### Changed (self-monitoring + checklist)

- Trigger table extended (+4 phrase, +5 code-pattern) for integer overflow, div-by-zero, partial read/write, and `Path::join`. Post-flight checklist gains the matching surface-able items. Version-pins note added: integer-overflow behavior is not version-gated (`checked_*` etc. stable since 1.0).

### Fixed (command files)

- **`commands/rust-intel-cc/audit.md` — Tier D was invisible to `/rust-cc-audit`.** The category-walk said "iterate from §A1 through the final **§C** category" and grouped findings "by tier (A → B → **C**)", silently skipping Tier D (§D1, §D2), which has existed since v0.3.0. This is the audit-command analog of the README "§A1–§C11" bug fixed in v0.3.2 — it survived all five review rounds. Now walks through §D2 and groups A → B → C → D.
- **`commands/rust-intel-cc/fix.md`** — routing table extended with rows for §B26 (overflow / lossy cast / div-by-zero), §B27 (duration looks wrong / `.elapsed().unwrap()` panic), §B28 (`byte index not a char boundary` panic / mid-character truncation).
- **`README.md`** — stale Layout comment for `roadmap.md` ("Planned commands and category expansions" → "Roadmap: open directions and structural notes").

_Shipped as part of release 0.3.0 (2026-05-29)._

The post-compilation taxonomy is now near-saturated under the spec's scope. See [`docs/roadmap.md`](docs/roadmap.md) for the remaining work, which is now mostly **infrastructure** rather than content: an `examples/` regression corpus (deliberately-broken Rust per category, run through `/rust-cc-audit`), CI markdown/link checking, and the still-open structural question of splitting the overloaded §B15.

### Iteration: std-primitives coverage (drafted as 0.4.0)

Content release. Closes the last systematically-missed gap under the spec's scope — everyday **`std` primitives that compile, pass ASCII/small-number tests, and break in production** — with three new Tier B categories plus a batch of bullet-level additions to existing ones. A fourth review pass found v0.3.2 itself clean (zero regressions — the first patch in the project's history to introduce no new bugs), so this release is purely additive. **Category count 41 → 44.** No renumber of existing categories; slash commands and install/uninstall behavior unchanged. Re-run the installer.

### Added (new Tier B categories)

- **§B26. Lossy numeric conversions.** `as`-casts silently truncate, wrap, or saturate with no panic and no default warning (`clippy::cast_possible_truncation` is pedantic / off-by-default). Covers narrowing/sign-changing integer casts (`u64 as u32`, `len() as u32`), the `usize`-is-32-bit-on-wasm32 trap, and float→int saturation (since Rust 1.45: `300.0_f32 as u8 == 255`, `NaN as i32 == 0`). REQUIRED: `try_from` for narrowing; explicit range checks before float→int. This is the backing rule for the long-orphaned `as`-cast line in the post-flight checklist.

- **§B27. Wall-clock vs monotonic time.** Measuring durations/timeouts with non-monotonic wall-clock time (`SystemTime::now()`, `Utc::now()`) breaks when the clock steps (NTP, DST, manual change); `.elapsed().unwrap()` / `.duration_since().unwrap()` panic in production on a backwards step because both return `Result` for exactly that reason. REQUIRED: `Instant::now()` for all durations/deadlines/benchmarks; `SystemTime` only for absolute timestamps; handle the `Err` or use `saturating_duration_since`.

- **§B28. UTF-8 and string-boundary hazards.** String ops that are correct on ASCII and panic or corrupt on non-ASCII: `&s[a..b]` with computed indices panics on a non-char-boundary (`&"café"[0..4]`), `s.len()` (bytes) conflated with character count, `to_lowercase`/`to_uppercase` (full Unicode, can change length) used for ASCII protocol comparisons. REQUIRED: `s.get(a..b)` / `char_indices` / `chars().take(n)`; `unicode-segmentation` for graphemes; `eq_ignore_ascii_case` for protocol strings.

### Added (bullet-level, existing categories)

The eight items previously parked in the roadmap's v0.4.0 backlog, plus four medium-priority finds from the fourth review pass, shipped into existing categories:

- **§A2** — `Box::leak(Box::new(...))` for globals (leaks on every re-init path; use `OnceLock`/`LazyLock`, stable ≥ 1.80); `RefCell` where `Cell` suffices for `Copy`/replace-whole interiors (avoids the §B17 `BorrowMutError` panic surface).
- **§B4** — `mem::forget`/`ManuallyDrop` without a manual drop silently disables RAII (fd/connection/lock never released) — the §C5 reflexive-`.clone()` reflex applied to `Drop`.
- **§B7** — unbounded recursion **depth** over untrusted input (recursive-descent parser, tree/JSON walk) overflows the stack, which is `SIGSEGV`/abort — *not* a catchable panic, so a clean DoS vector. (Distinct from the existing frame-size trap.) REQUIRED: explicit depth limit or iterative rewrite.
- **§B14** — `FuturesUnordered`/`JoinSet` grown unbounded (same hazard as an unbounded channel), and an empty `FuturesUnordered` in a `select!` arm returns `Poll::Ready(None)` immediately → 100% CPU busy-loop.
- **§B15** — `watch::Receiver::borrow()` returns the **initial** value before any `send`, and the first `changed().await` returns immediately; use `borrow_and_update()` to avoid re-processing.
- **§B16** — `sort_unstable*` when the relative order of equal elements matters silently breaks a multi-key sort's secondary order; use stable `sort`/`sort_by_key` when the tie-break is load-bearing.
- **§B20** — deserializing a large integer (snowflake ID, ns timestamp, `u64` > 2^53) into an `f64` field or via `Value::as_f64()` silently loses precision (53-bit mantissa).
- **§C2** — `env::var("X").unwrap()` panics both on a missing var and on a non-UTF8 value (common on Windows); use `var_os` / handle `VarError::NotPresent`.
- **§C4** — `Vec::remove(0)`/`insert(0, _)`/`contains` in a loop is O(n²) (use `VecDeque`/`swap_remove`/`HashSet`); `{:?}` on `&[u8]`/`Vec<u8>` prints a decimal array, not hex (use `hex::encode` for non-secret bytes).
- **§C9** — logging PII (email, name, phone, address, government ID, card, IP) through `Debug`/`tracing` is a compliance leak (GDPR/PCI) distinct from §B12's crypto-secret coverage; classify and redact PII fields.

### Changed (wording accuracy)

- **§B15 — `Notify` pattern wording corrected.** v0.3.2's comment said `.enable()` "registers the waker"; per tokio's docs `enable()` does not register the task `Waker` (that happens at poll/await) — it *arms the future for wakeups* by adding it to the notify list. Reworded to "arms the wakeup"; the code and its load-bearing-`.enable()`-before-the-check semantics are unchanged.

### Changed (self-monitoring + checklist)

- **Trigger table** extended for every new rule: +8 phrase triggers (numeric cast, time measurement, substring/case, global/singleton, large JSON id, env var, sort-by, recursive parser) and +10 code-pattern triggers (`as`-narrowing, `SystemTime` duration, `&s[..]`/`len()`-as-chars, `Box::leak`, `mem::forget`, `FuturesUnordered`, `watch::channel`, `Vec` front-mutation, `{:?}`-on-bytes, `sort_unstable*`).
- **Post-flight checklist** gains surface-able items for the new categories and bullets (narrowing casts, `SystemTime`-for-duration, computed `&s[..]`, `Box::leak`, `mem::forget`, unbounded `FuturesUnordered`, `env::var().unwrap()`, `sort_unstable*`, `Vec` front-mutation, depth-unbounded recursion, PII-through-`Debug`).
- **Version pins** — float→int saturating cast pinned to Rust 1.45; `LazyLock` to 1.80 (alongside `OnceLock`).

### Tooling and documentation

- **`README.md`** — Status block gains a v0.4.0 entry (v0.3.2 preserved; v0.3.0 condensed to a one-line scope-reframe reference). Spec-architecture table Tier B range `§B1–§B25` → `§B1–§B28`. Category count updated to 44.
- **`docs/roadmap.md`** — the "Deferred to v0.4.0" backlog is now "Shipped in v0.4.0" with each item mapped to its landing category; the §B15-split and section-rebalance notes remain open as structural work; a saturation note redirects future effort to infrastructure.
- **`docs/sources.md`** — normative-source entries added for the three new categories (Rust Reference on `as`-cast semantics, `std::time` on monotonic vs wall-clock, `str` UTF-8 docs).
- **`CHANGELOG.md`** — the v0.3.2 line-endings note was corrected (it claimed the working tree was renormalized to LF; in fact only the index is LF-canonical, the Windows working copy stays CRLF by design under `eol=lf`).

### Migration

Re-run the installer. The skill grew by three categories and ~a dozen bullets; nothing was renumbered or removed, so any reference to §A1–§D2 or §B1–§B25 remains valid (§B26–§B28 are new). Slash commands and scripts are unchanged.

### Iteration: accuracy patch (drafted as 0.3.2)

Same-day patch on top of v0.3.1. Fixes three bugs **introduced by v0.3.1 itself** (a third review pass caught them), corrects an internal category count, catches the trigger table up to the v0.3.1 rules, and adds four bullet-level pitfalls under the existing scope. **No new categories** — total stays at 41. **No renumber.** Re-run the installer; nothing else changes.

### Changed (accuracy fixes — all regressions from v0.3.1)

- **§B15 — the `Notify` lost-wakeup pattern was missing its load-bearing `.enable()`.** v0.3.1 added a bullet whose example (`let permit = notify.notified(); pin!(permit); if !condition() { permit.await; }`) registered the waker only at `.await` — *after* the condition check — leaving the exact race the bullet claimed to close. Per tokio's docs, a `Notified` future does not receive wakeups until it is polled or explicitly armed. The corrected pattern arms the waker with `notified.as_mut().enable();` between `pin!` and the check, so a `notify_one()` landing between check and await is not lost. Variable renamed `permit` → `notified` (it is a `Notified` future, not a semaphore permit).

- **§B11 + Version pins — `tokio::task::coop::consume_budget` was pinned to the wrong version.** v0.3.1 claimed the `coop::` path was stable since tokio 1.39.1. In fact the *function* is stable since 1.39.1 at `tokio::task::consume_budget`; the `tokio::task::coop` module did not exist until **tokio 1.44.0**, which is also when the old path became `#[deprecated]`. Both §B11 and the Version-pins section now give the correct dual path keyed on MSRV (`tokio::task::consume_budget` below 1.44, `tokio::task::coop::consume_budget` on 1.44+).

- **§C2 — the `thiserror` `#[from]` bullet was both inaccurate and out-of-scope; reframed.** v0.3.1 claimed two interconvertible `#[from]` variants make `?` "silently prefer" one impl. That is wrong: two `#[from]` on the same source type is a hard `E0119` compile error, not a silent preference — and a compile error is out of scope for this spec by design. The bullet is reframed onto a genuinely in-scope hazard: **reflexive `#[from]` erases call-site context** — `#[from] io::Error` collapses every `?` on an I/O operation into one variant, so production logs say "I/O error" with no indication of *which* operation failed. Compiles, tests pass, diagnostics rot. Fix: reserve `#[from]` for source types that already uniquely identify the failure; otherwise carry context with `#[source]` + explicit `.map_err(...)` per call site.

### Changed (minor wording)

- **§B8 — `tokio::sync::oneshot::Receiver` has no `.recv()` method.** The bullet's variable was named `recv`, falsely implying a `.recv()` call (which `mpsc::Receiver` has, but `oneshot::Receiver` does not — it *is* a `Future`, awaited directly). Renamed to `rx` and added a parenthetical noting the receiver is awaited directly.

- **§B15 — `block_in_place` was loosely called a "sync-to-async bridge".** It is the opposite: it lets an async task run *blocking* code on the current worker without starving siblings; you still cannot `.await` inside it without a `Handle`. Reworded to distinguish it from `spawn_blocking` and from a sync→async bridge.

- **§B-tier intro — "twenty-four categories" → "twenty-five".** §B1–§B25 is twenty-five categories; the prose count had not been updated when v0.3.0 added §B16–§B25.

### Changed (trigger table caught up to v0.3.1)

v0.3.1 added rules but no triggers for them, so the self-monitoring layer never surfaced them proactively. Added:

- **Phrase triggers** (5): `interval`/periodic/timer → §B15; exit/bail-out → §B4; wait-for-signal/condition-variable → §B15 (`Notify`); log-this-struct/derive-Debug on secret-bearing types → §B12; compare-floats/approximately-equal → §D1.
- **Code-pattern triggers** (8): `std::process::exit` below a live guard → §B4; `Arc::strong_count`/`Rc::strong_count` in a conditional → §B13; `assert_eq!` with an `f32`/`f64` operand → §D1; `notify.notified()` → §B15; `#[derive(Debug)]` on a struct with a `password`/`secret`/`token`/`key`/`seed` field → §B12; `impl Drop` whose body can panic → §B4; `tokio::time::interval(...)` → §B15; `oneshot::channel()` with the result discarded/`.unwrap()`-ed → §B8.

### Added (bullet-level, no new categories)

- **§B15 — `tokio::time::interval` first-tick semantics.** The first `.tick().await` returns immediately (at creation), not after one period; the default `MissedTickBehavior::Burst` fires missed ticks back-to-back to "catch up", producing a load spike. REQUIRED: discard the first tick or use `interval_at(Instant::now() + period, period)`, and set `MissedTickBehavior::Delay`/`Skip` explicitly.

- **§B13 — atomic memory ordering.** `Ordering::Relaxed` on an atomic used to *publish* data establishes no happens-before edge — the reader can observe the flag before the payload writes, a data race that x86's strong model hides in tests but that breaks on ARM/AArch64. Use `Release`/`Acquire` (or `AcqRel`/`SeqCst` for RMW) when the atomic gates other memory; `Relaxed` only for standalone counters; don't blanket-`SeqCst`; model-check with `loom`.

- **§B14 — `broadcast::RecvError::Lagged(n)` is data loss, not a transient error.** `Lagged(n)` means `n` messages are gone forever and the receiver has skipped to the oldest still-buffered one; a `match { Err(Lagged(_)) => continue }` loop recovers nothing and masks the loss. Log/metric the skipped count and decide explicitly whether dropping is acceptable.

- **§D1 — tests against fiction.** Three blind-test antipatterns: a mock/fake that only ever returns success (proves behavior against fiction, never against the dependency's real failure modes); `#[ignore]` left on "temporarily" (invisible to `cargo test`, rots silently while CI stays green); tests sharing mutable global state (static cell, fixed-name temp file, hard-coded port) that pass only by run order and flake under `cargo test`'s default parallelism.

### Tooling and documentation

- **`README.md`** — Status block gains a v0.3.2 entry (the v0.3.0 entry is preserved below it for the scope-reframe context). The "Verify" section's category range corrected from `§A1–§C11` to `§A1–§D2` so Tier D is visible.
- **`docs/roadmap.md`** — new "Deferred to v0.4.0" subsection listing the bullet-level additions surfaced by the third review pass (`env::var`, `Box::leak`, `mem::forget`, `serde_json` fidelity, `watch::Receiver`, `FuturesUnordered`, `{:?}`-on-bytes, `Cell` vs `RefCell`) plus structural notes (possible §B15 split, section-length rebalancing).
- **`rust-intel.md`** — re-confirmed LF-canonical in the index (the committed blob is LF); the Windows working copy stays CRLF by design under `* text=auto eol=lf`, and git no longer warns because the canonical eol is explicit. (No content change — this corrects the wording of the original v0.3.2 note; nothing was actually re-converted.)

### Migration

Re-run the installer. The skill content changed (three corrections, two wording fixes, a count fix, twelve new trigger rows, four new bullets); slash commands and install/uninstall behavior are unchanged.

If you copied the v0.3.1 §B15 `Notify` pattern into your code, re-copy it — the v0.3.1 version had a real lost-wakeup race (missing `.enable()`). If you pinned tokio between 1.39.1 and 1.43 and used the `tokio::task::coop::consume_budget` path the v0.3.1 text suggested, switch to `tokio::task::consume_budget` (the `coop` module only exists from 1.44).

### Iteration: accuracy patch + category extensions (drafted as 0.3.1)

Same-day patch on top of v0.3.0. Five accuracy bugs in the v0.3.0 text fixed, seven existing categories extended with bullets covering pitfalls under the spec's stated scope (compiles + tests pass but still breaks). **No new categories** — total stays at 41. **No renumber.** Anyone running v0.3.0 re-runs the installer; nothing else changes.

### Changed (accuracy fixes)

- **§B23 — `tokio::sync::mpsc::Sender::send` is NOT cancel-safe in `select!`.** v0.3.0 text claimed it was; per tokio's own documentation, when `send` is cancelled in a `select!` arm, the message is **dropped and lost**. The two-step `Sender::reserve().await` → `Permit::send(value)` is the canonical cancel-safe pattern (reserve acquires capacity asynchronously and is cancel-safe; the synchronous `Permit::send` cannot fail at that point). Section rewritten to remove the false claim and document the correct pattern.

- **§B25 — `cargo expand --type-sizes` does not exist.** v0.3.0 text recommended this fictional invocation for FFI layout verification. `cargo expand` is a third-party macro-expansion plugin with no such flag. Replaced with the real nightly tool `cargo +nightly rustc --lib -- -Zprint-type-sizes` plus a stable-toolchain fallback using `std::mem::size_of`, `std::mem::align_of`, and `std::mem::offset_of!` in a unit test asserted against expected C-side values.

- **§B11 + Version pins — `tokio::task::consume_budget` path is deprecated.** The canonical location is `tokio::task::coop::consume_budget`; the older `tokio::task::consume_budget` re-export is now `#[deprecated]`. Spec text and version pins updated. Stable since **tokio 1.39.1** (1.39.0 was yanked).

- **§B24 — `subtle::ConstantTimeEq::ct_eq` returns `Choice`, not `bool`.** v0.3.0 phrasing "`x.ct_eq(&y).into()` returns `bool`" was technically correct but invited readers to write `if x.ct_eq(&y) { ... }` (which does not compile). Reworded to be explicit: `ct_eq` returns `subtle::Choice` and must be converted via `bool::from(choice)` or `choice.into()`. Also flagged: never branch directly on `Choice` — the whole point is to keep the comparison branch-free until the explicit conversion.

- **§C11 — C-DEREF citation made verbatim.** v0.3.0 paraphrased the API Guideline; the rest of the spec uses literal quotes. Now uses the verbatim form: *"Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). The traits should be used only for that purpose."*

### Changed (category extensions, no new categories)

- **§B12 (Crypto) — Debug leakage, JWT `alg: none`, AEAD nonce width, key zeroization.** New BANNED bullets cover `#[derive(Debug)]` on structs with `password`/`secret`/`token`/`api_key`/`private_key`/`seed`/`mnemonic`/`cookie` fields (printed by `{:?}` in logs); JWT verification that accepts `alg: none` (always pin allowed algorithms explicitly); AEAD encryption with a nonce length other than the algorithm's specified width (96 bits / 12 bytes for AES-GCM and ChaCha20-Poly1305). New REQUIRED bullet covers `zeroize` discipline (`#[derive(Zeroize, ZeroizeOnDrop)]`) for key material.

- **§C2 (Error handling) — `Box<dyn Error>` in libraries, ambiguous `#[from]`.** New BANNED bullets cover `Result<T, Box<dyn Error>>` as the return type of any `pub fn` in a published library crate (callers can't match), and `thiserror::Error` enums with two or more `#[from]` variants over interconvertible source types (the `?` operator's resolution becomes ambiguous).

- **§D1 (Tests by luck) — floating-point exact equality.** New BANNED bullet: `assert_eq!` on computed `f32`/`f64` values flakes between debug/release, architectures, and compiler versions. Use `approx::assert_relative_eq!` / `assert_abs_diff_eq!` or manual epsilon comparison.

- **§B4 (Drop and RAII) — `process::exit` skips Drop, panic-in-Drop.** New BANNED bullets: `std::process::exit(...)` from code paths with stack-local guards (transactions, file handles, lock guards) — `process::exit` does not unwind; `Drop::drop` body that can itself panic during a panic unwind (double-panic aborts the process). Cross-link added pointing to §B22 for the async cleanup constraint.

- **§B8 (Silent task dropping) — `oneshot` channel drop cascades.** New BANNED bullets: `let _ = tx.send(value);` on a `tokio::sync::oneshot::Sender` (discarding the `Err(value)` when the receiver is gone makes the producer's work invisible), and `recv.await.unwrap()` on a `oneshot::Receiver` when the producer can fail or be dropped. Cross-link added pointing to §B21 for the work-runs-but-can't-be-observed case.

- **§B15 (Advanced async) — `Notify` lost-wakeup, half-consumed `Stream`, `select! biased`.** Three new BANNED bullets: `notify.notified().await` without first checking the represented condition (the canonical fix is the `notified() → pin! → check → await` four-step); dropping a half-consumed `Stream` without explicit acknowledgement that buffered items are lost; `tokio::select! { ... }` without `biased;` when arm priority matters (default per-poll pseudo-random can starve a low-priority arm). One REQUIRED bullet: use `biased;` for deterministic left-to-right arm priority.

- **§B13 (TOCTOU) — `Arc` count races, HashMap iter order.** New BANNED bullets: `if Arc::strong_count(&arc) == 1 { ... }` is a TOCTOU race — use `Arc::into_inner(arc)` (returns `Option<T>`) or `Arc::try_unwrap(arc)`. Restated that the same TOCTOU pattern via `HashMap::iter` + `HashMap::insert` is broken. New REQUIRED bullet: for ordered iteration, use `BTreeMap` or collect-then-sort — `HashMap::iter` order is randomized per-process and per-rehash, and tests that depend on it flake across machines.

### Changed (cross-links between overlapping categories)

- **§B17 ↔ §A2** — opening of §B17 now explicitly states it covers the single-threaded reentrant-borrow hazard, while §A2 covers the thread-safety dimension. Same `Rc<RefCell<T>>` symptom, different failure modes.
- **§B21 ↔ §B8** — opening of §B21 now distinguishes "future never polled" (§B8) from "work ran but you can't cancel/observe" (§B21).
- **§B22 ↔ §B4** — opening of §B22 now points to §B4 for sync RAII contracts and frames §B22 as "what is **not** possible with Drop in async".
- **§B23 ↔ §B3** — opening of §B23 now states explicitly that it is the `select!`-specific application of §B3's general cancel-safety rule.

### Changed (front-matter)

- **`description` extended with hazard-area triggers.** Added a closing sentence: "Covers async, unsafe, FFI, concurrency, crypto, supply-chain, and tests-that-pass-by-luck hazards." This improves Claude Code's skill matching on user queries that name the hazard area rather than the failure mode.

### Tooling and documentation

- **`README.md` Layout** — `.gitattributes` and `.gitignore` now appear in the repository diagram with one-line descriptions. Both are functionally significant (line-ending discipline, project-local install target ignored) and were previously invisible from the docs.
- **`docs/roadmap.md`** — Tier D (§D1, §D2) is now flagged `✅ shipped in v0.3.0`. The category-expansions section previously listed only `§B16`/`§B17`/`§C8`/`§C9` shipments and silently omitted the new tier.
- **`commands/rust-intel-cc/fix.md`** — routing table extended with 15 new rows mapping symptoms for §B16–§B25, §C8–§C11, §D1, §D2. The table is still declared "non-exhaustive", but the most common symptoms now route correctly.
- **`.gitattributes`** — deduplication pass. Removed seven explicit `text eol=lf` rules for `*.md`, `*.rs`, `*.toml`, `*.lock`, `*.json`, `*.yml`, `*.yaml` since they are already covered by `* text=auto eol=lf`. Kept the necessary overrides: `*.sh`/`*.bash` → LF; `*.ps1`/`*.bat`/`*.cmd` → CRLF. Binary-section comment block tightened.
- **`rust-intel.md`** — working-tree line endings renormalized to LF (the v0.3.0 commit landed with `i/lf w/crlf`, which would have re-triggered the CRLF warning on the next edit). Now `i/lf w/crlf attr/text=auto eol=lf` — git no longer warns because the canonical eol is explicit.

### Migration

Re-run the installer. The skill content changed (eight new BANNED bullets, several technical corrections, extended description); slash commands and install/uninstall behavior are unchanged.

If you have automation that hard-codes routing for `tokio::task::consume_budget`, `cargo expand --type-sizes`, or the v0.3.0 §B23 "send is cancel-safe" claim, update it: those are gone in v0.3.1.

### Iteration: scope reframe + taxonomy expansion (drafted as 0.3.0)

First content release since v0.1.x. The skill itself (`rust-intel.md`) is **substantively rewritten**: scope is explicitly reframed, eight accuracy bugs from the v0.2.x text are fixed, and the category count grows from 26 to **41**. Slash commands, install/uninstall scripts, and the layout are unchanged. Anyone who already has v0.2.x installed re-runs the installer; no other migration needed.

### Changed

- **Scope, stated up front.** The spec is now explicitly scoped to bugs in code that **already compiles and passes tests**. Compile-only failure modes (lifetime variance, trait bound mismatch, GAT lifetime bound errors, object-safety from generic methods, cyclic workspace deps, `?`-in-`main`, HRTB depth, recursive macro limits, `no_std` reflexive `std::*`, self-referential structs, `From`/`Into` cycles, MSRV mismatch) are *deliberately omitted* — the compiler is sufficient, the LLM cannot ship them. This spec covers what survives `rustc`, `clippy`, and `cargo test` and still breaks. The opening section, the front-matter `description`, and the README "What this is" / "Spec architecture" sections all reflect the new scope.

- **§B3 — `AsyncWriteExt::write_buf` cancel-safety corrected (technical error).** v0.2.x text listed `write_buf` as cancel-UNSAFE; per tokio's documented cancel-safety contract, `write_buf` is cancel-safe (single-shot). The actually-unsafe variant is `write_all_buf` (safe-with-caveat: the buffer may be partially advanced) and `write_all` (unsafe). Text now distinguishes all three.

- **§B8 — `tokio::spawn(async_fn())` "future-of-future" claim removed (technical error).** v0.2.x text asserted that `tokio::spawn(async_fn())` creates a future-of-future and spawns the outer wrapper, dropping the inner. That is wrong: an `async fn` returns `impl Future` directly, and `tokio::spawn` polls it. The bullet is gone; replaced with the actual forgotten-await failure modes (a future bound to a variable but never awaited; a future-returning call in a non-async function).

- **§B9 — `tokio::sync::Mutex` "detects deadlock under `tokio-console`" claim corrected (technical error).** `tokio-console` provides *visibility* (which task holds which lock, who is waiting), not detection. Deadlock detection is `parking_lot::deadlock::check_deadlock()` for sync sections or human review of documented lock-acquisition orders. Reworded accordingly.

- **§B5 — `#[repr(Rust)]` framing corrected (technical error).** v0.2.x described `#[repr(Rust)]` as "unstable". The attribute itself is stable (it is the default repr); what is unspecified is the *layout* the default implies. Reworded; expanded list of pinned reprs (`repr(C)`, `repr(transparent)`, `repr(uN)`).

- **§B5 — `slice::align_to` removed from "safe abstractions" list (technical error).** `<[T]>::align_to::<U>` is `unsafe fn`; v0.2.x had it in the safe-defaults list alongside `bytemuck::Pod` / `bytemuck::cast_slice`. Removed from the safe list and from the "use instead of raw pointer arithmetic" list; explicit note added that it requires the same `Pod`-style invariants as `transmute` and a `// SAFETY:` block.

- **§B7 — `Box::new_uninit_slice` nightly tag removed (stale).** Stabilized in Rust 1.82 (October 2024); spec already targets Rust 1.84+. The method is now listed as a stable alternative to `vec![0u8; N].into_boxed_slice()` for zero-init-wasted scenarios, with `assume_init` flagged as `unsafe`.

- **§B7 — stack-overflow threshold rationale clarified.** The v0.2.x `N * size_of::<T>() > 4096` line conflated page size with stack budget. Replaced with the real numbers — 8 MiB on Linux main thread, 2 MiB on `std::thread::spawn`, ~2 MiB on tokio tasks — and the ~64 KiB practical rule of thumb. The `Box::new([0u8; N])` placement trap (array built on stack *before* being moved to heap) is now called out explicitly.

- **§B5 — `Vec::into_raw_parts` pinned to Rust 1.93.** Verified via the stdlib docs: stable since 1.93.0. The spec's MSRV is 1.84, so the `ManuallyDrop<Vec<T>>` + manual `(ptr, len, cap)` decomposition (stable since 1.0) is the default; the `Vec::into_raw_parts` convenience is opt-in on a bumped MSRV. The version pins section reflects this.

- **§B5 — `mem::uninitialized` / `mem::zeroed` promoted to BANNED list.** Previously surfaced inside a REQUIRED bullet about `MaybeUninit` discipline; now each has its own BANNED line spelling out the UB conditions (`mem::uninitialized` deprecated since 1.39 and UB for any type with invariants; `mem::zeroed` UB for `bool`/`&T`/`Box<T>`/`NonZero*`/restricted-discriminant enums/`#[repr(transparent)]` wrappers over those). The compiler does not stop either call.

- **§A1 — repositioned as "stale APIs and slopsquatting" (scope reframe).** Pure `E0599` hallucinations no longer qualify (compiler catches them). The category now covers stale-but-still-valid APIs, `#[deprecated]`-not-removed APIs, wrong-version-of-crate semantics drift, and supply-chain slopsquatting — exactly the cases where the code compiles and runs but is wrong (or malicious).

- **§A3 — repositioned as "`pub` as a hammer for `E0603`" (scope reframe).** Now framed as "LLM reflexively makes things `pub` to silence E0603; code compiles and works; semver surface silently expanded" — a real silent residue, not generic visibility hygiene. (Section is at §A3 in the final v0.3.0 numbering; see "Removed" below for the gap-closing renumber.)

- **§A2, §B5, §B11, §B12, §B15, §C1 — depth expansions.** §A2 (Smart pointer misuse) gains `Cow`, `Arc::make_mut`, `Rc::get_mut`/`Arc::get_mut`, `ArcSwap`. §B5 gains `MaybeUninit` discipline, strict provenance API rules (Rust 2024+), `slice::from_raw_parts` invariant list. §B11 gains `tokio::task::consume_budget`. §B12 cross-links to the new §B24 for constant-time comparison. §B15 gains `Stream` vs `Iterator` failure modes. §C1 gains `#[repr(transparent)]` zero-cost newtype guidance.

- **Trigger table — extended and split.** Phrase-based triggers extended (singletons, retries, rate-limit, batching, secret comparison, JSON parsing, tracing instrumentation, graceful shutdown, workspace features, channels, shared mutable state, type wrappers, async cleanup). New code-pattern triggers section: `async fn` with `Mutex<...>`, `Rc<RefCell<>>`, `unsafe impl Send/Sync`, untracked `JoinHandle`, `impl Drop` with `.await`, `impl Deref` on non-pointer wrappers, `#[serde(untagged)]`, untagged TOCTOU patterns, raw-bytes comparisons in security contexts, `select!` with arm side effects, `tokio::spawn` under active spans, `mem::transmute`/`ptr::read`/`slice::from_raw_parts`, large stack arrays.

- **Post-flight checklist — extended.** New surface-able items: manual `Send`/`Sync` impl (§B18), `#[serde(untagged)]` enums and string-keyed JSON (§B20), untracked `JoinHandle`s (§B21), `impl Drop` with async-looking work (§B22), `==` on secrets (§B24), every `extern "C" fn` and `Box::into_raw`/`Box::from_raw`/`Vec::into_raw_parts`/`Vec::from_raw_parts` pair (§B25), unbounded channels by runtime (§C8), spawn without `.in_current_span()` under instrumented contexts (§C9), default features that pull heavy deps (§C10), `impl Deref` on non-pointer wrappers (§C11), `thread::sleep` in tests (§D1), `#[should_panic]` without `expected` (§D1).

- **Front-matter `description`.** Was: "Hard rules for writing Rust that LLMs systematically get wrong... Defends against the full known taxonomy of LLM failure modes in Rust as of 2026." Now: "Hard rules for writing Rust in code that already compiles and passes tests but is silently broken, slow, or semver-fragile. Load this BEFORE writing any Rust code. Targets bugs that survive rustc, clippy, and cargo test but fail in production or rot the codebase."

### Added

**Tier B — Silent correctness bugs.** Ten new categories.

- **§B16. Equality and hashing contracts.** Manual `PartialEq` without matching `Hash`, manual `PartialOrd` without total-order `Ord`, `f64`/`f32` keys without `OrderedFloat`/`NotNan`. Failure mode: `HashMap` silently loses keys, `BTreeMap` behaves nondeterministically. Compiles, often passes thin tests, corrupts data at contention.
- **§B17. `RefCell` / `Mutex` runtime borrow panics.** `Rc<RefCell<T>>` in callback/traversal chains, reentrant `borrow_mut()`, undocumented borrow-disjointness invariants. Compiles, tests pass at low concurrency, production panics. REQUIRED: `try_borrow_mut()` with `BorrowMutError` handling for tree traversals.
- **§B18. Manual `unsafe impl Send` / `unsafe impl Sync`.** Reflexive `unsafe impl Send` to silence `tokio::spawn` bound errors. Now requires explicit `// SAFETY:` citing the synchronization invariant; impls without one are BANNED.
- **§B19. Iterator invalidation through indirection.** Borrow checker catches `Vec` invalidation at compile time; it does *not* catch invalidation through `RefCell<Vec<T>>`, `unsafe`, or `for i in 0..vec.len()` loops that mutate `vec.len()` mid-loop. Now covered.
- **§B20. `serde` field-presence vs null vs default.** `Option<T>` with `#[serde(default)]` conflates absent with null. `#[serde(untagged)]` enums silently match wrong variants on overlapping shapes. `#[serde(rename = "...")]` without round-trip test. Compiles, deserializes, drift downstream.
- **§B21. `JoinHandle` semantics: drop ≠ abort.** Dropping a `tokio::task::JoinHandle` *detaches* the task; it does not abort it. Spawning fire-and-forget without explicit `// fire-and-forget: detached by design` annotation is now BANNED. `JoinSet` recommended for joinable fan-in.
- **§B22. `async Drop` is not real.** `impl Drop` calling `tokio::spawn`-ing an async cleanup is fire-and-forget and may not run before runtime shutdown; `block_on` inside `Drop` re-enters the runtime and deadlocks. Resources requiring async cleanup must expose an explicit `async fn close(self)`.
- **§B23. `select!` arm side effects under cancellation.** Side effects (DB writes, channel sends, file flushes) inside a `tokio::select!` arm may not be observed if another branch wins. Each arm must be cancel-safe or guarded; side effects belong after the `select!` returns on the winning branch.
- **§B24. Timing attacks via `==` on secrets.** `if token == expected { ... }` for any secret comparison (API tokens, password-after-hash, MAC tags, OTP codes) leaks timing information. REQUIRED: `subtle::ConstantTimeEq` or `constant_time_eq` crate. Cross-linked from §B12.
- **§B25. Panic and ownership across `extern "C"` ABI.** Panics escaping `extern "C"` boundaries (UB pre-1.81, process abort since), `Box`/`Vec`/`String`/`Rc`/`Arc` passed directly through FFI (no stable ABI), allocator-mismatched `Box::from_raw`, `cap`-mismatched `Vec::from_raw_parts`, missing paired free functions, gratuitous `#[no_mangle]`. REQUIRED: `catch_unwind` wrapping, paired `extern "C" fn rust_drop_T(p: *mut T)`, `ManuallyDrop<Vec<T>>` or `Vec::into_raw_parts` (≥ 1.93) with the full tuple documented, layout verification against C headers, miri in CI for every FFI file. Absorbs the previously-roadmapped §B17 (FFI Drop).

**Tier C — Architecture and ergonomics.** Four new categories.

- **§C8. Channel-and-runtime mismatch.** `std::sync::mpsc` in async (blocks executor), `tokio::sync::mpsc` for MPMC (only first receiver gets messages), `crossbeam::channel` in async (await around recv blocks the worker). Now mapped explicitly.
- **§C9. `tracing` span leakage across `tokio::spawn`.** Spawning without `.in_current_span()` (requires `tracing::Instrument` in scope) loses span context. `spawn_blocking` requires explicit `span.enter()` inside the closure.
- **§C10. Workspace feature unification surprises.** Default features pulling heavy deps for all workspace members, dev-dependency features leaking into release builds via cargo's feature unification. `cargo hack --feature-powerset --no-dev-deps` in CI now recommended.
- **§C11. `Deref` polymorphism antipattern.** `impl Deref<Target = Inner> for Wrapper` for inheritance-style composition. Rust API Guidelines C-DEREF rule cited; explicit-accessor pattern (`fn user(&self) -> &User`) given as the right shape.

**Tier D — Testing and CI gaps.** New tier. Two categories.

- **§D1. Tests that pass by luck.** `thread::sleep` waiting for async work (flaky), `#[should_panic]` without `expected = "..."` (any panic passes including in test setup), tests asserting absence of panic instead of postconditions. REQUIRED: `tokio::time::pause`/`advance`, explicit `Notify`/`oneshot` synchronization, `expected` substring pinning.
- **§D2. Integration vs unit test placement drift.** `#[cfg(test)] mod tests` referencing private items that are later split into siblings; integration tests in `tests/` depending on `pub(crate)`. Recommendation: unit tests for private items live next to the impl; integration tests use the public API only or a `#[cfg(feature = "test-support")]` gate.

**Version pins section.** New section at the end of the spec listing the stability cutoffs assumed throughout: `Box::new_uninit_slice` (1.82), `Vec::into_raw_parts` (1.93 — `ManuallyDrop<Vec<T>>` is the MSRV-safe fallback), strict-provenance API (1.84), tokio cancel-safety contracts (1.x stable), `rand` 0.8 → 0.9 `thread_rng()` → `rng()` rename, Rust 1.80+ `unexpected_cfgs` auto-lint, AFIT (1.75), `consume_budget` (tokio 1.x), panic across `extern "C"` ABI (UB → process abort at Rust 1.81; `extern "C-unwind"` available).

### Removed

- **An earlier draft's Tier A category for trait bounds and type mismatches (E0277 / E0308).** Compile-only failure mode; rustc catches every case and the LLM cannot ship a binary with it. Out of scope for v0.3.0. Tier A numbering was tightened by renumbering the surviving categories: the former §A3 (Smart pointer misuse) is now §A2, and the former §A4 (`pub` as a hammer for E0603) is now §A3. The Tier A intro carries a short note about the historical retirement so older references resolve to context.
- **Empty roadmap entries §B16 (serde), §B17 (FFI Drop), §C8 (workspace), §C9 (tracing).** All four graduated into the main spec (now §B20, §B25, §C10, §C9 respectively). §B18 (`no_std`) remains in roadmap as low-priority but is explicitly flagged as out-of-scope by the new framing.

### Tooling and documentation

- **`README.md` Status block, "What this is", install description, layout comment, and Spec architecture table** synced to v0.3.0. Tier D added to architecture table. The "26 categories" claim is removed in favor of "the categories from the spec" (count lives in the spec, not the README).
- **`docs/roadmap.md`** fully refreshed: all `/rust-{audit,fix,plan}` references corrected to `/rust-cc-*`, broken relative paths to `commands/rust-{audit,fix,plan}.md` corrected to `commands/rust-intel-cc/{audit,fix,plan}.md`. Categories that shipped into the spec marked `✅ shipped in v0.3.0`. Out-of-scope note added.
- **`docs/sources.md`** — the single `/rust-fix` reference corrected to `/rust-cc-fix`; SafeTrans and Rust-SWE-Bench entries updated to reflect the retirement of the historical §A2 category (the empirical figures are preserved as Tier A intro motivation) and the renumbering that followed.
- **`commands/rust-intel-cc/{audit,fix,plan}.md`** — references to "`rust-intel.md`" reworded to "the `rust-intel` skill" (decouples command files from the on-disk filename, which is `SKILL.md` after install). `audit.md` example header updated from `rust-audit report` to `rust-cc-audit report`. `26 categories` references removed. `fix.md` routing table E0277/E0308 row updated to point at `out-of-scope (compile-only)` with a check for §A2/§A3/§C5 residue from the reflexive fix.
- **`commands/README.md`** — "26 categories" wording dropped.
- **Line endings.** `.bat` and `.ps1` files were stored in the working tree as LF despite `.gitattributes` declaring `eol=crlf`. Working tree now matches the attribute. (Index was correct; only the working copy needed renormalization.)
- **Windows symlink note** added to README: `--symlink` is bash-only; PowerShell and cmd.exe installers always copy.

### Migration

Re-run the installer (`./rust-cc-install.sh`, `.\rust-cc-install.ps1`, or `rust-cc-install.bat` — add `--user` / `-User` if you previously installed user-global). The skill file is byte-different; the slash commands are not; no other migration is needed.

If you have automation that hard-codes the category count or references Tier A by old number, update it: the historical §A2 category is gone, the surviving categories were renumbered (§A3 → §A2, §A4 → §A3), the total is now 41, and references to compile-only failure modes should be rerouted (the routing table in `/rust-cc-fix` already does this — E0277/E0308 etc. → `out-of-scope (compile-only)` with a check for reflexive-fix residue against §A2/§A3/§C5).

## [0.2.2] — 2026-05-18

Same-day script renaming. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2, v0.2.0, and v0.2.1 — no rule changes, no new categories.

### Changed

- **Install and uninstall scripts gained the `rust-cc-` prefix.** Generic names like `install.bat` / `install.sh` are a footgun: if the repo lives on the user's `PATH`, or if multiple tooling repos share a common convention, an unprefixed `install` shadows other things in the system. Renamed all six scripts to be project-specific:
  - `install.sh`     → `rust-cc-install.sh`
  - `install.ps1`    → `rust-cc-install.ps1`
  - `install.bat`    → `rust-cc-install.bat`
  - `uninstall.sh`   → `rust-cc-uninstall.sh`
  - `uninstall.ps1`  → `rust-cc-uninstall.ps1`
  - `uninstall.bat`  → `rust-cc-uninstall.bat`
  Internal references (`.bat` → sibling `.ps1`, `--help` text) and external docs (README, `commands/README.md`) updated to match.

### Migration

If you previously cloned the repo and ran `./install.sh` / `.\install.ps1` / `install.bat`, the next pull will rename them. Update any automation, aliases, or notes accordingly. The script behaviour is unchanged.

## [0.2.1] — 2026-05-18

Same-day rectification of v0.2.0. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2 and v0.2.0 — no rule changes, no new categories.

### Changed

- **Slash commands flattened from `/rust-intel-cc:*` to `/rust-cc-*`.** v0.2.0 misread the original intent: the repo's nested `commands/rust-intel-cc/` directory was meant for *file organization only*, with the installer flattening to a simple-prefixed slash surface. v0.2.1 honors that split:
  - **Repo source** (unchanged from v0.2.0): `commands/rust-intel-cc/{audit,fix,plan}.md`.
  - **Installed target** (new): `<claude>/commands/rust-cc-{audit,fix,plan}.md` — flat, with a `rust-cc-` prefix, no subdirectory.
  - **Slash commands** (new):
    - `/rust-intel-cc:audit` → `/rust-cc-audit`
    - `/rust-intel-cc:fix`   → `/rust-cc-fix`
    - `/rust-intel-cc:plan`  → `/rust-cc-plan`
  The installer does the rename during copy. Repo stays tidy (one umbrella directory for three related commands); slash surface stays short (no namespace prefix in the prompt).
- **Installers and uninstallers sweep every prior layout** before copying:
  - v0.2.1+ flat-with-prefix (`rust-cc-{audit,fix,plan}.md`)
  - v0.2.0 namespace dir (`rust-intel-cc/`)
  - v0.1.x legacy flat-no-prefix (`{rust-audit,rust-fix,rust-plan,rust-intel}.md`)

### Migration from v0.2.0

Re-run the installer (`./install.sh`, `.\install.ps1`, or `install.bat` — add `--user` / `-User` if you previously installed user-global). It will remove the v0.2.0 `commands/rust-intel-cc/` directory and install the v0.2.1 flat files. Update any references to the old `/rust-intel-cc:*` slash commands to the new `/rust-cc-*` form.

### Migration from v0.1.x

Same as v0.2.0's migration — re-running the installer sweeps the old `/rust-audit`, `/rust-fix`, `/rust-plan` automatically.

## [0.2.0] — 2026-05-18

Tooling restructure. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2 — no rule changes, no new categories. What changed is how the slash commands are organised and how the installers behave by default.

### Changed

- **Slash commands moved into the `rust-intel-cc` namespace.** The three top-level commands are gone; they now live under `commands/rust-intel-cc/` and are invoked with the colon-namespace syntax Claude Code uses for nested commands:
  - `/rust-audit` → `/rust-intel-cc:audit`
  - `/rust-fix`   → `/rust-intel-cc:fix`
  - `/rust-plan`  → `/rust-intel-cc:plan`
  Rationale: a single `rust-intel-cc` umbrella is easier to remember, easier to grep, and isolates the three sub-commands into one Claude Code namespace instead of three top-level slots.
- **Installers default to project-local `./.claude/`** instead of user-global `~/.claude/`. Pass `--user` (bash) or `-User` (PowerShell) to get the v0.1.x global-install behaviour. `CLAUDE_CONFIG_DIR` env var still overrides everything. Rationale: a Rust skill is most useful scoped to the project being worked on; the global install is the rarer case and is now an explicit opt-in.
- **Installers and uninstallers now sweep the legacy v0.1.x flat layout** (`commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, plus the very early `commands/rust-intel.md`) and the entire `commands/rust-intel-cc/` directory before copying. Re-running the installer cleanly migrates from any previous version.

### Added

- **`install.bat` / `uninstall.bat`** — thin wrappers around the corresponding `.ps1` scripts for users in `cmd.exe`. Pass-through arguments work as expected (`install.bat -User`, etc.).
- `.gitattributes` now pins `*.bat` to CRLF (cmd.exe will not parse LF-terminated batch files reliably).
- `/.claude/` added to `.gitignore` so running the installer from the repo root does not pollute the working tree.

### Migration

For anyone upgrading from v0.1.x:

1. Pull the new repo state.
2. Re-run the installer (`./install.sh`, `.\install.ps1`, or `install.bat`). It will sweep the old flat layout — `/rust-audit`, `/rust-fix`, `/rust-plan` — from whatever target it was previously installed to, and put the new namespaced layout in its place.
3. If you previously installed to `~/.claude/` (the v0.1.x default), pass `--user` / `-User` on the new install — otherwise the installer will treat your current directory as the install target.
4. Update any tooling or notes that invoked the old slash commands to use the new namespaced names.

The skill itself activates the same way as before. Only the slash-command names changed.

## [0.1.2] — 2026-05-17

Tooling-only patch. No changes to `rust-intel.md` (the skill itself); no new categories.

### Added

- **`uninstall.sh` / `uninstall.ps1`.** Inverse of the installers — removes the rust-intel skill directory and the named command files (`rust-audit.md`, `rust-fix.md`, `rust-plan.md`, and the legacy `rust-intel.md`) from `$CLAUDE_CONFIG_DIR`. Idempotent (safe to run when nothing is installed). Narrow by design: only touches paths the installers create, so other skills and commands under `~/.claude/` are left alone.
- README "Uninstall" section documenting both scripts.

### Changed

- **`install.sh` / `install.ps1` also remove the legacy `commands/rust-intel.md`** before installing. Earliest iterations of the project shipped rust-intel as a single command file rather than a skill; that layout is no longer used, but a stale `commands/rust-intel.md` left over from such an install would shadow the proper skill in Claude Code's listing (appearing as a duplicate "rust-intel" entry). Both installers and both uninstallers now sweep this path explicitly.

## [0.1.1] — 2026-05-17

Third- and fourth-round reviews surfaced eleven issues worth a same-day patch. Two are technical errors carried over from 0.1.0 (§B15 AFIT/RPITIT conflation, §B11 `yield_now` mis-substitution) that would propagate into reader code. Three are scope or statistical overreaches (§C2 anyhow, §B5 N=40, §B14 magic numbers). One is a structural split (§B1 → §B1a + §B1b). The fourth-round review caught five further refinements introduced by the third-round patches themselves: an over-categorical RPITIT claim, a temporally-fragile `dyn`-compatibility statement, a `Vec::push` formulation that read as if `push` itself was the failure, a `rand` 0.8→0.9 API gap, and a reframing of the §B15 Pin paragraph away from a strawman toward the actual LLM failure modes (`Pin<&mut>` vs `Pin<Box>`, `Unpin` as auto-trait). Install scripts now clean-replace any prior version. No new categories; no breaking changes to BANNED/REQUIRED wording.

### Changed

- **§B15 AFIT vs RPITIT — terminology rewrite (technical correction).** The previous text described `fn bar(&self) -> impl Future + Send` as "native AFIT with a Send bound via RPITIT". This conflates two distinct syntactic forms: AFIT is `async fn bar(&self) -> T`, RPITIT is `fn bar(&self) -> impl Future + Send`. Section now leads with the AFIT/RPITIT distinction and a 4-row decision table mapping use case → construct (plain AFIT / RPITIT / `trait-variant` / `async-trait`).
- **§B11 — `yield_now` no longer presented as alternative to `spawn_blocking` for CPU-bound work (technical correction).** `yield_now` only schedules other tasks already on the same worker thread; the worker itself remains occupied. `spawn_blocking` uses a *separate* blocking-task thread pool and is the only correct answer for CPU-bound work. Text now explicitly disallows the substitution and explains the executor-starvation mechanism.
- **§C2 — anyhow rule narrowed.** "Never `anyhow::Error` in `lib.rs` public APIs" was too broad — it banned a legitimate choice in internal/workspace libraries. The rule now applies specifically to **published library crates** (anything shipped to crates.io with a `pub` API other authors consume). Internal/workspace libraries may use `anyhow` as a deliberate trade-off.
- **§B5 — `~55% UB rate` headline now discloses sample size.** Heading changed to "high UB rate in small-N studies"; body labels the 22/40 figure as directional rather than definitive, while preserving the structural claim that LLM-generated `unsafe` is significantly more dangerous than LLM-generated safe code.
- **§B14 — folk numbers "typically 100–10000" replaced with a sizing formula.** Size `N` from expected producer burst over one consumer cycle, capped by memory budget per pending message. If the right `N` cannot be reasoned about, that is itself a signal to design the backpressure policy before writing the channel.
- **§B15 — RPITIT vs AFIT softened from "different" to "share a desugar lineage, materially different at the source-code level".** AFIT desugars into RPITIT internally, so calling them "different" is technically too strong even though the *written* syntactic forms have different bound-expressing capabilities. Reworded to make the distinction precise without overclaiming.
- **§B15 — decision table `dyn`-compatibility row hedged temporally.** `dyn`-compatible RPITIT stabilization is in flight; row now says "as of stable Rust through mid-2026, verify against your `rustc --version`" rather than asserting it as a fixed property.
- **§B14 `Vec::push` example clarified.** Previous wording read as if `Vec::push` itself was the failure. Reworded to "a `Vec` that is `push`-ed in a hot loop with no consumer or cap" — the failure is the missing drain or bound, not the call.
- **§B12 — rand 0.8 / 0.9 API gap noted.** `thread_rng()` was renamed to `rng()` in `rand` 0.9. The rule (OS-backed entropy for keys/nonces/salts) is unchanged; the BANNED entry now states this explicitly and asks the user to pin the `rand` version assumed.
- **§B15 Pin reorientation.** The "you cannot hold a reference through `.await` and expect Pin to fix it" bullet was a strawman — that confusion is rare in practice. Replaced with the actual LLM-typical confusions: mixing up `Pin<&mut T>` (borrowing, stack) with `Pin<Box<T>>` (owning, heap), and the fact that `Unpin` is an auto-trait so most uses of `Pin` are incidental and add no real constraint.
- **Principle section — self-referential meta-acknowledgment.** Closes the third-round structural concern that the document's own empirics (percentages, rates, sample sizes) were stated without inline source-anchors. The Principle section now ends with a paragraph stating that every empirical figure maps to a sourced entry in `docs/sources.md`, with a recommendation to load that file alongside the skill when statistical precision matters. This makes the "prove, don't guess" principle apply to the document itself, not only the Rust it asks the reader to write.

### Added

- **§B1b — Lifetime leaking through public APIs promoted to peer subsection.** The "Related anti-pattern" tail at the end of §B1 was conceptually a separate failure mode (exposing `'a` in `pub fn` signatures is not the same as binding too many things to one `'a` *inside* a function). It now has its own BANNED/REQUIRED block, parallel in structure to §B1a (laundering). Section header renamed to "Lifetime laundering and lifetime leaking".
- **`install.sh` / `install.ps1` clean-replace step.** Both installers now remove the target skill directory contents and the three named command files before copying, so stale files from a previous version cannot linger.

## [0.1.0] — 2026-05-17

Initial release. 26 categories plus a meta-layer.

### Added

**Meta-layer:**
- "Prove, don't guess" principle.
- Blocking protocol — explicit refusal format when context is insufficient.
- Operating mode — 7 mandatory steps before generating any Rust.
- Self-monitoring — "user-phrase → activated category" trigger table.
- Pre-flight checklist (7 questions) and Post-flight checklist (what to surface in the summary).

**Tier A — Mass compilation failures:**
- §A1. API hallucinations and stale APIs (+ slopsquatting with documented attacks: CrateDepression 2022, `faster_log`/`async_println` 2025).
- §A2. Trait bounds and type mismatches (E0277 / E0308).
- §A3. Smart pointer misuse.
- §A4. Module visibility and pub leaks.

**Tier B — Silent correctness bugs:**
- §B1. Lifetime laundering (+ lifetime leaking through public APIs).
- §B2. `std::sync::Mutex` across `.await` (+ Mutex poisoning cascade, oversized critical section).
- §B3. Async cancellation.
- §B4. Drop order and RAII contracts.
- §B5. Unsafe that looks safe.
- §B6. Pattern matching exhaustiveness drift.
- §B7. Large stack allocations and arena pitfalls.
- §B8. Silent task dropping (forgotten `.await`).
- §B9. Lock ordering and ABBA deadlock.
- §B10. Reference cycles in `Rc`/`Arc` graphs.
- §B11. Blocking the async executor.
- §B12. Cryptographic code (silent insecurity).
- §B13. Check-then-act races in concurrent collections (TOCTOU).
- §B14. Unbounded channels and backpressure neglect.
- §B15. Advanced async pitfalls (AFIT, Pin, Waker, block_on).

**Tier C — Architecture and ergonomics:**
- §C1. Blanket impls in public APIs (semver hazard).
- §C2. Error handling discipline.
- §C3. Async runtime and ecosystem coherence.
- §C4. Iterator and allocation discipline.
- §C5. Reflexive `.clone()` as a borrow-checker silencer.
- §C6. Procedural macro hygiene.
- §C7. Cargo feature flag hygiene.

**Tooling:**
- `commands/rust-audit.md` — scan existing Rust against all 26 categories.
- `commands/rust-fix.md` — map an error symptom to a category and propose a root-cause fix.
- `commands/rust-plan.md` — pre-flight a new task through the trigger table and 7-question checklist.

**Repository scaffolding:**
- `LICENSE` (MIT) at repo root.
- `install.sh` / `install.ps1` for `~/.claude/` installation.
- `.gitattributes` pinning LF on `.sh`/`.md` and CRLF on `.ps1`.
- `docs/sources.md` with verified URLs for every empirical claim, including the published 2026-05-16 uproger.com field report.
- `docs/roadmap.md` listing planned categories and tooling.

### Refinements during the pre-tag polish round

- "6-month production study" relabeled to "published field report" throughout `rust-intel.md` and `docs/sources.md` — the source is a public article, not unattributed internal observation.
- README's "compiler catches ~76%" claim corrected: the 76.3% figure is the share of *compilation failures* concentrated in two categories per Rust-SWE-Bench, not a share of "typical mistakes caught."
- AFIT recommendation in §B15 reordered to lead with native AFIT + RPITIT + `+ Send`; `trait-variant` second; `async-trait` only for `dyn Trait`. (Terminology further corrected in 0.1.1.)
- `cargo check --check-cfg` instruction replaced with the actual Rust 1.80+ behavior (automatic `unexpected_cfgs` lint from `Cargo.toml` declarations).
- `bytes::Bytes` removed from the §B5 "safe abstractions" list; replaced with `bytemuck::Pod` / `bytemuck::cast_slice`, with a note that `Bytes` is a buffer container, not a safe-transmute abstraction.
- `rand::random()` "not cryptographically secure" claim corrected: `ThreadRng` is a CSPRNG; the actual ban targets `SmallRng` / `StdRng` for security work and recommends `OsRng` as the default for keys and nonces.
- Slopsquatting "~45%" figure in §A1 hedged to match the verification status in `docs/sources.md`.
- Tier B intro rewritten to motivate via §B2 (46%→19%) and SafeGenBench (~57%) instead of the unverifiable RustPrint citation.
- "The eleven categories below" in Tier B intro → "fifteen" (matches §B1–§B15).
- README slash-command misnaming: skills aren't invoked with `/`; clarified that the skill activates automatically.
- `commands/rust-audit.md` and `commands/rust-plan.md`: removed inline duplications of category-level rules and the Pre-flight checklist questions. Both now reference the skill as the source of truth.
- `commands/rust-fix.md`: clarified the symptom→category table is a routing layer, not duplicated rule knowledge.
- `RustPrint` benchmark entry removed from `docs/sources.md` and its citation in `rust-intel.md` (no verifiable source under that name).
- `LICENSE-APACHE` dropped (dual-licensing not needed for a prose-first repo; MIT alone is sufficient).

### Source basis

Built on: a published 6-month field report (~80k LOC, tokio + sqlx + unsafe), benchmarks RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust, industry reports from Faros AI and Lightrun (2026), and documented crates.io supply-chain incidents. Full list — [`docs/sources.md`](docs/sources.md).
