# Gap audit — completeness sweep across all ten modules (2026-08 cycle)

> **Status:** Research input, **not merged and not normative.** Written 2026-09-02 against the tree at `3bce0e1` (v0.6.0 plus the two post-release fix commits). Nothing in `skill/` was modified by this audit. If any finding below is integrated, the release's `CHANGELOG.md` entry and a row in [`README.md`](README.md)'s ledger are the post-merge regression record required by that ledger's quality gate; this file carries items (1)–(4) of that gate — candidate inventory, positive/negative calibration per accepted rule, a primary source per accepted rule, and an explicit out-of-scope list.

**Scope and method.** All ten theme modules, `SKILL.md` (scope line, enforcement tiers, both trigger tables, category→module map, version pins, pre/post-flight), `references/sources.md`, `docs/roadmap.md` (the rejected `no_std` draft and the deferred backlog), and the full `CHANGELOG.md` history back to v0.1.0 were read in full before any candidate was written down. The sweep was organised by the axes the maintainer named — newer language/edition features, the current async ecosystem, WASM, `no_std`/embedded, build/cross-compilation, crypto, `unsafe`/FFI, testing/CI, Tier F — and every candidate was then held to the spec's own gate as stated in `SKILL.md` and restated in the v0.6.0 changelog: **a concrete, nameable input or scenario on which the LLM's reflexive output compiles, passes a plausible test, and is silently wrong** — not "nice to mention", not style, not "a popular crate exists". Every "not already covered" claim below cites the bullet text it was checked against (`file:line` in `skill/`), and every accepted rule's mechanism was verified against a primary source (crate/std/Cargo documentation, an advisory, or a spec) during this audit, not recalled. Where a candidate is language-agnostic, that is said plainly and weighed against the precedent the spec already set by admitting SQL/OS-command injection (§C2) and TOCTOU (§B13) on the grounds that the LLM's prior produces them in Rust code.

