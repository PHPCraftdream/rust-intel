# Round 4 review of the latest commits — 2026-09-02 13:55 CEST

- **Range:** `7a567a6..d095250`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`, `d095250`
- **Reviewed state:** committed blobs only; the pre-existing dirty worktree was excluded
- **Verdict:** **REQUEST CHANGES**

There is no implementation commit after round 3. `d095250` adds only the round-3 report, so none
of that report's requested source corrections is closed in committed `HEAD`. A fresh module-by-module
pass confirmed all six round-3 P1 findings and found additional unsafe or false normative guidance.
The three research commits remain useful, but their accepted findings are still reports rather than
installed rules.

## Executive result

- Structural checks are green and the canonical/Codex copies are byte-identical.
- Green validation is not evidence of factual correctness: it accepts a README that still presents
  v0.5.0/58 categories and Tier C through §C11 while the package is v0.6.0/59 categories with §C12.
- The most serious new defects are an UB-prone `MaybeUninit` recipe, incomplete raw-pointer/FFI
  safety contracts, a false exactly-once claim for `OnceCell`, a `try_send` policy that drops the
  opposite message from the one documented, unsafe HashDoS advice for `foldhash`, and unbounded or
  cancellation-unsafe stream-reading remedies.
- The round-3 report is directionally correct about the series being incomplete, but it omits new
  review-ledger entries, contains an unsupported “broad redirect exemption” criticism, and records
  an `npm pack` digest that does not reproduce from the named commit under the current toolchain.

## New P1 findings

### P1 — `MaybeUninit` is paired with an API that cannot soundly fill uninitialized bytes

**Location:** `skill/unsafe-and-ffi.md:59`.

The rule offers `Box::<[u8]>::new_uninit_slice(N)` followed by `read_exact` as a sound example.
`Read::read_exact` accepts `&mut [u8]`; constructing that reference over uninitialized bytes already
violates the reference's validity requirements, and `Read` is safe to implement and may inspect the
buffer. Use initialized storage for `Read`, or an out-pointer API whose contract explicitly permits
uninitialized output. [`MaybeUninit` initialization contract](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html#method.assume_init_mut),
[`Read::read`](https://doc.rust-lang.org/std/io/trait.Read.html#tymethod.read).

### P1 — exported raw-pointer validation is presented as if it can prove pointer validity

**Locations:** `skill/unsafe-and-ffi.md:118`, `skill/SKILL.md:331`.

Null/alignment/length checks cannot detect a freed pointer, wrong allocation, aliasing violation, or
uninitialized pointee. A dangling aligned pointer passes every listed check. The Rust-visible entry
point also remains safely callable unless declared `pub unsafe extern "C" fn`. Require a `# Safety`
contract covering liveness, provenance, initialization, extent and aliasing, mirrored in the C API;
runtime checks cover only detectable value properties. [Rust undefined behavior reference](https://doc.rust-lang.org/reference/behavior-considered-undefined.html#dangling-pointers).

### P1 — `without_provenance` is included in a dereferenceable-pointer recipe

**Location:** `skill/unsafe-and-ffi.md:33`.

`without_provenance(addr)` deliberately creates a pointer without allocation provenance; a non-zero
sized dereference is UB even if the numeric address matches a live allocation. For tagged pointers
retain a base pointer and use `with_addr`/`map_addr`, or deliberately pair `expose_provenance` with
`with_exposed_provenance`. Reserve `without_provenance` for non-dereferenced sentinel/integer-like
pointers. [`without_provenance`](https://doc.rust-lang.org/std/ptr/fn.without_provenance.html).

### P1 — the claimed complete `from_raw_parts` invariant list is incomplete

**Location:** `skill/unsafe-and-ffi.md:34`.

The whole range must belong to one allocated object, and computing the end address must not wrap.
Two adjacent allocations can satisfy the current “consecutive initialized elements” wording but a
slice spanning them is still UB. Add both requirements to every `// SAFETY:` proof.
[`slice::from_raw_parts` safety](https://doc.rust-lang.org/std/slice/fn.from_raw_parts.html#safety).

### P1 — `OnceCell::get_or_init` is not attempt-level exactly-once

**Location:** `skill/concurrency-and-state.md:99`.

If the initializer is cancelled or panics, another caller may run it again. An external side effect
performed before cancellation can therefore happen twice even though only one completed value is
stored. Describe the guarantee as one active initializer and one successfully stored result; require
idempotence or separately supervised non-cancellable work for attempt-level exactly-once semantics.
[`OnceCell::get_or_init`](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html#method.get_or_init).

### P1 — `try_send` cannot implement “drop oldest”

**Location:** `skill/concurrency-and-state.md:129`.

On a full Tokio MPSC channel, `try_send(new)` returns `Full(new)` and leaves the queued old value in
place. Discarding the error's value drops the newest message, not the oldest. Drop-oldest requires a
receiver-owned eviction/coalescing design or a bounded queue that supports eviction.
[`Sender::try_send`](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html#method.try_send).

### P1 — randomized `foldhash` is incorrectly declared safe for untrusted keys

**Location:** `skill/data-and-types.md:32`.

Foldhash documents only minimal DoS resistance and explicitly excludes interactive attackers able
to infer state and construct collisions. Keep `std::collections::hash_map::RandomState` or another
hasher with an applicable adversarial-key contract at an untrusted boundary; restrict `foldhash` to
trusted keys. [foldhash security properties](https://docs.rs/foldhash/latest/foldhash/).

### P1 — `read_to_end` is an unsafe general remedy for short reads

**Location:** `skill/data-and-types.md:148`.

On a socket or other continuous stream, `read_to_end` can wait forever and append without a byte
limit until memory exhaustion. Use checked/capped framing plus `read_exact` for known lengths; for
EOF-delimited untrusted input require a byte cap, deadline/progress policy, and explicit over-limit
handling. Reserve `read_to_end` for bounded/trusted EOF sources.
[`Read::read_to_end`](https://doc.rust-lang.org/std/io/trait.Read.html#method.read_to_end).

### P1 — the example certifies an undefined `read_message` as cancellation-safe

**Location:** `skill/async.md:59-61`.

The example labels the read cancellation-safe without showing the implementation. A normal framed
`read_message` built on `read_exact` is not cancellation-safe: cancellation after a partial read
loses framing progress. Show a concrete persistent-buffer implementation or remove the unconditional
annotation. [Tokio cancellation-safety list](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety).

### P1 — per-read timeout guidance permits slowloris and framing corruption

**Locations:** `skill/semantics-and-conformance.md:69,76`, `skill/SKILL.md:383`.

A peer can send one byte immediately before every idle timeout and retain the task forever. Wrapping
`read_exact` in `timeout` is also cancellation-unsafe; retrying after partial progress corrupts the
frame. Require a whole-frame/handshake deadline or minimum progress rate, make timeout terminal for
the connection, or use cancellation-safe `read` into persistent framing state.
[`timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html).

## Accepted P1 gaps that remain non-normative

These are already supported by the research commits, but committed `HEAD` still does not integrate
them:

| Location | Open defect | Required integration |
|---|---|---|
| `skill/async.md:139,240` | Started `spawn_blocking` work cannot be aborted, contradicting the generic abort-and-await shutdown recipe. | Cooperative cancellation inside bounded chunks, bounded admission, or process isolation for hard termination. |
| `skill/async.md:303-322` | `#[instrument]` records arguments through `Debug` by default and can leak credentials/PII. | Require `skip(...)`/`skip_all` and explicit redacted fields. |
| `skill/drop-and-raii.md:13-16` | Raw `BEGIN`/`COMMIT` issued independently through a SQLx pool can run on different connections. | Use `pool.begin()` and execute every statement through the returned transaction/connection. |
| `skill/testing.md:23` | `serial_test` does not prove edition-2024 Unix environment mutation safe against other process threads. | Prefer subprocess isolation/`Command::env` or prove truly single-threaded access. |
| `skill/semantics-and-conformance.md:16,22,96-106` | A previous positional persisted schema is not treated as a conformance reference. | Golden bytes from supported releases plus versioning/migration before field/variant reorder. |

Sources: [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html),
[`tracing::instrument`](https://docs.rs/tracing/latest/tracing/attr.instrument.html),
[`std::env::set_var`](https://doc.rust-lang.org/std/env/fn.set_var.html),
[postcard wire format](https://postcard.jamesmunns.com/wire-format).

## Round-3 P1 findings still open

No committed source change follows `d095250`, so every prior P1 remains:

| Location | Still-open defect |
|---|---|
| `skill/security.md:92` | `QueryBuilder::push` is described as binding values; untrusted values require `push_bind`. |
| `skill/security.md:87` | Lexical write-path validation follows a pre-existing symlink outside the base. |
| `skill/security.md:58` | `black_box`/`inline(never)` are implied to rescue hand-written secret equality. |
| `skill/lifetimes-and-api.md:15,25,40,45` | §B1a's lifetime explanation, witness and separate-lifetime fix are invalid. |
| `skill/drop-and-raii.md:32` | Field order cannot close a sender before a custom `Drop` joins; ordinary handles detach. |
| `docs/reviews/correctness-audit-2026-08.md:97-99` | The report relies on unsupported `flatten` + `deny_unknown_fields` behavior. |

## P2 findings

### Security and FFI accuracy

| Location | Problem | Correction / source |
|---|---|---|
| `skill/security.md:37` | `Validation::default()` is said to accept the token's algorithm and `none` is treated as supported. Jsonwebtoken 11 defaults to HS256 and has no `None` algorithm variant. | Select the application's expected algorithm/family independently of the untrusted header. [Validation source](https://docs.rs/jsonwebtoken/latest/src/jsonwebtoken/validation.rs.html), [Algorithm](https://docs.rs/jsonwebtoken/latest/jsonwebtoken/enum.Algorithm.html). |
| `skill/security.md:40`; `skill/references/sources.md:175` | `.tls_certs_only(Certificate::from_pem(...)?)` does not type-check because the method expects an `IntoIterator<Item = Certificate>`. This also disproves `correctness-audit-2026-08.md:257` (“as written”). | Pass `[Certificate::from_pem(...) ?]` or a PEM bundle collection. [reqwest signature](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.tls_certs_only). |
| `skill/unsafe-and-ffi.md:35` | “Every extern function takes/returns `#[repr(C)]` types only” excludes valid primitives/pointers and still permits invalid aggregates containing `String`/DST fields. | Require recursively C-ABI-safe primitives, pointers, function pointers, and valid `repr(C)`/`repr(transparent)` aggregates. [Rust representations](https://doc.rust-lang.org/reference/type-layout.html#representations). |
| `skill/unsafe-and-ffi.md:113` | `*mut PanicInfo` is proposed for a caught panic, but `catch_unwind` returns `Box<dyn Any + Send>`; dropping the payload may itself panic. | Return a fixed `repr(C)` status and, if needed, a designed opaque error handle with a paired destructor. [catch_unwind](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html). |

### Async and concurrency

| Location | Problem | Correction / source |
|---|---|---|
| `skill/async.md:202` | “Wrap the stream in a Drop that drains” contradicts §B22: draining a receiver is asynchronous. | Provide an explicit awaited close-and-drain API. |
| `skill/async.md:207` | Direct `notified().await` is banned universally, although a stored permit makes the basic/single-consumer pattern valid; `enable()` is needed for the documented multi-waiter predicate race. | Scope the pin/enable/recheck recipe to that race. [Tokio Notify](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html). |
| `skill/async.md:258` | A debug panic in `Drop` is recommended; during unwinding it becomes a second panic and can abort. | Never panic from this guard; log/metric and enforce explicit close in tests/API design. [Drop panics](https://doc.rust-lang.org/std/ops/trait.Drop.html#panics). |
| `skill/async.md:187,252-253` | `Handle::block_on` and `futures::executor::block_on` runtime behavior is conflated. | Adopt the already-tested correction in `correctness-audit-2026-08.md:115-132`. |
| `skill/concurrency-and-state.md:42` | Blanket preference for Tokio Mutex contradicts Tokio's advice that ordinary mutexes are often preferred for short data-only critical sections not crossing `.await`. | Choose by whether the guard genuinely crosses `.await`. [Tokio mutex guidance](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html#which-kind-of-mutex-should-you-use). |
| `skill/concurrency-and-state.md:117` | A bounded producer rate is treated as sufficient justification for an unbounded queue; any sustained positive rate-minus-service gap grows forever. | Require a finite-total bound or a proved finite backlog envelope. |
| `skill/concurrency-and-state.md:128` | `N × size_of(message)` ignores transitive heap buffers and external resources retained by each message. | Budget worst-case retained bytes plus queue/reservation overhead. |
| `skill/SKILL.md:17`; `skill/concurrency-and-state.md:135-150` | Core claims Mutex-poisoning coverage, but the owning module contains no poisoning policy. | Add propagate-versus-validated-repair/reset guidance and `clear_poison`; never treat poisoning as a soundness guarantee. [Mutex poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html#poisoning). |
| `skill/concurrency-and-state.md:182` | The suggested `Mutex<BinaryHeap> + Notify` priority queue has no capacity policy and omits the multi-consumer lost-wakeup protocol. | Require a bound/full policy and declare single- vs multi-consumer semantics. |
| `skill/concurrency-and-state.md:90-91` | The TOCTOU ban includes a plain local `HashMap`, whose `&mut self` access already excludes concurrent mutation. | Scope the race to concurrent maps or separate lock acquisitions; recommend `entry` on a plain map for efficiency/intent, not atomicity. |

### Data, Drop, tests and API/SemVer

| Location | Problem | Correction / source |
|---|---|---|
| `skill/data-and-types.md:45,48,61` | Null-vs-absent collapse is limited to `Option<T> + #[serde(default)]`; derived plain `Option<T>` also treats missing as `None`. | Trigger on every derived Option field when the protocol needs three states. [Serde issue 2214](https://github.com/serde-rs/serde/issues/2214). |
| `skill/data-and-types.md:118,124` | `zip_eq` is said to establish equality, but a short-circuiting consumer can stop before the mismatched end and never panic. | Check `ExactSizeIterator`/slice lengths up front or fully exhaust. [zip_eq](https://docs.rs/itertools/latest/itertools/trait.Itertools.html#method.zip_eq). |
| `skill/data-and-types.md:111` | Full Unicode case folding is assigned to display text; it is for caseless matching and often needs normalization, while original text should be preserved for display. | Separate ASCII protocol matching, Unicode caseless matching, and display casing. [Unicode case mapping](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/). |
| `skill/drop-and-raii.md:11` | SQLx rollback-on-drop is called blocking; current SQLx synchronously starts/queues rollback for later connection progress. | Say library/backend-specific queued rollback; explicitly await rollback when completion/error matters. [SQLx source](https://docs.rs/sqlx-core/latest/src/sqlx_core/transaction.rs.html#265-279). |
| `skill/drop-and-raii.md:17` (contradicted by the qualified wording at `:32`) | “Rust drops in reverse declaration order” is overbroad: struct/tuple/array elements drop in declaration/index order; move-closure capture order is unspecified. | State each case and forbid capture-order shutdown contracts. [Rust destructors](https://doc.rust-lang.org/reference/destructors.html). |
| `skill/drop-and-raii.md:20-25` | Returning from `main` is implied to run all resource destructors, but static items are never dropped. | Require explicit shutdown/flush for resource-owning globals. [static items](https://doc.rust-lang.org/reference/items/static-items.html). |
| `skill/testing.md:61` | `pub(crate) mod test_support` cannot be accessed by integration-test crates or sibling workspace crates. | Use unit tests, a genuinely public feature-gated module, or a dev-only support crate. [Cargo integration tests](https://doc.rust-lang.org/cargo/reference/cargo-targets.html#tests). |
| `skill/testing.md:19`; `skill/SKILL.md:248,339` | Every exact comparison of computed floats is banned, although many operations have exact contracts. | Scope approximate comparison to accumulated rounding/platform math; retain exact/bitwise equality for exact contracts. [f64](https://doc.rust-lang.org/std/primitive.f64.html). |
| `skill/testing.md:90` | Every SLOW/TIMEOUT/stalled result is called a deadlock. | Treat it as an unresolved hang/latency failure; distinguish deadlock, livelock, starvation, blocking I/O and complexity. |
| `skill/lifetimes-and-api.md:81-88,95` | Enum-level `#[non_exhaustive]` does not protect field growth inside an existing struct variant. | Mark the variant non-exhaustive too or wrap its payload. [Cargo SemVer enum fields](https://doc.rust-lang.org/cargo/reference/semver.html#enum-fields-new). |
| `skill/lifetimes-and-api.md:99,105` | Every syntactic `pub` is called an external SemVer commitment, even beneath a private ancestor with no re-export. | Apply SemVer to externally reachable API; keep `unreachable_pub` for intent. [visibility](https://doc.rust-lang.org/reference/visibility-and-privacy.html). |
| `skill/SKILL.md:486-493` | Bare `cargo semver-checks` is said to catch a missing `#[non_exhaustive]`; additive `exhaustive_*_added` lints are allow-by-default and absence at introduction is not yet a baseline break. | Describe later-break detection accurately or enable the additive policy lints explicitly. [cargo-semver-checks v0.46](https://github.com/obi1kenobi/cargo-semver-checks/releases/tag/v0.46.0). |

### Dependencies, macros and audit workflow

| Location | Problem | Correction / source |
|---|---|---|
| `skill/deps-macros-ergonomics.md:98,102`; `skill/SKILL.md:223` | `cargo build --workspace` is treated as enabling dev targets/features; `--workspace` selects packages, not tests/examples/benches. | Name `cargo test`, `--tests`, `--examples`, `--benches`, or `--all-targets`; say resolver v2+. [cargo build targets](https://doc.rust-lang.org/cargo/commands/cargo-build.html). |
| `skill/deps-macros-ergonomics.md:104,111` | `serde = "1.0.200"` and `serde = "1"` are offered as duplicate linked versions, but requirements overlap and Cargo unifies them; `serde::Error` is not a concrete root type. | Use a truly incompatible pair such as rand 0.8/0.9; centralizing direct requirements cannot guarantee one transitive version. [Cargo resolver](https://doc.rust-lang.org/cargo/reference/resolver.html#semver-compatibility). |
| `skill/deps-macros-ergonomics.md:109` | Emitting only `cargo::rustc-cfg=internal` triggers the `unexpected_cfgs` policy the module requires, and custom cfg cannot toggle dependencies. | Also emit `cargo::rustc-check-cfg=cfg(internal)` and restrict this to crate-local compilation. [build-script cfg](https://doc.rust-lang.org/cargo/reference/build-scripts.html#cargorustc-cfgkeyvalue). |
| `skill/deps-macros-ergonomics.md:81` | Hard-coded `::serde` is called hygienic, but fails when the dependency is renamed. | Support a crate-path attribute, stable runtime re-export, or resolved dependency name. [Cargo renaming](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#renaming-dependencies-in-cargotoml). |
| `skill/audit-project.workflow.js:272` | §C5-§C11 source findings are declared caller-free complete evidence, contradicting the workflow's reachability rules. | Limit the exception to artifact/API-shape categories; source occurrences still need reachability analysis. |
| `skill/audit-project.workflow.js:336-377` | Grep-sampled coverage cannot discharge §B9's crate-global lock-order graph, yet orchestration may be complete with files unreviewed. | Inventory all lock acquisitions/call edges or explicitly mark §B9 unverified. |

### Semantic and repository/report integrity

| Location | Problem | Correction / source |
|---|---|---|
| `skill/semantics-and-conformance.md:83-87` | The early `?` example says owned `upstream: TcpStream` is leaked; it is dropped. The actual leak is unmatched registration/bookkeeping and possibly graceful protocol shutdown. | Name the exact invariant rather than a socket leak. [Rust destructors](https://doc.rust-lang.org/reference/destructors.html). |
| `README.md:7,207` | Public overview presents v0.5.0/58 categories and Tier C through §C11 while `package.json` is 0.6.0 and the skill has 59 categories plus §C12. | Add v0.6.0 status and update the architecture table; validate the live banner/table separately from historical release text. |
| `docs/reviews/README.md:1-17`; `docs/reviews/latest-commits-review-round-3-2026-09-02-1153.md` | Round 3 corrects several earlier reviews but `d095250` adds no ledger rows, defeating the ledger's stated purpose of preventing historical review prose from remaining authoritative. | Commit one disposition per corrected review with the report. |
| `docs/reviews/latest-commits-review-round-3-2026-09-02-1153.md:257` | The disposition criticizes a “broad redirect exemption,” but no detailed finding supports it and the source report's negative calibration requires both per-hop validation and DNS pinning. | Remove the claim or identify an exact faulty sentence and counterexample. |

## P3 findings

- `docs/reviews/latest-commits-review-round-3-2026-09-02-1153.md:279-280` records
  `sha512-/pZI…` for `npm pack` at `9a808f3`. A clean reproduction at that commit with Node
  24.12.0/npm 11.13.0 yields `sha512-nFpl…`. The old report did not record tool versions, so its exact
  artifact evidence is not reproducible. Pin/report Node and npm when the digest is used as evidence.
- `skill/data-and-types.md:121` says HashMap and HashSet both use last-wins duplicate semantics.
  HashMap keeps the last value; HashSet keeps one equal representative and a later `insert` does not
  replace it. [HashSet::insert](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.insert).
- `skill/data-and-types.md:143` requires surfacing every clone, contradicting the canonical
  yellow-tier policy to report only load-bearing/non-obvious cases.
- `skill/concurrency-and-state.md:169,173` first says Tokio MPSC silently fans to several receivers,
  then correctly says its receiver is not clonable. Bare Tokio MPSC is statically single-consumer;
  distribution requires another sharing/dispatch layer.
- `skill/concurrency-and-state.md:133` offers `Sender::capacity()` as one monitoring signal in the
  unbounded-queue discussion. It reports remaining permits only for a bounded sender and is
  unavailable on `UnboundedSender`; use receiver `len()` for queued-message count.
  [Sender::capacity](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html#method.capacity).
- `skill/semantics-and-conformance.md:70` should qualify `read() == Ok(0)` with a non-empty buffer;
  reading into `&mut []` also returns zero without EOF.
- `skill/lifetimes-and-api.md:45-46` and `skill/SKILL.md:460` broaden the two-call lifetime witness
  beyond the canonical multi-input rule; plain single-source reference returns do not need it.

## Commit-by-commit disposition

| Commit | Result | Round-4 disposition |
|---|---|---|
| `eca76bf` | **PARTIAL** | Useful routing, release and C12 fixes; several scope/default/tier defects remain. |
| `3bce0e1` | **PARTIAL** | Improves parity checks and triggers, but validators still miss public-doc drift and semantic catalog coverage. |
| `d1f3df6` | **PARTIAL** | Valuable accepted gaps; inventory is not auditable and findings remain non-normative. |
| `39afc18` | **REQUEST CHANGES** | The exhaustive correctness claim is disproved again by new UB, FFI, concurrency, data, test and API findings. |
| `9a808f3` | **PARTIAL** | Useful currency research; accepted current-API fixes remain unintegrated and some severities/facts remain inaccurate. |
| `d095250` | **PARTIAL** | Correct overall verdict, but incomplete ledger integration and new accuracy/evidence defects. |

## Coverage and verification

Each of the ten skill modules received an independent committed-blob pass: async, concurrency/state,
unsafe/FFI, data/types, security, Drop/RAII, dependencies/macros, lifetimes/API, testing, and
semantics/conformance. Findings were deduplicated against round 3; previously known issues are named
separately rather than presented as new. External claims above link to primary Rust, Tokio, Cargo,
Serde, SQLx, reqwest, jsonwebtoken, Unicode or crate documentation.

Checks run in a detached worktree at `d095250`:

- `npm run validate` — pass (`12` skill Markdown files, `2` fixtures);
- `node --check dev/validate.mjs` — pass;
- `node --check skill/audit-project.workflow.js` — pass;
- `git diff --check 7a567a6..HEAD` — pass;
- `npm pack --dry-run --json` — pass, `37` entries;
- Node `v24.12.0`, npm `11.13.0`;
- current clean-pack integrity:
  `sha512-nFpl5t81QUqp/Ij574O8lutK2dz+xpIk3fquiOldajrPH1xyaqAn3USHze6Lc0mbdh9VgvhtuObTXB6CPolZbQ==`.

These checks establish packaging and structural consistency only. They do not close the factual,
semantic, unsafe-invariant, or completeness findings above. The series remains unsuitable for a
“complete correction” claim until normative P1s are fixed, mirrored and regression-tested, while
report inaccuracies and the prior review ledger are corrected in their own documentation artifacts.
