# Rust Intel — Async (correctness, runtime, tracing, cost)

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §B2, §B3, §B8, §B11, §B15(a–e), §B21, §B22, §B23, §C3, §C9, §E1. Tier labels (🔴/🟡/🟢; A–E) and all cross-references are preserved verbatim.
> **Tiers in this module:** §B2 🟡 · §B3 🟡 · §B8 🟡 · §B11 🟡 · §B15a/c/d/e 🟡 · §B15b 🔴 (Pin::new_unchecked) · §B21 🔴 · §B22 🔴 · §B23 🟡 · §C3 🟡 · §C9 🟡 · §E1 🟡/🟢. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

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
- Run `cargo clippy` after writing async code touching locks. `clippy::await_holding_lock` is **warn-by-default** (it lives in the `suspicious` group), so the bare `cargo clippy` already emits it — the explicit `-W clippy::await_holding_lock` in the Post-flight command is belt-and-suspenders, not a requirement (and on a 1.50–1.60 toolchain it is *required* — see the version pin). It still has the ~30% catch-rate blind spots noted above, so clippy passing is not proof of absence.

**Related anti-pattern: Mutex poisoning cascade.** When a thread panics while holding a `Mutex`, the Mutex is "poisoned": all subsequent `.lock().unwrap()` calls panic too. LLMs copy `.lock().unwrap()` from std/serde examples without considering poisoning. One unrelated panic in production cascades into every code path that touches that Mutex.

- For non-trivial code, handle poison explicitly:
  ```rust
  let guard = mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  ```
- Or use `parking_lot::Mutex` (no poisoning by design) if poison-aware recovery is not needed.
- Decide a poison policy once for the codebase (`parking_lot::Mutex`, or an `unwrap_or_else(|e| e.into_inner())` helper); flag a bare `.lock().unwrap()` inline only where a poison cascade is a live concern, not on every occurrence — it is the most common mutex idiom in Rust and per-call annotation is the noise the inline-flag policy exists to prevent.

**Related anti-pattern: oversized critical section.** A `MutexGuard` held across I/O, heavy compute, logging, or any non-trivial operation creates contention even when it doesn't violate any rule. It compiles, tests pass, but production throughput collapses under load.

- The body of a `lock()` block should be: read/write a few fields, clone what's needed, drop the guard. Anything else (I/O, allocation, parsing, logging, format!) goes outside.
- If a critical section grows beyond ~10 lines, it's a candidate for restructuring.

## §B3. Async cancellation (invisible in signatures)

**The trap**: futures in Rust are cancellable at every `.await` point. Cancel safety is **not visible in any signature**. Borrow checker doesn't help. Clippy doesn't help. Documentation for each tokio function must be read individually (`AsyncReadExt::read` is cancel-safe, `read_exact` is not). In the 2026 field report, **zero** models across the timeout-using benchmark tasks spontaneously mentioned cancel safety; when asked directly, they answered "yes, it's cancel-safe" confidently and incorrectly in ~50% of cases.

**Critical warning about my own reasoning**: in empirical testing, approximately half of LLM-generated assessments of cancel-safety were *confidently wrong* — the model labeled a not-cancel-safe function as "cancel-safe because all `.await` points are idempotent" or similar plausible-sounding justifications. This is a known failure mode: I am especially prone to overconfidence in this area. **When I annotate a function as cancel-safe, I must enumerate every `.await` point and prove cancel safety for each, not assert it.**

**REQUIRED for every async fn that runs under cancellation** (per Operating mode step 5 — one documented to run under `select!`/`timeout`, or actually called from a `select!` arm or `timeout` body in this change; otherwise annotate only when the cancel-safety is non-obvious, and never for a trivial async fn with zero or one `.await` and no side effect on a losing path):
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

