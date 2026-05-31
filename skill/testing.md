# Rust Intel — Testing, CI & Measurement

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §D1, §D2, §E6. Tier labels (🔴/🟡/🟢; A–E) and all cross-references are preserved verbatim.

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

## §E6. Measure before you spend — *The cost lives in the system under load, not in the line you are reading.*

- **The discipline**: §E1–§E5 are not a mandate to optimize everything — they are a map of where systemic cost hides. Two are worth fixing on sight: algorithmic complexity (§E3) and obvious waste `clippy::perf` flags (§E2). The rest is profile-gated: confirm the hot path before trading clarity for speed.
- **The tools**: a flame graph (`cargo flamegraph`, `perf`) for CPU; an allocation profiler (`dhat`, `heaptrack`) for §E2; `tokio-console` for async stalls and lock waits (§E1, §E4); `criterion` to prove a change is faster and guard against regression. Optimize what the profile shows, not what the diff looks like.
- **Lock the win.** When a measurement justifies an optimization, guard it with a `criterion` benchmark in CI that fails on regression — a one-time result becomes a standing invariant. Without it the next refactor silently gives the speed back, and a §E regression is as invisible to `cargo test` as any Tier B bug. Bench the few paths you actually optimized, not everything — that *is* this discipline, not a contradiction of it (a benchmark of cold or trivial code is its own coverage theater, §D1).
- **Leave it when**: always, until a measurement or clear algorithmic argument justifies the change. A micro-optimization on a cold path is the noise this document exists to prevent — the 🟡/🟢 discipline, applied to speed.
- 🟡 — the binding law of this tier.

---
