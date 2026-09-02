# Round 6 review of the latest commits — 2026-09-02 18:19 CEST

- **Range:** `7a567a6..9d8fc6e`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`, `d095250`, `eb3b1d3`, `44475ba`, `d855da7`, `9d8fc6e`
- **Delta focus since round 5:** `44475ba..9d8fc6e`
- **Reviewed state:** revision-qualified committed blobs at `9d8fc6e`; pre-existing dirty worktree changes were excluded
- **Method:** independent passes over all ten normative modules, followed by repository/release integration review and final synthesis
- **Verdict:** **REQUEST CHANGES**

`d855da7` is a substantial improvement: it correctly closes many round-3/round-4 factual defects,
restores canonical/Codex-mirror parity, fixes the public 59-category banner, and integrates useful new
coverage. `9d8fc6e` also improves the validator and release-workflow wording. The series is nevertheless
incomplete. It leaves the four round-5 P1/conditional-P1 defects open, introduces three new
P1/conditional-P1 defects in attempted corrections, and leaves an idle-deadline slowloris hole. Several new examples do not
compile or promise guarantees their APIs do not provide. The committed evidence trail is also broken:
the changelog repeatedly cites a synthesized fix plan that is absent from `HEAD`.

## Executive result

- **Eight high-priority normative blockers remain** under the load-bearing contexts stated below:
  invalid FFI enum input, unsound live environment mutation on non-Windows platforms, duplicate external effects through a
  cancelled `OnceCell` initializer, unsafe FFI destruction, unconditional poison recovery, task abortion
  labelled graceful shutdown, a detached regex worker advertised as a hard timeout, and an idle timeout
  advertised as slowloris protection.
- **The new category-count validator has a demonstrated false negative.** Changing the committed README
  banner from 59 back to 58 still exits successfully because `README.md` is outside the files scanned for
  stale count mentions.
- **The release classification contradicts the repository's own policy.** `CHANGELOG.md:6` defines
  substantive additions as MINOR, while `:11,17,23` call eight new gaps and new BANNED/REQUIRED coverage
  PATCH-shaped.
- **The promised evidence artifact is not committed.** `CHANGELOG.md:11,21` and
  `docs/reviews/README.md:12-14` cite `docs/reviews/fix-plan-2026-08.md`, but that path does not exist at
  `9d8fc6e`.
- **The active Codex deployment is stale.** All 11 installed normative files under
  `C:\Users\Computer\.agents\skills\rust-intel` hash-identically to baseline `7a567a6`, not to
  `9d8fc6e`. Thus the repository fixes are not the rules this Codex installation currently executes.
- Repository structure, mirror parity, JavaScript syntax, packaging and whitespace checks are green;
  these checks do not establish semantic accuracy.

## P1 and conditional-P1 findings

### P1 — a `#[repr(int)]` enum is not a validated FFI input

**Locations:** `skill/unsafe-and-ffi.md:113,122`.