**Cancel-safety of the look-alike read/write methods (memorize — the names differ by one word and the safety flips)**:
- `write` / `write_buf` → **cancel-safe** (single-shot, equivalent to `poll_write`; on cancellation nothing was written).
- `write_all_buf` → **cancel-safe** (on cancellation the buffer is left partially advanced — resume from the remaining bytes; do *not* retry from scratch, a restart re-sends the already-written prefix).
- `write_all` / `read_exact` / `read_to_end` / `read_to_string` → **NOT cancel-safe** (a restart re-sends the already-written prefix / loses the partially-read data).

**Also cancel-UNSAFE**:
- `tokio::io::copy` — cancel-safety is not documented in tokio's `AsyncRead`/`AsyncWrite` cancel-safety guide; treat as unsafe pending explicit confirmation against the tokio version pinned in `Cargo.toml`.
- Anything that wraps the above (e.g., custom `read_message` that calls `read_exact` internally inherits the not-cancel-safe property).

**BANNED**:
- Calling a function with `db.write().await; send_ack().await` directly under `tokio::select!` or `tokio::time::timeout`.
- Claiming a function is "cancel-safe because all `.await` points are idempotent" without proving each one (idempotence is necessary but not sufficient; you also need atomic recovery from any partial state).
- `stream.next().then(|x| async move { ... .await ... })` — if the inner async block contains any `.await`, the entire chain is not cancel-safe: cancellation between `next()` resolving and the inner await completing loses the item from the stream.

## §B8. Silent task dropping (forgotten `.await`)

**The trap**: an `async fn` call without `.await` returns a `Future` that is never polled — meaning the work *never happens*. Compilation often passes (especially when the future is bound to `let _` or returned from a match arm where its `#[must_use]` is consumed), tests pass (the calling function returned without panicking), but the HTTP request was never sent, the database write never executed, the cache never updated. This is *uniquely silent* because nothing went wrong from the type system's perspective — the code is correct, the work simply wasn't performed.

**Why this happens**: LLMs sometimes generate `client.post(url).send()` instead of `client.post(url).send().await`. The reflex comes from sync-language patterns where calling the function executes it. In async Rust, the future is inert until polled.

**Prompt triggers**: "send a notification", "log this event", "fire and forget", "make an HTTP call after the response", any background-task framing.

**BANNED**:
- `let _ = some_async_fn(...);` — explicitly drops the future without polling.
- Calling an async function and not using the result, with no `.await` or `tokio::spawn`.
- `let _fut = async_fn();` followed by code that never `.await`s or spawns `_fut` — once the binding goes out of scope, the future is dropped without polling and the work never happens. Whether the type is `Pin<Box<dyn Future>>`, a chained adapter (`.map(...)`, `.then(...)`), the future produced by calling an `async ||` closure (stable Rust 1.85 — the closure returns a future that is itself inert until polled), or a plain `impl Future`, the rule is identical: a future that is dropped without polling does nothing.
- An `impl Future`-returning function whose return value is bound to a variable inside a non-`async` function and never awaited there. The compiler warns via `#[must_use]` / `unused_must_use`, but the warning is silenced if the future type is wrapped (e.g., in a tuple, in `Result::Ok`, behind an adapter that does not itself carry `#[must_use]`).
- `let (tx, rx) = tokio::sync::oneshot::channel();` followed by `let _ = tx.send(value);` (discarding the `Err(value)` returned when the receiver has been dropped) — the work that produced `value` is now invisible to the consumer side. Match the `Err` and either log it or propagate.
- `rx.await.unwrap()` on a `tokio::sync::oneshot::Receiver` (the receiver *is* a `Future` — you `.await` it directly, there is no `.recv()` method) when the producer task can fail or be dropped — `RecvError` becomes a runtime panic at a distance. Handle it explicitly as a failure mode.

**REQUIRED**:
- Every async function call is followed by `.await`, OR wrapped in `tokio::spawn(async move { ... .await })` for fire-and-forget, OR explicitly stored in a `JoinHandle`/`FuturesUnordered` for later polling.
- For fire-and-forget, **always** use `tokio::spawn` rather than letting the future drop silently.
- Enable `#[warn(unused_must_use)]` at crate level. Verify the `#[must_use]` warning fires for ignored futures in clippy output.
- For functions that return `impl Future`, ensure callers `.await` them — flag an uncalled future inline (at write time).

