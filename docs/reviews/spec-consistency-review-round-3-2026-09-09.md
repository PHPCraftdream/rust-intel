# Spec consistency review — round 3, 2026-09-09

Base: `f52ea1b`.

Scope: a bounded review of async/cancellation, supervision and instrumentation
guidance, with the corresponding core trigger rows and lifecycle rules. This is
not an exhaustive review of every category, version pin or advisory. Prior-round
findings are not counted again.

## Findings and fixes

### P1 — argument skips did not protect instrumentation outputs

§C9 presented `skip`/`skip_all` as the remedy for secret-bearing arguments and
return/error values together. These controls suppress automatic argument fields
only. A `ret` or `err` event still records its value, and explicit `fields(...)`
can reintroduce skipped data. The example also described an email as non-sensitive
metadata despite the adjacent PII rule.

Fixed the rule and both relevant core rows to distinguish the three paths.
Output recording must be omitted or redacted through the formatter actually used
(`Debug` versus `Display`); approved literal metadata replaces the email example.
The rule accounts for `ret` recording only the `Ok` value of a `Result` and for
`err` recording the error.

Evidence: a custom recording subscriber on tracing 0.1.44 / tracing-attributes
0.1.31 captured synthetic secrets through each of these configurations:

| Attribute configuration | Observable recording |
| --- | --- |
| `skip_all, ret` | Return-value event |
| `skip_all, err` | Error event |
| `skip_all, fields(exposed = %secret)` | Explicit span field |
| `skip_all, fields(operation = "mint")`, no output event | Approved operation metadata; no synthetic secret |

The priority concerns the effectiveness of the security guidance. This was a
local diagnostic using synthetic values, not a production-secret incident.
[Instrumentation contract](https://docs.rs/tracing/0.1.44/tracing/attr.instrument.html).

### P2 — construction, polling and ownership were conflated

§B8 treated a missing local `.await` as lost execution even when a synchronous
factory returned the future to a caller. It also generalized async-body laziness
to all future-returning APIs. §B23 described every losing branch as cancelling
its underlying operation, including branches that merely borrowed a persistent
future.

Fixed the guidance to trace the actual consumer and owner. A synchronous factory
prefix can run at construction; a returned future can be correctly driven later.
Selection drops owned losing futures, while a borrowed future survives through
its owner. A disabled branch still evaluates its future expression, so its guard
does not suppress a factory prefix or argument side effects. The owner must
continue polling retained work; pinning alone does not schedule it.

Evidence on Tokio 1.53.1:

- An eager factory prefix ran while its unpolled lazy body did not.
- A forwarded lazy future completed when awaited by its caller.
- A disabled `select!` branch still executed the factory prefix.
- A borrowed losing future resumed successfully; the owned-loser control dropped
  its receiver, observed by a failed send.

[Rust async functions](https://doc.rust-lang.org/reference/items/functions.html#async-functions),
[Tokio selection lifecycle](https://docs.rs/tokio/1.53.1/tokio/macro.select.html).

### P2 — abort guidance assumed one terminal result and a syntactic yield point

§B21 prescribed a cancelled `JoinError` after abort, although normal completion
can win the race. It also described cancellation at the next `.await`, including
ready awaits that do not return control to the executor. Related lifecycle text
overstated every discarded handle or omitted async close as a resource leak.

Fixed the shutdown recipe to join the still-unjoined handle and handle normal
completion, cancellation and unwinding panic, without re-awaiting an already
consumed result. Cancellation is a request observed after the runtime regains
control. Graceful cleanup is distinguished from forced cancellation of disposable
work and from whatever synchronous `Drop` actually releases; `panic = "abort"`
is not described as a caught task panic.

Evidence: a current-thread runtime and oneshot handshake established completion
before abort; joining returned `Ok(42)`. A pending-task control returned a cancelled
`JoinError`, with its synchronous guard already dropped. A separate manual poll
crossed four ready awaits before reaching `Pending`. No timing sleeps were used
to establish these outcomes.
[JoinHandle::abort](https://docs.rs/tokio/1.53.1/tokio/task/struct.JoinHandle.html#method.abort),
[Tokio cancellation](https://docs.rs/tokio/1.53.1/tokio/task/index.html#cancellation).

### P3 — cooperative scheduling was described too narrowly

§B11 restricted `yield_now` to IO-bound tasks and claimed it only helped tasks
already on the same worker. The useful distinction is bounded cooperative chunks
versus a synchronous section that monopolizes the worker. Yielding is not
offloading, preemption, a promise about the next task, or guaranteed I/O progress.

Fixed both the offload recommendation and the yield explanation to retain those
boundaries and the measurement requirement. Evidence is Tokio's documented
non-guarantees; no CPU-load benchmark was run.
[yield_now](https://docs.rs/tokio/1.53.1/tokio/task/fn.yield_now.html).

## Verification and rejected candidates

- The standalone diagnostic passed with rustc 1.97.0, edition 2024, Tokio 1.53.1,
  tracing 0.1.44 and tracing-attributes 0.1.31; final execution used
  `cargo run --offline --locked` in an isolated temporary Cargo project.
- Repository core validation passed: 12 skill Markdown files checked.
- Skill validation, canonical/mirror agreement and `git diff --check` passed.
- The full 494-control fixture suite was not rerun for these prose corrections;
  its earlier successful run is not claimed as a new run on this change.
- The suspected `select!` randomization defect was rejected: in Tokio 1.53.1's
  macro source the starting index is selected inside `poll_fn`, so the existing
  per-poll description was not changed.
- The `write_all_buf` classification was retained: Tokio documents that the
  supplied buffer advances by exactly the partially written amount, supporting
  the spec's existing resume-from-that-buffer qualification.

All four findings are addressed within the stated scope. Sources, trigger
summaries and the generated mirror were updated together.
