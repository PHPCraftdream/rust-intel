# Round 7 review of the latest commits — 2026-09-02 21:38 CEST

- **Range:** `7a567a6..a0955f9`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`, `d095250`, `eb3b1d3`, `44475ba`, `d855da7`, `9d8fc6e`, `949086f`, `a0955f9`
- **Delta focus since round 6:** `949086f..a0955f9`
- **Reviewed state:** revision-qualified committed blobs at `a0955f9`; pre-existing untracked work was excluded
- **Method:** independent passes over all ten normative modules, repository/release integration review, current primary-source verification, clean-worktree negative controls, and a separate final synthesis pass
- **Verdict:** **REQUEST CHANGES**

`a0955f9` is a meaningful corrective pass. It closes or materially improves most of the round-5 and
round-6 findings, keeps the canonical and Codex-mirror trees byte-identical, repairs several
non-compiling examples, and adds the missing README count check. It is not yet a complete or fully
accurate solution. Eight high-priority normative defects remain: three FFI/unsafe contract failures,
an insufficient exactly-once remedy, an invariant-corruption gap, two crypto/security failures, and the
still-open slowloris gap. Several attempted corrections introduce new factual or MSRV errors. The validator's new
negative fixture also mutates the real working tree and can leave `README.md` corrupted if interrupted,
while the stale-count scanner still has a demonstrated false negative.

## Executive result

- **Eight P1 or conditional-P1 blockers remain.** The most direct are the continued allowance of a
  `#[repr(int)]` enum as foreign input, a direction-agnostic `Box<T>` FFI allowance, second-panic risk in
  the required destructor, `SmallRng` described as secure when OS-seeded, and the current JWT bypass API
  missing from the central code trigger table. A too-narrow poison/invariant exception can also hide
  critical single-value corruption.
- **The attempted exactly-once correction is still not exactly-once.** A durable status row or a
  distributed lock alone does not close the crash window between an external effect and recording its
  result.
- **The slowloris blocker from round 6 is still open.** A resettable idle deadline remains accepted as a
  standalone alternative to an absolute stage deadline or a minimum progress rate.
- **The new validator test is unsafe for a developer worktree.** Forced termination after its in-place
  write left `README.md` modified; `finally` cannot run after process termination, machine loss, or every
  concurrent-run race.
- **The stale-count scan still misses Markdown-formatted stale counts.** A correct `**59**` banner plus a
  second `**58** categories` statement passed validation.
- **Evidence/release integration is incomplete.** The cited synthesized fix plan is still absent from
  committed `HEAD`, `a0955f9` has no changelog entry, and the new ledger row overstates closure of the
  FFI-destructor and poison-recovery findings.
- **The active Codex installation is stale.** All 11 installed normative files still match baseline
  `7a567a6`; none matches reviewed `a0955f9`. Repository corrections therefore are not the rules loaded
  by this Codex installation.
- Structural validation, JavaScript syntax, whitespace, packaging, and canonical/mirror parity are
  green. Those checks do not establish semantic accuracy.

## P1 and conditional-P1 findings

### P1 — the enum rule still permits an invalid Rust enum to cross FFI

**Locations:** `skill/unsafe-and-ffi.md:113,122`, `skill/SKILL.md:335`.