A spawned task that *did* run but produced a result the caller never observes is a different failure mode — see §B21 (`JoinHandle` drop ≠ abort).

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
- CPU-bound work long enough to starve the worker *and* infrequent enough that thread-handoff + the bounded blocking pool is worth paying — wrap in `tokio::task::spawn_blocking` (the ~100µs figure is a rough floor, not a trigger to offload every burst). For short, frequent bursts prefer `consume_budget`/`yield_now` (see below); for data-parallel CPU work prefer `rayon`. Do not substitute `yield_now` for genuinely blocking work.

**REQUIRED**:
- For genuinely CPU-bound work (compression, hashing, parsing large blobs, calling a sync C library, using a sync crate that has no async equivalent): wrap in `tokio::task::spawn_blocking(|| { ... }).await?`. This dispatches to a *separate* blocking-task thread pool, freeing the async worker thread for other tasks.
- The blocking pool is itself **bounded** (default `max_blocking_threads` = **512**). It is for *short* blocking operations: a task that blocks forever — a `loop { recv() }` actor, a permanent listener, a `std::sync::mpsc` drain — pins one of those threads for the process lifetime. Enough such tasks exhaust the pool, after which every new `spawn_blocking` *and* every `tokio::fs::*` call (those run on the same pool) **silently queues** in an **unbounded** queue waiting for a free thread (no backpressure — see §B14): latency rises and, if producers outpace drain, memory grows without bound. Long-lived blocking loops belong on a dedicated `std::thread`, not on `spawn_blocking`.
- `tokio::task::yield_now().await` is **not** an alternative to `spawn_blocking` for CPU-bound work. `yield_now` only gives *other tasks already on the same worker thread* a chance to make progress; when your task resumes, the worker is still occupied by you. It does not solve "starving the executor" because the worker count is fixed (typically the CPU core count). Use `yield_now` only for cooperative fairness inside an IO-bound task that occasionally does a small CPU burst.
- For modern tokio, `consume_budget().await` is the explicit *budget-aware* primitive: it yields *only when the task's coop budget is exhausted*, otherwise returns immediately. Prefer it to `yield_now` inside a tight async loop that wants to be cooperative without paying the unconditional re-schedule cost. Path note: the function lives at `tokio::task::consume_budget` through tokio 1.43, and moved to `tokio::task::coop::consume_budget` in **1.44.0** (the old path is `#[deprecated]` since 1.44.0). Use whichever path matches your pinned tokio.
- Verify with `tokio-console` or `tracing` spans that no task holds a worker thread longer than its budget.

## §B15. Advanced async pitfalls (AFIT, Pin, Waker, block_on)

A cluster of narrow but high-impact traps that appear in non-trivial async code. Each compiles in isolation; each fails in production or under composition. The body is split into five sub-categories below; references elsewhere to `§B15` cover all of them, and may name a specific sub-section (`§B15a`–`§B15e`) where the distinction matters.

### §B15a. Async fn in traits (AFIT vs RPITIT)

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
- Note each async-returning trait method inline (at write time), with the syntax used and whether `Send` is bounded.
- Never describe RPITIT as "AFIT with a Send bound" in source comments — pick the form deliberately (the desugar-vs-written-syntax reason is in the terminology note at the top of this sub-category).

### §B15b. Manual futures machinery (Pin, Waker)

**`Pin::new_unchecked` without justification**: `Pin::new_unchecked` is `unsafe` for a reason — it asserts that the pointee will never move again. LLMs reach for it when they don't understand `Pin` rather than as a justified low-level operation. If `Box::pin(...)`, `pin!` macro, or `pin-project` would work, use them.

