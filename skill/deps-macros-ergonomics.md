# Rust Intel — Dependencies, Macros & Ergonomics (supply-chain, clone, proc-macro, features, workspace, Deref, recompute cost)

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §A1, §C5, §C6, §C7, §C10, §C11, §C12 (and §C12a), §E5. Tier labels (🔴/🟡/🟢; A–F) and all cross-references are preserved verbatim.
> **Tiers in this module:** §A1 🔴 (unverified/unnamed dependency; stale-API remainder is 🟡) · §C5 🟡 · §C6 🟡 · §C7 🟡 (typo'd cfg — 🟢 via unexpected_cfgs) · §C10 🟡 · §C11 🟡 · §C12 🟡 (HTML sanitization and Markdown-rendering rows only are 🔴) · §C12a 🟡 · §E5 🟡/🟢. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §A1. Stale APIs, deprecated-not-removed APIs, and slopsquatting

The class here is **APIs that compile but are wrong**, not APIs that don't exist. The pure-hallucination cases (`E0599` "method does not exist") are noise — rustc catches them and the LLM moves on. The cases that survive the compile are: the API existed in an older version of the crate and still exists in the new one with materially different semantics; the API is `#[deprecated]` but not removed; the LLM picked up a method name from a different crate and the name happens to also exist in the named crate; or — worst — the LLM hallucinated a *crate name* that an attacker has since registered on crates.io with a malicious payload.

**The trap, by sub-class:**

- **Stale-but-still-valid APIs.** `tokio` 0.2 `mpsc::channel(_)` returned a different tuple shape than `tokio` 1.x; `rand` 0.8 `thread_rng()` was renamed to `rng()` in 0.9 but the old function lingers in code patterns. The LLM emits the older form, it compiles against the pinned version because the symbol is still present (or trivially adapted), and behavior diverges from the user's mental model.
- **Deprecated-not-removed APIs.** `#[deprecated]` emits a warning, not an error. LLMs routinely ignore the warning channel and ship deprecated calls. Each deprecated call is a future break.
- **Wrong-version-of-crate APIs.** `serde_json::from_str` exists in every version, but `serde_json::Value::take` did not exist before a specific point. The compile succeeds against the pinned version *because the version pinned is recent enough*, but the LLM has no proof of that — it guessed and was lucky.
- **Slopsquatting (supply-chain).** Hallucinated crate names that an adversary has registered on crates.io. Compiles, runs, exfiltrates secrets, and `cargo build --offline` would not have helped (the malicious payload lives inside a dependency the build script reaches for). Published "package-import hallucination" studies (Lanyado / Spracklen) report elevated hallucination rates for Rust crate names relative to other ecosystems; precise figures require checking against the primary source.
- **Default-of-an-earlier-era crates.** A crate the training corpus is saturated with, that still works and has no advisory, but stopped being the recognized default before the corpus's cutoff caught up: `structopt` (folded into `clap`'s derive API — RUSTSEC-2022-0104, "structopt is in maintenance mode"), `serde_yaml` (archived by its author, no successor named here — verify the current recommendation at write time), `lazy_static`/`once_cell::sync::Lazy` (superseded by std `LazyLock`/`OnceLock`, stable since Rust 1.80 — see Version pins). Verify against the same "current default" question §C12 asks, not against whether the crate still compiles.

