---
description: Hard rules for writing Rust in code that already compiles and passes tests but is silently broken, slow, or semver-fragile. Load this BEFORE writing any Rust code. Targets bugs that survive rustc, clippy, and cargo test but fail in production or rot the codebase. Covers async, unsafe, FFI, concurrency, crypto, supply-chain, tests-that-pass-by-luck, and systemic performance-at-scale hazards.
---

# Rust Intel — Defense Against LLM Failure Modes

**Scope, stated up front.** This spec assumes your code already compiles. It assumes `cargo test` is green. That is not enough. The categories below cover the failure modes that survive `rustc`, `clippy`, and the test suite, and only manifest as production incidents, semver breakage, performance collapse under load, or silent data corruption. Compilation-only failures (lifetime variance *in safe code*, trait bound mismatch, GAT lifetime bound errors, object-safety violations through generic methods, cyclic workspace deps, `?` in `main`, HRTB depth, recursive macro limits, self-referential structs in safe Rust, `no_std` reflexive `std::*` imports, `From`/`Into` cycles) are deliberately omitted — `rustc` already catches them and the LLM cannot ship them. (Exception: variance **soundness** in `unsafe` raw-pointer wrappers is *not* caught by the compiler — that is §B18a, and it is in-scope.) This spec covers what ships anyway.

The **fifty-one categories** (held in this skill's theme modules — see the category→module map below) rest on an empirical base — a published 6-month field report on ~80k LOC of production LLM-generated Rust, academic benchmarks (RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust), the error distribution observed across Claude/GPT/Cursor through 2025–2026, and real supply-chain incidents (CrateDepression 2022, `faster_log`/`async_println` 2025). (The count is of numbered categories; §B1, §B4, §B15, §B18, and §C1 split into lettered sub-sections — §B1a/b, §B4a, §B15a–e, §B18a, §C1a — that are referenced and triggered individually but counted under their parent.) Citations, URLs, sample sizes, and every percentage live in [`docs/sources.md`](docs/sources.md); load it alongside this file when a figure is load-bearing. The category→module map below is the index; the category bodies live in the theme modules, not in this file.

Industry signal: per Faros AI and Lightrun studies (2026), shifting from low to high AI adoption more than doubles the incidents-to-PR ratio, and 43% of AI-generated code changes need debugging in production; among surveyed engineering leaders, zero rated themselves "very confident" that AI-generated code behaves correctly once deployed. (These figures concern AI-generated code in general, not Rust specifically — see docs/sources.md.) This is the empirical context this document defends against.

The categories split into **five tiers and a meta-layer**, listed below:
- **Self-monitoring**: a triggers table (phrase- *and* code-pattern-based) that maps user-request patterns to risk categories. Scanned before generating code.
- **Tier A — Compile-fix reflexes that leave silent residue (§A1, §A2, §A3)**: not "the compiler caught it and you fixed it correctly", but "the compiler caught it and the cheapest fix compiles while leaving a real defect behind". Stale-but-valid APIs, supply-chain via slopsquatting, reflexive `Arc<Mutex<T>>`, `pub` as a hammer for `E0603` that silently expands the public API.
- **Tier B — Silent correctness bugs (§B1–§B29)**: pass compilation, often pass tests, fail in production. This is where the spec lives. Includes UB, async pitfalls (basic and advanced), lock ordering, memory leaks, silent task dropping, cryptographic insecurity, TOCTOU races, backpressure neglect, Mutex poisoning, equality/hash contracts, runtime borrow panics, manual `Send`/`Sync`, iterator invalidation through indirection, `serde` field-presence drift, `JoinHandle` semantics, the async-`Drop` impossibility, `select!` side-effect cancellation, timing-attack-prone equality on secrets, panic / ownership across `extern "C"` FFI, lossy numeric conversions, wall-clock vs monotonic time, and UTF-8 string-boundary hazards.
- **Tier C — Architecture and ergonomics (§C1–§C11)**: design-level mistakes that are expensive to undo. Reflexive `.clone()`, procedural macro hygiene, Cargo feature flag hygiene, channel-and-runtime mismatch, `tracing` span leakage, workspace feature unification, `Deref` polymorphism.
- **Tier D — Testing and CI gaps (§D1–§D2)**: code passes tests not because it's correct but because the tests are blind. Timing-based async tests, `#[should_panic]` without `expected`, unit-vs-integration placement drift.
- **Tier E — Systemic cost (§E1–§E6)**: correct in the small, wrong at scale — performance, allocation, complexity, and contention costs that survive `rustc`/`clippy`/tests and only bite under load. A different axis from A–D (cost, not correctness); enforced 🟡/🟢, never 🔴.

---

## Running a full pass — one agent per module, not one agent for everything

This skill is split into modules (see the **category→module map** below): each theme — async, unsafe/FFI, concurrency, data/types, security, drop/RAII, deps/macros, lifetimes/API, testing — is its own file. For a **full-coverage pass** — auditing a codebase against every category, or reviewing/analyzing this skill itself — do **not** pull all modules into one context and grind through them serially. A single agent holding all ~51 categories loses detail and misses findings — the very overload this skill warns about, turned on itself.

**Instead, fan out — one agent per module — using the Workflow tool:**
- spawn one sub-agent per module listed in the category→module map;
- hand each agent ONLY its module plus the target (the code under audit, or the module under review);
- each agent goes deep on its small slice and returns structured findings;
- a final synthesis agent merges, dedups, and prioritizes.

This is the intended way to apply the skill at scale: **don't do it all yourself — delegate one agent per section.** A single trigger firing, or one category match, still applies **inline** — no workflow needed; fan out only for a full or broad pass. (A ready maintainer workflow that reviews this skill's own modules lives at `dev/review-modules.workflow.js`.) For **auditing a codebase**, a ready fan-out workflow ships with this skill: `audit-project.workflow.js` (sibling of this file). Launch it via `Workflow({scriptPath: '<skill-dir>/audit-project.workflow.js', args: {target: '<path>', skillDir: '<skill-dir>'}})`. It reads SKILL.md at runtime to slice the trigger tables per module (zero knowledge duplication), splits the async module into two agents (await-discipline vs machinery/cost), and synthesizes findings in the `/rust-cc-audit` report format. If the Workflow tool is unavailable, write the equivalent fan-out manually via the Agent tool — one agent per module listed in the category map above.

