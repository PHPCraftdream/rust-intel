---
description: Maps an error (rustc / clippy / panic / runtime anomaly) onto a rust-intel category and proposes a root-cause fix.
argument-hint: "<error message or behavior description>"
---

# /rust-cc-fix

Removes the developer's need to navigate rustc docs and StackOverflow. Takes a symptom — returns the cause, the fix, **and** a preventive rule so it doesn't recur.

## Arguments

- `$ARGUMENTS` — a `rustc` message, `cargo clippy` output, panic backtrace, or runtime-behavior description in natural language. May be multiline.

## Process

1. **Load the `rust-intel` skill.** If unavailable, emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.

2. **Classify the input:**
   - Compiler error (has `error[EXXXX]` or `error:` marker).
   - Clippy warning (has `warning: ... #[warn(clippy::...)]`).
   - Panic / runtime stack trace (has `thread 'main' panicked` or a backtrace).
   - Natural-language anomaly (deadlock, OOM, slow, intermittent flake).

3. **Request context when needed:**
   - For a compiler error — need the relevant source lines (or the file path). If neither is provided, ask. **Don't guess.**
   - For runtime symptoms — need `Cargo.toml` for versions and a repro scenario, if the category depends on either (§A1, §B4).
   - If context is insufficient, emit a blocking message in the spec's canonical form.

