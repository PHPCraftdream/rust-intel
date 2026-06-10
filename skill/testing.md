# Rust Intel — Testing, CI & Measurement

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §D1 (a), §D2, §D3, §E6. Tier labels (🔴/🟡/🟢; A–F) and all cross-references are preserved verbatim.
> **Tiers in this module:** §D1 🟡 · §D1a 🟡 · §D2 🟡 · §D3 🟡 · §E6 🟡/🟢. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §D1. Tests that pass by luck

**The trap**: `thread::sleep(Duration::from_millis(N))` to "wait for the async work to finish" races: the work happens to complete in `< N ms` on the developer's machine, the test passes, CI runs slower (or faster) and the test flakes. `#[should_panic]` without `expected = "..."` catches *any* panic — including a panic in test setup before the system-under-test was even called — and the test author reads "should panic" as proof that the SUT panicked, when in fact it might have been the test scaffolding. Tests that only assert "no panic" (`do_thing(); assert!(true);`) prove the syscall ran, not that it produced the correct postcondition.

**BANNED**:
- `std::thread::sleep` or `tokio::time::sleep` (real) to synchronize a test with async work — race condition, flaky CI.
- `#[should_panic]` without `#[should_panic(expected = "specific message substring")]` — any panic, anywhere in the test, makes it green.
- Tests that assert no postcondition: `let _ = do_thing(); assert!(true);` — proves only that `do_thing` returned without panicking, which is the weakest possible assertion.
- Tests that compare two outputs derived from the same buggy intermediate (e.g., `assert_eq!(serialize(x), serialize(parse(serialize(x))))` does not prove `parse` is correct, only that it is idempotent on serialize output).
- `assert_eq!(a, b)` where `a: f32` or `f64` and the values are computed (not literal). Floating-point exact equality flakes between debug/release builds, between architectures (SSE vs AVX vs NEON), and across compiler versions due to reassociation. Use `approx::assert_relative_eq!(a, b, epsilon = …)` or `assert_abs_diff_eq!`, or write the comparison manually as `(a - b).abs() < eps`.
- A test whose mock/fake always returns `Ok`/success and never reproduces the failure modes the real dependency exhibits (timeouts, partial reads, `5xx`, connection resets). A green test against a happy-path-only mock proves behavior against fiction, not against the dependency. Mock the error paths too, or use a fake that can be told to fail.
- **Vacuous tests / coverage theater.** A test that asserts a value against its own definition (`assert_eq!(MAX_RETRIES, 3)`), re-checks what the compiler, `std`, or a `#[derive]` already guarantees (that `Clone` clones; that a getter returns what the setter just set with no logic in between), or exercises a *dependency's* behavior instead of your own. It lifts the coverage number and the confidence while being structurally unable to fail for any reason that matters — and every refactor pays to update a test that never could have caught a bug. Delete it, or rewrite it to assert a postcondition that *could* break. This is the silent twin of the happy-path mock: there the fake cannot fail, here the assertion cannot. **Exception — contract pins are not vacuous:** a constant encoding an *external* contract is worth pinning precisely because changing it is a breaking change you want caught — a type's layout/size for FFI (`assert_eq!(size_of::<Header>(), 16)`, §B25), a wire-protocol magic number or opcode, a serialized golden/snapshot (catches §B20 field-presence drift). "Does this still equal what the outside world depends on" is a real test; "does this constant equal itself" is not.
- `#[ignore]` left on a test "temporarily" to make the suite green. An ignored test is invisible to `cargo test` and rots silently — CI stays green because the test never runs. If a test must be ignored, gate it behind a named feature or document the re-enable condition.
- Tests that share mutable global state (a `static` cell, a fixed-name temp file, a hard-coded port, an env var) and pass only because of run order. `cargo test` runs tests in parallel threads by default; shared state makes them flake or clobber each other. Isolate per-test state (unique temp dirs/ports, `serial_test` for unavoidable globals).

**REQUIRED**:
- For async timing in tests, use `tokio::time::pause()` / `tokio::time::advance(Duration::from_secs(N))` — virtual time that the runtime under your control. Or use explicit synchronization (`tokio::sync::Notify`, `oneshot::channel`) signalled by the async work itself.
- Always pin `expected = "..."` substring in `#[should_panic(expected = "...")]`. The substring should be specific enough that a panic from elsewhere in the test setup does not coincidentally match.
- Every test asserts a postcondition involving the system-under-test's *observable* state — a return value, a side effect on a passed-in mock, a state transition in a fake — not just absence of panic.
- For non-deterministic systems, use `proptest` / `quickcheck` to generate inputs, and explicitly state the property being tested in the test name.

## §D1a. Oracle validity — *the test is green because the oracle is the code*

**The trap**: §D1 covers tests that assert too little; this sub-section covers tests whose *source of truth* is wrong. Three shapes: (1) **the circular oracle** — the test (or its fixture) was written by reading the implementation, so it pins current behavior, bugs included; values generated by the code can never disagree with it. (2) **the world-erasing stub** — an in-memory fake of an I/O trait that delivers each write as exactly one read: real TCP fragments, coalesces, and partially reads (§C4), so a framing bug that only manifests on a split length-prefix is structurally unobservable through the stub. (3) **no negative control** — nobody checked that the test *fails* when the fix is reverted or the bug reintroduced; a test that passes both with and without the change under test is not evidence for it.