---

## Principle: prove, don't guess

Operating as a **verifying engineer, not a code-completion engine**:
- I generate code I can justify, not code that looks plausible. When uncertain about an API, a lifetime, a trait bound, or a Drop contract, I say so and ask rather than ship something that compiles by luck.
- When context is insufficient to prove correctness, I either block (the three security-critical cases) or proceed with explicitly stated assumptions (everything else) — see "Blocking protocol" below.
- "Compiles" and "tests pass" are necessary but never sufficient; the bugs in this document live in the gap between those signals and actual correctness. This principle activates every rule below.

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

Cases where I **hard-block** rather than guess (the irreversible / security-critical three):
- The user asks for cryptographic code and the threat model is unstated (§B12) — getting this wrong is silent, catastrophic, and not caught by tests.
- The user asks for `unsafe` code but the invariants the caller will uphold are unstated (§B5) — guessing produces UB.
- I would need to add a dependency the user did not name and whose existence I have not verified (§A1) — guessing a crate name is a supply-chain attack vector.

For every other gap — unknown crate versions, a missing trait definition, drop semantics I'm unsure of, or an unclear cancellation context — I do **not** block. I **proceed with explicitly stated assumptions**: I generate the code, record each assumption in a comment block at the top of the response (e.g. `// ASSUMES: tokio 1.x mpsc tuple shape; commit failure propagates as Err`), and ask the user to confirm. Blocking the whole response on these would be more friction than it buys.

A blocking message is not failure. Generating crypto/`unsafe`/supply-chain code on a guess *is* failure. Blocking is how that specific failure is prevented; stated assumptions handle the rest.

---

## Operating mode

Whenever this command is loaded, before generating any Rust code I will:

1. **Pin the world.** Read `Cargo.toml` (and `CLAUDE.md` if present) for exact crate versions of `tokio`, `axum`, `sqlx`, `reqwest`, `serde`, `hyper`, `clap`, and any other major dependency. State the assumed versions in a comment block at the top of the response. If versions are unknown and cannot be read, state the assumed versions as explicit assumptions and ask the user to confirm (per the Blocking protocol) — do not silently guess. *RustEvo² shows pass@1 drops from 56.1% to 32.5% on post-cutoff APIs — guessing is the dominant source of API hallucinations.*

2. **Map the project idioms.** If `CLAUDE.md`, `README.md`, or top-level docs declare project conventions (error type, logging crate, runtime, lint level), follow those. Do not introduce a new error-handling style, a new async runtime, or a new logging crate without explicit permission.

3. **Refuse to design trait hierarchies blind.** For a new trait in the **public API of a published library** (mirror of §C1), propose the signature in plain text first and wait for approval before committing impls — LLMs make strategic mistakes here (object safety, sealed vs open, blanket impls) that are expensive to undo across a semver boundary. Drafting is fine; committing the public surface is not. For a bin or internal/workspace crate, proceed, but flag the object-safety / sealed-vs-open / blanket-impl decision inline.

4. **Refuse `unsafe` without `// SAFETY:`.** Every `unsafe` block must be preceded by a `// SAFETY:` comment naming every invariant the operation relies on. No exceptions, including "obvious" cases.

5. **Annotate cancel-safety where it can bite.** See §B3. A `/// cancel-safe: yes` / `/// cancel-safe: NO — <reason>` doc line is mandatory only for an `async fn` that is (a) documented to run under `select!` / `timeout`, or (b) actually called from a cancellation node (a `select!` arm or `timeout` body) somewhere in this change. For any other `async fn`, annotate only if the cancel-safety is non-obvious; a trivial one (zero or one `.await`, no side effect on a losing path) needs nothing.

6. **Show the caller for genuinely multi-lifetime returns.** A function whose returned reference is tied to **more than one** input lifetime (the §B1a laundering shape) requires at least one example call site in a comment or test — two consecutive calls with disjoint inputs — before the signature is final. A plain `&T` derived from a single input does not. See §B1.

7. **Surface 🔴-tier items in the summary; note the rest inline.** When work is complete, list every occurrence of the 🔴-tier items (see "Enforcement tiers" for the canonical list) with file:line and justification each. Other risky constructs (`unwrap`, `expect`, routine `Arc<Mutex<_>>`, `panic!`, `unimplemented!`, `todo!`) are noted inline at write time, not enumerated in the summary.

---

# Enforcement tiers — not every rule is equal

Treating all 51 categories as equally critical produces noise that buries the few findings that matter. Apply rules at one of three tiers:

**🔴 Surface-always / may block.** High blast-radius, often irreversible, invisible to tooling. Always list every occurrence in the summary; for crypto and unsafe-with-unstated-invariants, block and ask rather than guess (see Blocking protocol). These are:
- §A1 adding an unverified / unnamed dependency (slopsquatting — runs malicious code)
- §B5 `unsafe`, `transmute`, `mem::uninitialized`/`zeroed`
- §B12 any cryptographic operation
- §B13 (the `Relaxed`-publish data race only — invisible to x86 tests, breaks on ARM; the broader check-then-act/TOCTOU body of §B13 is 🟡, applied at write time)
- §B14 `unbounded_channel` / unbounded `FuturesUnordered`
- §B18 manual `unsafe impl Send`/`Sync`
- §B18a wrong / absent `PhantomData` on a raw-pointer wrapper (covariance where invariance is needed → UAF; a relational invariant no runtime guard can catch)
- §B21 a `tokio::spawn` whose `JoinHandle` is dropped
- §B22 `impl Drop` doing async work
- §B24 `==` on secret material
- §B25 `extern "C"` boundary / `Box::from_raw` / `from_raw_parts`
- §B15b `Pin::new_unchecked`
- §C1 blanket impl in the public API of a **published** library (semver hazard; not a concern for bin/internal crates)

