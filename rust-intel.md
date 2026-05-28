---
description: Hard rules for writing Rust in code that already compiles and passes tests but is silently broken, slow, or semver-fragile. Load this BEFORE writing any Rust code. Targets bugs that survive rustc, clippy, and cargo test but fail in production or rot the codebase.
---

# Rust Intel — Defense Against LLM Failure Modes

**Scope, stated up front.** This spec assumes your code already compiles. It assumes `cargo test` is green. That is not enough. The categories below cover the failure modes that survive `rustc`, `clippy`, and the test suite, and only manifest as production incidents, semver breakage, performance collapse under load, or silent data corruption. Compilation-only failures (lifetime variance, trait bound mismatch, GAT lifetime bound errors, object-safety violations through generic methods, cyclic workspace deps, `?` in `main`, HRTB depth, recursive macro limits, self-referential structs in safe Rust, `no_std` reflexive `std::*` imports, `From`/`Into` cycles) are deliberately omitted — `rustc` already catches them and the LLM cannot ship them. This spec covers what ships anyway.

Based on (a) a published 6-month field report on LLM-generated Rust in production (~80k LOC, tokio + sqlx + unsafe hot paths, May 2026 — see [`docs/sources.md`](docs/sources.md)), (b) academic benchmarks RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust, and (c) the empirical error distribution observed across Claude/GPT/Cursor through 2025–2026, plus real supply-chain incidents (CrateDepression 2022, `faster_log`/`async_println` 2025). The rules below cover **forty-one categories** of post-compilation bugs ranging from stale-but-still-valid APIs and slopsquatting (compiles and runs, then exfiltrates secrets) to subtle runtime failures under load — including cancel-safety, drop ordering, UB in `unsafe`, lock-order hazards, supply-chain attacks, cryptographic insecurity, check-then-act races, backpressure leaks, advanced async pitfalls (AFIT, Pin, Waker, `block_on`), equality/hash contracts, runtime borrow panics, manual `Send`/`Sync`, iterator invalidation, `serde` field-presence semantics, `JoinHandle` drop semantics, the non-existence of async `Drop`, `select!` arm side-effect cancellation, timing-attack-prone equality on secrets, panic and ownership across `extern "C"` FFI, channel-and-runtime mismatch, `tracing` span leakage, workspace feature unification, `Deref` polymorphism, and tests that pass by luck. Citations and URLs for every empirical claim live in [`docs/sources.md`](docs/sources.md). They are non-negotiable for any Rust I write.

Industry signal: per Faros AI and Lightrun studies (2026), AI-generated PRs show +242.7% incident rate and 43% require post-merge debugging. Zero surveyed senior engineers rated themselves "very confident" in AI-generated Rust. This is the empirical context this document defends against.

The categories split into four tiers, plus a meta-layer:
- **Self-monitoring**: a triggers table (phrase- *and* code-pattern-based) that maps user-request patterns to risk categories. Scanned before generating code.
- **Tier A — Compile-fix reflexes that leave silent residue (§A1, §A2, §A3)**: not "the compiler caught it and you fixed it correctly", but "the compiler caught it and the cheapest fix compiles while leaving a real defect behind". Stale-but-valid APIs, supply-chain via slopsquatting, reflexive `Arc<Mutex<T>>`, `pub` as a hammer for `E0603` that silently expands the public API.
- **Tier B — Silent correctness bugs (§B1–§B25)**: pass compilation, often pass tests, fail in production. This is where the spec lives. Includes UB, async pitfalls (basic and advanced), lock ordering, memory leaks, silent task dropping, cryptographic insecurity, TOCTOU races, backpressure neglect, Mutex poisoning, equality/hash contracts, runtime borrow panics, manual `Send`/`Sync`, iterator invalidation through indirection, `serde` field-presence drift, `JoinHandle` semantics, the async-`Drop` impossibility, `select!` side-effect cancellation, timing-attack-prone equality on secrets, and panic / ownership across `extern "C"` FFI.
- **Tier C — Architecture and ergonomics (§C1–§C11)**: design-level mistakes that are expensive to undo. Reflexive `.clone()`, procedural macro hygiene, Cargo feature flag hygiene, channel-and-runtime mismatch, `tracing` span leakage, workspace feature unification, `Deref` polymorphism.
- **Tier D — Testing and CI gaps (§D1–§D2)**: code passes tests not because it's correct but because the tests are blind. Timing-based async tests, `#[should_panic]` without `expected`, unit-vs-integration placement drift.

---

## Principle: prove, don't guess

When writing Rust under this command, my role is a **verifying engineer, not a code-completion engine**. The difference matters for every line:

- I generate code I can justify, not code that looks plausible.
- When I'm uncertain about an API, a lifetime, a trait bound, a Drop contract — I say so and ask, rather than producing something that compiles by luck.
- When the context is insufficient to prove correctness, I refuse to generate code and explicitly block (see "Blocking protocol" below).
- "Compiles" and "tests pass" are necessary but never sufficient. The bugs in this document specifically exist in the gap between those signals and actual correctness.

This principle is what activates every rule below. Without it, the rules become a checklist to game; with it, they become a method for catching mistakes I would otherwise make confidently.

The same principle applies to this document's own empirics: every percentage, rate, and sample-size figure cited in the categories below maps to a sourced entry in [`docs/sources.md`](docs/sources.md). Load that file alongside this one when statistical precision matters for your decision.

---

## Blocking protocol

If at any point I lack the context required to satisfy this command's rules, I do not "best-effort guess". I emit a blocking message in this exact format and stop:

```
⚠️ BLOCKED: <one-line reason — what I cannot verify>
NEEDED:
  - <specific item 1, e.g. "exact versions of tokio and sqlx from Cargo.toml">
  - <specific item 2, e.g. "definition of the `Database` trait this is implementing against">
  - <specific item 3, e.g. "expected behavior on commit failure: retry, propagate, or rollback to checkpoint?">
```

Cases where I block rather than guess:
- Crate versions are unknown for any dependency I'd need to call API on (§A1).
- Trait definitions are missing for a trait I'm asked to implement against (§C1).
- I would need to design a new trait hierarchy from scratch (operating mode rule 3).
- Drop semantics matter for the task and I don't know the library version (§B4).
- Cancel-safety is required and I cannot determine the cancellation context (§B3).
- The user asks for `unsafe` code but the invariants the caller will uphold are unstated (§B5).

A blocking message is not failure. Generating code that compiles, passes tests, and leaks resources in production *is* failure. Blocking is how that failure is prevented.

---

## Operating mode

Whenever this command is loaded, before generating any Rust code I will:

1. **Pin the world.** Read `Cargo.toml` (and `CLAUDE.md` if present) for exact crate versions of `tokio`, `axum`, `sqlx`, `reqwest`, `serde`, `hyper`, `clap`, and any other major dependency. State the assumed versions in a comment block at the top of the response. If versions are unknown and cannot be read, **ask** rather than guess. *RustEvo² shows pass@1 drops from 56.1% to 32.5% on post-cutoff APIs — guessing is the dominant source of API hallucinations.*

2. **Map the project idioms.** If `CLAUDE.md`, `README.md`, or top-level docs declare project conventions (error type, logging crate, runtime, lint level), follow those. Do not introduce a new error-handling style, a new async runtime, or a new logging crate without explicit permission.

3. **Refuse to design trait hierarchies blind.** For any new public trait, propose the signature in plain text first and wait for approval before writing impls. LLMs make strategic mistakes here (object safety, sealed vs open, blanket impls) that are expensive to undo. Drafting is fine; committing is not.

4. **Refuse `unsafe` without `// SAFETY:`.** Every `unsafe` block must be preceded by a `// SAFETY:` comment naming every invariant the operation relies on. No exceptions, including "obvious" cases.

5. **Annotate every `async fn` with cancel-safety.** See §B3. A doc comment line is mandatory: `/// cancel-safe: yes` or `/// cancel-safe: NO — <reason>`.

6. **Show the caller for non-trivial lifetimes.** Any function returning `&T` derived from inputs requires at least one example call site in a comment or test — two consecutive calls with disjoint inputs — before the signature is final. See §B1.

7. **Surface everything risky in the summary.** When work is complete, list every occurrence of: `unsafe`, `unwrap`, `expect`, `transmute`, `Arc<Mutex<_>>`, manual `Send`/`Sync` impl, blanket impl, `panic!`, `unimplemented!`, `todo!`. Line numbers and justification each.

---

# Self-monitoring: prompt triggers that activate failure modes

Before generating code, I scan the user's request for triggers below. If a trigger fires, the linked category is on heightened alert. This is the meta-rule: **knowing why I would make a mistake here is half the defense**.

| User request contains... | Activates category | Specific risk |
|---|---|---|
| "cache", "memoize", "store results" with returned `&T` | §B1 lifetime laundering | One `'a` for input and cache, collapsing lifetimes |
| "shared between threads", "concurrent", "from multiple tasks" | §B2 Mutex across .await; §A2 smart pointer misuse | Default to `std::sync::Mutex`, reflexive `Arc<Mutex<T>>` |
| "with timeout", "select!", "cancel", "race two futures" | §B3 cancel safety | Silent partial state, no cancel-safe annotation |
| "transaction", "rollback", "commit" | §B4 Drop and RAII | Library-specific Drop semantics on commit failure |
| "fast", "zero-copy", "performance", "parse bytes", "from network" | §B5 unsafe UB | `ptr::read` on unaligned buffers |
| "fix this borrow error", "make this compile", "lifetime issue" | §C5 reflexive clone | `.clone()` as silencer of real ownership problem |
| "implement trait for any T", "generic Display", "blanket impl" | §C1 semver hazard | Open blanket impl in public API |
| "buffer of size N" where N is large | §B7 stack overflow | `[u8; N]` by value or `Box::new([0u8; N])` |
| "parse this", "convert from string" | §C2 error handling | `.unwrap()` instead of typed error |
| "use the latest version of X", "modern Y" | §A1 API hallucinations | Memory of pre-cutoff API for fast-evolving crates |
| Code involves crate version 0.x | §A1 pre-1.0 churn | Breaking changes between minor versions |
| "send notification", "fire and forget", "log this event async" | §B8 silent task dropping | Forgotten `.await`, future never polled |
| "lock the X and the Y", "two shared resources", "atomic update across two" | §B9 ABBA deadlock | Locks acquired in opposite orders |
| "tree with parent links", "graph structure", "bidirectional", "scene graph", "DOM-like" | §B10 reference cycles | Symmetric `Rc<RefCell>` without `Weak` |
| "read a file", "make HTTP request", "sleep", "wait N seconds" in async context | §B11 blocking executor | `std::fs`/`std::thread::sleep` in `async fn` |
| "add this dependency", "use crate X for Y", "what crate should I use" | §A1 slopsquatting | Hallucinated crate name → supply-chain attack |
| "encrypt", "decrypt", "hash a password", "JWT", "TLS", "sign this", "AES", "AEAD" | §B12 crypto insecurity | Nonce reuse, weak primitives, hallucinated crypto API |
| "public API", "library", "publish to crates.io", "what should the signature be" | §B1 lifetime leaking; §C1 blanket impls | `'a` in public signatures, semver hazards |
| "lazy cache", "memoize", "compute if absent", "deduplicate concurrent requests", "ensure only once" | §B13 TOCTOU | `contains_key` + `insert` race; should be `entry().or_insert_with` |
| "background worker", "event queue", "log pipeline", "broadcast to subscribers", "producer-consumer" | §B14 unbounded queue | `unbounded_channel` instead of bounded + backpressure policy |
| "trait with async method", "trait Foo { async fn ... }", "trait object" | §B15 AFIT | Missing `+ Send` bound, not spawn-able |
| "implement Future manually", "custom Poll", "wake the task" | §B15 Waker | `Poll::Pending` without registering waker → hang forever |
| "block_on this from a helper", "synchronous wrapper for async" | §B15 nested runtime | `block_on` inside async context → panic |
| "Pin this", "self-referential struct", "Pin::new_unchecked" | §B15 Pin misuse | Unsafe Pin without proving non-movement |
| "procedural macro", "derive macro", "proc-macro2", "syn"/"quote" | §C6 macro hygiene | Bare `Option`/`Result` paths, `panic!` in macro errors |
| "feature flag", "conditional compilation", "cfg attribute" | §C7 feature hygiene | Typo'd feature names silently become dead code |
| "singleton", "global state", "OnceLock", "lazy_static", "once_cell" | §B13 TOCTOU; §B17 reentrant borrow | Init race; reentrant `borrow_mut` panic |
| "retry", "exponential backoff", "retry with jitter" | §B3 cancel safety; §B14 unbounded queue | Cancellation between retry and ack; retry buffer growth |
| "rate limit", "throttle" | §B14 backpressure | Unbounded queue feeding the limiter |
| "batch", "buffer messages", "coalesce" | §B14 backpressure; §C8 channel choice | Wrong channel for the producer/consumer fanout |
| "compare token", "verify signature", "check password hash", "verify MAC", "validate HMAC" | §B24 timing attack | `==` on secret material is a network-observable side channel |
| "deserialize JSON", "parse config", "load YAML", "decode payload" | §B20 serde field-presence | `null` vs absent collapse; `untagged` variant overlap |
| "tracing span", "log context", "instrument", "correlation id" | §C9 span leakage | `tokio::spawn` without `.in_current_span()` |
| "close connection", "shutdown gracefully", "flush buffer", "drain on exit" | §B4 Drop semantics; §B22 async Drop is not real | Library-specific Drop; async cleanup in `Drop::drop` |
| "workspace", "shared crate", "feature unification", "internal feature" | §C10 workspace unification | `dev-dependencies` features leak into release builds |
| "channel", "mpsc", "broadcast", "queue", "fan-out", "fan-in" | §C8 channel/runtime mismatch; §B14 backpressure | Wrong channel kind for the runtime + unbounded default |
| "shared mutable state", "interior mutability", "shared between callbacks" | §A2 smart pointer; §B17 reentrant borrow; §B18 manual Send/Sync | Reflexive `Arc<Mutex<T>>`; reentrant `RefCell`; `unsafe impl Send` |
| "wrap a type", "thin wrapper", "extension type", "augment an existing struct" | §C11 Deref antipattern; §C1 newtype + `repr(transparent)` | Fake inheritance via `Deref`; missing `#[repr(transparent)]` |
| "async cleanup", "destructor closes resource", "RAII for async resource" | §B22 async Drop is not real | `tokio::spawn` from `Drop`; `block_on` from `Drop` |
| "spawn a task", "background task", "fire and forget", "spawn and forget" | §B21 JoinHandle semantics; §B8 silent task drop; §C9 span leakage | Dropped `JoinHandle` ≠ abort; missing `.in_current_span()` |
| "hash this", "use as a map key", "deduplicate by", "compare structurally" | §B16 Eq/Hash contract | Manual `PartialEq` without matching `Hash`; `f64` as key |
| "BFS", "DFS", "tree traversal", "walk the graph", "iterate and modify" | §B19 iterator invalidation | Mutating through `RefCell`/indices while iterating |
| "untagged enum", "polymorphic JSON", "shape-dispatch" | §B20 serde untagged | Overlapping variant shapes; silent mis-match |
| "Stream", "futures::Stream", "async iterator", "while let next" | §B15 Stream vs Iterator | `for x in stream` doesn't compile; missing `StreamExt` |
| "select!", "race two futures", "first one wins" | §B3 cancel safety; §B23 select arm side effects | Side effect on losing arm broken by cancellation |
| "deadline", "wall clock timeout" | §D1 tests by luck; §B3 cancel safety | `thread::sleep` in tests; cancellation between deadline arms |
| "test that this panics", "should_panic", "expected panic" | §D1 tests by luck | `#[should_panic]` without `expected` catches any panic |
| "MaybeUninit", "uninitialized memory", "zero-init buffer" | §B5 unsafe; §B7 large stack | `mem::uninitialized` is UB; `Box::new([0;N])` is on stack |
| "FFI", "bindgen", "C library", "extern C", "native bindings", "wrap a C API" | §B25 FFI ABI; §B5 unsafe | Panic across `extern "C"`; allocator mismatch on `Box::from_raw`; `cap`-mismatched `Vec::from_raw_parts` |

