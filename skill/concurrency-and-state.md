# Rust Intel — Concurrency & Shared State (smart pointers, locks, races, channels, contention)

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §A2, §B9, §B10, §B13, §B14, §B17, §B19, §C8, §E4. Tier labels (🔴/🟡/🟢; A–E) and all cross-references are preserved verbatim.
> **Tiers in this module:** §A2 🟡 · §B9 🟡 · §B10 🟡 · §B13 🔴 (Relaxed-publish only; rest of body is 🟡) · §B14 🔴 · §B17 🟡 · §B19 🟡 · §C8 🟡 · §E4 🟡/🟢. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §A2. Smart pointer misuse (reflexive `Arc<Mutex<T>>`)

**The trap**: this is Tier A because the LLM reaches for `Arc<Mutex<T>>` *in response to a compile error* — "needs to be Send, needs to be shared, needs interior mutability" — and the resulting code compiles, runs, and passes tests. The defect that survives is **structural**, not functional: gratuitous lock contention, wrong concurrency model, false sense that a critical section exists, refactor cost when the read/write ratio later argues for `Arc<RwLock<T>>`, `arc-swap`, or `Arc::make_mut`-style copy-on-write. The reverse trap — `Rc<RefCell<T>>` chosen for "local mutability" and later forced across threads — is the same shape: the original compile-time fix locked in a structural choice that the rest of the program then has to bend around.

