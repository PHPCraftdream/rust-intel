---
description: Maps an error (rustc / clippy / panic / runtime anomaly) onto a rust-intel category and proposes a root-cause fix.
argument-hint: "<error message or behavior description>"
---

# /rust-cc-fix

Removes the developer's need to navigate rustc docs and StackOverflow. Takes a symptom — returns the cause, the fix, **and** a preventive rule so it doesn't recur.

## Arguments

- `$ARGUMENTS` — a `rustc` message, `cargo clippy` output, panic backtrace, or runtime-behavior description in natural language. May be multiline.

## Process

1. **Load the `rust-intel` skill.** If unavailable, emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.

2. **Classify the input:**
   - Compiler error (has `error[EXXXX]` or `error:` marker).
   - Clippy warning (has `warning: ... #[warn(clippy::...)]`).
   - Panic / runtime stack trace (has `thread 'main' panicked` or a backtrace).
   - Natural-language anomaly (deadlock, OOM, slow, intermittent flake).

3. **Request context — block only on the three security-critical cases:**
   - For a compiler error — need the relevant source lines (or the file path). If neither is provided, state your reading of the error as an explicit assumption, give the general form of the fix, and ask for the actual fragment — don't fabricate code you haven't seen.
   - For runtime symptoms — need the resolved versions (`Cargo.lock`/`cargo metadata`; `Cargo.toml` only declares ranges) and a repro scenario, if the category depends on either (§A1, §B4).
   - **Hard-block** — the spec's canonical ⚠️ BLOCKED form — only on the core's irreversible / security-critical three: cryptographic code with an unstated threat model (§B12); `unsafe` code with unstated caller-upheld invariants (§B5); a dependency the user did not name and whose existence is unverified (§A1).
   - Every other gap — unknown versions, missing source, an unclear cancellation context — does **not** block: proceed with explicitly stated assumptions, each recorded in an `// ASSUMES:` comment block at the top of the answer, and ask the user to confirm (per the skill's Blocking protocol).

4. **Map to a category.** Use the routing table below — it is **only a router** (symptom → category number). The actual rule wording, BANNED/REQUIRED bullets, and remediation guidance live in the skill, never duplicated here. Whenever a new category lands in the `rust-intel` skill, extend this routing table accordingly. Table is non-exhaustive — when no row matches, read the spec's taxonomy directly.

   | Symptom | Category |
   |---|---|
   | E0433, E0432, E0425, E0412, E0405 | §A1 (project organization, API hallucination) |
   | E0277, E0308, E0599, E0407 | out-of-scope (compile-only — rustc's message is sufficient). But scan the reflexive "fix" for §A2 (reflexive `Arc<Mutex<T>>`), §A3 (`pub` to silence E0603), §C5 (`.clone()` to silence borrows) residue. |
   | E0277 with `Send` / `Sync` in the bound | §B2 / §B15 / §B18 — the missing-`Send` is usually a symptom of a guard held across `.await`, a Pin/RPITIT mismatch, or a manual `unsafe impl Send` that was wrong. |
   | CI passes today, fails next week / for a new contributor with "candidate versions … were yanked"; `--locked` build was green against a yanked pin | §A1 (yanked-version handling — `--locked` warns-not-errors on a yanked pin; add `cargo deny check advisories` / `cargo audit -D warnings` in CI; fix with a *targeted* `cargo update -p <crate>`, never a blanket `cargo update`) |
   | Reproducible build fails / different bytes on rebuild; `cargo build --offline` or `cargo vendor` fails; `build.rs` shells out to `curl`/`git`/`reqwest` | §A1 (network in your own `build.rs` — unpinned bytes outside the lockfile, no `--locked`/vendor integrity; vendor the artifact or fetch in a separate CI step with a hardcoded SHA-256 + offline fallback) |
   | A `[patch]`/git dependency built fine, then behavior changed after a lockfile refresh; `cargo audit` sees nothing for a patched crate | §A1 (a locked build does **not** follow remote HEAD — `Cargo.lock` pins the exact commit, so the change means a **re-resolution** (`cargo update`, lockfile regeneration, or a build with no committed lock) re-read the remote and moved the pin: pin a full `rev` to remove that drift, name a user-approved repo, state a removal condition; `cargo audit` keys on registry versions and can't attest a fork's bytes, but a configured `cargo vet` **can** audit git changes with exact-SHA deltas — route git/`[patch]` sources through vet; still the same trust decision as an unverified new dependency) |
   | E0596, E0594, E0502, E0499 | §C5 candidate (but check the ownership design first — don't slap `.clone()`) |
   | E0106, E0495, E0521 | §B1 (lifetime laundering / leaking) |
   | `clippy::await_holding_lock` | §B2 (but clippy catches ~30% — check hidden cases too) |
   | `clippy::clone_on_copy`, `clippy::redundant_clone` | §C5 |
   | `clippy::unwrap_used`, `clippy::expect_used` | §C2 |
   | A path under an attacker-mutable directory is `canonicalize`d + `starts_with(base)`-checked, then `open`ed / read — escape reported despite the check | §C2 (TOCTOU — the static check is not race-free; CWE-367; use `openat`+`O_NOFOLLOW` or the `cap-std` crate when the tree is attacker-mutable; also a trailing `/` on the path — `lstat`/`symlink_metadata` and `O_NOFOLLOW` follow the final symlink, so build checked prefixes and the opened path from `components()`, and require `cap-std` ≥ 4.0.3 / ≥ 3.4.6 with the resolved `cap-primitives` verified in `Cargo.lock`, GHSA-hp8f-xmx4-4qrg) |
   | `clippy::missing_safety_doc`, `clippy::undocumented_unsafe_blocks` | §B5 |
   | `clippy::not_unsafe_ptr_arg_deref` ("this public function might dereference a raw pointer but is not marked `unsafe`"), or an `#[allow]` of it on an export | §B25 (an exported `extern "C" fn` that dereferences, `Box::from_raw`s or slices a pointer argument must be `pub unsafe extern "C" fn` with a `# Safety` section; a null check does not discharge it; never `#[allow]` the lint on an export) |
   | `clippy::non_canonical_partial_ord_impl`, `clippy::derive_ord_xor_partial_ord`; or `<`, sort order or `max`/`min` results changed after a toolchain upgrade to Rust 1.98 with no source change | §B16 (a derived `partial_cmp` delegates to `Ord::cmp` since 1.98.0, exposing a `PartialOrd`/`Ord` inconsistency in a field type — write `Some(self.cmp(other))`, add a `partial_cmp == Some(cmp)` property test; do not `#[allow]` the lints) |
   | panic "Cannot start a runtime from within a runtime" | §B15 (block_on inside async) |
   | panic "cannot recursively acquire mutex" | §B9 (lock ordering / re-entry) |
   | panic "cannot convert float seconds to Duration" (or a panic in `Duration::mul_f64`/`div_f64`/`mul_f32`/`div_f32`) | §B27 (`from_secs_f64`/`from_secs_f32` panic on a negative, non-finite or overflowing float — use `try_from_secs_f64`/`try_from_secs_f32` (stable 1.66), handle the `Err`, validate the factor before `mul_f64`/`div_f64`) |
   | panic "PoisonError" / `poisoned lock` | §B2 (poisoning cascade) |
   | Task hangs, `Poll::Pending` forever, 0% CPU, no panic | Three candidates — separate them by evidence: §B15b (a hand-written `poll` returned `Pending` without registering the waker); §B23 futurelock (a started future held across loop iterations / under `&mut fut` in `select!` / inside a drain loop that awaits, waiting on a fair lock, permit or channel slot the same task wants); §B15e (`Notify` lost wakeup with several waiters, or `notify_waiters` before anyone listened) |
   | State half-applied after a `timeout`, `select!` or `try_join!` cancelled a branch; a message written but never acked; a retry duplicates an effect | §B3 (cancel safety — prove drop-and-recreate and abandonment at every `.await`; §B23 for `select!` arms) |
   | Output missing after `process::exit`/`abort`; a shutdown hangs on `join()` while a `Sender` is still alive; a deadlock appears or disappears after the edition-2024 migration; a lock released at once after `let _ = guard` | §B4 (Drop skipped on non-unwinding termination; drop-order shutdown deadlock; `let _` drops immediately) / §B4a (edition-2024 temporary scope) |
   | After a minor release, downstream crates fail with `E0119`, a non-exhaustive `match`, a broken struct literal, or `E0038` on `dyn Trait` | §C1 (blanket-impl or trait-evolution break) / §C1a (missing `#[non_exhaustive]`) — semver-major; `cargo semver-checks` is the backstop |
   | `tokio` features fail on `wasm32`; `Instant::now()` panics in the browser; `async-std` and `tokio` types mixed; `std` paths in a `no_std` crate | §C3 (runtime and ecosystem coherence; §B27 for the wasm clock) |
   | A derive/proc-macro breaks in one consumer crate only (user-defined `Option`/`Result`, a renamed dependency); a proc-macro error shows as an opaque panic | §C6 (absolute `::core` paths, consumer-visible crate path, `syn::Error::to_compile_error`) |
   | A hand-written CSV/URL/JSON/HTML/version/glob parser passes its tests and fails on a quoted, escaped or non-ASCII input | §C12/§C12a (propose the catalog's crate per §A1; HTML sanitization, Markdown rendering and HTML escaping rows are 🔴) |
   | Deadlock without panic, two threads waiting on each other | §B9 |
   | A `std::thread::scope` block hangs / never returns; or a child-thread panic re-panics the parent at the closing brace, skipping cleanup | §B9 (scope auto-joins on the brace — close the channel / drop the sender / signal cancellation *before* the scope ends; inspect each `ScopedJoinHandle::join()` when cleanup must run regardless) |
   | Deadlock / all async workers wedge after touching a concurrent map (`DashMap`/`scc`); `clippy::await_holding_lock` stays silent | §B2 (a `Ref`/`RefMut` shard guard held across `.await` — store `Arc<OnceCell>`, clone out, drop the guard before awaiting) |
   | One core spins; a flush/drain/leader loop never recovers and never exits, waiters keep getting `Err` | §B3a (coordinator livelock — release leadership and `return` on a persistent error; bound/back off any retry) |
   | Steady-state RAM growth, OOM after days | §B10 (cycles) or §B14 (unbounded queue / insert-only cache with no eviction) |
   | Server OOMs / exhausts FDs under many concurrent clients; one task/socket per connection, no cap | §B14 (unbounded admission — `Arc<Semaphore>` + `acquire_owned().await` *before* `tokio::spawn`, permit *moved into* the task; not acquired inside the task and not dropped in the loop) |
   | Accept loop dies on the first `EMFILE`/`ECONNABORTED` (`?` propagated), or pins 100% CPU after a `warn!;continue` "fix" | §B14 (classify accept errors — fatal → stop, transient/`EMFILE`-class → brief `sleep` backoff then continue; not §B3a's release-and-return) |
   | RAM grows with request diversity; a per-user/IP/path `HashMap`/`DashMap` cache is never evicted | §B14 (insert-only keyed collection — LRU/TTL/cap via `lru`/`moka`, or prove the key cardinality is internally bounded; CWE-770) |
   | Deadlock/hang on an `RwLock` with only one lock involved; reproduces on prod OS but not dev; a helper re-reads a lock already read-held while a writer waits | §B17 (reentrant read under a waiting writer — std policy unspecified, tokio write-preferring; drop the guard before the reentrant call or pass the data down) |
   | Every client instance retries in lockstep after a shared outage; the recovering dependency is re-knocked-over by synchronized retry waves | §B3a (jitterless deterministic backoff → thundering herd — add full/decorrelated jitter and a retry budget) |
   | Latency spike under load, executor starvation | §B11 (blocking executor) |
   | "Under load, `expensive_fetch` runs N times instead of 1" | §B13 (TOCTOU) |
   | "Compiles and works on x86/dev, but garbage/race on ARM/AArch64; data published via an atomic is visible before the payload write" | §B13 (`Relaxed`-publish — use `Release`/`Acquire`, or `AcqRel`/`SeqCst` for RMW; model-check with `loom`) |
   | "The message/request/write didn't happen but no error either" | §B8 (forgotten `.await`) |
   | Encrypt/decrypt works, but security review finds a vulnerability | §B12 |
   | A token minted for another service/tenant authenticates; JWT verifies but `aud`/`iss` unchecked; expired token accepted | §B12 (claims not validated — `set_audience`/`set_issuer`/`set_required_spec_claims`; never `validate_exp = false`) |
   | TLS/certificate errors "fixed" with `danger_accept_invalid_certs` / a no-op cert verifier; MITM in prod | §B12 (validation bypass, CWE-295 — pin the internal CA, never disable) |
   | Password hashes identical for identical passwords; cracking one cracks a cohort; hashing "too slow" for tests | §B12 (fixed/reused salt or below-OWASP-floor KDF params — per-user `SaltString::generate` + OWASP floor) |
   | Secret still visible in a core dump / swap after `#[derive(ZeroizeOnDrop)]`; leaks on a return or `push_str` | §B12 (zeroize defeated by move/realloc — `Box`/`SecretBox` at creation, pre-size buffers) |
   | Crypto op is remotely timing-attackable with no code bug; `cargo audit` flags an advisory on `rsa` | §B12 (Marvin / RUSTSEC-2023-0071, fixed in `rsa` 0.10.0 — pin ≥ 0.10.0; for any advisory still open, keep the operation off attacker-timed paths) |
   | Byte-at-a-time plaintext recovery; a decrypt endpoint returns distinguishable "bad padding" vs "MAC failed" errors | §B24 (decryption-failure oracle — collapse to one opaque error; error context stops at the crypto boundary, cf. §C2) |
   | `HashMap::get` returns `None` but the value was inserted | §B16 (Eq/Hash contract mismatch) |
   | A worker pins at 100% CPU on a regex match / request times out on a specific input; the engine is `fancy-regex` / `onig` / `pcre2` | §B16 (ReDoS — catastrophic backtracking on untrusted input: keep untrusted input on the linear `regex` crate, or on a backtracking engine require BOTH an enforced input-size cap AND an engine-native step-limit/interrupt — or a killable subprocess; a `std::thread` + `recv_timeout` "timeout" or `tokio::time::timeout` around `spawn_blocking` is NOT a hard timeout — the detached thread / blocking closure keeps running the match) |
   | panic `already borrowed: BorrowMutError` | §B17 (RefCell reentrant borrow) |
   | `unsafe impl Send` / `unsafe impl Sync` without SAFETY justification | §B18 |
   | `untagged` enum deserializes to wrong variant | §B20 (variant shape overlap) |
   | OOM / process abort decompressing a small gzip/zip/tar body though the compressed size was capped | §B7 (decompression bomb — the compressed cap bounds the wrong side; `.take(MAX+1)` on the decoder's output) |
   | Stack overflow / SIGSEGV deserializing with `from_value` from a `serde_json::Value` that did not come through serde_json's text parser, or on deeply-nested YAML, though "serde_json has a recursion limit" | §B7 (the 128 limit is parse-phase only; `from_value` over such an AST bypasses it, while from-text paths through `IgnoredAny`/`flatten`/`untagged` stay bounded; verify the pinned serde_yaml version — depth checks landed in 0.8.4 per RUSTSEC-2018-0005 and the crate is now unmaintained — cap depth/input pre-parse; `serde_stacker` is stack growth WITHIN such a budget, not an alternative to one) |
   | Files appeared outside the extraction directory, or an extracted link overwrote something in `/etc`, `~/.ssh`, or the app root | §C2 (zip-slip/tar-slip — archive entry names are attacker-authored paths; reject `..`/absolute/rooted names, link entries and special files per entry; `cap-std`/`openat` when the destination is attacker-mutable) |
   | Disk or inodes exhausted by an archive that was small on the wire and whose individual entries were all tiny | §B7 (per-entry caps do not bound the aggregate — cap total bytes, entry count, and nesting depth against one shared budget) |
   | Untrusted length clamp passes but allocation still OOMs; `count * item_size` clamped then allocated | §B7 / §B26 (release-wrap multiply passes the clamp, original count OOMs — `checked_mul`; CWE-190→789) |
   | Client smuggles an extra/typo'd/duplicate JSON field past validation; or a privileged field like `is_admin` is accepted from the request (mass assignment) | §B20 (reject or canonicalize duplicate keys at the boundary; `deny_unknown_fields` on the untrusted request struct catches unknown and typo'd keys only — mass assignment is a *known* sensitive field, stopped by a request-specific DTO or an explicit writable-field allowlist) |
   | Deserialization slower / more allocation / errors lose position after adding `#[serde(flatten)]` or an internally-tagged/untagged enum; a `u128` field fails only behind `flatten` | §B20 (those paths buffer some or all entries into `Content` — how much depends on the path, format and schema, §E2; measure the actual path, the attribute itself is not the finding) |
   | Task started but no way to cancel or observe completion | §B21 (dropped JoinHandle) |
   | Owner's `Drop` never runs / a periodic task outlives its owner / `_exits_on_drop` test hangs | §B21 (timer task holds a strong `Arc` to its owner — hold `Weak`, exit on `upgrade()==None`) |
   | "Resource didn't close" / connection pool exhausted | §B22 (async Drop is not real) |
   | `tokio::select!` arm side effect lost on cancellation | §B23 |
   | "Timing-based authentication vulnerability" / CVE-class | §B24 (constant-time comparison) |
   | "Panic crossed extern \"C\" boundary" / "process aborted in FFI" | §B25 |
   | An exported `#[no_mangle] extern "C"` fn takes `&T`/`&str`/`bool`/`enum`; the C/Python/Node caller passes NULL/non-UTF-8/garbage and it segfaults or misbehaves inside "safe" Rust | §B25 (exported entry point trusts the type system — take `*const/*mut` + primitives, validate null/align/len/UTF-8/discriminant before minting any typed value; the read-direction mirror of §B5's validate-before-mint) |
   | Callback from a C library UAFs / double-frees / heap-corrupts after the owner dropped; the trampoline reclaims `Box<F>`; the callback fires after unregister | §B25 (callback-context lifetime — trampoline borrows, never owns; unregister → drain in-flight → free, in that order) |
   | Wrong/uninitialized `union` field read; UB from a bindgen'd union with no tag check | §B5 (union read without an active-field/tag check — tag-checked safe accessor + `// SAFETY:`; use an `enum` when the union only pairs with a Rust flag) |
   | Double-free / leak from one uniform FFI wrapper across a library whose functions differ in take/copy/borrow/return-owned | §B25 (per-function ownership audit — cite the C doc line per function; undocumented direction is a §B5 block-and-ask) |
   | FFI wrapper segfaults/races only under real concurrency though each handle is behind its own `Arc<Mutex>`; the C library has global state (`getenv`/`setenv`, non-reentrant parser, one-time init) | §B25a (the C library's own thread-safety contract — per-handle locks don't serialize the library's globals; cite the documented rules per operation: a process-global lock shared by every caller where the library permits serialized calls from those threads, the allowed (creator/main) thread where it restricts affinity — a lock never authorizes the wrong thread; CVE-2020-26235) |
   | `Error::last_os_error()` / `errno` reports the wrong error or success after a failing FFI call | §B25a (`errno` clobbered by an intervening call — capture it immediately, before any other call) |
   | `attempt to ... with overflow` panic (debug) / wrong result only in release | §B26 (integer overflow: debug-panic vs release-wrap) |
   | Numeric value wrong after a cast / `as` (`len() as u32`, `u64 as u32`) | §B26 (lossy conversion) |
   | `attempt to divide by zero` / `attempt to calculate the remainder with a divisor of zero` | §B26 (div/rem by zero) |
   | Duration looks wrong / negative / jumps; `.elapsed().unwrap()` panic | §B27 (wall-clock vs monotonic time) |
   | panic `byte index N is not a char boundary` | §B28 (UTF-8 string slicing) |
   | "string truncated mid-character" / non-ASCII corrupted | §B28 (char boundaries) |
   | "Channel kind wrong for runtime" / async-blocks-on-sync-channel | §C8 |
   | Tracing span missing in spawned task logs | §C9 |
   | Workspace member's feature unexpectedly enabled in release | §C10 |
   | `Deref` chain produces unexpected type / inheritance-style API breaks | §C11 |
   | Test passes locally, flakes on CI / `thread::sleep` in test | §D1 |
   | Test in `tests/` cannot compile after refactor | §D2 |
   | New test is green even with the fix reverted / on pre-fix code; snapshot blessed from a brand-new implementation | §D1a (oracle validity — the oracle is the code itself; add a negative control) |
   | A feature's tests are green but using it end-to-end fails or corrupts data; tests only check a config flag / header / status string — never exercise the behavior | §D1a (façade fitted to the test — Goodhart on the suite; add one end-to-end test that *uses* the feature, not just one that asserts it was announced) |
   | Works in tests, breaks in prod: wrong arithmetic only in release, timeout only at real data sizes, race only under real concurrency | §D3 (test/prod divergence) — release-wrap → §B26, scale → §E3/§B7, interleaving → §B13/§B9 |
   | CI reads green but a test actually hangs; `SLOW`/`TIMEOUT` lines never surfaced; test command piped through `grep`/`head` | §D4 (filtered live pipe without `set -o pipefail` masks the hang — gate on the runner or tee-to-file-then-grep; root-cause the hang) |
   | Windows: `LNK1104: cannot open file '…exe'` on a test/bench binary after a flaky run | §D5 (a zombie test process holds its own `.exe` — reap only the child PID(s)/process tree your own run recorded as its own, never by matching the `<crate>-<hex>.exe` filename (a concurrent job can produce the identical filename); the real fix is the hang, §D4) |
   | Own tests and round-trip green, but interop with the real peer / reference implementation / published vectors fails | §F1 (spec conformance — both halves share the same misreading; verify against the external oracle) |
   | Behavior contradicts what README/SECURITY.md/docs promise (token logged, untrusted input trusted, write not durable) | §F2 (documented guarantees — the doc, not the call graph, defines the boundary) |
   | Connection/FD/gauge leaks on error paths; a peer that connects and stalls pins a task forever; EOF busy-loop or peer never sees close | §F3 (boundary/error-path lifecycle; §B21/§B4 twins; no-timeout read on untrusted peer) |
   | `parse(display(x))` / `decode(encode(x))` corrupts data on special characters or boundary sizes | §F4 (round-trip law never tested over the domain — add the property test) |
   | Feature never activates, code is dead | §C7 (feature typo) |
   | Slow / high latency under load / high CPU / throughput collapses at scale | §E (systemic cost) — pick the law by shape: serial work → §E1, allocation → §E2, complexity/O(n²) → §E3, lock contention → §E4, recompute/Regex-in-loop → §E5; all under §E6 (measure first) |
   | Two sequential `.await`s / not parallel / CPU-bound stalls the runtime | §E1 (`join!`/`buffer_unordered`/`JoinSet`; `spawn_blocking`/`rayon` for CPU-bound) |
   | Too many allocations / high RSS / GC-like churn | §E2 (drop needless `clone`/`collect`/`format`; `with_capacity`, `Cow`/`&str`, reuse buffers) |
   | Works fast on small input, quadratic at scale | §E3 (accidental O(n²); wrong container) |
   | Lock contention / scales poorly across cores / `Mutex` hot | §E4 (atomics / `ArcSwap` / sharding) |
   | "Need a faster HashMap" | §E4 (hasher choice) + §B16 — pick by trust boundary: fast hasher for trusted input, DoS-resistant for untrusted |
   | Recompiles `Regex` / reparses every call / unbuffered I/O | §E5 (`LazyLock`; buffer I/O; reuse; lazy logging) |
   | A new enum variant was added and nothing failed to compile or warn; a `_ =>` arm swallows it silently, or panics later at runtime | §B6 (a wildcard arm hides the new variant at compile time — write explicit arms; a logged/typed fallback only for a foreign `#[non_exhaustive]` enum) |
   | A BFS/DFS or "visit everything" loop stops early and misses newly discovered items; or a `RefCell` borrow panics while the same vector is being iterated | §B19 (`for i in 0..vec.len()` captures the initial length; `borrow_mut` while an iterating `Ref` is alive) |
   | Output has fewer items than the input after `zip` or `collect` into a map; a `dedup` left duplicates behind; `chunks(0)`/`windows(0)`/`step_by(0)` panics | §B29 (`zip` truncates to the shorter side; `dedup` removes only adjacent duplicates; a zero size panics; `collect` into a map overwrites duplicate keys) |
   | Truncated or spliced messages under load that a local test never shows; `read`/`write` returned `Ok(n)` with `n` below the buffer length; the last bytes are missing after a `BufWriter` was dropped | §C4 (one `read`/`write` may transfer fewer bytes — `read_exact`/`write_all`; a `BufWriter` flush on drop discards its error) |

   If the symptom maps to **multiple** categories, list them all and explain which is primary.

5. **Compose the answer:**
   - **Category(ies):** `§XN` referencing the paragraph.
   - **Real cause:** one or two sentences. Not a paraphrase of the symptom — why it arises in light of the spec's rule.
   - **Why the "obvious" fix is bad** (when one exists — especially §C5 reflexive `.clone()`).
   - **Right fix:** code or patch for the user's concrete example. If code wasn't shown — general form plus an explicit request to share the actual fragment.
   - **Preventive rule** from the spec in one line: what to add to the style/checklist so it doesn't recur.
   - **What to run after the fix:** the matching clippy lint / miri / tokio-console — from the Post-flight checklist.

## Answer format

```
## §XN — <category name>

**Cause.** <…>

**The "obvious" fix that's also bad.** <when applicable — e.g. for a borrow error: "just add .clone()", per §C5>

**Right fix.**
```rust
<patch>
```

**Preventive rule.** <one line from the spec>

**Run after.** `cargo clippy -- -W clippy::await_holding_lock` (for §B2), `miri` (for §B5), `tokio-console` (for §B11), etc.

For Miri/cached CI, apply §D3's secret-free cache-producing-step and tool-build checks. For a SIMD/crypto backend fix, execute the affected production path's contract and invalid-input controls; record which backend actually ran.
```

## Behavioral principles

- **Root cause, not symptom.** "Just add `.clone()` to make it compile" is a forbidden answer; see §C5. First ask whether ownership can be restructured.
- **Don't guess versions.** If the fix depends on a version (`axum::Server::bind` disappeared in 0.7), request the resolved versions from `Cargo.lock`/`cargo metadata` — don't invent; if they can't be read, state the assumed version explicitly and proceed (stated assumptions — versions are not one of the three hard-block cases).
- **Acknowledge uncertainty.** The spec warns explicitly: ~50% of LLM cancel-safety assessments in empirical testing were confidently wrong (§B3). If the symptom touches cancel-safety, enumerate every `.await` point and prove — don't assert.
- **Don't restate the solution in disguise.** If you've already named the cause as §B2, don't recite its rules in full — reference.

## Limits

- Doesn't replace static analysis. If the user has lots of code and the location is unclear, redirect to `/rust-cc-audit`.
- Doesn't execute code. All fixes are textual suggestions; the user applies them.