Line 113 correctly bans every Rust enum as an exported input, because an invalid discriminant is already
undefined behavior before the function body can inspect it. The REQUIRED rule then reverses that fix by
allowing “`#[repr(int)]`/primitive scalars” and banning only a “plain enum”; the central trigger repeats
the plain-enum exception. `#[repr(u32)] enum E` is still a Rust enum, not a validated integer carrier.
Take the corresponding primitive integer (`u32`, `i32`, and so on) across the ABI, range-check it, and
construct the enum only afterward. Ban **all** enum-typed foreign inputs, regardless of representation.
[Rust Reference: invalid values](https://doc.rust-lang.org/reference/behavior-considered-undefined.html#invalid-values).

### P1 conditional — the direct-`Box<T>` FFI allowance omits direction and allocation origin

**Location:** `skill/unsafe-and-ffi.md:106`.

The documented single-pointer ABI for sized `Box<T>` does not prove that an arbitrary foreign-produced
pointer satisfies `Box`'s allocator/layout/ownership contract. The new blanket exception can therefore
encourage an imported C function to return `Box<T>` even when it returns `malloc` storage that Rust may
not reclaim as a `Box`. Scope direct `Box<T>` signatures to Rust exports whose paired Rust constructor
minted the allocation, or require a specific proof that the foreign allocator, layout, validity, and
exclusive ownership exactly match `Box`'s contract. Prefer a raw pointer plus a documented foreign free
function on imports. This is P1 when the incorrect allowance reaches generated unsafe boundary code.
[Rust `Box` memory layout and FFI](https://doc.rust-lang.org/std/boxed/index.html#memory-layout),
[`Box::from_raw`](https://doc.rust-lang.org/std/boxed/struct.Box.html#method.from_raw).

### P1 conditional — the required destructor can still panic at the C boundary

**Locations:** `skill/unsafe-and-ffi.md:117-118`.

Wrapping `drop(b)` in `catch_unwind` catches the first unwinding panic, but the returned
`Box<dyn Any + Send>` payload is then merely logged/swallowed. When that unknown payload falls out of
scope, its own destructor may panic outside the guard and reach the non-unwinding `extern "C"` boundary,
aborting the process. Logging also must not introduce another panic. Require a proven panic-free `T`, or
inspect only borrowed string payloads and deliberately retain/forget an unknown payload inside the
boundary (or transfer it to a genuinely isolated failure domain). The standard documentation explicitly
warns that dropping a caught payload may panic.
[`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html),
[Rust ABI unwinding](https://doc.rust-lang.org/reference/items/functions.html#unwinding).

### P1 conditional — “durable state or distributed lock” is not an exactly-once remedy

**Location:** `skill/concurrency-and-state.md:102`.

The updated rule correctly explains Tokio `OnceCell` cancellation and duplicate attempts, but its final
remedy still overpromises. A lease/distributed lock prevents concurrent calls, not a retry after a crash;
a durable row with only `running/done` state has the same gap. If the process charges a card and crashes
before storing `done`, the next owner charges again. For a non-idempotent external effect, require a
stable provider-side idempotency/deduplication key, or atomically couple the effect and result record in
the same transactional system. Describe a lock/status row only as coordination, not exactly-once.
[Tokio `OnceCell::get_or_init`](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html#method.get_or_init),
[Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### P1 conditional — the poison exception can hide single-value invariant corruption

**Locations:** `skill/async.md:45-46`.

The updated poison guidance is substantially better, but it permits `parking_lot::Mutex` whenever no
**cross-field** invariant can be left half-updated. A single `Vec`, enum state machine, balance, index, or
other one-value abstraction can still carry a load-bearing semantic invariant and be left in an invalid
intermediate state by a panic. Because `parking_lot` deliberately does not poison, this removes the
signal and silently publishes the corrupted state. Require proof that **no protected invariant or state
transition** can be left partially updated; retain the module's P1 calibration for money-, safety-,
admission-, and durability-critical state.
[Rust `Mutex` poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html#poisoning),
[`parking_lot::Mutex`](https://docs.rs/parking_lot/latest/parking_lot/type.Mutex.html).

### P1 — `SmallRng` remains incorrectly admitted for security-sensitive randomness

**Location:** `skill/security.md:33`.

The correction says that the hazard is the seed rather than the RNG type and groups `SmallRng` with
`StdRng`. Current `rand` 0.10.2 documentation explicitly classifies `SmallRng` as non-cryptographic,
predictable, and insecure; OS seeding does not turn its algorithm into a CSPRNG. Ban `SmallRng` for keys,
nonces, salts, and other security-sensitive values. A securely OS-seeded `StdRng` is the valid calibrated
exception, alongside direct OS/system RNG use.
[`rand::rngs::SmallRng`](https://docs.rs/rand/latest/rand/rngs/struct.SmallRng.html),
[`rand::rngs`](https://docs.rs/rand/latest/rand/rngs/).

### P1 — current jsonwebtoken signature-bypass API is absent from the central trigger

**Location:** `skill/SKILL.md:312`; compare the correct module rule at `skill/security.md:39`.

The structural trigger still names only the removed/older
`insecure_disable_signature_validation()` method. Current jsonwebtoken exposes
`jsonwebtoken::dangerous::insecure_decode`, which performs no validation and is the exact code shape the
audit must surface. Add it to the trigger and version-scope the older method.
[`jsonwebtoken::dangerous`](https://docs.rs/jsonwebtoken/latest/jsonwebtoken/dangerous/index.html).

### P1 conditional — idle timeout is still accepted as standalone slowloris protection

**Locations:** `skill/semantics-and-conformance.md:70,77`, `skill/SKILL.md:392`.

A client can send one byte just before each resettable idle timeout and retain the task, socket, and
buffer forever. For a bounded frame or handshake require an absolute whole-stage deadline, or a minimum
byte/progress rate with a maximum deadline; an idle timer may remain an additional silence policy for an
established connection. It must not independently satisfy the trigger.
[Apache `mod_reqtimeout` stage timeout and `MinRate`](https://httpd.apache.org/docs/2.4/mod/mod_reqtimeout.html),
[Tokio `timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html).

## P2 findings

### Incorrect or incomplete normative corrections

| Location | Finding | Required correction |
|---|---|---|
| `skill/async.md:20-22` | Still chooses a Tokio mutex merely because data is shared across awaits. The deciding fact is whether the guard itself crosses an `.await`; a short synchronous critical section can correctly use `std::sync::Mutex`. | Align with the guard-lifetime rule and Tokio's mutex guidance. [Tokio `Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html). |
| `skill/async.md:225,297` | Says `futures::executor::block_on` has no nesting check and “never panics.” Its executor enters through `enter().expect(...)`, so nested futures executors panic; a panic in the future also propagates. | Distinguish nested-executor panic, future panic, ready futures, and runtime-dependent stalls. [futures-executor source](https://docs.rs/futures-executor/latest/src/futures_executor/local_pool.rs.html#79-83). |
| `skill/async.md:326` | The comment `// not cancellable` beside `db.write(...).await?; ack.send().await?` is a false guarantee. It is no longer cancelled merely because another `select!` arm wins, but an outer timeout, caller drop, or task abort can still cancel between write and acknowledgement. | State the narrower guarantee and retain transactional/idempotency discipline across the remaining cancellation point. [Tokio task cancellation](https://docs.rs/tokio/latest/tokio/task/#cancellation). |
| `skill/concurrency-and-state.md:44` | Says spurious wakeups are the **only** reason for a predicate loop. After `notify_all`, one consumer can consume the resource before another reacquires the mutex, leaving the second predicate false without a spurious wakeup. | Require the loop because the predicate must be rechecked after every wake/reacquisition; retain the correct no-gap mutex protocol. [`Condvar::wait`](https://doc.rust-lang.org/std/sync/struct.Condvar.html#method.wait). |
| `skill/concurrency-and-state.md:177-179` | The text admits a mutex-wrapped Tokio receiver is valid for competing workers while leaving it under a blanket BANNED rule for multiple consumers. | Separate competing-worker, broadcast-to-all, and routed/affine semantics; classify the mutex wrapper as serialization/ergonomics unless delivery semantics differ. [Tokio `Receiver`](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Receiver.html), [Flume `Receiver`](https://docs.rs/flume/latest/flume/struct.Receiver.html). |
| `skill/data-and-types.md:96` | Recommends nonexistent `SystemTime::checked_add_duration` / `checked_sub_duration`. | Use the public `checked_add` / `checked_sub` APIs and attach the Windows-before-epoch note to `checked_sub`. [`SystemTime`](https://doc.rust-lang.org/std/time/struct.SystemTime.html). |
| `skill/deps-macros-ergonomics.md:82` | Still recommends `pub use serde as __serde` from the proc-macro crate, which rustc rejects because such crates may export only procedural macros. | Put the re-export in an ordinary runtime/facade crate, support a crate-path attribute, or resolve the consumer name with `proc-macro-crate`. [Rust Reference: proc-macro linkage](https://doc.rust-lang.org/reference/linkage.html#r-link.proc-macro). |
| `skill/deps-macros-ergonomics.md:106` | Says every workspace member using one package identity shares one unified feature set, omitting resolver-v2/v3 separation for target, build/proc-macro, and inactive dev dependencies. | Scope unification to the applicable resolver/compilation unit and preserve the documented exceptions. [Cargo resolver v2](https://doc.rust-lang.org/cargo/reference/resolver.html#feature-resolver-version-2). |
| `skill/deps-macros-ergonomics.md:114` | Still promises `[workspace.dependencies]` yields “one version, one linked copy,” contradicting line 107: an incompatible transitive version can coexist. | Say inheritance reduces direct-member drift; verify the graph with `cargo tree -d`. [Cargo resolver](https://doc.rust-lang.org/cargo/reference/resolver.html#version-incompatibility-hazards). |
| `skill/SKILL.md:55,469,520` | Line 55 explicitly and incorrectly asks for “exact versions ... from Cargo.toml.” Lines 469 and 520 do not make that exact claim, but their version preflight still mentions only `Cargo.toml`/`CLAUDE.md` and omits the lockfile/metadata needed to answer the adjacent resolved-version question. | Use `Cargo.toml` for requested range/intent and `Cargo.lock` or `cargo metadata` for the resolved version. [Cargo.toml vs Cargo.lock](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html). |
| `skill/drop-and-raii.md:21` | General `catch_unwind` guidance still lets an unknown caught payload fall out of scope and panic again; `dyn Any` is not generally `Debug`/`Display`. | Downcast by reference to known string forms; explicitly handle or retain an unknown payload inside the failure boundary. [`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html), [`Any`](https://doc.rust-lang.org/std/any/trait.Any.html). |
| `skill/lifetimes-and-api.md:104` | The tuple-variant correction is reversed. Variant-level `#[non_exhaustive]` also applies to tuple variants: external construction/tuple patterns are prohibited and wildcard matching is required, which protects ordinary arity growth. | State that the attribute protects tuple-like variants too; present a named payload as an ergonomics/versioning choice, not the only protection. [Rust Reference](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute), [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html#enum-fields-new). |
| `skill/SKILL.md:202,325` | The public-struct triggers conflict: one calls every added field major; the other exempts every struct with any private field, which is too broad for positional tuple fields. | Mirror the module: named structs with an existing private field differ from tuple structs, whose existing indices/visibility must remain stable. [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private). |
| `skill/testing.md:31`, `skill/SKILL.md:438` | The new REQUIRED `std::assert_matches!` oracle stabilized in Rust 1.96, but the skill's declared MSRV is 1.85. | Gate it on Rust ≥1.96; on 1.85–1.95 use an always-on `assert!(matches!(...))` form with a useful diagnostic. [`assert_matches!`](https://doc.rust-lang.org/std/macro.assert_matches.html). |
| `skill/testing.md:27` | The `should_panic` fix forbids panic-capable setup only **before** the SUT. A later `panic!("same expected text")` still makes a non-panicking SUT test green. | Make the SUT call the only panic-capable expression in the whole body, or catch exactly that call and inspect the result/payload. [Rust Reference: `should_panic`](https://doc.rust-lang.org/reference/attributes/testing.html#the-should_panic-attribute). |
| `skill/SKILL.md:488-499` vs `skill/testing.md:77,93` | Canonical post-flight runs bare `cargo test`/`cargo clippy`, contradicting the workspace and conditional release-profile gates in the module. | Use workspace-aware/all-target commands and include `cargo test --workspace --release` when the stated profile-divergence condition applies. [Cargo test package selection](https://doc.rust-lang.org/cargo/commands/cargo-test.html#package-selection). |

### Repository, validator, evidence, and release integration

1. **The negative fixture mutates the real README and is interruption-unsafe.**
   `dev/validate-fixtures.mjs:61-87` writes a false count into the repository's `README.md`, spawns the
   validator, then relies on `finally` to restore it. A controlled termination after the write left
   `README.md` modified and `git status` dirty. `finally` cannot support the comment's “can never leave
   the repo mutated” claim, and two concurrent validator runs can restore stale snapshots over each
   other or over a concurrent editor. Extract the check into a pure function accepting supplied text/root,
   or validate a temporary copied root/worktree; never modify the caller's working tree.
2. **The stale-count scanner has a demonstrated Markdown false negative.**
   `dev/validate.mjs:216-234` matches `\b(\d+)\s+categories\b`, which cannot cross the `**` after a bold
   number. Keeping the correct banner and adding `Temporary probe: **58** categories.` in the scanned
   README banner region exited 0. Normalize/strip Markdown or accept emphasis delimiters, then add a
   coexistence fixture. The current fixture only replaces the mandatory `**59**` phrase, so the exact
   required-mention check fails before it proves the generic stale scanner works.
3. **The synthesized fix plan is still missing from committed `HEAD`.** `CHANGELOG.md:11,21` and
   `docs/reviews/README.md:12-14` cite `docs/reviews/fix-plan-2026-08.md`, but `git cat-file -e
   a0955f9:docs/reviews/fix-plan-2026-08.md` fails. The untracked working-tree copy is not evidence in the
   reviewed commits. Commit it after reconciling its contents, or remove/replace every claim and link.
4. **`a0955f9` has no changelog entry.** Its only changelog edit rewrites the release policy; the
   Unreleased narrative still describes the earlier audit/round-4 batches and does not disclose this
   round-5/round-6 correctness pass. Add a concise entry with the actual closure/remaining limitations.
5. **The new ledger row overstates closure.** `docs/reviews/README.md:23` says all four round-5 blockers
   were closed by the later working-tree pass. The FFI destructor remains second-panic unsafe, and the
   poison exception can still publish a corrupted single-value invariant, so the group is only partially
   closed. Record the round-7 correction rather than leaving the older prose authoritative.
6. **Published evidence is not self-contained.** `npm pack --dry-run` includes `CHANGELOG.md` but no
   `docs/reviews/` files, so its relative evidence references are unavailable in the package. Either ship
   the evidence artifacts or use stable repository links and state that the evidence is repository-only.
7. **The active Codex deployment remains stale.** All 11 installed files under
   `C:\Users\Computer\.agents\skills\rust-intel` match `7a567a6`; 0/11 match `a0955f9`. This is an
   operational completeness blocker for the earlier Codex-install objective. Install only after the
   normative corrections above, then verify hashes and start a fresh Codex thread.

## P3 accuracy and calibration findings

| Location | Finding |
|---|---|
| `skill/async.md:282` | `abort()` prevents remaining **async** cleanup, but cancellation drops task locals and runs their synchronous destructors; “no chance for any cleanup code” is too absolute. [Tokio task cancellation](https://docs.rs/tokio/latest/tokio/task/#cancellation). |
| `skill/SKILL.md:318` | The structural `select!` trigger still omits the completed-future re-poll/all-arms-disabled panic shapes now covered in the module. |
| `skill/concurrency-and-state.md:125` | `JoinSet` grows with `.spawn(...)`, not `.push()`; scope `.push()` to `FuturesUnordered`. [`JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html). |
| `skill/concurrency-and-state.md:130` | `rustls::ClientConfig` is reusable TLS configuration, not a connection pool owning sockets or creating `TIME_WAIT`; separate it from per-request pooled clients. [`rustls::ClientConfig`](https://docs.rs/rustls/latest/rustls/struct.ClientConfig.html). |
| `skill/data-and-types.md:28` | A `PartialOrd`-only type cannot be passed to `.sort()` (`Ord` is required), while `.sort_by()` can use a valid total comparator. Target `partial_cmp(...).unwrap()` or an actually inconsistent comparator. [Slice sorting](https://doc.rust-lang.org/std/primitive.slice.html#method.sort). |
| `skill/data-and-types.md:32,212` | The detailed rule permits a proven non-interactive, one-shot `foldhash` case; the catalog still says “Trusted keys only” and “not negotiable.” Reconcile the exception or remove it. [`foldhash`](https://docs.rs/foldhash/latest/foldhash/). |
| `skill/data-and-types.md:70` | `u32 as usize` is not universally lossless: Rust supports 16-bit pointer-width targets such as `msp430-none-elf`. Qualify it on `target_pointer_width >= 32`. [Rust target support](https://doc.rust-lang.org/nightly/rustc/platform-support.html). |
| `skill/SKILL.md:276,376` | “match-timeout” does not say that a caller/thread/Tokio timeout leaves backtracking work running. Require an engine-native enforced limit or a killable subprocess. |
| `skill/security.md:33` | A securely seeded `StdRng` may generate many values; requiring a new OS seed “on each use” is unnecessary. Require fresh entropy per independent RNG instance and forbid deterministic seed reuse. |
| `skill/security.md:41` | A salt need not be unpredictable; it must be unique per credential. A username-derived salt enables targeted precomputation/reuse but “predictability defeats salting” is imprecise. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#salting). |
| `skill/security.md:43` | The 96-bit nonce headline is correct for the named RustCrypto aliases but not universal AES-GCM. Scope it to the selected algorithm/API and protocol. |
| `skill/SKILL.md:200,311` | Reqwest 0.13's explicit `tls_danger_accept_invalid_*` spellings are omitted, but the existing `danger_accept_invalid_*` text remains a matching substring and the module lists both forms. Add the current names for currency/precision; this is not a missed security guarantee. [Reqwest `ClientBuilder`](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html). |
| `skill/unsafe-and-ffi.md:37,106` | The module still blanket-bans `Box<T>` inside any `#[repr(C)]` aggregate while line 106 recognizes the documented sized-pointer ABI. Express the actual ownership/nullability contract consistently. |
| `skill/SKILL.md:341` | The environment-mutation trigger omits the module's Windows exception and therefore flags sound Windows use unconditionally. [`std::env::set_var`](https://doc.rust-lang.org/std/env/fn.set_var.html#safety). |
| `skill/unsafe-and-ffi.md:118` | `Option<Box<T>>` makes null a no-op, not a repeated destruction safe: the second call with the same non-null dangling pointer is still UB. Remove “double-call” from the nullable case and retain exactly-once as a caller contract. |
| `skill/unsafe-and-ffi.md:107` | The allocation wording excludes the valid zero-sized `Box<()>` case, whose raw pointer need only be non-null and aligned rather than backed by an allocation. |
| `skill/unsafe-and-ffi.md:114`, `skill/SKILL.md:336` | Pointer/handle/length syntax does not by itself prove caller preconditions. Classify each imported function by its foreign contract; safe imports are valid for all inputs. |
| `skill/deps-macros-ergonomics.md:51` | Cargo permits an already-locked yanked package, but does not promise the stated portable warning behavior for every locked build. Put mandatory diagnosis on configured `cargo audit`/`cargo deny`. [Cargo yanks](https://doc.rust-lang.org/cargo/reference/resolver.html#yanked-versions). |
| `skill/deps-macros-ergonomics.md:88` | At the declared Rust ≥1.85 floor, unknown feature cfgs are warned by `unexpected_cfgs`; the real gap is that warning-level diagnostics may be ignored. [rustc check-cfg](https://doc.rust-lang.org/rustc/check-cfg.html). |
| `skill/deps-macros-ergonomics.md:95` | Cargo's directory `rerun-if-changed` tracking is recursive; “directories are scanned non-recursively” is wrong. [Cargo build scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html#rerun-if-changed). |
| `skill/drop-and-raii.md:11,15` | One paragraph scopes explicit awaited SQLx rollback to observable completion/error; the unconditional REQUIRED rule calls it mandatory on every error path. Permit documented drop-triggered rollback when its completion/error need not be observed. [`sqlx::Transaction`](https://docs.rs/sqlx/latest/sqlx/struct.Transaction.html). |
| `skill/SKILL.md:85` | Operating-mode applicability still omits the canonical case where an input lifetime is captured into a longer-lived cache/container; the correct broader wording already exists at line 474. |
| `skill/testing.md:30` | The paused-interval recipe should yield once after spawning so the interval is created before advancing virtual time; then account for the immediate first tick and yield after each advance. [Tokio `advance`](https://docs.rs/tokio/latest/tokio/time/fn.advance.html). |
| `skill/SKILL.md:287` | The benchmark trigger drops the module's pinned-environment qualification for allocation/instruction baselines. Restore same allocator, target, compiler, feature set, and stored-baseline scope. [Criterion FAQ](https://bheisler.github.io/criterion.rs/book/faq.html). |
| `skill/semantics-and-conformance.md:78` | Cancellation **may** have consumed bytes into the caller-owned buffer; it need not have read anything, and the buffer is not owned by the dropped future. [Tokio `read_exact`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncReadExt.html#method.read_exact). |
| `skill/semantics-and-conformance.md:19` | A positional variant insertion can silently reinterpret compatible payloads **or** fail decoding when the new payload shape is incompatible; it does not reinterpret every later value. [Bincode specification](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md). |
| `skill/SKILL.md:291,391` | An owned `TcpStream` returned through `?` is closed by RAII; lack of an explicit `shutdown()` is a defect only when a half-close/graceful-protocol or paired-teardown obligation exists. [Tokio `TcpStream`](https://docs.rs/tokio/latest/tokio/net/struct.TcpStream.html). |

## Delta closure matrix

| Area | Closed accurately by `a0955f9` | Still open or regressed |
|---|---|---|
| Unsafe/FFI | Non-Windows live-environment mutation rule in the module; null/origin/exactly-once destructor contract substantially improved | enum contradiction; direct-`Box` direction; caught payload; module/trigger inconsistencies |
| Async | Poison propagation/validation core substantially improved; cooperative graceful shutdown; runtime-flavor calibration improved | too-narrow poison exception; futures-executor nesting; blanket mutex choice; cleanup/select wording and trigger precision |
| Concurrency/state | `OnceCell` cancellation mechanism; compilable `Condvar`; atomic wrap, pool identity, accept/`RefCell` wording | exactly-once remedy; predicate-loop rationale; MPSC ban; `JoinSet`/rustls precision |
| Data/types | Hard regex timeout removed from module; safe midpoint; adaptive foldhash boundary partly added | nonexistent `SystemTime` APIs; malformed sorting witness; foldhash/catalog and trigger inconsistencies |
| Security | PBKDF2 compliance case, equality, SQLx macro, salt collision and nonce behavior materially corrected | `SmallRng`; current JWT trigger; explicit TLS-spelling, RNG-reuse, salt, and nonce calibration |
| Drop/RAII | Fallible pre-exit cleanup and passive-handle trigger | caught payload and SQLx rollback scope |
| Deps/macros | App/library lock policy; Unicode/argv scope; some resolved-version text | proc-macro export; feature-unification claims; central resolved-version instructions; Cargo precision |
| Lifetimes/API | Real laundering witness; blanket-impl distinction; named-vs-tuple struct module rule | tuple-variant reversal; conflicting public-struct triggers; applicability wording |
| Testing | Ignored-test CI, process reaping, counter scope in module, property/Loom/harness corrections | MSRV-incompatible oracle; `should_panic` tail; post-flight commands and two trigger/recipe details |
| Semantics/conformance | Boundary corpus, `x;y` witness, EOF/owned-stream example, scoped round-trip contract | idle-deadline blocker; cancellation/positional/trigger overstatements |
| Tooling/docs | README is now among mandatory count surfaces; mirror parity and validation remain green | in-place fixture mutation; Markdown false negative; absent evidence/changelog and stale install |

## Commit-by-commit disposition

| Commit | Disposition |
|---|---|
| `eca76bf` | Partial corrective change; later reviews found remaining factual and deployment issues. |
| `3bce0e1` | Partial corrective change; its dyn-compatibility commit-message claim is already recorded as incorrect. |
| `d1f3df6` | Useful completeness audit, but its inventory/provenance remains unreconciled without the missing synthesized plan. |
| `39afc18` | Useful correctness audit; several claims required later correction. |
| `9a808f3` | Useful currency audit; chronology, severity, and API claims required later correction. |
| `d095250` | Documentation-only round 3; findings were not normative fixes and some were later corrected. |
| `eb3b1d3` | Documentation-only round 4; strong additional findings, with corrections required by later rounds. |
| `44475ba` | Documentation-only round 5; its four main blockers were addressed by `a0955f9`, but the FFI-destructor and poison/invariant closures remain incomplete. |
| `d855da7` | Large, useful round-3/4 corrective batch; later reviews demonstrated remaining and newly introduced defects. |
| `9d8fc6e` | Partial tooling fix; count checking was expanded but still needed README coverage and a negative control. |
| `949086f` | Documentation-only round 6; accurately motivated much of `a0955f9`, with some claims now superseded by this review. |
| `a0955f9` | **Request changes.** Substantial closure, but the eight normative blockers and repository/tooling defects above prevent calling the solution complete or accurate. |

## Verification evidence

All commands and negative controls were run against a clean detached worktree at `a0955f9`; deliberate
mutations were restored and the review worktree was confirmed clean afterward. The user's primary
worktree and its pre-existing untracked files were not used as test input.

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files, 2 fixtures |
| `node --check dev/validate.mjs` | PASS |
| `node --check dev/validate-fixtures.mjs` | PASS |
| `node --check skill/audit-project.workflow.js` | PASS |
| `node --check skills/rust-intel/audit-project.workflow.js` | PASS |
| `git diff --check 949086f..a0955f9` | PASS |
| `git diff --check 7a567a6..a0955f9` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` byte comparison | PASS — 11/11 normative files identical |
| `npm pack --dry-run --json` | PASS — 37 entries; packed 528,339 bytes; unpacked 1,483,301 bytes; SHA-1 `a30f589abe073ead3ca6125a0dfa69855727c0d2` |
| Pack integrity | `sha512-q7IxFtuaBkgZjNjhJ15NqQIIVsdIE/hUvnCiNEbNHx4hbWUL3C1TYWEyIjMLU13bgPu75daGpty/48ixniW5tQ==` |
| Toolchain | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |
| Negative control: keep correct `**59**`, add coexisting `**58** categories` in README banner, run validator | **Unexpected PASS / exit 0** — Markdown stale-count false negative reproduced; mutation restored |
| Interruption control: stop `validate-fixtures.mjs` after its README write | README remained changed to 58 and worktree showed `M README.md`; mutation restored |
| `git cat-file -e a0955f9:docs/reviews/fix-plan-2026-08.md` | **FAIL / exit 128** — cited artifact absent from commit |
| Installed-skill hash comparison | 11/11 installed normative files equal `7a567a6`; 0/11 equal `a0955f9` |
| Tarball evidence inventory | `CHANGELOG.md` present; `docs/reviews/` absent |

## Required fix order

1. Fix the eight P1/conditional-P1 rules: all-enum FFI input ban, direction/origin-safe `Box`,
   panic-payload containment, true external-effect idempotency, the poison/invariant exception,
   `SmallRng`, the current JWT bypass trigger, and absolute/min-rate slowloris defense.
2. Correct **every** P2 row above, including the async mutex/select guarantees, `futures::executor`,
   `Condvar`/MPSC semantics, `SystemTime`, proc-macro export and dependency-resolution wording, caught
   payload handling, `#[non_exhaustive]`/struct triggers, the MSRV-compatible test oracle,
   `should_panic`, and workspace-aware post-flight commands.
3. Replace the in-place README fixture with a pure or temporary-root test; extend the stale scanner and
   add a coexisting bold-count negative fixture. Add interruption/concurrency safety as a test invariant.
4. Close the P3 consistency table and add compile/reproducer fixtures for claims that can be checked
   mechanically. Do not execute UB as an ordinary runtime test; use compile checks, contract witnesses,
   Miri-compatible boundary tests, and authoritative documentation.
5. Commit or retract the synthesized fix plan, add an honest `a0955f9` changelog entry, correct the review
   ledger, and make evidence links usable from the distributed package.
6. After the corrected commit, run `node bin/install-codex.js`, verify all installed hashes against
   canonical `skill/`, and start a fresh Codex thread so the updated skill is loaded.
7. Re-run the clean validation/package/negative controls and a final ten-module synthesis before release.
