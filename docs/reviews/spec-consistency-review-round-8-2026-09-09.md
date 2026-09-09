# Spec consistency review — round 8, 2026-09-09

Base: `7dd84c2`.

Scope: a bounded review of sharing, lock calls, reference-count observations,
cooperative coordination, single-flight eviction, channel delivery and shutdown
in `concurrency-and-state.md` and `drop-and-raii.md`, with core/source alignment.
This is not a complete database, advisory or every-schedule concurrency audit.
No subagents were used; fixes were made in the same pass.

## Findings and fixes

### P2 — read-only use did not establish the required sharing bounds

§A2 prescribed Arc without a mutex for read-only data and Arc plus a lock for
cross-thread movement. Neither follows from those descriptions alone.

A control read a Cell through `Arc<Mutex<_>>` on a worker; bare
`Arc<Cell<u32>>: Send` failed with E0277. A uniquely owned Cell moved to a worker
without either Arc or a lock. Fixed the rule to preserve type bounds and any
other required coordination, and to distinguish transfer from sharing.
[Arc thread-safety contract](https://doc.rust-lang.org/std/sync/struct.Arc.html#thread-safety).

### P2 — Arc/Weak lifecycle observations lost their preconditions

§B13's exactly-one extraction claim omitted the all-clones participation
condition. §B10 equated failed Weak upgrade with payload destruction and always
classified it as a normal non-error.

One participating `into_inner` call returned None, then an ordinary drop of the
retained clone destroyed the payload without extraction. With both clones
participating, one result was Some. A separate `make_mut` control dissociated a
Weak while its payload drop count remained zero. Fixed the conditions and made
missing-link handling follow the relationship's actual invariant.
[into_inner](https://doc.rust-lang.org/std/sync/struct.Arc.html#method.into_inner),
[make_mut](https://doc.rust-lang.org/std/sync/struct.Arc.html#method.make_mut).

### P2 — every function call under two locks was banned

§B9 banned holding two guards across any function call, even a helper proven to
acquire no locks or invoke callbacks. A control held two guards in one fixed
global order and called a pure `mem::swap` helper on their u32 values.

Fixed the rule to audit the transitive lock/reentrancy behavior and global order,
not treat the call expression alone as a defect. This does not exempt unknown
callbacks or establish arbitrary multi-lock code as deadlock-free.
[mem::swap](https://doc.rust-lang.org/std/mem/fn.swap.html).

### P2 — single-thread execution was mistaken for non-interleaving

§B13 described check/act as sound in single-threaded languages/tests. On a
current-thread Tokio runtime, two joined futures used separate RefCell borrows
around a barrier await: both computed the absent key, producing two invocations
and one final map entry. A shared OnceCell control produced one invocation.

Fixed the explanation, scoped banned patterns and core trigger to cover
cooperative future branches/reentrancy while preserving genuinely exclusive
check/act sequences. This is a semantic coordination race, not a memory data race.
[OnceCell task coordination](https://raw.githubusercontent.com/tokio-rs/tokio/tokio-1.53.1/tokio/src/sync/once_cell.rs).

### P2 — single-flight eviction protection started too late

§B13/B14 protected a currently running initializer, but not a requester that had
already obtained the old cell before starting initialization. Evicting that cold
entry allowed a new cell for the same key and two concurrent initializers.
The capacity guidance also needed to include pinned entries, not only results.

A local lease-based control acquired protection with lookup, prevented removal,
reused the cell and rejected a new key while capacity was occupied. After client
release, eviction and admission worked again. Fixed the rule to protect every
requester capable of initializing the old entry and bound total admission.
Terminal completed cells remain evictable when the supported API cannot restart
them; the local control is not offered as a production registry implementation.
[Per-cell initialization semantics](https://raw.githubusercontent.com/tokio-rs/tokio/tokio-1.53.1/tokio/src/sync/once_cell.rs).

### P2 — broadcast fan-out was presented as lossless delivery

§C8 recommended Tokio broadcast for an every-event/every-subscriber contract,
while §B14 did not clearly separate future lag mitigation from recovery of
already skipped events.

| Control | Observed result |
| --- | --- |
| Capacity-one broadcast; one fast and one slow receiver | Fast received both; slow got Lagged(1), then event 2 |
| Capacity-two broadcast; finite two-event input | Both receivers received both events |
| Full bounded mpsc with a retained pending send | Send waited; receiver obtained events 1 and 2 |

Fixed the distinction between competing consumers, fan-out and reliability.
Lossless use needs a no-lag proof or a suitable backpressure/replay protocol;
increasing capacity afterward does not recover an overwritten event. Existing
finite-envelope exceptions for unbounded queues were retained consistently.
[Broadcast lag semantics](https://raw.githubusercontent.com/tokio-rs/tokio/tokio-1.53.1/tokio/src/sync/broadcast.rs).

### P2 — cumulative counters were treated as live-resource gauges

§B13 required pairing every increment with a decrement. That is appropriate for
live resources, not a total-event counter or monotonic ID sequence.

A three-event control ended with total 3 and live count 0. Scoped the pairing
rule to acquisition/release accounting while retaining its RAII/error-path
requirement. The control used plain atomics, not an OpenTelemetry SDK.
[Counter versus UpDownCounter](https://opentelemetry.io/docs/specs/otel/metrics/api/#updowncounter).

### P2 — every nested panic during unwinding was described as an abort

§B4's unconditional formulation excluded a panic contained entirely by a catch
inside Drop. Under an unwind runtime, a destructor caught its literal-string
panic while an outer unwind remained active: both hooks ran,
`thread::panicking()` stayed true after the inner catch, and the outer catch
completed normally as Err.

Fixed the escaping-versus-contained distinction and retained payload, hook,
logging and abort-strategy caveats. Required cleanup is not silently skipped
merely because an outer unwind exists. No process abort was executed.
[Pinned panic runtime](https://raw.githubusercontent.com/rust-lang/rust/1.97.0/library/std/src/panicking.rs),
[catch_unwind](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html).

### P2 — channel EOF was tied unconditionally to dropping every Sender

§B4's sender-count statement did not distinguish explicit receiver close.
A Tokio control closed the receiver, drained its buffered value to None and
rejected a new send while Sender clones stayed alive. A pre-existing permit kept
another receive pending until released, after which it reached None too.

Fixed the separate shutdown paths and preserved permit accounting. Also
distinguished `Receiver::close()` from `Sender::closed()`, which observes closure
rather than requesting it. These controls used bounded state observations, not
a deliberately wedged thread.
[Receiver close and permits](https://raw.githubusercontent.com/tokio-rs/tokio/tokio-1.53.1/tokio/src/sync/mpsc/bounded.rs).

## Verification

- All final diagnostic assertions passed with rustc 1.97.0, edition 2024,
  Tokio 1.53.1, in both debug and release ordinary executables configured for
  unwinding. Follow-up runs used `cargo run --offline --locked` and `--release`.
- The invalid Arc sharing case was an expected E0277 compile-fail control.
  Barrier coordination and explicit future-state transitions replaced timing
  sleeps; no load benchmark, unsafe code or network-service experiment was added.
- `npm run validate` passed both phases: core checked 12 skill Markdown files;
  fixture validation reported 2 cases and **494 controls executed**. All rule,
  source and trigger edits were present; only this report's final verification
  and disposition text changed afterward. These tooling controls do not measure
  semantic audit coverage.
- Skill validation, mirror agreement (13 files) and `git diff --check` passed.
- No project/dependency versions or installer implementation were changed. No
  push or release was performed. Pre-existing `.githooks/` was left untouched.

All nine P2 findings are corrected within the stated scope; none is deferred.
The `skill-creator`
discipline kept the positive controls and contract-specific exceptions alongside
the failure cases, instead of turning each correction into another blanket ban.