- Default to `Box::pin(future)` (owning, heap-allocated, `Pin<Box<T>>`) or the `pin!` macro (borrowing, stack-allocated, `Pin<&mut T>`). LLMs frequently mix these up when adapting examples — they have different lifetimes and different ownership. State which one you mean.
- `Unpin` is an auto-trait. Most types implement it automatically, which makes `Pin<&mut T>` effectively free to use. Pinning discipline actually bites only for `!Unpin` types: hand-written futures with internal references, generator state machines, types explicitly opted out via `PhantomPinned`. The common LLM failure is conflating "this code involves a `Pin`" with "this type is `!Unpin`" — most of the time the `Pin` is incidental and Pinning rules add no real constraint.
- For projecting through `Pin`, use the `pin-project` or `pin-project-lite` crate, never manual `Pin::new_unchecked`.
- Every `Pin::new_unchecked` requires a `// SAFETY:` block proving the pointee is genuinely never moved (per §B5) — and the type must actually be `!Unpin` for the assertion to mean anything.

**Forgotten Waker in manual `Future::poll`**: when implementing `Future` by hand, returning `Poll::Pending` without first registering the current task's `Waker` causes the task to hang forever — nothing will ever wake it. The executor doesn't poll spontaneously.

- Before any `return Poll::Pending`, store `cx.waker().clone()` somewhere the underlying source will call on completion.
- Default to combinators (`async/.await`, `FutureExt`, `tokio_util::sync::PollSender`) rather than manual `Future` impls.
- If hand-rolling is unavoidable, write a comment naming who will call the stored waker and under what condition.

### §B15c. Sync↔async bridging

**`block_on` inside an async runtime**: `tokio::runtime::Handle::block_on` (or `futures::executor::block_on`) called from code already running inside a tokio runtime panics with "Cannot start a runtime from within a runtime". This happens when LLM writes a sync-looking helper that internally calls `block_on`, then invokes it from async code.

