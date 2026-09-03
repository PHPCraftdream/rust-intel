---
name: rust-intel
description: 'Hard rules for writing Rust in code that already compiles and passes tests but is silently broken, slow, or semver-fragile. Load this BEFORE writing any Rust code. Targets bugs that survive rustc, clippy, and cargo test but fail in production or rot the codebase. Covers async, unsafe, FFI, concurrency, crypto, supply-chain, tests-that-pass-by-luck, and systemic performance-at-scale hazards. Also covers semantic-conformance defects: spec divergence, violated documented guarantees, boundary/error-path resource lifecycle, missing round-trip obligations, and invalid test oracles.'
---

# Rust Intel — Defense Against LLM Failure Modes

**Scope, stated up front.** This spec assumes your code already compiles. It assumes `cargo test` is green. That is not enough. The categories below cover the failure modes that survive `rustc`, `clippy`, and the test suite, and only manifest as production incidents, semver breakage, performance collapse under load, or silent data corruption. Compilation-only failures (lifetime variance *in safe code*, trait bound mismatch, GAT lifetime bound errors, object-safety violations through generic methods, cyclic workspace deps, `?` in `main`, HRTB depth, recursive macro limits, self-referential structs in safe Rust, `no_std` reflexive `std::*` imports, `From`/`Into` cycles) are deliberately omitted — `rustc` already catches them and the LLM cannot ship them. (Exception: variance **soundness** in `unsafe` raw-pointer wrappers is *not* caught by the compiler — that is §B18a, and it is in-scope. Second exception, and two distinct breakages, not one: adding any required (non-defaulted) method to a **published library's** public trait fails every downstream `impl`, and adding a method that is not dyn-dispatchable — generic over types, lacking a `self` receiver, mentioning `Self` outside the receiver, an opaque return (`async fn`, `-> impl Trait`), or an associated const — additionally strips the trait's dyn-compatibility **unless it carries `where Self: Sized`** (verified against rustc: none of these six shapes need to be generic to trigger E0038 on `&dyn Trait`). Either break shows up only at the *consumer's* build — `rustc` cannot flag it in the author's own crate — so both stay in-scope under Operating mode item 3 and §C1, mechanically backstopped by `cargo-semver-checks` in Post-flight.) This spec covers what ships anyway.

The **fifty-nine categories** (held in this skill's theme modules — see the category→module map below) rest on an empirical base — a published 6-month field report on ~80k LOC of production LLM-generated Rust, academic benchmarks (RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust), the error distribution observed across Claude/GPT/Cursor through 2025–2026, and real supply-chain incidents (CrateDepression 2022, `faster_log`/`async_println` 2025). (The count is of numbered categories; §B1, §B3, §B4, §B15, §B18, §B25, §C1, §C12, and §D1 split into lettered sub-sections — §B1a/b, §B3a, §B4a, §B15a–e, §B18a, §B25a, §C1a, §C12a, §D1a — that are referenced and triggered individually but counted under their parent.) Citations, URLs, sample sizes, and every percentage live in [`references/sources.md`](references/sources.md); load it alongside this file when a figure is load-bearing. The category→module map below is the index; the category bodies live in the theme modules, not in this file.

Industry signal: per Faros AI and Lightrun studies (2026), shifting from low to high AI adoption more than doubles the incidents-to-PR ratio, and 43% of AI-generated code changes need debugging in production; among surveyed engineering leaders, zero rated themselves "very confident" that AI-generated code behaves correctly once deployed. (These figures concern AI-generated code in general, not Rust specifically — see references/sources.md.) This is the empirical context this document defends against.

The categories split into **six tiers and a meta-layer**, listed below:
- **Self-monitoring**: a triggers table (phrase- *and* code-pattern-based) that maps user-request patterns to risk categories. Scanned before generating code.
- **Tier A — Compile-fix reflexes that leave silent residue (§A1, §A2, §A3)**: not "the compiler caught it and you fixed it correctly", but "the compiler caught it and the cheapest fix compiles while leaving a real defect behind". Stale-but-valid APIs, supply-chain via slopsquatting, reflexive `Arc<Mutex<T>>`, `pub` as a hammer for `E0603` that silently expands the public API.
- **Tier B — Silent correctness bugs (§B1–§B29)**: pass compilation, often pass tests, fail in production. This is where the spec lives. Includes UB, async pitfalls (basic and advanced), lock ordering, memory leaks, silent task dropping, cryptographic insecurity, TOCTOU races, backpressure neglect, Mutex poisoning, equality/hash contracts, runtime borrow panics, manual `Send`/`Sync`, iterator invalidation through indirection, `serde` field-presence drift, `JoinHandle` semantics, the async-`Drop` impossibility, `select!` side-effect cancellation, timing-attack-prone equality on secrets, panic / ownership across `extern "C"` FFI, lossy numeric conversions, wall-clock vs monotonic time, and UTF-8 string-boundary hazards.
- **Tier C — Architecture and ergonomics (§C1–§C12, and §C12a)**: design-level mistakes that are expensive to undo. Reflexive `.clone()`, procedural macro hygiene, Cargo feature flag hygiene, channel-and-runtime mismatch, `tracing` span leakage, workspace feature unification, `Deref` polymorphism, reinventing a solved problem (or a whole subsystem) that a world-recognized crate already handles correctly on the input the hand-rolled version misses.
- **Tier D — Testing and CI gaps (§D1–§D5)**: code passes tests not because it's correct but because the tests are blind. Timing-based async tests, `#[should_panic]` without `expected`, unit-vs-integration placement drift, test/prod divergence of build profile, scale, and concurrency, grep-filtered runner output hiding hangs, Windows zombie-process link wedges.
- **Tier E — Systemic cost (§E1–§E6)**: correct in the small, wrong at scale — performance, allocation, complexity, and contention costs that survive `rustc`/`clippy`/tests and only bite under load. A different axis from A–D (cost, not correctness); enforced 🟡/🟢, never 🔴.
- **Tier F — Semantic conformance (§F1–§F4)**: defects of *meaning*, not mechanism. The code is self-consistent, compiles, passes its own tests and clippy — and implements the wrong thing: it diverges from the named spec or reference implementation, contradicts the project's own documented guarantees, mishandles the boundary/error-path lifecycle of a connection or resource, or ships an encode/decode pair with no round-trip obligation. No grep finds these; they are found by reading the *claim* (RFC, README, function name, doc comment) and checking the code against it counterfactually. Reviewer stance for this tier is different — see "Tier F — how to review for meaning" below.

---

## Running a full pass — one agent per module, not one agent for everything

This skill is split into modules (see the **category→module map** below): each theme — async, unsafe/FFI, concurrency, data/types, security, drop/RAII, deps/macros, lifetimes/API, testing, semantics/conformance — is its own file. For a **full-coverage pass** — auditing a codebase against every category, or reviewing/analyzing this skill itself — do **not** pull all modules into one context and grind through them serially. A single agent holding all ~59 categories loses detail and misses findings — the very overload this skill warns about, turned on itself.

**Instead, fan out — one agent per module — using the host's native delegation mechanism:**
- spawn one sub-agent per module listed in the category→module map;
- hand each agent ONLY its module plus the target (the code under audit, or the module under review);
- each agent goes deep on its small slice and returns structured findings;
- a final synthesis agent merges, dedups, and prioritizes.

This is the intended way to apply the skill at scale: **don't do it all yourself — delegate one agent per section.** A single trigger firing, or one category match, still applies **inline** — no workflow needed; fan out only for a full or broad pass. (A ready maintainer workflow that reviews this skill's own modules lives at `dev/review-modules.workflow.js`.) For **auditing a codebase**, a ready fan-out workflow ships with this skill: `audit-project.workflow.js` (sibling of this file). In Claude Code, launch it via `Workflow({scriptPath: '<skill-dir>/audit-project.workflow.js', args: {target: '<path>', skillDir: '<skill-dir>'}})`. In Codex, use native subagent/delegation APIs and delegate one unit per module plus a synthesis pass; do not assume Claude's `Workflow(...)` JavaScript runtime is available. The workflow reads SKILL.md at runtime to slice trigger tables per module (zero knowledge duplication), splits async into two agents (await-discipline vs machinery/cost), and synthesizes findings in the `/rust-cc-audit` report format. **Fallback order when the workflow runtime is unavailable:** (1) write the equivalent fan-out by hand — one sub-agent per module in the category→module map, each given only its module plus the target, then a synthesis pass (in Claude Code this is the `Agent` tool; the workflow file itself is a readable template for the per-module briefs); (2) only if no delegation mechanism exists at all, do a bounded single-context pass and **say so in the report header** — mark coverage incomplete and name the modules you did not reach.

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
  - <specific item 1, e.g. "resolved versions of tokio and sqlx from Cargo.lock/cargo metadata">
  - <specific item 2, e.g. "definition of the `Database` trait this is implementing against">
  - <specific item 3, e.g. "expected behavior on commit failure: retry, propagate, or rollback to checkpoint?">
```

Cases where I **hard-block** rather than guess (the irreversible / security-critical three):
- The user asks for cryptographic code and the threat model is unstated (§B12) — getting this wrong is silent, catastrophic, and not caught by tests.
- The user asks for `unsafe` code but the invariants the caller will uphold are unstated (§B5) — guessing produces UB.
- I would need to add a dependency the user did not name and whose existence I have not verified (§A1) — guessing a crate name is a supply-chain attack vector.

For every other gap — unknown crate versions, a missing trait definition, drop semantics I'm unsure of, or an unclear cancellation context — I do **not** block. I **proceed with explicitly stated assumptions**: I generate the code, record each assumption in a comment block at the top of the response (e.g. `// ASSUMES: tokio 1.x — mpsc::Receiver is not a Stream (wrap in tokio_stream::wrappers::ReceiverStream); commit failure propagates as Err`), and ask the user to confirm. Blocking the whole response on these would be more friction than it buys.

A blocking message is not failure. Generating crypto/`unsafe`/supply-chain code on a guess *is* failure. Blocking is how that specific failure is prevented; stated assumptions handle the rest.

---

## Operating mode

Whenever this command is loaded, before generating any Rust code I will:

1. **Pin the world.** `Cargo.toml` declares a version *range* per dependency, not the exact version in use — the actual resolved version lives in `Cargo.lock` (or `cargo metadata`). Inspect `Cargo.lock`/`cargo metadata` (and `CLAUDE.md` if present) for the actual resolved versions of `tokio`, `axum`, `sqlx`, `reqwest`, `serde`, `hyper`, `clap`, and any other major dependency; `Cargo.toml` only establishes the declared range/major-version intent. State the assumed versions in a comment block at the top of the response. If versions are unknown and cannot be read, state the assumed versions as explicit assumptions and ask the user to confirm (per the Blocking protocol) — do not silently guess. *RustEvo² shows pass@1 drops from 56.1% to 32.5% on post-cutoff APIs — guessing is the dominant source of API hallucinations.*

2. **Map the project idioms.** If `CLAUDE.md`, `README.md`, or top-level docs declare project conventions (error type, logging crate, runtime, lint level), follow those. Do not introduce a new error-handling style, a new async runtime, or a new logging crate without explicit permission.

3. **Refuse to design trait hierarchies blind.** For a new trait in the **public API of a published library** (mirror of §C1), propose the signature in plain text first and wait for approval before committing impls — LLMs make strategic mistakes here (object safety, sealed vs open, blanket impls) that are expensive to undo across a semver boundary. Drafting is fine; committing the public surface is not. For a bin or internal/workspace crate, proceed, but flag the object-safety / sealed-vs-open / blanket-impl decision inline.