**REQUIRED**:
- `Arc` only when ownership is genuinely shared across threads or async tasks. Single-owner sharing → `&` or `&mut`.
- `Mutex` only when interior mutability is actually needed. Read-only shared data → `Arc<T>` is enough.
- For shared data that is **mostly read, occasionally swapped wholesale**, prefer `arc_swap::ArcSwap<T>` or rebuild-then-`Arc::new`-and-swap, not `RwLock`.
- For **copy-on-write semantics on a single-owner-most-of-the-time `Arc`**, use `Arc::make_mut(&mut arc) -> &mut T` (clones the inner only if `strong_count > 1`; if the `Arc` is unique but live `Weak`s exist, they are **dissociated** — `upgrade()` then returns `None` — and no clone happens: fine for COW, surprising for a `Weak` observer). Mirror: `Rc::make_mut` for the non-thread-shared analog. For `Cow<'_, T>` semantics on borrow-or-own returns, prefer `std::borrow::Cow`.
- `Rc`/`RefCell` that cross an `.await` reachable from a *multi-threaded* executor (`tokio::spawn` on the default runtime) are wrong — but the compiler already rejects them (`!Send`, an `E0277` outside this spec's scope). They stay perfectly legitimate in single-threaded-by-contract async (`tokio::task::spawn_local` / `LocalSet`) and in ordinary synchronous single-threaded code (parsers, AST/IR builders, local graphs) — do not flag those. The real rule: if the data must move across threads, use `Arc` + a lock from `tokio::sync` or `std::sync` per §B2; if unsure of the threading model, default to `Arc`.
- Boxing a small `Sized` scalar (≤ 2 × pointer size) *for the sake of boxing* is a smell — don't box `i64`, `Option<u32>`, or a small enum just to add a heap indirection. Legitimate reasons to box even a small `T` exist and are not the target of this rule: breaking a recursive type (`struct Node { next: Option<Box<Node>> }`), pinning a value to a stable heap address (`Pin<Box<T>>`, self-referential futures), or erasing behind `Box<dyn Trait>`. Box deliberately, not reflexively.

**BANNED**:
- `Arc<Mutex<T>>` where `T` is only ever read after construction. Use `Arc<T>` (or `ArcSwap<T>` if it must change).
- `Arc<RwLock<T>>` for write-heavy workloads. Profile first; `Mutex` is often faster.
- Cloning the inner `T` via `(*arc).clone()` when `Arc::make_mut` would be both cheaper (on the unique-owner path) and clearer.
- `Box::leak(Box::new(...))` to obtain a `&'static` for a global. It is an intentional, unrecoverable leak that grows on every re-init path (config hot-reload, repeated bootstrap, per-test setup). Use `OnceLock` / `LazyLock` (stable ≥ 1.80) for lazily-initialized globals.
- A `LazyLock::new(|| …)` / `OnceLock` init closure that can panic (reads env/file/network and `.unwrap()`s) poisons the cell: every later access panics, not just the first. Don't panic in lazy init — validate fallibly before, or store a `Result` and handle it at each access.
- `RefCell<T>` for a `Copy` (or replace-whole) interior where `Cell<T>` would do. `Cell` has no runtime borrow flag and so cannot trigger the §B17 `BorrowMutError` panic; reach for `RefCell` only when you need `&`/`&mut` into the interior.

## §B9. Lock ordering and ABBA deadlock

**The trap**: two locks (`Mutex<A>`, `Mutex<B>`) acquired in opposite orders in different code paths. Function `f1` locks A then B; function `f2` locks B then A. Single-threaded tests pass trivially. Multi-threaded production hits the classic deadlock: thread 1 holds A waiting for B, thread 2 holds B waiting for A, both wait forever.

**Why this happens**: LLMs treat lock acquisition as a local concern. The deadlock is a global property of the program's lock graph, invisible from any single function. No lint detects it.

**Prompt triggers**: "synchronize access to two shared resources", "lock the cache and the queue", "update state and metrics atomically", anything involving two `Arc<Mutex<_>>` in the same operation.

**REQUIRED**:
- For any code path that acquires more than one lock, **document the lock acquisition order** as a doc comment at the top of the module or function. State it in a comment LLM-readable enough that future generations of this file maintain it.
- Use a consistent lock ordering across the entire crate. Common conventions: alphabetical by name, by declaration order in the struct, by a numeric rank field.
- Prefer fine-grained immutable data + message passing (`mpsc`, `oneshot`) over multi-lock critical sections when possible.
- When two locks must be held, take them **in the documented order, every time, without exception**.
- For async code, prefer `tokio::sync::Mutex`. Deadlock *detection* is not automatic with this choice: `tokio-console` provides **visibility** (you can see which task holds which lock and which is waiting), not detection. Detection of cycles must be wired explicitly — `parking_lot::deadlock::check_deadlock()` for sync sections (requires the `deadlock_detection` cargo feature on `parking_lot`; the module does not exist without it), periodic graph audit of the documented lock-acquisition order for async sections. The async `Mutex` itself gives no deadlock signal on its own.

**BANNED**:
- Holding two locks across a function call (the called function may acquire locks in another order).
- Acquiring a second lock while holding the first if the second one's acquisition can block on async work or I/O.
- "Just try locking" patterns with `try_lock` to escape suspected deadlocks — that hides the design problem. This bans the *reflex*, not the technique: `try_lock` + backoff with a documented retry policy is a legitimate hierarchical-locking / backoff design; what is banned is reflexive `try_lock` as an escape from a deadlock you have not actually diagnosed.

**Detection**: add `tokio-console` for runtime visibility, or `parking_lot::deadlock` detection in dev builds (gated behind `parking_lot`'s `deadlock_detection` feature). Note each double-lock site inline (at write time).

## §B10. Reference cycles in `Rc`/`Arc` graphs

**The trap**: when LLMs build graph or tree structures with parent-child relationships, they reach for `Rc<RefCell<Node>>` (or `Arc<Mutex<Node>>`) and create *both* parent→child and child→parent strong references. This creates a reference cycle. Rust has no garbage collector. Memory leaks. Tests pass because functionality (insert, traverse, lookup) works correctly. Memory is never reclaimed; as the structure grows, RSS climbs steadily — an OOM in production rather than at test time.

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
- `if !map.contains_key(k) { map.insert(k, v); }` and any variation where check and act are separate calls — the same pattern via `HashMap::iter` + `HashMap::insert` is equally broken.
- `if map.contains_key(k) { let v = map.get(k).unwrap(); ... }` — between the check and the get, another thread could remove the entry, and `.unwrap()` panics.
- "Two-phase commit"-style patterns across separate operations on a concurrent collection.
- `let x = *counter.lock().unwrap(); *counter.lock().unwrap() = x + 1;` — read and write are separate critical sections, a thread can interleave.
- `if Arc::strong_count(&arc) == 1 { ... unique-owner logic ... }` — count can change between read and use under any concurrent code. Use `Arc::into_inner(arc)` (returns `Option<T>` if unique) or `Arc::try_unwrap(arc)` (returns `Result<T, Arc<T>>`); the atomic variant is the only check-and-act pattern that's race-free. Prefer `into_inner` over `try_unwrap(...).ok()` — discarding the `Err` arm reintroduces a drop-race on the last reference (std documents this); `into_inner` guarantees exactly one caller observes `Some`.
- `Ordering::Relaxed` on an atomic used to *publish* data to another thread (e.g. write the payload, then `flag.store(true, Relaxed)`; the reader does `flag.load(Relaxed)` then reads the payload). `Relaxed` establishes **no happens-before** edge, so the reader may observe the flag set before the payload writes are visible — a data race that x86's strong memory model usually hides in tests but that breaks on ARM/AArch64 under reordering. Use `Release` on the store and `Acquire` on the load (or `AcqRel`/`SeqCst` for read-modify-write) whenever the atomic guards access to other data.

**REQUIRED**:
- For synchronous "insert if absent": `map.entry(key).or_insert_with(|| compute_value())`. On a plain `std::collections::HashMap` the atomicity comes from the `&mut self` borrow (it is single-threaded — there is no internal lock); on a concurrent `dashmap::DashMap`, `entry` holds the shard lock across check and act. Either way the check and the act are one operation, not two.
- For an **async** compute that must run exactly once under concurrent load (the lazy-cache example this category opens with), `or_insert_with` cannot help — its closure is synchronous and cannot `.await`. Store a once-cell per key: `let slot = map.entry(key).or_insert_with(|| Arc::new(tokio::sync::OnceCell::new())).clone();` then `slot.get_or_init(|| async { expensive_fetch().await }).await` — only one task runs the fetch, the rest await the same cell.
- For `DashMap`: `dashmap::DashMap::entry(key).or_insert_with(...)`.
- For atomic counters: `AtomicUsize::fetch_add(1, Ordering::Relaxed)`, not lock-load-add-store.
- For "compare and swap" patterns: `Atomic*::compare_exchange` or `Atomic*::fetch_update`.
- For ordered iteration of map keys, use `BTreeMap` (sorted by key) or collect to `Vec` and `sort_by`. `HashMap::iter` order is randomized per-process and per-rehash; relying on it makes tests flake across machines.
- `Relaxed` is correct only for standalone counters/statistics where no other memory is published through the atomic. The moment the atomic gates visibility of other data, you need `Acquire`/`Release`. Don't blanket-`SeqCst` to "be safe" — it hides the wrong mental model and costs a fence; reason about the happens-before edge explicitly, and model-check multi-atomic code with `loom` (already in the post-flight list).

**Detection**: this is invisible to type checking and almost always invisible to tests. The defense is recognizing the pattern at write time. (Enforcement: the TOCTOU patterns here are 🟡 — recognized and fixed at write time; only the `Relaxed`-publish data race is 🔴 surface-always.) If a function does two consecutive operations on a shared collection, it is a candidate.

## §B14. Unbounded channels and backpressure neglect

**The trap**: when the producer/consumer rate is unbalanced, an `mpsc::unbounded_channel` doesn't block the producer — it just lets the queue grow. Tests with 5–100 messages pass. Production with a producer that's 2× faster than the consumer accumulates millions of pending messages, RAM climbs steadily, and the OOM killer eventually terminates the process — usually under peak load when it hurts most.

**Why this happens**: bounded channels force the producer to handle "channel is full" via `try_send`/`send` errors; `unbounded` has the simpler API and is the LLM's path of least resistance — the §C5 reflexive-fix pattern applied to channel selection.

**Prompt triggers**: "send events to a worker", "background queue", "log messages to a task", "producer-consumer", "event bus", "websocket broadcast", "metrics pipeline".

**BANNED** in any non-trivial pipeline:
- `tokio::sync::mpsc::unbounded_channel()` without explicit justification that the producer rate is provably bounded by an external invariant.
- `flume::unbounded()`, `async_channel::unbounded()` for the same reason.
- A `Vec` that is `push`-ed in a hot loop with no consumer or cap — same failure shape as an unbounded channel, different surface. `Vec::push` itself is fine (amortized O(1)); the failure is the missing drain or bound.
- Treating `tokio::sync::broadcast::error::RecvError::Lagged(n)` as a transient error to retry past. `Lagged(n)` means the receiver fell more than the channel's capacity behind the sender and **`n` messages are gone forever** — the receiver has already skipped to the oldest still-buffered message. A `match { Err(Lagged(_)) => continue, ... }` loop recovers nothing and silently masks data loss as a hiccup. On `Lagged`, log/metric the skipped count and decide explicitly whether dropping is acceptable or the consumer must be made faster / the buffer larger.
- `FuturesUnordered` (or `JoinSet`) grown by unbounded `.push()` with no cap — the same unbounded-growth hazard as an unbounded channel, just wearing a different type. Separately: an **empty** `FuturesUnordered` polled in a `select!` arm returns `Poll::Ready(None)` immediately, so a `loop { select! { x = futs.next() => ... } }` busy-spins at 100% CPU when `futs` is empty. Guard with `if !futs.is_empty()` or a fallback arm.
- A long synchronous step inside a `FuturesUnordered` / `buffer_unordered` loop body *buries* the sibling futures in the set — they are polled only when the set is polled, so external timeouts can fire spuriously and futures awaiting a shared semaphore inside the set can self-deadlock (holding permits while a queued item waits for one). Keep work that runs between polls short.

**REQUIRED**:
- Default to **bounded** channels: `tokio::sync::mpsc::channel(N)`. Size `N` from the actual constraints, not from a folk number: large enough to absorb the *expected producer burst over one consumer cycle*, small enough that `N × sizeof(message)` fits the per-task memory budget. If the right `N` cannot be reasoned about, that is a signal that the backpressure policy itself needs design before the channel is written. Never `unbounded`.
- Decide the **backpressure policy** explicitly: block the producer (default `send().await`), drop oldest (`try_send` with explicit drop), drop newest (`try_send` returning error → log and discard), or apply rate limiting upstream. State the choice in a comment.
- For broadcast scenarios where slow consumers shouldn't slow producers: `tokio::sync::broadcast::channel(N)` with explicit handling of `RecvError::Lagged` (which indicates dropped messages).
- For any unbounded queue that *must* exist (e.g., legacy interop): expose its size as a metric and alert when it grows abnormally.

**Detection**: unbounded channel growth doesn't appear in tests. Defense is at write time (default to bounded) and via monitoring (track `Sender::capacity()` or queue length as a metric in production).

## §B17. `RefCell` / `Mutex` runtime borrow panics

§A2 covers the thread-safety dimension of choosing smart pointers; this category covers the **single-threaded** reentrant-borrow hazard that `Rc<RefCell<T>>` introduces even when threading is not involved.

**The trap**: `RefCell` enforces borrow rules at runtime via panics. The borrow check is dynamic, not static — and the LLM writes call patterns that *can* reach a second `borrow_mut()` while the first is still live, but the test inputs never exercise the path. Compiles; passes tests at low fanout; panics in production the moment a callback chain or trait dispatch reenters the cell. The async-runtime mirror: `tokio::sync::Mutex` does not panic on reentrance, it *deadlocks* — the second `.lock().await` waits forever for the first guard, which is held by the same task.

**BANNED**:
- `Rc<RefCell<T>>` or `Arc<RefCell<T>>` for shared mutable state accessed through nested callbacks, closures, or trait-object dispatch where the call graph is not statically obvious. (`Arc<RefCell<T>>` is `!Send` + `!Sync`, so it does not compile *when sent across threads* — it is perfectly fine in single-threaded code; but `Arc<Mutex<T>>` with the same access pattern has the same logical defect, just expressed as a deadlock instead of a panic.)
- `cell.borrow_mut()` inside a scope that later calls into code (closure, trait method, observer notification, callback registration) that can re-enter the same `RefCell`. Even if the test path doesn't exercise the reentrance, the structural risk is there.
- Holding a `tokio::sync::MutexGuard` across an `.await` that ends up calling back into the same `Mutex` — guaranteed deadlock.

**REQUIRED**:
- For sync interior mutability accessed in tree traversal, observer notification, or callback chains, use `try_borrow_mut()` and handle `BorrowMutError` instead of unconditional `borrow_mut()`. The error path becomes a real recovery path, not a panic.
- Document the borrow-disjointness invariant at the *type* level: newtype with private field, public methods that guarantee non-overlapping borrows by construction. The invariant becomes a comment on the newtype, not a hope.
- For `tokio::sync::Mutex`, document a lock-acquisition order per §B9 — including "no method on this type calls back into self via another lock acquisition".

## §B19. Iterator invalidation through indirection

**The trap**: for a plain `&mut Vec<T>`, the borrow checker statically forbids iterating-while-mutating. The LLM writes the same pattern *through* a `RefCell`, through indices, or through `unsafe` raw pointers — and the borrow checker no longer sees it. Compiles, passes tests for small inputs, and corrupts state (or panics on `BorrowMutError`) once the loop body actually triggers the mutation under realistic input.

**BANNED**:
- Iterating `vec.iter()` (or `borrow.iter()`) while pushing/removing through a `RefCell<Vec<T>>` borrow on the same vector inside the loop body — the iteration sees an inconsistent snapshot and may dangle.
- `for i in 0..vec.len() { ... vec.push(...) ... }` — `vec.len()` is captured once at the start of the range; if the loop body mutates `vec.len()`, the loop iterates over the *old* length, missing or double-processing newly-inserted items.
- BFS/DFS that pushes children onto the same `Vec` it is iterating, indexed by `for i in 0..frontier.len()` — produces silent partial traversal.
- `std::mem::take(&mut field)` and `Option::take` leave a `Default` (`Vec::new()`, `None`, `0`) behind; `mem::replace(&mut field, new)` leaves the passed-in `new`. Either way the field no longer holds the original, so the "take it out, process, put it back" pattern silently loses the original contents if an early `return`, `?`, or panic happens between the take and the put-back. Restore on every path, or use a drop guard that puts the value back.

**REQUIRED**:
- For BFS/DFS with a growing frontier, use **two vectors** (`current`, `next`) and `std::mem::swap(&mut current, &mut next)` between layers, or `VecDeque` with disciplined `pop_front` / `push_back` and a captured *initial* layer length.
- For loops whose body must read the source after potentially-mutating it, snapshot first: `let snapshot: Vec<_> = vec.iter().cloned().collect();` then iterate the snapshot, then commit changes. The clone cost is the price of avoiding undefined behavior at the data-structure level.
- For index loops over mutating collections, re-read `len()` every iteration (`while i < vec.len() { ... i += 1; }`) and state in a comment why the loop is well-founded.

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

## §E4. Contention that serializes — *A lock is a queue; under load, the queue is your latency.*

- **Where it shows up**: `Arc<Mutex<T>>` reached for reflexively (§A2) where the data is read-mostly, swapped wholesale, or never actually shared mutably; a critical section spanning I/O, allocation, or `format!` (§B2); a single global lock where work shards cleanly per key/connection; a lock taken inside a hot loop; two atomics (or a lock and its payload) sharing one cache line (false sharing).
- **The cheaper move**: match the tool to the access shape — a plain atomic for a counter/flag (§B13); `arc_swap::ArcSwap` or `Arc<T>`+rebuild-and-swap for read-mostly config; `RwLock` only when reads truly dominate and the section is non-trivial; sharding (array of locks keyed by hash); a channel to hand ownership to one owner. Shrink every critical section to "read a few fields, clone what's needed, drop the guard." Pad hot independent atomics with `crossbeam_utils::CachePadded`.
- **Hasher by trust boundary**: the default `HashMap` hasher (SipHash-1-3, randomly seeded) is DoS-resistant, not fast. For internal, trusted keys — especially integer/small keys on a hot path — a faster hasher (`rustc_hash::FxHashMap`, `foldhash`, `ahash`) is a real win. For attacker-influenced keys the speed is a trap: a fixed-seed fast hasher reopens HashDoS (§B16). The trust boundary is the whole decision, not the benchmark.
- **Leave it when**: contention is unmeasured and the lock is held briefly on a cold path — a `Mutex` is often faster than an `RwLock` and clearer than a lock-free scheme.
- 🟡. Cross: §A2, §B2, §B13, §B16. Verify any new crate before adding — §A1.