**BANNED**:
- Golden/expected values produced by running the code under test and pasting its output ("snapshot-blessing" a brand-new implementation). Snapshots are valid for *regression* (pinning behavior already validated against an external reference) — not as the initial proof of correctness. The expected value must come from the spec, the reference implementation, a hand computation, or an independent oracle.
- An in-memory transport stub as the *only* test path for code whose correctness depends on transport realities: fragmentation/partial reads (§C4), interleaving, backpressure (§B14), peer stall/abort (§F3). The stub is fine for logic tests — it is banned as the sole evidence for framing/streaming code. Make the stub adversarial (split writes at every byte boundary; `proptest` over chunkings) or add one real-socket test.
- A bugfix PR whose test passes on the pre-fix code. Run the new test against the unfixed code once (mentally or actually); if it doesn't go red, it doesn't test the fix.
- Asserting *that* a collaborator was called (mock `.times(1)` and nothing else) where the contract is about *what* was passed or what state resulted — execution is not correctness.

**REQUIRED**:
- For every test, be able to name its oracle and the oracle's independence from the implementation: spec section, reference vector, hand-derived value, algebraic property (§F4). "The code's own output" is not on the list for new code.
- For stream/framing code: at least one test exercising adversarial chunking (write the encoded bytes one byte at a time; split the length prefix across reads).
- Negative controls where cheap: for a parser, invalid-input → `Err` cases (the decoder that never rejects); for a fix, the reproducer-turned-test that demonstrably failed before the fix (state it in the test's doc comment: `// red before <commit/fix>`).
- On review (audit mode): for each test backing a risky change, ask the counterfactual — *what mutation of the code would this test catch?* If the honest answer is "none that matters", report the test as non-evidence (same severity as the untested code path it pretends to cover).

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

## §D3. Test/prod divergence: build profile, scale, and concurrency

**The trap**: `cargo test` runs the **debug** profile, toy data sizes, and (per test) often a single task — production runs **release**, real sizes, and real concurrency. Each axis hides a bug class: debug-vs-release — integer overflow panics in test, silently wraps in prod, and `debug_assert!` guards vanish (**§B26** owns the fixes; §D3 is the testing-side enforcement, plus the two axes below); scale — an O(n²) (§E3/§C4), a recursion depth (§B7), an allocation pattern (§E2) invisible at n=10; concurrency — a TOCTOU (§B13) or lock-order inversion (§B9) that a single-threaded test can never interleave into existence.

**BANNED**:
- Relying on a test-suite pass as evidence about overflow/`debug_assert!` behavior of the release binary — the profiles disagree by default (§B26 has the fixes: `overflow-checks = true` in release, or per-site `checked_*`).
- Testing code documented to handle "large" / "unbounded" / "attacker-sized" input only at toy sizes. At least one test at the documented scale boundary (max frame size, max depth, the size that makes O(n²) visible — n=10⁴–10⁵ is usually enough to turn quadratic into a timeout).
- Testing concurrency-bearing code (shared map, lazy init, multi-lock) exclusively through single-task tests. Use `loom` for lock/atomic protocols (§B9/§B13), or at minimum a stress test with real task parallelism and a yield-heavy schedule.
- Letting per-test timeouts or `#[ignore]` quietly absorb a scale problem ("the big test was slow so it's ignored") — that is §D1's ignored-test rot plus a buried §E3 finding.

**REQUIRED**:
- Run the test suite in release at least in CI (`cargo test --release` as a separate job) when the crate does arithmetic on untrusted/accumulating values or uses `debug_assert!` for anything load-bearing — it is the cheap way to make the tested and shipped configurations overlap.
- One boundary-scale test per documented size limit; one adversarial-depth test per recursive parser (§B7).
- For code whose correctness claim is concurrency ("thread-safe", "lock-free", "concurrent map"), the claim defines the test: `loom` model or multi-thread stress — a single-threaded green suite is silent on the claim, not supportive of it.

---

## §E6. Measure before you spend — *The cost lives in the system under load, not in the line you are reading.*

- **The discipline**: §E1–§E5 are not a mandate to optimize everything — they are a map of where systemic cost hides. Two are worth fixing on sight: algorithmic complexity (§E3) and obvious waste `clippy::perf` flags (§E2). The rest is profile-gated: confirm the hot path before trading clarity for speed.
- **The tools**: a flame graph (`cargo flamegraph`, `perf`) for CPU; an allocation profiler (`dhat`, `heaptrack`) for §E2; `tokio-console` for async stalls and lock waits (§E1, §E4); `criterion` to prove a change is faster and guard against regression. Optimize what the profile shows, not what the diff looks like.
- **Lock the win.** When a measurement justifies an optimization, guard it with a `criterion` benchmark in CI that fails on regression — a one-time result becomes a standing invariant. Without it the next refactor silently gives the speed back, and a §E regression is as invisible to `cargo test` as any Tier B bug. Bench the few paths you actually optimized, not everything — that *is* this discipline, not a contradiction of it (a benchmark of cold or trivial code is its own coverage theater, §D1).
- **Leave it when**: always, until a measurement or clear algorithmic argument justifies the change. A micro-optimization on a cold path is the noise this document exists to prevent — the 🟡/🟢 discipline, applied to speed.
- 🟡 — the binding law of this tier.

---
