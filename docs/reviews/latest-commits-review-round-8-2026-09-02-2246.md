# Round 8 review of the latest commits — 2026-09-02 22:46 CEST

- **Range:** `7a567a6..30b1f67`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`, `d095250`, `eb3b1d3`, `44475ba`, `d855da7`, `9d8fc6e`, `949086f`, `a0955f9`, `43ae79d`, `30b1f67`
- **Delta focus since round 7:** `43ae79d..30b1f67`
- **Reviewed state:** revision-qualified committed blobs at `30b1f67`; pre-existing untracked work was excluded
- **Delta size:** 26 files, 212 insertions, 145 deletions
- **Method:** independent passes over all ten normative modules, cross-file trigger/tier review, repository/release integration review, current primary-source verification, clean detached-worktree tests and negative controls, followed by a separate synthesis review
- **Verdict:** **REQUEST CHANGES**

`30b1f67` is a useful corrective pass: it closes most of round 7's concrete examples, keeps both
distributed skill trees identical, fixes the real-worktree mutation in the category-count fixture,
and passes the repository's structural checks. It is not a complete or fully accurate closure.
Several fixes stop at the module body while the central activation or enforcement text remains stale;
some replacement recipes are themselves wrong. The new copied-tree fixture also introduces two
reproducible compatibility failures.

## Executive result

- **Four P1 or conditional-P1 paths remain.** Security-sensitive RNG use can still avoid §B12
  entirely. The slowloris replacement permits an indefinitely long stage at the minimum rate. The
  unsafe/FFI ABI-safe-type allow-list and generalized caught-panic containment/reporting guidance can
  still produce boundary failures.
- **Round-7 closure is mixed rather than total.** The matrix below separates the original defects
  that are functionally closed from new adjacent gaps and the still-partial slowloris remedy.
- **The delta adds concrete P2 regressions.** `dev/validate-fixtures.mjs` fails when the OS temp
  directory is configured below the repository, and `fs.cpSync` does not exist throughout the
  advertised Node `>=16` range. The new paused-time and `assert_matches!` fallback recipes are also
  incorrect.
- **Evidence and deployment remain incomplete.** The cited fix plan is absent from committed `HEAD`,
  the npm tarball publishes a changelog that points to review evidence it excludes, and the active
  Codex installation still matches the old `7a567a6` baseline in all 11 normative files.
- **Structural verification is green:** validator/fixture runs, JavaScript syntax, whitespace,
  canonical/mirror parity, and package dry-run all pass in the ordinary environment. Those checks do
  not exercise the semantic and environment-dependent failures below.

## P1 and conditional-P1 findings

### P1 — security-sensitive randomness does not activate the corrected §B12 rule

**Locations:** `skill/SKILL.md:198-201,310-315`; compare `skill/security.md:33-34`.

The module now correctly bans `SmallRng` for keys, nonces, salts, and tokens, but neither phrase nor
code triggers cover requests such as “generate an API token/nonce/key,” `SmallRng`, or deterministic
seeding in that context. Code consisting only of
`SmallRng::seed_from_u64(7).random::<[u8; 32]>()` can therefore avoid loading §B12. Add contextual
phrase and structural triggers for security-sensitive random generation and deterministic seeds.
Current rand explicitly classifies `SmallRng` as predictable and insecure.
[`SmallRng`](https://docs.rs/rand/latest/rand/rngs/struct.SmallRng.html).

### Conditional P1 — the slowloris fix still permits an infinite stage

**Locations:** `skill/semantics-and-conformance.md:70,77`; `skill/SKILL.md:291,392`.

The delta correctly rejects a resettable idle timer by itself, but accepts a minimum-progress-rate
check without also requiring a finite stage size or maximum duration. An unknown-length peer can send
at exactly the minimum rate forever, retaining its task, socket, and buffer forever. Line 77 first
requires an “absolute” deadline and then calls the rate check an alternative deadline shape.

Require either one absolute whole-stage deadline, or a minimum rate combined with a finite maximum
stage size from which a maximum duration follows; an unknown-length stage also needs an explicit
maximum duration. Apache likewise distinguishes rate-based extension from a configuration with an
upper timeout. [Apache `mod_reqtimeout`](https://httpd.apache.org/docs/2.4/mod/mod_reqtimeout.html),
[Tokio `timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html).

