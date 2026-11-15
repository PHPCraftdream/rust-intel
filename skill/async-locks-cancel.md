# Rust Intel — Async: locks, cancellation, select

> Sphere of the **rust-intel** skill, group **Async** (until v0.8.0 the group was one module, `async.md`). Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This file holds the category bodies for §B2, §B3, §B3a, §B23. Sibling spheres of this group: `async-tasks-blocking.md`, `async-machinery.md`. Tier labels (🔴/🟡/🟢; A–F) and all cross-references are preserved verbatim.
> **Tiers in this file:** §B2 🟡 · §B3 🟡 · §B3a 🟡 · §B23 🟡. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §B2. `std::sync::Mutex` held across `.await`

**The trap**: LLMs default to `std::sync::Mutex` because it dominates training data. Holding it across `.await` violates tokio's contract and can deadlock under load. `clippy::await_holding_lock` catches only ~30% of cases (misses guards hidden in closures, `if let`, early-return blocks). The published field report is directional motivation for this failure shape, not a reproducible prevalence or causation measurement; the normative basis is Tokio's documented lock and `Send` contracts.

**BANNED** in any function annotated `async`, called from `tokio::spawn`, or used in a tokio runtime context:
- `std::sync::Mutex` / `parking_lot::Mutex` whose guard lives across a `.await`.
- `std::sync::RwLock` whose guard lives across a `.await`.
- `RefCell` or `Rc` anywhere reachable from async tasks crossing thread boundaries.
- Any live value that **owns or contains a `DashMap`/`scc::HashMap` map guard**, held across `.await` — the trigger is guard **ownership/liveness**, not a particular method call or binding shape, so the guard types below are examples for your pinned major, not an exhaustive definition, and the ban applies equally to a guard held inside a wrapper — `Option<Entry>`, `Option<Ref>`, `TryResult<RefMut>`, a struct/tuple field, a `match`-arm binding — not just a bare `let`-bound value. The guard-bearing types: DashMap direct-access `dashmap::mapref::one::{Ref, RefMut}` (`Ref` shared, from a read-style `get()`; `RefMut` exclusive, from `get_mut()`); DashMap mapped `dashmap::mapref::one::{MappedRef, MappedRefMut}` (from `.map()`/`.try_map()` on an existing guard — still holding the original shard guard); DashMap iterator items `dashmap::mapref::multiple::{RefMulti, RefMutMulti}` (`map.iter().next()` — a retained item holds the shard read guard exactly like a direct `Ref`); the DashMap entry family `dashmap::mapref::entry::{Entry, OccupiedEntry, VacantEntry}` (all exclusive: `entry()` returns the `Entry` enum itself and `try_entry()` returns `Option<Entry>`, and the live `Entry` value from either producer already owns the shard write guard *before* any `.or_insert*()` call converts it to a `RefMut`); and the scc family `scc::hash_map::{Entry, OccupiedEntry, VacantEntry, ReplaceResult}` (`VacantEntry` comes from the insert-on-absent path, and `ReplaceResult` wraps whichever of `OccupiedEntry`/`VacantEntry` a replace produced — retaining or destructuring either across an `.await` is the same hazard). The DashMap guard is a synchronous per-**shard** `RwLock` — invisible (no `lock()` token), and `clippy::await_holding_lock` does **not** catch it. The shared read guards (`Ref`/`MappedRef`/`RefMulti`) coexist with each other and block only a later exclusive acquisition on the same shard; the exclusive ones (`RefMut`/`MappedRefMut`/`RefMutMulti`, the entry families) conflict exactly like a `MutexGuard`. Holding one across an init `.await` deadlocks: a parked task pins a sync lock that no longer yields the worker; every other task touching *any* key on that shard blocks synchronously, and under runtime oversubscription all workers wedge. The same hold-across-`.await` hazard applies to `scc::HashMap`'s guard, sync or `*_async`, but the lock granularity is different — current `scc::HashMap` locks per-**bucket** (each entry access is serialized by the read-write lock in the bucket containing the entry), not per-shard, and separately exposes `*_async` methods that yield instead of blocking the worker; prefer those over holding the sync guard across an `.await` in the first place, and verify the locking model against your pinned `scc` version rather than assuming DashMap's shard model applies. The producer return types differ and matter when you name them: `entry_sync`/`entry_async` return the `Entry` enum, while `get_sync`/`get_async` return `Option<OccupiedEntry>` (not the `Entry` enum), `begin_sync`/`begin_async` and `any_sync`/`any_async` return `Option<OccupiedEntry>`, and `replace_sync`/`replace_async` return `ReplaceResult` — treat the method names as examples for your pinned major, not the trigger's definition. The `*_async` methods narrow the *thread-blocking* hazard, not the *deadlock* one: `get_async` still yields an exclusive `OccupiedEntry` for that bucket, and an `Entry` from `entry_async` owns the bucket lock before any `or_insert*` conversion — holding *that* guard across a **second** `.await` — e.g. an inner call that itself touches the same bucket, directly or through a helper — can self-deadlock exactly like the sync case, just by yielding forever instead of parking the OS thread. The fix is the same either way: clone what you need out of the guard (or store `Arc<OnceCell<T>>` per §B2's own REQUIRED bullet below) and drop the guard before the next `.await`. Note §B13 endorses `entry().or_insert_with()` for *synchronous* check-then-act atomicity only — that endorsement is void the instant an `.await` follows the guard.