**Triggered by code, not phrase** — when the user's input *contains code that matches any of these patterns*, the linked categories activate even if no English phrase fires:

| Code pattern in user input | Activates |
|---|---|
| `async fn` with a `Mutex<...>` field or local `MutexGuard` | §B2 (lock across `.await`), §B11 (blocking executor) |
| `Rc<RefCell<...>>` anywhere | §A2 (smart pointer choice), §B17 (reentrant borrow), §B10 (cycle) |
| `unsafe impl Send for ...` / `unsafe impl Sync for ...` | §B18 (manual Send/Sync) |
| `tokio::spawn(...)` whose returned `JoinHandle` is not bound, not awaited, not detached-by-design | §B21 (dropped JoinHandle ≠ abort), §B8 (silent task drop) |
| `impl Drop` containing `.await`, `block_on`, or `tokio::spawn` | §B22 (async Drop is not real) |
| `impl Deref<Target = ...> for ...` on a non-pointer-like wrapper | §C11 (Deref polymorphism) |
| `#[serde(untagged)]` enum | §B20 (variant shape overlap) |
| `if X { map.insert(...) }` or `cache.contains_key + cache.insert` | §B13 (TOCTOU) |
| `==` / `!=` on `&[u8]` / `Vec<u8>` / `String` adjacent to "token", "tag", "hash", "signature" | §B24 (timing attack) |
| Manual `impl PartialEq` or `impl Ord` on a type used as `HashMap`/`BTreeMap` key | §B16 (Eq/Hash contract) |
| `tokio::select! { ... }` with side effects inside any arm body | §B23 (arm side effects) |
| `tokio::spawn` inside a function with an active `tracing::Span` | §C9 (span leakage) |
| `mem::transmute`, `ptr::read`, `slice::from_raw_parts` | §B5 (UB-prone unsafe) |
| `Box::new([0u8; N])` where `N` is large | §B7 (stack overflow before placement) |
| `extern "C" fn` body, `#[no_mangle]`, `Box::into_raw`/`Box::from_raw`, `Vec::from_raw_parts` | §B25 (FFI ABI and ownership), §B5 (UB-prone unsafe) |

When two or more triggers fire in one request, treat it as a high-risk task and explicitly enumerate which categories I'm guarding against in my response.

---

# TIER A — Compile-fix reflexes that leave silent residue

Tier A is not "bugs the compiler catches and stops". The compiler does its job — the bugs that matter here are the *next move*: the LLM sees a red squiggle and reaches for the cheapest fix that compiles, and the cheapest fix compiles **while leaving a real defect behind**. Stale-but-still-valid APIs, deprecated-not-removed APIs, wrong-version-of-crate behaviors, hallucinated crate names that someone else registered as malware, reflexive `Arc<Mutex<T>>`, and `pub` as a hammer for `E0603` are the canonical examples. The compiler is your friend; this tier is about the moments when you ignore that friend's structural signal and silence the symptom.

*Categories whose primary failure mode is a compile error and which leave no silent residue — lifetime variance, trait bound mismatch (E0277/E0308), GAT lifetime bound errors, object-safety violations through generic methods, cyclic workspace deps, `?` in `main`, `From`/`Into` cycles, recursive macro limits, HRTB depth, no_std reflexive `std::*`, self-referential structs in safe Rust, and MSRV mismatches — are deliberately omitted from this spec. The compiler already catches them. An earlier draft of this spec included a Tier A category for trait bounds and type mismatches; it was retired in v0.3.0 on the same scope grounds, and the remaining Tier A categories were renumbered to close the gap.*

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
- `rustdecimal` — typosquat of `rust_decimal` (the real crate has ~3.5M downloads). The malicious crate, documented in the CrateDepression incident (2022), targeted CI pipelines.
- `faster_log`, `async_println` — malicious crates designed to scan for and exfiltrate Solana/Ethereum private keys; reached thousands of downloads before takedown.
- Supply-chain attacks on Rust ecosystem rose ~130% in 2025 per industry reports.