**Headline.** Sixty-three candidates went in; **six** survive as gaps worth a rule (three of them are *unstated preconditions of the spec's own remedies* — the shape the eighth review pass in v0.3.0 established as first-class), **twenty** are bullet-level enrichments of existing categories (listed compactly, each with the input that makes it silent), and the rest are rejected or deferred with reasons. No new numbered category is proposed; every survivor lands as bullets in an existing §, which keeps the no-quota-filling discipline intact. The strongest three are Gaps 1–3; Gaps 4–6 are accepted with lower confidence about LLM-specificity and are argued as such.

---

## Candidate inventory

| # | Candidate | Axis | Disposition | Lands in |
|---|---|---|---|---|
| 1 | `Instant::now()`/`SystemTime::now()` panic on `wasm32-unknown-unknown` — §B27's own REQUIRED | WASM | **Accepted (Gap 1)** | §B27, §C3 |
| 2 | `#[tracing::instrument]` records every argument via `Debug` — §C9's own remedy leaks secrets | observability | **Accepted (Gap 2)** | §C9, §B12 |
| 3 | `JoinHandle::abort()` / `timeout()` cannot stop a running `spawn_blocking` closure | async | **Accepted (Gap 3)** | §B11, §B21, §B16 cross-ref |
| 4 | Database read-modify-write TOCTOU (lost update, select-then-insert); `BEGIN`/`COMMIT` through a `Pool` | data/concurrency | **Accepted (Gap 4)** | §B13, §B4 |
| 5 | SSRF from a user-supplied URL; redirect-following bypasses the host check | security | **Accepted (Gap 5)** | §C2 |
| 6 | Positional (non-self-describing) formats + persisted-data evolution; `bincode` unmaintained | Tier F / serde | **Accepted (Gap 6)** | §F1, §B20, §A1 |
| 7 | `CancellationToken::clone()` cancels the whole tree; `child_token()` does not | async | Enrichment | §B21 |
| 8 | Re-polling a completed `&mut fut` in a `select!` loop → `'async fn' resumed after completion` | async | Enrichment | §B15e / §B23 |
| 9 | `Condvar::wait` under `if` instead of a predicate loop — std mirror of the tokio `Notify` bullet | concurrency | Enrichment | §B15e / §B9 |
| 10 | Atomics never overflow-check, in either profile; a `fetch_sub` gauge underflows to `MAX` | data | Enrichment | §B26, §B13 |
| 11 | `u8 as char` bytes→text; `split('\n')` keeps `\r`; `String::truncate` panics mid-char; `is_numeric` ≠ `is_ascii_digit` | strings | Enrichment | §B28 |
| 12 | Float `/ 0` yields `inf`/`NaN` silently; `serde_json` writes non-finite floats as `null` | numerics | Enrichment | §B26, §B20 |
| 13 | `take_while` on `by_ref` consumes the delimiter; `skip().enumerate()` order; `max_by_key` last-wins ties | iterators | Enrichment | §B29 |
| 14 | A `reqwest::Client` (pool + TLS config) constructed per request → ephemeral-port/FD exhaustion | cost | Enrichment | §E5, §B14 |
| 15 | `cargo test` at a non-virtual workspace root runs only the root package; `clippy` without `--all-targets` | CI | Enrichment | §D4-adjacent / §C10 |
| 16 | Template autoescape is keyed on the file extension (`tera`: html/htm/xml; `askama`: also j2/jinja — `.txt`/`.md` get none) | security | Enrichment (precondition of §C12's own remedy) | §C12 |
| 17 | `cookie::Cookie` ships with `HttpOnly`/`Secure`/`SameSite` unset | security | Enrichment | §C2 |
| 18 | `static mut` direct read/write still compiles under edition 2024's deny-lint → data race | edition 2024 / unsafe | Enrichment | §B13, §B18 |
| 19 | Plain loads on memory another agent writes (MMIO, DMA, `mmap` IPC) hoisted out of a poll loop | unsafe / `no_std` | Enrichment | §B5 |
| 20 | `cargo::rerun-if-changed=build.rs` cargo-cult → stale generated bindings | build | Enrichment | §A1 / §C7 |
| 21 | `-C target-cpu=native` in `.cargo/config.toml` → `SIGILL` on the production CPU | build | Enrichment | §E6, §A1 |
| 22 | `Path::exists()` is `false` on `EACCES`; exists-then-create is a TOCTOU (`create_new`) | security | Enrichment | §C2 |
| 23 | More default-of-an-earlier-era names: `dotenv` (→ `dotenvy`), `async-std` (→ `smol`), `bincode` | supply chain | Enrichment | §A1 |
| 24 | Edition 2024 `safe fn` inside `unsafe extern` on a C function with preconditions | edition 2024 / FFI | Enrichment | §B5 |
| 25 | `ptr::copy_nonoverlapping` on overlapping ranges (a `memcpy`/`memmove` port) | unsafe | Enrichment | §B5 |
| 26 | rustls 0.23 both-providers panic at `ClientConfig::builder()` — version-scoped | supply chain | Enrichment (example only) | §A1 / §C10 |
| 27–63 | See "Rejected and deferred" | — | Rejected / deferred | — |

---

## Gap 1 — `Instant::now()` and `SystemTime::now()` panic on `wasm32-unknown-unknown` — the spec's own §B27 REQUIRED, unqualified

**The shape.** §B27 tells the writer, without qualification, to use `Instant::now()` "for every duration, deadline, timeout, and benchmark" (`data-and-types.md:96`). On the `wasm32-unknown-unknown` target — the target of every `wasm-bindgen`/browser crate — both `Instant::now()` and `SystemTime::now()` **panic** ("time not implemented on this platform"). The crate compiles for the target without a warning; `cargo test` runs on the host and is green; the first call in the browser panics — and because it is often inside a debounce, a rate limiter, or a "how long did this take" log line, the panic surfaces as a dead UI after an interaction, not at load. `wasm32-wasip1` is unaffected (WASI has a clock), which is why a "works on wasm" claim from one target does not transfer.

**Why in scope.** Compiles, host tests green, deterministic production panic on the target — and, decisively, it is a precondition of the spec's own remedy: the same shape as the v0.3.0 eighth-pass additions (`catch_unwind` × `panic = "abort"`, `thread_local!` × `.await`, `block_in_place` × current-thread runtime), which that pass classified as in-scope precisely because "following an existing recommendation silently does nothing or panics unless the precondition is known."

**Not already covered — what was checked.** §C3's `wasm32` line (`async.md:294`) names three things: no threads, no blocking I/O, no `tokio::time::sleep` — not `std::time`. §B26 (`data-and-types.md:69`) covers `usize` being 32-bit on wasm32. §B27's BANNED list is about `SystemTime` used *for durations*; its REQUIRED is `Instant`. There is no target caveat on either. A grep for `Instant::now`/`wasm`/`web-time` confirms the only other hits are §B15e's `interval_at(Instant::now() + …)` and the version pin saying `Instant` "needs no pin".

**Minimal shape (compiles for the target, host tests green, panics in the browser):**
```rust
#[wasm_bindgen]
pub fn on_input(text: &str) -> String {
    let t = std::time::Instant::now();          // panics on wasm32-unknown-unknown
    let out = expensive(text);
    log(&format!("took {:?}", t.elapsed()));
    out
}
```

**Calibration.** *Positive:* the shape above; a `governor`/hand-rolled rate limiter or a `moka` cache with TTL compiled for `wasm32-unknown-unknown` (both use `Instant` unless their wasm feature is enabled — a §A1 verify-the-feature sub-case). *Negative:* the same code on `wasm32-wasip1`/`wasip2`; `web_time::Instant`/`web_time::SystemTime` (the drop-in replacement that uses `Performance.now()`/`Date.now()` on that target and re-exports `std::time` elsewhere); a `#[cfg(not(target_arch = "wasm32"))]` gate around the timing code.

**LLM-specificity — confidence medium-high.** The mechanism is certain (verified against the `web-time` crate documentation, which states it verbatim). The frequency argument is that the reflex is the *spec's own instruction* and the training-corpus default; a human porting server code to the browser hits it too, but the spec already accepts "the spec's own remedy has an unstated precondition" as a category of finding independent of human-vs-LLM error rates.

**Prior-rejection check.** Never proposed. The only wasm coverage decision in the history is the §C3 line itself (v0.1.0) and the §B26 `usize` note (v0.4.0).

**Sources.** `web-time` documentation: "Currently `Instant::now()` and `SystemTime::now()` will simply panic when using the `wasm32-unknown-unknown` target" — <https://docs.rs/web-time/latest/web_time/>; the target scope note on the same page (WASI unaffected, Emscripten unsupported).

**Severity / placement.** 🟡 (deterministic, loud once hit, target-scoped). One BANNED sub-bullet in §B27 ("on `wasm32-unknown-unknown`, `std::time::{Instant, SystemTime}::now()` panic; use `web_time`") plus the same line appended to §C3's wasm bullet; a Version-pins note that `web-time` re-exports `std::time` on non-wasm targets so it can be the unconditional import; extend the phrase trigger "measure time / duration / elapsed" (`SKILL.md:250`) with a target clause ("…on wasm / in the browser / wasm-bindgen").

---

## Gap 2 — `#[tracing::instrument]` records every argument via `Debug` by default — the spec's §C9 remedy is a secret/PII leak channel

**The shape.** §C9 pushes the writer toward spans and `Instrument`; the LLM's reflexive form is `#[tracing::instrument]` on every handler. By default the attribute records **all arguments as span fields**, using `fmt::Debug` for any type that is not a `tracing::Value`. So `#[instrument] async fn login(pool: &Pool, email: String, password: String)` puts the plaintext password in every span-aware log line, trace exporter, and error report; `#[instrument(ret)]` on a token-minting function records the token; `#[instrument(err)]` on a connect function records an error whose `Display` embeds the connection string. Compiles, tests are green (nothing asserts on log content), and the leak is discovered at audit time — or by whoever reads the tracing backend.

**Why in scope.** Silent, production-only, and a precondition of an existing remedy (the eighth-pass shape again): §C9 says "instrument", and the instrument macro's default is the leak.

**Not already covered — what was checked.** §B12's Debug-leak bullet (`security.md:36`) keys on `#[derive(Debug)]` *on a struct with a secret-named field*; here the argument is a plain `String`/`&str`, or a request struct whose `Debug` is legitimate for other uses — the *macro* is what formats it. The §B12 code-pattern trigger (`SKILL.md:342`) matches only `#[derive(Debug)]` + a field name. §C9's body (`async.md:299–322`) is entirely about span *propagation* (`in_current_span`, `spawn_blocking`, `task_local!`) and PII in explicit `{:?}` calls; the phrase trigger "instrument" (`SKILL.md:221`) routes to that propagation text. The words `skip`, `skip_all`, `#[instrument]` do not occur in any module.

**Minimal shape:**
```rust
#[tracing::instrument]                 // records email AND password as span fields
async fn login(pool: &PgPool, email: String, password: String) -> Result<Session> { … }

#[tracing::instrument(ret)]            // records the minted bearer token
fn issue_token(user: &User) -> String { … }
```

**Calibration.** *Positive:* the two shapes above; `#[instrument]` on a handler taking a full request body (secrets, PII, or simply a multi-MB payload — a §E5 log-volume cost). *Negative:* `#[instrument(skip(password))]`, `#[instrument(skip_all, fields(user = %email))]`, a parameter whose type already redacts (`secrecy::SecretBox`, a newtype with a `"<redacted>"` `Debug`), or `#[instrument]` on a function whose arguments are all non-sensitive scalars.

**LLM-specificity — confidence high.** The macro's default is verified verbatim ("By default, all arguments to the function are included as fields on the span"; non-`Value` types "will be recorded using `fmt::Debug`"). LLMs apply `#[instrument]` liberally — it is the idiomatic form the `tracing` README shows first, and the spec itself asks for spans — and do not add `skip` unless a compile error forces it (a non-`Debug` argument), which is exactly the wrong signal: the sensitive arguments *do* implement `Debug`.

**Prior-rejection check.** Never proposed. v0.4.0's §C9 PII bullet is the nearest prior work and is about explicit `{:?}` formatting.

**Sources.** `tracing::instrument` attribute documentation (default argument recording, `skip`/`skip_all`/`fields`, `ret`/`err`) — <https://docs.rs/tracing/latest/tracing/attr.instrument.html>.

**Severity / placement.** 🔴 when a parameter is secret material (this is the §B12 Debug-leak, which is already 🔴, reached through a different formatter); 🟡 for PII/payload size. One BANNED bullet in §C9 (cross-referenced from §B12's Debug-leak bullet), one code-pattern trigger row: `#[instrument]`/`#[tracing::instrument]` on a fn with a `password`/`token`/`secret`/`key`/`body`/`request` parameter (role-scoped exactly as §B12's field rule is) without `skip`/`skip_all`; `#[instrument(ret)]`/`(err)` on a fn returning or failing with secret-bearing values.

---

## Gap 3 — `JoinHandle::abort()` and `tokio::time::timeout` cannot stop a running `spawn_blocking` closure

**The shape.** Asked to "add a timeout to" a CPU-bound or blocking step — decompress a body, run a regex, `rusqlite` query, image decode, `bcrypt` — the LLM writes `timeout(dur, spawn_blocking(move || work())).await`, treats `Err(Elapsed)` as "cancelled", and returns a 504. The closure keeps running: tokio documents that `abort` on a `spawn_blocking` task "will not have any effect, and the task will continue running normally" (the only exception is a task that has not started yet), and dropping the `JoinHandle` that `timeout` held is §B21's detach. Each timed-out request leaves a zombie blocking thread; under attacker-shaped input (a slow regex, a large decompression) the blocking pool (default 512 threads — the figure §B11 already cites) fills with work nobody is waiting for, after which every `tokio::fs::*` call and every new `spawn_blocking` in the process queues behind them (§B11's own pool-exhaustion bullet). Tests are green because the test's work finishes before the timeout.

**Why in scope.** Compiles, tests green, production resource exhaustion with an attacker-settable multiplier; and it is another unstated precondition inside the spec: §B21's REQUIRED says "hold an `AbortHandle` … and call `.abort()` on shutdown" (`async.md:240`) with no blocking-task caveat, and §B16's ReDoS remedy says to "wrap the match in a hard timeout (e.g. `std::thread`+channel, or an engine-native timeout)" (`data-and-types.md:33`) — a writer who substitutes the tokio-shaped `timeout(spawn_blocking(…))` for that has *not* built a hard timeout and cannot tell.

**Not already covered — what was checked.** §B11 (`async.md:140`) describes the pool being bounded and long-lived loops pinning threads, but frames the cause as *deliberately* long-lived work, not as a cancellation that silently did not happen. §B21 (`async.md:225–242`) is about async tasks: drop ≠ abort, and `.abort()` as the fix — the fix that is a no-op here. §B3 cancel-safety reasons about `.await` points; a blocking closure has none, so a cancel-safety review of the wrapper passes vacuously. §F3 covers idle deadlines on *reads*, not compute. The strings `abort` + `spawn_blocking` never co-occur in the skill.

**Minimal shape:**
```rust
let decoded = tokio::time::timeout(
    Duration::from_secs(2),
    tokio::task::spawn_blocking(move || inflate_all(body)),   // §B7 bomb + this
).await;   // Err(Elapsed): handler returns 504; inflate_all keeps running on the pool
```

**Calibration.** *Positive:* the shape above; `handle.abort()` on a `spawn_blocking` handle in a shutdown path with a comment saying the work is cancelled; `timeout` around `spawn_blocking` of a backtracking regex on untrusted input (the §B16 misapplication). *Negative:* a closure that polls a cancellation signal (`AtomicBool`/`CancellationToken::is_cancelled()`) between chunks of bounded work; work that is itself bounded (a 10 ms hash) where the timeout is only a latency budget and the comment says so; a dedicated `std::thread` per uncancellable job with the *count* of such threads capped (§B14); a subprocess for work that must be killable.

**LLM-specificity — confidence medium-high.** Mechanism verified verbatim in tokio's `spawn_blocking` docs. Frequency: `timeout(...)` is the LLM's universal "make it robust" wrapper and `spawn_blocking` is what §B11 tells it to reach for; the two compose without any type-level friction, which is the whole hazard.

**Prior-rejection check.** The v0.4.7 concurrency audit rejected "async cancellation leaving a lock permanently held" because drop-based cancellation releases guards — correct, and irrelevant here: a blocking closure is not a future and is not dropped by cancellation, so that rejection's reasoning does not extend to it. The roadmap's deferred `Semaphore` permit-lifecycle sibling is adjacent (a permit moved into a `spawn_blocking` closure is held until the closure finishes, not until the timeout) and would be closed by the same bullet.

**Sources.** tokio `spawn_blocking` documentation (abort has no effect on a running blocking task; exception for not-yet-started) — <https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html>; tokio `Runtime::Builder::max_blocking_threads` default (already cited by §B11).

**Severity / placement.** 🟡; 🔴 when the work's duration is attacker-influenced (the same peer-extendable escalation §B14/§F3 use). One BANNED + one REQUIRED bullet in §B11 ("cooperative cancellation inside the closure, bounded chunks, or a killable thread/process — `timeout`/`abort` only detach"), a one-line caveat on §B21's `.abort()` REQUIRED, and a parenthetical on §B16's ReDoS remedy that `timeout(spawn_blocking(…))` is not the hard timeout it asks for. Code-pattern trigger: `timeout(_, spawn_blocking(_))` / `.abort()` on a `spawn_blocking` handle.

---

## Gap 4 — Database read-modify-write TOCTOU: the DB sibling of §B13, and `BEGIN`/`COMMIT` issued through a `Pool`

**The shape.** Two LLM reflexes, both from the single-threaded prior §B13 already names. (a) *Lost update / double spend:* `SELECT balance` → check in Rust → `UPDATE … SET balance = $new`. Two concurrent withdrawals both read 100, both pass `>= 80`, both write 20; the second overwrites the first — no error, no constraint violation, one withdrawal is free. The LLM's second reflex — wrap both statements in `pool.begin()`/`COMMIT` — does **not** fix it at the default `READ COMMITTED` isolation level; each transaction still reads the pre-update row. The same shape as select-then-insert ("if no row, insert") produces duplicates or a unique-violation error only at concurrency. (b) *A transaction that is not one:* `sqlx::query("BEGIN").execute(&pool)` … statements … `sqlx::query("COMMIT").execute(&pool)`. A pool hands each call a connection of its choosing; transaction state is per connection; the middle statements run outside any transaction on whatever connection they get, and PostgreSQL answers an orphan `COMMIT` with `WARNING: there is no transaction in progress` — a warning, exit success. Single-request tests are green for both shapes.

**Why in scope.** Compiles; tests green; silent money/data loss under exactly the concurrency production has. The spec's own rationale for §B13 — "LLMs port single-threaded patterns from Python/JS/Java … the model has a strong prior on [check-then-act]" — is the mechanism here too; the collection is behind a network instead of behind a `Mutex`.

**Not already covered — what was checked.** §B13 (`concurrency-and-state.md:71–106`) scopes itself to "concurrent collections" and atomics; every BANNED shape is `HashMap`/`DashMap`/`Arc`/atomic. §B4 (`drop-and-raii.md:13–16`) covers transaction *Drop* semantics — commit/rollback on the error path — not what a transaction does or does not guarantee against a concurrent writer, and not the pool/connection identity problem. §C2's SQL bullets (`security.md:91–92`) are injection only. The trigger rows route "balance / counter / accumulate" to §B26 overflow (`SKILL.md:261`) and "transaction / commit" to §B4 (`SKILL.md:179`). `FOR UPDATE`, `ON CONFLICT`, "lost update", and "isolation" occur nowhere in the skill.

**Minimal shape:**
```rust
let bal: i64 = sqlx::query_scalar("SELECT balance FROM acct WHERE id = $1")
    .bind(id).fetch_one(&pool).await?;
if bal < amt { return Err(Insufficient) }
sqlx::query("UPDATE acct SET balance = $1 WHERE id = $2")       // overwrites a concurrent update
    .bind(bal - amt).bind(id).execute(&pool).await?;
```

**Calibration.** *Positive:* the shape above, with or without a surrounding `READ COMMITTED` transaction; `SELECT COUNT(*) … ; if 0 { INSERT }`; raw `BEGIN`/`COMMIT` strings executed against a `Pool`. *Negative:* one atomic statement with the predicate in SQL (`UPDATE acct SET balance = balance - $1 WHERE id = $2 AND balance >= $1`, then check `rows_affected() == 1`); `SELECT … FOR UPDATE` inside a `pool.begin()` transaction whose connection is used for every statement; an optimistic `version` column checked in the `UPDATE`'s `WHERE`; `INSERT … ON CONFLICT DO NOTHING/UPDATE`; `SERIALIZABLE` with a retry loop on `40001`. A read-modify-write on a row only one process ever touches (a stated single-writer invariant, in a comment) is not a finding.

**LLM-specificity — confidence medium-high on frequency, honest caveat on Rust-specificity.** The mechanism is documented (PostgreSQL's isolation chapter: under `READ COMMITTED` a `SELECT` in one transaction does not see an uncommitted concurrent `UPDATE`, and "applications that do complex queries and updates might require a more rigorously consistent view … than Read Committed mode provides"; `SELECT FOR UPDATE` and atomic `UPDATE … SET x = x - 1` are the documented remedies). It is not Rust-specific — but neither is SQL injection, and the spec admitted that in v0.3.0 because the LLM's prior produces it in Rust web code; BaxBench (Rust/Actix is one of its 14 frameworks) finds exploitable defects in roughly half of *correct* LLM-generated backends, though its CWE list does not isolate lost updates specifically, so that figure is directional context, not a measurement of this shape.

**Prior-rejection check.** Never proposed. The v0.5.2 changelog rejected a foreign project's *architecture* rules; this is a defect class with a nameable input, not a design preference. `deadpool`/`bb8` connection pooling was deferred from §C12 in v0.6.0 for a different reason (a §C12 *crate* row); this gap is about what the pool does to transaction identity, not which pool to use.

**Sources.** PostgreSQL, *Transaction Isolation* (Read Committed anomalies; `FOR UPDATE`; the account-transfer example written as atomic updates) — <https://www.postgresql.org/docs/current/transaction-iso.html>; CWE-367 (TOCTOU) — <https://cwe.mitre.org/data/definitions/367.html>; BaxBench — <https://arxiv.org/abs/2502.11844> (directional only, see caveat).

**Severity / placement.** 🟡 (write-time discipline; 🔴 is not proposed — the blast radius is domain-dependent and §B13's own body is 🟡 apart from `Relaxed`-publish). Two bullets in §B13 (the DB read-modify-write shape with the atomic-statement / `FOR UPDATE` / optimistic-version / `ON CONFLICT` remedies; a note that a `READ COMMITTED` transaction does not close it) and one in §B4 (raw `BEGIN`/`COMMIT` through a `Pool` is not a transaction — use the pool's `begin()` and route every statement through the returned `Transaction`). Phrase triggers: "transfer", "withdraw", "check the balance then", "upsert", "insert if not exists" with SQL; code pattern: a `SELECT` whose result feeds an `if` that guards an `UPDATE`/`INSERT` on the same row; `query("BEGIN")`/`query("COMMIT")` executed on a `Pool`.

---

## Gap 5 — SSRF: fetching a user-supplied URL, and the redirect that bypasses the host check

**The shape.** "Add a webhook", "fetch the link preview", "proxy the image", "validate the user's callback URL" → `reqwest::get(&payload.url).await?`. The attacker supplies `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (cloud instance credentials), `http://127.0.0.1:2375/` (Docker), or an internal admin port. The LLM's first fix on request — parse the URL, reject private/loopback hosts — is bypassed by reqwest's **default redirect policy** (follows up to 10 hops): the attacker's public host answers `302 Location: http://169.254.169.254/…` and the client follows it, past the check. DNS rebinding (a hostname that resolves publicly at check time and to `127.0.0.1` at connect time) is the same bypass one layer down. Tests against a local stub server are green.

**Why in scope.** Compiles, tests green, credential exfiltration in production. §C2 already holds the three sibling injections (path, OS command, SQL); this is the missing fourth, and it is the one whose naive fix has a documented silent bypass.

**Not already covered — what was checked.** §C2 (`security.md:87–92`) has path traversal, archive entries, command/argument injection, SQL injection — no outbound-request bullet. §C12's URL row (`deps-macros-ergonomics.md:151`) says "`@` in userinfo → SSRF (→ §C2)", pointing at a §C2 bullet that does not exist; §C12's HTTP-client row names redirects only as a reason to use a client crate. §B12's TLS bullets concern certificate validation; §F3 concerns read deadlines; §B7 concerns body size. The strings `SSRF`, `169.254`, `redirect(` (as a policy) occur only in those two §C12 cells.

**Minimal shape:**
```rust
async fn preview(Json(req): Json<PreviewReq>) -> Result<Html<String>> {
    let body = reqwest::get(&req.url).await?.text().await?;   // any host; follows 302s
    Ok(render(&body))
}
```

**Calibration.** *Positive:* the shape above; a host allowlist/private-range check applied to the *initial* URL only, with the default redirect policy left in place; `Client::new()` reused (§E5) but pointed at a user-chosen host. *Negative:* an outbound destination allowlist (fixed hosts from config); `ClientBuilder::redirect(Policy::none())` (or a `Policy::custom` that re-runs the destination check on every hop) **and** resolving the hostname yourself and connecting to the checked IP (`ClientBuilder::resolve`) so rebinding cannot swap it; an egress proxy that enforces the policy, cited per §F2 as the project's stated boundary. Request timeouts and body caps (§F3/§B7) are necessary but do not address this.

**LLM-specificity — confidence medium-high on frequency; same Rust-specificity caveat as Gap 4.** OWASP's SSRF cheat sheet states the two load-bearing facts: do not accept complete URLs from the user, and "disable the support for the following of the redirection in your web client in order to prevent the bypass of the input validation." reqwest's default policy (10 redirects, loop detection) is documented. The LLM-typical part is the *fix* that fails: LLMs reliably produce the parse-and-check-the-host validator and reliably leave the client's redirect default alone. BaxBench does not test CWE-918, so there is no measured Rust-specific rate; the frequency claim rests on the task shapes (webhooks, previews, proxies) being a staple of LLM-written services.

**Prior-rejection check.** Never proposed as a §C2 bullet; the §C12 URL row's parenthetical is the only trace, and it defers to a §C2 rule that was never written.

**Sources.** OWASP SSRF Prevention Cheat Sheet (allowlist; blocked ranges incl. `169.254.169.254`; disable redirects) — <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>; reqwest `redirect::Policy` default — <https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html>; CWE-918 — <https://cwe.mitre.org/data/definitions/918.html>.

**Severity / placement.** 🟡, matching §C2's other injection bullets (they are all 🟡 in the enforcement list; escalation to 🔴 would be a tier decision for the maintainer, not this audit). One BANNED + one REQUIRED bullet in §C2; the §C12 URL row's "→ §C2" then resolves. Phrase triggers: "fetch this URL", "webhook", "callback URL", "link preview", "image proxy", "download from a user-supplied link"; code pattern: `reqwest::get(<untrusted>)` / `client.get(user_url)` with no destination policy and no `redirect(...)` call.

---

## Gap 6 — Non-self-describing formats (`bincode`, `postcard`) and persisted-data evolution: the round-trip test is the trap; plus `bincode` is now unmaintained

**The shape.** For "serialize this to disk / over the socket, fast", the LLM's reflex is `bincode` (or `postcard`). Both encode an enum as its **variant index** in declaration order and a struct as its **fields in declaration order with no names** — neither is self-describing. Later, asked to add a variant or a field "in a sensible place", the LLM inserts `Updated` between `Created` and `Deleted`, or reorders fields for readability. Every previously persisted `Deleted` now decodes as `Updated`; every reordered struct decodes with fields crossed. No compile error; the §F4 round-trip property test is green — because both halves were regenerated from the same declaration, which is exactly the self-consistency trap §F1 describes for external specs, arriving here from the code's *own previous version*. Separately, `bincode` — 307 M all-time downloads, the reflexive answer — is unmaintained as of RUSTSEC-2025-0141 (issued 2026-01-07, alternatives named in the advisory), which is the §A1 "default-of-an-earlier-era" shape with an advisory to back it.

**Why in scope.** Compiles, round-trip and unit tests green, silent misinterpretation of persisted or wire data — the persisted-data case that §F1/§F2 already escalate to 🔴.

**Not already covered — what was checked.** §B20 (`data-and-types.md:43–61`) is about JSON field presence, `untagged`, `flatten`, numeric fidelity, duplicate keys. §F4 (`semantics-and-conformance.md:94–127`) asks for the round-trip property — the test that stays green here. §F1 is framed around an *external* reference (RFC, "port of"); the previous release of your own crate is not named as a reference, though it is one. §D1's contract-pin exception (`testing.md:21`) mentions "a serialized golden/snapshot (catches §B20 field-presence drift)" — the right instrument, with no rule that requires it for a positional format. §A1's era bullet (`deps-macros-ergonomics.md:19`) names `structopt`, `serde_yaml`, `lazy_static`; `bincode` is absent. The strings `bincode`, `postcard`, `rkyv` occur nowhere in the skill.

**Minimal shape:**
```rust
#[derive(Serialize, Deserialize)]
enum Kind { Created, Deleted }            // v1: persisted with bincode → Deleted == index 1
// v2, "add an Updated event":
enum Kind { Created, Updated, Deleted }   // every stored Deleted now reads as Updated
// prop_decode_encode_roundtrip: green in both versions.
```

**Calibration.** *Positive:* variant insertion/reorder or field reorder on a type that is persisted, cached across restarts, or exchanged with another binary version through `bincode`/`postcard`/`rkyv`/`borsh`; a round-trip test offered as the evidence for that change. *Negative:* the same type serialized and deserialized only within one process lifetime or between two copies of the *same* binary (an in-memory cache, same-build IPC) — there is no version boundary; a format with schema evolution rules (`prost`/protobuf field numbers, `capnp`) used per those rules; a positional format guarded by a version byte with an explicit migration path and a golden-bytes fixture per released version.

**LLM-specificity — confidence medium.** Mechanism verified against the `postcard` wire-format specification ("NOT considered a 'Self Describing Format'"; enums as `varint(u32)` discriminant; struct fields "in their order of definition … field names are not encoded") and bincode 2's specification ("Struct fields are serialized in first-to-last declaration order, with no metadata representing field names"; the variant index is "always encoded as a `u32`"). The LLM-specific part is the *edit reflex*: a model does not know a type is persisted unless told (the §F2 read-the-docs problem) and edits enums for readability; a human maintainer with the deployment in mind tends to append. This is the weakest of the six on frequency evidence — it is a documented-mechanism grounding with an observed-pattern claim, on the Tier E/F precedent.

**Prior-rejection check.** Never proposed. The v0.6.0 `chrono` → `jiff` decision ("do not hardcode a default-of-the-moment") applies to *recommending a successor*, not to recording an advisory-backed unmaintained status — the §A1 bullet's own admission rule ("an explicit advisory, or archival by the crate's own author") is met here.

**Sources.** `postcard` wire format — <https://postcard.jamesmunns.com/wire-format.html>; bincode 2 serialization specification — <https://docs.rs/bincode/2.0.1/bincode/spec/index.html>; RUSTSEC-2025-0141 "Bincode is unmaintained" — <https://rustsec.org/advisories/RUSTSEC-2025-0141.html>; crates.io metadata for `bincode` (latest `3.0.0`, ~307 M downloads) — <https://crates.io/api/v1/crates/bincode>.

**Severity / placement.** 🔴 under §F1's existing persisted-data/wire-format escalation, 🟡 otherwise. One bullet in §F1 ("your own previous release is a reference: a positional format's layout is a spec; cite the version, ship a golden-bytes decode fixture captured from the prior release, gate variant/field edits on it") cross-referenced from §F4 (a round-trip property is silent on this) and §B20; `bincode` added to §A1's era bullet with the advisory ID. Code-pattern trigger: a `bincode`/`postcard`/`rkyv`/`borsh` (de)serialization of a type that is written to disk/DB/wire, and a diff that inserts or reorders variants/fields of such a type without a version bump or fixture.

---

## Enrichments — bullet-level, each with the input that makes it silent

Each row passed the gate (a nameable input; compiles; a plausible test is green) but is small enough to be one bullet in an existing §, not a rule of its own. Mechanisms were verified against the cited primary source during this audit unless marked "documented, not re-fetched".

| # | Category | The reflexive shape | The input on which it is silently wrong | Fix | Source |
|---|---|---|---|---|---|
| 7 | §B21 | `let child = token.clone(); tokio::spawn(async move { … on error: child.cancel() })` | one connection's local error cancels the *whole* service — a clone is bidirectionally linked; single-task tests never see a sibling | `token.child_token()` for a scope that may cancel itself; clone only for observers | <https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html> ("cancelling a child token does not cancel the parent"; a clone is cancelled "whenever the current token gets cancelled, and vice versa") |
| 8 | §B15e / §B23 | `pin!(op); loop { select! { r = &mut op => handle(r), _ = tick.tick() => … } }` | the iteration after `op` completes polls it again → panic `'async fn' resumed after completion`; also all-arms-disabled with no `else` panics | a `done` flag + `, if !done` precondition (tokio's own pattern), `Option`/`fuse()`, or `break` | <https://tokio.rs/tokio/tutorial/select> ("Resuming an async operation"); <https://docs.rs/tokio/latest/tokio/macro.select.html> (panics if all branches disabled and no `else`) |
| 9 | §B15e / §B9 | `if !ready { g = cvar.wait(g).unwrap(); }` | a spurious wakeup returns with `ready == false` and the code proceeds; the mirror lost-wakeup (`notify_one` before `wait`) hangs when the predicate is not re-checked | `while !ready { … }` or `cvar.wait_while(g, |s| !s.ready)` — the std twin of the tokio `Notify` bullet the trigger row already routes to | <https://doc.rust-lang.org/std/sync/struct.Condvar.html#method.wait> ("susceptible to spurious wakeups … the predicate must always be checked") |
| 10 | §B26 / §B13 | `IN_FLIGHT.fetch_sub(1, …)` on the `?` path of a handler that never did the `fetch_add` (the §F3 asymmetry) | atomics wrap in **both** profiles — no debug panic ever — so the gauge underflows to `u32::MAX` and an admission check reads "4 billion in flight" forever | RAII guard for inc/dec pairs; `fetch_update` with a checked decrement; signed gauges with a floor assert | std atomic docs — `fetch_add`/`fetch_sub` "wraps around on overflow" (documented, not re-fetched — doc.rust-lang.org returned a JS shell to the fetcher) |
| 11 | §B28 | `bytes.iter().map(\|&b\| b as char).collect::<String>()`; `s.split('\n')`; `s.truncate(50)`; `c.is_numeric()` | non-ASCII bytes become Latin-1 mojibake (`as char` is a code-point cast, not UTF-8 decode); `\r` survives on CRLF input so `line == "quit"` never matches; `truncate` panics inside a multi-byte char (`String::truncate` doc: panics if `new_len` is not on a char boundary); `is_numeric` accepts `٣`/`½` and `to_digit(10)` then unwraps `None` | `String::from_utf8(_lossy)`; `str::lines()` (strips `\r\n`); `floor_char_boundary`/`get(..n)`; `is_ascii_digit` | std `str`/`String`/`char` docs (verified: `String::truncate` panic clause; `lines` semantics documented) |
| 12 | §B26 / §B20 | `sum / count as f64` for a mean; `a / b` on `f64` | float `/ 0.0` is `inf`/`NaN` silently (the §B26 "div by zero panics" bullet is integer-only — a reader may generalize it); `serde_json` then **serializes `NaN`/`inf` as `null`** and rejects `null` on the way back — the API returns `null` for an empty set and the round-trip breaks | guard `count == 0`; validate `is_finite()` at the boundary; `arbitrary_precision`/custom serializer if non-finite must round-trip | <https://github.com/serde-rs/json/issues/202> ("f32::NAN and f64::NAN get serialized as null but fail to deserialize back") |
| 13 | §B29 | `it.by_ref().take_while(\|l\| l != "")` to read a header block, then `it` for the body; `.skip(1).enumerate()`; `max_by_key` on ties | the first non-matching element (the blank delimiter, or the first body line) is consumed and lost; `skip().enumerate()` restarts indices at 0 vs `enumerate().skip()`; `max_by_key` returns the **last** maximum, `min_by_key` the **first** — a "first winner" assumption is wrong on ties | `peekable()` + `next_if`; order adapters deliberately; `rev()`/explicit tie-break | <https://doc.rust-lang.org/std/iter/trait.Iterator.html> (`take_while` example: "The `-3` is no longer there, because it was consumed"; `max_by_key`: "If several elements are equally maximum, the last element is returned"; `min_by_key`: "the first element") |
| 14 | §E5 / §B14 | `reqwest::Client::new()` (or a `rustls::ClientConfig`, `sqlx` pool, cloud SDK client) inside the request handler | every request builds a pool + TLS config and drops it; under load the host exhausts ephemeral ports/FDs (`EADDRNOTAVAIL`, `TIME_WAIT` pile-up) — a correctness failure at scale, not just cost | build once (`LazyLock`/app state), share by clone (the `Client` is an `Arc` internally) | <https://docs.rs/reqwest/latest/reqwest/struct.Client.html> ("holds a connection pool internally … it is advised that you create one and reuse it") |
| 15 | §D4-adjacent / §C10 | CI: `cargo test`, `cargo clippy` at a workspace root that has a root package | only the root package's tests run (Cargo: a non-virtual workspace "will include only the root crate itself" unless `default-members` is set); `crates/*` tests never execute; green forever. `clippy` without `--all-targets` lints no test/bench code | `--workspace` (and `--all-targets`, plus the §C7 feature matrix) in CI | <https://doc.rust-lang.org/cargo/commands/cargo-test.html#package-selection> |
| 16 | §C12 | `Tera::render("email.txt", ctx)` / an `askama` template named `page.md` rendering user content | §C12's HTML-escaping row points at "an auto-escaping template engine" — but autoescape is keyed on the **extension**: tera escapes `.html`/`.htm`/`.xml`; askama's built-in escapers map `html`/`htm`/`xml`/`j2`/`jinja`/`jinja2` → HTML and `md`/`yml`/`none`/`txt`/`""` → *no escaping*; the "auto" in the remedy has an unstated precondition | name HTML templates `.html`; `autoescape_on`/the `escape` attribute otherwise; treat the extension as a security setting | <https://docs.rs/tera/latest/tera/struct.Tera.html#method.autoescape_on>; <https://askama.rs/en/stable/configuration.html> (escaper table) |
| 17 | §C2 | `Cookie::new("session", id)` / `CookieBuilder` without attributes | `http_only`, `secure`, `same_site` are **unset by default** (`None`), so the session cookie is readable from JS and sent over plain HTTP; tests do not assert cookie attributes | `.http_only(true).secure(true).same_site(SameSite::Lax|Strict)`; framework session layers that default them on | <https://docs.rs/cookie/latest/cookie/struct.Cookie.html> (`http_only()`/`secure()`/`same_site()` return `None` unless set) |
| 18 | §B13 / §B18 | `static mut COUNT: u64 = 0; unsafe { COUNT += 1 }` from a multi-thread runtime, or a signal/interrupt handler | edition 2024's `static_mut_refs` deny-lint covers **references** (incl. implicit autoref) — direct reads/writes and raw-pointer access still compile — so the residual shape is a data race (UB) that a single-threaded test never shows; the `unsafe` block passes §B5's `// SAFETY:` rule with a false "single-threaded" claim | `AtomicU64`/`Mutex`/`OnceLock`; on bare-metal, `critical_section::Mutex<RefCell<_>>` | <https://doc.rust-lang.org/edition-guide/rust-2024/static-mut-references.html> (lint scope: references only; raw pointers and direct assignment remain allowed) |
| 19 | §B5 (`no_std` scoping note) | `while unsafe { *status } & READY == 0 {}` on an MMIO register, a DMA buffer, or `mmap`'d shared memory written by another process | a plain load has no side effect, so the optimizer hoists it out of the loop — an infinite spin or a stale read; the C→Rust port dropped `volatile`. Note the std caveat: volatile does **not** make cross-*thread* access defined — that case needs atomics (`AtomicU32::from_ptr`) | `read_volatile`/`write_volatile` for device memory outside any Rust allocation; atomics for anything another thread/process writes; PAC/`volatile-register` crates on embedded | <https://doc.rust-lang.org/std/ptr/fn.read_volatile.html> ("guaranteed to not be elided or reordered … whether an operation is volatile has no bearing whatsoever on … concurrent accesses from multiple threads") |
| 20 | §A1 / §C7 | `println!("cargo::rerun-if-changed=build.rs");` copied into a `build.rs` that runs `prost-build`/`bindgen`/`cc` on other inputs | once *any* `rerun-if` is emitted Cargo reruns **only** on those paths — editing the `.proto`/header no longer regenerates the bindings; stale generated code passes tests until a clean build (or ships from a cached CI) | `rerun-if-changed=<every input path/dir>`; the `build.rs` line alone is documented as correct only for a script that "inherently does not need to re-run" | <https://doc.rust-lang.org/cargo/reference/build-scripts.html#rerun-if-changed> |
| 21 | §E6 / §A1 | `[build] rustflags = ["-C", "target-cpu=native"]` in `.cargo/config.toml` after "make it faster" | the binary uses whatever ISA extensions the *build* host has; a production/CI host without them dies with `SIGILL` at the first vectorized call — deep in a hot path, not at startup | runtime detection (`is_x86_feature_detected!`, `multiversion`), or a named baseline `target-cpu` documented as a deployment contract; the Substitution catalog's `gxhash` row already carries the same caveat | Rust codegen options documentation (`target-cpu`), documented, not re-fetched |
| 22 | §C2 / §B13 | `if !path.exists() { fs::create_dir_all(path)?; }` / `if !p.exists() { File::create(p) }` | `exists()` returns `false` on a **permission error or broken symlink** (std's own warning) so the branch runs and fails with an unrelated error; exists-then-create is also a filesystem TOCTOU (two processes both create; a symlink planted in between) | `try_exists()`; `OpenOptions::create_new(true)` / `create_dir` and handle `AlreadyExists` | <https://doc.rust-lang.org/std/path/struct.Path.html#method.exists> ("may be error-prone, consider using `try_exists()` … risk of introducing TOCTOU bugs") |
| 23 | §A1 era bullet | proposing `dotenv`, `async-std`, `bincode` | each is the corpus default and each has an advisory or an author's discontinuation: `dotenv` — RUSTSEC-2021-0141 (→ `dotenvy`); `async-std` — README: "`async-std` has been discontinued; use `smol` instead"; `bincode` — RUSTSEC-2025-0141 (Gap 6) | name in §A1's list (the bullet's own admission rule — advisory or author archival — is met for all three) | <https://rustsec.org/advisories/RUSTSEC-2021-0141.html>; <https://github.com/async-rs/async-std>; <https://rustsec.org/advisories/RUSTSEC-2025-0141.html> |
| 24 | §B5 | `unsafe extern "C" { pub safe fn parse(p: *const c_char) -> i32; }` (edition 2024 / Rust 1.82+) | marking an import `safe` lets every caller pass NULL without `unsafe` — the import-direction twin of §B25's exported-entry-point bullet and of §B5's "`pub fn` whose contract needs caller invariants must be `pub unsafe fn`" | `safe` only for functions valid for *all* inputs (e.g. `abs`); otherwise leave it `unsafe` and validate in a safe wrapper | <https://doc.rust-lang.org/edition-guide/rust-2024/unsafe-extern.html> (documented, not re-fetched) |
| 25 | §B5 | `ptr::copy_nonoverlapping(src, dst, n)` for "shift the tail left" inside one buffer (a `memcpy` port) | overlap is UB for `copy_nonoverlapping`; a small test with non-overlapping ranges passes; overlapping production input corrupts | `ptr::copy` (memmove semantics) or safe `slice::copy_within` | std `ptr::copy_nonoverlapping` safety section (documented, not re-fetched) |
| 26 | §A1 / §C10 (example only) | rustls **0.23** with both `ring` and `aws-lc-rs` features reaching the graph through feature unification (reqwest brings one, another dep the other) and a `ClientConfig::builder()` copied from 0.21-era code | the builder panics at runtime when the process-level provider cannot be resolved from crate features and none was installed — only in the binary whose unified feature set enables both. **Version-scoped:** the rustls README states that from 0.24 the provider must be passed explicitly (a compile-time shape), so this is a 0.23-window example of the §A1 stale-API × §C10 unification interaction, not a standing rule | `CryptoProvider::install_default()` in `main`, or pin one provider feature across the workspace | <https://github.com/rustls/rustls> (README, "Cryptography providers"); <https://docs.rs/rustls/latest/rustls/crypto/struct.CryptoProvider.html> (`install_default`) |

---

## Scope re-checks the maintainer asked for

- **Edition 2024 / newer language features.** §B4a already holds the silent edition changes (`if let` rescope, tail-expression drop order, `impl Trait` capture, let-chains). This audit found two residuals, both enrichments: the `static_mut_refs` deny-lint leaves direct reads/writes and raw-pointer access compiling (#18), and `safe fn` in `unsafe extern` is a new way to launder a C precondition into safe Rust (#24). Const generics, GATs, trait upcasting, `Box<[T]>: IntoIterator` by value, never-type fallback, resolver v3/MSRV-aware resolution, async closures (already in §B8), and precise capturing (already in §B4a) were each checked and are compile-time or already covered — consistent with the scope line's exclusions.
- **`no_std` / embedded.** The roadmap's rejection of the `no_std` draft stands *as stated*: missing `std::*` paths are compile errors. Two silent shapes live next to it, and both are target-independent, so they belong as §B5/§B13 bullets rather than as a reopened `no_std` category: plain loads on externally-written memory (#19 — the same hazard for an `mmap`'d ring buffer on a server as for a peripheral register) and `static mut` shared with an interrupt/signal handler (#18). A third embedded candidate — the `#[panic_handler] fn panic(_) -> ! { loop {} }` template that hangs a device silently — was rejected: it is the canonical bring-up scaffold, the failure is visible on the device, and the remedy (watchdog/reset/`panic-probe`) is board-level policy, not an LLM-specific silent defect.
- **WASM.** Gap 1. The rest of the wasm surface checked (`getrandom` backend selection, `std::thread::spawn`, tokio `net`/`time` features on `wasm32-unknown-unknown`) fails at compile time and is out of scope by the spec's rule; `catch_unwind` being inert on that target is already implied by §B4/§B25's `panic = "abort"` precondition.
- **Build systems / cross-compilation.** #15 (CI package selection), #20 (`rerun-if-changed`), #21 (`target-cpu=native`). Hand-translated C integer widths (`long` → `i64`, wrong on Windows) was checked and judged covered by §B25's layout-assert REQUIRED when the assert runs on the target — an enrichment sentence at most (`core::ffi::c_long`, never a hand-picked width).
- **Crypto.** Nothing new at the primitive level — §B12's hard-block and the v0.4.7 additions hold. What surfaced is adjacent: the `#[instrument]` leak channel (Gap 2), cookie attribute defaults (#17), and the rustls 0.23 provider example (#26). Post-quantum (`ml-kem`/`ml-dsa`) API hallucination was considered and rejected: it is the existing §B12 hallucinated-API case with a newer crate name, and the blocking protocol already stops it.
- **`unsafe` / FFI.** #18, #19, #24, #25. Lifetime extension via `transmute`/`&*(p as *const _)` to silence a borrow error — the third reflexive-unsafe fix after §C5's clone and §B18's `impl Send` — was checked: §B5's transmute bullet already states that provenance/lifetime proofs are required beyond layout, and the Blocking protocol's unsafe-invariants case applies, so it is a naming enrichment (a sentence in §C5 pointing at §B5), not a gap.
- **Testing / CI beyond Tier D.** #15. Flaky-test retries in CI (`nextest --retries` masking a §B13 race) is the same shape as §D4's "raise the timeout" ban and is one clause there. `cargo fuzz` for parsers is an instrument, not a rule, and §D1a/§F1 already ask for adversarial input.
- **Tier F.** Gap 6 (the previous release as a reference). A Windows-path-separator-in-wire-format shape (`zip` entry names / URL paths built from `Path::display()` on Windows yield `\`) was considered and deferred: real, but it is one §F1 example among many and lacks an LLM-specific reflex beyond single-OS testing, which §D3 already frames.

---

## Rejected and deferred (with reasons)

- **Priority inversion; cancellation-held locks; generic mutex unfairness** — already rejected in the v0.4.7 concurrency audit; nothing new surfaced. Gap 3 does not reopen "cancellation-held locks": that rejection's reasoning (a dropped future drops its guards) is correct and simply does not reach a blocking closure, which is not a future.
- **`tokio::sync::Semaphore` permit lifecycle / pooled connection held across an unrelated `.await`** — deferred by the roadmap backlog; not re-proposed. Gap 3's cooperative-cancellation bullet would close the `spawn_blocking`-flavored corner of it.
- **`buffer_unordered` reordering results; `broadcast::Receiver` created after the first `send` missing it** — real and documented, but the first is announced by its name and the second is low-frequency; neither has the reflexive-shape evidence the gate wants. Deferred.
- **`tokio::fs::File` dropped without `flush().await`** — tokio documents that a dropped file's pending write completes on the blocking pool, so the data is deferred, not lost, unless the process exits; §C4's `BufWriter` drop-flush and §B22 already carry the principle. Enrichment sentence at most; not listed.
- **`Vec::as_ptr()` handed to C, then the `Vec` grows** — the dangling-registration cousin of §B25's callback-context UAF and of §B19's indirection rule; covered by their principles. Enrichment at most.
- **CSRF / CORS / authorization architecture** — design-level, "LLMs don't err more than humans" (the v0.5.2 exclusion). Out of scope.
- **`read_line` without `trim`** — beginner-class; current LLMs trim; no evidence of a systematic reflex. Rejected.
- **`chrono::Local` in a container with no tz data silently reporting UTC** — environment-dependent, and the fallback is the documented behavior, not a wrong answer. Rejected.
- **N+1 queries; `#[tokio::main]` on a per-call helper; `Runtime::new()` per request** — §E1/§E3/§E5/§B15c already cover the shapes. Rejected as duplicates.
- **`getrandom` on wasm without a backend; `c_char` signedness (`*const i8` vs `c_char` on aarch64); `macro_rules!` without `$crate`; `improper_ctypes` cases** — all compile-time on the affected target. Out of scope by the scope line.
- **Post-quantum crypto API hallucination** — see the crypto re-check above. Rejected.
- **`#[panic_handler] loop {}`** — see the `no_std` re-check above. Rejected.
- **`#[derive(PartialOrd)]` ordering silently changing when fields/variants are reordered** — the same edit reflex as Gap 6 wearing `Ord`; §B16 covers manual `Ord` contracts. Fold into Gap 6's bullet as a sentence if accepted; not separately listed.
- **Windows `\` in zip entry names / URL paths** — see the Tier F re-check. Deferred.
- **Hand-translated C integer widths** — see the build re-check. Enrichment sentence at most.

---

## Verdict

Six gaps and twenty enrichments survive from sixty-three candidates. The three strongest (Gaps 1–3) are each an **unstated precondition of a remedy the spec already gives** — `Instant::now()` on `wasm32-unknown-unknown`, `#[instrument]`'s default field capture, and `abort`/`timeout` against `spawn_blocking` — the shape the v0.3.0 eighth pass treated as first-class, and each was verified against the primary documentation during this audit rather than recalled. Gaps 4 and 5 are language-agnostic web-backend shapes admitted on the same precedent as §C2's SQL injection and §B13's TOCTOU (the LLM's single-threaded / trusting prior), with the honest note that no Rust-specific frequency measurement exists for either — BaxBench's Rust/Actix track gives directional context only. Gap 6 is the weakest on frequency evidence and the strongest on blast radius (persisted data, 🔴 under §F1's existing rule), and it comes with an advisory-backed §A1 entry for `bincode`. Nothing here needs a new numbered category or a tier change; every survivor is bullets in §B27/§C3, §C9/§B12, §B11/§B21, §B13/§B4, §C2, and §F1/§B20/§A1, plus trigger rows — the same no-quota-filling placement the previous five audits used. Recommended order of integration if the maintainer takes fewer than six: 2, 3, 1, 5, 4, 6.