4. **Refuse `unsafe` without `// SAFETY:`.** Every `unsafe` block must be preceded by a `// SAFETY:` comment naming every invariant the operation relies on. No exceptions, including "obvious" cases.

5. **Annotate cancel-safety where it can bite.** See §B3. A `/// cancel-safe: yes` / `/// cancel-safe: NO — <reason>` doc line is mandatory only for an `async fn` that is (a) documented to run under `select!` / `timeout`, or (b) actually called from a cancellation node (a `select!` arm or `timeout` body) somewhere in this change. For any other `async fn`, annotate only if the cancel-safety is non-obvious; a trivial one (zero or one `.await`, no side effect on a losing path) needs nothing.

6. **Show the caller for the §B1a laundering shape.** A function whose returned reference is tied to more than one input lifetime, **or whose single input lifetime is captured into a longer-lived cache/container** (the actual §B1a laundering shape — one `'a` shared between a call's input and a cache that outlives the call, not necessarily "more than one lifetime parameter") requires at least one example call site in a comment or test — a call inserting a short-lived source, then a use of the cache after that source's scope ends — before the signature is final. A plain `&T` derived from a single input, with no such container, does not. See §B1.

7. **Surface 🔴-tier items in the summary; note the rest inline.** When work is complete, list every occurrence of the 🔴-tier items (see "Enforcement tiers" for the canonical list) with file:line and justification each. Other risky constructs (`unwrap`, `expect`, routine `Arc<Mutex<_>>`, `panic!`, `unimplemented!`, `todo!`) are noted inline at write time, not enumerated in the summary.

---

# Enforcement tiers — not every rule is equal

Treating all 59 categories as equally critical produces noise that buries the few findings that matter. Apply rules at one of three tiers:

**🔴 Surface-always / may block.** High blast-radius, often irreversible, invisible to tooling. Always list every occurrence in the summary; for crypto and unsafe-with-unstated-invariants, block and ask rather than guess (see Blocking protocol). These are:
- §A1 adding an unverified / unnamed dependency (slopsquatting — runs malicious code)
- §B5 `unsafe`, `transmute`, `mem::uninitialized`/`zeroed`
- §B12 any cryptographic operation
- §B13 (the `Relaxed`-publish data race only — invisible to x86 tests, breaks on ARM; the broader check-then-act/TOCTOU body of §B13 is 🟡, applied at write time)
- §B14 `unbounded_channel` / unbounded `FuturesUnordered`/`JoinSet` growth (plus two *conditional*-🔴 shapes in the same category, red specifically when attacker-extendable: unbounded accept/ingest admission, and an insert-only keyed collection with attacker-influenced key cardinality — 🟡 otherwise)
- §B18 manual `unsafe impl Send`/`Sync`
- §B18a wrong / absent `PhantomData` on a raw-pointer wrapper (covariance where invariance is needed → UAF; a relational invariant no runtime guard can catch)
- §B21 a `tokio::spawn`/`tokio::task::spawn_local`/`LocalSet::spawn_local` call whose returned `JoinHandle` is dropped
- §B22 `impl Drop` doing async work
- §B24 `==` on secret material
- §B25 `extern "C"` boundary / `Box::from_raw` / `from_raw_parts`
- §B25a spreading FFI calls across threads without citing the C library's own thread-safety contract (the §B18 per-handle lock does not close a race on the library's global state)
- §B15b `Pin::new_unchecked`
- §C1 blanket impl in the public API of a **published** library (semver hazard; not a concern for bin/internal crates)
- §C12 (the hand-rolled HTML-sanitization, Markdown-rendering, and HTML-escaping rows only — each an XSS-shaped silent bypass; the rest of §C12/§C12a is 🟡, applied at write time)
- §F1 / §F2 a spec or documented-guarantee divergence affecting a wire format, security guarantee, or persisted data (silent, ecosystem-visible, hard to roll back — 🟡 otherwise; see "Tier F — how to review for meaning")
- §F3 a leaked / unclosed boundary resource an untrusted peer can hold open (DoS — 🟡 otherwise)

**🟢 Delegate to clippy — do not hand-check or re-surface.** The toolchain already catches these; just run the linter (see Post-flight) and trust it:
- narrowing `as` casts → `clippy::cast_possible_truncation` (pedantic). **Caveat:** a narrowing cast *on a trust boundary* (`len() as u32`, a cast applied to untrusted/network input) is surfaced even when `pedantic`/clippy is off — the truncation there is a correctness/security bug, not a style nit (see §B26 — the trust-boundary narrowing-cast bullet).
- redundant / `Copy` clones → `clippy::clone_on_copy`, `clippy::redundant_clone`
- typo'd `cfg(feature = …)` → the automatic `unexpected_cfgs` lint (Rust 1.80+)
(Integer overflow is the exception: `clippy::arithmetic_side_effects` is `restriction`, off even under `pedantic` — see §B26.)

**🟡 Apply while writing — don't spam the summary.** Everything else. Write the code correctly the first time per the category, but do not list every `+`, `clone`, cast, or `sort_unstable` as a "finding" — that is the noise this tier exists to prevent. Surface one of these only when it is genuinely load-bearing or you are unsure. **Inline-flag policy (canonical):** when a category body says to "flag/note X inline (at write time)", it means a one-line comment at the construct, *not* a summary entry — and only when the construct is non-obvious or load-bearing. This is the single definition; the per-category reminders point back here. All of **Tier E (§E1–§E6)** lives here too — it is a 🟡/🟢 tier on a different axis (systemic cost, not correctness) and nothing in it is ever 🔴: apply 🟡 on hot / per-request paths and let 🟢 (`clippy::perf`) catch the obvious waste.

The goal: a summary a human can read in ten seconds, where every line is worth acting on.

---

# Tier F — how to review for meaning, not mechanism

Tiers A–E are reviewed by *pattern recognition*: see the construct, recall the hazard. Tier F cannot be reviewed that way — the defective code contains no suspicious construct. The reviewer's stance changes in four ways:

1. **Fetch the reference before reading the code.** If the code names a spec, RFC, file format, protocol, or upstream implementation ("port of", "compatible with"), that name is a *claim*. Obtain the claimed source of truth — the RFC section, the reference implementation's relevant function, the project's own README/docs — and review the code *against it*, not against its internal consistency. If the reference is unavailable, say so explicitly: "conformance to <X> not verified — reference not available" is a finding, silence is not.

2. **Reason counterfactually, not confirmatorily.** For each guarantee (documented or implied by a name): construct the concrete input or interleaving that would violate it if the code were wrong, and trace the code on *that* input. "I read the code and it looks like it does X" is confirmation; "if it failed to do X, input Y would expose it — here is what the code does on Y" is verification. For tests, the counterfactual is mandatory: would this test fail if the fix were reverted / the bug reintroduced? If you cannot name the mutation the test would catch, the test is not evidence (§D1a).

3. **Enumerate, don't sample.** Spec conformance is a totality property: a state machine that handles 9 of 10 spec-mandated states is non-conformant, and reading the 9 handled ones proves nothing. List the spec's required states / message types / error codes / edge cases *first*, then tick them off against the code. The omission is the bug — invisible to pattern-matching, found only by enumeration.

4. **Read the project's own promises as a checklist.** Before reviewing a diff in a project with a README/SECURITY.md/design doc, extract its stated guarantees (what is secret, what input is untrusted, what is durable, what ordering is promised) into an explicit list and check the diff against each. A reviewer who has not read the docs structurally *cannot* find §F2 defects — this step is not optional for Tier F.

Severity: §F1/§F2 findings are 🔴 when the divergence affects a wire format, a security guarantee, or persisted data (silent, ecosystem-visible, hard to roll back); otherwise 🟡. §F3 is 🟡 (🔴 when the leaked/unclosed resource is attacker-extendable — an untrusted peer holding tasks open is a DoS). §F4 is 🟡 — required at write time for every inverse pair, surfaced when absent.

---

# Tier overviews

# TIER A — Compile-fix reflexes that leave silent residue

Tier A is not "bugs the compiler catches and stops". The compiler does its job — the bugs that matter here are the *next move*: the LLM sees a red squiggle and reaches for the cheapest fix that compiles, and the cheapest fix compiles **while leaving a real defect behind**. Stale-but-still-valid APIs, deprecated-not-removed APIs, wrong-version-of-crate behaviors, hallucinated crate names that someone else registered as malware, reflexive `Arc<Mutex<T>>`, and `pub` as a hammer for `E0603` are the canonical examples. The compiler is your friend; this tier is about the moments when you ignore that friend's structural signal and silence the symptom.

*Categories whose primary failure mode is a compile error and which leave no silent residue are deliberately omitted from this spec (full list in "Scope, stated up front" above); the compiler already catches them. An earlier draft of this spec included a Tier A category for trait bounds and type mismatches; it was retired in v0.3.0 on the same scope grounds, and the remaining Tier A categories were renumbered to close the gap.*

# TIER B — Silent correctness bugs

These pass `cargo build`, often pass `cargo test`, and fail in production. The twenty-nine categories below are the ones that hurt — and this is where the spec's real value lives.