**🟢 Delegate to clippy — do not hand-check or re-surface.** The toolchain already catches these; just run the linter (see Post-flight) and trust it:
- narrowing `as` casts → `clippy::cast_possible_truncation` (pedantic). **Caveat:** a narrowing cast *on a trust boundary* (`len() as u32`, a cast applied to untrusted/network input) is surfaced even when `pedantic`/clippy is off — the truncation there is a correctness/security bug, not a style nit (see §B26 — the trust-boundary narrowing-cast bullet).
- redundant / `Copy` clones → `clippy::clone_on_copy`, `clippy::redundant_clone`
- typo'd `cfg(feature = …)` → the automatic `unexpected_cfgs` lint (Rust 1.80+)
(Integer overflow is the exception: `clippy::arithmetic_side_effects` is `restriction`, off even under `pedantic` — see §B26.)

**🟡 Apply while writing — don't spam the summary.** Everything else. Write the code correctly the first time per the category, but do not list every `+`, `clone`, cast, or `sort_unstable` as a "finding" — that is the noise this tier exists to prevent. Surface one of these only when it is genuinely load-bearing or you are unsure. **Inline-flag policy (canonical):** when a category body says to "flag/note X inline (at write time)", it means a one-line comment at the construct, *not* a summary entry — and only when the construct is non-obvious or load-bearing. This is the single definition; the per-category reminders point back here. All of **Tier E (§E1–§E6)** lives here too — it is a 🟡/🟢 tier on a different axis (systemic cost, not correctness) and nothing in it is ever 🔴: apply 🟡 on hot / per-request paths and let 🟢 (`clippy::perf`) catch the obvious waste.

The goal: a summary a human can read in ten seconds, where every line is worth acting on.

---

# Tier overviews

# TIER A — Compile-fix reflexes that leave silent residue

Tier A is not "bugs the compiler catches and stops". The compiler does its job — the bugs that matter here are the *next move*: the LLM sees a red squiggle and reaches for the cheapest fix that compiles, and the cheapest fix compiles **while leaving a real defect behind**. Stale-but-still-valid APIs, deprecated-not-removed APIs, wrong-version-of-crate behaviors, hallucinated crate names that someone else registered as malware, reflexive `Arc<Mutex<T>>`, and `pub` as a hammer for `E0603` are the canonical examples. The compiler is your friend; this tier is about the moments when you ignore that friend's structural signal and silence the symptom.

*Categories whose primary failure mode is a compile error and which leave no silent residue are deliberately omitted from this spec (full list in "Scope, stated up front" above); the compiler already catches them. An earlier draft of this spec included a Tier A category for trait bounds and type mismatches; it was retired in v0.3.0 on the same scope grounds, and the remaining Tier A categories were renumbered to close the gap.*

# TIER B — Silent correctness bugs

These pass `cargo build`, often pass `cargo test`, and fail in production. The twenty-nine categories below are the ones that hurt — and this is where the spec's real value lives.

**Why this tier exists**: high compilation rate is not correctness. The published 2026 field report on ~80k LOC of LLM-generated tokio/sqlx code (see [`docs/sources.md`](docs/sources.md)) shows that **§B2 alone (`Mutex` across `.await`) was responsible for failure in roughly half of async tasks** before defensive prompting cut it sharply; security-focused evaluations show static analyzers miss a large share of vulnerabilities in LLM-generated crypto Rust that *does* compile (§B12). The category list below is structured around this gap between `cargo test` green and actual correctness — see [`docs/sources.md`](docs/sources.md) for the full evidence trail.

# TIER C — Architecture and ergonomics

These are not bugs in the strict sense, but design choices the LLM makes that are expensive to reverse.

# TIER D — Testing and CI gaps

Code passes `cargo test` for two distinct reasons: (a) it is correct, (b) the test is blind. Tier D is about (b). These categories produce green CI without producing evidence of correctness, and the failure mode is "the test that should have caught the regression doesn't, because the test was structurally unable to observe it".

# TIER E — Systemic cost: correct in the small, wrong at scale

When memory is safe, the borrow checker is satisfied, and `cargo test` is green, failure does not disappear — it moves up a level. The more capable and complex the system, the more it fails not in a line but as a whole: latency, allocation pressure, contention, compounding complexity, resource exhaustion under load. Every line is locally correct; the system is not. No compiler and no test suite catches this class — it is paid in production, under load, at scale.

These are not `BANNED`/`REQUIRED` rules — performance is *spent*, not forbidden. Each law names where the cost hides, the cheaper move, and when to leave it alone. Nothing in this tier is 🔴: apply 🟡 on hot / per-request paths, let 🟢 (`clippy::perf`) catch the rest, and obey §E6 — measure before you spend.

# Self-monitoring: prompt triggers that activate failure modes

Before generating code, I scan the user's request for triggers below. If a trigger fires, the linked category is on heightened alert. This is the meta-rule: **knowing why I would make a mistake here is half the defense**.