### Conditional P1 — the C-ABI-safe type list admits `char` and Rust-ABI function pointers

**Location:** `skill/unsafe-and-ffi.md:37`.

The recursive allow-list says `char` and unqualified “function pointers” are C-ABI-safe. rustc's own
FFI checker classifies Rust `char` as unsafe because it has no C equivalent, and classifies an ordinary
`fn(...)` pointer as unsafe because its default ABI is `Rust`. Require `u32`/the appropriate C type for
characters, and an explicit `extern "C" fn(...)` (usually `Option<extern "C" fn(...)>` when nullable).
This becomes a P1 when the advice is emitted as boundary code.
[rustc FFI checker](https://doc.rust-lang.org/stable/nightly-rustc/src/rustc_lint/types/improper_ctypes.rs.html),
[`fn` pointer ABIs](https://doc.rust-lang.org/std/primitive.fn.html#abi).

### Conditional P1 — caught-panic disposal and reporting are not fully contained

**Locations:** `skill/unsafe-and-ffi.md:117-118`; `skill/drop-and-raii.md:21`.

The destructor-specific recipe now borrows known string payloads and forgets an unknown payload, which
closes the original second-drop bug. The general FFI rule still does not give that disposal recipe,
and both modules mandate logging without requiring a non-panicking sink. `eprintln!` can panic when
stderr fails; at an `extern "C"` boundary this aborts, and during unwinding it can double-panic.

Provide one shared containment recipe for every boundary: borrowed downcast, deliberate non-drop of an
unknown payload, and a result-returning/proven non-panicking diagnostic path (or no diagnostic). If a
second `catch_unwind` is used around reporting, its payload needs the same safe disposal.
[`catch_unwind` payload warning](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html),
[`eprintln!` panics](https://doc.rust-lang.org/std/macro.eprintln.html#panics).

## P2 findings

### Normative accuracy and completeness

| Location | Finding | Required correction / grounding |
|---|---|---|
| `skill/async.md:145` | Blanket-banning `let _ = oneshot_sender.send(value)` rejects Tokio's documented best-effort idiom when receiver disappearance means the result is no longer wanted. | Require recovery only when delivery/value recovery is contractual; allow an explicitly best-effort ignored error. [Tokio oneshot `Sender`](https://docs.rs/tokio/latest/tokio/sync/oneshot/struct.Sender.html). |
| `skill/async.md:17`; `SKILL.md:204` | DashMap's sharded `Ref` model is attributed to SCC, but current `scc::HashMap` is non-sharded, bucket-locked, and exposes `*_async`/`*_sync` APIs. | Split the products and inspect the pinned SCC version/API. [`scc::HashMap` locking](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html#locking-behavior). |
| `skill/async.md:149-150` | “Always use `tokio::spawn`” does not compile for a valid `!Send` future on `LocalSet`. | Require the executor-appropriate primitive: `tokio::spawn` for `Send`, `spawn_local`/`LocalSet::spawn_local` for `!Send`, plus §B21 supervision. [Tokio `spawn_local`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_local.html). |
| `skill/SKILL.md:211` | Generic `block_on` is still equated with panic. Tokio `Handle`/`Runtime` entry, nested futures-executor entry, and futures-executor-inside-Tokio have different behavior; the last may complete or stall depending on the future/runtime. | State the three cases instead of one outcome. [Tokio `Handle::block_on`](https://docs.rs/tokio/latest/tokio/runtime/struct.Handle.html#method.block_on), [futures-executor source](https://docs.rs/futures-executor/latest/src/futures_executor/local_pool.rs.html#79-83). |
| `skill/concurrency-and-state.md:125` | The suggested `select!` fallback does not prevent an empty-set spin: `futs.next()` is immediately ready with `None`, so `else` is not selected. | Guard the arm with `if !futs.is_empty()`, pattern-match `Some(x) = ...` with `else`, or break/wait on `None`. [`FuturesUnordered::new`](https://docs.rs/futures/latest/futures/stream/struct.FuturesUnordered.html#method.new). |
| `skill/SKILL.md:100,359-361`; `skill/concurrency-and-state.md:125,127,129` | The canonical “surface always” list names only `unbounded_channel` and unbounded `FuturesUnordered`, while the structural table and module also detect unbounded `JoinSet` plus conditionally red attacker-extendable admission and keyed-growth shapes. | Align the central enforcement metadata with the structural detection and module severity rules so reporting cannot depend on which list is consulted. |
| `skill/data-and-types.md:33` | Untrusted patterns are said to require a hard timeout on **any** engine, while the same paragraph correctly permits bounded `regex`; the crate's supported defense is pattern/haystack and compiled-size bounds, not an unavailable engine timeout. | Separate bounded linear `regex` from backtracking engines that need an interrupt/step limit or killable process. [regex: untrusted inputs](https://docs.rs/regex/latest/regex/#untrusted-input). |
| `skill/lifetimes-and-api.md:123` | It excludes types behind private ancestors from public API, but callers can obtain an unnameable return type by inference and use its methods. | Audit leaked signature types too; enable `unnameable_types` alongside `unreachable_pub`. [rustc `unnameable_types`](https://doc.rust-lang.org/stable/rustc/lints/listing/allowed-by-default.html#unnameable-types). |
| `skill/lifetimes-and-api.md:86-91` | The prescribed `pub trait T: private::Sealed` snippet triggers warn-by-default `private_bounds` and fails under common `#![deny(warnings)]`. | Put a narrow documented `#[allow(private_bounds)]` on the intentional seal or show a lint-policy-compatible sealing shape. [rustc `private_bounds`](https://doc.rust-lang.org/stable/rustc/lints/listing/warn-by-default.html#private-bounds). |
| `skill/SKILL.md:109,297-325` | §C1's only red case, a public blanket impl, has no structural code trigger. | Add a row for `impl<T...> PublicTrait for T` and analogous uncovered blanket forms in a published API. [Rust Reference: blanket implementation](https://doc.rust-lang.org/reference/glossary.html#blanket-implementation). |
| `skill/deps-macros-ergonomics.md:95`; `SKILL.md:196,398` | The corrected stale-`build.rs` rule has no trigger; current `build.rs` triggers cover only network access. | Trigger on `cargo::rerun-if-changed`/build-script inputs and compare emitted paths with every input actually read. [Cargo build-script change detection](https://doc.rust-lang.org/cargo/reference/build-scripts.html#change-detection). |
| `skill/security.md:34`; `SKILL.md:451` | The paragraph discusses rand 0.10 but recommends removed `StdRng::from_os_rng()`, which is a rand 0.9 constructor. | Version-split: rand 0.9 `from_os_rng`; rand 0.10 `StdRng::try_from_rng(&mut SysRng)?` or typed `rand::make_rng()`. Expand the central migration pin. [rand releases](https://github.com/rust-random/rand/releases), [current `StdRng`](https://docs.rs/rand/latest/rand/rngs/struct.StdRng.html). |
| `skill/security.md:92-93`; `SKILL.md:269,378` | SQLx 0.9's public path is `sqlx::AssertSqlSafe`, not `sqlx::query::AssertSqlSafe`; current injection shapes using it or `QueryBuilder::push(untrusted)` are absent from triggers, and the phrase remedy says `QueryBuilder` without `push_bind`. | Correct the path; trigger `AssertSqlSafe(input-derived)` and `QueryBuilder::push(input-derived)`; prescribe `push_bind`. [`AssertSqlSafe`](https://docs.rs/sqlx-core/latest/sqlx_core/sql_str/struct.AssertSqlSafe.html), [`QueryBuilder::push`](https://docs.rs/sqlx/latest/sqlx/struct.QueryBuilder.html#method.push). |
| `skill/testing.md:30` | `yield_now().await` neither guarantees the spawned task constructed its interval nor accounts for `interval`'s immediate first tick; one yield plus one advance may produce zero, one, or two observed ticks relative to the recipe. | Use a ready handshake after interval construction and per-tick acknowledgements; consume the immediate tick separately, or use `interval_at(now + period, period)`. [Tokio `yield_now` non-guarantees](https://docs.rs/tokio/latest/tokio/task/fn.yield_now.html#non-guarantees), [`Interval::tick`](https://docs.rs/tokio/latest/tokio/time/struct.Interval.html#method.tick). |
| `skill/testing.md:31` | The MSRV fallback `matches!(value, pattern)` can move a non-`Copy` field and then borrow the partially moved `value` in the diagnostic, producing E0382. | Match `&value` where possible, manually `match &value`, or capture diagnostics before consumption. [Rust identifier-pattern binding modes](https://doc.rust-lang.org/reference/patterns.html#identifier-patterns). |
| `skill/SKILL.md:505` | The new workspace-aware post-flight leaves Miri bare, so a non-virtual workspace can omit unsafe member crates. | Use `cargo +nightly miri test --workspace`, or enumerate relevant `-p` members. [Cargo test package selection](https://doc.rust-lang.org/cargo/commands/cargo-test.html#package-selection), [Miri accepts cargo-test flags](https://github.com/rust-lang/miri#using-miri). |

### Tooling, evidence, and deployment

1. **The copied-tree fixture fails with a project-local temp directory.**
   `dev/validate-fixtures.mjs:70-88` creates its destination below `os.tmpdir()` and then recursively
   copies `root` into it. With both `TEMP` and `TMP` set to `$repo/.round8-tmp`, the run exits 1 with
   `ERR_FS_CP_EINVAL: Cannot copy ... to a subdirectory of self`. This is a supported and common CI/dev
   configuration. Resolve both paths and select a destination outside the source tree (or fall back to
   a verified sibling) before copying. The failed probe was cleaned and the detached worktree returned
   to a clean state.
2. **The fixture violates the declared Node floor.** `package.json:24` and `dev/validate.mjs:2` claim
   Node `>=16`, but `dev/validate-fixtures.mjs:73` uses `fs.cpSync`, added only in Node 16.7.0. Raise
   the floor to `>=16.7` (and test it), or use a compatible copy implementation.
   [Node `fs.cpSync` history](https://nodejs.org/api/fs.html#fscpsyncsrc-dest-options).
3. **The synthesized fix plan is still absent from committed `HEAD`.** `CHANGELOG.md:11,21` and the
   ledger cite `docs/reviews/fix-plan-2026-08.md`, but `git cat-file -e
   30b1f67:docs/reviews/fix-plan-2026-08.md` exits 128. An untracked local file cannot support a
   committed evidence claim. Commit a reconciled plan or remove/replace its citations.
4. **The active Codex installation was not refreshed.** Blob comparisons show all 11 installed files
   under `C:\Users\Computer\.agents\skills\rust-intel` equal baseline `7a567a6`, and 0/11 equal
   `30b1f67`. Repository fixes therefore are not the rules the active Codex session loads. Re-run the
   installer after the normative corrections land, then byte-compare the installation in CI or the
   release checklist.
5. **Published evidence is not self-contained.** `package.json:7-18` includes `CHANGELOG.md` but not
   `docs/reviews/`; the npm tarball therefore ships repeated “full evidence in docs/reviews” claims
   without any cited reports. Include the referenced evidence, or turn each citation into a stable
   repository URL that remains meaningful outside a checkout.

## P3 findings

| Location | Finding | Correction |
|---|---|---|
| `dev/validate.mjs:216-218,230-235` | The repaired scanner strips only `**`. A correct `**59**` banner plus `__58__ categories` still exits 0; `_58_`, `*58*`, and inline-code forms are the same class. | Normalize the supported Markdown wrappers before matching and add coexistence controls for alternative emphasis/code. |
| `skill/unsafe-and-ffi.md:113,122`; `skill/SKILL.md:334-335` | The generic `extern "C"` body trigger loads §B25 and the module bans every Rust enum representation, so the round-7 activation gap is closed; the narrower phrase “plain enum” is nevertheless ambiguous metadata. | Say “any Rust enum representation” and retain the integer-carrier validation recipe. [Rust Reference: C enum representation](https://doc.rust-lang.org/reference/type-layout.html#reprc-field-less-enums). |
| `skill/unsafe-and-ffi.md:106`; `CHANGELOG.md:39` | “C cannot produce” a Box-compatible pointer is overcategorical: a foreign shim can return an unchanged Rust-minted pointer, or meet an explicitly proven allocator/layout/validity/ownership contract. | Keep raw pointers as the default for imports, but state the proof obligation instead of impossibility. [`Box` memory layout](https://doc.rust-lang.org/std/boxed/index.html#memory-layout). |
| `skill/SKILL.md:336` | The `safe fn` import trigger still classifies pointer/handle syntax rather than the documented caller-precondition contract that the module now correctly makes decisive. | Trigger a contract check; do not label a pointer-taking import unsafe when it is valid for all values. |
| `skill/SKILL.md:309` | `if X { map.insert(...) }` is a TOCTOU trigger even for a local/single-owner condition. | Scope it to shared concurrent state or a check whose fact can change before insertion. |
| `skill/data-and-types.md:28` | The remaining `BTreeMap`/`BTreeSet` `PartialOrd`-only witness cannot compile either, because those containers require `Ord`. | Target inconsistent `Ord`, `partial_cmp(...).unwrap()`, or a non-total comparator. |
| `skill/data-and-types.md:32,212` | §B16 only bans fixed-seed `ahash`, while the catalog says the trusted-key boundary is non-negotiable for all `ahash`; default `ahash::RandomState` uses a unique runtime-random state and advertises DoS resistance. | Scope the ban/catalog warning to fixed or predictable seeding and state the accepted randomized contract. [`ahash::RandomState`](https://docs.rs/ahash/latest/ahash/random_state/struct.RandomState.html). |
| `skill/SKILL.md:247` | Every `Notify` is mapped to the multi-waiter `enable()` race, although `notify_one` stores one permit for the canonical single-consumer case. | Trigger the warning only for concurrent condition-check waiters or `notify_waiters` registration timing. [Tokio `Notify`](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html). |
| `skill/async.md:310`; `skill/SKILL.md:318` | The broad trap/trigger wording treats any side effect inside a `select!` arm future as defective, although the normative rules correctly permit atomic, idempotent, or otherwise recoverable cancel-safe operations. | Narrow the summary wording to the actual drop-and-recreate/recoverability criterion. [Tokio `select!` cancellation safety](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety). |
| `skill/async.md:215-218` | Manual `Future` guidance always demands storing a cloned waker. Delegating to a child future or self-scheduling before `Pending` can be correct without owning storage. | Require that a re-poll is arranged; require storage only when this future owns the external completion source. [`Future::poll`](https://doc.rust-lang.org/std/future/trait.Future.html#tymethod.poll). |
| `skill/SKILL.md:304` | Dropping a spawned `JoinHandle` activates §B8 “silent task drop,” although it detaches the already-running task rather than leaving its future unpolled. | Activate §B21 only unless a separate unspawned future is discarded. [Tokio `JoinHandle`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html). |
| `skill/drop-and-raii.md:15` | Literal `rollback().await?` on an existing error path can replace the primary operation failure with a rollback failure. | Define precedence and preserve both, typically with a composite/contextual error. [Rust `?`](https://doc.rust-lang.org/core/result/#the-question-mark-operator-). |
| `skill/lifetimes-and-api.md:110` | Tuple-struct compatibility is reduced to append-only private fields; inserting a private field after all existing public indices can also preserve the public API. | Make preservation of each public index/type/visibility the rule; append-only is merely sufficient. [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private). |
| `skill/deps-macros-ergonomics.md:204` | `rustls::ClientConfig` is again grouped with socket pools and blamed for FD/TIME_WAIT exhaustion, contradicting the corrected concurrency module. | Classify repeated config construction as recomputation/root-store parsing; reserve FD exhaustion for actual clients/pools. [rustls performs no network I/O](https://docs.rs/rustls/latest/rustls/). |
| `skill/deps-macros-ergonomics.md:51`; `SKILL.md:197` | The module qualifies Cargo's yanked-version warning as observed behavior, but the trigger states “with only a warning” as a portable contract. | State only the documented fact that an already-locked yanked version may remain, then require advisory policy. [Cargo yanked versions](https://doc.rust-lang.org/cargo/reference/resolver.html#yanked-versions). |
| `skill/deps-macros-ergonomics.md:88`; `SKILL.md:214` | “Unknown feature names never warn” is false at MSRV 1.85+: Cargo enables `unexpected_cfgs`; the warning can merely be ignored. | Say warn-by-default and require deny in CI. [Rust 1.80 announcement](https://blog.rust-lang.org/2024/07/25/Rust-1.80.0/). |
| `skill/deps-macros-ergonomics.md:82` | After offering a facade re-export, it still requires the consumer to depend directly on `serde`; a consumer using `::facade::__serde` needs the facade dependency, not a separate serde edge. | Scope the direct-dependency requirement to the strategies that resolve serde in the consumer namespace. [Rust `use` re-exports](https://doc.rust-lang.org/reference/items/use-declarations.html). |
| `skill/deps-macros-ergonomics.md:26` | A Cargo.toml removal-condition example uses `//`, which is invalid TOML comment syntax. | Use `# remove once ...`. [TOML comments](https://toml.io/en/v1.0.0#comment). |
| `skill/SKILL.md:377` | The semicolon makes every `.arg(format!(...))` an injection trigger, even a literal argv value after `--`; risk depends on shell use, option position, and target-program semantics. | Scope it to shell strings, untrusted option-position values, and special decoders such as `cmd.exe`/batch files. [`Command::arg`](https://doc.rust-lang.org/std/process/struct.Command.html#method.arg). |
| `skill/security.md:79`; `SKILL.md:87` | The module requires all `panic!`/`todo!`/`unimplemented!`/`unreachable!` sites in the summary, while canonical policy makes non-red instances inline-only. | Follow the canonical load-bearing policy or explicitly promote the cases centrally. |
| `skill/semantics-and-conformance.md:19`; `SKILL.md:394` | The positional-format rule treats all Borsh enums as ordinal and says old bytes always reinterpret. Borsh supports explicit discriminants; incompatible payloads may instead fail decoding. | Scope to default/derived ordinal encoding; inspect explicit tags/custom serializers; say “may reinterpret or fail.” [Borsh explicit discriminants](https://docs.rs/borsh/latest/borsh/derive.BorshDeserialize.html). |
| `skill/SKILL.md:292,478`; `skill/semantics-and-conformance.md:113-114` | Central triggers require `parse(display(x)) == x` for every Display/FromStr pair, while the module correctly limits it to a documented lossless machine format. | Copy the documented-contract qualification into the trigger/preflight. [`Display` may be lossy/unparseable](https://doc.rust-lang.org/std/fmt/trait.Display.html#completeness-and-parseability). |

## Round-7 closure matrix at `30b1f67`

| Round-7 high-priority item | Status | Evidence |
|---|---|---|
| Any enum at an exported FFI boundary | **Functionally closed; optional wording clarification** | The generic `extern "C"` body trigger loads §B25 and the module bans every representation; `SKILL.md:335` can still say “any enum” for clarity. |
| Direct `Box<T>` import direction | **Core closed; P3 wording issue** | Import defaults safely to raw pointers, but “cannot produce” overstates the actual proof obligation. |
| Required FFI destructor handling of panic payloads | **Round-7 defect closed** | The destructor safely borrows known strings and forgets an unknown payload; generalized boundary containment/reporting is a separate round-8 gap. |
| External-effect exactly-once | **Closed** | `SKILL.md:203` limits `OnceCell` to async compute/fetch deduplication and loads §B13, whose module rule requires provider idempotency or atomic effect+record coupling. |
| Poisoning exception for single-value invariants | **Closed** | `skill/async.md:45-46` now covers every protected invariant/state transition. |
| `SmallRng` treated as secure when OS-seeded | **Round-7 module defect closed** | The rule is correct; missing security-randomness activation is a separate round-8 gap. |
| Current jsonwebtoken bypass absent | **Closed** | `SKILL.md:312` includes `dangerous::insecure_decode`. |
| Idle timer accepted alone | **Partial** | Idle-only is rejected, but the replacement still admits a rate-only infinite stage. |

## Verification performed

All ordinary checks below ran in the clean detached worktree
`D:\dev\rust\rust-intel-round8-2246-clean` at `30b1f67` before deliberate negative controls.

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files; 2 fixture cases |
| `node --check` on both validators and both workflow scripts | PASS |
| `git diff --check 43ae79d..30b1f67` and `7a567a6..30b1f67` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` byte parity | PASS — 13 files |
| `npm pack --dry-run --json` | PASS — 37 entries, 542,127 bytes packed, 1,524,749 bytes unpacked; integrity `sha512-k6RQnlkWn5dHqTF6db4tqtrrvBgLhWDCufadRujP2z+BZlpLEG3npzox0/jN2dwtC0GRwiQ+J7KJbPRQBP+kwA==` |
| Tool versions for reproducibility | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |
| Stale-count negative control with `__58__ categories` beside correct `**59**` | **Unexpected PASS** — false negative reproduced |
| Fixture with `TEMP` and `TMP` inside repository | **Expected robustness test failed** — `ERR_FS_CP_EINVAL`, self-copy reproduced |
| Committed fix-plan existence | FAIL — object absent at `30b1f67` |
| Active Codex installation parity | FAIL — 11/11 files match `7a567a6`; 0/11 match `30b1f67` |

Both deliberate probes were cleaned up. The detached worktree was clean after them; the user's
pre-existing untracked `.githooks/` and `docs/reviews/fix-plan-2026-08.md` were not modified or staged.

## Recommended correction order

1. Repair the four red/conditional-red paths and make each module rule, phrase trigger, structural
   trigger, enforcement tier, and changelog disposition agree.
2. Fix the compiling/runtime-invalid P2 recipes: rand 0.10 RNG construction, SQLx paths/triggers,
   paused-time handshake/tick accounting, `assert_matches!` fallback, empty `FuturesUnordered`,
   executor-appropriate spawning, and the linear-regex policy.
3. Make the copied-tree fixture choose a destination outside the source, reconcile the Node floor, and
   extend Markdown negative controls beyond `**...**`.
4. Commit or withdraw the cited fix plan, make packaged evidence resolvable, then reinstall and
   byte-verify the Codex skill after normative fixes land.
5. Add regression witnesses for every partial closure above; the present two source fixtures do not
   measure trigger recall or cross-file semantic consistency.