**Why this tier exists**: high compilation rate is not correctness. The published 2026 field report on ~80k LOC of LLM-generated tokio/sqlx code (see [`references/sources.md`](references/sources.md)) shows that **§B2 alone (`Mutex` across `.await`) was responsible for failure in roughly half of async tasks** before defensive prompting cut it sharply; security-focused evaluations show static analyzers miss a large share of vulnerabilities in LLM-generated crypto Rust that *does* compile (§B12). The category list below is structured around this gap between `cargo test` green and actual correctness — see [`references/sources.md`](references/sources.md) for the full evidence trail.

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
| "with timeout", "select!", "cancel", "race two futures", "first one wins" | §B3 cancel safety; §B23 select arm side effects | Silent partial state, no cancel-safe annotation; an unrecoverable/non-idempotent side effect on a losing arm is broken by cancellation — an atomic, idempotent, or transactional one is not automatically a defect there |
| "transaction", "rollback", "commit" | §B4 Drop and RAII; §B4 raw-`BEGIN`-through-a-`Pool` | Library-specific Drop semantics on commit failure; raw `BEGIN`/`COMMIT` through a `Pool` may land statements on different connections — open with `begin()` and route every statement through the `Transaction` handle |
| "transfer money between accounts", "withdraw", "check the balance then update", "upsert", "insert if not exists" — with SQL involved | §B13 DB read-modify-write TOCTOU | `SELECT`-then-`UPDATE`/`INSERT` lost update (a `READ COMMITTED` transaction does NOT close it) — one atomic predicate-in-SQL statement + `rows_affected()==1`, or `FOR UPDATE` inside a `begin()` tx, or an optimistic `version` column |
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
| "use my fork", "patch the dependency", "the fix isn't released yet", "point it at my branch", "override with git" | §A1 unpinned `[patch]`/git | branch-only/no-`rev` git source follows HEAD and bypasses `cargo audit`/`vet` — same unverified-trust decision as a new dep name; pin a full `rev`, get user approval, state a removal condition |
| "download in build.rs", "fetch protoc/schema at build time", "fetch the model/binary during build", "curl in the build script" | §A1 network in `build.rs` | unpinned bytes entering the build outside the lockfile — no `--locked`/`--offline`/`vendor` integrity, MITM-able, non-reproducible; vendor or pin a SHA-256 in a separate CI step |
| "fix the CI dependency error", "candidate versions were yanked", "cargo update to fix the build" | §A1 yanked-crate handling | `--locked` can build an already-locked yanked (maybe advisory-flagged) pin unchanged — don't rely on eyeballing its console output as the detection mechanism; blanket `cargo update` swaps many pins — use configured `cargo deny check advisories`/`cargo audit -D warnings` + targeted `cargo update -p <crate>` |
| "encrypt", "decrypt", "hash a password", "JWT", "TLS", "sign this", "AES", "AEAD" | §B12 crypto insecurity | Nonce reuse, weak primitives, hallucinated crypto API |
| "verify a JWT", "decode the token", "check the claims", "validate the audience/issuer" | §B12 crypto insecurity | claims left unchecked — `aud`/`iss` default to `None`, `validate_exp = false`; not just `alg` |
| "self-signed cert", "accept the dev certificate", "ignore TLS errors", "certificate error", "reqwest/rustls client" | §B12 crypto insecurity | `danger_accept_invalid_certs`/`tls_danger_accept_invalid_certs` (reqwest ≥ 0.13's current spelling) / no-op `ServerCertVerifier` → silent MITM (CWE-295) — pin the CA instead |
| "store a password", "salt the hash", "PBKDF2/Argon2 parameters", "derive a key from a password" | §B12 crypto insecurity | fixed/reused salt; below-OWASP-floor work factors; per-user `SaltString::generate` + OWASP params |
| "generate an API token/key/nonce", "random session id", "generate a secret", "random bytes for" (a security-sensitive purpose) | §B12 crypto insecurity | `SmallRng` — banned outright regardless of seeding, it is non-cryptographic by algorithm; a deterministic/fixed seed (`seed_from_u64`, a hardcoded seed) on any RNG for this purpose; use OS-backed entropy (`SysRng`/`getrandom`, or a `StdRng` freshly seeded from the OS — the seeding call is `rand`-major-specific: `StdRng::from_os_rng()` on rand 0.9, `StdRng::try_from_rng(&mut SysRng)?`/`rand::make_rng::<StdRng>()` on rand 0.10 — verify against the pinned major, see security.md §B12 and Version pins) |
| "public API", "library", "publish to crates.io", "what should the signature be" | §B1 lifetime leaking; §C1 blanket impls; §C1a non_exhaustive | `'a` in public signatures, semver hazards; adding an enum variant / struct field is usually a major break without `#[non_exhaustive]` — but see §C1a's calibration for the named-vs-tuple-struct exceptions before asserting it's *always* one |
| "fix E0603", "make this pub", "make it visible", "re-export this type", "why can't I import this" | §A3 `pub` as a hammer | the cheapest fix that compiles (bare `pub`) silently enlarges the public API surface — check `pub(crate)`/`pub(super)` first; and a type made visible only via a leaked signature (not a real import path) is reachable but not nameable — see the reachable-vs-nameable split in `lifetimes-and-api.md` §A3 |
| "lazy cache", "memoize", "compute if absent", "deduplicate concurrent requests", "ensure only once" | §B13 TOCTOU | `contains_key` + `insert` race; for a synchronous value, `entry().or_insert_with` suffices — but for an async compute-once-under-load (dedup concurrent fetches), that closure can't `.await`: use a per-key `Arc<tokio::sync::OnceCell<_>>` cloned out of the map, guard dropped before awaiting `get_or_init` (concurrency-and-state.md §B13), and bound it — that map is insert-only |
| "DashMap/concurrent-map lazy init + await", "init the entry then await", "get-or-insert then fetch" | §B2 map guard across `.await` | the `entry()`/`get()` guard is a synchronous per-shard (DashMap) or per-bucket (`scc`) lock — and even `scc`'s `*_async` entry/guard methods return an exclusive guard that can self-deadlock across a further `.await`, not just block a thread; holding any of these across the init `.await` deadlocks — store `Arc<OnceCell<T>>`, clone out, drop the guard before awaiting |
| "coordinator loop", "leader/drain/flush loop", "retry the flush forever", "background flusher" | §B3a coordinator circuit-breaker | a loop that retries a persistently-failing op without exiting livelocks one core and strands leadership — release the flag and return on error |
| "background worker", "event queue", "log pipeline", "broadcast to subscribers", "producer-consumer" | §B14 unbounded queue | `unbounded_channel` instead of bounded + backpressure policy |
| "accept loop", "handle each connection", "spawn per request", "one task per connection" | §B14 unbounded admission; §B21; §F3 | no concurrency cap → N sockets/tasks/buffers (attacker sets N); `?` on `accept()` kills the loop, log-and-continue busy-spins on `EMFILE` — `Arc<Semaphore>` + `acquire_owned` before spawn, permit moved in; classify accept errors |
| "cache per user/IP/session", "remember which X we've seen", "dedup set", "per-IP rate limiter map" | §B14 insert-only keyed collection | `HashMap`/`DashMap` insert with no eviction/TTL/cap on attacker-influenced keys grows forever (CWE-770) — bound with `lru` (≥ 0.18.2: RUSTSEC-2026-0002/-0253)/`moka` or argue the key space is closed |
| "trait with async method", "trait Foo { async fn ... }", "trait object" | §B15a AFIT/RPITIT | Missing `+ Send` bound, not spawn-able; for a `dyn` async trait, not dyn-compatible without `async-trait` |
| "implement Future manually", "custom Poll", "wake the task" | §B15b Waker | `Poll::Pending` without registering waker → hang forever |
| "block_on this from a helper", "synchronous wrapper for async" | §B15c nested runtime | three different outcomes, not one: tokio `Handle`/`Runtime::block_on` re-entered from inside a tokio runtime panics; `futures::executor::block_on` re-entered from inside *another* `futures::executor::block_on` on the same thread also panics (its own re-entrancy guard); `futures::executor::block_on` called from inside a *tokio* task has no such check and may complete (multi-thread runtime, by luck) or stall silently (`current_thread`) depending on the awaited future |
| "Pin this", "self-referential struct", "Pin::new_unchecked" | §B15b Pin misuse | Unsafe Pin without proving non-movement |
| "procedural macro", "derive macro", "proc-macro2", "syn"/"quote" | §C6 macro hygiene | Bare `Option`/`Result` paths, `panic!` in macro errors |
| "feature flag", "conditional compilation", "cfg attribute" | §C7 feature hygiene | Typo'd feature names become dead code — Rust 1.80+ warns automatically via `unexpected_cfgs`, but a warning not promoted to `deny` in CI can still be ignored |
| "singleton", "global state", "static config", "app-wide", "OnceLock", "lazy_static", "once_cell" | §A2 Box::leak; §B13 TOCTOU | leak grows on re-init (use `OnceLock`/`LazyLock`); init race |
| "retry", "exponential backoff", "retry with jitter", "reconnect on disconnect" | §B3 cancel safety; §B3a jitter; §B14 unbounded queue | Cancellation between retry and ack; retry buffer growth; deterministic backoff (no jitter) synchronizes N instances into thundering-herd waves — add jitter + a retry budget |
| "rate limit", "throttle" | §B14 backpressure | Unbounded queue feeding the limiter |
| "batch", "buffer messages", "coalesce" | §B14 backpressure; §C8 channel choice | Wrong channel for the producer/consumer fanout |
| "compare token", "verify signature", "check password hash", "verify MAC", "validate HMAC" | §B24 timing attack | `==` on secret material is a network-observable side channel |
| "decrypt endpoint", "return the decrypt error", "why did decryption fail", "distinguish padding vs MAC" | §B24 decrypt oracle | distinguishable decrypt-failure errors across a trust boundary are a padding oracle (CWE-208/209) — one opaque error |
| "deserialize JSON", "parse config", "load YAML", "decode payload" | §B20 serde field-presence | `null` vs absent collapse; `untagged` variant overlap |
| "tracing span", "log context", "instrument", "correlation id" | §C9 span leakage; §C9 instrument-argument leak | `tokio::spawn` without `.in_current_span()`; `#[instrument]` records every argument as a span field via `Debug` unless `skip`ped |
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
| "grep test output", "show only failures", "filter the test log", "pipe cargo test to grep/head" | §D4 grep-filtered runner output | the filter drops `SLOW`/`TIMEOUT` lines and (without `pipefail`) masks the runner's exit code — a hang reads as green; run the runner directly or tee to a file and grep the file |
| "MaybeUninit", "uninitialized memory", "zero-init buffer" | §B5 unsafe; §B7 large stack | `mem::uninitialized` is UB; `Box::new([0;N])` is on stack |
| "FFI", "bindgen", "C library", "extern C", "native bindings", "wrap a C API" | §B25 FFI ABI; §B5 unsafe | Panic across `extern "C"`; allocator mismatch on `Box::from_raw`; `cap`-mismatched `Vec::from_raw_parts` |
| "export a Rust function to C", "cdylib", "staticlib", "call this from Python/Node/Go via FFI", "expose a C API" | §B25 exported entry points; §B5 validate-before-mint | a `#[no_mangle] extern "C"` fn taking `&T`/`&str`/`bool`/`enum` from a C caller — NULL/non-UTF-8/bad-discriminant is instant UB in "safe" Rust; take `*const/*mut` + primitives and validate first |
| "call a C library from threads/tasks", "is this C library thread-safe", "wrap a C handle for concurrency", "global init", "curl_global_init/OpenSSL init" | §B25a library concurrency contract; §B18 Send/Sync | the library's own global state races even with a per-handle lock (CVE-2020-26235); cite the documented thread-safety level, use a process-global lock for a non-reentrant library |
| "callback into Rust", "register a callback", "user_data", "trampoline", "on_event handler from C" | §B25 callback lifetime; §B18 Send/Sync | C fires the callback after the context is freed (async delivery / unregister races the free) → UAF; trampoline that reclaims `Box<F>` double-drops; borrow, unregister-then-drain-then-free |
| "union", "bindgen union", "tagged union from C", "sockaddr/VARIANT/event struct" | §B5 union field reads | prove initialized storage and valid bits for the selected field type; use a tag-checked accessor for tagged C unions, or document a type-punning proof; `#[repr(C)]` for FFI; a union paired with a Rust flag should be an `enum` |
| "every N seconds", "periodically", "on a timer", "scheduled tick" | §B15e interval first-tick | first tick is immediate; the default `MissedTickBehavior::Burst` replays missed ticks back-to-back under lag |
| "exit the program", "bail out", "exit with code", "abort on error" | §B4 process::exit skips Drop | Stack guards (transactions, files, locks) never run their Drop |
| "exit fast", "teardown", "free on shutdown", "drop a large structure", "destroy the tree/arena/map on exit" | §B4 drop at exit (memory vs resource); §B7 recursive Drop | memory-only `Drop` walking a huge structure stalls exit (skip via `mem::forget`/`process::exit`); resource-cleanup `Drop` must still run; recursive `Drop` on deep input overflows the stack |
| "wait for signal from multiple waiters", "condition variable checked by more than one task", "notify_waiters", "broadcast a wakeup" | §B15e Notify lost-wakeup | Wakeup races with `notify_one` unless armed via `enable()` before the check — scoped to concurrent condition-check waiters or `notify_waiters` registration timing; a single-consumer `notified().await` in a loop is the documented safe case and does not need this |
| "log this struct", "add debug logging", "derive Debug" (on types holding secrets) | §B12 crypto Debug-leak | `{:?}` prints `password`/`token`/`key` fields into logs |
| "compare floats", "approximately equal", "assert the result is ~X" | §D1 tests by luck | `assert_eq!` on computed `f32`/`f64` flakes across builds/arches |
| "cast", "convert to u32/i64", "as usize", "truncate to" | §B26 lossy numeric | `as` silently truncates/saturates; use `try_from` |
| "measure time", "duration", "how long", "timeout", "benchmark", "elapsed", "on wasm", "in the browser", "wasm-bindgen" | §B27 wall-clock vs monotonic | `SystemTime` non-monotonic; `.elapsed().unwrap()` panics; use `Instant` — and on `wasm32-unknown-unknown` `Instant::now()`/`SystemTime::now()` panic: use `web_time` |
| "substring", "first N characters", "truncate string", "slice the string", "uppercase/lowercase" | §B28 UTF-8 boundaries | `&s[..]` panics on char boundary; `len()` is bytes |
| "parse JSON id", "large id", "snowflake", "timestamp in JSON" | §B20 numeric fidelity | `f64` loses precision above 2^53 |
| "read env var", "configuration from environment" | §C2 env::var | `.unwrap()` panics on missing/non-UTF8; use `var_os` |
| "sort by", "order by", "multi-key sort" | §B16 sort stability | `sort_unstable` breaks secondary order |
| "recursive parser", "walk the tree", "parse nested" | §B7 recursion depth | unbounded depth → stack overflow (DoS) |
| "read a length prefix", "preallocate a buffer", "buffer from a size field", "read N bytes where N is from input" | §B7 allocation DoS | `with_capacity(attacker_n)` → OOM; clamp + `Read::take(limit)` |
| "decompress", "gunzip", "inflate", "unzip", "gzip/deflate/zlib body" | §B7 decompression bomb | capping the *compressed* input does not cap the *decompressed* output; `.take(MAX+1)` on the **decoder** |
| "extract archive", "unpack tar/zip", "archive destination", "restore an archive" | §C2 archive-entry path traversal; §B7 aggregate extraction quota | entry names are attacker-authored paths — reject `..`/absolute/rooted names, link entries and special files per entry (zip-slip), use `openat`/`cap-std` when the destination is attacker-mutable; separately cap total bytes/entries/nesting |
| "re-deserialize a Value", "from_value", "middleware JSON", "parse YAML config from upload", "already-parsed JSON" | §B7 parser-recursion sub-clause | serde_json's 128 limit is parse-phase only; `from_value` walks an AST with no depth check when the `Value` did not come through that parser (programmatic, `unbounded_depth`, another format); `IgnoredAny`/`flatten`/`untagged` from text stay bounded; older/unmaintained serde_yaml versions had uncontrolled recursion — verify the pinned version and cap depth before building an AST |
| "validate request body", "reject unexpected fields", "PATCH/PUT body", "mass assignment" | §B20 deny_unknown_fields | default serde ignores unknown fields; known duplicate fields may error during direct struct deserialization, while duplicate keys can collapse last-wins in an intermediate `serde_json::Value`/map — choose and test the boundary policy |
| "counter", "offset", "accumulate", "running total", "sum", "balance", "index arithmetic" | §B26 integer overflow; §B13 (if the balance is a SQL read-then-write) | debug panics, release silently wraps; use `checked_*`/`saturating_*` — and a `SELECT`-then-`UPDATE` balance in SQL is a lost-update race, not an arithmetic one |
| "divide", "modulo", "percentage", "average", "ratio" | §B26 div-by-zero | `/ 0` and `% 0` panic; integer `%` truncates toward zero |
| "read from socket", "read the stream", "write to connection", "read N bytes" | §C4 partial read/write | a single `read`/`write` may transfer fewer bytes; use `read_exact`/`write_all` |
| "join paths", "build file path from input", "path from user", "config path" | §C2 Path::join absolute | absolute segment discards the base (path traversal) |
| "open a path from untrusted input", "follow symlinks", "resolve and read", "container/sandbox file access" | §C2 canonicalize→open TOCTOU | `canonicalize` + `starts_with(base)` defeats the static symlink, not a racing one (CWE-367); name the threat model — use `openat`+`O_NOFOLLOW` / `cap-std` when the tree is attacker-mutable |
| "scoped threads", "std::thread::scope", "borrow into a thread", "fan out without `'static`" | §B9 thread::scope auto-join | sync mirror of §B21 — children force-joined on the closing brace; a child waiting on a parent resource deadlocks the brace; child panics re-panic the parent on drop |
| "run a command", "shell out", "execute a command", "call ffmpeg/git/imagemagick", "spawn a process" | §C2 command injection | untrusted data in a shell string → RCE; user value starting with `-` → argument injection |
| "build a query", "dynamic SQL", "search/filter by", "WHERE/ORDER BY from input", "query by a user field" | §C2 SQL injection | `format!`-built SQL → injection; bind params (`$1` + `.bind`/`query!`) or, for dynamic SQL, `QueryBuilder` with every untrusted value through `push_bind()` — `push()` alone appends raw unsanitized SQL and does not bind |
| "fetch this URL", "webhook", "callback URL", "link preview", "image proxy", "download from a user-supplied link", "validate this URL" | §C2 SSRF (outbound request to an attacker-influenced destination) | the private/loopback-host check on the original URL is bypassed by reqwest's default 10-hop redirect policy (302 to `169.254.169.254`/`127.0.0.1`) and by DNS rebinding — allowlist the destination, re-check every hop, pin the resolved IP |
| "optimize", "make this faster", "this is slow", "hot path", "high throughput", "low latency" | §E systemic cost (pick the law by form) | locally-correct code that fails under load; cost not caught by `rustc`/`clippy`/tests |
| "run concurrently", "parallelize", "two awaits", "rayon", "spawn_blocking" | §E1 serialism | independent work done in sequence; CPU-bound work stalling the async worker |
| "reduce allocations", "zero-copy", "avoid clone" | §E2 allocation | reflexive `.clone()`/`.collect()`/`format!`; allocate-in-a-loop with no `with_capacity` |
| "fast hash", "faster HashMap", "FxHashMap" | §E4 contention + §B16 Eq/Hash | fast fixed-seed hasher is a win for trusted keys, a HashDoS trap for untrusted ones |
| "which container/structure should I use", "avoid this clone", "too many allocations", "can this be cheaper/faster", "which concurrent map / hasher" | §E2/§E3/§E4 + Substitution catalog (`data-and-types.md`) | pattern → cheaper representation lookup table (Cow, Arc<str>, Bytes, SmallVec, VecDeque, bitset, slab, indexmap, entry(), the hasher ladder, concurrent maps by access shape), every row gated by §E6 measure-first |
| "lookahead/lookbehind in regex", "backreference", "I need fancy-regex / onig / pcre2", "regex on user input" | §B16 ReDoS sibling | the `regex` crate is linear by construction; backtracking engines on untrusted input/pattern → catastrophic backtracking (CWE-1333); size-cap the input/pattern plus an engine-native step-limit/interrupt or a killable subprocess — a caller/thread/Tokio-side timeout does not stop the backtracking work, it only stops waiting for it |
| "reduce contention", "lock is slow", "scale across cores" | §E4 contention | a lock is a queue under load; read-mostly/sharding/atomic beats `Arc<Mutex>` |
| "add tests", "unit tests for this", "increase coverage", "write a test" | §D1 vacuous tests | test a *postcondition that could break* or an external *contract* — never a tautology/constant/`derive` |
| "extract a crate", "split into a library", "new workspace member", "make this its own crate" | §C10 crate boundaries | premature extraction freezes an unproven API (§C1) and forces version/feature coordination |
| "parse CSV/JSON/URL by hand", "write my own parser for", "quick script, no dependencies", "avoid adding a crate for this", "just use split/format!", "parse XML", "read an XML file", "XML parsing", "compare version strings", "is this version newer", "match a glob/wildcard pattern" | §C12/§C12a reinventing a solved problem | a naive `split`/`format!`/regex shape passes an easy test and is silently wrong on a real input — propose the catalog's named crate (per §A1) before hand-rolling |
| "handle money", "currency amount", "price calculation", "retry this request", "add backoff", "rate limit this endpoint", "throttle requests" | §C12 (money/decimal, retry/backoff, rate-limiting rows) | `f64` for money loses precision silently; a sleep-loop retry with no jitter thundering-herds a shared dependency; a fixed-window rate limiter bursts to 2× at the window boundary |
| "create a temp file", "walk the directory", "list files recursively", "where should config/cache live", "persist this to disk", "simple local key-value store", "embedded database" | §C12/§C12a (temp files, directory traversal, config/cache paths, persistent storage) | a predictable temp-file name is a symlink attack; hand-rolled `read_dir` recursion loops on a symlink cycle; `fs::write` on every update has no crash-consistency — a killed process leaves a truncated file, not an error |
| "encode to base64", "compare these strings for equality" (Unicode text), "wrap/truncate this text", "parse a query string", "split a command into arguments", "decode a binary/network integer" | §C12 (base64, Unicode normalization, text wrapping, form/query decoding, shell-argv splitting, byte-order decoding) | each hand-rolled shape passes an ASCII/happy-path test and is silently wrong on a specific non-ASCII, quoted, or boundary input the catalog names |
| "render markdown", "sanitize html", "escape user input for html output", "display untrusted content", "user-generated content to HTML" | §C12 (HTML sanitization, Markdown rendering — both 🔴) | a blocklist regex misses `<img onerror=…>`; `pulldown-cmark` alone still passes raw `<script>` through — sanitize the rendered output too |
| "check if this IP is in a range", "parse a content-type/MIME header", "distance between two coordinates", "schedule for a future date", "date arithmetic N days from now", "make an HTTP request to an API" | §C12 (CIDR containment, MIME parsing, geospatial distance, date/DST, HTTP client) | a hand-rolled CIDR bitmask misclassifies the boundary address; `Content-Type` split on `/` leaves parameters attached; an unnormalized-longitude distance formula is wrong by orders of magnitude across the antimeridian; manual date offset math breaks on a DST transition |
| "add an in-memory cache", "cache this in a HashMap", "deduplicate repeated requests", "in-memory rate limiter/session store" | §C12/§C12a (cache eviction; single-instance assumption under horizontal scaling) | a hand-rolled LRU forgets to bump recency on a read; in-process state silently diverges the moment the process runs as more than one instance |
| "benchmark this", "lock in the speedup", "guard against regression", "fail CI if it gets slower" | §E6 measure | lock the win in CI — but hard-fail on a *deterministic counter* (allocation bytes, query/syscall counts, instruction counts) pinned to the same allocator/target/compiler/feature set as the stored baseline, since those counts aren't comparable across environments; wall-clock on shared CI is too noisy to gate on (Criterion's own FAQ), keep it as a trend |
| "zip two lists", "iterate two sequences together", "deduplicate a vec", "split into chunks of N", "chunk size from config" | §B29 iterator/slice traps | `zip` truncates to shorter; `dedup` only adjacent; `chunks(0)`/`windows(0)`/`step_by(0)` panic; `collect` into map overwrites dup keys |
| "implement RFC/spec X", "wire format", "protocol", "compatible with Y", "port of Z", "parser for <named format>" | §F1 spec conformance | code self-consistent but diverges from the named reference: wrong field order/width, incomplete state machine, edge cases the spec mandates and the code omits |
| "per our README", "as documented", "the docs say", task touches code whose crate README/docs state guarantees (threat model, what counts as untrusted, durability/ordering promises) | §F2 documented guarantees | code silently violates a guarantee stated only in prose — never visible without reading the project docs first |
| "proxy", "relay", "tunnel", "forward bytes", "handle the connection", "graceful EOF", "half-close" | §F3 boundary lifecycle; §B14 backpressure; §C4 partial read/write | no finite stage-lifetime bound on an untrusted remote (an absolute deadline, or a minimum-progress-rate check paired with a finite max size/duration — a bare rate floor with no cap is not itself a bound), early-`?` skips a registration/counter release, no shutdown propagation where a half-close/protocol-close obligation exists (an owned stream simply dropped and closed by RAII, with no such obligation, is not itself a leak — see the worked example in `semantics-and-conformance.md` §F3) |
| "encode and decode", "serialize/deserialize pair", "parse and Display", "to_string and from_str", "encrypt/decrypt", "pack/unpack" | §F4 round-trip obligation | the pair is written together, tested separately (or against each other only), and `decode(encode(x)) == x` is never established over the full input domain — for a `Display`/`FromStr` pair specifically, this law only applies when the type's own docs establish `Display` as lossless/machine-parseable; a documented human-readable/lossy `Display` has no round-trip law to test in the first place |
| "write tests for this", "add a mock/stub/fake", "in-memory implementation for tests", "test against a fixture" | §D1a oracle validity | the oracle is the code itself: test written from the implementation, stub hides real-world conditions (stream fragmentation, reordering), no negative control |
| "make this test pass", "implement just enough to pass", "get the suite green", "satisfy these assertions" | §D1a façade fitted to the test | Goodhart on the suite — emit the *declaration* (config key/header/status string) the test probes without the *behavior* behind it; ship an end-to-end test that **uses** the feature, not only one that checks it was announced |
| "it works in tests but fails in prod", "load test", "real data sizes", "production traffic" | §D3 test/prod divergence; §B26 debug-vs-release | tests run debug profile, toy sizes, single-threaded — release profile, real scale, and real concurrency are an untested configuration |