| User request contains... | Activates category | Specific risk |
|---|---|---|
| "cache", "memoize", "store results" with returned `&T` | §B1 lifetime laundering | One `'a` for input and cache, collapsing lifetimes |
| "shared between threads", "concurrent", "from multiple tasks" | §B2 Mutex across .await; §A2 smart pointer misuse | Default to `std::sync::Mutex`, reflexive `Arc<Mutex<T>>` |
| "with timeout", "select!", "cancel", "race two futures", "first one wins" | §B3 cancel safety; §B23 select arm side effects | Silent partial state, no cancel-safe annotation; side effect on losing arm broken by cancellation |
| "transaction", "rollback", "commit" | §B4 Drop and RAII | Library-specific Drop semantics on commit failure |
| "migrate to edition 2024", "if let with a lock", "guard in if-let/else" | §B4a edition-2024 drop order | temporary drop point shifted; deadlock silently appears/disappears |
| "fast", "zero-copy", "performance", "parse bytes", "from network" | §B5 unsafe UB | `ptr::read` on unaligned buffers; validate raw bytes → `Result` before minting a typed value |
| "transmute bytes to a struct", "reinterpret bytes", "from_bytes", "cast bytes to type", "parse a binary header" | §B5 unsafe→safe boundary | validate bytes → `Result` *before* minting the type (`from_utf8`/`TryFromBytes`/`Pod`), never `transmute` then check; relational invariants (lifetime/aliasing/provenance) have no runtime guard |
| "fix this borrow error", "make this compile", "lifetime issue" | §C5 reflexive clone | `.clone()` as silencer of real ownership problem |
| "implement trait for any T", "generic Display", "blanket impl" | §C1 semver hazard | Open blanket impl in public API |
| "buffer of size N" where N is large | §B7 stack overflow | `[u8; N]` by value or `Box::new([0u8; N])` |
| "parse this", "convert from string" | §C2 error handling | `.unwrap()` instead of typed error |
| "define an error type", "error enum", "thiserror", "library error" | §C1a non_exhaustive; §C2 error handling | a published error enum without `#[non_exhaustive]` → adding a variant is a semver-major break downstream |
| "use the latest version of X", "modern Y" | §A1 API hallucinations | Memory of pre-cutoff API for fast-evolving crates |
| Code involves crate version 0.x | §A1 pre-1.0 churn | Breaking changes between minor versions |
| "lock the X and the Y", "two shared resources", "atomic update across two" | §B9 ABBA deadlock | Locks acquired in opposite orders |
| "tree with parent links", "graph structure", "bidirectional", "scene graph", "DOM-like" | §B10 reference cycles | Symmetric `Rc<RefCell>` without `Weak` |
| "read a file", "make HTTP request", "sleep", "wait N seconds" in async context | §B11 blocking executor | `std::fs`/`std::thread::sleep` in `async fn` |
| "add this dependency", "use crate X for Y", "what crate should I use" | §A1 slopsquatting | Hallucinated crate name → supply-chain attack |
| "encrypt", "decrypt", "hash a password", "JWT", "TLS", "sign this", "AES", "AEAD" | §B12 crypto insecurity | Nonce reuse, weak primitives, hallucinated crypto API |
| "public API", "library", "publish to crates.io", "what should the signature be" | §B1 lifetime leaking; §C1 blanket impls; §C1a non_exhaustive | `'a` in public signatures, semver hazards; adding an enum variant / struct field is a major break without `#[non_exhaustive]` |
| "lazy cache", "memoize", "compute if absent", "deduplicate concurrent requests", "ensure only once" | §B13 TOCTOU | `contains_key` + `insert` race; should be `entry().or_insert_with` |
| "background worker", "event queue", "log pipeline", "broadcast to subscribers", "producer-consumer" | §B14 unbounded queue | `unbounded_channel` instead of bounded + backpressure policy |
| "trait with async method", "trait Foo { async fn ... }", "trait object" | §B15a AFIT/RPITIT | Missing `+ Send` bound, not spawn-able; for a `dyn` async trait, not dyn-compatible without `async-trait` |
| "implement Future manually", "custom Poll", "wake the task" | §B15b Waker | `Poll::Pending` without registering waker → hang forever |
| "block_on this from a helper", "synchronous wrapper for async" | §B15c nested runtime | `block_on` inside async context → panic |
| "Pin this", "self-referential struct", "Pin::new_unchecked" | §B15b Pin misuse | Unsafe Pin without proving non-movement |
| "procedural macro", "derive macro", "proc-macro2", "syn"/"quote" | §C6 macro hygiene | Bare `Option`/`Result` paths, `panic!` in macro errors |
| "feature flag", "conditional compilation", "cfg attribute" | §C7 feature hygiene | Typo'd feature names silently become dead code |
| "singleton", "global state", "static config", "app-wide", "OnceLock", "lazy_static", "once_cell" | §A2 Box::leak; §B13 TOCTOU | leak grows on re-init (use `OnceLock`/`LazyLock`); init race |
| "retry", "exponential backoff", "retry with jitter" | §B3 cancel safety; §B14 unbounded queue | Cancellation between retry and ack; retry buffer growth |
| "rate limit", "throttle" | §B14 backpressure | Unbounded queue feeding the limiter |
| "batch", "buffer messages", "coalesce" | §B14 backpressure; §C8 channel choice | Wrong channel for the producer/consumer fanout |
| "compare token", "verify signature", "check password hash", "verify MAC", "validate HMAC" | §B24 timing attack | `==` on secret material is a network-observable side channel |
| "deserialize JSON", "parse config", "load YAML", "decode payload" | §B20 serde field-presence | `null` vs absent collapse; `untagged` variant overlap |
| "tracing span", "log context", "instrument", "correlation id" | §C9 span leakage | `tokio::spawn` without `.in_current_span()` |
| "close connection", "shutdown gracefully", "flush buffer", "drain on exit" | §B4 Drop semantics; §B22 async Drop is not real | Library-specific Drop; async cleanup in `Drop::drop`; drop-order deadlock (`JoinHandle` joined before `Sender` closed) |
| "workspace", "shared crate", "feature unification", "internal feature" | §C10 workspace unification | dev-dep features unify into a normal dep only in builds that pull dev targets (resolver v2); they leak into a plain release build only under resolver v1 |
| "channel", "mpsc", "broadcast", "queue", "fan-out", "fan-in" | §C8 channel/runtime mismatch; §B14 backpressure | Wrong channel kind for the runtime + unbounded default |
| "shared mutable state", "interior mutability", "shared between callbacks" | §A2 smart pointer; §B17 reentrant borrow; §B18 manual Send/Sync | Reflexive `Arc<Mutex<T>>`; reentrant `RefCell`; `unsafe impl Send` |
| "PhantomData", "raw pointer wrapper", "*const/*mut field", "make my type Send", "covariant/invariant", "NonNull wrapper" | §B18a variance/`PhantomData`; §B18 manual Send/Sync | wrong / absent `PhantomData` → covariance where invariance is needed → UAF with no `unsafe` at the call site |
| "wrap a type", "thin wrapper", "extension type", "augment an existing struct" | §C11 Deref antipattern; §C1 newtype + `repr(transparent)` | Fake inheritance via `Deref`; missing `#[repr(transparent)]` |
| "async cleanup", "destructor closes resource", "RAII for async resource" | §B22 async Drop is not real | `tokio::spawn` from `Drop`; `block_on` from `Drop` |
| "spawn a task", "background task", "fire and forget", "spawn and forget", "send notification", "log this event async" | §B21 JoinHandle semantics; §B8 silent task drop; §C9 span leakage | Dropped `JoinHandle` ≠ abort; forgotten `.await` (future never polled); missing `.in_current_span()` |
| "hash this", "use as a map key", "deduplicate by", "compare structurally" | §B16 Eq/Hash contract | Manual `PartialEq` without matching `Hash`; `f64` as key |
| "BFS", "DFS", "tree traversal", "walk the graph", "iterate and modify" | §B19 iterator invalidation | Mutating through `RefCell`/indices while iterating |
| "untagged enum", "polymorphic JSON", "shape-dispatch" | §B20 serde untagged | Overlapping variant shapes; silent mis-match |
| "Stream", "futures::Stream", "async iterator", "while let next" | §B15d Stream vs Iterator | `for x in stream` doesn't compile; missing `StreamExt` |
| "deadline", "wall clock timeout" | §D1 tests by luck; §B3 cancel safety | `thread::sleep` in tests; cancellation between deadline arms |
| "test that this panics", "should_panic", "expected panic" | §D1 tests by luck | `#[should_panic]` without `expected` catches any panic |
| "MaybeUninit", "uninitialized memory", "zero-init buffer" | §B5 unsafe; §B7 large stack | `mem::uninitialized` is UB; `Box::new([0;N])` is on stack |
| "FFI", "bindgen", "C library", "extern C", "native bindings", "wrap a C API" | §B25 FFI ABI; §B5 unsafe | Panic across `extern "C"`; allocator mismatch on `Box::from_raw`; `cap`-mismatched `Vec::from_raw_parts` |
| "every N seconds", "periodically", "on a timer", "scheduled tick" | §B15e interval first-tick | first tick is immediate; the default `MissedTickBehavior::Burst` replays missed ticks back-to-back under lag |
| "exit the program", "bail out", "exit with code", "abort on error" | §B4 process::exit skips Drop | Stack guards (transactions, files, locks) never run their Drop |
| "exit fast", "teardown", "free on shutdown", "drop a large structure", "destroy the tree/arena/map on exit" | §B4 drop at exit (memory vs resource); §B7 recursive Drop | memory-only `Drop` walking a huge structure stalls exit (skip via `mem::forget`/`process::exit`); resource-cleanup `Drop` must still run; recursive `Drop` on deep input overflows the stack |
| "wait for signal", "wait until ready", "condition variable", "notify the worker" | §B15e Notify lost-wakeup | Wakeup races with `notify_one` unless armed via `enable()` before the check |
| "log this struct", "add debug logging", "derive Debug" (on types holding secrets) | §B12 crypto Debug-leak | `{:?}` prints `password`/`token`/`key` fields into logs |
| "compare floats", "approximately equal", "assert the result is ~X" | §D1 tests by luck | `assert_eq!` on computed `f32`/`f64` flakes across builds/arches |
| "cast", "convert to u32/i64", "as usize", "truncate to" | §B26 lossy numeric | `as` silently truncates/saturates; use `try_from` |
| "measure time", "duration", "how long", "timeout", "benchmark", "elapsed" | §B27 wall-clock vs monotonic | `SystemTime` non-monotonic; `.elapsed().unwrap()` panics; use `Instant` |
| "substring", "first N characters", "truncate string", "slice the string", "uppercase/lowercase" | §B28 UTF-8 boundaries | `&s[..]` panics on char boundary; `len()` is bytes |
| "parse JSON id", "large id", "snowflake", "timestamp in JSON" | §B20 numeric fidelity | `f64` loses precision above 2^53 |
| "read env var", "configuration from environment" | §C2 env::var | `.unwrap()` panics on missing/non-UTF8; use `var_os` |
| "sort by", "order by", "multi-key sort" | §B16 sort stability | `sort_unstable` breaks secondary order |
| "recursive parser", "walk the tree", "parse nested" | §B7 recursion depth | unbounded depth → stack overflow (DoS) |
| "read a length prefix", "preallocate a buffer", "buffer from a size field", "read N bytes where N is from input" | §B7 allocation DoS | `with_capacity(attacker_n)` → OOM; clamp + `Read::take(limit)` |
| "counter", "offset", "accumulate", "running total", "sum", "balance", "index arithmetic" | §B26 integer overflow | debug panics, release silently wraps; use `checked_*`/`saturating_*` |
| "divide", "modulo", "percentage", "average", "ratio" | §B26 div-by-zero | `/ 0` and `% 0` panic; integer `%` truncates toward zero |
| "read from socket", "read the stream", "write to connection", "read N bytes" | §C4 partial read/write | a single `read`/`write` may transfer fewer bytes; use `read_exact`/`write_all` |
| "join paths", "build file path from input", "path from user", "config path" | §C2 Path::join absolute | absolute segment discards the base (path traversal) |
| "run a command", "shell out", "execute a command", "call ffmpeg/git/imagemagick", "spawn a process" | §C2 command injection | untrusted data in a shell string → RCE; user value starting with `-` → argument injection |
| "build a query", "dynamic SQL", "search/filter by", "WHERE/ORDER BY from input", "query by a user field" | §C2 SQL injection | `format!`-built SQL → injection; bind params (`$1` + `.bind`/`query!`/`QueryBuilder`) |
| "optimize", "make this faster", "this is slow", "hot path", "high throughput", "low latency" | §E systemic cost (pick the law by form) | locally-correct code that fails under load; cost not caught by `rustc`/`clippy`/tests |
| "run concurrently", "parallelize", "two awaits", "rayon", "spawn_blocking" | §E1 serialism | independent work done in sequence; CPU-bound work stalling the async worker |
| "reduce allocations", "zero-copy", "avoid clone" | §E2 allocation | reflexive `.clone()`/`.collect()`/`format!`; allocate-in-a-loop with no `with_capacity` |
| "fast hash", "faster HashMap", "FxHashMap" | §E4 contention + §B16 Eq/Hash | fast fixed-seed hasher is a win for trusted keys, a HashDoS trap for untrusted ones |
| "reduce contention", "lock is slow", "scale across cores" | §E4 contention | a lock is a queue under load; read-mostly/sharding/atomic beats `Arc<Mutex>` |
| "add tests", "unit tests for this", "increase coverage", "write a test" | §D1 vacuous tests | test a *postcondition that could break* or an external *contract* — never a tautology/constant/`derive` |
| "extract a crate", "split into a library", "new workspace member", "make this its own crate" | §C10 crate boundaries | premature extraction freezes an unproven API (§C1) and forces version/feature coordination |
| "benchmark this", "lock in the speedup", "guard against regression" | §E6 measure | a `criterion` regression bench turns a measured win into a standing invariant |
| "zip two lists", "iterate two sequences together", "deduplicate a vec", "split into chunks of N", "chunk size from config" | §B29 iterator/slice traps | `zip` truncates to shorter; `dedup` only adjacent; `chunks(0)`/`windows(0)`/`step_by(0)` panic; `collect` into map overwrites dup keys |

