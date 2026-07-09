# Gap audit — concurrency correctness & resource-exhaustion/availability (2026-07-09)

Scope: what is **missing** from `skill/concurrency-and-state.md` (§A2, §B9, §B10, §B13, §B14, §B17, §B19, §C8, §E4) and `skill/async.md` (§B2, §B3/§B3a, §B8, §B11, §B15a–e, §B21, §B22, §B23, §C3, §C9, §E1) in the areas of thread/task exhaustion, connection/FD exhaustion, priority inversion, lock starvation, retry storms, unbounded caches, and cancellation-held locks. Both modules were read in full; adjacent bodies checked where a candidate could plausibly live elsewhere: §B7 (`unsafe-and-ffi.md` lines 42–56 — untrusted-size allocation, unbounded recursion depth) and §F3 (`semantics-and-conformance.md` lines 63–92 — error-path resource leaks, missing read deadlines, per-connection sibling tasks). Every "not covered" claim below cites the specific existing text it was checked against. No repo files edited other than creating this report.

---

## Gap 1 — Unbounded task/connection admission: `tokio::spawn` (or `thread::spawn`) per accepted connection/request with no concurrency cap

**In scope because**: the mitigation is a pure Rust-code pattern — `Arc<Semaphore>` + `acquire_owned().await` *before* `tokio::spawn`, permit moved into the task; or `std::thread::Builder::spawn` with a counted pool for the sync mirror. It targets exactly what this spec targets: compiles, tests with 5 clients pass, production with 50k concurrent clients OOMs or exhausts FDs.

