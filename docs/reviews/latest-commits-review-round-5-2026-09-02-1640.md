# Round 5 review of the latest commits — 2026-09-02 16:40 CEST

- **Range:** `7a567a6..eb3b1d3`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`, `d095250`, `eb3b1d3`
- **Increment since round 4:** `eb3b1d3` adds only the 276-line round-4 report
- **Reviewed state:** revision-qualified committed blobs only; the pre-existing dirty worktree was excluded
- **Verdict:** **REQUEST CHANGES**

No normative correction follows round 4, so none of its valid findings is closed in committed `HEAD`.
The new report is useful, but it contains one P1 that is already covered by the normative rules, an
over-broad `foldhash` correction, severity inflation, and a repeated review-ledger omission. A fresh
ten-module pass also found four additional high-priority defects that reach P1 under the load-bearing
contexts stated below and can lead to UB, corrupted state, failed shutdown, or resource exhaustion.

## Executive result

- Repository structure, mirror parity, syntax checks and packaging are green.
- Green validation still does not establish factual correctness; the committed README version/category
  drift identified in round 4 remains accepted by the validator.
- The highest-priority new fixes are: make the exported FFI destructor null/panic/ownership safe; remove
  unconditional poison recovery; stop calling task abortion graceful shutdown; and remove the false
  "hard timeout" implemented with a detached thread.
- Round 4's raw-pointer P1 should be retracted as a new coverage gap: its required caller contract and
  non-checkable relational invariants already exist elsewhere in the same module.
- The series is not a complete solution. It consists of partial normative changes followed by five
  review/research commits; the later reports describe required fixes but do not install them.

## New P1 findings missed by round 4

### P1 — the mandatory FFI destructor can invoke UB or abort the process

**Locations:** `skill/unsafe-and-ffi.md:106,114`.

The rules require a `drop_T` for every raw pointer/Rust-owned value and prescribe
`Box::from_raw(p)` without a null check. A borrowed/static return must not be freed, and a nullable C
call passes null to `Box::from_raw`. If `T::drop` panics, plain `extern "C"` does not unwind into C;
Rust aborts the process. The module's existing `catch_unwind` rule at `:113` covers panic-capable
entry points in general, but the prescribed destructor does not apply it. First classify a return as
borrowed/static or ownership-transferring.
Export a destructor only for transferred Rust allocations, accept null through a documented
`Option<Box<T>>` ABI or check a raw pointer, state the exactly-once/origin contract, and contain its
panic policy. Rust explicitly guarantees `Box<T>`'s C-pointer ABI for sized `T` and shows a nullable
`Option<Box<T>>` destructor. [Rust `Box` memory layout and FFI](https://doc.rust-lang.org/std/boxed/index.html#memory-layout),
[Rust ABI unwinding](https://doc.rust-lang.org/reference/items/functions.html#unwinding).

### P1 — poison recovery continues with potentially invalid state

**Location:** `skill/async.md:34-39`.

`unwrap_or_else(|poisoned| poisoned.into_inner())` is offered as the general poison policy. If a
thread panics between two writes that maintain a relational invariant, this silently releases the
partially updated value to the next caller. Propagate by default; recover only after validating or
rebuilding the protected state, then call `clear_poison()`. Absence of poisoning in `parking_lot`
does not repair an invariant. This is P1 when the protected relation is safety-, money-, admission-,
or durability-critical; it is P2 for ordinary recoverable state.
[Rust `Mutex` poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html#poisoning).

### P1 — `abort()` is described as graceful shutdown

**Location:** `skill/async.md:237-240`.

Aborting a task at an `.await` drops its future without allowing an asynchronous flush, acknowledgement,
or protocol close to finish. Graceful shutdown requires a cancellation token/message, cooperative
cleanup, and awaiting the task; `abort()` is an emergency fallback after a deadline. Tokio's own
shutdown guidance separates signalling from waiting for completion. This is P1 when the documented
graceful-shutdown guarantee protects durable data, protocol obligations, or externally visible state;
otherwise the terminology/API error is P2.
[Tokio graceful shutdown](https://tokio.rs/tokio/topics/shutdown),
[`JoinHandle::abort`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html#method.abort).

### P1 — thread plus channel is not a hard regex timeout

**Location:** `skill/data-and-types.md:33`.

Timing out the receiving side does not stop catastrophic backtracking in the worker. Dropping a
`std::thread::JoinHandle` detaches the thread, so repeated hostile inputs accumulate CPU-consuming
threads after callers have returned. Use an engine-native interrupt/match limit or a killable process;
otherwise keep untrusted matching on the linear `regex` engine and bound pattern/input size.
[`JoinHandle` detach semantics](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html).

## Corrections to the round-4 report

### Retract the raw-pointer P1 as a new coverage gap

**Report:** `docs/reviews/latest-commits-review-round-4-2026-09-02-1355.md:40-48`.

`skill/unsafe-and-ffi.md:23` already requires `pub unsafe fn` whenever the caller carries safety
obligations, while `:37-39` explicitly says liveness, provenance, initialization extent and aliasing
cannot be runtime-validated and require an upstream proof. The finding's principle is correct, but the
claimed missing discipline is present. At most, add an explicit cross-reference from `:118`; do not
count this as a new soundness gap.

### Narrow, do not reverse, the `foldhash` guidance

**Report:** `docs/reviews/latest-commits-review-round-4-2026-09-02-1355.md:88-95`.

The report correctly catches the unconditional phrase “fine for untrusted keys” at
`skill/data-and-types.md:32`, but its correction “restrict `foldhash` to trusted keys” is also too
broad. Randomly seeded foldhash documents minimal DoS resistance and excludes an adaptive attacker
able to study a long-running process. State that threat-model boundary; retain `RandomState` when the
attacker can observe/tune collisions, rather than rejecting every non-interactive untrusted-key use.
[foldhash security properties](https://docs.rs/foldhash/latest/foldhash/).

### Preserve conditional severities

**Report:** `docs/reviews/latest-commits-review-round-4-2026-09-02-1355.md:126-142`.

The “Accepted P1 gaps” heading promotes findings whose source audit explicitly rates them differently:

- `spawn_blocking` abort/timeout is yellow by default and red only when duration is attacker-influenced
  or a hard cancellation guarantee exists;
- `#[instrument]` is red for secret-bearing values, yellow for ordinary PII/payload volume, and clean
  for explicitly safe scalar arguments;