**Triggered by code, not phrase** — when the user's input *contains code that matches any of these patterns*, the linked categories activate even if no English phrase fires:

| Code pattern in user input | Activates |
|---|---|
| `async fn` with a `Mutex<...>` field or local `MutexGuard` | §B2 (lock across `.await`), §B11 (blocking executor) |
| `Rc<RefCell<...>>` crossing `.await` or sent across threads | §A2 (smart pointer choice), §B17 (reentrant borrow), §B10 (cycle) |
| `unsafe impl Send for ...` / `unsafe impl Sync for ...` | §B18 (manual Send/Sync) |
| `tokio::spawn(...)` whose returned `JoinHandle` is not bound, not awaited, not detached-by-design | §B21 (dropped JoinHandle ≠ abort), §B8 (silent task drop) |
| `impl Drop` containing `.await`, `block_on`, or `tokio::spawn` | §B22 (async Drop is not real) |
| `impl Deref<Target = ...> for ...` on a non-pointer-like wrapper | §C11 (Deref polymorphism) |
| `#[serde(untagged)]` enum | §B20 (variant shape overlap) |
| `if X { map.insert(...) }` or `cache.contains_key + cache.insert` | §B13 (TOCTOU) |
| `==` / `!=` where one operand is *secret material* — a token, MAC tag, password hash, OTP, session key (not a public literal like an algorithm name `"HS256"`) | §B24 (timing attack) |
| Manual `impl PartialEq` or `impl Ord` on a type used as `HashMap`/`BTreeMap` key | §B16 (Eq/Hash contract) |
| `tokio::select! { ... }` with side effects inside any arm body | §B23 (arm side effects) |
| `tokio::spawn` inside a function with an active `tracing::Span` | §C9 (span leakage) |
| `mem::transmute`, `ptr::read`, `slice::from_raw_parts` | §B5 (UB-prone unsafe; validate bytes → `Result` before minting the typed value, never mint-then-check) |
| a hand-written type with a `*const T` / `*mut T` / `NonNull<T>` field, or a by-hand `PhantomData<...>` | §B18a (variance / `PhantomData` soundness — covariance where invariance is needed → UAF), §B18 |
| a struct holding both a `JoinHandle` (or `thread::JoinHandle`) and the `mpsc::Sender` that feeds its worker | §B4 (drop-order shutdown deadlock — close/drop the `Sender` before the join) |
| a self-owning recursive type (`Box<Self>` linked list, deep `Box<Node>` tree) on the auto-derived `Drop` | §B4 / §B7 (recursive `Drop` overflows the stack on deep input — write an iterative `Drop`) |
| `pub enum` / `pub struct` (especially an error enum) in a published library without `#[non_exhaustive]` | §C1a (adding a variant / field is a semver-major break downstream) |
| `Box::new([0u8; N])` where `N` is large | §B7 (stack overflow before placement) |
| `Vec::with_capacity(n)` / `vec![_; n]` / `reserve(n)` / `String::with_capacity(n)` where `n` is from untrusted input | §B7 (attacker-controlled allocation size) |
| `extern "C" fn` body, `#[no_mangle]`, `Box::into_raw`/`Box::from_raw`, `Vec::from_raw_parts` | §B25 (FFI ABI and ownership), §B5 (UB-prone unsafe) |
| `std::process::exit(...)` / `process::exit(...)` below a live RAII guard | §B4 (Drop skipped) |
| `Arc::strong_count(...)` / `Rc::strong_count(...)` used in a conditional | §B13 (count TOCTOU — use `into_inner`/`try_unwrap`) |
| `flag.store(_, Ordering::Relaxed)` after a payload write, paired with a `flag.load(Ordering::Relaxed)` then a read of that payload | §B13 (`Relaxed`-publish data race — needs `Release`/`Acquire`) |
| `assert_eq!(...)` / `assert_ne!(...)` with an `f32`/`f64` operand | §D1 (float exact-equality) |
| `notify.notified()` / `Notify` | §B15e (lost wakeup — arm with `enable()` before check) |
| `#[derive(Debug)]` on a struct with a `password`/`secret`/`token`/`key`/`seed` field | §B12 (Debug-leak of secrets) |
| `impl Drop` whose body can `panic!`/`.unwrap()`/`.expect()` | §B4 (panic-in-Drop double-abort) |
| `tokio::time::interval(...)` | §B15e (first tick is immediate; pick `MissedTickBehavior`) |
| `oneshot::channel()` with the result discarded or `.unwrap()`-ed | §B8 (drop cascade / `RecvError` panic) |
| `as` cast narrowing an integer (`x as u32`, `len() as u32`) or `f as iN`/`uN` | §B26 (lossy numeric) |
| `SystemTime::now()` / `Utc::now()` used to measure a duration; `.elapsed().unwrap()` | §B27 (wall-clock vs monotonic) |
| `&s[a..b]` string slice with computed indices; `s.len()` used as a char count | §B28 (UTF-8 boundaries) |
| `Box::leak(...)` | §A2 (use `OnceLock`/`LazyLock`) |
| `mem::forget(...)` / `ManuallyDrop` without manual drop | §B4 (RAII disabled) |
| `if let … {} else {}` whose scrutinee holds a lock/RAII guard; a custom-`Drop` value in tail position | §B4a (edition-2024 temporary-scope shift) |
| `FuturesUnordered` pushed unbounded or polled while empty in `select!` | §B14 (busy-loop / unbounded growth) |
| `watch::channel(...)` / `Receiver::borrow()` | §B15e (initial-value semantics) |
| `Vec::remove(0)` / `insert(0, _)` / `contains` in a loop | §C4 (O(n²)) |
| `{:?}` on `&[u8]`/`Vec<u8>` | §C4 (decimal not hex) |
| `sort_unstable*` where equal-element order matters | §B16 |
| `a + b` / `a * b` / `.sum()` on integers from input or accumulating, without `checked_*`/`saturating_*` | §B26 (overflow: debug-panic vs release-wrap) |
| `a / b` / `a % b` without a `b != 0` guard | §B26 (div/rem by zero panic) |
| `slice[i]` / `&s[a..b]` / `split_at(i)` with an index from untrusted input | §B26 (index OOB) / §B28 (string boundary) |
| a single `.read(&mut buf)` / `.write(data)` treated as complete | §C4 (partial transfer) |
| `base.join(untrusted)` | §C2 (absolute segment discards base) |
| `Command::new("sh"/"bash"/"cmd")` with `arg("-c"/"/C")` + interpolated input; `.arg(format!(...))` / `.args(untrusted.split(...))` | §C2 (OS command / argument injection) |
| `sqlx::query(&format!(...))` / `query_as(&format!(...))` / `diesel::sql_query(format!(...))` — untrusted input in the SQL string | §C2 (SQL injection — bind parameters, don't format) |
| `x().await;` then an independent `y().await;` (no data dependency) | §E1 (serial latency — `tokio::join!`/`try_join!`) |
| `.collect::<Vec<_>>()` immediately followed by a single iteration | §E2 (needless materialization — stay lazy) |
| `Regex::new(...)` (or parser/schema/template build) inside a frequently-called fn | §E5 (recompiled every call — hoist to `LazyLock`/`OnceLock`) |
| `format!` / `String::push` / `Vec::push` in a loop without `with_capacity` | §E2 (allocate-in-a-loop — pre-size or `write!` in place) |
| CPU-bound loop (hash / compress / parse a large blob) inside an `async fn` | §E1 + §B11 (stalls the runtime worker — `spawn_blocking` / `rayon`) |
| `Arc<Mutex<T>>` whose `T` is read-mostly / swapped wholesale / never mutably shared | §E4 (lock is contention — `ArcSwap`/atomic/`Arc<T>`), §A2, §B2 |
| `assert_eq!(SOME_CONST, <same literal>)` / `assert!(true)` / a test that sets a field then asserts the getter | §D1 (vacuous test — assert a postcondition or an external contract, not a tautology) |
| `.zip(`, `.dedup()`, `.chunks(n)`/`.windows(n)`/`.step_by(n)` with `n` from input (literal sizes are fine), `.collect::<HashMap<_,_>>()` on possibly-duplicate keys | §B29 (truncation / adjacent-only dedup / zero-size panic / dup-key overwrite) |

When two or more triggers fire in one request, treat it as a high-risk task and explicitly enumerate which categories I'm guarding against in my response.

---

# Category map — which module holds each §

The category bodies live in sibling modules of this skill. When a trigger above fires, open the module named here. Tier (🔴/🟡/🟢; A–E) is a property of each category, preserved in its body.

| Category | Module |
|---|---|
| §A1 | `deps-macros-ergonomics.md` |
| §A2 | `concurrency-and-state.md` |
| §A3 | `lifetimes-and-api.md` |
| §B1 (a, b) | `lifetimes-and-api.md` |
| §B2, §B3, §B8, §B11, §B15 (a–e), §B21, §B22, §B23 | `async.md` |
| §B4 (a) | `drop-and-raii.md` |
| §B5, §B7, §B18 (a), §B25 | `unsafe-and-ffi.md` |
| §B6, §B16, §B20, §B26, §B27, §B28, §B29 | `data-and-types.md` |
| §B9, §B10, §B13, §B14, §B17, §B19 | `concurrency-and-state.md` |
| §B12, §B24 | `security.md` |
| §C1 (a) | `lifetimes-and-api.md` |
| §C2 | `security.md` |
| §C3, §C9 | `async.md` |
| §C4 | `data-and-types.md` |
| §C5, §C6, §C7, §C10, §C11 | `deps-macros-ergonomics.md` |
| §C8 | `concurrency-and-state.md` |
| §D1, §D2 | `testing.md` |
| §E1 | `async.md` |
| §E2, §E3 | `data-and-types.md` |
| §E4 | `concurrency-and-state.md` |
| §E5 | `deps-macros-ergonomics.md` |
| §E6 | `testing.md` |

**Cross-reference note:** a few categories point to a twin in another module (e.g. §B22 async-Drop → §B4 sync Drop; §E4 contention → §A2/§B2/§B13/§B16). These are navigational only — open the named module via this map when you need the twin.

# Version pins (deliberately current, verify against your MSRV)

This spec targets **Rust edition 2024, MSRV ≥ 1.85**. (Edition 2024 was stabilized in **Rust 1.85**, February 2025 — a crate declaring `edition = "2024"` will not build on an older toolchain, so 1.85 is the floor; the strict-provenance API pinned to 1.84 below is subsumed by it.) Several rules above depend on stability dates and library versions; if your project pins an older toolchain or older library, re-verify before applying these rules verbatim:

- `Box::<[T]>::new_uninit_slice(N)` — stable since **Rust 1.82** (October 2024). Required for the §B7 uninit-buffer pattern without `unsafe`-around-`mem::MaybeUninit`.
- `Vec::into_raw_parts` — **stable since Rust 1.93** — verify against your toolchain; treat as unstable below a confirmed 1.93 and use the `ManuallyDrop` form. For MSRV < 1.93, use the `ManuallyDrop<Vec<T>>` + manual `(ptr, len, cap)` decomposition (stable since 1.0). The spec's MSRV floor is 1.85, so by default the manual form is what you write; bump the MSRV explicitly if you want the convenience.
- `unexpected_cfgs` lint — automatic since **Rust 1.80** (July 2024) per §C7. Older toolchains require the manual `[lints.rust] unexpected_cfgs = ...` configuration.
- Edition 2024 changes temporary drop scope: `if_let_rescope` (auto-fixed by `cargo fix --edition`) and `tail_expr_drop_order` (advisory, **no** autofix). Relevant on any 2021→2024 migration. See §B4a.
- **AFIT** (async fn in trait) — stable since **Rust 1.75** (December 2023) per §B15a. Pre-1.75 code must use `async-trait`.
- **`tracing::Instrument::in_current_span`** — stable in `tracing` 0.1.x; pin the version.
- **`tokio::sync::Mutex` cancel-safety** — pin tokio version (1.x stable API; cancel-safety annotations live in tokio's docs).
- **tokio recent additions** (verify against your pinned tokio): the `biased;` directive — long available in `select!` — was extended to `join!` and `try_join!` in **tokio 1.46.0**; `tokio::sync::SetOnce` (write-once cell with an event-style wait) landed in **tokio 1.47.0**; the cooperative-scheduling helpers moved into the `tokio::task::coop` module in **1.44.0** (see the `consume_budget` pin below). On any tokio below these, the API is absent — do not assume it.
- **`rand` 0.8 / 0.9 split** — `thread_rng()` in 0.8 → `rng()` in 0.9. The `OsRng` recommendation in §B12 holds for both.
- **`subtle` crate** for §B24 — stable, `subtle::ConstantTimeEq::ct_eq` is the canonical entry point.
- **`clippy::await_holding_lock`** per §B2 — today **warn-by-default** (clippy `suspicious` group), so the bare `cargo clippy` emits it without a manual `-W`; the Post-flight `-W clippy::await_holding_lock` is redundant reinforcement, not a prerequisite. Its group has moved: introduced in **clippy 1.45** (`correctness`, deny-by-default), downgraded to `pedantic` (allow-by-default) around 1.50 to quiet false positives, then promoted to `suspicious` (warn-by-default) in **Rust 1.61** — so on a toolchain in the 1.50–1.60 range a bare `cargo clippy` does *not* emit it and the explicit `-W` is required. Verify against your pinned toolchain.
- **Strict-provenance API** (`ptr.with_addr`, `ptr.addr`, `ptr.expose_provenance`, `with_exposed_provenance`) per §B5 — stable since **Rust 1.84**.
- **`consume_budget`** per §B11 — the function is stable since **tokio 1.39.1** (1.39.0 was yanked) at `tokio::task::consume_budget`; it moved into the new `tokio::task::coop` module in **tokio 1.44.0** (old path `#[deprecated]` from 1.44.0). On a tokio MSRV below 1.44 use `tokio::task::consume_budget`; on 1.44+ use `tokio::task::coop::consume_budget`.
- **Panic across `extern "C"`** per §B25 — two separate dates: the `extern "C-unwind"` ABI (defined cross-language unwinding for callers that can handle it) is **stable since Rust 1.71**; the change making a panic across *plain* `extern "C"` abort the process by default (it was UB before) landed **in Rust 1.81**. Either way, `catch_unwind` at the boundary is the safe answer — but it catches only an *unwinding* panic, so under `panic = "abort"` the boundary is unprotected (see §B25).
- **Float→int saturating cast** per §B26 — `300.0_f32 as u8 == 255`, `NaN as i32 == 0` etc. became defined (saturating) in **Rust 1.45**; before that the out-of-range cast was UB. Code adapted from pre-1.45 / C examples silently saturates instead of wrapping or erroring. The other §B26/§B27/§B28 APIs (`try_from`, `is_char_boundary`, `Instant`) are long-stable std and need no pin.
- **Integer overflow behavior** per §B26 is **not** version-gated: debug builds panic, release builds wrap (`overflow-checks = false` is the release default) on every supported toolchain. `checked_*`/`saturating_*`/`wrapping_*` are stable since 1.0.
- **`LazyLock`** per §A2 — stable since **Rust 1.80** (July 2024), alongside `OnceLock` (stable 1.70). Both are the recommended replacement for `Box::leak`-as-global and for `lazy_static!` / `once_cell::sync::Lazy`.

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

After generating Rust, run the toolchain, then surface — file:line — every occurrence of the 🔴-tier items listed in **Enforcement tiers** (and nothing from the 🟡/🟢 tiers; those are applied while writing or delegated to clippy). The 🔴 list lives in Enforcement tiers and is not re-enumerated here — that is its canonical home; the bash below is the toolchain pass that backs it (the 🟢-tier items are left to the linter):

```bash
cargo build                                                   # baseline
cargo clippy -- -W clippy::pedantic \
                -W clippy::await_holding_lock \
                -W clippy::unwrap_used \
                -W clippy::missing_safety_doc \
                -W clippy::undocumented_unsafe_blocks \
                -W clippy::clone_on_copy \
                -W clippy::redundant_clone \
                -W clippy::arithmetic_side_effects \
                -W unused_must_use
cargo test
cargo +nightly miri test    # any file touching `unsafe`
```

> `clippy::unwrap_used` is `restriction`-group and intentionally noisy — triage its hits by hand (a `.unwrap()` that is statically impossible to fail and carries a comment is fine per §C2), don't count each as a finding. `expect_used` is omitted by default for the same reason: `expect("invariant: …")` is explicitly allowed by §C2.

When surfacing a 🔴 occurrence, give the "why/how" from its category body — e.g. for a crypto call list library + primitive + params (§B12), for a new dependency give name + version + one-line justification (§A1), for `extern "C"` note the panic/ownership contract (§B25).

Optional for production: `tokio-console` for blocked workers / stuck locks (§B9/§B11), `loom` for multi-lock / atomic model checking (§B9/§B13), `heaptrack` for steady-state memory growth (§B10).

---

# When this command is loaded

I will:
- Read `Cargo.toml` and `CLAUDE.md` to pin versions and idioms before writing code.
- Treat 🔴-tier rules as hard constraints (surface always; block on crypto / unsafe-invariants / new-dependency per the Blocking protocol). Apply 🟡-tier rules while writing — get them right, but don't report each one. Let clippy own the 🟢 tier.
- Refuse to write trait hierarchies blind; propose, then wait for approval.
- Refuse to write `unsafe` without `// SAFETY:` justification.
- Flag API calls I'm uncertain about rather than hallucinate them.
- Run the post-flight checklist mentally and report results before declaring work complete.

The principle: **if a category of bug exists where the compiler cannot help, the discipline must move from the type system into this checklist**. Rust gives me the strongest type system of any mainstream language, but cancel safety, semver, drop ordering, and UB in unsafe live outside it. This document is where that gap is filled.