- Inside async code, use `.await`, not `block_on`.
- For running blocking/CPU-bound work from inside async, use `tokio::task::spawn_blocking` (separate blocking-thread pool) or `tokio::task::block_in_place` (runs blocking code on the current worker without starving sibling tasks — note this is for async-calls-blocking-code, *not* a sync-to-async bridge; you still cannot `.await` inside it without a `Handle`). **`block_in_place` panics on a current-thread runtime — it requires the multi-threaded runtime** (it works by handing the worker's other tasks to a sibling thread, of which a current-thread runtime has none). Since `#[tokio::main(flavor = "current_thread")]` and `#[tokio::test]` both default to current-thread, this panic is easy to hit; use `spawn_blocking` (works on both flavors) when the runtime flavor is not guaranteed multi-threaded. Never use nested `block_on`.
- If a helper function is shared between sync and async callers, prefer making the helper async and forcing sync callers to bridge explicitly.

### §B15d. `Stream` vs `Iterator`

**`Stream` vs `Iterator` — they are not interchangeable**: `Iterator::next(&mut self) -> Option<Item>` is synchronous; `futures::Stream::poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Item>>` is async and requires polling discipline. LLMs frequently write `for x in stream { ... }` (illegal — `Stream` does not impl `Iterator`) or call `.next().await` without importing the `StreamExt` extension trait.

- Use `futures::StreamExt` or `tokio_stream::StreamExt` to get adapter methods (`.next()`, `.collect::<Vec<_>>()`, `.map`, `.filter`, `.then`).
- For async iteration: `while let Some(x) = stream.next().await { ... }`, not `for x in stream`.
- Choosing the extension trait matters: `tokio_stream::StreamExt::next` returns the same shape as `futures::StreamExt::next`, but `tokio_stream` adds tokio-specific combinators (`.timeout(...)`, `.chunks_timeout(...)`). Pick one per module and stick with it.

**BANNED**:
- Dropping a half-consumed `Stream` without explicit acknowledgement that the buffered items are lost. For `tokio::sync::mpsc::ReceiverStream`, dropping the stream signals the sender side; for `BroadcastStream`, in-flight items are gone. Document the drop semantics or wrap the stream in a `Drop` that drains.

### §B15e. tokio sync / timing primitives

**BANNED**:
- `notify.notified().await` without first checking the condition the notification represents — wakeups can race with `notify_one()` and be lost. Simply creating + `pin!`-ing a `Notified` future does **not** arm it for wakeups; only `.enable()` (or the first poll) adds it to the notify list. The canonical lost-wakeup-free pattern:
  ```rust
  let notified = notify.notified();
  tokio::pin!(notified);
  notified.as_mut().enable();          // arms the wakeup BEFORE the check — closes the race
  if !condition() {
      notified.await;
  }
  ```
  The `enable()` call is load-bearing: it is what actually arms the wakeup before you inspect the condition, so a `notify_one()` that lands between the check and the await is not lost.
- `tokio::select! { ... }` without a `biased;` directive when arm-priority matters (e.g., shutdown signal must win over data-availability when both are ready). The default behavior is pseudo-random per poll, which surfaces as occasional starvation under load.
- `tokio::time::interval(period)` used as `loop { iv.tick().await; do_work().await; }` assuming the first `do_work` runs after `period`. The **first** `.tick().await` returns **immediately** (at creation time), not after one period — so the loop body fires once right away. Worse, the default `MissedTickBehavior::Burst` makes a delayed interval fire all missed ticks back-to-back to "catch up", producing a load spike. Compiles, passes a single-iteration test, surprises in production.
- `tokio::sync::watch::Receiver::borrow()` assuming it returns the latest *sent* value — a freshly created receiver's `borrow()` returns the **initial** value passed to `watch::channel(initial)` before any `send`. The initial value is marked **seen** at receiver creation, so `changed().await` on a fresh receiver is **pending until the next `send`** — it does *not* fire for the initial value. In a `while changed().await.is_ok() { let v = rx.borrow_and_update().clone(); ... }` loop, use `borrow_and_update()` (not bare `borrow()`) so each observed value is marked seen and you don't reprocess it. Note: this `while changed().await` shape **intentionally skips the initial value** (the first `changed()` pends until the next `send`); if the initial value must also be processed, use a do-while shape — `borrow_and_update()` once before the first `changed().await`.

**REQUIRED**:
- For arm-priority, use `tokio::select! { biased; _ = shutdown.notified() => ..., msg = rx.recv() => ..., }` — left-to-right priority is now deterministic.
- For "do X every N": either consume and discard the first immediate tick, or use `tokio::time::interval_at(Instant::now() + period, period)`, and set `MissedTickBehavior::Delay` (steady cadence) or `Skip` (drop missed ticks) explicitly rather than relying on the `Burst` default.

## §B21. `JoinHandle` semantics: drop ≠ abort

§B8 covers the case where a future is never polled and the work does not happen; this category covers the case where the work *does* happen but the spawning code can't cancel or observe it.

**The trap**: `tokio::task::JoinHandle::drop()` **does not abort the task**. The task keeps running in the background. LLM treats `JoinHandle` like a `std::thread::JoinHandle` from a sync mental model where "drop the handle" mostly means "detach" and the OS thread cleans itself up — but in tokio, the dropped handle leaks the task into the runtime's background pool, holding whatever resources it owns until it finishes. In tests this is invisible (short-running tasks complete before the test exits); in production this is a resource leak with the task continuing to consume connections, locks, file descriptors, and CPU.

**BANNED**:
- Dropping a `tokio::task::JoinHandle` without `.await`, `.abort()`, or an explicit "detached on purpose" comment. Default drop = detach (task keeps running, no way to cancel it from outside).
- Storing `JoinHandle`s in a `Vec` that is later dropped on a hot path without joining — leaks futures and any resources they hold (DB connections, file handles, network sockets).
- Treating `std::thread::JoinHandle` the same way: drop also detaches, but the OS thread does not share async-runtime cleanup; resources held by the thread (locks, files) outlive the dropped handle.
- Assuming a panic inside a spawned task is observable when the handle is detached. A panic in a task whose `JoinHandle` was dropped is **silently swallowed** — `JoinError::is_panic()` is reachable only by `.await`-ing the handle, which a detached task no longer has. The default panic hook prints the panic to stderr and the task ends; there is no propagation to the spawner, no error return, no recovery. If a spawned task's failure must trigger logic (alert, restart, shutdown), hold the handle and `.await` it (or use a `JoinSet`), or install an explicit reporting channel inside the task.

**REQUIRED**:
- If you spawn for fire-and-forget, document the intent at the spawn site: `// fire-and-forget: detached by design — task self-terminates within N seconds`. The comment is load-bearing — it tells the next reader that the missing `.await` is intentional.
- If you spawn for joinable work, hold the `JoinHandle` and call `.await` on it (or use `tokio::task::JoinSet` for fan-in across many tasks).
- For graceful shutdown, hold an `AbortHandle` (via `JoinHandle::abort_handle()`) and call `.abort()` on shutdown; then `.await` the `JoinHandle` to observe `JoinError::is_cancelled()`.
- Surface every `tokio::spawn(...)` whose returned `JoinHandle` is dropped (not held, not awaited, not detached-by-design) in the post-flight summary.

## §B22. `async Drop` is not real (yet)

§B4 covers synchronous RAII contracts (transactions, file handles, locks). This category covers what is **not** possible with `Drop` in async code — async cleanup must happen *before* the drop, not inside it.

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

This category is the `select!`-specific application of §B3. The general rule (`every .await is a cancellation point; side effects must survive cancellation or stay outside`) becomes sharper inside a `select!` because *every* arm except one is cancelled at the same instant.

**The trap**: a `tokio::select!` macro polls each arm concurrently and runs the body of *the first arm to become ready*; the other arms are **cancelled at their pending `.await` point**. If an arm contains a side effect (DB write, file flush, channel send, log emission) on the *losing* path — anywhere between the arm's first `.await` and the arm body — that side effect is broken by cancellation. The compiler is silent; tests pass when only one arm is ever ready in the test setup.

**BANNED**:
- `tokio::select!` arm that performs a side effect inside the arm's pending future (between the first `.await` and the future resolving) — at cancellation, the side effect is either half-done or not done, and there is no recovery hook.
- Pattern: `select! { _ = ch.send(x) => ... }` is **not** cancel-safe even on `tokio::sync::mpsc::Sender::send`. Per tokio's documentation: if `send` is cancelled in a `select!` arm, the message is **dropped and lost**. The future's resolution distinguishes "sent" from "cancelled-and-lost", but the data is gone either way. For cancel-safe channel send inside `select!`, use the two-step pattern: `let permit = ch.reserve().await?;` (cancel-safe — only acquires capacity, transmits nothing), then `permit.send(x)` (synchronous, infallible at that point). Other channel libraries (`flume`, `async_channel`, custom) require their own per-API verification.
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

## §C3. Async runtime and ecosystem coherence

**The trap**: mixing `async-std` types with `tokio` dependencies, or generating code that uses `tokio::fs` on `wasm32-unknown-unknown`. The compilation may succeed if features align, but behavior at runtime is broken.

**REQUIRED**:
- Verify the runtime once at the start (read `Cargo.toml`). Do not mix `tokio` and `async-std` in the same crate without explicit reason.
- For `wasm32` targets: no threads, no blocking I/O, no `tokio::time::sleep` (use `gloo-timers` or equivalent).
- For `#![no_std]` crates: no `String` or `Vec` without `extern crate alloc`; no `std::*` paths.
- For embedded with `embassy` or `embedded-hal-async`: do not mix with `tokio`-flavored APIs.
- `Pin<Box<dyn Future>>` is rarely the right answer — usually `impl Future` works. When using `pin_project`, use it correctly (the macro, not manual `Pin::new_unchecked`).

## §C9. `tracing` span leakage across `tokio::spawn`

**The trap**: `tracing::Span::current()` reads the *thread-local* current span. `tokio::spawn` moves the future to another worker thread, where the current span on entry is the runtime's default span — **not** the parent's. Logs and traces emitted from inside the spawned future are therefore detached from the parent's request context; correlation breaks; tracing dashboards show orphan spans with no parent.

**BANNED**:
- `tokio::spawn(async move { ... tracing::info!(...) ... })` inside a request handler with an active span, *without* `.in_current_span()` (from `tracing::Instrument`) — the spawned future runs outside the parent span.
- Reading `Span::current()` *inside* the spawned future body and expecting it to be the parent — by the time the future runs, the thread-local has been reset.
- Using `tokio::task::spawn_blocking` and assuming the parent span is preserved — `spawn_blocking` moves work to a separate blocking-pool thread; the span is lost there too.
- Storing per-request context in a `thread_local!`, writing it before an `.await` and reading it after, on a multi-thread runtime. This is the *general* form of the span hazard above (which is one instance of it): a task can migrate to a **different worker thread** at any `.await`, so the value read after the await belongs to *whatever other task last ran on the new worker* — or the thread-local default — not to this task. The corruption is silent (wrong request-id / tenant / locale / auth context propagated), compiles, and passes single-threaded tests. Use `tokio::task_local!` (the value travels *with the task* across awaits and thread hops) for per-task context; or confine the task to one thread via a current-thread runtime / `LocalSet` when a true thread-local is unavoidable.
- Logging PII through `{:?}` / `#[derive(Debug)]` / `tracing` fields — email, full name, phone, address, government ID, card number, IP. §B12 covers cryptographic *secrets* by field name, but PII is a separate compliance class (GDPR / PCI / CCPA): it compiles, tests pass, and the leak surfaces only in production logs at audit time. Classify PII fields and redact them (a redacting newtype, `tracing` field filtering, or skip via `#[derive(Debug)]` customization).
- Untrusted input logged via `tracing::info!("... {} ...", user_input)` or `format!`/`println!` passes raw control characters (ANSI escapes, newlines) through unescaped — only `{:?}` escapes them. Into a **plain-text or terminal** log sink this lets an attacker forge log lines, clear the terminal, or inject ANSI (a structured/JSON sink is largely immune). For values reaching such a sink as free text, log via `{:?}` or sanitize control characters, and keep the logging/subscriber stack patched against known log-injection advisories.

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
  Note this restores only the *span*. `tokio::task_local!` values do **not** travel into a `spawn_blocking` closure (it runs on a fresh blocking-pool thread with no task scope), so capture every `task_local`/request-context value (tenant, auth, request-id, locale) *before* the call and move it into the closure explicitly — otherwise the blocking body reads whatever context last touched that pool thread, the same silent corruption this category warns about.
- For nested spawns (a spawned task spawns another), repeat `.in_current_span()` at each spawn — the property is not transitive automatically without it.

## §E1. Serialism that need not exist — *Independent work done in sequence is latency you chose to pay.*

- **Where it shows up**: `let a = fetch_a().await; let b = fetch_b().await;` when a and b are independent — the second waits on the first for nothing. CPU-bound work (hashing, compression, parsing a large blob) inside an `async fn`, stalling the runtime worker. A data-parallel loop pinned to one core. A task spawned per tiny item, paying scheduler cost that dwarfs the work.
- **The cheaper move**: independent futures → `tokio::join!`/`try_join!` (concurrent on one task) — prove independence first; a shared `&mut` or lock makes them serial anyway. A dynamic set → `futures::stream::iter(..).buffer_unordered(N)` or a `JoinSet`, bounded (unbounded fan-out is §B14, not a speed-up). CPU-bound → `tokio::task::spawn_blocking` (mind the pool, §B11) or hand to `rayon`; data-parallel → `rayon`'s `par_iter`. Coalesce tiny tasks into batches.
- **Leave it when**: the awaits are genuinely dependent, the path is cold, or concurrency adds contention costing more than the serial latency saved. Concurrency changes cancellation — each branch must be cancel-safe (§B3).
- 🟡 — clippy won't see it; surface only on a hot / per-request path. Cross: §B3, §B11, §B14, §C8.