**Triggered by code, not phrase** — when the user's input *contains code that matches any of these patterns*, the linked categories activate even if no English phrase fires:

| Code pattern in user input | Activates |
|---|---|
| `async fn` with a `Mutex<...>` field or local `MutexGuard` | §B2 (lock across `.await`), §B11 (blocking executor) |
| `Rc<RefCell<...>>` crossing `.await` or sent across threads | §A2 (smart pointer choice), §B17 (reentrant borrow), §B10 (cycle) |
| `unsafe impl Send for ...` / `unsafe impl Sync for ...` | §B18 (manual Send/Sync) |
| `impl<T: Bound> PublicTrait for T` — or any impl containing an **uncovered** type parameter (`T` appears bare as the impl'd type itself, not nested inside a local type) — in the public API of a published library. Contrast `impl<T> PublicTrait for LocalWrapper<T>`: there `T` is **covered** by the local type `LocalWrapper`, an ordinary generic impl, not this hazard | §C1 (blanket-impl semver hazard — the module's only 🔴 case) |
| a `pub fn` whose return type (or a public field's type) is declared behind a private module ancestor with no `pub use` re-export from the crate root | §A3 (`unnameable_types` case — the type is reachable through the signature even though no import path names it; `unreachable_pub` alone does not catch this) |
| a function with one lifetime parameter `<'a>` used both by an input `&'a` parameter and by the value type inside a `&mut` cache/map/container parameter (e.g. `cache: &mut HashMap<K, &'a V>`) | §B1a (lifetime laundering — write the short-lived-source-then-reuse-after-drop witness before finalizing the signature) |
| `tokio::spawn(...)` / `tokio::task::spawn_local(...)` / `LocalSet::spawn_local(...)` whose returned `JoinHandle` is not bound, not awaited, not detached-by-design | §B21 (dropped JoinHandle ≠ abort — the task already ran and keeps running; it detached, it was not left unpolled; applies to every Tokio spawning API that returns a `JoinHandle`, not only `tokio::spawn`) |
| `tokio::time::timeout(_, tokio::task::spawn_blocking(_))` / `.abort()` called on a `spawn_blocking` `JoinHandle` | §B11 (timeout/abort only detach — they cannot stop a running blocking closure; cooperative cancellation inside the closure via an `AtomicBool`/`CancellationToken` between bounded chunks, or a killable subprocess) |
| `impl Drop` containing `.await`, `block_on`, or `tokio::spawn` | §B22 (async Drop is not real) |
| `impl Deref<Target = ...> for ...` on a non-pointer-like wrapper | §C11 (Deref polymorphism) |
| `#[serde(untagged)]` enum | §B20 (variant shape overlap) |
| `if !map.contains_key(k) { map.insert(...) }` (or the read-half is `map.get(k).is_none()`/`.iter()`) — a predicate that reads the **map's own current state**, then acts on it in a separate call — on a map reachable from more than one thread/task, or through a concurrent map type (`DashMap`); not a plain owned `HashMap` behind `&mut self`, where the borrow checker already rules out the race. A predicate over something *other than* the map's state (`if value.is_valid() { shared_map.insert(...) }`) is not this pattern merely because the map happens to be shared — the map's own contents aren't what's being checked | §B13 (TOCTOU) |
| `==` / `!=` where one operand is *secret material* — a token, MAC tag, password hash, OTP, session key (not a public literal like an algorithm name `"HS256"`) | §B24 (timing attack) |
| `danger_accept_invalid_certs(true)` / `danger_accept_invalid_hostnames(true)` / `tls_danger_accept_invalid_certs(true)` / `tls_danger_accept_invalid_hostnames(true)` (reqwest ≥ 0.13), or a `ServerCertVerifier::verify_server_cert` returning `Ok(...)` unconditionally, outside `#[cfg(test)]` | §B12 (TLS validation bypass → MITM, CWE-295) |
| `Validation::new(...)` used without `set_audience`/`set_issuer`/`set_required_spec_claims`; `validate_exp = false`; `insecure_disable_signature_validation()` (jsonwebtoken ≤ 10) / `jsonwebtoken::dangerous::insecure_decode` (≥ 10.1) | §B12 (JWT claims unchecked / verification disabled — `dangerous::insecure_decode` is the current no-validation entry point, `insecure_disable_signature_validation` the removed-in-11.0.0 older one) |
| `SaltString::from_b64(...)` / a `b"..."` literal salt / a salt derived from the username; `Argon2`/`pbkdf2` with visibly low params | §B12 (fixed salt / below-floor KDF params) |
| `SmallRng::` (any constructor) feeding a key/nonce/salt/token/session-id; `seed_from_u64(...)` or another hardcoded/deterministic seed on any RNG used for security-sensitive output | §B12 (`SmallRng` is non-cryptographic by algorithm and stays banned regardless of seeding; a deterministic seed defeats any RNG for this purpose — use OS-backed entropy) |
| `priv_key.decrypt(Pkcs1v15Encrypt, ...)` / low-level `rsa` private-key op on a request-handler path | §B12 (Marvin timing side channel — RUSTSEC-2023-0071; `cargo audit` before adding crypto deps) |
| distinct `thiserror` variants / messages / HTTP statuses for padding vs MAC vs post-decrypt-parse failure, returned to a client | §B24 (decryption-failure oracle — collapse to one opaque error) |
| `reqwest::get(<untrusted url>)` / `client.get(user_url)` on a user-supplied destination with no destination allowlist and no `redirect(...)` policy | §C2 (SSRF — the default policy follows up to 10 redirects, so the private-host check on the original URL is bypassed by a 302; re-validate every hop via `Policy::custom` and pin the resolved IP via `ClientBuilder::resolve`) |
| Manual `impl PartialEq` or `impl Ord` on a type used as `HashMap`/`BTreeMap` key | §B16 (Eq/Hash contract) |
| `tokio::select! { ... }` with an unrecoverable/non-idempotent side effect in an arm's polled future expression (before `=>`) — not the handler after it, which runs only for the winning arm, and not an atomic/idempotent/transactional effect there, which is cancel-safe by construction | §B23 (arm side effects); also see §B15e for a distinct `select!` hazard this row doesn't cover — re-polling an already-completed arm future across loop iterations, or an all-arms-disabled `select!` with no `else`, both panic |
| `tokio::spawn` inside a function with an active `tracing::Span` | §C9 (span leakage) |
| `mem::transmute`, `ptr::read`, `slice::from_raw_parts` | §B5 (UB-prone unsafe; validate bytes → `Result` before minting the typed value, never mint-then-check) |
| `&t as *const _ as *const u8` + `from_raw_parts(_, size_of)`, or `bytes_of`/`transmute` on a struct, then written to a socket/file/log | §B5 (padding-byte info-leak — reading uninit padding is UB *and* leaks stale memory; derive `NoUninit`/`IntoBytes` and let it reject padding, or serialize field-by-field) |
| a hand-written type with a `*const T` / `*mut T` / `NonNull<T>` field, or a by-hand `PhantomData<...>` | §B18a (variance / `PhantomData` soundness — covariance where invariance is needed → UAF), §B18 |
| a struct/shutdown path that explicitly `.join()`s or `.await`s a `JoinHandle` without first dropping/closing the paired `mpsc::Sender` | §B4 (drop-order shutdown deadlock — close/drop the `Sender` before the join) |
| a self-owning recursive type (`Box<Self>` linked list, deep `Box<Node>` tree) on the auto-derived `Drop` | §B4 / §B7 (recursive `Drop` overflows the stack on deep input — write an iterative `Drop`) |
| `pub enum` / `pub struct` (especially an error enum) in a published library without `#[non_exhaustive]` | §C1a (adding a variant / field is usually a semver-major break downstream — the named-field-struct-with-an-existing-private-field exception, and its tuple-struct limits, are calibrated in §C1a; don't apply either shortcut without reading it) |
| `Box::new([0u8; N])` where `N` is large | §B7 (stack overflow before placement) |
| `Vec::with_capacity(n)` / `vec![_; n]` / `reserve(n)` / `String::with_capacity(n)` where `n` is from untrusted input | §B7 (attacker-controlled allocation size) |
| `GzDecoder`/`DeflateDecoder`/`ZlibDecoder`/`ZipArchive` + `read_to_end`/`extract` with no cap on the *decoded* output (compressed cap is not enough) | §B7 (decompression bomb — `.take(MAX+1)` on the decoder) |
| archive extraction that joins entry names onto a destination without rejecting `..`/absolute/rooted paths, link entries, and special files | §C2 (zip-slip/tar-slip — entry names are attacker-authored paths, CWE-22) |
| archive extraction with no *aggregate* cap on extracted bytes, entry count, or nesting depth | §B7 (per-entry limits don't bound the whole archive) |
| `serde_json::from_value(...)` on a `Value` not produced by serde_json's text parser (built programmatically, `unbounded_depth`, another format's parser); `serde_yaml::from_*` on an untrusted body | §B7 (`from_value` walks the AST with no depth check → uncatchable stack overflow; from-text paths incl. `IgnoredAny`/`flatten` stay bounded by the parse-phase limit; verify the pinned serde_yaml version) |
| `count * std::mem::size_of::<_>()` / `w * h * bpp` used to clamp then allocate, without `checked_mul` | §B7 / §B26 (release wrap passes the size clamp, original count OOMs — CWE-190→789) |
| `#[derive(Deserialize)]` struct taking an untrusted request body (auth/financial/PATCH) without `deny_unknown_fields`; `#[serde(flatten)]` on a hot/untrusted deserialization path | §B20 (unknown-field smuggling; `flatten` buffer-everything cliff — §E2). Separately inspect `serde_json::Value`/map boundaries for duplicate-key collapse. |
| `extern "C" fn` body, `#[no_mangle]`, `Box::into_raw`/`Box::from_raw`, `Vec::from_raw_parts` | §B25 (FFI ABI and ownership), §B5 (UB-prone unsafe) |
| `#[no_mangle]`/`#[unsafe(no_mangle)]` + `pub extern "C" fn` whose parameter is `&T`/`&mut T`/`&str`/`bool`/`char`/an `enum` of any representation, including `#[repr(int)]` (not `*const/*mut` + primitives) | §B25 (exported entry point trusts the type system — C can pass NULL/non-UTF-8/bad-discriminant → UB in safe Rust; validate the raw bits before minting), §B5 |
| `unsafe extern` block containing a `safe fn` item | §B25 (import-direction twin of the exported-entry-point rule — every caller becomes "safe" Rust with no `unsafe` block or `// SAFETY:`; classify by the function's actual documented foreign contract, not by whether its parameters happen to be pointers/handles/lengths/callbacks — `safe` is valid only for a function proven correct for ALL possible inputs, which the overwhelming majority of pointer-taking imports are not, but pointer syntax alone doesn't decide it; default to `unsafe fn` + a validating safe wrapper absent that per-function proof) |
| `union` keyword / `bindgen`-generated union / a field read like `unsafe { u.field }` — especially with no preceding tag/discriminant `match`, or on a union that is not `#[repr(C)]` | §B5 (a union read needs initialized storage plus a local validity proof for that field's type; for a tagged C union the missing tag `match` *is* the finding, for deliberate type-punning the proof is a documented bit-validity argument) |
| `Box::into_raw(...)` cast to `*mut c_void` / `*mut Ctx` passed as `user_data` to a C registration fn; a trampoline that does `Box::from_raw(p)` | §B25 (callback-context UAF / double-drop — borrow in the trampoline, unregister→drain→free at teardown), §B18 |
| an FFI handle behind `Arc<Mutex<_>>` / `unsafe impl Send` for a raw handle, called from multiple threads/tasks, with no cited library thread-safety level | §B25a (the library's own global state races even with a per-handle lock), §B18 |
| `Error::last_os_error()` / raw `errno` read *after* an intervening logging / allocation / second FFI call | §B25a (`errno` is a per-thread global clobbered by the next call — capture it immediately) |
| `unsafe { std::env::set_var(...) }` / `unsafe { std::env::remove_var(...) }` anywhere except the top of `main` before any thread or async runtime exists | §B25a + §B5 (process-global C-state race on non-Windows targets — Windows's environment API is thread-safe at the OS level, the module's stated exception; `cargo fix --edition`'s audit-prompt comment is a prompt to audit, not an audit) |
| `std::process::exit(...)` / `process::exit(...)` below a live RAII guard | §B4 (Drop skipped) |
| `Arc::strong_count(...)` / `Rc::strong_count(...)` used in a conditional | §B13 (count TOCTOU — use `into_inner`/`try_unwrap`) |
| `flag.store(_, Ordering::Relaxed)` after a payload write, paired with a `flag.load(Ordering::Relaxed)` then a read of that payload | §B13 (`Relaxed`-publish data race — needs `Release`/`Acquire`) |
| `assert_eq!(...)` / `assert_ne!(...)` with an `f32`/`f64` operand | §D1 (float exact-equality) |
| `assert!(t.elapsed() < Duration::…)` — any wall-clock threshold asserted inside a `#[test]` | §D1 (tight → flakes on a loaded runner; loose → vacuous; and `cargo test` is the debug profile, not what ships — §D3. Gate performance on a deterministic counter, §E6) |
| `notify.notified()` with more than one concurrent waiter, or `notify_waiters()` registration timing | §B15e (lost wakeup — arm with `enable()` before check; a single-consumer `notified().await` in a loop is the documented safe case and does not need this) |
| `#[derive(Debug)]` on a struct with a `password`/`secret`/`token`/`key`/`seed` field | §B12 (Debug-leak of secrets) |
| `#[instrument]` / `#[tracing::instrument]` on a fn with a `password`/`token`/`secret`/`key`/`body`/`request` parameter and no `skip`/`skip_all`; `#[instrument(ret)]`/`(err)` on a fn returning/failing with secret-bearing values | §C9 + §B12 (the macro records every argument as a span field via `Debug` — the span field is the leak; role-scoped as §B12's field rule is) |
| `impl Drop` whose body can `panic!`/`.unwrap()`/`.expect()` | §B4 (panic-in-Drop double-abort) |
| `tokio::time::interval(...)` | §B15e (first tick is immediate; pick `MissedTickBehavior`) |
| `oneshot::channel()` with the result discarded with no comment establishing the documented best-effort/receiver-no-longer-interested case, or `.unwrap()`-ed | §B8 (drop cascade / `RecvError` panic — a discarded `send` error is a legitimate best-effort idiom when the receiver's disappearance specifically means "no longer wanted"; the finding is the *unstated* case, not every discarded result) |
| `as` cast narrowing an integer (`x as u32`, `len() as u32`) or `f as iN`/`uN` | §B26 (lossy numeric) |
| `SystemTime::now()` / `Utc::now()` used to measure a duration; `.elapsed().unwrap()`; `Instant::now()`/`SystemTime::now()` in code targeting `wasm32-unknown-unknown` | §B27 (wall-clock vs monotonic; wasm: both `now()`s panic — use `web_time`) |
| `&s[a..b]` string slice with computed indices; `s.len()` used as a char count | §B28 (UTF-8 boundaries) |
| `Box::leak(...)` | §A2 (use `OnceLock`/`LazyLock`) |
| `mem::forget(...)` / `ManuallyDrop` without manual drop | §B4 (RAII disabled) |
| `if let … {} else {}` whose scrutinee holds a lock/RAII guard; a custom-`Drop` value in tail position | §B4a (edition-2024 temporary-scope shift) |
| `FuturesUnordered` pushed unbounded or polled while empty in `select!`; a `JoinSet` grown by repeated `.spawn()`/`.spawn_on()`/`.spawn_local()`/`.spawn_blocking()` with no cap and no matching drain (`.join_next()`) | §B14 (busy-loop / unbounded growth — the set-growth hazard applies identically whichever spawning form fills it; bounded or continuously-drained use is not the defect) |
| `loop { let (stream,_) = listener.accept().await?; tokio::spawn(...) }` with no `Semaphore` cap; `accept()` behind `?` or a bare `warn!; continue` | §B14 (unbounded admission — cap with `Arc<Semaphore>` + `acquire_owned` before spawn, permit moved in; classify accept errors: fatal vs transient-with-backoff, never hot-loop on `EMFILE`) |
| `map.insert(key, v)` on a `HashMap`/`DashMap`/`BTreeMap` where `key` derives from request path/header/IP and there is no eviction/TTL/cap | §B14 (insert-only unbounded cache/registry — `lru` (≥ 0.18.2)/`moka` or a stated cardinality bound) |
| a hand-rolled parser/encoder for CSV, URL, JSON, base64, XML, or a query string via `.split(',')` / `.split('&')` / `format!` string-building, where the input can plausibly be quoted/escaped/non-ASCII | §C12 (reinventing a solved problem — the catalog names the specific input the hand-rolled shape gets wrong) |
| a second `lock.read()` on a `std::sync::RwLock` / `tokio::sync::RwLock` reachable while a first read guard is still live (through a helper/trait/callback) | §B17 (reentrant read deadlocks under a waiting writer — std's policy is unspecified, tokio's is write-preferring; drop the guard before re-reading or pass the data down) |
| `watch::channel(...)` / `Receiver::borrow()` | §B15e (initial-value semantics) |
| `Vec::remove(0)` / `insert(0, _)` / `contains` in a loop | §C4 (O(n²)) |
| `{:?}` on `&[u8]`/`Vec<u8>` | §C4 (decimal not hex) |
| `sort_unstable*` where equal-element order matters | §B16 |
| `a + b` / `a * b` / `.sum()` on integers from input or accumulating, without `checked_*`/`saturating_*` | §B26 (overflow: debug-panic vs release-wrap) |
| `x << n` / `x >> n` where `n` is a runtime count from input/config or an unchecked computation, with no explicit checked/wrapping policy | §B26 (shift-count overflow: debug panics, release masks the count to `n % BITS`) |
| `a / b` / `a % b` without a `b != 0` guard | §B26 (div/rem by zero panic) |
| `slice[i]` / `&s[a..b]` / `split_at(i)` with an index from untrusted input | §B26 (index OOB) / §B28 (string boundary) |
| a single `.read(&mut buf)` / `.write(data)` treated as complete | §C4 (partial transfer) |
| `base.join(untrusted)` | §C2 (absolute segment discards base) |
| `canonicalize(...)` then `File::open(...)` / `fs::read(...)` on a path under an attacker-mutable directory | §C2 (TOCTOU between check and use — CWE-367; race-free only via `openat`+`O_NOFOLLOW` / `cap-std`) |
| `std::thread::scope(\|s\| { s.spawn(...) ... })` whose children await a resource the *parent* code after `s.spawn` would release | §B9 (scope auto-joins on closing brace → deadlocks; child panic re-panics parent on drop) |
| `fancy_regex::Regex::new(...)` / `onig::Regex::new(...)` / `pcre2::...` matched against untrusted input or with an attacker-controlled pattern | §B16 (ReDoS / catastrophic backtracking — keep untrusted input on `regex`; otherwise size-cap the input/pattern and use an engine-native step-limit/interrupt or a killable subprocess, since a caller/thread/Tokio timeout only stops waiting, not the backtracking work itself) |
| `Command::new("sh"/"bash"/"cmd")` with `arg("-c"/"/C")` + interpolated input (command injection via the shell); `.arg(format!(...))`/`.args(untrusted.split(...))` where the value lands in **option position** or starts with `-` (argument injection) — a literal argv value placed after a `--` separator, passed to a non-shell `Command`, is a narrower case: risk there depends on option position and the target program's own argument semantics, not the mere presence of `format!`/an untrusted value | §C2 (OS command / argument injection) |
| `sqlx::query(&format!(...))` / `query_as(&format!(...))` / `diesel::sql_query(format!(...))` / `sqlx::AssertSqlSafe(format!(...))` / `AssertSqlSafe(<input-derived string>)` / `QueryBuilder::push(<untrusted>)` — untrusted input in the SQL string or pushed as a raw unbound fragment | §C2 (SQL injection — bind parameters via `.bind`/`query!`/`push_bind`, don't format or `push()` raw) |
| a `SELECT` whose result guards a later `UPDATE`/`INSERT` on the same row (read-modify-write in two statements, in or out of a transaction) | §B13 (lost update — one atomic predicate-in-SQL statement + `rows_affected()==1`; `SELECT … FOR UPDATE` inside a `pool.begin()` tx routing every statement through the `Transaction` handle; or an optimistic `version` column; `READ COMMITTED` does not close it) |
| `query("BEGIN")` / `query("COMMIT")` (or `START TRANSACTION`) executed against a `Pool` | §B4 + §B13 (statements may land on different pooled connections — the "transaction" spans nothing and PostgreSQL answers the orphan `COMMIT` with only a warning; use `begin()` and the `Transaction` handle) |
| `x().await;` then an independent `y().await;` (no data dependency) | §E1 (serial latency — `tokio::join!`/`try_join!`) |
| `.collect::<Vec<_>>()` immediately followed by a single iteration | §E2 (needless materialization — stay lazy) |
| `Regex::new(...)` (or parser/schema/template build) inside a frequently-called fn | §E5 (recompiled every call — hoist to `LazyLock`/`OnceLock`) |
| `format!` / `String::push` / `Vec::push` in a loop without `with_capacity` | §E2 (allocate-in-a-loop — pre-size or `write!` in place) |
| CPU-bound loop (hash / compress / parse a large blob) inside an `async fn` | §E1 + §B11 (stalls the runtime worker — `spawn_blocking` / `rayon`) |
| `Arc<Mutex<T>>` whose `T` is read-mostly / swapped wholesale / never mutably shared | §E4 (lock is contention — `ArcSwap`/atomic/`Arc<T>`), §A2, §B2 |
| `assert_eq!(SOME_CONST, <same literal>)` / `assert!(true)` / a test that sets a field then asserts the getter | §D1 (vacuous test — assert a postcondition or an external contract, not a tautology) |
| `.zip(`, `.dedup()`, `.chunks(n)`/`.windows(n)`/`.step_by(n)` with `n` from input (literal sizes are fine), `.collect::<HashMap<_,_>>()` on possibly-duplicate keys | §B29 (truncation / adjacent-only dedup / zero-size panic / dup-key overwrite) |
| a comment / doc / identifier naming an external standard (`// RFC 9110`, `per the spec`, `Socks5`, `Bencode`, a `mod <protocol-name>`) | §F1 (the name is a conformance *claim* — verify against the reference, not against the code's own tests) |
| `match` over a protocol state/opcode/message-type enum with a `_ => ` arm, or with fewer arms than the referenced spec defines | §F1 (incomplete state machine — the wildcard silently absorbs spec-mandated states) |
| a connection/stream handler where the `Err`/early-`?` path does not run the same cleanup as the `Ok` path (an unbalanced registration/counter, a missing guard, cleanup only at fn tail) — note a bare dropped/owned stream closing via RAII is not itself this defect unless a half-close/protocol-close obligation applies | §F3 (resource lifecycle on the error path) |
| `.read(...)` / `read_exact` / `next()` on a remote-peer stream with no *absolute* whole-frame/whole-handshake deadline and no minimum-progress-rate check that is itself capped by a finite max size or max duration | §F3 (untrusted peer can hold the task forever — a per-read `timeout(dur, read_exact(..))` is not a fix, neither is a resettable idle timer used alone, and neither is a bare rate floor with no cap: an unknown-length stage sent at exactly the minimum rate forever never trips it; a cancelled `read_exact` may have consumed bytes into the caller's buffer without reporting how many are valid, so a naive retry resumes misaligned mid-frame rather than losing them outright, §B3; a fired deadline must be terminal, not retried; an idle timer may still be an *additional* layer on an established connection, never the sole defense) |
| an `encode`/`serialize`/`to_*` fn and its `decode`/`parse`/`from_*` inverse in the same crate, with no test calling both in one assertion | §F4 (round-trip obligation untested) |
| `bincode`/`postcard`/`rkyv`/default-derived-`borsh` (de)serialization of a type written to disk/DB/wire, in a diff that inserts or reorders its enum variants or struct fields without an explicit on-wire/on-disk format-version byte (checked at decode time) or a golden-bytes fixture captured from the prior release | §F1 (positional format under default ordinal encoding: declaration order is the persisted spec — the §F4 round-trip stays green while already-stored bytes may reinterpret as a different value, or fail to decode, depending on whether the old and new shapes at that position happen to be byte-compatible; `borsh`'s explicit-discriminant form is not exposed to this) |
| a test module whose only inputs are handcrafted literals mirroring the implementation's branches; an in-memory `impl` of an I/O trait used as the *only* test transport | §D1a (oracle written from the code; stub erases fragmentation/partial-read/reorder realities) |
| test data sizes ≪ documented/realistic scale (`vec![..; 10]` where prod is millions), single-task tests of code documented as concurrent | §D3 (scale/concurrency divergence) |
| `[patch.crates-io]` / `[patch.*]` table, or a `git = "…"` dependency with only `branch = "…"` (or no `rev`/`branch` at all) | §A1 (unpinned source for a known-good name follows remote HEAD and bypasses `cargo audit`/`vet` — pin a full `rev`, name a user-approved repo, state a removal condition) |
| `build.rs` containing `Command::new("curl"/"git"/"wget")`, `reqwest`/`ureq`/`hyper`, or any network call | §A1 (network at build time = unpinned bytes outside the lockfile — vendor or fetch in a separate CI step with a hardcoded SHA-256 + offline fallback) |
| `build.rs` emitting `println!("cargo::rerun-if-changed=...")` for only some of the paths it actually reads (a schema/header passed to `prost-build`/`bindgen`/`cc` with no matching `rerun-if-changed` line) | §C7 (stale-generated-code trigger — once any `rerun-if-changed` is emitted, Cargo reruns the script *only* for those paths; compare every emitted path against every input the script actually reads) |

When two or more triggers fire in one request, treat it as a high-risk task and explicitly enumerate which categories I'm guarding against in my response.

---

# Category map — which module holds each §

The category bodies live in sibling modules of this skill. When a trigger above fires, open the module named here. Tier (🔴/🟡/🟢; A–F) is a property of each category, preserved in its body.

| Category | Module |
|---|---|
| §A1 | `deps-macros-ergonomics.md` |
| §A2 | `concurrency-and-state.md` |
| §A3 | `lifetimes-and-api.md` |
| §B1 (a, b) | `lifetimes-and-api.md` |
| §B2, §B3, §B3a, §B8, §B11, §B15 (a–e), §B21, §B22, §B23 | `async.md` |
| §B4 (a) | `drop-and-raii.md` |
| §B5, §B7, §B18 (a), §B25 (a) | `unsafe-and-ffi.md` |
| §B6, §B16, §B20, §B26, §B27, §B28, §B29 | `data-and-types.md` |
| §B9, §B10, §B13, §B14, §B17, §B19 | `concurrency-and-state.md` |
| §B12, §B24 | `security.md` |
| §C1 (a) | `lifetimes-and-api.md` |
| §C2 | `security.md` |
| §C3, §C9 | `async.md` |
| §C4 | `data-and-types.md` |
| §C5, §C6, §C7, §C10, §C11, §C12 (a) | `deps-macros-ergonomics.md` |
| §C8 | `concurrency-and-state.md` |
| §D1 (a), §D2, §D3, §D4, §D5 | `testing.md` |
| §E1 | `async.md` |
| §E2, §E3 | `data-and-types.md` |
| §E4 | `concurrency-and-state.md` |
| §E5 | `deps-macros-ergonomics.md` |
| §E6 | `testing.md` |
| §F1, §F2, §F3, §F4 | `semantics-and-conformance.md` |

**Cross-reference note:** a few categories point to a twin in another module (e.g. §B22 async-Drop → §B4 sync Drop; §E4 contention → §A2/§B2/§B13/§B16). These are navigational only — open the named module via this map when you need the twin.

# Version pins (deliberately current, verify against your MSRV)

This spec targets **Rust edition 2024, MSRV ≥ 1.85**. (Edition 2024 was stabilized in **Rust 1.85**, February 2025 — a crate declaring `edition = "2024"` will not build on an older toolchain, so 1.85 is the floor; the strict-provenance API pinned to 1.84 below is subsumed by it.) Several rules above depend on stability dates and library versions; if your project pins an older toolchain or older library, re-verify before applying these rules verbatim:

- `Box::<[T]>::new_uninit_slice(N)` — stable since **Rust 1.82** (October 2024). Required for the §B7 uninit-buffer pattern without `unsafe`-around-`mem::MaybeUninit`.
- `Vec::into_raw_parts` — **stable since Rust 1.93**. For MSRV < 1.93, use the `ManuallyDrop<Vec<T>>` + manual `(ptr, len, cap)` decomposition (stable since 1.0). The spec's MSRV floor is 1.85, so by default the manual form is what you write; bump the MSRV explicitly if you want the convenience.
- `unexpected_cfgs` lint — automatic since **Rust 1.80** (July 2024) per §C7. Older toolchains require the manual `[lints.rust] unexpected_cfgs = ...` configuration.
- **rustc lints as 🟢 backstops (the compiler now covers gaps this spec guards by hand).** `dangerous_implicit_autorefs` (warn 1.88 → deny 1.89), `invalid_null_arguments` (1.88), `dangling_pointers_from_locals` + `integer_to_ptr_transmutes` (warn 1.91), `deref_nullptr` (warn → **deny** 1.93) + `function_casts_as_integer` (warn 1.93) — §B5; `mismatched_lifetime_syntaxes` (warn 1.89) — §B1's hidden return-lifetime shape; `c_void_returns` (warn 1.98; `extern fn` returning `c_void` instead of `()`) — §B25; `invalid_runtime_symbol_definitions` (deny) / `suspicious_runtime_symbol_definitions` (warn), both 1.98 (`#[no_mangle]` definitions shadowing runtime symbols like `malloc`/`memcpy`) — they carry part of `unsafe-and-ffi.md`'s `#[no_mangle]` bullet. Verify per toolchain like any pin.
- **clippy 1.93–1.98 additions mapped to categories (🟢; no Post-flight change — all are in warn-by-default groups or covered by `-W clippy::pedantic`).** 1.94: `ptr_offset_by_literal`, `same_length_and_capacity` (pedantic). 1.95: `manual_checked_ops` (complexity — rewrites hand-rolled overflow checks to `checked_*`, §B26), `duration_suboptimal_units` (pedantic), `disallowed_fields` (style). 1.96: `manual_noop_waker` (complexity, §B15b), `manual_pop_if` (complexity). 1.97: `assert_is_empty`, `manual_assert_eq` (pedantic), `useless_borrows_in_formatting` (perf); group moves — `overly_complex_bool_expr` `correctness`→`pedantic`, `nonminimal_bool` `complexity`→`pedantic`. 1.98: `for_unbounded_range` (suspicious; `for i in 0..` — §B26/§B14), `with_capacity_zero` (pedantic), `unused_async_trait_impl` (pedantic, §B15a), `unnecessary_unwrap_unchecked` (complexity, §B5), `by_ref_peekable_peek` (suspicious). Stability notes: **no group change** for `await_holding_lock`, `unwrap_used`, `arithmetic_side_effects`, `cast_possible_truncation` across 1.93–1.98 (the `await_holding_lock` history bullet above is unchanged), and **no new lint covers unbounded channels** — §B14 stays write-time discipline.
- Edition 2024 changes temporary drop scope: `if_let_rescope` (auto-fixed by `cargo fix --edition`) and `tail_expr_drop_order` (advisory, **no** autofix). Relevant on any 2021→2024 migration. See §B4a.
- **AFIT** (async fn in trait) — stable since **Rust 1.75** (December 2023) per §B15a. Pre-1.75 code must use `async-trait`.
- **`std::assert_matches!`** per §D1 — stable since **Rust 1.96**, above this spec's declared MSRV floor of 1.85. On a project pinned below 1.96, use `assert!(matches!(value, pattern), "unexpected value: {value:?}")` instead — always-on since 1.0, with an explicit diagnostic message standing in for what `assert_matches!` prints automatically.
- **`tracing::Instrument::in_current_span`** — stable in `tracing` 0.1.x; pin the version.
- **`tokio::sync::Mutex` cancel-safety** — pin tokio version (1.x stable API; cancel-safety annotations live in tokio's docs).
- **tokio recent additions** (verify against your pinned tokio): the `biased;` directive — long available in `select!` — was extended to `join!` and `try_join!` in **tokio 1.46.0**; `tokio::sync::SetOnce` (write-once cell with an event-style wait) landed in **tokio 1.47.0**; the cooperative-scheduling helpers moved into the `tokio::task::coop` module in **1.44.0** (see the `consume_budget` pin below). On any tokio below these, the API is absent — do not assume it.
- **`rand` 0.8 / 0.9 / 0.10 split** — `thread_rng()` in 0.8 → `rng()` in 0.9; `OsRng` in 0.8/0.9 → `SysRng` in 0.10 (with the `Rng` trait renamed to `RngExt`). The OS-seeded-`StdRng` constructor also moved: `StdRng::from_os_rng()` exists on 0.9 but not 0.10, where the replacement is `StdRng::try_from_rng(&mut SysRng)?` or `rand::make_rng::<StdRng>()` — verify against your pinned 0.10.x (§B12).
- **`subtle` crate** for §B24 — stable, `subtle::ConstantTimeEq::ct_eq` is the canonical entry point.
- **`clippy::await_holding_lock`** per §B2 — today **warn-by-default** (clippy `suspicious` group), so the bare `cargo clippy` emits it without a manual `-W`; the Post-flight `-W clippy::await_holding_lock` is redundant reinforcement, not a prerequisite. Its group has moved: introduced in **clippy 1.45** (`correctness`, deny-by-default), downgraded to `pedantic` (allow-by-default) around 1.50 to quiet false positives, then promoted to `suspicious` (warn-by-default) in **Rust 1.61** — so on a toolchain in the 1.50–1.60 range a bare `cargo clippy` does *not* emit it and the explicit `-W` is required. Verify against your pinned toolchain.
- **Strict-provenance API** (`ptr.with_addr`, `ptr.addr`, `ptr.expose_provenance`, `with_exposed_provenance`) per §B5 — stable since **Rust 1.84**.
- **`consume_budget`** per §B11 — the function is stable since **tokio 1.39.1** (1.39.0 was yanked) at `tokio::task::consume_budget`; it moved into the new `tokio::task::coop` module in **tokio 1.44.0** (old path `#[deprecated]` from 1.44.0). On a tokio MSRV below 1.44 use `tokio::task::consume_budget`; on 1.44+ use `tokio::task::coop::consume_budget`.
- **Panic across `extern "C"`** per §B25 — two separate dates: the `extern "C-unwind"` ABI (defined cross-language unwinding for callers that can handle it) is **stable since Rust 1.71**; the change making a panic across *plain* `extern "C"` abort the process by default (it was UB before) landed **in Rust 1.81**. Either way, `catch_unwind` at the boundary is the safe answer — but it catches only an *unwinding* panic, so under `panic = "abort"` the boundary is unprotected (see §B25).
- **`unsafe extern` blocks / `safe` fn qualifier** per §B25 — `unsafe extern` is the required syntax in edition 2024, and the per-item `safe`/`unsafe` qualifier inside an extern block is stable since **Rust 1.82**. On older editions/toolchains plain `extern` blocks are all-unsafe to call and `safe fn` does not exist.
- **Float→int saturating cast** per §B26 — `300.0_f32 as u8 == 255`, `NaN as i32 == 0` etc. became defined (saturating) in **Rust 1.45**; before that the out-of-range cast was UB. Code adapted from pre-1.45 / C examples silently saturates instead of wrapping or erroring. The other §B26/§B27/§B28 APIs (`try_from`, `is_char_boundary`, `Instant`) are long-stable std and need no pin.
- **`Instant`/`SystemTime` on wasm** per §B27 — `std::time::{Instant, SystemTime}::now()` panic on `wasm32-unknown-unknown`; the `web-time` crate re-exports `std::time` unconditionally on non-wasm targets, so `use web_time::{Instant, SystemTime};` is the portable unconditional import. On non-wasm targets std's types need no pin.
- **Integer overflow behavior** per §B26 is **not** version-gated: debug builds panic, release builds wrap (`overflow-checks = false` is the release default) on every supported toolchain. `checked_*`/`saturating_*`/`wrapping_*` are stable since 1.0.
- **`LazyLock`** per §A2 — stable since **Rust 1.80** (July 2024), alongside `OnceLock` (stable 1.70). Both are the recommended replacement for `Box::leak`-as-global and for `lazy_static!` / `once_cell::sync::Lazy`.
- **Toolchain is part of the artifact — pinned *and* patched.** Record the exact `rustc --version --verbose`, Cargo version, target triple, and any `rust-toolchain.toml`/`rust-toolchain` channel in CI. A stable-channel label alone is not reproducible: patched point releases can change lint, standard-library, or advisory behavior. A pinned point release can also still *carry* an active CVE — Cargo 1.94.0 carried the crate-tarball chmod escape (CVE-2026-33056, fixed 1.94.1) and 1.95.x the CVE-2026-5222/-5223 pair (fixed 1.96.0) — so re-check the pinned version against the Rust security advisories, not just record it. Re-run this version check after a toolchain update.

---

# Pre-flight checklist (run mentally before any non-trivial Rust)

Before writing the code, answer all nine out loud:

1. **Versions**: which exact *resolved* crate versions am I targeting? Did I read `Cargo.lock`/`cargo metadata` (not just `Cargo.toml`, which only states the declared range) and `CLAUDE.md`?
2. **APIs**: am I about to call any method I'm not 100% sure exists in the pinned version? If yes, flag it.
3. **Async or sync context**: will this run under tokio? Are there locks that could cross `.await`? Is this `Send + 'static`?
4. **Cancel-safety**: for every `async fn`, can it tolerate cancellation at every `.await`? If not, where do I detach via `spawn` or document the precondition?
5. **Unsafe**: do I have a stated `// SAFETY:` invariant for each block? Is miri in CI for this file?
6. **Lifetimes**: if I'm returning a reference tied to more than one input lifetime or captured into a longer-lived container (§B1a), can I write the §B1a witness — a call inserting a short-lived source, then a use of the cache after that source's scope ends? A plain reference derived from a single input needs no witness.
7. **Public surface**: is anything I'm marking `pub` part of the intended public API? Any blanket impls? Any error types leaking through?
8. **Reference**: does this code claim conformance to anything external (spec, RFC, format, reference impl, the project's own docs)? If yes — have I read the claimed reference, and can I name the edge cases it mandates? (Tier F)
9. **Inverse pair**: am I writing one half of an encode/decode, parse/Display, encrypt/decrypt pair? If yes, the round-trip property test ships in the same change (§F4) — except a `Display`/`FromStr` pair where `Display` is documented as human-readable/lossy, which has no round-trip law to ship a test for.

If I cannot answer any of these confidently, I ask the user before generating code rather than guessing.

---

# Post-flight checklist (run after generating Rust)

After generating Rust, run the toolchain, then surface — file:line — every occurrence of the 🔴-tier items listed in **Enforcement tiers** (and nothing from the 🟡/🟢 tiers; those are applied while writing or delegated to clippy). The 🔴 list lives in Enforcement tiers and is not re-enumerated here — that is its canonical home; the bash below is the toolchain pass that backs it (the 🟢-tier items are left to the linter):

```bash
cargo build --workspace                                       # baseline; --workspace on a non-virtual
                                                                # workspace root, else member tests/lints
                                                                # never run (§D4/§C10)
cargo clippy --workspace --all-targets -- -W clippy::pedantic \
                -W clippy::await_holding_lock \
                -W clippy::unwrap_used \
                -W clippy::missing_safety_doc \
                -W clippy::undocumented_unsafe_blocks \
                -W clippy::clone_on_copy \
                -W clippy::redundant_clone \
                -W clippy::arithmetic_side_effects \
                -W unused_must_use
cargo test --workspace
# add when the crate does arithmetic on untrusted/accumulating values or leans on debug_assert! for
# anything load-bearing (testing.md §D3) — debug and release disagree on overflow/debug_assert:
cargo test --workspace --release
cargo +nightly miri test --workspace    # any file touching `unsafe` — bare `miri test` on a non-virtual
                                         # workspace root omits member crates the same way bare
                                         # `cargo test` does (§C10's package-selection detail; §D3
                                         # for the CI-configuration angle); Miri accepts cargo-test
                                         # package-selection flags, so `-p <member>` also works
# publish gate for a published library crate (skip for a bin/internal/workspace-private crate)
cargo semver-checks
# production/security gate (when the project has these tools configured)
cargo audit --deny warnings
cargo deny check advisories bans licenses sources
```

`cargo audit`/`cargo deny` are release or CI gates, not substitutes for reading the lockfile. If a repository cannot use one of them, record the reason and the compensating advisory/source review in the audit report rather than silently skipping supply-chain checks. `cargo semver-checks` is the same kind of gate for §C1/§C1a/§A3: it mechanically catches the delayed-blast forms those categories describe *between two releases* (a blanket impl narrowing, a variant added to an enum that lacks `#[non_exhaustive]` — the deny-by-default `enum_variant_added` — a trait method addition that breaks object-safety or drops an auto-trait impl) before they reach a consumer's CI. It works by diffing the current crate against the *previous* release as its baseline, so a default run does **not** catch a missing `#[non_exhaustive]` when a type is first introduced: a brand-new type has no baseline to diff against, and the lints encoding exactly that check (`exhaustive_enum_added`, `exhaustive_struct_added` — "A new exhaustive pub enum was added… Consider adding #[non_exhaustive]…") are allow-by-default additive-policy lints (release notes v0.42/v0.46+: "allow-by-default lints for additive-only changes" / "additive-only API changes (opt-in only)"; even a *later removal* of `#[non_exhaustive]`, `enum_no_longer_non_exhaustive`, is likewise opt-in). A bare `cargo semver-checks` run is later-break detection, not missing-attribute-at-introduction; when that stronger guarantee is wanted, opt in via the crate's `Cargo.toml` — `[package.metadata.cargo-semver-checks.lints]` with `exhaustive_enum_added = "warn"` / `exhaustive_struct_added = "warn"` (workspace-wide via `[workspace.metadata…]` + `workspace = true`). It still documents its own gaps (generics, lifetimes, feature/target-specific breakage), so the categories' write-time discipline still carries what it doesn't cover.

> `clippy::unwrap_used` is `restriction`-group and intentionally noisy — triage its hits by hand (a `.unwrap()` that is statically impossible to fail and carries a comment is fine per §C2), don't count each as a finding. `expect_used` is omitted by default for the same reason: `expect("invariant: …")` is explicitly allowed by §C2.

When surfacing a 🔴 occurrence, give the "why/how" from its category body — e.g. for a crypto call list library + primitive + params (§B12), for a new dependency give name + version + one-line justification (§A1), for `extern "C"` note the panic/ownership contract (§B25).

Optional for production: `tokio-console` for blocked workers / stuck locks (§B9/§B11), `loom` for multi-lock / atomic model checking (§B9/§B13), `heaptrack` for steady-state memory growth (§B10), `cargo-mutants` to check that tests actually fail when the code is mutated (§D1a — the oracle-validity counterfactual, mechanized).

---

# When this command is loaded

I will:
- Read `Cargo.lock`/`cargo metadata` (the resolved versions) and `Cargo.toml`/`CLAUDE.md` (declared ranges and idioms) to pin versions and idioms before writing code.
- Treat 🔴-tier rules as hard constraints (surface always; block on crypto / unsafe-invariants / new-dependency per the Blocking protocol). Apply 🟡-tier rules while writing — get them right, but don't report each one. Let clippy own the 🟢 tier.
- Refuse to write trait hierarchies blind; propose, then wait for approval.
- Refuse to write `unsafe` without `// SAFETY:` justification.
- Flag API calls I'm uncertain about rather than hallucinate them.
- Run the post-flight checklist mentally and report results before declaring work complete.

The principle: **if a category of bug exists where the compiler cannot help, the discipline must move from the type system into this checklist**. Rust gives me the strongest type system of any mainstream language, but cancel safety, semver, drop ordering, and UB in unsafe live outside it. This document is where that gap is filled.