- raw `BEGIN`/`COMMIT` through a pool is a valid missing rule, not a source example at
  `drop-and-raii.md:13-16`, and its accepted audit rates it yellow;
- positional-format compatibility is red only at a persisted/wire version boundary.

Keep these findings, but restore their threat-model-dependent severities and identify the cited module
lines as missing integration locations rather than faulty examples.

### Round 4 repeats the ledger defect it reports

**Locations:** `docs/reviews/README.md:1-17`, round-4 report `:217`.

`eb3b1d3` corrects earlier review conclusions but adds only its report and no disposition row. That is
the same failure round 4 attributes to round 3, and it violates the ledger's rule that corrected review
prose must not remain authoritative. Add explicit round-3/round-4 dispositions and link the superseding
review.

## Additional P2 findings missed by round 4

### Unsafe/FFI

| Location | Defect | Required correction / source |
|---|---|---|
| `skill/unsafe-and-ffi.md:103` | `Box<T>` is blanket-banned at an exported Rust-to-C boundary, although sized `Box<T, Global>` has a documented single-pointer C ABI. | Allow the documented ownership-transfer case; keep raw C-shaped types for C-defined functions called by Rust. [`Box` FFI](https://doc.rust-lang.org/std/boxed/index.html#memory-layout). |
| `skill/unsafe-and-ffi.md:104` | `Box::from_raw` is limited to pointers produced by `Box::into_raw`, excluding valid Global-allocator allocations with the correct layout and initialized `T`. | State the actual allocator/layout/alignment/validity/exclusive-ownership contract; retain `into_raw` as the preferred source. [`Box::from_raw`](https://doc.rust-lang.org/std/boxed/struct.Box.html#method.from_raw). |

### Async and concurrency

| Location | Defect | Required correction / source |
|---|---|---|
| `skill/async.md:19-22` | Shared data that lives across awaits is blanket-routed to Tokio locks even when no guard crosses an await. | Choose the lock by guard lifetime/I/O semantics; Tokio recommends ordinary mutexes for short data-only critical sections. [Tokio Mutex guidance](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html#which-kind-of-mutex-should-you-use). |
| `skill/async.md:187-190` | The nested-`block_on` ban omits the supported multi-thread-runtime bridge `block_in_place(|| Handle::current().block_on(fut))`. | Document that narrow exception and keep it forbidden on current-thread runtimes. [`block_in_place`](https://docs.rs/tokio/latest/tokio/task/fn.block_in_place.html). |
| `skill/concurrency-and-state.md:26` | `OnceLock` and `LazyLock` are both called permanently poisoned after initializer panic. | Split them: `OnceLock` remains uninitialized and can retry; `LazyLock` is poisoned. [`OnceLock::get_or_init`](https://doc.rust-lang.org/std/sync/struct.OnceLock.html#method.get_or_init), [`LazyLock` poisoning](https://doc.rust-lang.org/std/sync/struct.LazyLock.html#poisoning). |
| `skill/concurrency-and-state.md:48` | Scoped-thread cleanup timing and panic propagation are misstated. The scope closure finishes before auto-join; current std creates a scoped-child panic instead of resuming the original payload. | Put post-`scope` cleanup behind RAII/`catch_unwind`; explicitly join when the original child payload matters. [`thread::scope`](https://doc.rust-lang.org/std/thread/fn.scope.html). |
| `skill/concurrency-and-state.md:101` | `fetch_add(1, Relaxed)` is recommended without saying it always wraps. | Limit it to wrapping statistics; use checked/saturating `fetch_update` and an RAII decrement for invariant-bearing counters. [`AtomicUsize::fetch_add`](https://doc.rust-lang.org/std/sync/atomic/struct.AtomicUsize.html#method.fetch_add). |
| `skill/SKILL.md:202` | An async deduplication phrase trigger recommends synchronous `entry().or_insert_with`. | Route async work to a per-key `Arc<tokio::sync::OnceCell<_>>`, drop the map guard, then await with cancellation/eviction policy. [`OnceCell::get_or_init`](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html#method.get_or_init). |

### Data, security and Drop

| Location | Defect | Required correction / source |
|---|---|---|
| `skill/data-and-types.md:71` | `(lo + hi) / 2` is called safe for in-range indices; the sum can overflow. | Use `lo + (hi - lo) / 2` after proving `lo <= hi`, or `usize::midpoint`. [`usize::midpoint`](https://doc.rust-lang.org/std/primitive.usize.html#method.midpoint). |
| `skill/security.md:27` | PBKDF2 is banned unconditionally despite the module's own PBKDF2 floor and the FIPS use case. | Prefer Argon2id; allow PBKDF2-HMAC-SHA256 with a current floor when FIPS validation is required. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). |
| `skill/security.md:33` | Every `StdRng`/seedable RNG is declared unsafe for secrets, although `StdRng` is a CSPRNG and can be seeded from OS entropy. | Ban predictable/reused seeds; prefer `OsRng`, but do not call `StdRng::from_os_rng()` non-cryptographic. [`StdRng`](https://docs.rs/rand/latest/rand/rngs/struct.StdRng.html). |
| `skill/security.md:38` | Current `jsonwebtoken` audience behavior is misstated: a present audience with no expected set is rejected; the separate gap is claim absence unless required. | Separate expected-value validation from `required_spec_claims` presence validation. [`Validation` source](https://docs.rs/jsonwebtoken/latest/src/jsonwebtoken/validation.rs.html). |
| `skill/drop-and-raii.md:20` | `drop(guard)` is offered before `process::exit` even for fallible resource shutdown; `BufWriter` drop discards flush errors. | Call and check `flush`/`sync_all`/`commit`/`rollback`/`close`, then drop. [`BufWriter`](https://doc.rust-lang.org/std/io/struct.BufWriter.html). |
| `skill/drop-and-raii.md:21` | `catch_unwind` is presented as sufficient to make fallible `Drop` non-panicking, but dropping the returned panic payload may panic. | Keep destructors non-fallible; if catching is unavoidable, handle/leak/isolate a hostile payload deliberately. [`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html). |

### Dependencies, API and tests

| Location | Defect | Required correction / source |
|---|---|---|
| `skill/deps-macros-ergonomics.md:22` | `Cargo.toml` is called the exact resolved-version source. | Applications inspect `Cargo.lock`/`cargo metadata`; published libraries test their supported version range. [Manifest vs lockfile](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html). |
| `skill/deps-macros-ergonomics.md:48` | Exact dependency pins and committed lockfiles are prescribed for every crate. | Apply locked reproducibility to applications; libraries use intentional SemVer ranges plus audit/provenance and boundary testing. [Cargo lockfile FAQ](https://doc.rust-lang.org/cargo/faq.html#why-do-binaries-have-cargolock-in-version-control-but-not-libraries). |
| `skill/deps-macros-ergonomics.md:103` | Features are described as one workspace-global namespace. | Explain unification per package identity/graph and explicit cross-member forwarding. [Cargo features](https://doc.rust-lang.org/cargo/reference/features.html). |
| `skill/deps-macros-ergonomics.md:164` | Unicode normalization is prescribed for every string equality/dedup key. | Normalize only when the domain defines canonical equivalence; opaque identifiers may require byte equality. [Unicode UAX #15](https://www.unicode.org/reports/tr15/). |
| `skill/deps-macros-ergonomics.md:168` | POSIX `shlex` is offered as platform-independent argv parsing. | Prefer `Vec<OsString>`; otherwise define and use the actual platform grammar. [`shlex`](https://docs.rs/shlex/latest/shlex/), [Microsoft argv parsing](https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments). |
| `skill/lifetimes-and-api.md:83,85-95` | `#[non_exhaustive]` is required without recognizing that an existing private field already prevents downstream literals/destructuring. | Require it only when downstream remains exhaustive and future growth is intended. [Cargo SemVer private fields](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private). |
| `skill/testing.md:22` | A feature gate is offered as a sufficient replacement for `#[ignore]`. | Require a CI job that enables the feature and owns its re-enable condition. [Cargo features](https://doc.rust-lang.org/cargo/reference/features.html). |
| `skill/testing.md:101` | Reaping by test-binary filename can kill a valid process from another concurrent job. | Isolate `CARGO_TARGET_DIR` and terminate only recorded PIDs/process trees owned by this job. [Cargo build cache](https://doc.rust-lang.org/cargo/reference/build-cache.html). |
| `skill/testing.md:109` | Allocation/syscall/instruction counts are called reproducible across machines without pinning allocator, target, compiler and features. | Hard-gate semantic counters or compare within a pinned environment/baseline. [Criterion CI FAQ](https://bheisler.github.io/criterion.rs/book/faq.html). |

### Semantics and conformance

| Location | Defect | Required correction / source |
|---|---|---|
| `skill/semantics-and-conformance.md:100` | A property generator is said to avoid the author's blind spots, although the strategy is part of the oracle. | Review generator coverage and retain explicit escape/boundary/invalid corpora. [`proptest::Strategy`](https://docs.rs/proptest/latest/proptest/strategy/trait.Strategy.html). |
| `skill/semantics-and-conformance.md:107` | `Display` plus `FromStr` is still treated as a universal inverse contract. | Require the property only for a documented lossless, machine-parseable display form. [`Display` parseability](https://doc.rust-lang.org/std/fmt/trait.Display.html#completeness-and-parseability). |

## P3 accuracy and calibration findings

- `skill/unsafe-and-ffi.md:15` presents data-pointer/function-pointer transmute as generally layout
  compatible; Rust documents it as target-dependent.
  [`transmute`](https://doc.rust-lang.org/std/mem/fn.transmute.html#examples).
- `skill/SKILL.md:314` is an intentionally broad `select!` review trigger, but it conflates effects in
  the polled future expression with handler-body effects. A losing handler never runs; narrow the
  trigger to reduce false positives. [`select!` lifecycle](https://docs.rs/tokio/latest/tokio/macro.select.html).
- `skill/concurrency-and-state.md:124` says Tokio docs contain the exact fatal/transient/backoff accept
  loop; current `TcpListener::accept` docs do not. Keep the policy, remove the source overclaim.
- `skill/concurrency-and-state.md:157` says safe `RefCell` mutation can leave a dangling iterator;
  safe `borrow_mut` instead panics while an immutable `Ref` lives.
- `skill/security.md:41` wrongly says username-derived salts make equal passwords produce equal hashes;
  the real defect is absence of fresh random per-credential salt.
- `skill/security.md:52` promises a specific first-byte-short-circuit implementation of equality;
  the portable claim is only that `PartialEq` gives no constant-time guarantee.
- `skill/security.md:91` includes `query!` in a runtime-`format!` SQL example, but the macro requires a
  compile-time literal; retain the warning for `query`/`query_as`/`QueryBuilder::push`.
- `skill/data-and-types.md:149` says `BufReader` flushes on drop; only the `BufWriter` half has a
  fallible flush, while a dropped reader may discard unread buffered input.
- `skill/security.md:43` conflates the broader NIST GCM IV rules with RustCrypto's typed 12-byte
  `Aes256Gcm` nonce and speculates about silent truncation without version evidence.
- `skill/deps-macros-ergonomics.md:15` repeats a false Tokio 0.2-vs-1.x channel tuple witness.
- `skill/deps-macros-ergonomics.md:50` promises a warning for an already locked yanked version that
  Cargo's contract does not guarantee; audit/deny must carry the policy.
- `skill/deps-macros-ergonomics.md:187` uses truncated JSON as a silent corruption witness even though
  it normally produces an explicit parse error; use a lost-update/concurrent-writer witness.
- `skill/lifetimes-and-api.md:68` conflates adding a conflicting blanket impl with narrowing/removing an
  existing impl; the first creates coherence conflicts, the second removes an implementation.
- `skill/testing.md:29,56,94` respectively mischaracterize property testing as a nondeterminism tool,
  elevate unit/integration layout style to correctness, and describe a per-test-thread timeout that the
  standard harness does not provide.
- `skill/testing.md:16,27` correctly warns that `should_panic(expected = ...)` can match setup text, but
  its remedy does not isolate the SUT; catch only the SUT call when panic is the contract.
- `skill/testing.md:71,77` needs to say that exhaustive Loom modelling requires `loom::sync`-instrumented
  operations under `loom::model`; adjacent ordinary std primitives are not automatically explored.
- `skill/testing.md:84` reverses GNU grep's no-match status: it is 1, while 0 means a match.
- `skill/semantics-and-conformance.md:112-126` uses `x;y` as a broken-round-trip witness even though the
  shown `split_once('=')` preserves it; use an `=` in the key or show the claimed containing-list parser.

The existing round-4 P3 findings (HashSet representative retention, clone-reporting tier contradiction,
Tokio MPSC wording, bounded-sender capacity, empty-buffer EOF, and the over-broad lifetime witness) also
remain open.

## Still-open findings from earlier rounds

No source commit follows `d095250` or `eb3b1d3`; therefore the following earlier high-priority groups
remain unresolved after applying the report corrections above:

- round-4 P1s for `MaybeUninit` + `Read`, `without_provenance`, incomplete `from_raw_parts`,
  attempt-level `OnceCell`, impossible `try_send` drop-oldest, unbounded `read_to_end`, unproved
  `read_message` cancel safety, per-read timeout/slowloris framing, and randomly seeded `foldhash`
  when adaptive/interactive attackers can observe and tune collisions;
- round-3 P1s for `QueryBuilder::push`, symlink write paths, `black_box` secret comparison, invalid
  lifetime laundering, sender/join Drop ordering, and the inaccurate Serde review claim;
- accepted but unintegrated gaps for attacker-extendable `spawn_blocking`, secret-bearing
  `#[instrument]`, edition-2024 environment mutation, prior positional schemas, and raw SQL transaction
  identity (at their corrected conditional severities);
- all verified P2/P3 items in round 4 except the qualifications explicitly superseded by this report.

## Commit-by-commit disposition

| Commit | Result | Round-5 disposition |
|---|---|---|
| `eca76bf` | **PARTIAL** | Useful release/routing corrections; normative accuracy and coverage remain incomplete. |
| `3bce0e1` | **PARTIAL** | Stronger parity/validation, but factual semantics and public-document drift are not enforced. |
| `d1f3df6` | **PARTIAL** | Valuable gap research; accepted findings remain non-normative and conditional severities must be preserved. |
| `39afc18` | **REQUEST CHANGES** | Its exhaustive correctness claim remains disproved by the new P1/P2 findings. |
| `9a808f3` | **PARTIAL** | Useful currency audit; multiple current-API facts and severities still need correction. |
| `d095250` | **PARTIAL** | Correct request-changes verdict, but no ledger integration and incomplete issue inventory. |
| `eb3b1d3` | **REQUEST CHANGES** | Adds only round 4: no source fixes, one retractable P1, over-broad corrections, severity inflation, and another missing ledger disposition. |

## Coverage and verification

Ten bounded committed-blob passes covered async, concurrency/state, unsafe/FFI, data/types, security,
Drop/RAII, dependencies/macros, lifetimes/API, testing, and semantics/conformance. The synthesis
deduplicated earlier findings and distinguished defects in normative text from corrections to review
artifacts. Current or version-sensitive claims were checked against primary Rust, Cargo, Tokio, crate,
Unicode, NIST, OWASP, GNU and Microsoft documentation linked above.

Checks run in a detached worktree at `eb3b1d3`:

- `npm run validate` — pass (`12` skill Markdown files, `2` fixtures);
- `node --check dev/validate.mjs` — pass;
- `node --check skill/audit-project.workflow.js` — pass;
- `git diff --check 7a567a6..eb3b1d3` — pass;
- `npm pack --dry-run --json` — pass, `37` entries;
- Node `v24.12.0`, npm `11.13.0`, Git `2.53.0.windows.2`;
- Rust `1.97.0` (`2d8144b78`, host `x86_64-pc-windows-msvc`), Cargo `1.97.0`;
- clean-pack integrity:
  `sha512-nFpl5t81QUqp/Ij574O8lutK2dz+xpIk3fquiOldajrPH1xyaqAn3USHze6Lc0mbdh9VgvhtuObTXB6CPolZbQ==`.

The same pack integrity reproduces at `9a808f3`, confirming round 4's correction of round 3's unpinned
digest evidence. This repository has no Cargo workspace to build, lint or test; Rust/Cargo versions are
recorded only because the normative document makes toolchain-sensitive claims.

Structural success does not close semantic, cancellation, unsafe-invariant, security, or review-ledger
findings. Fix the four new high-priority items at their stated severities and the still-open validated
P1s first, mirror every normative edit into `skills/rust-intel`, add focused regression fixtures, then
correct the historical review ledger and rerun the clean-snapshot gates.