The new rule permits a foreign caller to pass a `#[repr(int)]` enum directly and proposes validating its
discriminant inside the Rust body. That validation is too late: producing or passing a Rust enum value with
an invalid discriminant is already undefined behavior before the body can inspect it. Take the underlying
integer across the ABI, validate it, and only then construct the Rust enum. The Rust Reference explicitly
states both that passing an invalid value produces it and that an enum must have a valid discriminant.
[Rust Reference: invalid values](https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html#invalid-values).

### P1 — a private process-global lock does not make live environment mutation sound

**Location:** `skill/unsafe-and-ffi.md:137`.

The new remedy allows `set_var`/`remove_var` in a multithreaded process behind the application's own
global lock. On non-Windows platforms that lock cannot cover C/runtime/library readers which do not
participate in it. Current std documentation says the practical sound option in a multithreaded program is
not to mutate the environment at all; Windows is explicitly exempt. Require mutation before threads exist,
or pass explicit configuration/`Command::env`; qualify the platform rule.
[`std::env::set_var` safety](https://doc.rust-lang.org/std/env/fn.set_var.html#safety).

### P1 conditional — detached `OnceCell` work is not attempt-level exactly-once

**Location:** `skill/concurrency-and-state.md:102`.

Moving the initializer into `tokio::spawn` keeps it alive when the outer caller is cancelled, but dropping
the `JoinHandle` detaches that task while `OnceCell` permits another initializer. A payment/email effect can
therefore execute twice. Require idempotency/external deduplication, or a separately synchronized durable
in-flight result shared by all waiters; a detached handle alone is insufficient. This reaches P1 when the
initializer performs a non-idempotent external effect.
[Tokio `OnceCell::get_or_init`](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html#method.get_or_init),
[Tokio `JoinHandle` detach semantics](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html).

### P1 conditional — the required FFI destructor remains null/origin/panic unsafe

**Locations:** `skill/unsafe-and-ffi.md:109,118,123`.

The mandatory `rust_drop_T` still performs `Box::from_raw(p)` without first distinguishing an
ownership-transferring handle from borrowed/static data, accepting null safely, and guaranteeing exact
origin and exactly-once destruction. A destructor panic at an `extern "C"` boundary can abort. Export a
destructor only for handles minted by the paired constructor, make null a no-op or reject it before
`from_raw`, document origin/liveness/exactly-once, and contain the explicit panic policy.
[`Box::from_raw`](https://doc.rust-lang.org/std/boxed/struct.Box.html#method.from_raw),
[Rust ABI unwinding](https://doc.rust-lang.org/reference/items/functions.html#unwinding).

### P1 conditional — poison recovery exposes potentially invalid state

**Location:** `skill/async.md:34-39`.

`PoisonError::into_inner` is still offered as the general recovery policy. A panic between two writes that
maintain a relational invariant leaves partially updated state, and unconditional recovery publishes it.
Propagate by default; recover only after validating or rebuilding the protected value and then clearing the
poison. P1 applies to safety-, money-, admission-, or durability-critical invariants; ordinary recoverable
state is P2. [Rust `Mutex` poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html#poisoning).

### P1 conditional — `abort()` is still called graceful shutdown

**Location:** `skill/async.md:270-273`.

Aborting an async task drops its future at an `.await`; it does not let asynchronous flush, acknowledgement,
or protocol-close work finish. Graceful shutdown requires cooperative signalling, cleanup, and awaiting the
task. `abort()` is an emergency fallback after a deadline. P1 applies when the promised graceful shutdown
protects durable or externally visible state.
[Tokio graceful shutdown](https://tokio.rs/tokio/topics/shutdown),
[Tokio task cancellation](https://docs.rs/tokio/latest/tokio/task/#cancellation).

### P1 conditional — thread plus channel is still not a hard regex timeout

**Location:** `skill/data-and-types.md:33`.

`recv_timeout` times out only the waiter. Dropping the worker's `JoinHandle` detaches the catastrophic
backtracking match, so hostile requests accumulate CPU-consuming threads. Remove this as a hard-timeout
example; require an engine-native enforced limit, cooperative work in bounded chunks, or a killable
subprocess. [Rust `JoinHandle`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html).

### P1 conditional — idle timeout alone does not stop slowloris progress

**Locations:** `skill/semantics-and-conformance.md:70,77`, `skill/SKILL.md:392`.

A peer can send one byte just before each resettable idle deadline and keep a frame incomplete forever.
Idle timeout protects against silence, not arbitrarily slow progress. Require an absolute whole-frame or
handshake deadline, or a minimum progress rate; an idle timer may be an additional long-lived-connection
policy, not the alternative. [Apache `mod_reqtimeout` minimum-rate model](https://httpd.apache.org/docs/2.4/mod/mod_reqtimeout.html),
[Tokio `timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html).

## P2 findings

### Corrections introduced by `d855da7` that are themselves wrong

| Location | Finding | Required correction |
|---|---|---|
| `skill/async.md:215-221,286-287` | Says `futures::executor::block_on` does not panic and a current-thread Tokio runtime necessarily deadlocks. Future panics propagate; nested futures executors can reject entry; a ready future can complete inside current-thread Tokio. | Describe outcome by executor/runtime and dependency of the awaited future. Restore the supported Tokio bridge `block_in_place(|| Handle::current().block_on(fut))` where applicable. [`futures_executor::block_on`](https://docs.rs/futures-executor/latest/futures_executor/fn.block_on.html), [Tokio `block_in_place`](https://docs.rs/tokio/latest/tokio/task/fn.block_in_place.html). |
| `skill/concurrency-and-state.md:44` | `let (guard, _) = cv.wait_while(...)` does not compile: `wait_while` returns `LockResult<MutexGuard<T>>`, not a tuple. The lost-notification explanation is also wrong when the predicate is mutated under the same mutex because `wait` atomically unlocks and blocks. | Use `let guard = cv.wait_while(...).unwrap();`; retain the loop for spurious wakeups and discuss lost notifications only for a notifier that violates the mutex protocol. [`Condvar::wait_while`](https://doc.rust-lang.org/stable/std/sync/struct.Condvar.html#method.wait_while). |
| `skill/concurrency-and-state.md:175,179,185` | A locked Tokio MPSC receiver is called a message-stealing correctness race. For a competing-worker queue, one job going to whichever worker receives it is intended; recommended Flume MPMC has that same distribution semantic. | Separate competing workers, broadcast-to-all, and routed/affine per-worker queues. Treat the mutex wrapper primarily as serialization/ergonomics unless the required delivery semantic differs. |
| `skill/deps-macros-ergonomics.md:82` | Proposes `pub use serde as __serde` in the proc-macro crate. Proc-macro crates may export only procedural macros, so this remedy is rejected by rustc. | Put the re-export in an ordinary runtime/facade crate, use a documented crate-path attribute, or resolve the consumer dependency name with `proc-macro-crate`. [Rust Reference: proc-macro linkage](https://doc.rust-lang.org/reference/linkage.html#r-link.proc-macro). |
| `skill/deps-macros-ergonomics.md:107,114` | Correctly admits an incompatible transitive version can coexist, then still promises workspace inheritance gives “one version, one linked copy.” | Say it reduces direct-member drift; verify the resolved graph with `cargo tree -d`. [Cargo resolver](https://doc.rust-lang.org/cargo/reference/resolver.html). |
| `skill/lifetimes-and-api.md:110` | The private-field SemVer exception is too broad for tuple structs. `pub struct Foo(pub i32, i32)` already has a private field, but inserting one before `.0` changes downstream positional access. | Limit the exception to named structs, or require tuple-field indices/visibility to remain stable. [Cargo SemVer tuple-struct rule](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private). |
| `skill/testing.md:31` | Recommends `debug_assert_matches!` as a test oracle even though the required release-mode test job disables it. | Use `assert_matches!` in tests; reserve the debug macro for debug-only non-test invariants. [`debug_assert_matches!`](https://doc.rust-lang.org/stable/std/macro.debug_assert_matches.html). |

### Round-5 P2 findings still open

| Module/location | Still-open defect |
|---|---|
| `skill/async.md:20-22` | Blanket preference for Tokio locks still contradicts the guard-lifetime rule in the concurrency module. |
| `skill/unsafe-and-ffi.md:37,106` | Blanket ban on `Box<T>` at FFI ignores the documented sized-`Box<T>`/C-pointer ABI; scope the rule to ownership and nullable-input semantics. [Rust `Box` memory layout](https://doc.rust-lang.org/std/boxed/index.html#memory-layout). |
| `skill/unsafe-and-ffi.md:107` | `Box::from_raw` origin is narrowed to “same Rust binary/same global allocator”; the real contract is the exact layout/allocator/ownership expected by `Box`, including custom-allocator forms where supported. |
| `skill/data-and-types.md:72` | `(lo + hi) / 2` is called safe merely because both indices are in range; the addition can overflow. Use `lo + (hi - lo) / 2` after proving order, or `usize::midpoint`. |
| `skill/security.md:27,42` | “Argon2, not bare PBKDF2” conflicts with the module's own valid PBKDF2 floor and compliance-constrained deployments. Prefer Argon2id; permit PBKDF2-HMAC-SHA256 when the external requirement demands it. |
| `skill/security.md:33` | Every `StdRng`/seedable RNG is classified as insecure, although `StdRng::from_os_rng()` is a CSPRNG securely seeded from OS entropy. Ban predictable/reused seeds and non-crypto generators instead. [`rand::rngs`](https://docs.rs/rand/latest/rand/rngs/). |
| `skill/deps-macros-ergonomics.md:22`, `skill/SKILL.md:55,75` | A manifest requirement such as `"1.40"` is still called the exact resolved version. Applications inspect the lock/metadata; libraries test their supported range. [Cargo.toml vs Cargo.lock](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html). |
| `skill/deps-macros-ergonomics.md:49` | Exact manifest pins plus a committed lockfile remain blanket policy for every crate. Distinguish deployable applications from published libraries whose consumers do not use the library's lockfile. |
| `skill/deps-macros-ergonomics.md:170`, `skill/SKILL.md:283` | Unicode normalization is prescribed for every text key, including opaque identifiers/protocol tokens whose domain requires exact identity. Apply it only when the domain defines canonical equivalence. |
| `skill/deps-macros-ergonomics.md:174` | POSIX `shlex` is presented as a generic argv parser despite different Windows quoting/backslash rules. Prefer `Vec<OsString>` or name the exact platform grammar. |
| `skill/drop-and-raii.md:20` | `drop(guard)` is presented as sufficient before `process::exit`, but fallible `flush`/`sync_all`/commit errors can already have been discarded. Explicitly perform and check the resource-specific operation first. |
| `skill/drop-and-raii.md:21` | `catch_unwind` is presented as sufficient for non-panicking `Drop`; dropping the caught arbitrary panic payload can itself panic. Keep `Drop` intrinsically non-panicking or explicitly isolate/leak an untrusted payload. [`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html). |
| `skill/testing.md:22` | Merely feature-gating an ignored test still lets CI never compile or execute it; require a named CI job enabling the feature plus ownership/expiry. |
| `skill/testing.md:104` | Reaping Windows processes by `<crate>-<hex>.exe` filename can kill another concurrent job. Use a unique `CARGO_TARGET_DIR` and recorded job-owned PIDs/process trees. |
| `skill/testing.md:113` | Allocation/instruction/syscall counters are promised reproducible across machines although allocator, ISA, compiler, target and OS affect them. Pin the environment or scope the guarantee. |
| `skill/semantics-and-conformance.md:105` | Property generators are said to avoid author blind spots, but a narrow strategy can omit every meaningful delimiter, empty, invalid and Unicode boundary case. Treat the strategy as part of the oracle and keep an explicit boundary corpus. |

### Repository, evidence and release integration

1. **Missing synthesized fix plan.** `CHANGELOG.md:11` says the plan was synthesized and landed and
   promises full evidence for 70 entries, but `git cat-file -e
   9d8fc6e:docs/reviews/fix-plan-2026-08.md` fails. Commit the artifact or remove/replace every claim and
   link. The untracked working-tree copy is not evidence contained in the reviewed commits.
2. **Release-policy contradiction.** The changelog's own policy makes substantive additions MINOR, while
   the Unreleased entry explicitly adds eight gaps, new trigger rows and new BANNED/REQUIRED obligations
   yet calls the batch PATCH-shaped. Either classify it as MINOR or narrow and justify the policy so these
   additions are actually PATCH-compatible. The commit message repeats the contradiction.
3. **Later-review correction ledger omitted.** `docs/reviews/README.md:19-20` records corrections to round 3
   discovered by round 4, but contains no explicit round-4 disposition for the claims round 5
   retracts/narrows. Round 6 also corrects round-5 claims, so the next corrective commit needs explicit
   round-4→round-5 and round-5→round-6 ledger rows under the ledger's own quality gate.
4. **Validator misses the public README.** The stale-count scan is limited to the files in
   `categoryCountMentions`; `README.md` is not one of them. A negative mutation of the current public
   banner from 59 to 58 still returns exit 0. Add README and every published metadata surface to a single
   derived scan, and add a fixture that proves an additional stale count fails.

## P3 accuracy and calibration findings

These do not independently block release, but should be fixed in the same accuracy pass:

| Location | Finding |
|---|---|
| `skill/concurrency-and-state.md:27` | `get()` is said to retry a failed `OnceLock` initializer; it only observes `None`. Only a later `get_or_init` retries. |
| `skill/concurrency-and-state.md:98` | Separate pool operations are said to run on different connections; they **may** do so, therefore same-connection identity is not guaranteed. |
| `skill/concurrency-and-state.md:104` | Inc/dec pairing is covered, but `fetch_add` wraparound itself remains unqualified. |
| `skill/concurrency-and-state.md:128` | The accept-loop prose claims error classification/backoff not present in the example. |
| `skill/concurrency-and-state.md:163` | Safe `RefCell` conflicts are still described as dangling; safe conflicts panic instead. |
| `skill/data-and-types.md:28` | A `PartialOrd`-only type passed to `.sort()` is an impossible witness (`sort` requires `Ord`); an explicit `sort_by` comparator can be total. Target `partial_cmp(...).unwrap()` or an inconsistent comparator. |
| `skill/data-and-types.md:32,212` | `foldhash` remains banned for every untrusted key rather than stating the documented adaptive-observer boundary. |
| `skill/security.md:41` | Username-derived salts do not make different users' same-password hashes identical; the defects are predictability and reuse for the same username/credential. |
| `skill/security.md:52` | Standard equality has no constant-time guarantee, but Rust does not promise a first-mismatch implementation. |
| `skill/security.md:91` | The final SQLx sentence still describes a runtime formatted string reaching `query!`, which requires a compile-time literal. |
| `skill/security.md:43` | Twelve-byte GCM nonces are universalized beyond the selected RustCrypto alias/API, and silent truncation is asserted without a pinned implementation. |
| `skill/unsafe-and-ffi.md:16` | Function-pointer `transmute` is target-dependent, not categorically wrong when the ABI/representation proof exists. |
| `skill/unsafe-and-ffi.md:114` | Not every imported pointer-taking function necessarily has caller preconditions; classify by the foreign contract, not pointer syntax alone. |
| `skill/deps-macros-ergonomics.md:51` | A warning for every already-locked yanked dependency is promised without a portable Cargo guarantee. |
| `skill/lifetimes-and-api.md:84` | Adding an overlapping blanket impl (coherence conflict) is conflated with narrowing/removing coverage (downstream bound no longer satisfied). |
| `skill/lifetimes-and-api.md:104` | Growable tuple variants are omitted from the variant-level `#[non_exhaustive]` explanation. |
| `skill/SKILL.md:85` | The trigger still asks for two same-scope disjoint calls, an ineffective lifetime-laundering witness; use a shorter-lived source that ends before later cache use. |
| `skill/SKILL.md:202,325` | “Any added struct field is major” remains unqualified despite the named-private-field exception in the module. |
| `skill/drop-and-raii.md:11,15` | One paragraph correctly scopes awaited SQLx rollback to observable completion/error, while another requires it on every error path. |
| `skill/SKILL.md:323` | Passive sender/handle field ownership is still labelled a join deadlock although dropping a bare handle detaches; trigger only when shutdown actually joins before closing. |
| `skill/testing.md:16,27` | `should_panic(expected)` can still pass when setup panics with the same substring; isolate only the SUT call. |
| `skill/testing.md:29` | Property testing explores input domains, not scheduler nondeterminism; use Loom/schedule control/stress for the latter. |
| `skill/testing.md:55-63` | Intentionally mixing unit and integration tests remains banned as a correctness defect despite being Cargo's normal model. |
| `skill/testing.md:73,79` | Loom guidance omits the need to execute through `loom::sync` primitives/cfg aliases inside the model. |
| `skill/testing.md:74,88,97` | A stable libtest per-test timeout that kills a hung test thread is assumed but does not exist; name the external harness/process semantics. |
| `skill/semantics-and-conformance.md:78` | Cancellation **may** partially fill the caller-owned buffer; the text categorically says bytes were consumed into the dropped future's buffer. |
| `skill/semantics-and-conformance.md:19` | A positional schema change can reinterpret compatible payloads **or** fail decoding; it does not silently reinterpret every stored value. |
| `skill/semantics-and-conformance.md:118-132` | The shown `x;y` value still round-trips through `split_once('=')`; use `key = "a=b"` or show the missing list parser. |
| `skill/SKILL.md:318` | The `select!` trigger remains less precise than the corrected module rule about re-polling completed futures. |

## Delta closure matrix

| Area | Closed accurately by `d855da7` | Still open or regressed |
|---|---|---|
| Unsafe/FFI | `MaybeUninit` read pattern, provenance APIs, raw-slice allocation/overflow invariants, panic payload type, broader FFI layout calibration | destructor contract; `Box`/origin overreach; invalid enum input; live env mutation; pointer-import overreach |
| Async | cancel-safe framed-read example, async-drain contradiction, scoped `Notify` race, non-panicking close guard, `spawn_blocking` caveat, instrumentation secrets | poison recovery; graceful shutdown; runtime bridge regression; mutex inconsistency; imprecise trigger |
| Concurrency/state | mutex choice, scoped-thread panic wording, retained-byte queue sizing, drop-newest semantics, sender metrics, bounded priority queue | `OnceCell` effect duplication; Condvar example; MPSC semantics; several precision defects |
| Data/types | bounded `read_to_end`, Serde absent/null, `zip_eq`, display casing, `HashSet` duplicate representative, clone reporting, BufReader/BufWriter | regex hard timeout; midpoint overflow; malformed sorting witness; foldhash calibration |
| Security | JWT algorithm/audience, rustls certificate iterator, `black_box`, symlink writes, SQLx bind API, SSRF, cookie/path additions | PBKDF2 contradiction; `StdRng`; deterministic salt, equality, SQLx macro and nonce precision |
| Drop/RAII | SQLx queued rollback wording, actual drop-order rules, static shutdown, pooled transaction identity | fallible cleanup before exit; caught payload drop; rollback scope; passive-handle trigger |
| Deps/macros | workspace target selection, incompatible-version witness, `rustc-check-cfg`, runtime query corruption witness | manifest/resolution model; lockfile policy; invalid proc-macro re-export; one-copy promise; Unicode/shlex |
| Lifetimes/API | realistic laundering proof, enum-vs-variant distinction, external reachability, non-retroactivity | tuple-struct SemVer; blanket impl conflation; stale/incomplete triggers |
| Testing | grep status, float calibration, test visibility, workspace selection, env mutation caveat | release-disabled oracle; ignored-test CI; unsafe process reaping; counter portability; harness/property/Loom claims |
| Semantics/conformance | prior-release golden bytes, EOF qualification, socket ownership, scoped `Display`/`FromStr` contract | idle deadline; generator oracle; cancellation and positional overstatements; invalid `x;y` witness |

## Commit-by-commit disposition

| Commit | Disposition |
|---|---|
| `eca76bf` | Partial corrective change; later reviews found remaining factual and deployment issues. |
| `3bce0e1` | Partial corrective change; its dyn-compatibility commit-message claim is already recorded as incorrect. |
| `d1f3df6` | Useful completeness audit, but its candidate inventory/provenance remains unreconciled without the missing synthesized plan. |
| `39afc18` | Useful correctness audit; several claims required later correction. |
| `9a808f3` | Useful currency audit; chronology, severity and API claims required later correction. |
| `d095250` | Documentation-only round 3; findings were not normative fixes and some were later corrected. |
| `eb3b1d3` | Documentation-only round 4; strong additional findings, with some corrections required by round 5. |
| `44475ba` | Documentation-only round 5; its four high-priority gaps were not fully closed by `d855da7`, although some lower-severity findings were closed. |
| `d855da7` | **Request changes.** Closes many round-3/4 items but omits round-5 blockers and introduces the enum/env/OnceCell, Condvar, proc-macro and other regressions above. |
| `9d8fc6e` | **Partial.** Workflow wording is correct and the stale-count scan catches coexisting stale counts in selected metadata, but it omits README and lacks a negative regression fixture. |

## Verification evidence

All commands below were run in a clean detached worktree at `9d8fc6e`; the user's dirty worktree was not
used as test input.

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files, 2 fixtures |
| `node --check dev/validate.mjs` | PASS |
| `node --check skill/audit-project.workflow.js` | PASS |
| `node --check skills/rust-intel/audit-project.workflow.js` | PASS |
| `git diff --check 44475ba..9d8fc6e` | PASS |
| `git diff --check 7a567a6..9d8fc6e` | PASS |
| `npm pack --dry-run --json` | PASS — 37 entries, packed 512,051 bytes, unpacked 1,432,482 bytes |
| Pack integrity | `sha512-6EYt6hG5JoBruMBlX8QCTjLqLEozYqnrSBp/8oMCKBuUyVpFc4OYFY3Jd32XlomwztNY862rVuht0rv6H4dSLw==` |
| Toolchain | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |
| Negative control: README `59 categories` → `58 categories`, then `node dev/validate.mjs` | **Unexpected PASS / exit 0** — confirmed validator false negative; mutation was reverted |
| `git cat-file -e 9d8fc6e:docs/reviews/fix-plan-2026-08.md` | **FAIL / missing object** — confirmed broken evidence reference |
| Installed-skill hash comparison | All 11 installed normative files equal `7a567a6`; 0/11 equal `9d8fc6e` |

## Required fix order

1. Fix the eight P1/conditional-P1 rules. Add compile fixtures where applicable, deterministic behavioral
   reproducers for `OnceCell`/shutdown/regex/deadline cases, and contract/Miri-backed witnesses for UB;
   do not attempt to execute invalid-enum or environment-race UB as an ordinary runtime test.
2. Correct the non-compiling or false remedies (`Condvar`, proc-macro re-export, runtime bridge) and remove
   categorical guarantees unsupported by the APIs.
3. Close the remaining round-5 P2/P3 matrix, then add explicit round-4→round-5 and round-5→round-6
   correction rows to the review ledger.
4. Commit the synthesized fix plan (or remove its claims), reconcile the release classification, and make
   the claimed item count mechanically auditable.
5. Extend category-count validation to every public/published surface, add a failing stale-count fixture,
   and keep README among the required files.
6. Re-run `node bin/install-codex.js` after the corrected commit and verify installed hashes against the
   canonical `skill/` tree; start a new Codex thread so it loads the updated skill.
7. Re-run the clean validation/package checks and a final ten-module synthesis before release.