**Not already covered — what was checked**:
- §B14 bans `unbounded_channel`, `flume::unbounded`, an uncapped `Vec` push loop, and "`FuturesUnordered` (or `JoinSet`) grown by unbounded `.push()` with no cap" (`concurrency-and-state.md` §B14 BANNED list). The accept-loop shape — bare `tokio::spawn` per connection, handle dropped, **no collection ever growing** — matches none of these bullets: there is no channel, no `Vec`, no `FuturesUnordered`. The unbounded resource is the *task/socket count itself*.
- §B21 covers the dropped `JoinHandle` (can't cancel/observe), not the *count* of spawned tasks; a spawn with a `// fire-and-forget: detached by design` comment fully satisfies §B21 while still admitting unbounded concurrency.
- §F3 (`semantics-and-conformance.md` lines 65–78) covers *leaked* resources on the error path and missing read deadlines on an already-accepted peer — an accept loop with perfect per-connection cleanup and timeouts still accepts without limit; §F3 has no admission-cap requirement.
- §B7 covers attacker-chosen *allocation sizes* (`with_capacity(n)`), not attacker-chosen *object counts* (N connections × fixed cost each).
- §E1 mentions "a task spawned per tiny item" only as scheduler *cost*, not as an exhaustion bound.

**Minimal compiles-but-dangerous shape**:
```rust
loop {
    let (stream, _) = listener.accept().await?;
    tokio::spawn(handle(stream));            // no cap: N sockets, N tasks, N buffers
}                                            // attacker sets N; tests never do
```
Known LLM-typical wrong fixes when asked to cap it (worth naming in the bullet): acquiring the permit *inside* the spawned task (tasks still unbounded — only the work is capped), or binding the permit in the accept loop without moving it into the task (dropped before the task runs).

**Sources**: tokio `Semaphore` docs, "limit the number of requests processed at a time … `acquire_owned` … move the permit into the task" — https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html ; tokio maintainers on FD limits ("tokio doesn't manage the fd limit for you … use a Semaphore") — https://github.com/tokio-rs/tokio/discussions/5091 ; worked example of the trap and both wrong fixes — https://artificialworlds.net/blog/2021/01/08/limiting-the-number-of-open-sockets-in-a-tokio-based-tcp-listener/ ; task-vs-work capping distinction — https://github.com/tokio-rs/tokio/discussions/2648 ; CWE-770.

**Suggested severity**: 🔴 when the accept/ingest source is untrusted-peer-extendable (same gating language §F3 already uses: "🔴 when peer-extendable"); 🟡 otherwise.

**Suggested placement**: new bullet(s) in §B14 (`concurrency-and-state.md`) — §B14 is already "unbounded growth" central and 🔴; extend its framing from "unbounded queues" to "unbounded admission" and cross-ref §F3/§B21. Add a trigger row: "accept loop", "handle each connection", "spawn per request" → §B14 + §F3.

---

## Gap 2 — Accept-error handling: `?` on `accept()` kills the server; log-and-continue on `EMFILE` busy-spins

**In scope because**: it is a two-line Rust-code decision (`match` on `accept()`'s `Err`, sleep before retrying resource errors) with a documented tokio contract, and the LLM default — `listener.accept().await?` in the accept loop — is exactly the shape training data over-represents.

**Not already covered — what was checked**: §F3 covers the *per-connection* error path (cleanup, EOF, deadlines), not the *listener's own* error path; §B3a covers a coordinator retrying a persistently-failing op (its cure is "release leadership and return"), which is the **opposite** of the correct move here — an accept loop must *not* return on a transient `EMFILE`/`ECONNABORTED`, and must not hot-retry either. Nothing in either module mentions accept-loop error taxonomy. Note the interplay: Gap 1's semaphore is also the *prevention* for this failure; this gap is the *handling* when the limit is hit anyway (other FDs, other processes).

**Minimal shape**:
```rust
loop {
    let (stream, _) = listener.accept().await?;   // one EMFILE → whole server stops accepting, forever
    ...
}
// or the "fix": Err(e) => { warn!(%e); continue; }  // EMFILE: listener still ready → 100% CPU spin,
//                                                   // kernel keeps completing handshakes into the backlog
```

**Sources**: tokio listener docs — "accepting a connection can lead to various errors and not all of them are necessarily fatal" with the match-don't-`?` example — https://docs.rs/tokio/latest/tokio/net/struct.UnixListener.html (same warning on `TcpListener`); `accept(2)` man page on pending-network-errors returned by accept and the retry guidance — https://man7.org/linux/man-pages/man2/accept.2.html ; https://github.com/tokio-rs/tokio/discussions/5091.

**Suggested severity**: 🟡 (write-time discipline; the failure needs environmental pressure to manifest).

**Suggested placement**: could live inside the same new §B14 "unbounded admission" text as Gap 1 (they are one story: cap admission; when the cap is breached anyway, classify accept errors — fatal vs transient-with-backoff) or as a bullet in §F3. Prefer §B14 to keep the accept loop in one place.

---

## Gap 3 — Insert-only keyed collections as caches/registries: unbounded growth on attacker-influenced or unbounded key cardinality

**In scope because**: the fix is Rust-code-local — a bounded cache (`lru`, `moka`, or capacity check + explicit eviction/TTL) instead of a bare `HashMap` — and the LLM prior ("a cache is a HashMap") produces the insert-only shape by default.

**Not already covered — what was checked**:
- §B14 bans unbounded *channels* and "a `Vec` that is `push`-ed in a hot loop with no consumer or cap". A `HashMap` cache **has** a consumer (reads hit it constantly) — the Vec bullet's "no consumer" framing does not match; the defect is *no eviction*, i.e. entries are immortal, not unread.
- §B13 covers the *race* in cache fill (`contains_key`+`insert`, `entry().or_insert_with`) and even endorses building the per-key `Arc<OnceCell>` map — without ever noting that the endorsed map itself grows forever if keys are unbounded.
- §B10 covers leaks via `Rc`/`Arc` *cycles*; an insert-only `HashMap` leaks with zero cycles.
- §B7 covers a single attacker-sized allocation; here each entry is small and honestly sized — the cardinality is the attack.
- §E4/Substitution catalog discuss map/hasher *selection* for speed, and §B16/§E4 cover HashDoS (collision *cost*), not memory growth.

**Minimal shape**:
```rust
static CACHE: LazyLock<DashMap<String, Response>> = LazyLock::new(DashMap::new);
async fn lookup(key: String) -> Response {              // key derives from request path/header
    if let Some(v) = CACHE.get(&key) { return v.clone(); }
    let v = fetch(&key).await;
    CACHE.insert(key, v.clone());                       // inserted forever; no eviction, no TTL, no cap
    v
}
```
Same shape wearing other names: per-IP rate-limiter maps, session registries, dedup sets, metrics label maps (high-cardinality), the §B13 per-key `OnceCell` map.

**Sources**: CVE-2026-33012 (Micronaut: unbounded `ConcurrentHashMap` cache, no eviction, attacker-influenced keys → OOM DoS, CVSS 7.5) — https://radar.offseq.com/threat/cve-2026-33012-cwe-770-allocation-of-resources-wit-0ddd6ec8 ; CVE-2026-41310 (OpenTelemetry .NET: unbounded endpoint cache keyed by span attributes, fixed by bounded LRU) — https://radar.offseq.com/threat/cve-2026-41310-cwe-770-allocation-of-resources-wit-cefddfea ; CWE-770/CWE-400. (Both grounding CVEs are non-Rust; the *pattern* is language-independent and the Rust mitigation crates — `lru`, `moka` — are mainstream. RUSTSEC-2022-0035 is the nearest Rust advisory but grounds §B7, not this.)

**Suggested severity**: 🟡; 🔴 when the key space is attacker-extendable (per-IP/per-header/per-path keys) — same peer-extendable escalation the spec already uses for §F3.

**Suggested placement**: new bullet in §B14 BANNED + one REQUIRED line ("any long-lived keyed collection needs a stated bound: LRU/TTL/cap, or a written argument that key cardinality is bounded by an internal invariant"), plus a warning line appended to §B13's `Arc<OnceCell>` REQUIRED pattern. Trigger row: "cache per user/IP/session", "remember which X we've seen" → §B14.

---

## Gap 4 — Client-side retry storms: retry loops without jitter (and without a retry budget) synchronize into a thundering herd

**In scope because**: the mitigation is code the LLM writes or omits at the retry site — full/decorrelated jitter on the backoff delay, a cap, a retry budget — e.g. `backoff`/`tokio-retry`-style policy or three lines of `rand` around `tokio::time::sleep`. LLM-generated retry helpers overwhelmingly produce deterministic `2^n * base` with no jitter.

**Not already covered — what was checked**: §B3a is the *server-side coordinator* loop (leader flag, drain/flush); its REQUIRED says "cap the attempts or back off exponentially (`tokio::time::sleep`), never a tight immediate loop" — **exponential backoff without jitter satisfies §B3a verbatim** and still produces synchronized retry waves across N clients when a shared dependency blips. The SKILL.md trigger row "retry, exponential backoff, retry with jitter" routes to §B3/§B14, whose bodies discuss cancellation mid-retry and retry-buffer growth — neither says a word about jitter, synchronization, or amplification. §B15e's `MissedTickBehavior::Burst` is the same *family* (synchronized catch-up spike) but is interval-specific.

**Minimal shape**:
```rust
for attempt in 0..MAX {
    match call(&client).await {
        Ok(v) => return Ok(v),
        Err(_) => tokio::time::sleep(BASE * 2u32.pow(attempt)).await,  // no jitter:
    }   // after a shared outage, every instance retries at t+1s, t+3s, t+7s — in lockstep
}
```

**Sources**: AWS Architecture Blog, "Exponential Backoff And Jitter" (simulation showing backoff alone does not decorrelate the herd; full jitter recommended) — https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ ; Amazon Builders' Library, "Timeouts, retries, and backoff with jitter" (retry budgets; jitter for all periodic work, not just retries) — https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ ; documented incident of the shape: Discord's March 2017 mass-reconnect thundering herd — https://hackernoon.com/the-thundering-herd-problem-taming-the-stampede-in-distributed-systems .

**Suggested severity**: 🟡 (systemic-availability cost, never locally visible; matches how the spec tiers §B3a).

**Suggested placement**: extend §B3a's REQUIRED backoff bullet ("…back off exponentially **with jitter** — deterministic backoff synchronizes every retrying instance into waves; add a retry budget when the caller fans out") — a one-bullet amendment, not a new category. Also add "reconnect on disconnect" to the trigger row.

---

## Gap 5 — `std::sync::RwLock` unspecified priority policy: read→(pending write)→read self-deadlock and platform-dependent starvation; tokio `RwLock`'s write-preferring mirror

**In scope because**: both hazards are documented library contracts, the code shape is common (reentrant read through a helper call while a writer waits elsewhere), and the failure is a *correctness* bug (deadlock/permanent starvation), not the §E4 throughput cost. Platform-dependence makes it the classic passes-on-dev-machine, hangs-on-Linux-prod bug.

**Not already covered — what was checked**:
- §E4 treats locks purely as *latency/queue cost* ("a lock is a queue; under load, the queue is your latency") and its RwLock line is "RwLock only when reads truly dominate and the section is non-trivial" — no fairness/starvation/deadlock semantics.
- §B9 covers **two-lock ABBA** ordering and `thread::scope`; this hazard needs only *one* lock.
- §B17 covers reentrance on `RefCell` (panic) and `tokio::sync::Mutex` (same-task deadlock) — it never mentions `RwLock` in either flavor, and the std-RwLock deadlock is a *cross-thread* interleaving (reader + waiting writer + same reader again), not §B17's same-task shape.
- §B2's guard-across-await and §B15e's `select!` starvation note are adjacent but distinct.

**Minimal shape**:
```rust
// Thread A                          // Thread B
let r1 = lock.read().unwrap();       let w = lock.write().unwrap();  // blocks behind r1
helper(&lock);                       // helper does lock.read() — on a writer-preferring OS
                                     // (e.g. glibc default policy varies) the second read
                                     // queues behind the waiting writer → A deadlocks with itself
```
The tokio mirror is *guaranteed*, not platform-dependent: `tokio::sync::RwLock` is documented write-preferring, so read → (another task requests write) → same task reads again always deadlocks.

**Sources**: std docs — "The priority policy of the lock is dependent on the underlying operating system's implementation, and this type does not guarantee that any particular policy will be used", with exactly this potential-deadlock example — https://doc.rust-lang.org/std/sync/struct.RwLock.html ; tokio docs — write-preferring fairness and the resulting read-write-read deadlock note — https://docs.rs/tokio/latest/tokio/sync/struct.RwLock.html ; rust-lang/rfcs#2674 on OS-dependent policy and writer starvation — https://github.com/rust-lang/rfcs/issues/2674 .

**Suggested severity**: 🟡 (write-time discipline: never acquire a second read on a lock you may already hold a read on; document read-reentrance-freedom the way §B17 already documents borrow-disjointness).

**Suggested placement**: new bullet in §B17 (it is precisely §B17's "reentrance through a non-obvious call graph" trap, third flavor: RefCell→panic, tokio Mutex→deadlock, RwLock→policy-dependent deadlock + starvation), with a cross-ref line in §E4's RwLock row.

---

## Rejected candidates (checked, no genuine gap)

**Priority inversion** — rejected as out of scope. On a normal-priority tokio/thread program there is no priority to invert; the hazard is real only under OS real-time scheduling (SCHED_FIFO, embedded RTIC/embassy priorities), where the mitigation (priority-inheritance mutexes, ceiling protocols) is an OS/RTOS configuration concern, not a portable Rust-code pattern this spec could ban or require. The general-purpose shadow of it — a slow/low-urgency task holding a lock a hot path needs — is already §E4 ("shrink every critical section") and §B2's oversized-critical-section anti-pattern. Forcing a bullet here would be quota-filling.

**Async cancellation leaving a lock permanently held** — rejected as not a real distinct hazard. When a `select!` arm loses or a `timeout` fires, the losing future is *dropped*, and `Drop` on a `tokio::sync::MutexGuard`/`SemaphorePermit` runs normally, releasing the lock — cancellation in safe async Rust is drop-based, so "guard held forever after cancel" does not occur (tokio Mutex docs: the lock is released when the guard is dropped, and dropping the future drops the guard). The real cancellation hazards at that point are partial *state* (already §B3/§B23, checked verbatim: §B23 "at cancellation, the side effect is either half-done or not done") and explicitly disabling the drop (`mem::forget(guard)`/`ManuallyDrop` — already banned in `drop-and-raii.md` §B4, checked: "silently disable the RAII release … lock guard never freed"). Nothing left to add.

**Unfair `Mutex` starvation as its own entry** — folded into Gap 5 rather than kept separate: `std::sync::Mutex` fairness is unspecified but tokio's `Mutex`/`Semaphore` are documented FIFO-fair, and the only *documented, reproducible* correctness contract worth a bullet is the RwLock priority-policy pair above. A generic "your mutex might be unfair under extreme contention" bullet has no BANNED/REQUIRED artifact and would violate the spec's own audit-the-artifact rule.

---

## Verdict

Of the eight initial candidates, **five survived** (unbounded task/connection admission; accept-error handling; insert-only keyed caches; jitterless retry storms; RwLock priority-policy deadlock/starvation — the last absorbing the generic lock-fairness candidate) and **three were rejected or merged** (priority inversion — out of scope for a non-RT Rust spec; cancellation-held locks — not a real hazard because drop-based cancellation releases guards, with the residue already covered by §B3/§B23/§B4; generic mutex unfairness — no auditable artifact, folded into the RwLock entry). The survivors cluster tellingly: the two existing modules are dense on unbounded *data* growth (§B14) and *leaked* resources (§F3, §B21) but have a blind spot for unbounded *admission* — object counts, key cardinality, and synchronized load — where each individual object is perfectly managed and the exhaustion lives one level up. None of the five requires a new numbered category; all fit as bullets/extensions in §B14, §B3a, §B13, §B17, and §F3, which keeps the spec's own no-quota-filling discipline intact.