**REQUIRED**:
- When the **guard itself must be held across an `.await` point** (not merely "the data is touched at some point across a series of awaits" — a short, synchronous, guard-dropped-before-`.await` critical section is the `std::sync::Mutex` bullet below, and §B9's mutex-choice bullet in `concurrency-locks-state.md`, not this one) → `tokio::sync::Mutex` / `tokio::sync::RwLock`.
- **REQUIRED for async lazy-init in a concurrent map:** store `Arc<OnceCell<T>>` (or `Arc<tokio::sync::OnceCell<T>>`) as the value; `Arc::clone` it **out** of the map and let the map's own guard — a DashMap shard `RwLock`, an `scc::HashMap` per-bucket guard (sync *or* `*_async`), or any other concurrent map's entry guard — drop *before* awaiting the initializer. The `OnceCell` provides the single-init serialization; the map's guard only needs to cover the insert, never the init.
- For data accessed only synchronously inside an async block → `std::sync::Mutex` is fine, but **the guard must be dropped before any `.await`**. Write the drop explicitly:
  ```rust
  let value = {
      let guard = mutex.lock().unwrap();
      guard.get(&key).cloned()
  };  // guard dropped here
  some_async_op(value).await
  ```
- Run `cargo clippy` after writing async code touching locks. `clippy::await_holding_lock` is **warn-by-default** (it lives in the `suspicious` group), so the bare `cargo clippy` already emits it — the explicit `-W clippy::await_holding_lock` in the Post-flight command is belt-and-suspenders, not a requirement (and the version pin notes the toolchains below this spec's floor). It still has the ~30% catch-rate blind spots noted above, so clippy passing is not proof of absence.

**Related anti-pattern: Mutex poisoning cascade.** When a thread panics while holding a `Mutex`, the Mutex is "poisoned": all subsequent `.lock().unwrap()` calls panic too. LLMs copy `.lock().unwrap()` from std/serde examples without considering poisoning. One unrelated panic in production cascades into every code path that touches that Mutex.

- Default: propagate the poison (`.lock().unwrap()` panicking forward, or `?` through a `Result`-returning wrapper) rather than reflexively recovering. If a thread panics between two writes that maintain a relational invariant (e.g. a balance and its ledger row, a count and the collection it counts), the protected state is left partially updated — recovering blind hands the very next caller a broken value with no signal anything is wrong.
- Recover via `into_inner()` only after validating (or rebuilding) that the protected state is actually consistent, done inside the recovery closure, then call `clear_poison()` (stable since Rust 1.77) so the mutex stops reporting poisoned:
  ```rust
  let guard = mutex.lock().unwrap_or_else(|poisoned| {
      let mut g = poisoned.into_inner();
      validate_or_repair_invariant(&mut g);   // must actually restore consistency, not just unwrap
      mutex.clear_poison();
      g
  });
  ```
  `unwrap_or_else(|poisoned| poisoned.into_inner())` with no validation step is not a safe general non-trivial-code pattern — it silences the panic and forwards whatever partial state the dying thread left behind.
- `parking_lot::Mutex` (no poisoning by design) does not repair a broken invariant — it removes the *signal*, not the corruption. It's a sound choice only when proof exists that **no protected invariant or state transition** — not just a multi-field one — can be left partially updated by a panic: a single `Vec`, an enum-modeled state machine, a balance, an index, or any other one-value abstraction can carry a load-bearing semantic invariant just as easily as a multi-field struct can, and a panic mid-mutation can leave any of them in an invalid intermediate state. Absent that proof, `parking_lot::Mutex` trades a loud panic for silent, undetected data corruption.
- Severity: report a recover-without-validation shape when the protected relation is safety-, money-, admission-, or durability-critical — a broken invariant there is a correctness incident, not just a crash; propagate by default, recover only with validation. For ordinary recoverable state (caches, counters, non-critical bookkeeping), where a stale-but-structurally-valid value is an acceptable trade-off, apply the policy at write time and do not report it.
- Decide a poison policy once for the codebase (propagate by default, or a validated `unwrap_or_else` + `clear_poison()` helper — not a bare `unwrap_or_else(|e| e.into_inner())`); flag a bare `.lock().unwrap()` inline only where a poison cascade is a live concern, not on every occurrence — it is the most common mutex idiom in Rust and per-call annotation is the noise the inline-flag policy exists to prevent.

**Related anti-pattern: oversized critical section.** A `MutexGuard` held across I/O, heavy compute, logging, or any non-trivial operation creates contention even when it doesn't violate any rule. It compiles, tests pass, but production throughput collapses under load.

- The body of a `lock()` block should be: read/write a few fields, clone what's needed, drop the guard. Anything else (I/O, allocation, parsing, logging, format!) goes outside.
- If a critical section grows beyond ~10 lines, it's a candidate for restructuring.
- Exception: do not shorten a critical section by moving the protected collection's elements out (`mem::take`, `drain`, `split_off`) and processing them after unlock when `unsafe` code elsewhere relies on where those elements live — the Linux `rust_binder` CVE-2025-68260 shape (`unsafe-core.md` §B5). Pop one element at a time under the lock instead.

## §B3. Async cancellation (invisible in signatures)

**The trap**: dropping a pending future ends polling of that future; whether it stops an underlying operation depends on the API and ownership (§B8/§B21). An `.await` is a potential suspension point, not a guaranteed yield: a ready child can complete within the same poll, and cancellation cannot preempt an ongoing synchronous poll. Cancel safety is **not visible in any signature**. Borrow checker doesn't help. Clippy doesn't help. Documentation for each tokio function must be read individually (`AsyncReadExt::read` is cancel-safe, `read_exact` is not). In the 2026 field report, **zero** models across the timeout-using benchmark tasks spontaneously mentioned cancel safety; when asked directly, they answered "yes, it's cancel-safe" confidently and incorrectly in ~50% of cases.

**Critical warning about my own reasoning**: in empirical testing, approximately half of LLM-generated assessments of cancel-safety were *confidently wrong* — the model labeled a not-cancel-safe function as "cancel-safe because all `.await` points are idempotent" or similar plausible-sounding justifications. This is a known failure mode: I am especially prone to overconfidence in this area. **When I annotate a function as cancel-safe, I must enumerate every `.await` point and prove cancel safety for each, not assert it.**

**REQUIRED for every async fn that runs under cancellation** (per Operating mode step 5 — one documented to run under `select!`/`timeout`, or actually called from a `select!` arm or `timeout` body in this change; otherwise annotate only when the cancel-safety is non-obvious, and never for a trivial async fn with zero or one `.await` and no side effect on a losing path):
- A doc comment line: `/// cancel-safe: yes` or `/// cancel-safe: NO — <reason>`.
- If not cancel-safe, justify by listing the await points where partial state would leak (DB write committed but ack not sent, file written but rename not done, etc.).
- Prove two separate properties, because cancellation has two outcomes. **Drop-and-recreate** (the caller retries by creating a fresh future — the `loop { select! { … } }` and retry-on-timeout shapes): the net effect of a dropped attempt plus the fresh one equals one run — the effect is idempotent, transactional with a proven rollback, or commit-observable before the retry (Tokio's criterion; §B23 applies it to `select!` arms). **Abandonment** (nobody retries): the partial state left at each `.await` is acceptable to the rest of the program, or something recovers it. Idempotence answers the first and says nothing about the second.
- If a function performs `db.write` then `network.send_ack`, it is **not cancel-safe**. Do not call it from `tokio::select!` or with `tokio::time::timeout` without wrapping in `tokio::spawn` to detach from the cancellation tree.

**Pattern for the not-cancel-safe boundary**:
```rust
// The connection state must be caller-owned across cancellation TOO, not
// just the framing buffer. The trap, one level past "read_exact is not
// cancel-safe": a `handle` that takes the `TcpStream` by value and calls
// `into_split()` INSIDE the cancellable future compiles and keeps `buf` in
// the caller, but cancelling that future mid-frame drops BOTH owned halves
// and destroys the connection — `buf` survives while the peer's next read
// returns EOF (probed on tokio 1.53.1: one partial byte in `buf`, EOF at the
// peer). `read` being cancel-safe makes the READ resumable; it does not keep
// a connection the future OWNS alive across the cancellation.
//
// Correct shape — split BEFORE the cancellable scope; the caller keeps both
// owned halves and the framing buffer for the whole session; the cancellable
// future only BORROWS the read half; the write half reaches the detached
// critical section through a shared handle at the commit point, so no
// cancellation path can drop either half:
//
//   let (mut reader, writer) = stream.into_split();  // BEFORE any cancellable scope
//   let writer = Arc::new(Mutex::new(writer));       // tokio::sync::Mutex — §B2 allows holding its guard across .await
//   let mut buf = Vec::new();
//   // timeout(.., handle(&mut reader, &writer, db.clone(), &mut buf)) may be
//   // cancelled repeatedly mid-frame; each cancellation drops borrows only,
//   // and the next call resumes on the SAME connection.
//
// (A read_message built on `read_exact` is still NOT cancel-safe — it
// inherits read_exact's property, see the look-alike list below; caller-owned
// state does not fix that.)
/// cancel-safe: yes (read is cancel-safe; halves + buffer are caller-owned —
/// this future only borrows; write+ack is detached via spawn at the commit
/// point)
async fn handle(
    reader: &mut OwnedReadHalf,          // borrowed — survives cancellation
    writer: &Arc<Mutex<OwnedWriteHalf>>, // shared handle — survives cancellation
    db: Arc<Db>,
    buf: &mut Vec<u8>,
) -> Result<()> {
    let data = read_message(reader, buf).await?;   // cancel-safe up to here
    // Critical section detached from caller cancellation; the write half is
    // SHARED into the task (Arc clone) at the commit point, never moved out
    // of the caller:
    let writer = Arc::clone(writer);
    tokio::spawn(async move {
        db.insert(&data).await?;
        send_ack(&mut *writer.lock().await).await?;
        Ok::<_, Error>(())
    }).await?
}

// Cancel-safe because its only await is `read` (cancel-safe per tokio: if a
// select! branch loses, no data was read) and the framing state lives in the
// caller-owned `buf`, not in this future — cancelling mid-frame keeps every
// byte already read. The same function built on `read_exact` would NOT be.
// The read side must be a MUTABLE AsyncRead — `AsyncReadExt::read` takes
// `&mut self`, so the old shared-`&TcpStream` shape does not compile; pass
// the `OwnedReadHalf` from `into_split()` by REFERENCE (or `&mut TcpStream`
// when the write side is not needed concurrently) — never own the stream or
// the halves INSIDE the cancellable future.
async fn read_message(reader: &mut OwnedReadHalf, buf: &mut Vec<u8>) -> io::Result<Bytes> {
    loop {
        if let Some(len) = try_frame_len(buf)? {  // complete frame buffered?
            let msg = Bytes::copy_from_slice(&buf[..len]);
            buf.drain(..len);                     // next call resumes here
            return Ok(msg);
        }
        let mut chunk = [0u8; 8192];
        let n = reader.read(&mut chunk).await?;   // cancel-safe
        if n == 0 {
            return Err(io::ErrorKind::UnexpectedEof.into());
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}
```

**Cancel-safety of the look-alike read/write methods (memorize — the names differ by one word and the safety flips)**:
- `write` / `write_buf` → **cancel-safe** (single-shot, equivalent to `poll_write`; on cancellation nothing was written).
- `write_all_buf` → **cancel-safe** (on cancellation the buffer is left partially advanced — resume from the remaining bytes; do *not* retry from scratch, a restart re-sends the already-written prefix).
- `write_all` / `read_exact` / `read_to_end` / `read_to_string` → **NOT cancel-safe** (a restart re-sends the already-written prefix / loses the partially-read data).

**Also cancel-UNSAFE**:
- `tokio::io::copy` — cancel-safety is not documented in tokio's `AsyncRead`/`AsyncWrite` cancel-safety guide; treat as unsafe pending explicit confirmation against the tokio version resolved in `Cargo.lock`.
- Anything that wraps the above (e.g., custom `read_message` that calls `read_exact` internally inherits the not-cancel-safe property).

**BANNED**:
- Calling a function with `db.write().await; send_ack().await` directly under `tokio::select!` or `tokio::time::timeout`.
- Claiming a function is "cancel-safe because all `.await` points are idempotent" without proving each one — idempotence settles the drop-and-recreate property (or one of its alternatives does), not the abandonment property; both are in REQUIRED above.
- `stream.next().then(|x| async move { ... .await ... })` — if the inner async block contains any `.await`, the entire chain is not cancel-safe: cancellation between `next()` resolving and the inner await completing loses the item from the stream.
- Assuming `tokio::try_join!` / `futures::try_join!` / `try_join_all` lets every branch finish: on the first `Err` the combinator returns and **drops the remaining branches mid-flight** — each is cancelled at whatever `.await` it had reached, so its side effects are partial (a half-written file, a message sent without its ack, a shutdown step skipped). Every branch needs the same cancel-safety proof as a `select!` arm (§B23). When each branch must run to completion regardless of the others' errors — shutdown and cleanup sequences above all — use `join!` and inspect the `Result`s afterwards, or spawn the branches and join their handles.

## §B3a. Coordinator loops need a circuit-breaker on persistent error

**The trap**: a leader/drain/flush loop — one task elected (via a `flushing`/`leader` flag) to drain a queue, flush a buffer, or sync a segment — retries a fallible op in a loop, completing the current waiters with `Err` but never *exiting* the loop. On a *transient* error that is correct. On a *persistent* one (dead segment, full disk, broken fd, poisoned downstream) it livelocks: one core spins re-attempting the dead path, the resource never recovers, and the leadership flag stays held so no fresh attempt can re-enter from a clean state. Tests pass because the test's injected failure is always transient (a one-shot mock error); production failures are not.

**BANNED**:
- A coordinator/leader loop whose only response to a write/sync error is to fail the current waiters and loop again — no exit, no backoff, no bound. Unbounded immediate retry of a persistently-failing operation is a livelock, not resilience.
- Releasing the leadership/`flushing` flag on the success path only, so an early `return`/`?` on the error path strands it set forever — the "leadership stranded" window. (A flag is a resource; this is §B4 RAII discipline applied to it.)

**REQUIRED**:
- On a write/sync error, **release leadership and return** (`flushing.store(false, Release); return;`) so the next attempt re-enters from a clean state instead of spinning on the dead path. Release the flag on *every* exit path — error included — with the same atomic-release discipline as the success path; an RAII guard on the flag (§B4) is the form that survives the next `?` someone adds. The election side must pair this with an `Acquire` (e.g. `compare_exchange(.., Acquire, ..)`), or the next leader may not observe the published clean state — §B13's `Release`/`Acquire` rule applies to the flag itself, not just the data it guards.
- `return` only *de-livelocks* if something re-triggers election (a fresh enqueue, the next tick, a waiting producer). If the loop is the *sole* driver, a bare `return` trades a visible busy-spin for a silent stall — the flusher is simply dead, and a silent stall is *worse* (no spinning core to notice). So on a *persistent* error, escalate it (log / alert / propagate to the owner), don't just return into silence.
- If retry *is* the intended recovery, bound it — cap the attempts or back off exponentially (`tokio::time::sleep`) **with jitter**, never a tight immediate loop. Deterministic backoff (`BASE * 2^attempt` with no jitter) satisfies "back off exponentially" *verbatim* yet still synchronizes every retrying instance into lockstep waves: after a shared dependency blips, N clients all retry at t+1s, t+3s, t+7s together — a self-inflicted thundering herd that re-knocks the recovering dependency over. Add full/decorrelated jitter to the delay (randomize within the backoff window, not a fixed `2^n`), and when the caller fans out to many instances add a *retry budget* (cap the fraction of traffic that may be retries) so a wave cannot amplify. This applies to any periodic reconnect/retry, not just this coordinator loop.

## §B23. `select!` arm side effects under cancellation

This category applies §B3 to `select!`: side effects must survive any actual cancellation boundary or remain outside it. Selection drops the losing futures it owns; a losing branch that only borrows an externally owned future leaves that future available to its owner. Identify which value is actually dropped before claiming cancellation or lost progress.

**The trap**: `tokio::select!` polls branch futures on one task and runs the handler for a selected ready output whose pattern matches. Dropping an owned losing future can abandon partial work (DB write, file flush, channel send); borrowing a persistent future can preserve that progress, as in the reservation example below. The compiler does not prove the operation's cancellation contract, and tests with only one ready branch miss the losing paths.

**Disabled branches still construct their futures.** A false `, if condition` prevents polling, not evaluation of that branch's future expression. A synchronous factory prefix or an argument expression can therefore perform side effects even for a disabled branch (§B8). Guard construction outside `select!`, or defer the work into an `async` body when polling is the intended gate; an enabled body still needs the cancellation discipline below.

**BANNED**:
- `tokio::select!` arm that performs an **unrecoverable, non-idempotent** side effect inside the arm's pending future (between the first `.await` and the future resolving) — at cancellation, the side effect is either half-done or not done, and there is no recovery hook. Not every side effect in that position qualifies, but **"atomic" alone does not exempt one**: `counter.fetch_add(1, Ordering::Relaxed)` is atomic (race-free) yet still not cancel-safe under Tokio's actual criterion — drop-and-recreate — because if the arm's future is dropped after the `fetch_add` already ran and the caller then re-creates the same `select!`/future to retry (the ordinary `loop { select! { ... } }` shape), the increment runs again: atomicity prevented a torn write, not a duplicate one. Use Tokio's own cancellation-safety criterion instead (docs.rs/tokio, `select!`'s "Cancellation safety" section): a side effect is cancel-safe in this position only if dropping the future *and creating a fresh one to retry* is a no-op or produces the same net result — i.e. it is genuinely **idempotent** (safe to redo with the same net effect, not merely safe from concurrent races), or it is **transactional** with a proven rollback, or the caller can **observe whether it committed** before deciding to retry. The finding is unrecoverable-or-duplicated partial progress specifically, not "a side effect exists here at all".
- Pattern: `select! { _ = ch.send(x) => ... }` is **not** cancel-safe even on `tokio::sync::mpsc::Sender::send`. Per tokio's documentation: if `send` is cancelled in a `select!` arm, the message is **dropped and lost**. The future's resolution distinguishes "sent" from "cancelled-and-lost", but the data is gone either way. For cancel-safe channel send inside `select!`, use the two-step pattern: `let permit = ch.reserve().await?;` (cancel-safe — only acquires capacity, transmits nothing), then `permit.send(x)` (synchronous, infallible at that point). Other channel libraries (`flume`, `async_channel`, custom) require their own per-API verification. `reserve()` protects **one** of two real cancellation properties and sacrifices the other: it preserves the **owned message** but not the sender's **queue position** — dropping the pending `reserve()` future (what a lost `select!` arm does) abandons the sender's place in the waiters queue, and re-creating it on the next iteration re-enters at the back, so under sustained contention a `loop { select! { ... ch.reserve() ... } }` can lose the race for every freed slot and starve that sender indefinitely — repeated cancellation starves the operation even though not one message was lost. When queue position/fairness matters, preserve the pending future outside repeated selection instead of re-entering with a fresh one each iteration:
  ```rust
  let reserve = ch.reserve();      // created ONCE — keeps its queue position
  tokio::pin!(reserve);
  let permit = loop {
      tokio::select! {
          p = reserve.as_mut() => break p?,        // same future re-polled every iteration
          _ = shutdown.notified() => return Err(...),
      }
  };
  permit.send(x);                  // synchronous, infallible at this point
  ```
  The same two-property distinction applies to fair lock/semaphore acquisition: tokio's `Semaphore` is documented fair ("permits are given out in the order they were requested"), and its `acquire` cancel-safety note says verbatim "cancelling a call to `acquire` makes you lose your place in the queue" (the same wording as `Notify::notified`) — so a cancelled `lock()`/`acquire()` future loses no value *and* its queue position; re-creating the acquisition future on every loop iteration can starve it the same way. Value preservation and queue position are two different, both-real cancellation contracts — state which one a design needs, and hold the future across iterations when position matters — **but only in a loop whose other arms never await anything that needs the same resource**: a held, started future that the task stops polling is the futurelock precondition (next bullet). The `reserve` loop above is safe only because its other arm returns without awaiting.
- **Futurelock — a started future that the task stops polling while it holds, or is queued for, a resource the same task then awaits.** Shapes: (a) `select! { r = &mut fut => …, _ = tick.tick() => { other.await } }` — a `&mut` (borrowed or pinned) branch is **not** dropped when another arm wins, and the winning arm's handler, or code after the `select!` while `fut` is still alive, awaits; (b) `timeout(d, &mut fut).await` followed by further awaits; (c) a `FuturesUnordered` / `buffered` / stream drain loop whose body awaits — members are polled only when the set is (§B14); (d) `poll!` / `now_or_never` on a future that is then kept. tokio's `Mutex` and `Semaphore` are fair and a bounded `mpsc` grants capacity to senders in order, so the released lock, permit or slot goes to the parked future — which nothing polls — and every later acquirer on that task waits forever: a permanent hang at 0% CPU with no panic and no log line. A timeout does not rescue it (Oxide RFD 609: "Using `send_timeout()` is not a mitigation" — the future has to be polled after the deadline in order to give up) and a larger channel only postpones it. Tests pass, because the hang needs the parked future to reach the head of the wait queue. Grounding: Oxide RFD 609 and the control-plane hang behind it (oxidecomputer/omicron#9259). REQUIRED: a task never stops polling a future it has started polling unless it drops it. Next to a `&mut fut` branch keep every handler synchronous, or spawn the work and select on its `JoinHandle` (RFD 609: "This construction cannot result in futurelock"); use a `JoinSet` rather than `FuturesUnordered` when the drain loop must await, pushing follow-up work into the set instead of awaiting it in the body; prefer `try_send` with error propagation to `send().await` inside such loops. `join!` / `join_all` are not affected — they keep polling every pending member.
- Side-effecting `async` helpers called from `select!` arms without a documented cancel-safety annotation per §B3.

**REQUIRED**:
- For every future that selection or its enclosing scope can actually drop while pending, prove cancellation safety at its possible suspension points: idempotent effects, proven rollback, commit-observable progress, or resumable state without duplication under §B3's drop-and-recreate test. Atomic race-freedom alone is insufficient. If a borrowed future survives selection, verify that its owner keeps driving it and honors its eventual completion/cancellation contract.
- Move side effects **after** the `select!` returns, on the winning branch only:
  ```rust
  let outcome = tokio::select! {
      r = pure_read(&mut stream) => SelectOutcome::Read(r?),
      _ = shutdown.notified() => SelectOutcome::Shutdown,
  };
  match outcome {
      SelectOutcome::Read(msg) => { db.write(msg).await?; ack.send().await?; }  // not cancellable by this select! (an outer timeout/abort can still cancel between the two awaits — §B3)
      SelectOutcome::Shutdown => { /* clean up */ }
  }
  ```
- If an operation must continue after selection moves on, retain and drive its future through an owner whose lifetime covers the operation, or spawn supervised work and keep its `JoinHandle` (§B21). Merely keeping a future pinned outside `select!` does not make it run in the background or survive the drop of that owner (§B8).
- When one arm of a `select!` inside a loop is a run-once future (a handshake, a first read) while the loop keeps ticking, carry a `done` flag and disable the arm on later iterations with the precondition syntax (`r = &mut op, if !done`), plus an `else => break` (or equivalent) for the case where every arm can be disabled — re-polling the completed arm future panics, and an all-arms-disabled `select!` without `else` panics too (§B15e).
