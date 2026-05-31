# Rust Intel — Dependencies, Macros & Ergonomics (supply-chain, clone, proc-macro, features, workspace, Deref, recompute cost)

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §A1, §C5, §C6, §C7, §C10, §C11, §E5. Tier labels (🔴/🟡/🟢; A–E) and all cross-references are preserved verbatim.

---

## §A1. Stale APIs, deprecated-not-removed APIs, and slopsquatting

The class here is **APIs that compile but are wrong**, not APIs that don't exist. The pure-hallucination cases (`E0599` "method does not exist") are noise — rustc catches them and the LLM moves on. The cases that survive the compile are: the API existed in an older version of the crate and still exists in the new one with materially different semantics; the API is `#[deprecated]` but not removed; the LLM picked up a method name from a different crate and the name happens to also exist in the named crate; or — worst — the LLM hallucinated a *crate name* that an attacker has since registered on crates.io with a malicious payload.

**The trap, by sub-class:**

- **Stale-but-still-valid APIs.** `tokio` 0.2 `mpsc::channel(_)` returned a different tuple shape than `tokio` 1.x; `rand` 0.8 `thread_rng()` was renamed to `rng()` in 0.9 but the old function lingers in code patterns. The LLM emits the older form, it compiles against the pinned version because the symbol is still present (or trivially adapted), and behavior diverges from the user's mental model.
- **Deprecated-not-removed APIs.** `#[deprecated]` emits a warning, not an error. LLMs routinely ignore the warning channel and ship deprecated calls. Each deprecated call is a future break.
- **Wrong-version-of-crate APIs.** `serde_json::from_str` exists in every version, but `serde_json::Value::take` did not exist before a specific point. The compile succeeds against the pinned version *because the version pinned is recent enough*, but the LLM has no proof of that — it guessed and was lucky.
- **Slopsquatting (supply-chain).** Hallucinated crate names that an adversary has registered on crates.io. Compiles, runs, exfiltrates secrets, and `cargo build --offline` would not have helped (the malicious payload lives inside a dependency the build script reaches for). Published "package-import hallucination" studies (Lanyado / Spracklen) report elevated hallucination rates for Rust crate names relative to other ecosystems; precise figures require checking against the primary source.

**REQUIRED**:
- Before calling any method on a third-party type, check that it exists *with the documented semantics* in the **exact version pinned in `Cargo.toml`**. "It compiled" is not proof — semantics drift across minor versions in pre-1.0 crates.
- For high-churn crates (`tokio`, `axum`, `hyper`, `reqwest`, `sqlx`, `serde`, `tonic`, `tower`, `clap`, `rand`), if uncertain about an API or its semantics, **say so explicitly** and ask the user to confirm or run `cargo doc --open`.
- Treat `#[deprecated]` warnings as errors. If the symbol I want to emit is deprecated in the pinned version, switch to the replacement before writing.
- Pre-1.0 crates (any version with leading `0.`) have **breaking changes between minor versions**. Treat 0.6 → 0.7 with the same suspicion as 1.x → 2.x.

**BANNED**:
- Method calls on types where I have not internally verified the method exists *and means what I think it means* in the pinned version.
- Mixing API styles from different major versions (e.g., axum 0.6 routers with axum 0.7 handlers).
- Adding a crate to `Cargo.toml` that the user did not name and that I have not independently verified exists.

**Security note: slopsquatting**. Hallucinated *crate names* (not just methods) are a supply-chain attack vector that **survives compilation and runs malicious code**. Adversaries monitor common LLM crate-name hallucinations and **register those names on crates.io with malicious payloads**. This is the canonical Tier A category: the LLM's "fix" for "I need a crate that does X" compiles cleanly and silently runs untrusted code.

**Real attack cases (2022–2026)** — these are not hypothetical:
- `rustdecimal` — typosquat of `rust_decimal` (the real crate has ~100M all-time downloads). The malicious crate, documented in the CrateDepression incident (2022), targeted CI pipelines.
- `faster_log`, `async_println` — malicious crates designed to scan for and exfiltrate Solana/Ethereum private keys; reached thousands of downloads before takedown.
- Supply-chain attacks across software ecosystems rose materially in 2025 (published year-over-year estimates cluster around +70–75% ecosystem-wide; no crates.io-specific figure is published).

Concrete defenses:
- I do not add a crate to `Cargo.toml` unless the user explicitly named it OR I verified its existence by reading the project's existing dependencies.
- For any new dependency I suggest, I flag it as a *suggestion to verify*, not a fait accompli: "I'd add `deadpool-postgres` for connection pooling — please verify on crates.io before adding."
- I never invent variations of well-known crate names (`tokio-utils` does not exist, `tokio-util` does; `serde-json` does not exist as a separate crate, `serde_json` does; `rust-decimal` does not exist, `rust_decimal` does — and the typo'd variant has been weaponized).
- Surface every newly-added `Cargo.toml` dependency in the post-flight summary so the user can audit it.

**Build-time code execution (a distinct supply-chain vector).** Slopsquatting is about *hallucinated names*; this is about *what a dependency does at build time*. A crate's `build.rs` and any proc-macro it exports run arbitrary code on the developer's machine and in CI **during `cargo build`**, before any runtime guard exists — this is the mechanism behind the malicious crates above, and such payloads read `~/.cargo/credentials`, `~/.ssh`, `.env`, and CI secrets. A typosquat that swaps `-` for `_` (or appends a language suffix), plus dependency confusion (a private crate name shadowed by a public one on a default registry), are the same class. Defenses: pin exact versions and commit `Cargo.lock`; for a newly-added *direct* dependency that is not a well-known crate, skim its `build.rs`/proc-macro before the first build; and for the transitive graph (which you cannot read by hand) lean on `cargo-deny` / `cargo-audit` (RustSec advisory DB), `cargo-vet` (attest that each dependency has been human-audited), the committed `Cargo.lock`, and `--locked`/vendored builds.

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
- For platform-conditional dependencies with features (`[target.'cfg(...)'.dependencies]`), be aware that `features = [...]` activates globally per Cargo's resolution, not per-target — this is a known Cargo gotcha (see cargo#2524).

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

---

## §E5. Work already done — *The cheapest computation is the one you did once and kept.*

- **Where it shows up**: `Regex::new(...)` (or a parser, schema, template) compiled inside the function that uses it, recompiled every call; a pure derived value recomputed instead of cached; unbuffered I/O — one syscall per small `read`/`write`; a serializer allocating a fresh buffer per item; a log line whose fields are formatted eagerly even when the level is filtered out; dynamic dispatch (`Box<dyn Trait>`) on a hot path where the type set is closed.
- **The cheaper move**: hoist compile-once values into `LazyLock`/`OnceLock` (§A2) — not a panicking initializer (§A2); wrap I/O in `BufReader`/`BufWriter`; reuse serialization buffers; let `tracing` defer field formatting (record fields, don't `format!` the message) or guard with `if enabled!`; on a closed type set prefer generics or `enum` dispatch over `dyn` when monomorphization cost is acceptable.
- **Leave it when**: the work is genuinely once-per-process already, the value changes every call, or the indirection keeps the design open and the path is cold.
- 🟡. Cross: §A2.