**REQUIRED**:
- Before calling any method on a third-party type, check that it exists *with the documented semantics* in the **exact version pinned in `Cargo.toml`**. "It compiled" is not proof — semantics drift across minor versions in pre-1.0 crates.
- For high-churn crates (`tokio`, `axum`, `hyper`, `reqwest`, `sqlx`, `serde`, `tonic`, `tower`, `clap`, `rand`), if uncertain about an API or its semantics, **say so explicitly** and ask the user to confirm or run `cargo doc --open`.
- Treat `#[deprecated]` warnings as errors. If the symbol I want to emit is deprecated in the pinned version, switch to the replacement before writing.
- Pre-1.0 crates (any version with leading `0.`) have **breaking changes between minor versions**. Treat 0.6 → 0.7 with the same suspicion as 1.x → 2.x.
- Any `[patch]`/git dependency (a legitimate move for "the fix is upstream but unreleased" or "the user asked for their fork") **names a full-commit `rev`** (not just a `branch`), points at a repo the user **explicitly approved**, is flagged in the post-flight summary exactly like a brand-new dependency (§A1's 🔴 protocol above), and carries a **stated removal condition** — e.g. `// remove once upstream 1.2.4 ships the fix`. A rev-pinned, user-approved, temporary patch with a removal condition is fine (🟡); an unpinned-HEAD-following or unnamed-fork source is the 🔴 BANNED case above.

**BANNED**:
- Method calls on types where I have not internally verified the method exists *and means what I think it means* in the pinned version.
- Mixing API styles from different major versions (e.g., axum 0.6 routers with axum 0.7 handlers).
- Adding a crate to `Cargo.toml` that the user did not name and that I have not independently verified exists.
- An **unpinned git/`[patch]` source for a known-good crate name** — `[patch.crates-io] tokio = { git = "…", branch = "fix-timeout" }` or a bare `git = "…"` with no `rev`. This is the **same class of unverified-trust decision** as the named-dependency rule above, just harder to see: it is still `tokio`, only now it is *rando's* `tokio`, not the audited registry crate. A git dependency without a full-commit `rev` (branch-only, or nothing) **follows the remote HEAD** — the effective source can change under you on any lockfile refresh, the fork owner (or an account takeover) can push anything, and — critically — `cargo audit`/`cargo vet`/RUSTSEC advisories all key on **registry versions**, so a git/`[patch]` override walks *around* the entire audit stack the rest of §A1 prescribes. A workspace-root `[patch]` applies graph-wide, to transitive users of the crate too.

**Security note: slopsquatting**. Hallucinated *crate names* (not just methods) are a supply-chain attack vector that **survives compilation and runs malicious code**. Adversaries monitor common LLM crate-name hallucinations and **register those names on crates.io with malicious payloads**. This is the canonical Tier A category: the LLM's "fix" for "I need a crate that does X" compiles cleanly and silently runs untrusted code.

**Real attack cases (2022–2026)** — these are not hypothetical:
- `rustdecimal` — typosquat of `rust_decimal` (the real crate has ~100M all-time downloads). The malicious crate, documented in the CrateDepression incident (2022), targeted CI pipelines.
- `faster_log`, `async_println` — malicious crates designed to scan for and exfiltrate Solana/Ethereum private keys; reached thousands of downloads before takedown.
- `evm-units` / `uniswap-utils` (2025-12) and `finch-rust` / `sha-rust` (2025-12) — further crates.io malicious-crate takedowns in the same crypto-credential-theft family; by 2026-02 crates.io published a notification-policy update acknowledging such takedowns are now routine, and the cross-ecosystem "TrapDoor" campaign (2026-05) reached crates.io alongside npm/PyPI. The takedown cadence, not any single incident, is the signal. (See `references/sources.md`.)
- Supply-chain attacks across software ecosystems rose materially in 2025 (published year-over-year estimates cluster around +70–75% ecosystem-wide; no crates.io-specific figure is published).

Concrete defenses:
- I do not add a crate to `Cargo.toml` unless the user explicitly named it OR I verified its existence by reading the project's existing dependencies.
- For any new dependency I suggest, I flag it as a *suggestion to verify*, not a fait accompli: "I'd add `deadpool-postgres` for connection pooling — please verify on crates.io before adding."
- I never invent variations of well-known crate names (`tokio-utils` does not exist, `tokio-util` does; `serde-json` does not exist as a separate crate, `serde_json` does; `rust-decimal` does not exist, `rust_decimal` does — and the typo'd variant has been weaponized).
- Surface every newly-added `Cargo.toml` dependency in the post-flight summary so the user can audit it.

**Build-time code execution (a distinct supply-chain vector).** Slopsquatting is about *hallucinated names*; this is about *what a dependency does at build time*. A crate's `build.rs` and any proc-macro it exports run arbitrary code on the developer's machine and in CI **during `cargo build`**, before any runtime guard exists — this is the mechanism behind the malicious crates above, and such payloads read `~/.cargo/credentials`, `~/.ssh`, `.env`, and CI secrets. (The proc-macro-trust surface is not hypothetical even for a *trusted* crate: `serde_derive` briefly shipped a **precompiled binary** it ran during your build instead of building the macro from source (2023) — reverted in v1.0.184 after community pushback, but it is the canonical demonstration that "it's just serde" is not a proof the code running at build time is the code you can read. See `references/sources.md`.) A typosquat that swaps `-` for `_` (or appends a language suffix), plus dependency confusion (a private crate name shadowed by a public one on a default registry), are the same class. Defenses: pin exact versions and commit `Cargo.lock`; for a newly-added *direct* dependency that is not a well-known crate, skim its `build.rs`/proc-macro before the first build; and for the transitive graph (which you cannot read by hand) lean on `cargo-deny` / `cargo-audit` (RustSec advisory DB), `cargo-vet` (attest that each dependency has been human-audited), the committed `Cargo.lock`, and `--locked`/vendored builds.

**Lockfile hygiene and yanked versions.** Committing `Cargo.lock` and building `--locked` (above) pins *reproducibility* — but a pinned version is not the same as a *safe* version, and `--locked` actively hides one gap. A version that is **yanked** upstream (for a soundness bug, or because a RUSTSEC advisory was filed against it) stays downloadable, and an existing `Cargo.lock` keeps resolving it: `cargo build --locked` against a yanked pin emits only a **warning** ("package `x` in Cargo.lock is yanked"), exit 0 — green forever in CI. Only a *fresh* resolution refuses a yanked version ("candidate versions … were yanked"), so the day a new contributor runs `cargo update` or a clean `cargo install`, the build breaks — and until then the project may have been building against a version yanked for a security reason for months, unnoticed. REQUIRED: `cargo deny check advisories` (its config carries an explicit yanked-crate check) or `cargo audit -D warnings` in CI turns the silent `--locked` warning into a red build **with a stated reason**. BANNED as the fix: a blanket `cargo update` (the LLM's reflexive "make the CI error go away" move) — it silently swaps many *other* pinned versions too, exactly the Tier-A-shaped residue this spec warns about; the fix for one yanked crate is a **targeted `cargo update -p <crate>`** for that crate alone.

**Network access in your *own* `build.rs` (unpinned bytes outside the lockfile).** The build-time-execution bullet above is the *read* direction — a malicious *dependency's* `build.rs` reading your secrets. This is its **write-direction twin** (mirroring how §B5's padding-leak bullet is the write-direction dual of the validate-before-mint read rule): *your own* `build.rs` reaching the network at build time — shelling out to `curl`/`git clone`, or `reqwest::blocking` — to fetch a schema, model file, `protoc`, or C library. It compiles and passes tests on the author's box, and it is a distinct hazard from everything above: it is not *whose code runs at build time* but *unpinned bytes entering the build outside the lockfile*. `--locked`/`--offline`/`cargo vendor` give **zero** integrity protection here — the download is not in Cargo's hash-verified dependency graph at all — so the fetched artifact can silently change (or be MITM'd) between builds, reproducibility is gone, and offline/vendored builds simply fail. REQUIRED: no network access in your own `build.rs` — vendor the artifact into the repo, or fetch it in a separate, explicit CI step with a **hardcoded SHA-256** you verify; and keep `cargo build --offline`/`cargo vendor` working by providing an offline fallback path. Calibration: build-time *codegen* is fine — generating code from a **local** schema file, or invoking a **local** toolchain binary, touches no network and is not this finding; only reaching the network at build time is.

## §C5. Reflexive `.clone()` as a borrow-checker silencer

**The trap**: when borrow checker complains, the LLM's path of least resistance is to insert `.clone()` or `.to_string()` until errors disappear. The code compiles. The performance cost is invisible until profiling. This is a *different* failure mode from §C4 — it's not an idiom drift, it's a reflexive *fix-it strategy* that resolves a real borrow problem with a hidden allocation.

**Why this happens**: gradient descent rewards "compiles" heavily; the model learned that adding `.clone()` is a reliable way to make red squiggles go away. The cost (allocation, deep copy of `Vec<T>`, etc.) isn't penalized anywhere in training.

**Prompt triggers**: any prompt involving a borrow checker error in the conversation history; "fix the lifetime issue"; "make this compile"; refactoring sessions where the user is iterating on a function signature.

**REQUIRED**:
- Before inserting `.clone()`, ask: can this be solved by restructuring ownership (split borrows, borrow earlier-release later, take `&self` instead of `self`)?
- For `Copy` types (i32, bool, small struct of `Copy` fields), `.clone()` is a code smell — `clippy::clone_on_copy` exists for a reason. Never insert it.
- For `&str` → `String` conversions purely to escape a lifetime: re-examine the lifetime first. The String allocation is often masking the real problem from §B1.
- For `Vec<T>` clones in hot paths: consider `&[T]`, `Cow<'_, [T]>`, or `Arc<[T]>`.
- A `.clone()` introduced *to silence a borrow error* (the §C5 reflex) gets a one-line inline justification; routine clones, `Arc::clone`/`Rc::clone`, and `Copy`-type clones are 🟢 (clippy) / 🟡 (write-time) — not surfaced.

**BANNED**:
- `.clone()` on a `Copy` type.
- `String::from(s)` or `s.to_string()` immediately followed by use as `&str` (the original would have worked).
- Cloning inside a loop where the cloned value is only read.
- Replacing `&T` with `T` in a function signature just to make a call site compile.

## §C6. Procedural macro hygiene

**The trap**: proc-macros generate code that's pasted into the user's crate. If the macro writes `Option<T>`, it resolves at the call site — and if the user has `type Option = MyOption;`, the macro silently breaks. Hygiene violations in proc-macros are invisible at macro authoring time and only surface at user sites.

**REQUIRED in any proc-macro output**:
- Use absolute paths for every standard library item: `::core::option::Option<T>`, `::core::result::Result<T, E>`, `::std::vec::Vec<T>`, `::std::string::String`. Never bare `Option`, `Result`, `Vec`, `String`.
- For external traits: `::serde::Serialize`, not `Serialize` (and require the macro user to add `serde` as a dependency).
- For error reporting in macro expansion, use `syn::Error::to_compile_error()` returning `TokenStream`, which surfaces correctly at the user's call site. **Never `panic!`** in proc-macros — the user sees an opaque panic message without source location.
- For `#[derive]` macros that add bounds (e.g., `#[derive(Clone)]` adding implicit `T: Clone`), consider whether this matches user intent. For finer control, use `derive_more` or `derivative` and document the choice.

## §C7. Cargo feature flag hygiene

**The trap**: Cargo accepts unknown feature names silently. A typo like `#[cfg(feature = "widnows")]` becomes dead code that never compiles, never runs, and never warns — until production reveals a missing code path.

**REQUIRED**:
- Declare every feature in `[features]` in `Cargo.toml`. Rust 1.80+ automatically emits the `unexpected_cfgs` lint for any `#[cfg(feature = "...")]` whose name doesn't appear there — no extra flag needed. Treat the lint as `deny`, not `warn`, in CI.
- Every `feature` in `Cargo.toml` is mirrored exactly in every `#[cfg(feature = "...")]`. Names are case-sensitive and exact.
- Avoid feature-gated `pub` fields in structs — they break the public API between feature combinations. If a field is conditional, the whole struct or the whole module should be conditional.
- Test the full feature matrix in CI: `cargo hack --feature-powerset check` or equivalent, at least for libraries.
- For platform-conditional dependencies with features (`[target.'cfg(...)'.dependencies]`), the resolver version matters (mirror of §C10). Under **resolver v1** (default before edition 2021) `features = [...]` on a target-specific dependency activated *globally*, even for targets not being built — the cargo#2524 gotcha. **Resolver v2** (default since edition 2021; this spec targets 2024) fixes it: per the Cargo book, "features for target-specific dependencies are not enabled if the target is not currently being built." So on a 2021+/v2 project the global-activation surprise no longer applies; it resurfaces only if a crate is pinned to `resolver = "1"` or pre-2021 edition. Verify your `resolver` before relying on either behavior.

## §C10. Workspace feature unification surprises

**The trap**: Cargo unifies features across the entire workspace dependency graph — when two crates depend on the same upstream crate, Cargo merges their requested feature sets into one. The scope of the merge depends on the resolver: under **resolver v2** (default since edition 2021; this spec targets 2024) a feature activated only in one crate's `[dev-dependencies]` unifies with another crate's `[dependencies]` *only within builds that pull in dev targets* — `cargo test`, `cargo build --all-targets`, `--workspace` — and **not** in a clean `cargo build --release`. The "leaks into the release build" behavior is **resolver v1**. Either way the surprise is the same: local tests pass, the workspace builds, but the downstream consumer who depends on just one of the workspace crates suddenly fails because their feature set doesn't match the unified one.

**BANNED**:
- `default = ["heavy-dep"]` in `[features]` of a workspace member where `heavy-dep` is only needed by *some* consumers — every consumer who doesn't disable defaults pays the cost.
- Activating a feature in `[dev-dependencies]` of crate A which also appears in `[dependencies]` of crate B sharing the workspace — under resolver v1 the feature leaks into B's release build via Cargo's feature unification; under resolver v2 (default since edition 2021) it unifies only within builds that include dev targets (`cargo test`, `--all-targets`, `--workspace`).
- Treating workspace-internal features as private. They are visible (and unifiable) across the whole workspace and into any external consumer who pulls in any member crate.
- Members of one workspace pinning the **same dependency at drifting versions** (`serde = "1.0.200"` in one member, a looser `"1"` resolving to a semver-incompatible point elsewhere). Cargo can link *multiple copies* into one binary — larger artifact, slower build, and two distinct `serde::Error` types that don't interoperate (`expected Error, found Error`). The lockfile hides it until a value crosses a member boundary.

**REQUIRED**:
- Default features in a workspace member = the **minimum truly required** for the crate to function at all. Every additional default is a tax on every downstream consumer.
- Run `cargo hack --feature-powerset --no-dev-deps check` in CI to detect feature combinations that don't compile (the `--no-dev-deps` flag prevents dev-only features from leaking into the matrix).
- For workspace-internal feature toggles, prefer `[workspace.metadata]` + `build.rs` `cargo:rustc-cfg=...` over `[features]` — `cfg` flags do not unify across the workspace the way features do.
- Document on every workspace member's `Cargo.toml`: which features are public (intended for external consumers) vs internal (used only by other workspace members).
- Declare shared dependencies and their versions once in `[workspace.dependencies]` and inherit them with `dep.workspace = true` in each member — one version, one linked copy, one feature-unified set, audited in one place.
- **Extract a crate late, not early.** A workspace tempts speculative splitting ("one crate per module"). A premature boundary freezes an API you do not yet understand — every cross-crate call becomes a `pub` semver surface (§C1) — and forces exactly the feature/version coordination above. Split a crate out when there is *real* reuse, a *stable* boundary, or a concrete reason (compile-time parallelism, a separate publish cadence, a `proc-macro`/`build.rs` that must be its own crate). The opposite rot — logic copy-pasted across members and fixed in only one place — is the signal that extraction is now overdue, not premature.

## §C11. `Deref` polymorphism antipattern

**The trap**: `impl Deref<Target = Inner> for Wrapper` makes `wrapper.field_of_inner` and `wrapper.method_of_inner()` work transparently. The LLM uses this to fake inheritance — `struct UserAdmin(User); impl Deref<Target = User> for UserAdmin` — and the code compiles, runs, and looks elegant for a while. The breakdown comes when `UserAdmin` needs to participate in a trait `User` does not impl, or vice versa: the Rust API Guidelines explicitly call this out as **C-DEREF** ("Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). ... The traits should be used only for that purpose."). Trait resolution does not look through `Deref` for trait bounds, only for method calls, so generic functions taking `User` will not accept `UserAdmin`, generic functions taking `UserAdmin` will not see `User`'s trait impls, and downstream code grows ad-hoc casts and `as_ref()` calls.

**BANNED**:
- `impl Deref<Target = Inner> for Wrapper` where `Wrapper` is not conceptually a *smart pointer to* `Inner`. Wrappers, newtypes for additional invariants, and "extension types" are not smart pointers.
- Using `Deref` to expose all of `Inner`'s methods through `Wrapper` for ergonomic shorthand — this leaks the inner's API surface into the wrapper's, and any future addition to `Inner` becomes part of `Wrapper`'s public API too (semver hazard, mirrors §C1).
- `impl DerefMut<Target = Inner> for Wrapper` on a wrapper that adds invariants — the `DerefMut` lets callers bypass every method `Wrapper` defined to maintain those invariants.

**REQUIRED**:
- `Deref` is reserved for smart pointers: `Box`, `Rc`, `Arc`, `Cow`, `MutexGuard`, `RwLockReadGuard`, `String → str`, `Vec<T> → [T]`, custom guards (`MyHandle<'a, T>` where `T` is the pointee). The relationship must be *pointer-like* (the wrapper owns/references the pointee; the wrapper is morally transparent to the pointee).
- For composition without inheritance, write explicit accessors: `impl UserAdmin { fn user(&self) -> &User { &self.0 } }`. This keeps the API surface of `UserAdmin` separate from `User` and makes the composition explicit at every call site.
- Cite the Rust API Guidelines **C-DEREF** rule in code review when this pattern appears: *"Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). ... The traits should be used only for that purpose."*

## §C12. Reinventing a solved problem instead of reaching for the world-recognized crate

**The trap**: asked for a task with a well-known, high-adoption crate solution, the LLM writes a few lines of hand-rolled logic instead — `split(',')` for CSV, `format!` for JSON/URLs, a hardcoded character-replace table for HTML escaping. The hand-rolled version compiles and passes a plausible unit test built from the same mental model that wrote it. It is silently wrong on an input that model never considered — a quoted field, a non-ASCII path, a leap-second, a crossed antimeridian — and that input shows up in production, not in the test the LLM wrote for itself.

**Membership gate — every row below earned its place the same way, and any addition must clear the same bar**: a row exists only when a **concrete input or scenario** can be named where the hand-rolled version compiles, passes a plausible test, and is silently wrong — not merely "less idiomatic" (style, out of scope), not merely "slower" (performance, → the Substitution catalog in `data-and-types.md`, Tier E). "Silently wrong" means wrong output, data corruption, a security hole, or a crash on a real input a naive test would not cover — a loud panic on the same input is a different (and lesser) defect than a silent wrong answer. A task without a nameable silent-failure input is not a finding here even when a popular crate exists for it (`clap` for argument parsing, `anyhow`/`thiserror` for error types) — that is engineering taste, and per this spec's own acceptance standard, a category exists only where LLMs demonstrably err more than a careful human would, not wherever a preference exists.

**Why this is not a supply-chain shortcut around §A1**: every crate named below is independently verified to exist and carries real, checkable adoption (a download count, cited per row) — but that verification is *this document's*, done once, at write time of this category, not a license to skip §A1's own verification when the rule is applied. §A1 still governs how a suggested crate reaches `Cargo.toml`.

**REQUIRED**:
- On recognizing one of the tasks below, **propose** the named crate — subject to §A1's own verification and the user's approval — rather than silently hand-rolling the naive version. This is the same "suggestion to verify, not a fait accompli" posture §A1 already requires for any new dependency; §C12 does not create an exception to it.
- If the user has a stated zero-dependency constraint, or declines the suggestion, hand-rolling is the user's informed choice, not a defect — write it, and name the specific input(s) from the row below that the hand-rolled version will not handle, in a comment at the point it matters, so the gap is a documented decision instead of a silent one.
- Escalate a row to 🔴 (surface every occurrence) when its silent-failure shape is a security hole, not merely a correctness bug — currently: HTML sanitization (XSS bypass) and Markdown-to-HTML rendering (unescaped-HTML XSS). Every other row is 🟡: get it right, or document the gap, while writing; do not enumerate routine hits in the audit summary.

**BANNED**:
- Hand-rolling one of the tasks below **without** proposing the named alternative first, when there is no stated zero-dependency constraint.
- Hand-rolling one of the tasks below **silently** even under a zero-dependency constraint — i.e., without naming in a comment which concrete input(s) from the row the hand-rolled code does not handle.

**Utility-level catalog** — one task, one silent-failure input, one verified crate (all-time crates.io downloads at time of writing):

| Task | Hand-rolled shape | Input where it is silently wrong | Crate (downloads) |
|---|---|---|---|
| CSV | `line.split(',')` | a quoted field containing `,` or `\n` | `csv` (228M) |
| Version comparison | `split('.')` + tuple compare | `1.0.0-alpha` must sort *before* `1.0.0` | `semver` (921M) |
| URL construction/parsing | `format!`/`split('/')` | missing percent-encoding on reserved/non-ASCII bytes; `@` in userinfo → SSRF (→ §C2) | `url` (808M) |
| Money / decimal arithmetic | `f64` | accumulated rounding error; half-even vs half-up policy | `rust_decimal` (132M) |
| Retry with backoff | `sleep(n * base)` in a loop | no jitter → thundering herd on a shared dependency; no attempt cap | maintained backoff crate — verify current maintenance status before naming one at write time |
| Rate limiting | fixed-window counter | up to 2× burst at a window boundary | `governor` (71M) |
| Glob matching | manual `*`/`starts_with` | `**` recursive semantics, `[a-z]` classes, escaping | `glob` (561M) |
| Directory traversal | recursion over `read_dir` | symlink cycles | `walkdir` (571M) |
| Base64 | hand-rolled lookup table | URL-safe alphabet, padding strictness | `base64` (1.45B) |
| Temp file creation | `/tmp/{pid}` | predictable name → symlink attack (→ §C2 TOCTOU) | `tempfile` (746M) |
| HTML escaping (output) | `replace('<', "&lt;")` | attribute-context escaping; `&` must be escaped first | an auto-escaping template engine (`askama`, `tera`) |
| Date/time arithmetic | manual offset math | DST transition — nonexistent and ambiguous local time | `jiff` / `chrono` / `time` — verify current recommendation at write time |
| JSON construction/parsing | `format!`/`split` | unescaped `"`, `\`, or newline in a value → invalid or injected JSON | `serde_json` (1.19B) |
| HTTP client | raw `TcpStream` | chunked transfer-encoding, redirects, compressed responses | `reqwest` / `ureq` (652M) |
| Config/cache directory path | hardcoded `~/.config` | no `$HOME`/XDG on Windows; XDG overrides ignored | `dirs` / `directories` (300M) |
| String equality / dedup key | `==` on `String` | NFC vs NFD forms of the same visible string (`"café"` as U+00E9 vs `e`+combining-acute) compare unequal | `unicode-normalization` (534M) |
| XML parsing | string search for tags | entity refs (`&lt;`), CDATA, self-closing tags | `quick-xml` (375M) |
| Text wrap/truncate by character count | `chars().take(n)` | wide (CJK) characters count as 2 display columns, combining marks as 0 — `unicode-width` (744M) is the mechanism `textwrap` (407M) already applies | `textwrap` (407M) |
| Form/query-string decoding | `split('&')`/`split('=')` | `+` means literal space in `application/x-www-form-urlencoded`, not `%20` | `form_urlencoded` (732M) |
| Splitting a command string into argv | `.split_whitespace()` | `--name "John Doe"` splits into two arguments | `shlex` (739M) |
| Big/little-endian integer decode | manual shift-and-mask | sign-extension on a negative value; short buffer silently zero-pads instead of erroring | `byteorder` / `bytes` (749M / 952M) |
| CIDR / IP-prefix containment | string-prefix or hand bitmask | boundary case (`/8`: `9.255.255.255` vs `10.0.0.1`); IPv6 masks | `ipnet` (529M) |
| Great-circle distance/bearing | naive delta-longitude haversine | crossing the antimeridian (178°E ↔ −179°W) or a pole | `geo` (21M) |
| HTML sanitization of untrusted content | blocklist regex on `<script>` | `<img onerror=…>` and malformed/nested tags bypass the blocklist — XSS | `ammonia` (14M) — 🔴 |
| Markdown rendering | regex substitution (`**bold**` → `<b>`) | nested/overlapping emphasis; unescaped literal `<`/`>`/`&` passed through as raw HTML — XSS | `pulldown-cmark` (137M) — 🔴 |
| Content-Type / MIME parsing | `"type/subtype; …".split('/')` | parameters (`; charset=…`) not stripped from the subtype | `mime` (563M) |
| In-process cache eviction (a *bounded* cache whose eviction logic is wrong — distinct from §B14's *unbounded* cache with no eviction at all) | hand-rolled LRU/TTL over a `HashMap` | LRU: `get()` (a read) forgets to bump recency, silently degrading to FIFO; TTL: a sweep that picks "oldest" by iterating a `HashMap` (no ordering guarantee) evicts the wrong entry at scale | `lru` (314M) / `moka` (113M) |

**Considered and deliberately excluded from this catalog** (reviewed against the same gate; kept out of scope rather than silently dropped so a future pass does not re-litigate them): `clap`/argument parsing, `anyhow`/`thiserror`, logging-framework choice, `itertools`, `bitflags`, linear algebra (`nalgebra`), statistics, edit-distance (`strsim`), language/locale detection, `tokio` (already the assumed runtime baseline, not an omitted alternative), full-text search (`tantivy` — performance-shaped, not correctness-shaped, → Substitution catalog), connection pooling (`deadpool`/`bb8` — adjacent to §B14/§C8, deferred pending its own gated verification), consistent-hashing/sharding (`hashring` — real defect shape but weak adoption evidence), HTTP response caching with `Vary` handling (`http-cache` — weak adoption evidence, atypical LLM-authored trigger), Bloom filters (real defect shape, niche audience — deferred), UUID generation, HTML scraping, IP-range matching beyond CIDR containment.

## §C12a. Reinventing infrastructure instead of an established subsystem

**The trap**: one altitude above §C12 — not a missed function call but a missed *subsystem*. The LLM is asked for something that sounds like "just write a file" or "just keep this in memory" and reaches for the naive primitive, when the actual requirement (survives a crash, survives more than one instance of the process) needed engineering the naive primitive does not have.

**Utility-level catalog membership gate applies identically** — a concrete input/scenario, not "the established option is more robust in general."

| Task | Hand-rolled shape | Input where it is silently wrong | Option (downloads) |
|---|---|---|---|
| Persistent key-value/document storage | `fs::write(path, json)` on every update, or an in-memory map flushed periodically | process killed mid-write (crash, OOM-kill, power loss) leaves a truncated/corrupt file — next read loads partial or wrong data, not an error; concurrent writers race on read-modify-write (→ §C2 TOCTOU family) | `rusqlite` (94M, SQL) / `sled` (14M), `redb` (9.4M), `fjall` (1.4M) (pure KV) |
| Any in-process coordination state (cache, dedup set, rate limiter, pub/sub) with no external store | a `static`/`OnceLock`-held in-memory structure as the sole source of truth | the process is horizontally scaled to more than one instance — state silently diverges between replicas: duplicate work, missed events, inconsistent rate-limit counts, no compiler or test signal anywhere | externalize the state (`redis` (94M) is one verified, widely-used option) when multi-instance is a stated requirement — not a blanket mandate to add it otherwise |

**REQUIRED**: same posture as §C12 — propose the named option (subject to §A1 verification and user approval) when one of these shapes is recognized; a user's informed zero-dependency or single-instance decision is not a defect, an undocumented one is.

🟡, escalate to 🔴 only where the specific instance is a stated durability or security guarantee (cross-reference §F1/§F2 documented-guarantee divergence when the project's own docs promise durability or consistency the hand-rolled version does not deliver).

---

## §E5. Work already done — *The cheapest computation is the one you did once and kept.*

- **Where it shows up**: `Regex::new(...)` (or a parser, schema, template) compiled inside the function that uses it, recompiled every call; a pure derived value recomputed instead of cached; unbuffered I/O — one syscall per small `read`/`write`; a serializer allocating a fresh buffer per item; a log line whose fields are formatted eagerly even when the level is filtered out; dynamic dispatch (`Box<dyn Trait>`) on a hot path where the type set is closed.
- **The cheaper move**: hoist compile-once values into `LazyLock`/`OnceLock` (§A2) — not a panicking initializer (§A2); wrap I/O in `BufReader`/`BufWriter`; reuse serialization buffers; let `tracing` defer field formatting (record fields, don't `format!` the message) or guard with `if enabled!`; on a closed type set prefer generics or `enum` dispatch over `dyn` when monomorphization cost is acceptable.
- **Leave it when**: the work is genuinely once-per-process already, the value changes every call, or the indirection keeps the design open and the path is cold.
- 🟡. Cross: §A2.