4. **Map to a category.** Use the routing table below — it is **only a router** (symptom → category number). The actual rule wording, BANNED/REQUIRED bullets, and remediation guidance live in the skill, never duplicated here. Whenever a new category lands in the `rust-intel` skill, extend this routing table accordingly. Table is non-exhaustive — when no row matches, read the spec's taxonomy directly.

   | Symptom | Category |
   |---|---|
   | E0433, E0432, E0425, E0412, E0405 | §A1 (project organization, API hallucination) |
   | E0277, E0308, E0599, E0407 | out-of-scope (compile-only — rustc's message is sufficient). But scan the reflexive "fix" for §A2 (reflexive `Arc<Mutex<T>>`), §A3 (`pub` to silence E0603), §C5 (`.clone()` to silence borrows) residue. |
   | E0277 with `Send` / `Sync` in the bound | §B2 / §B15 / §B18 — the missing-`Send` is usually a symptom of a guard held across `.await`, a Pin/RPITIT mismatch, or a manual `unsafe impl Send` that was wrong. |
   | E0596, E0594, E0502, E0499 | §C5 candidate (but check the ownership design first — don't slap `.clone()`) |
   | E0106, E0495, E0521 | §B1 (lifetime laundering / leaking) |
   | `clippy::await_holding_lock` | §B2 (but clippy catches ~30% — check hidden cases too) |
   | `clippy::clone_on_copy`, `clippy::redundant_clone` | §C5 |
   | `clippy::unwrap_used`, `clippy::expect_used` | §C2 |
   | `clippy::missing_safety_doc`, `clippy::undocumented_unsafe_blocks` | §B5 |
   | panic "Cannot start a runtime from within a runtime" | §B15 (block_on inside async) |
   | panic "cannot recursively acquire mutex" | §B9 (lock ordering / re-entry) |
   | panic "PoisonError" / `poisoned lock` | §B2 (poisoning cascade) |
   | Task hangs, `Poll::Pending` forever | §B15 (Waker not registered) |
   | Deadlock without panic, two threads waiting on each other | §B9 |
   | Steady-state RAM growth, OOM after days | §B10 (cycles) or §B14 (unbounded queue) |
   | Latency spike under load, executor starvation | §B11 (blocking executor) |
   | "Under load, `expensive_fetch` runs N times instead of 1" | §B13 (TOCTOU) |
   | "Compiles and works on x86/dev, but garbage/race on ARM/AArch64; data published via an atomic is visible before the payload write" | §B13 (`Relaxed`-publish — use `Release`/`Acquire`, or `AcqRel`/`SeqCst` for RMW; model-check with `loom`) |
   | "The message/request/write didn't happen but no error either" | §B8 (forgotten `.await`) |
   | Encrypt/decrypt works, but security review finds a vulnerability | §B12 |
   | `HashMap::get` returns `None` but the value was inserted | §B16 (Eq/Hash contract mismatch) |
   | panic `already borrowed: BorrowMutError` | §B17 (RefCell reentrant borrow) |
   | `unsafe impl Send` / `unsafe impl Sync` without SAFETY justification | §B18 |
   | `untagged` enum deserializes to wrong variant | §B20 (variant shape overlap) |
   | Task started but no way to cancel or observe completion | §B21 (dropped JoinHandle) |
   | "Resource didn't close" / connection pool exhausted | §B22 (async Drop is not real) |
   | `tokio::select!` arm side effect lost on cancellation | §B23 |
   | "Timing-based authentication vulnerability" / CVE-class | §B24 (constant-time comparison) |
   | "Panic crossed extern \"C\" boundary" / "process aborted in FFI" | §B25 |
   | `attempt to ... with overflow` panic (debug) / wrong result only in release | §B26 (integer overflow: debug-panic vs release-wrap) |
   | Numeric value wrong after a cast / `as` (`len() as u32`, `u64 as u32`) | §B26 (lossy conversion) |
   | `attempt to divide by zero` / `attempt to calculate the remainder with a divisor of zero` | §B26 (div/rem by zero) |
   | Duration looks wrong / negative / jumps; `.elapsed().unwrap()` panic | §B27 (wall-clock vs monotonic time) |
   | panic `byte index N is not a char boundary` | §B28 (UTF-8 string slicing) |
   | "string truncated mid-character" / non-ASCII corrupted | §B28 (char boundaries) |
   | "Channel kind wrong for runtime" / async-blocks-on-sync-channel | §C8 |
   | Tracing span missing in spawned task logs | §C9 |
   | Workspace member's feature unexpectedly enabled in release | §C10 |
   | `Deref` chain produces unexpected type / inheritance-style API breaks | §C11 |
   | Test passes locally, flakes on CI / `thread::sleep` in test | §D1 |
   | Test in `tests/` cannot compile after refactor | §D2 |
   | New test is green even with the fix reverted / on pre-fix code; snapshot blessed from a brand-new implementation | §D1a (oracle validity — the oracle is the code itself; add a negative control) |
   | Works in tests, breaks in prod: wrong arithmetic only in release, timeout only at real data sizes, race only under real concurrency | §D3 (test/prod divergence) — release-wrap → §B26, scale → §E3/§B7, interleaving → §B13/§B9 |
   | Own tests and round-trip green, but interop with the real peer / reference implementation / published vectors fails | §F1 (spec conformance — both halves share the same misreading; verify against the external oracle) |
   | Behavior contradicts what README/SECURITY.md/docs promise (token logged, untrusted input trusted, write not durable) | §F2 (documented guarantees — the doc, not the call graph, defines the boundary) |
   | Connection/FD/gauge leaks on error paths; a peer that connects and stalls pins a task forever; EOF busy-loop or peer never sees close | §F3 (boundary/error-path lifecycle; §B21/§B4 twins; no-timeout read on untrusted peer) |
   | `parse(display(x))` / `decode(encode(x))` corrupts data on special characters or boundary sizes | §F4 (round-trip law never tested over the domain — add the property test) |
   | Feature never activates, code is dead | §C7 (feature typo) |
   | Slow / high latency under load / high CPU / throughput collapses at scale | §E (systemic cost) — pick the law by shape: serial work → §E1, allocation → §E2, complexity/O(n²) → §E3, lock contention → §E4, recompute/Regex-in-loop → §E5; all under §E6 (measure first) |
   | Two sequential `.await`s / not parallel / CPU-bound stalls the runtime | §E1 (`join!`/`buffer_unordered`/`JoinSet`; `spawn_blocking`/`rayon` for CPU-bound) |
   | Too many allocations / high RSS / GC-like churn | §E2 (drop needless `clone`/`collect`/`format`; `with_capacity`, `Cow`/`&str`, reuse buffers) |
   | Works fast on small input, quadratic at scale | §E3 (accidental O(n²); wrong container) |
   | Lock contention / scales poorly across cores / `Mutex` hot | §E4 (atomics / `ArcSwap` / sharding) |
   | "Need a faster HashMap" | §E4 (hasher choice) + §B16 — pick by trust boundary: fast hasher for trusted input, DoS-resistant for untrusted |
   | Recompiles `Regex` / reparses every call / unbuffered I/O | §E5 (`LazyLock`; buffer I/O; reuse; lazy logging) |

   If the symptom maps to **multiple** categories, list them all and explain which is primary.

5. **Compose the answer:**
   - **Category(ies):** `§XN` referencing the paragraph.
   - **Real cause:** one or two sentences. Not a paraphrase of the symptom — why it arises in light of the spec's rule.
   - **Why the "obvious" fix is bad** (when one exists — especially §C5 reflexive `.clone()`).
   - **Right fix:** code or patch for the user's concrete example. If code wasn't shown — general form plus an explicit request to share the actual fragment.
   - **Preventive rule** from the spec in one line: what to add to the style/checklist so it doesn't recur.
   - **What to run after the fix:** the matching clippy lint / miri / tokio-console — from the Post-flight checklist.

## Answer format

```
## §XN — <category name>

**Cause.** <…>

**The "obvious" fix that's also bad.** <when applicable — e.g. for a borrow error: "just add .clone()", per §C5>

**Right fix.**
```rust
<patch>
```

**Preventive rule.** <one line from the spec>

**Run after.** `cargo clippy -- -W clippy.await_holding_lock` (for §B2), `miri` (for §B5), `tokio-console` (for §B11), etc.
```

## Behavioral principles

- **Root cause, not symptom.** "Just add `.clone()` to make it compile" is a forbidden answer; see §C5. First ask whether ownership can be restructured.
- **Don't guess versions.** If the fix depends on a version (`axum::Server::bind` disappeared in 0.7), request `Cargo.toml` — don't invent.
- **Acknowledge uncertainty.** The spec warns explicitly: ~50% of LLM cancel-safety assessments in empirical testing were confidently wrong (§B3). If the symptom touches cancel-safety, enumerate every `.await` point and prove — don't assert.
- **Don't restate the solution in disguise.** If you've already named the cause as §B2, don't recite its rules in full — reference.

## Limits

- Doesn't replace static analysis. If the user has lots of code and the location is unclear, redirect to `/rust-cc-audit`.
- Doesn't execute code. All fixes are textual suggestions; the user applies them.