Concrete defenses:
- I do not add a crate to `Cargo.toml` unless the user explicitly named it OR I verified its existence by reading the project's existing dependencies.
- For any new dependency I suggest, I flag it as a *suggestion to verify*, not a fait accompli: "I'd add `deadpool-postgres` for connection pooling — please verify on crates.io before adding."
- I never invent variations of well-known crate names (`tokio-utils` does not exist, `tokio-util` does; `serde-json` does not exist as a separate crate, `serde_json` does; `rust-decimal` does not exist, `rust_decimal` does — and the typo'd variant has been weaponized).
- Surface every newly-added `Cargo.toml` dependency in the post-flight summary so the user can audit it.

## §A2. Smart pointer misuse (reflexive `Arc<Mutex<T>>`)

**The trap**: this is Tier A because the LLM reaches for `Arc<Mutex<T>>` *in response to a compile error* — "needs to be Send, needs to be shared, needs interior mutability" — and the resulting code compiles, runs, and passes tests. The defect that survives is **structural**, not functional: gratuitous lock contention, wrong concurrency model, false sense that a critical section exists, refactor cost when the read/write ratio later argues for `Arc<RwLock<T>>`, `arc-swap`, or `Arc::make_mut`-style copy-on-write. The reverse trap — `Rc<RefCell<T>>` chosen for "local mutability" and later forced across threads — is the same shape: the original compile-time fix locked in a structural choice that the rest of the program then has to bend around.

**REQUIRED**:
- `Arc` only when ownership is genuinely shared across threads or async tasks. Single-owner sharing → `&` or `&mut`.
- `Mutex` only when interior mutability is actually needed. Read-only shared data → `Arc<T>` is enough.
- For shared data that is **mostly read, occasionally swapped wholesale**, prefer `arc_swap::ArcSwap<T>` or rebuild-then-`Arc::new`-and-swap, not `RwLock`.
- For **copy-on-write semantics on a single-owner-most-of-the-time `Arc`**, use `Arc::make_mut(&mut arc) -> &mut T` (clones the inner only if `strong_count > 1`). Mirror: `Rc::make_mut` for the non-thread-shared analog. For `Cow<'_, T>` semantics on borrow-or-own returns, prefer `std::borrow::Cow`.
- `Rc` and `RefCell` are **forbidden** in any code path that may be called from `tokio::spawn` or any other multi-threaded executor. If unsure → use `Arc` and `Mutex`/`RwLock` from `tokio::sync` or `std::sync` per §B2.
- `Box<T>` for `T: Sized` of small size (≤ 2 × pointer size) is almost always wrong. Don't box `i64`, `Option<u32>`, or small enums.

**BANNED**:
- `Arc<Mutex<T>>` where `T` is only ever read after construction. Use `Arc<T>` (or `ArcSwap<T>` if it must change).
- `Arc<RwLock<T>>` for write-heavy workloads. Profile first; `Mutex` is often faster.
- Cloning the inner `T` via `(*arc).clone()` when `Arc::make_mut` would be both cheaper (on the unique-owner path) and clearer.

## §A3. `pub` as a hammer for `E0603`

**The trap**: `rustc` emits `E0603` ("module/item is private"). The cheapest fix is to add `pub`. The fix **compiles** — and silently enlarges the crate's public API surface, making every item now-`pub` a semver commitment. For library crates this is load-bearing: removing or renaming the item is now a breaking change. For binary crates it leaks internal abstractions out of their module, encouraging unrelated code to depend on them.

**REQUIRED**:
- When `E0603` fires, the first question is *where the call site lives*, not *how to make the symbol visible*. If the caller is inside the same crate, the answer is almost always `pub(crate)`. If the caller is in a parent module, `pub(super)`. `pub` (the unrestricted form) is only the right fix when the symbol is genuinely part of the crate's public API.
- New types default to private. Promote to `pub(crate)` only when needed across modules; promote to `pub` only when intended as part of the public API.
- Never re-export types via `pub use` from a public module without confirming they should be part of the public surface.
- For library crates: every `pub` item is a semver commitment. Treat `pub fn` as load-bearing. Surface every newly-`pub` item in the post-flight summary so the user can confirm the visibility decision.

**BANNED**:
- Reaching for `pub` to silence `E0603` without considering `pub(crate)` / `pub(super)` / `pub(in path)` first.
- Adding `pub` to a struct field to silence an access error inside the same crate.

---

# TIER B — Silent correctness bugs

These pass `cargo build`, often pass `cargo test`, and fail in production. The twenty-four categories below are the ones that hurt — and this is where the spec's real value lives. *We assume your code already compiles. We assume your tests pass. That's not enough.*

**Why this tier exists**: high compilation rate is not correctness. The published 2026 field report on ~80k LOC of LLM-generated tokio/sqlx code (see [`docs/sources.md`](docs/sources.md)) shows that **§B2 alone (`Mutex` across `.await`) was responsible for failure in roughly half of async tasks** before defensive prompting cut it sharply; SafeGenBench shows static analyzers miss **~57% of vulnerabilities** in LLM-generated crypto Rust that *does* compile (§B12). The category list below is structured around this gap between `cargo test` green and actual correctness — see [`docs/sources.md`](docs/sources.md) for the full evidence trail.

## §B1. Lifetime laundering and lifetime leaking

Two distinct lifetime traps LLMs make with high frequency. They look similar from the outside (both involve `<'a>` in a signature where it shouldn't be) but the diagnostic and the fix are different. Treat them as separate sub-categories.

### §B1a. Lifetime laundering

**The trap**: one `'a` parameter binds both an input and a cached output, hiding a lifetime collapse from the local view. The signature compiles in isolation but the function becomes uncallable in practice.

**Why this happens**: the transformer's attention doesn't extend beyond the function body. Locally, `<'a>` looks elegant; the cross-function constraint is invisible.

**BANNED pattern (synthetic):**
```rust
fn lookup<'a>(s: &'a str, cache: &mut HashMap<String, &'a str>) -> &'a str { ... }
//                                                       ^^^ caller's `s` lifetime
//                                                       leaks into the cache type
```
Compiles in isolation; collapses to an empty lifetime when called twice with different inputs.

**BANNED pattern (realistic — typical LLM output for "add caching"):**
```rust
use std::collections::HashMap;

fn first_word<'a>(s: &'a str, cache: &mut HashMap<String, &'a str>) -> &'a str {
    if let Some(cached) = cache.get(s) {
        return cached;
    }
    let word = s.split_whitespace().next().unwrap_or("");
    cache.insert(s.to_string(), word);
    word
}
```
Compiles, passes unit tests with a single input. Fails the moment a second call site passes a `&str` with a different lifetime: the cache forces all entries to share one `'a`, which the borrow checker collapses to the empty intersection.

**Prompt triggers that produce this**: "add caching to this function", "memoize", "speed up by storing results", "build a lookup". Whenever the user mentions caching of returned references, this category activates.

**REQUIRED**:
- Separate input and output lifetimes (`<'input, 'cache>`) when they should be independent, OR store owned data (`HashMap<String, String>`).
- For any function returning `&T` derived from inputs, write a comment showing two consecutive calls with disjoint inputs before the signature is final.
- Higher-Ranked Trait Bounds (`for<'a> Fn(&'a T) -> &'a U`) deserve extra care: do not drop `for<'a>` when generalizing.

### §B1b. Lifetime leaking through public APIs

**The trap**: exposing `'a` in a *public* function signature when the lifetime is an implementation detail. The function compiles, the lifetime is genuine, and the signature is technically more "zero-copy" than the alternative — but every downstream caller is now forced to juggle that lifetime through their own code.

**Distinct from §B1a**: laundering is *one `'a` binding too many things inside one function*; leaking is *exposing an `'a` in a `pub` signature that should not have been part of the public API at all*. A function can suffer from leaking without any laundering, and vice versa.

**BANNED in published library APIs unless zero-copy is an explicitly documented design goal**:
```rust
// Forces every caller to track 'a through their own code:
pub fn parse<'a>(source: &'a str) -> Document<'a> { ... }
```

**REQUIRED**:
- Default to owned return types in public APIs: `pub fn parse(source: &str) -> Document { ... }` where `Document` owns its data.
- If zero-copy is a real design requirement, document it explicitly and consider exposing both variants (`parse` returning owned + `parse_borrowed` returning the lifetime-parameterized version) so callers opt in.
- Surface every `pub fn` with a non-`'static` output lifetime in the post-flight summary so the user can confirm the lifetime is intentional, not residual.

## §B2. `std::sync::Mutex` held across `.await`

**The trap**: LLMs default to `std::sync::Mutex` because it dominates training data. Holding it across `.await` violates tokio's contract and can deadlock under load. `clippy::await_holding_lock` catches only ~30% of cases (misses guards hidden in closures, `if let`, early-return blocks). Statistics: in the 2026 field report (~80k LOC), this single category was the proximate cause of failure in roughly half of async tasks; pinning crate versions in the prompt cut it sharply.

**BANNED** in any function annotated `async`, called from `tokio::spawn`, or used in a tokio runtime context:
- `std::sync::Mutex` / `parking_lot::Mutex` whose guard lives across a `.await`.
- `std::sync::RwLock` whose guard lives across a `.await`.
- `RefCell` or `Rc` anywhere reachable from async tasks crossing thread boundaries.

**REQUIRED**:
- For data shared across `.await` points → `tokio::sync::Mutex` / `tokio::sync::RwLock`.
- For data accessed only synchronously inside an async block → `std::sync::Mutex` is fine, but **the guard must be dropped before any `.await`**. Write the drop explicitly:
  ```rust
  let value = {
      let guard = mutex.lock().unwrap();
      guard.get(&key).cloned()
  };  // guard dropped here
  some_async_op(value).await
  ```
- Run `cargo clippy -- -W clippy::await_holding_lock` after writing async code touching locks.

**Related anti-pattern: Mutex poisoning cascade.** When a thread panics while holding a `Mutex`, the Mutex is "poisoned": all subsequent `.lock().unwrap()` calls panic too. LLMs copy `.lock().unwrap()` from std/serde examples without considering poisoning. One unrelated panic in production cascades into every code path that touches that Mutex.

- For non-trivial code, handle poison explicitly:
  ```rust
  let guard = mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  ```
- Or use `parking_lot::Mutex` (no poisoning by design) if poison-aware recovery is not needed.
- Surface every `.lock().unwrap()` in the post-flight summary.

**Related anti-pattern: oversized critical section.** A `MutexGuard` held across I/O, heavy compute, logging, or any non-trivial operation creates contention even when it doesn't violate any rule. It compiles, tests pass, but production throughput collapses under load.

- The body of a `lock()` block should be: read/write a few fields, clone what's needed, drop the guard. Anything else (I/O, allocation, parsing, logging, format!) goes outside.
- If a critical section grows beyond ~10 lines, it's a candidate for restructuring.

## §B3. Async cancellation (THE BIG ONE)

**The trap**: futures in Rust are cancellable at every `.await` point. Cancel safety is **not visible in any signature**. Borrow checker doesn't help. Clippy doesn't help. Documentation for each tokio function must be read individually (`AsyncReadExt::read` is cancel-safe, `read_exact` is not). In the 2026 field report, **zero** models across the timeout-using benchmark tasks spontaneously mentioned cancel safety; when asked directly, they answered "yes, it's cancel-safe" confidently and incorrectly in ~50% of cases.

**Critical warning about my own reasoning**: in empirical testing, approximately half of LLM-generated assessments of cancel-safety were *confidently wrong* — the model labeled a not-cancel-safe function as "cancel-safe because all `.await` points are idempotent" or similar plausible-sounding justifications. This is a known failure mode: I am especially prone to overconfidence in this area. **When I annotate a function as cancel-safe, I must enumerate every `.await` point and prove cancel safety for each, not assert it.**

**REQUIRED for every async fn I write**:
- A doc comment line: `/// cancel-safe: yes` or `/// cancel-safe: NO — <reason>`.
- If not cancel-safe, justify by listing the await points where partial state would leak (DB write committed but ack not sent, file written but rename not done, etc.).
- If a function performs `db.write` then `network.send_ack`, it is **not cancel-safe**. Do not call it from `tokio::select!` or with `tokio::time::timeout` without wrapping in `tokio::spawn` to detach from the cancellation tree.

**Pattern for the not-cancel-safe boundary**:
```rust
/// cancel-safe: yes (read is cancel-safe, write+ack is detached via spawn)
async fn handle(stream: TcpStream, db: Arc<Db>) -> Result<()> {
    let data = read_message(&stream).await?;  // cancel-safe up to here
    // Critical section detached from caller cancellation:
    tokio::spawn(async move {
        db.insert(&data).await?;
        send_ack(&stream).await?;
        Ok::<_, Error>(())
    }).await?
}
```

**Specifically cancel-UNSAFE in tokio (memorize)**:
- `AsyncReadExt::read_exact`, `read_to_end`, `read_to_string`
- `AsyncWriteExt::write_all`. NOTE: `write_buf` is cancel-safe (single-shot, equivalent to `poll_write`); `write_all_buf` is cancel-safe-with-caveat — the buffer may be partially advanced on cancellation, so the caller must reason about the remaining bytes rather than retry from scratch.
- `tokio::io::copy` — cancel-safety is not documented in tokio's `AsyncRead`/`AsyncWrite` cancel-safety guide; treat as unsafe pending explicit confirmation against the tokio version pinned in `Cargo.toml`.
- Anything that wraps the above (e.g., custom `read_message` that calls `read_exact` internally inherits the not-cancel-safe property).

**BANNED**:
- Calling a function with `db.write().await; send_ack().await` directly under `tokio::select!` or `tokio::time::timeout`.
- Claiming a function is "cancel-safe because all `.await` points are idempotent" without proving each one (idempotence is necessary but not sufficient; you also need atomic recovery from any partial state).
- `stream.next().then(|x| async move { ... .await ... })` — if the inner async block contains any `.await`, the entire chain is not cancel-safe: cancellation between `next()` resolving and the inner await completing loses the item from the stream.

## §B4. Drop order and RAII contracts

**The trap**: implicit `Drop` for transactions, file handles, async resources has library-specific contracts. `sqlx` implicit-rolls-back inside the async runtime (blocking). `deadpool-postgres` sends rollback to a background task that may never run. The semantics live in library source, not signatures.

**REQUIRED** for any DB transaction / file handle / network resource:
- After the last fallible operation that might fail (e.g., `tx.commit().await`), **assume the resource's `Drop` runs in an undefined state**. Do not rely on it for correctness.
- For transactions: explicit `commit().await?` on success path, explicit `rollback().await?` on error path, **and** acknowledge the failure mode of `commit().await` itself failing (the tx is then in a library-specific state — check the docs).
- Read the version-specific `Drop` impl docs for the library being used. State the version you assumed in a comment.
- Be aware that holding multiple drop-significant guards (file + DB tx + lock) creates an ordering problem: Rust drops in reverse declaration order, but the *correct* order depends on the semantics. State which order matters.

## §B5. Unsafe that looks safe (high UB rate in small-N studies)

**The trap**: code passes review and tests because UB doesn't manifest on typical inputs. In the small-N audit cited in [`docs/sources.md`](docs/sources.md), out of 40 LLM-generated `unsafe` blocks: 13 were UB on any input, 9 were UB on specific inputs (alignment, OOB, Stacked Borrows violations), 18 were correct — i.e. 22/40 (~55%) exhibited UB. The *exact rate* is directional (small sample, not stratified by model or domain), but the *pattern* — that LLM-generated `unsafe` is significantly more dangerous than LLM-generated safe code — is consistent across every published audit to date. Treat any LLM-generated `unsafe` block as high-risk until proven otherwise via miri + manual invariant audit.

**BANNED**:
- `std::ptr::read(p)` / `*p` / `&*p` where the source pointer's alignment is not statically known to match `T`. Use `std::ptr::read_unaligned` / `std::ptr::write_unaligned` instead (`<[T]>::align_to::<U>` is itself `unsafe` and requires the same `Pod`-style invariants as `transmute` — do not list it in the "safe alternatives" bucket).
- `transmute` between types whose layouts aren't both `#[repr(C)]` (or another pinned repr — `#[repr(transparent)]`, `#[repr(u32)]`, `#[repr(packed)]`, etc.). The default layout (`#[repr(Rust)]`) does not guarantee field order, padding, or stability across compiler versions, so the bytes may not be reinterpretable as the target type — the `transmute` is UB in practice. The attribute `#[repr(Rust)]` itself is stable (it is the default and can be written explicitly); the *layout it implies* is unspecified.
- Any `unsafe` block without `// SAFETY:` preceding it that names every invariant.
- Creating a `&mut T` from a `*mut T` while another reference to the same data still exists (Stacked Borrows violation, caught by miri).
- `mem::uninitialized::<T>()` — deprecated since Rust 1.39 (October 2019) precisely because it is **instant UB for any type with invariants**. The function returns an "undef" value the optimizer is free to assume is initialized; for `bool`, `&T`, `Box<T>`, `NonZero*`, and any enum with restricted discriminants, the call is UB on the very next read. Use `MaybeUninit::<T>::uninit()`.
- `mem::zeroed::<T>()` for any `T` whose all-zero bit pattern is not a valid value: `bool`, `&T`, `&mut T`, `Box<T>`, `NonZero*`, function pointers, enums whose discriminants do not include 0, and `#[repr(transparent)]` wrappers over any of the above. The function compiles for *every* `T` regardless of whether zero is a valid bit pattern; the compiler will not stop the misuse.
- Marking a public function `pub fn` when its contract actually requires invariants from the caller. If the caller must uphold something for safety, it is `pub unsafe fn`.

**REQUIRED**:
- `// SAFETY:` comment listing each invariant in the form `// SAFETY: ptr is valid for reads of size_of::<T>(), is properly aligned (allocated via Layout::new::<T>()), and outlives this borrow.`
- Add miri to CI for files containing `unsafe`: `cargo +nightly miri test`. Yes, 10× slower; the one UB caught pays for it.
- Default to safe abstractions (`zerocopy::FromBytes`, `bytemuck::Pod`/`bytemuck::cast_slice`, `slice::chunks_exact`) before reaching for raw pointers. (`bytes::Bytes` is a refcounted *buffer container*, not a safe-transmute abstraction — don't confuse the two.)
- Note: `<[T]>::align_to::<U>` is itself `unsafe` and requires the same `Pod`-style invariants as `transmute`; use it only when `bytemuck`/`zerocopy` aren't available, and with a `// SAFETY:` block per the rule above.
- **`MaybeUninit<T>` discipline**: for any value initialized piecewise (field-by-field) or by an FFI/`unsafe` call writing into Rust memory, use `MaybeUninit::<T>::uninit()` (or `MaybeUninit::<T>::zeroed()` when zero is a valid bit pattern for `T`), write every byte/field, then call `.assume_init()`. Never call `.assume_init()` while any portion of `T` is still undef. The legacy `mem::uninitialized` / `mem::zeroed` paths are BANNED above for the same reason: they bypass this discipline and produce UB on the first read.
- **Strict provenance (Rust 2024 edition)**: prefer the strict-provenance API (`ptr.with_addr(addr)`, `ptr.addr()`, `ptr.expose_provenance()`, `core::ptr::with_exposed_provenance::<T>(addr)`) over the legacy `ptr as usize` and `usize as *const T` casts. The cast form loses provenance information that miri can otherwise verify; under strict-provenance lints the cast is a warning, and under sanitizers it is unsound.
- **`slice::from_raw_parts(data, len)` invariants** — list before calling: `data` is non-null, properly aligned for `T`, points to `len` consecutive properly-initialized `T`s, the memory it points to is not mutated for the lifetime of the returned slice, and `len * size_of::<T>() <= isize::MAX`. Mirror for `from_raw_parts_mut`, plus exclusive access. Every call site states each invariant in its `// SAFETY:` block.
- For FFI: every `extern "C"` function takes/returns `#[repr(C)]` types only. `String` and `Vec` cannot cross the FFI boundary; use `CString` / `*const c_char` for strings, and either `Vec::into_raw_parts` (**stable since Rust 1.93**) or the manual `(ptr, len, cap)` decomposition via `ManuallyDrop<Vec<T>>` (stable since 1.0) for buffers — the manual form is the right choice for any MSRV below 1.93. See §B25 for the full FFI ownership discipline.

## §B6. Pattern matching exhaustiveness drift

**The trap**: a `match` written today is exhaustive. After someone adds a new enum variant, it may silently become non-exhaustive only in `if let` form, or use a wildcard `_ => ...` that swallows the new case.

**REQUIRED**:
- For every `match` on an enum I do not own: assume the enum is `#[non_exhaustive]` and handle the fallback explicitly with a logged/typed error, not silent ignore.
- For every `match` on an enum I own: avoid wildcard arms unless I want adding-a-variant to compile silently. Use explicit arms.
- For every `if let Some(x) = ...` on a `Result` or option-chain that could grow new "interesting" failure modes, prefer `match` with explicit arms.

**BANNED**:
- `_ => unreachable!()` or `_ => panic!()` for enums where new variants could legitimately be added.
- `_ => Ok(())` swallowing an error case.

## §B7. Large stack allocations and arena pitfalls

**The trap**: `[u8; 1_048_576]` on the stack overflows in debug builds. `Box::new([0u8; N])` constructs on the stack first and may overflow before placement-new optimizations kick in (release-mode dependent, never reliable).

**The right threshold to think in**: not page size (4 KiB), but the actual stack budget of the executing thread. Default stack budgets are **8 MiB on Linux for the main thread**, **2 MiB on `std::thread::spawn`-ed threads**, and **2 MiB on tokio tasks** (configurable via `Builder::stack_size` and `tokio::runtime::Builder::thread_stack_size` respectively, but the defaults are the budget LLM-generated code actually runs against). Practical rule: stay below ~64 KiB on the stack for routine values; anything beyond that, heap is mandatory.

**BANNED**:
- `[T; N]` whose total size is a meaningful fraction of available stack — concretely, anything beyond ~64 KiB by value, returned by value, or passed by value through a function chain.
- `Box::new([0u8; N])` for any N at risk — this is the trap: the array is built on the stack first and *then* moved to the heap, so the stack-overflow window is unchanged from the by-value form. Use `vec![0u8; N].into_boxed_slice()` or `Box::<[u8]>::new_uninit_slice(N)` instead.
- Recursive functions with large local arrays.

**REQUIRED for heap-allocated buffers**:
- `vec![0u8; N].into_boxed_slice()` — guaranteed heap, zero-initialized, stable Rust.
- `Box::<[u8]>::new_uninit_slice(N)` (stable since Rust 1.82, October 2024) + `.assume_init()` — when zero-initialization is wasted work and you will fully overwrite the buffer. `assume_init` is `unsafe`; gate it with a `// SAFETY:` block per §B5.
- `bytes::BytesMut::zeroed(N)` for buffers headed into `tokio::io`.

## §B8. Silent task dropping (forgotten `.await`)

**The trap**: an `async fn` call without `.await` returns a `Future` that is never polled — meaning the work *never happens*. Compilation often passes (especially when the future is bound to `let _` or returned from a match arm where its `#[must_use]` is consumed), tests pass (the calling function returned without panicking), but the HTTP request was never sent, the database write never executed, the cache never updated. This is *uniquely silent* because nothing went wrong from the type system's perspective — the code is correct, the work simply wasn't performed.

**Why this happens**: LLMs sometimes generate `client.post(url).send()` instead of `client.post(url).send().await`. The reflex comes from sync-language patterns where calling the function executes it. In async Rust, the future is inert until polled.

**Prompt triggers**: "send a notification", "log this event", "fire and forget", "make an HTTP call after the response", any background-task framing.

**BANNED**:
- `let _ = some_async_fn(...);` — explicitly drops the future without polling.
- Calling an async function and not using the result, with no `.await` or `tokio::spawn`.
- `let _fut = async_fn();` followed by code that never `.await`s or spawns `_fut` — once the binding goes out of scope, the future is dropped without polling and the work never happens. Whether the type is `Pin<Box<dyn Future>>`, a chained adapter (`.map(...)`, `.then(...)`), or a plain `impl Future`, the rule is identical: a future that is dropped without polling does nothing.
- An `impl Future`-returning function whose return value is bound to a variable inside a non-`async` function and never awaited there. The compiler warns via `#[must_use]` / `unused_must_use`, but the warning is silenced if the future type is wrapped (e.g., in a tuple, in `Result::Ok`, behind an adapter that does not itself carry `#[must_use]`).

**REQUIRED**:
- Every async function call is followed by `.await`, OR wrapped in `tokio::spawn(async move { ... .await })` for fire-and-forget, OR explicitly stored in a `JoinHandle`/`FuturesUnordered` for later polling.
- For fire-and-forget, **always** use `tokio::spawn` rather than letting the future drop silently.
- Enable `#[warn(unused_must_use)]` at crate level. Verify the `#[must_use]` warning fires for ignored futures in clippy output.
- For functions that return `impl Future`, ensure callers `.await` them — surface uncalled futures in the post-flight summary.

## §B9. Lock ordering and ABBA deadlock

**The trap**: two locks (`Mutex<A>`, `Mutex<B>`) acquired in opposite orders in different code paths. Function `f1` locks A then B; function `f2` locks B then A. Single-threaded tests pass trivially. Multi-threaded production hits the classic deadlock: thread 1 holds A waiting for B, thread 2 holds B waiting for A, both wait forever.

**Why this happens**: LLMs treat lock acquisition as a local concern. The deadlock is a global property of the program's lock graph, invisible from any single function. No lint detects it.

**Prompt triggers**: "synchronize access to two shared resources", "lock the cache and the queue", "update state and metrics atomically", anything involving two `Arc<Mutex<_>>` in the same operation.

**REQUIRED**:
- For any code path that acquires more than one lock, **document the lock acquisition order** as a doc comment at the top of the module or function. State it in a comment LLM-readable enough that future generations of this file maintain it.
- Use a consistent lock ordering across the entire crate. Common conventions: alphabetical by name, by declaration order in the struct, by a numeric rank field.
- Prefer fine-grained immutable data + message passing (`mpsc`, `oneshot`) over multi-lock critical sections when possible.
- When two locks must be held, take them **in the documented order, every time, without exception**.
- For async code, prefer `tokio::sync::Mutex`. Deadlock *detection* is not automatic with this choice: `tokio-console` provides **visibility** (you can see which task holds which lock and which is waiting), not detection. Detection of cycles must be wired explicitly — `parking_lot::deadlock::check_deadlock()` for sync sections, periodic graph audit of the documented lock-acquisition order for async sections. The async `Mutex` itself gives no deadlock signal on its own.

**BANNED**:
- Holding two locks across a function call (the called function may acquire locks in another order).
- Acquiring a second lock while holding the first if the second one's acquisition can block on async work or I/O.
- "Just try locking" patterns with `try_lock` to escape suspected deadlocks — that hides the design problem.

**Detection**: add `tokio-console` for runtime visibility, or `parking_lot::deadlock` detection in dev builds. Surface every double-lock site in the post-flight summary.

## §B10. Reference cycles in `Rc`/`Arc` graphs

**The trap**: when LLMs build graph or tree structures with parent-child relationships, they reach for `Rc<RefCell<Node>>` (or `Arc<Mutex<Node>>`) and create *both* parent→child and child→parent strong references. This creates a reference cycle. Rust has no garbage collector. Memory leaks. Tests pass because functionality (insert, traverse, lookup) works correctly. Production hits OOM after days or weeks.

**Why this happens**: LLM training corpus has plenty of "graph in Rust" examples, but the `Weak` pattern is underrepresented. The model defaults to symmetric strong references.

**Prompt triggers**: "build a tree with parent links", "graph data structure", "linked list with previous pointer", "DOM-like structure", "scene graph", any bidirectional ownership.

**BANNED**:
- `Rc<RefCell<T>>` or `Arc<Mutex<T>>` on both sides of a bidirectional reference.
- "Parent owns children, children own parent" patterns.

**REQUIRED**:
- One direction is `Rc<T>` (or `Arc<T>`), the other is `Weak<T>`. Convention: parent owns children with `Rc`, children point to parent with `Weak`.
- For any graph structure with cycles, prefer arena-style storage: `Vec<Node>` + `NodeId(usize)` indices. No reference cycles possible, no `RefCell` overhead, better cache locality. Crates: `slotmap`, `id-arena`, `petgraph`.
- When `Weak::upgrade()` returns `None`, treat it as a normal case (parent has been dropped), not an error.

**Detection**: profile with `heaptrack` or `valgrind --tool=massif` for steady-state memory growth. In dev builds, periodically print `Rc::strong_count(&node)` for representative nodes.

## §B11. Blocking the async executor

**The trap**: LLM puts `std::thread::sleep`, `std::fs::*`, blocking HTTP clients, or synchronous DB drivers inside `async fn`. The compiler doesn't care — these are valid sync functions, and tests pass because they're single-threaded and short. Production hits the wall at ~N concurrent requests (N = tokio worker count, often the CPU core count): every worker is blocked, no other tasks make progress, latency spikes to seconds.

**Why this happens**: corpus statistics. `std::fs::read_to_string` is *vastly* more common in training data than `tokio::fs::read_to_string`.

**Prompt triggers**: "read a config file", "fetch from URL", "sleep for N seconds", "wait", "make an HTTP request", anything that does I/O.

**BANNED in any `async fn` or function called from `tokio::spawn`**:
- `std::thread::sleep`  →  `tokio::time::sleep`
- `std::fs::*` (read, write, metadata, etc.)  →  `tokio::fs::*`
- `std::io::Read` / `Write` on real files/sockets  →  `tokio::io::AsyncReadExt` / `AsyncWriteExt`
- `reqwest::blocking::*`  →  `reqwest::Client` (async)
- `rusqlite`, synchronous `postgres` crate  →  `sqlx`, `tokio-postgres`, or wrap in `tokio::task::spawn_blocking`
- CPU-bound work taking more than ~100µs — wrap in `tokio::task::spawn_blocking`. Do not substitute `yield_now` (see below for why).

**REQUIRED**:
- For genuinely CPU-bound work (compression, hashing, parsing large blobs, calling a sync C library, using a sync crate that has no async equivalent): wrap in `tokio::task::spawn_blocking(|| { ... }).await?`. This dispatches to a *separate* blocking-task thread pool, freeing the async worker thread for other tasks.
- `tokio::task::yield_now().await` is **not** an alternative to `spawn_blocking` for CPU-bound work. `yield_now` only gives *other tasks already on the same worker thread* a chance to make progress; when your task resumes, the worker is still occupied by you. It does not solve "starving the executor" because the worker count is fixed (typically the CPU core count). Use `yield_now` only for cooperative fairness inside an IO-bound task that occasionally does a small CPU burst.
- For modern tokio (1.x), `tokio::task::consume_budget().await` is the explicit *budget-aware* primitive: it yields *only when the task's coop budget is exhausted*, otherwise returns immediately. Prefer it to `yield_now` inside a tight async loop that wants to be cooperative without paying the unconditional re-schedule cost.
- Verify with `tokio-console` or `tracing` spans that no task holds a worker thread longer than its budget.

## §B12. Cryptographic code (silent insecurity)

**The trap**: cryptographic code generated by LLMs has a unique failure profile. Studies report that only ~23% of LLM-generated crypto Rust code compiles at all, and of the code that *does* compile, static analyzers like CodeQL miss **~57% of the vulnerabilities** present. Crypto code looks right, runs, passes round-trip tests (encrypt → decrypt yields original) — and is still catastrophically insecure.

**Why this happens**: cryptography requires *protocol-level* reasoning the LLM does not do. Encrypt-then-decrypt round-trip is the canonical test, and it passes for any non-broken cipher regardless of whether the key, nonce, or mode is sound. The bugs live at a level orthogonal to functional correctness.

**Specifically dangerous patterns**:
- **Nonce reuse**: hardcoded nonce, nonce derived from a counter that resets, nonce equal to the message ID. Reusing a nonce with the same key in AES-GCM or ChaCha20-Poly1305 is catastrophic — recovers plaintext or forges authentication.
- **API hallucination in crypto crates**: invented methods on `ring`, `rust-crypto`, `aes-gcm`, `chacha20poly1305`. Crypto-API names look interchangeable to the LLM but have very different security properties.
- **Weak parameter choices**: ECB mode (which the LLM may select because it's "simpler"), 64-bit nonces with random generation (birthday-bound collision), insufficient PBKDF2 iterations.
- **Mixing primitives across security levels**: using SHA-1 alongside AES-256, or pairing a strong cipher with a weak MAC.
- **Custom crypto code**: hand-rolling any cryptographic primitive in Rust. Almost always wrong.

**REQUIRED**:
- I do not write cryptographic code beyond *direct calls to well-known high-level APIs* (e.g., `aes_gcm::Aes256Gcm::new(key).encrypt(nonce, plaintext)`).
- For any crypto-touching task, I propose the design in plain text first and ask the user to confirm the threat model before writing code.
- Nonces are generated via a CSPRNG — prefer `rand::rngs::OsRng` for keys and security-critical nonces, **never** hardcoded, never reused, never derived from a counter without explicit cryptographic justification.
- Default to high-level libraries (`age`, `ring`, `rustls`) over low-level primitives.
- For password hashing: `argon2`, not bare PBKDF2 or — under any circumstances — plain SHA-256.
- I surface every line of crypto code in the post-flight summary with extra prominence. Crypto code is the *one place* I recommend mandatory human cryptographer review.

**BANNED**:
- Writing custom encryption/decryption logic.
- Implementing cryptographic primitives (block ciphers, hash functions, KDFs) by hand.
- Using `SmallRng`, `StdRng`, or any seedable RNG for security-sensitive randomness — use `OsRng` (or `getrandom`) directly. The rule is "OS-backed entropy for keys, nonces, salts", not a literal call name: in `rand` 0.8.x the default RNG accessor is `thread_rng()`, in 0.9+ it is `rng()`. Both are CSPRNGs per the `rand` security guarantees, but `OsRng` is the safer default when seeding chains are part of the threat model. State the `rand` version assumed.
- Storing crypto keys in source code, environment variables read at compile time, or anywhere they end up in the binary.
- Comparing secret material (API tokens, MAC tags, password hashes, OTP codes) with `==` — this is a timing side channel. See §B24 for the rule and the `subtle::ConstantTimeEq` / `constant_time_eq` crates.

## §B13. Check-then-act races in concurrent collections (TOCTOU)

**The trap**: LLMs port single-threaded patterns from Python/JS/Java into multi-threaded Rust. The canonical example is the "lazy cache":

```rust
// BANNED — race between contains_key and insert
if !cache.contains_key(&key) {
    let value = expensive_fetch(&key).await;
    cache.insert(key, value);
}
```

In a single-threaded test, this is correct. Under concurrent load, N threads simultaneously see "key is absent", N threads simultaneously call `expensive_fetch`, and only one write actually wins. The cache works *functionally* — every lookup returns a value — but the "expensive" function is called N times when it should have been called once. Variants of this pattern fail similarly: read-modify-write on a counter, "if absent insert default else update", lazy initialization with `bool` flag.

**Why this happens**: in single-threaded languages, check-then-act is sound. The model has a strong prior on it. The Time-of-Check-to-Time-of-Use (TOCTOU) gap is invisible from a single function's perspective.

**Prompt triggers**: "cache", "memoize", "lazy initialization", "ensure exactly one X", "deduplicate", "if not exists, create".

**BANNED**:
- `if !map.contains_key(k) { map.insert(k, v); }` and any variation where check and act are separate calls.
- `if map.contains_key(k) { let v = map.get(k).unwrap(); ... }` — between the check and the get, another thread could remove the entry, and `.unwrap()` panics.
- "Two-phase commit"-style patterns across separate operations on a concurrent collection.
- `let x = *counter.lock().unwrap(); *counter.lock().unwrap() = x + 1;` — read and write are separate critical sections, a thread can interleave.

**REQUIRED**:
- For "insert if absent": `map.entry(key).or_insert_with(|| compute_value())`. The `entry` API holds the relevant bucket lock across the check and act.
- For `DashMap`: `dashmap::DashMap::entry(key).or_insert_with(...)`.
- For async expensive computation that must run once: combine `entry` with `Arc<OnceCell<T>>` or `tokio::sync::OnceCell`. The pattern:
  ```rust
  let slot = cache.entry(key).or_insert_with(|| Arc::new(OnceCell::new()));
  let value = slot.get_or_init(|| async { expensive_fetch().await }).await;
  ```
- For atomic counters: `AtomicUsize::fetch_add(1, Ordering::Relaxed)`, not lock-load-add-store.
- For "compare and swap" patterns: `Atomic*::compare_exchange` or `Atomic*::fetch_update`.

**Detection**: this is invisible to type checking and almost always invisible to tests. The defense is recognizing the pattern at write time. If a function does two consecutive operations on a shared collection, it is a candidate.

## §B14. Unbounded channels and backpressure neglect

**The trap**: when the producer/consumer rate is unbalanced, an `mpsc::unbounded_channel` doesn't block the producer — it just lets the queue grow. Tests with 5–100 messages pass. Production with a producer that's 2× faster than the consumer accumulates millions of pending messages, RAM climbs steadily, and the OOM killer eventually terminates the process — usually under peak load when it hurts most.

**Why this happens**: bounded channels force the producer to handle "channel is full" via `try_send`/`send` errors; `unbounded` has the simpler API and is the LLM's path of least resistance — the §C5 reflexive-fix pattern applied to channel selection.

**Prompt triggers**: "send events to a worker", "background queue", "log messages to a task", "producer-consumer", "event bus", "websocket broadcast", "metrics pipeline".

**BANNED** in any non-trivial pipeline:
- `tokio::sync::mpsc::unbounded_channel()` without explicit justification that the producer rate is provably bounded by an external invariant.
- `flume::unbounded()`, `async_channel::unbounded()` for the same reason.
- A `Vec` that is `push`-ed in a hot loop with no consumer or cap — same failure shape as an unbounded channel, different surface. `Vec::push` itself is fine (amortized O(1)); the failure is the missing drain or bound.

**REQUIRED**:
- Default to **bounded** channels: `tokio::sync::mpsc::channel(N)`. Size `N` from the actual constraints, not from a folk number: large enough to absorb the *expected producer burst over one consumer cycle*, small enough that `N × sizeof(message)` fits the per-task memory budget. If the right `N` cannot be reasoned about, that is a signal that the backpressure policy itself needs design before the channel is written. Never `unbounded`.
- Decide the **backpressure policy** explicitly: block the producer (default `send().await`), drop oldest (`try_send` with explicit drop), drop newest (`try_send` returning error → log and discard), or apply rate limiting upstream. State the choice in a comment.
- For broadcast scenarios where slow consumers shouldn't slow producers: `tokio::sync::broadcast::channel(N)` with explicit handling of `RecvError::Lagged` (which indicates dropped messages).
- For any unbounded queue that *must* exist (e.g., legacy interop): expose its size as a metric and alert when it grows abnormally.

**Detection**: unbounded channel growth doesn't appear in tests. Defense is at write time (default to bounded) and via monitoring (track `Sender::capacity()` or queue length as a metric in production).

## §B15. Advanced async pitfalls (AFIT, Pin, Waker, block_on)

A cluster of narrow but high-impact traps that appear in non-trivial async code. Each compiles in isolation; each fails in production or under composition.

**AFIT vs RPITIT — terminology matters, they are not interchangeable:**

- **AFIT** (async fn in trait) — the syntax `trait Foo { async fn bar(&self) -> T; }`. Stabilized in Rust 1.75. Desugars to a method returning an opaque, anonymous `impl Future` whose `Send`-ness is **not bounded in the trait signature**. The trait compiles, implementations compile, but `tokio::spawn(x.bar())` fails with a non-obvious `Send` error because the returned future is not statically known to be `Send`. There is no syntactic way to add `+ Send` directly to an `async fn` in a trait.
- **RPITIT** (return-position impl trait in trait) — the syntax `trait Foo { fn bar(&self) -> impl Future<Output = T> + Send; }`. Lets you state bounds (including `+ Send`) on the returned `impl Future` directly. This is the construct you actually want when the trait's methods will be spawned onto `tokio`. AFIT and RPITIT share a desugar lineage — AFIT desugars into an RPITIT-shaped method internally — but as *written-down* syntactic forms they have materially different bound-expressing capabilities: AFIT cannot state `+ Send` on the return type at the trait definition site, RPITIT can. Treating them as interchangeable in source is the conflation to avoid.

**Decision table for async-returning trait methods**:

| Need | Use |
|---|---|
| Internal trait, no `tokio::spawn`, single executor | Plain **AFIT** (`async fn bar(&self) -> T`). |
| Method must be `Send` for `tokio::spawn` | **RPITIT** with explicit `+ Send`. |
| Library trait, want both Send-bounded and non-Send variants | `#[trait_variant::make(Send)]` from `trait-variant` — generates a Send-bounded variant alongside the original. |
| Need `dyn Trait` (trait objects) for async methods | `async-trait`. As of stable Rust through mid-2026, AFIT and RPITIT traits are not generally `dyn`-compatible without workarounds; stabilization of `dyn`-compatible RPITIT is an in-flight RFC, so verify the current status against your `rustc --version` before relying on a `dyn` async trait without `async-trait`. `async-trait` boxes every call (heap allocation per invocation) but remains the well-supported way to get `dyn` async traits today. |

**REQUIRED**:
- Pick the construct deliberately and state it in a comment on the trait: `// AFIT (no Send)`, `// RPITIT + Send`, `// trait-variant`, or `// async-trait (dyn)`.
- Surface every async-returning trait method in the post-flight summary, with the syntax used and whether `Send` is bounded.
- Never describe RPITIT as "AFIT with a Send bound" in source code. AFIT desugars into RPITIT internally, but the trait's *written* syntax determines what bounds you can express — pick the form deliberately.

**`Pin::new_unchecked` without justification**: `Pin::new_unchecked` is `unsafe` for a reason — it asserts that the pointee will never move again. LLMs reach for it when they don't understand `Pin` rather than as a justified low-level operation. If `Box::pin(...)`, `pin!` macro, or `pin-project` would work, use them.

- Default to `Box::pin(future)` (owning, heap-allocated, `Pin<Box<T>>`) or the `pin!` macro (borrowing, stack-allocated, `Pin<&mut T>`). LLMs frequently mix these up when adapting examples — they have different lifetimes and different ownership. State which one you mean.
- `Unpin` is an auto-trait. Most types implement it automatically, which makes `Pin<&mut T>` effectively free to use. Pinning discipline actually bites only for `!Unpin` types: hand-written futures with internal references, generator state machines, types explicitly opted out via `PhantomPinned`. The common LLM failure is conflating "this code involves a `Pin`" with "this type is `!Unpin`" — most of the time the `Pin` is incidental and Pinning rules add no real constraint.
- For projecting through `Pin`, use the `pin-project` or `pin-project-lite` crate, never manual `Pin::new_unchecked`.
- Every `Pin::new_unchecked` requires a `// SAFETY:` block proving the pointee is genuinely never moved (per §B5) — and the type must actually be `!Unpin` for the assertion to mean anything.

**Forgotten Waker in manual `Future::poll`**: when implementing `Future` by hand, returning `Poll::Pending` without first registering the current task's `Waker` causes the task to hang forever — nothing will ever wake it. The executor doesn't poll spontaneously.

- Before any `return Poll::Pending`, store `cx.waker().clone()` somewhere the underlying source will call on completion.
- Default to combinators (`async/.await`, `FutureExt`, `tokio_util::sync::PollSender`) rather than manual `Future` impls.
- If hand-rolling is unavoidable, write a comment naming who will call the stored waker and under what condition.

**`block_on` inside an async runtime**: `tokio::runtime::Handle::block_on` (or `futures::executor::block_on`) called from code already running inside a tokio runtime panics with "Cannot start a runtime from within a runtime". This happens when LLM writes a sync-looking helper that internally calls `block_on`, then invokes it from async code.

- Inside async code, use `.await`, not `block_on`.
- For sync-to-async bridges, use `tokio::task::spawn_blocking` and `block_in_place`, never nested `block_on`.
- If a helper function is shared between sync and async callers, prefer making the helper async and forcing sync callers to bridge explicitly.

**`Stream` vs `Iterator` — they are not interchangeable**: `Iterator::next(&mut self) -> Option<Item>` is synchronous; `futures::Stream::poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Item>>` is async and requires polling discipline. LLMs frequently write `for x in stream { ... }` (illegal — `Stream` does not impl `Iterator`) or call `.next().await` without importing the `StreamExt` extension trait.

- Use `futures::StreamExt` or `tokio_stream::StreamExt` to get adapter methods (`.next()`, `.collect::<Vec<_>>()`, `.map`, `.filter`, `.then`).
- For async iteration: `while let Some(x) = stream.next().await { ... }`, not `for x in stream`.
- Choosing the extension trait matters: `tokio_stream::StreamExt::next` returns the same shape as `futures::StreamExt::next`, but `tokio_stream` adds tokio-specific combinators (`.timeout(...)`, `.chunks_timeout(...)`). Pick one per module and stick with it.

## §B16. Equality and hashing contracts

**The trap**: `derive`-ed `Eq`/`Hash` is correct by construction. The moment a manual `impl PartialEq` or manual `impl Hash` enters the type — to normalize case, ignore a field, hash-by-key-only — the `HashMap`/`HashSet` contract `a == b ⇒ hash(a) == hash(b)` can be quietly violated. Compiles, runs, passes a few unit tests, and silently *loses entries from the map* in production: insert returns `None` (saying "no previous"), get returns `None`, but `len()` keeps incrementing — duplicate keys living at different hash buckets. Mirror trap on the ordering side: manual `Ord` that is not a *total* order corrupts `BTreeMap` ordering and `<[T]>::sort` (the sort assumes total order; if the relation is not total, the sort can produce arbitrary output, and `BTreeMap` invariants silently rot).

**BANNED**:
- Manual `impl PartialEq` whose result differs from `derive(PartialEq)` without a corresponding manual `impl Hash` that matches.
- Manual `impl PartialOrd` without `impl Ord` for a type used as a key in `BTreeMap` / `BTreeSet` or as input to `.sort()` / `.sort_by()`.
- `f64` / `f32` fields on a type that is later used as a `HashMap` or `BTreeMap` key, unless wrapped in `ordered_float::NotNan` / `ordered_float::OrderedFloat`. NaN breaks reflexivity (`NaN != NaN`), which breaks `Eq`'s contract; floats also have no total order in `PartialOrd` (NaN is unordered).
- Reaching for `f64::to_bits()` as a "trick" to hash a float — this works for bit-equal floats but conflates `-0.0` and `+0.0` (different bit patterns, `==` says equal) and treats NaN as a key (every NaN bit pattern is its own key, which is almost never what the caller wants).

**REQUIRED**:
- If you customize `PartialEq`, customize `Hash` to match: `a == b ⇒ hash(a) == hash(b)`. Write the proof in a comment on the `impl Hash` block.
- For float keys, use `ordered_float::NotNan<f64>` (excludes NaN at construction) or normalize before hashing into a canonical form.
- `Ord` requires a *total* order: antisymmetric, transitive, total. `PartialOrd` does not. Before writing `impl Ord`, prove totality for your type — including edge cases (empty, all-equal, mixed signs for numerics).
- Surface every manual `impl PartialEq` / `impl Hash` / `impl Ord` in the post-flight summary so the user can confirm the contract holds.

## §B17. `RefCell` / `Mutex` runtime borrow panics

**The trap**: `RefCell` enforces borrow rules at runtime via panics. The borrow check is dynamic, not static — and the LLM writes call patterns that *can* reach a second `borrow_mut()` while the first is still live, but the test inputs never exercise the path. Compiles; passes tests at low fanout; panics in production the moment a callback chain or trait dispatch reenters the cell. The async-runtime mirror: `tokio::sync::Mutex` does not panic on reentrance, it *deadlocks* — the second `.lock().await` waits forever for the first guard, which is held by the same task.

**BANNED**:
- `Rc<RefCell<T>>` or `Arc<RefCell<T>>` for shared mutable state accessed through nested callbacks, closures, or trait-object dispatch where the call graph is not statically obvious. (`Arc<RefCell<T>>` does not compile — `RefCell` is `!Sync` — but `Arc<Mutex<T>>` with the same access pattern has the same logical defect, just expressed as a deadlock instead of a panic.)
- `cell.borrow_mut()` inside a scope that later calls into code (closure, trait method, observer notification, callback registration) that can re-enter the same `RefCell`. Even if the test path doesn't exercise the reentrance, the structural risk is there.
- Holding a `tokio::sync::MutexGuard` across an `.await` that ends up calling back into the same `Mutex` — guaranteed deadlock.

**REQUIRED**:
- For sync interior mutability accessed in tree traversal, observer notification, or callback chains, use `try_borrow_mut()` and handle `BorrowMutError` instead of unconditional `borrow_mut()`. The error path becomes a real recovery path, not a panic.
- Document the borrow-disjointness invariant at the *type* level: newtype with private field, public methods that guarantee non-overlapping borrows by construction. The invariant becomes a comment on the newtype, not a hope.
- For `tokio::sync::Mutex`, document a lock-acquisition order per §B9 — including "no method on this type calls back into self via another lock acquisition".

## §B18. Manual `unsafe impl Send` / `unsafe impl Sync`

**The trap**: a type contains a `*const T`, a `*mut T`, a raw FFI handle, or a `Rc<T>` field, and `tokio::spawn` rejects it with a `Send` bound error. The LLM's reflexive fix is `unsafe impl Send for MyType {}` — and that compiles, and tests pass under low concurrency. Under contention, the un-synchronized access races. This is one of the most reliably-wrong fixes the LLM makes: it converts a correct compile-time refusal into a runtime data race.

**BANNED**:
- `unsafe impl Send for MyStruct {}` or `unsafe impl Sync for MyStruct {}` without a `// SAFETY:` block that names the synchronization invariant (which lock, atomic, or external invariant makes the impl sound).
- Manual `Send`/`Sync` for a type containing `*mut T` without proving that aliasing is controlled by external synchronization (e.g., the pointer is only ever read after the producing thread has joined, or access is guarded by an external `Mutex`).
- Manual `Send` for a type whose field is `Rc<T>` "because the Rc is never cloned across threads in practice" — if the field is morally `Arc`, fix the field, do not lie via `unsafe impl Send`.

**REQUIRED**:
- Every `unsafe impl Send` / `unsafe impl Sync` cites the synchronization primitive or invariant that makes the impl sound, in a `// SAFETY:` block per §B5. If there is no primitive — no `Mutex`, no atomic ordering, no thread-local lifetime restriction — the impl is wrong; refactor the type instead.
- For `*const T` / `*mut T` fields, prefer `NonNull<T>` (still `!Send`, but lets you state explicit unsafety) or wrap the type in an `Arc<Mutex<RawHandle>>` and impl `Send`/`Sync` on the wrapper with the lock as the cited invariant.
- Surface every manual `unsafe impl Send` / `unsafe impl Sync` in the post-flight summary.

## §B19. Iterator invalidation through indirection

**The trap**: for a plain `&mut Vec<T>`, the borrow checker statically forbids iterating-while-mutating. The LLM writes the same pattern *through* a `RefCell`, through indices, or through `unsafe` raw pointers — and the borrow checker no longer sees it. Compiles, passes tests for small inputs, and corrupts state (or panics on `BorrowMutError`) once the loop body actually triggers the mutation under realistic input.

**BANNED**:
- Iterating `vec.iter()` (or `borrow.iter()`) while pushing/removing through a `RefCell<Vec<T>>` borrow on the same vector inside the loop body — the iteration sees an inconsistent snapshot and may dangle.
- `for i in 0..vec.len() { ... vec.push(...) ... }` — `vec.len()` is captured once at the start of the range; if the loop body mutates `vec.len()`, the loop iterates over the *old* length, missing or double-processing newly-inserted items.
- BFS/DFS that pushes children onto the same `Vec` it is iterating, indexed by `for i in 0..frontier.len()` — produces silent partial traversal.

**REQUIRED**:
- For BFS/DFS with a growing frontier, use **two vectors** (`current`, `next`) and `std::mem::swap(&mut current, &mut next)` between layers, or `VecDeque` with disciplined `pop_front` / `push_back` and a captured *initial* layer length.
- For loops whose body must read the source after potentially-mutating it, snapshot first: `let snapshot: Vec<_> = vec.iter().cloned().collect();` then iterate the snapshot, then commit changes. The clone cost is the price of avoiding undefined behavior at the data-structure level.
- For index loops over mutating collections, re-read `len()` every iteration (`while i < vec.len() { ... i += 1; }`) and state in a comment why the loop is well-founded.

## §B20. `serde` field-presence vs null vs default

**The trap**: `Option<T>` with `#[serde(default)]` deserializes both `{ "field": null }` and `{}` (field absent) to `None`. For protocols where "absent" and "explicitly null" carry different semantics (HTTP PATCH, JSON-Merge-Patch, "preserve this field" vs "clear this field"), this collapse is a silent semantic bug — the code compiles, deserializes successfully, and propagates the wrong intent downstream. Adjacent traps: `#[serde(untagged)]` enums silently pick the first matching variant when two variants accept overlapping structural shapes; `#[serde(rename = "...")]` typos pass `cargo build` and corrupt the wire format.

**BANNED**:
- `Option<T>` field with `#[serde(default)]` in any API that must distinguish "field absent" from "field present as null" — both deserialize to `None` and the caller can no longer tell which the client sent.
- `#[serde(untagged)]` enum where two variants accept overlapping structural shapes — the first matching variant wins, silently, on inputs the API author did not anticipate. (Tag with `#[serde(tag = "type")]` instead, or write a custom `Deserialize` that proves disjointness.)
- `#[serde(rename = "wire_name")]` without a round-trip test (encode → decode equality on a representative sample of values).
- Trusting `#[serde(deny_unknown_fields)]` to catch typos — it catches unknown *incoming* fields, not typos in the struct field names that are being serialized.

**REQUIRED**:
- For three-state semantics (absent / null / value), use `Option<Option<T>>` with `#[serde(default, deserialize_with = "double_option")]`, or a custom enum (`enum FieldUpdate<T> { Absent, Null, Set(T) }`) with an explicit `Deserialize` impl. Document the chosen scheme on the field.
- For `#[serde(untagged)]`, prove disjointness of variant shapes (no two variants accept the same JSON shape) or add a discriminator tag.
- Round-trip every (de)serialization with a property test (`proptest` or `quickcheck`) — encode arbitrary value, decode, assert equal.
- Surface every `#[serde(untagged)]`, every `#[serde(rename = "...")]`, and every `#[serde(default)]` on `Option<T>` in the post-flight summary.

## §B21. `JoinHandle` semantics: drop ≠ abort

**The trap**: `tokio::task::JoinHandle::drop()` **does not abort the task**. The task keeps running in the background. LLM treats `JoinHandle` like a `std::thread::JoinHandle` from a sync mental model where "drop the handle" mostly means "detach" and the OS thread cleans itself up — but in tokio, the dropped handle leaks the task into the runtime's background pool, holding whatever resources it owns until it finishes. In tests this is invisible (short-running tasks complete before the test exits); in production this is a resource leak with the task continuing to consume connections, locks, file descriptors, and CPU.

**BANNED**:
- Dropping a `tokio::task::JoinHandle` without `.await`, `.abort()`, or an explicit "detached on purpose" comment. Default drop = detach (task keeps running, no way to cancel it from outside).
- Storing `JoinHandle`s in a `Vec` that is later dropped on a hot path without joining — leaks futures and any resources they hold (DB connections, file handles, network sockets).
- Treating `std::thread::JoinHandle` the same way: drop also detaches, but the OS thread does not share async-runtime cleanup; resources held by the thread (locks, files) outlive the dropped handle.

**REQUIRED**:
- If you spawn for fire-and-forget, document the intent at the spawn site: `// fire-and-forget: detached by design — task self-terminates within N seconds`. The comment is load-bearing — it tells the next reader that the missing `.await` is intentional.
- If you spawn for joinable work, hold the `JoinHandle` and call `.await` on it (or use `tokio::task::JoinSet` for fan-in across many tasks).
- For graceful shutdown, hold an `AbortHandle` (via `JoinHandle::abort_handle()`) and call `.abort()` on shutdown; then `.await` the `JoinHandle` to observe `JoinError::is_cancelled()`.
- Surface every `tokio::spawn(...)` whose returned `JoinHandle` is dropped (not held, not awaited, not detached-by-design) in the post-flight summary.

## §B22. `async Drop` is not real (yet)

**The trap**: the LLM writes `impl Drop` for a database connection, file handle, network socket, or cache flusher and puts `tokio::spawn(async move { self.close().await })` or `block_on(async { ... })` inside the `drop` method. In tests the runtime stays alive long enough for the spawned task to run, or the test thread is not the runtime, and the resource closes by luck. In production the spawned task is fire-and-forget and may not complete before runtime shutdown; the `block_on` variant deadlocks or panics because it re-enters the runtime from a sync context held by the runtime. The result is silent: resource never closes, connection pool exhausts, log buffer never flushes.

**BANNED**:
- `impl Drop` that calls `tokio::spawn(async move { ... self.close().await ... })` from the `drop` method — the spawned task may outlive the drop (fine but irrelevant) and may not run before runtime shutdown (lethal). The async cleanup is **fire-and-forget**, not RAII.
- `tokio::runtime::Handle::block_on(...)` inside `Drop::drop` for resources owned by a tokio runtime — re-entering the runtime from a sync context held by the runtime causes "Cannot start a runtime from within a runtime" panic (current_thread flavor) or a deadlock (multi_thread, if the only available worker is the one running drop).
- `futures::executor::block_on(...)` in `Drop::drop` — different runtime, but the same logical issue: any `.await` inside that wants to talk to the tokio runtime cannot, and any I/O bound on the tokio runtime hangs.
- Treating `Drop` as a place to "flush the buffer" or "send the close frame" — `Drop` cannot do async work, period.

**REQUIRED**:
- Provide an explicit `async fn close(self) -> Result<...>` and require callers to call it. Mark the type `#[must_use = "call .close().await to release resources cleanly"]` so the unused-handle is at least a warning.
- For RAII-like ergonomics, return a `CloseGuard` (or analog) that, when dropped without explicit `.close().await`, **logs an error in production and panics in debug**. This is a discipline pattern, not a guarantee; document it.
- Document on the type: *"This type cannot release its resources via `Drop` alone — call `.close().await` explicitly. Dropping without close leaks the underlying handle and may stall connection pools."*
- For the rare case where a sync `Drop` is acceptable (e.g., the resource has a sync close path that is best-effort), call the sync close in `Drop` and document that the async path is preferred.

## §B23. `select!` arm side effects under cancellation

**The trap**: a `tokio::select!` macro polls each arm concurrently and runs the body of *the first arm to become ready*; the other arms are **cancelled at their pending `.await` point**. If an arm contains a side effect (DB write, file flush, channel send, log emission) on the *losing* path — anywhere between the arm's first `.await` and the arm body — that side effect is broken by cancellation. The compiler is silent; tests pass when only one arm is ever ready in the test setup.

**BANNED**:
- `tokio::select!` arm that performs a side effect inside the arm's pending future (between the first `.await` and the future resolving) — at cancellation, the side effect is either half-done or not done, and there is no recovery hook.
- Pattern: `select! { _ = ch.send(x) => ... }` without reading the channel's documented cancel-safety per-channel. `tokio::sync::mpsc::Sender::send` is cancel-safe (the value either ends up in the queue or it doesn't, exposed via the future's resolution), but for other channel libraries (`flume`, `async_channel`, custom) you must check.
- Side-effecting `async` helpers called from `select!` arms without a documented cancel-safety annotation per §B3.

**REQUIRED**:
- Treat every `select!` arm as if it can be cancelled at any `.await` point inside its pending future. Side effects inside the pending future must be cancel-safe per §B3 (atomic, idempotent, recoverable) or guarded by a separate atomic operation that observes whether the side effect committed.
- Move side effects **after** the `select!` returns, on the winning branch only:
  ```rust
  let outcome = tokio::select! {
      r = pure_read(&mut stream) => SelectOutcome::Read(r?),
      _ = shutdown.notified() => SelectOutcome::Shutdown,
  };
  match outcome {
      SelectOutcome::Read(msg) => { db.write(msg).await?; ack.send().await?; }  // not cancellable
      SelectOutcome::Shutdown => { /* clean up */ }
  }
  ```
- For arms that must do side effects internally, wrap them in `tokio::spawn(async move { ... })` and store the `JoinHandle` to detach from the cancellation tree (§B21 still applies).

## §B24. Timing attacks via `==` on secrets

**The trap**: `==` on `[u8]`, `Vec<u8>`, `String`, `&str` short-circuits on the first byte mismatch. For non-secret data this is fine. For *secret* comparisons — API tokens, password hashes, MAC tags, OTP codes, session keys, anything an attacker controls one side of — the runtime difference between "first byte wrong" and "first ten bytes right, eleventh wrong" leaks information about the secret one byte at a time. Compiles, runs, passes functional equality tests, and is silently exploitable from across a network on any code path that an attacker can probe repeatedly.

**BANNED**:
- `if user_token == expected_token { ... }` for any secret comparison: API tokens, password-after-hash, MAC tags, OTP codes, session identifiers, HMAC outputs.
- `Vec<u8> == Vec<u8>` or `&[u8] == &[u8]` for secret material.
- `String::eq` / `str::eq` on bearer tokens, JWT signatures, or any string the client controls during authentication.
- Rolling your own constant-time equality with a manual XOR loop *without* `std::hint::black_box` and a `#[inline(never)]` attribute — the compiler may optimize the early-exit back in.

**REQUIRED**:
- Use `subtle::ConstantTimeEq` (`x.ct_eq(&y).into()` returns `bool`) or the `constant_time_eq` crate (`constant_time_eq::constant_time_eq(a, b) -> bool`) for any secret comparison.
- For MAC verification specifically, prefer the crypto crate's built-in `verify` / `verify_slice` over manual `==` on the output. (`hmac::Mac::verify_slice` and `aes_gcm::Aes256Gcm::decrypt` both incorporate constant-time comparison; rolling your own is the bug.)
- Surface every `==` / `!=` on `&[u8]`, `Vec<u8>`, or `String` in the same code path as a secret in the post-flight summary, with the recommendation to switch to a constant-time primitive.

## §B25. Panic and ownership across `extern "C"` ABI

**The trap**: the LLM writes a Rust function callable from C (or returns a Rust-owned value through FFI), tests it on the happy path, and ships. The panic path is never exercised, the C-side `free()` path is never exercised, and the `cap`-mismatched `from_raw_parts` is never exercised. Everything compiles, the happy-path tests pass, and the bug surfaces under load as heap corruption (silent, worst), a process abort with no Rust stack (visible, but unhelpful), or a leak that grows for days. The compiler does not catch any of these — the `unsafe` boundary is precisely where its guarantees end.

**BANNED**:
- `extern "C" fn` body that can panic without being wrapped in `std::panic::catch_unwind`. Pre-1.81 a panic crossing an `extern "C"` boundary was UB; since Rust 1.81 the default is to abort the process — neither is what an FFI caller expects. Convert panics to a stable error code at the boundary.
- Passing a `Box<T>`, `Vec<T>`, `String`, `Rc<T>`, or `Arc<T>` directly as a parameter or return value of an `extern "C"` function — these types have no stable ABI and the layout can change between compiler versions. Cross the boundary as `*mut T`, `(*mut u8, usize, usize)`, or `*const c_char`.
- `Box::from_raw(ptr)` on a pointer not originally produced by `Box::into_raw` in the same Rust binary with the same global allocator. Reclaiming a `malloc`'d pointer through `Box::from_raw`, or freeing a `Box::into_raw`'d pointer with C's `free()`, is allocator-mismatch UB.
- `Vec::from_raw_parts(ptr, len, cap)` where `cap` does not match the value the source `Vec` was decomposed with — the eventual deallocation passes the wrong size to the allocator and corrupts the heap. Same hazard for `String::from_raw_parts`.
- Returning a raw pointer from an `extern "C"` function without an accompanying `extern "C" fn drop_T(p: *mut T)` (or equivalent) that the documented contract requires the C side to call. "The caller will know to free it" is wishful thinking that compiles and tests fine.
- `#[no_mangle]` on functions that are not actually FFI entry points. Each such symbol is a candidate for silent linker collisions across crates.

**REQUIRED**:
- Wrap every panic-capable Rust function callable from C with `std::panic::catch_unwind`; translate `Err(payload)` into a stable error code (a tagged union, a `-1` sentinel, an out-parameter for `*mut PanicInfo`) that the C side can match on. Document the encoding on the function's doc comment.
- For every Rust-owned type `T` that crosses the boundary, ship a paired `extern "C" fn rust_drop_T(p: *mut T)` performing `unsafe { let _ = Box::from_raw(p); }`. Document the contract on both functions: caller owns the pointer until it calls `rust_drop_T`; the C side must not call `free()` on this pointer, ever.
- For `Vec<T>` crossing the boundary, decompose with `ManuallyDrop<Vec<T>>` (MSRV-safe) or `Vec::into_raw_parts` (MSRV ≥ 1.93) and ship the tuple as three values, plus a paired free function. Document that the C side must pass *all three* back unchanged to release the buffer.
- For every `#[repr(C)]` struct crossing the boundary, verify the layout against the C header with `cargo expand --type-sizes` (or `--print type-sizes`) and pin the bindgen output if you use it. Field order, padding, and alignment must match the C side byte-for-byte.
- Add miri to CI for every file containing `extern "C"` blocks, exactly as §B5 requires for any `unsafe`.

---

# TIER C — Architecture and ergonomics

These are not bugs in the strict sense, but design choices the LLM makes that are expensive to reverse.

## §C1. Blanket impls in public APIs (semver hazard)

**The trap**: `impl<T: Display> Bar for T` in a published crate is a versioning landmine. Consumers may have `impl Bar for MyType` that becomes ambiguous when an upstream blanket impl is added or narrowed. The breakage surfaces months later on consumer CI, not the author's.

**REQUIRED in any `pub` API**:
- Blanket `impl<T: Bound>` only when the trait is **sealed** (private supertrait the crate controls):
  ```rust
  mod sealed { pub trait Sealed {} }
  pub trait MyTrait: sealed::Sealed { ... }
  ```
- Otherwise: write per-type impls or use a marker trait the crate exposes for opt-in.
- For any public trait being added, explicitly state in a comment whether it is sealed or open to external impl.
- Respect orphan rules: never `impl ForeignTrait for ForeignType`. Use the newtype pattern: `pub struct MyWrapper(pub Foreign);`.
- For **zero-cost** newtypes, prefer `#[repr(transparent)] pub struct MyWrapper(Foreign);` — this guarantees the same layout, size, and alignment as `Foreign`, so it can be transmuted to/from `Foreign` (with the usual `// SAFETY:` discipline) and crosses FFI boundaries identically. Without `#[repr(transparent)]`, the layout is `#[repr(Rust)]` (per §B5/T4: stable attribute, unspecified layout) and you have *no* guarantee that the wrapper is a pure compile-time fiction — even for a single-field struct, the compiler is technically free to add padding or change alignment.

## §C2. Error handling discipline

**The trap**: `anyhow::Error` in library crates poisons downstream error handling. `unwrap()` and `expect()` in non-test code is a runtime panic waiting to happen. The `?` operator silently loses context if `From` impls are too eager.

**REQUIRED**:
- In **published library crates** (anything shipped to crates.io with a `pub` API that other authors consume): use `thiserror` for typed errors, never `anyhow::Error` in public APIs. Each `pub fn` returning `Result` has a typed error. The cost of `anyhow` here is paid by every downstream caller who loses the ability to match on specific error variants.
- For **internal/workspace libraries** (not published, only used within the same workspace by the same team): `anyhow::Error` in `pub fn` is acceptable if the team agrees, but make it a deliberate choice — once a library moves toward publication, the migration to typed errors becomes painful.
- In **binary** crates (`main.rs` and friends): `anyhow::Error` is acceptable for top-level handlers and CLI surfaces.
- `unwrap()` is allowed only when (a) it is statically impossible to fail and I have a comment explaining why, or (b) in tests. Same for `expect()`.
- `?` is fine when the conversion is meaningful; if it loses context, use `.map_err(|e| MyError::Context { source: e, info: ... })` instead.
- `panic!`, `todo!`, `unimplemented!`, `unreachable!` are surfaced in the summary with justification.

**BANNED**:
- `anyhow::Result<T>` in a `pub` API of a published library crate.
- `.unwrap()` on `Mutex::lock()` in production code (the panic message is unhelpful; use `.expect("description")` minimum, or handle the poison case).
- Silent `let _ = result;` to discard errors. If discarding is intentional, comment why.

## §C3. Async runtime and ecosystem coherence

**The trap**: mixing `async-std` types with `tokio` dependencies, or generating code that uses `tokio::fs` on `wasm32-unknown-unknown`. The compilation may succeed if features align, but behavior at runtime is broken.

**REQUIRED**:
- Verify the runtime once at the start (read `Cargo.toml`). Do not mix `tokio` and `async-std` in the same crate without explicit reason.
- For `wasm32` targets: no threads, no blocking I/O, no `tokio::time::sleep` (use `gloo-timers` or equivalent).
- For `#![no_std]` crates: no `String` or `Vec` without `extern crate alloc`; no `std::*` paths.
- For embedded with `embassy` or `embedded-hal-async`: do not mix with `tokio`-flavored APIs.
- `Pin<Box<dyn Future>>` is rarely the right answer — usually `impl Future` works. When using `pin_project`, use it correctly (the macro, not manual `Pin::new_unchecked`).

## §C4. Iterator and allocation discipline

**The trap**: unnecessary `clone()` on `Copy` types, materializing collections mid-chain with `collect::<Vec<_>>()` only to iterate again, `format!` in hot paths, treating `String` as the default string type everywhere.

**REQUIRED**:
- Profile before defending these on micro grounds, but as defaults:
- Prefer `&str` and `&[T]` in function signatures over `String` and `Vec<T>`.
- Iterator chains stay lazy: avoid intermediate `.collect()` unless the next stage requires materialization.
- For hot paths, write to a `&mut impl io::Write` or `&mut String` via `write!`/`writeln!` rather than allocating with `format!`.
- `clone()` is fine when needed; surface it in the summary so the user can question it.

## §C5. Reflexive `.clone()` as a borrow-checker silencer

**The trap**: when borrow checker complains, the LLM's path of least resistance is to insert `.clone()` or `.to_string()` until errors disappear. The code compiles. The performance cost is invisible until profiling. This is a *different* failure mode from §C4 — it's not an idiom drift, it's a reflexive *fix-it strategy* that resolves a real borrow problem with a hidden allocation.

**Why this happens**: gradient descent rewards "compiles" heavily; the model learned that adding `.clone()` is a reliable way to make red squiggles go away. The cost (allocation, deep copy of `Vec<T>`, etc.) isn't penalized anywhere in training.

**Prompt triggers**: any prompt involving a borrow checker error in the conversation history; "fix the lifetime issue"; "make this compile"; refactoring sessions where the user is iterating on a function signature.

**REQUIRED**:
- Before inserting `.clone()`, ask: can this be solved by restructuring ownership (split borrows, borrow earlier-release later, take `&self` instead of `self`)?
- For `Copy` types (i32, bool, small struct of `Copy` fields), `.clone()` is a code smell — `clippy::clone_on_copy` exists for a reason. Never insert it.
- For `&str` → `String` conversions purely to escape a lifetime: re-examine the lifetime first. The String allocation is often masking the real problem from §B1.
- For `Vec<T>` clones in hot paths: consider `&[T]`, `Cow<'_, [T]>`, or `Arc<[T]>`.
- Every `.clone()` and `.to_string()` I introduce gets surfaced in the post-flight summary with a one-line justification, so the user can question it.

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

## §C8. Channel-and-runtime mismatch

**The trap**: the LLM picks a channel by name recognition — `std::sync::mpsc` because it's standard, `crossbeam::channel` because it's "the fast one", `tokio::sync::mpsc` because it's the tokio one. The code compiles in all four runtime/channel combinations. Behaviour diverges: a sync channel in async code blocks the executor (§B11 surface); a tokio MPSC where multi-consumer is needed silently fans messages to whichever receiver wins the race; a `crossbeam::channel::Receiver::recv()` inside an `async fn` blocks the worker thread for as long as the queue is empty.

**BANNED**:
- `std::sync::mpsc::Receiver::recv()` inside an `async fn` or any function called from `tokio::spawn` — blocks the worker thread; same defect as `std::thread::sleep` per §B11.
- `tokio::sync::mpsc::channel(...)` when the workload is multi-consumer — `Receiver` is single-consumer by type (only one task can hold it). Spawning multiple tasks that each call `recv()` on a *cloned* receiver is not possible; cloning is not implemented. Use `broadcast` or `flume` instead.
- `crossbeam::channel::Receiver::recv()` inside async code — sync API, blocks the worker. `crossbeam` is fine in pure-sync contexts (rayon, OS threads); not under tokio.
- `tokio::sync::mpsc::Sender::send(...)` (await form) inside a fast sync producer that cannot afford the await point — use `try_send` and handle the `TrySendError::Full` explicitly (§B14 backpressure).

**REQUIRED**:
- **Async multi-producer / single-consumer**: `tokio::sync::mpsc::channel(N)` (bounded; default).
- **Async multi-producer / multi-consumer**: `flume::bounded(N)` (works in both sync and async modes) or `tokio::sync::broadcast::channel(N)` — note the semantics divergence: `broadcast` delivers every message to every receiver and signals lag via `RecvError::Lagged`, whereas `flume` MPMC distributes each message to one receiver.
- **Sync MPMC**: `crossbeam::channel::bounded(N)` or `flume::bounded(N)` in sync mode.
- **Async single-producer / single-consumer**: `tokio::sync::oneshot::channel()` for one-shot; `tokio::sync::mpsc::channel(1)` for streamed.
- **Async with priorities**: build on `tokio::sync::Mutex<BinaryHeap<_>>` + a `Notify` for wake-ups, or use the `priority-queue` crate inside a `Mutex`. There is no standard async priority channel; document the choice.

## §C9. `tracing` span leakage across `tokio::spawn`

**The trap**: `tracing::Span::current()` reads the *thread-local* current span. `tokio::spawn` moves the future to another worker thread, where the current span on entry is the runtime's default span — **not** the parent's. Logs and traces emitted from inside the spawned future are therefore detached from the parent's request context; correlation breaks; tracing dashboards show orphan spans with no parent.

**BANNED**:
- `tokio::spawn(async move { ... tracing::info!(...) ... })` inside a request handler with an active span, *without* `.in_current_span()` (from `tracing::Instrument`) — the spawned future runs outside the parent span.
- Reading `Span::current()` *inside* the spawned future body and expecting it to be the parent — by the time the future runs, the thread-local has been reset.
- Using `tokio::task::spawn_blocking` and assuming the parent span is preserved — `spawn_blocking` moves work to a separate blocking-pool thread; the span is lost there too.

**REQUIRED**:
- Wrap spawned futures with the parent span: `tokio::spawn(my_fut.in_current_span())` (requires `use tracing::Instrument;` in scope). The `in_current_span()` adapter binds the *current* span to the future at spawn time, so it is restored when the future is polled.
- For `tokio::task::spawn_blocking`, capture the span explicitly and re-enter it inside the closure:
  ```rust
  let span = tracing::Span::current();
  tokio::task::spawn_blocking(move || {
      let _guard = span.enter();
      // ... sync work ...
  }).await?;
  ```
- For nested spawns (a spawned task spawns another), repeat `.in_current_span()` at each spawn — the property is not transitive automatically without it.

## §C10. Workspace feature unification surprises

**The trap**: Cargo unifies features across the entire workspace dependency graph. A feature activated in one crate's `[dev-dependencies]` for `cargo test` is *also* activated in another crate's `[dependencies]` for `cargo build --release`, because both depend on the same upstream crate and Cargo merges the feature set into one. Local tests pass, the workspace builds, the downstream consumer who depends on just one of the workspace crates suddenly fails because their feature set doesn't match the unified one.

**BANNED**:
- `default = ["heavy-dep"]` in `[features]` of a workspace member where `heavy-dep` is only needed by *some* consumers — every consumer who doesn't disable defaults pays the cost.
- Activating a feature in `[dev-dependencies]` of crate A which also appears in `[dependencies]` of crate B sharing the workspace — the feature leaks into B's release build via Cargo's feature unification.
- Treating workspace-internal features as private. They are visible (and unifiable) across the whole workspace and into any external consumer who pulls in any member crate.

**REQUIRED**:
- Default features in a workspace member = the **minimum truly required** for the crate to function at all. Every additional default is a tax on every downstream consumer.
- Run `cargo hack --feature-powerset --no-dev-deps check` in CI to detect feature combinations that don't compile (the `--no-dev-deps` flag prevents dev-only features from leaking into the matrix).
- For workspace-internal feature toggles, prefer `[workspace.metadata]` + `build.rs` `cargo:rustc-cfg=...` over `[features]` — `cfg` flags do not unify across the workspace the way features do.
- Document on every workspace member's `Cargo.toml`: which features are public (intended for external consumers) vs internal (used only by other workspace members).

## §C11. `Deref` polymorphism antipattern

**The trap**: `impl Deref<Target = Inner> for Wrapper` makes `wrapper.field_of_inner` and `wrapper.method_of_inner()` work transparently. The LLM uses this to fake inheritance — `struct UserAdmin(User); impl Deref<Target = User> for UserAdmin` — and the code compiles, runs, and looks elegant for a while. The breakdown comes when `UserAdmin` needs to participate in a trait `User` does not impl, or vice versa: the Rust API Guidelines explicitly call this out as **C-DEREF** ("`Deref` only for smart pointers"). Trait resolution does not look through `Deref` for trait bounds, only for method calls, so generic functions taking `User` will not accept `UserAdmin`, generic functions taking `UserAdmin` will not see `User`'s trait impls, and downstream code grows ad-hoc casts and `as_ref()` calls.

**BANNED**:
- `impl Deref<Target = Inner> for Wrapper` where `Wrapper` is not conceptually a *smart pointer to* `Inner`. Wrappers, newtypes for additional invariants, and "extension types" are not smart pointers.
- Using `Deref` to expose all of `Inner`'s methods through `Wrapper` for ergonomic shorthand — this leaks the inner's API surface into the wrapper's, and any future addition to `Inner` becomes part of `Wrapper`'s public API too (semver hazard, mirrors §C1).
- `impl DerefMut<Target = Inner> for Wrapper` on a wrapper that adds invariants — the `DerefMut` lets callers bypass every method `Wrapper` defined to maintain those invariants.

**REQUIRED**:
- `Deref` is reserved for smart pointers: `Box`, `Rc`, `Arc`, `Cow`, `MutexGuard`, `RwLockReadGuard`, `String → str`, `Vec<T> → [T]`, custom guards (`MyHandle<'a, T>` where `T` is the pointee). The relationship must be *pointer-like* (the wrapper owns/references the pointee; the wrapper is morally transparent to the pointee).
- For composition without inheritance, write explicit accessors: `impl UserAdmin { fn user(&self) -> &User { &self.0 } }`. This keeps the API surface of `UserAdmin` separate from `User` and makes the composition explicit at every call site.
- Cite the Rust API Guidelines **C-DEREF** rule in code review when this pattern appears: *"do not implement Deref if the relationship is not pointer-like"*.

---

# TIER D — Testing and CI gaps

Code passes `cargo test` for two distinct reasons: (a) it is correct, (b) the test is blind. Tier D is about (b). These categories produce green CI without producing evidence of correctness, and the failure mode is "the test that should have caught the regression doesn't, because the test was structurally unable to observe it".

## §D1. Tests that pass by luck

**The trap**: `thread::sleep(Duration::from_millis(N))` to "wait for the async work to finish" races: the work happens to complete in `< N ms` on the developer's machine, the test passes, CI runs slower (or faster) and the test flakes. `#[should_panic]` without `expected = "..."` catches *any* panic — including a panic in test setup before the system-under-test was even called — and the test author reads "should panic" as proof that the SUT panicked, when in fact it might have been the test scaffolding. Tests that only assert "no panic" (`do_thing(); assert!(true);`) prove the syscall ran, not that it produced the correct postcondition.

**BANNED**:
- `std::thread::sleep` or `tokio::time::sleep` (real) to synchronize a test with async work — race condition, flaky CI.
- `#[should_panic]` without `#[should_panic(expected = "specific message substring")]` — any panic, anywhere in the test, makes it green.
- Tests that assert no postcondition: `let _ = do_thing(); assert!(true);` — proves only that `do_thing` returned without panicking, which is the weakest possible assertion.
- Tests that compare two outputs derived from the same buggy intermediate (e.g., `assert_eq!(serialize(x), serialize(parse(serialize(x))))` does not prove `parse` is correct, only that it is idempotent on serialize output).

**REQUIRED**:
- For async timing in tests, use `tokio::time::pause()` / `tokio::time::advance(Duration::from_secs(N))` — virtual time that the runtime under your control. Or use explicit synchronization (`tokio::sync::Notify`, `oneshot::channel`) signalled by the async work itself.
- Always pin `expected = "..."` substring in `#[should_panic(expected = "...")]`. The substring should be specific enough that a panic from elsewhere in the test setup does not coincidentally match.
- Every test asserts a postcondition involving the system-under-test's *observable* state — a return value, a side effect on a passed-in mock, a state transition in a fake — not just absence of panic.
- For non-deterministic systems, use `proptest` / `quickcheck` to generate inputs, and explicitly state the property being tested in the test name.

## §D2. Integration vs unit test placement drift

**The trap**: unit tests in `#[cfg(test)] mod tests { ... }` inside `src/lib.rs` (or sibling modules) reference *crate-internal* paths — `crate::internal::do_thing()` — that work because they share the crate. Integration tests in `tests/*.rs` only see the crate's public API; they cannot reach `pub(crate)` items. When the LLM (or a refactor) moves a unit test into `tests/`, the import paths suddenly resolve differently, and the test either fails to compile, or — more insidiously — silently calls a different `do_thing` from a re-export and passes for the wrong reason.

**BANNED**:
- Moving a test from `#[cfg(test)] mod tests` to `tests/` (or vice versa) without checking that every import resolves to the same item.
- Integration tests in `tests/` that reach for `pub(crate)` items by re-exporting them through a public module just to make the test compile — this expands the public API for testing convenience and creates a semver hazard.
- Mixing both styles in one crate without a stated convention — readers cannot tell whether a `tests` directory file is the public-API exerciser or the leaked-internals tester.

**REQUIRED**:
- Unit tests for *private items* live next to the impl (`#[cfg(test)] mod tests { ... }` in the same file or sibling module). They can see `pub(crate)` and below.
- Integration tests in `tests/` exercise *only* the public API (`pub` items). They are the contract-test layer.
- If integration tests genuinely need internals, expose them under `pub(crate) mod test_support` (visible to other workspace crates if they share lineage) or gate them behind `#[cfg(feature = "test-support")]` so the feature is explicit and removable.
- Document the convention in `CONTRIBUTING.md` or the workspace `README`. Without a written convention, drift is inevitable.

---

# Version pins (deliberately current, verify against your MSRV)

This spec targets **Rust edition 2024, MSRV ≥ 1.84**. Several rules above depend on stability dates and library versions; if your project pins an older toolchain or older library, re-verify before applying these rules verbatim:

- `Box::<[T]>::new_uninit_slice(N)` — stable since **Rust 1.82** (October 2024). Required for the §B7 uninit-buffer pattern without `unsafe`-around-`mem::MaybeUninit`.
- `Vec::into_raw_parts` — **stable since Rust 1.93**. For MSRV < 1.93, use the `ManuallyDrop<Vec<T>>` + manual `(ptr, len, cap)` decomposition (stable since 1.0). The spec's MSRV floor is 1.84, so by default the manual form is what you write; bump the MSRV explicitly if you want the convenience.
- `unexpected_cfgs` lint — automatic since **Rust 1.80** (July 2024) per §C7. Older toolchains require the manual `[lints.rust] unexpected_cfgs = ...` configuration.
- **AFIT** (async fn in trait) — stable since **Rust 1.75** (December 2023) per §B15. Pre-1.75 code must use `async-trait`.
- **`tracing::Instrument::in_current_span`** — stable in `tracing` 0.1.x; pin the version.
- **`tokio::sync::Mutex` cancel-safety** — pin tokio version (1.x stable API; cancel-safety annotations live in tokio's docs).
- **`rand` 0.8 / 0.9 split** — `thread_rng()` in 0.8 → `rng()` in 0.9. The `OsRng` recommendation in §B12 holds for both.
- **`subtle` crate** for §B24 — stable, `subtle::ConstantTimeEq::ct_eq` is the canonical entry point.
- **Strict-provenance API** (`ptr.with_addr`, `ptr.addr`, `ptr.expose_provenance`, `with_exposed_provenance`) per §B5 — stable since **Rust 1.84**.
- **`tokio::task::consume_budget`** per §B11 — stable in tokio 1.x.
- **Panic across `extern "C"`** per §B25 — pre-Rust 1.81 the behavior was UB; **since Rust 1.81** the default is process abort. The `extern "C-unwind"` ABI (also stabilized) opts into defined unwinding for callers that can handle it. Either way, `catch_unwind` at the boundary is the safe answer.

---

# Pre-flight checklist (run mentally before any non-trivial Rust)

Before writing the code, answer all seven out loud:

1. **Versions**: which exact crate versions am I targeting? Did I read `Cargo.toml` and `CLAUDE.md`?
2. **APIs**: am I about to call any method I'm not 100% sure exists in the pinned version? If yes, flag it.
3. **Async or sync context**: will this run under tokio? Are there locks that could cross `.await`? Is this `Send + 'static`?
4. **Cancel-safety**: for every `async fn`, can it tolerate cancellation at every `.await`? If not, where do I detach via `spawn` or document the precondition?
5. **Unsafe**: do I have a stated `// SAFETY:` invariant for each block? Is miri in CI for this file?
6. **Lifetimes**: if I'm returning a reference, can I write two consecutive call sites with disjoint inputs?
7. **Public surface**: is anything I'm marking `pub` part of the intended public API? Any blanket impls? Any error types leaking through?

If I cannot answer any of these confidently, I ask the user before generating code rather than guessing.

---

# Post-flight checklist (run after generating Rust)

```bash
cargo build                                                   # baseline
cargo clippy -- -W clippy::pedantic \
                -W clippy::await_holding_lock \
                -W clippy::unwrap_used \
                -W clippy::expect_used \
                -W clippy::missing_safety_doc \
                -W clippy::undocumented_unsafe_blocks \
                -W clippy::clone_on_copy \
                -W clippy::redundant_clone \
                -W unused_must_use
cargo test
cargo +nightly miri test    # for any file touching unsafe
```

Optional but strongly recommended for production code:
- `tokio-console` to observe runtime task health and detect blocked workers (§B11) or stuck locks (§B9).
- `heaptrack` or `valgrind --tool=massif` for steady-state memory profiling (§B10).
- `loom` for concurrency model checking of multi-lock code (§B9).

For any of the following found in the generated code, surface it explicitly to the user in the summary with line numbers and justification:
- `unsafe`
- `unwrap`, `expect`
- `transmute`, `mem::transmute_copy`
- `Arc<Mutex<_>>`, `Arc<RwLock<_>>`
- two or more lock acquisitions in the same function or call chain (§B9)
- `Rc<RefCell<_>>` or `Arc<Mutex<_>>` in graph/tree structures (§B10)
- manual `Send` / `Sync` impl
- blanket impl (`impl<T: Bound>`)
- `panic!`, `unimplemented!`, `todo!`, `unreachable!`
- `pub` items added to the crate API
- `as` casts between integer types of different signedness or width
- any async function call without `.await` (§B8) — verify intentional fire-and-forget via `tokio::spawn`
- `std::thread::sleep`, `std::fs::*`, `reqwest::blocking::*` inside any `async` context (§B11)
- any cryptographic operation (§B12) — list every crypto call, library, and parameter explicitly
- every new dependency added to `Cargo.toml` (§A1) — list crate name, version, and a one-line justification for each, so the user can audit against slopsquatting
- every `pub fn` with a non-`'static` output lifetime (§B1) — flag as potential API lifetime leak
- every check-then-act pattern on a shared collection (§B13) — `contains_key` + `insert`, `get` + `set`, lock-load-modify-store
- every `unbounded_channel`, `flume::unbounded`, `async_channel::unbounded` (§B14) — require explicit justification or replacement with bounded variant
- every `async fn` in a trait definition (§B15) — flag missing `+ Send` bound for tokio spawn use
- every manual `Future::poll` implementation (§B15) — verify waker registration before `Poll::Pending`
- every `Pin::new_unchecked` or `mem::transmute` of pin-related types (§B15) — verify the SAFETY justification holds
- every `.lock().unwrap()` (§B2 poisoning) — recommend explicit poison handling for non-trivial code
- every proc-macro that emits bare `Option`/`Result`/`Vec` paths (§C6) — hygiene risk
- every manual `impl PartialEq` / `impl Ord` / `impl Hash` (§B16) — verify the `a == b ⇒ hash(a) == hash(b)` contract and total-order property
- every `f64` / `f32` field on a type used as a map key (§B16) — flag for `NotNan` / `OrderedFloat` wrap
- every `RefCell::borrow_mut` reachable through a callback chain or trait dispatch (§B17) — flag potential reentrant panic
- every `unsafe impl Send` / `unsafe impl Sync` (§B18) — verify the cited synchronization invariant
- every `for i in 0..vec.len()` loop whose body mutates `vec` (§B19) — verify the loop is well-founded
- every `RefCell<Vec<T>>` iterated through `borrow().iter()` with mutation inside (§B19) — flag potential invalidation
- every `#[serde(untagged)]` enum (§B20) — verify variant-shape disjointness
- every `#[serde(default)]` on `Option<T>` (§B20) — flag if "absent vs null" distinction matters
- every `#[serde(rename = "...")]` (§B20) — verify round-trip test exists
- every `tokio::spawn` whose returned `JoinHandle` is dropped (§B21) — verify intent is documented as detached-by-design
- every `impl Drop` that calls `.await`, `block_on`, or `tokio::spawn` (§B22) — flag as defective; require explicit `async fn close(self)`
- every `tokio::select!` arm with side effects inside the pending future (§B23) — verify cancel-safety per arm
- every `==` / `!=` on `&[u8]` / `Vec<u8>` / `String` adjacent to secret material (§B24) — replace with `subtle::ConstantTimeEq`
- every `extern "C" fn` (§B25) — verify the panic path is wrapped in `catch_unwind` and the body cannot abort silently
- every `Box::into_raw` / `Box::from_raw` pair and every `Vec::into_raw_parts` / `Vec::from_raw_parts` pair (§B25) — verify same-process, same-allocator, matching `cap`, and that a paired free function exists for cross-boundary cases
- every channel choice (§C8) — verify the channel kind matches the runtime and the producer/consumer cardinality
- every `tokio::spawn` inside a function with an active `tracing::Span` (§C9) — verify `.in_current_span()` is applied
- every workspace member's `default` feature set and every feature activated in `[dev-dependencies]` (§C10) — flag potential feature unification leak
- every `impl Deref<Target = Inner> for Wrapper` where `Wrapper` is not a smart pointer (§C11) — recommend explicit accessor instead
- every `#[should_panic]` without `expected = "..."` (§D1) — pin the expected message substring
- every `thread::sleep` or real `tokio::time::sleep` inside a test (§D1) — replace with virtual time or explicit synchronization
- every test in `tests/` reaching for `pub(crate)` items (§D2) — flag placement drift

---

# When this command is loaded

I will:
- Read `Cargo.toml` and `CLAUDE.md` to pin versions and idioms before writing code.
- Treat every rule above as a HARD constraint, not a guideline.
- Surface violations as blocking issues, not warnings.
- Refuse to write trait hierarchies blind; propose, then wait for approval.
- Refuse to write `unsafe` without `// SAFETY:` justification.
- Flag API calls I'm uncertain about rather than hallucinate them.
- Run the post-flight checklist mentally and report results before declaring work complete.

The principle: **if a category of bug exists where the compiler cannot help, the discipline must move from the type system into this checklist**. Rust gives me the strongest type system of any mainstream language, but cancel safety, semver, drop ordering, and UB in unsafe live outside it. This document is where that gap is filled.