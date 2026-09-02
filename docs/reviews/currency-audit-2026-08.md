# Currency audit — stale claims and missing ecosystem developments (as of 2026-09-02)

> **Status:** Research report, not normative. Nothing in `skill/` was edited. Every finding below
> is graded against the spec's own bar ("a stale crate *name* with no behavior change and no
> advisory is low-value; a stale claim that makes an LLM produce wrong or unsafe code today is
> high-value"). Verified facts carry a live source; anything I could not reach is marked
> **unverified** rather than guessed. All URLs consulted are listed in the appendix at the end,
> each with what it showed.

Scope: `skill/SKILL.md` (Version pins, Post-flight, trigger tables), all ten module files,
`skill/references/sources.md`, `CHANGELOG.md` (0.1.0 2026-05-17 → 0.6.0 2026-08-19), and
`.github/workflows/*.yml`. Method: (1) enumerate every "stable since Rust X.Y" claim, every crate
name and every version number in the skill; (2) fetch the live state — `RELEASES.md` and the
release blog for the toolchain, `crates.io/api/v1/crates/<name>` for every crate (110 crates
queried), the RustSec advisory DB (per-crate pages + raw advisory files) for every crate that has
an advisory, docs.rs / upstream CHANGELOGs for the specific API names the spec cites; (3) compare.
Two directions: **stale** (spec says X, world now says Y) and **missing** (world added Z that fits
an existing category's pattern).

Toolchain state at audit time: stable is **Rust 1.98.0 (2026-08-20)**; `RELEASES.md` on master
already carries a **1.98.1 (2026-09-03)** entry — i.e. a point release due tomorrow, not yet
announced. The spec's pins section was last touched in 0.5.3/0.6.0 (2026-08-19), one day before
1.98.0 shipped; the crypto bullets it verifies were written in 0.4.7 (2026-07-09).

---

## Part 0 — Version-pin claims that verify as correct (no action)

Checked against live sources; listed so a future pass does not re-verify them:

| Claim in `SKILL.md` Version pins | Verified against | Result |
|---|---|---|
| Edition 2024 stabilized in Rust 1.85, February 2025 | release blog 2025-02-20 | correct |
| `Box::<[T]>::new_uninit_slice` stable since 1.82 | std docs (1.98.0 build), "since 1.82.0" | correct |
| `Vec::into_raw_parts` stable since 1.93 | std docs "since 1.93.0"; `RELEASES.md` 1.93.0 (2026-01-22) | correct — but see S11 (wording still hedges as if unconfirmed) |
| `unexpected_cfgs` automatic since 1.80 | (long-standing; not re-fetched) | correct |
| AFIT stable since 1.75 | (long-standing; not re-fetched) | correct |
| tokio: `biased;` in `join!`/`try_join!` 1.46.0; `SetOnce` 1.47.0; `task::coop` 1.44.0 | tokio `CHANGELOG.md`; crates.io publish dates 1.44.0 = 2025-03-07, 1.47.0 = 2025-07-26; docs.rs 1.53.1 `sync::SetOnce` page exists | correct |
| `consume_budget` moved to `task::coop`, old path `#[deprecated]` from 1.44.0 | tokio master `src/task/mod.rs`: `#[doc(hidden)] #[deprecated = "Moved to tokio::task::coop::consume_budget"] pub use coop::consume_budget;` | correct (docs.rs hides it — the deprecated re-export is `doc(hidden)`, which is why a docs.rs lookup of `tokio::task::consume_budget` now 404s) |
| tokio 1.39.1 introduced `consume_budget` (1.39.0 yanked) | not re-fetched | **unverified** (plausible; no contrary evidence) |
| `clippy::await_holding_lock` is warn-by-default (`suspicious`) | clippy master `await_holding_invalid.rs`: `#[clippy::version = "1.45.0"]`, group `suspicious` | correct; no group move in clippy 1.93–1.98 |
| Strict-provenance API stable since 1.84 | `RELEASES.md` 1.91 lists `with_exposed_provenance` becoming *const* (so it pre-existed) | consistent; 1.84 date itself not re-fetched |
| `extern "C-unwind"` 1.71; panic across `extern "C"` aborts since 1.81 | not re-fetched | correct per prior knowledge; no contrary evidence |
| Float→int saturating since 1.45; `LazyLock` 1.80 / `OnceLock` 1.70 | not re-fetched | correct per prior knowledge |
| OWASP floors: Argon2id m ≥ 19 MiB / t ≥ 2 / p = 1; PBKDF2-HMAC-SHA256 ≥ 600 000 | live OWASP Password Storage Cheat Sheet | **unchanged** (19 MiB/2/1 is one of five listed equivalents; 600 000 / SHA-512 220 000) |
| Post-flight tools alive | crates.io: cargo-semver-checks 0.50.0 (2026-08-01), cargo-mutants 27.1.0, cargo-deny 0.20.2, cargo-audit 0.22.2, cargo-vet 0.10.2, cargo-hack 0.6.45, loom 0.7.2 (2024-04, stable), tokio-console 0.1.14 (2025-10) | all maintained |
| CI actions (`actions/checkout@v7`, `setup-node@v7`, Node 24) | GitHub changelog / releases | current; no v8 exists; Node 20 removal (Sept 2026) does not affect this repo; `ubuntu-latest` is still 24.04 (26.04 is public preview since 2026-06-11, no migration date announced) |

The `jiff`/`chrono`/`time` hedge (§C12 date row), the `backon`-over-`backoff` hedge, and the `iai`
crate-name warning (§E6) all held up: `jiff` is still 0.2.x, `chrono` is still maintained
(0.4.45, 2026-06-04), `backon` 1.6.0 (2025-10-18) is still the current publish, and `iai` is
still frozen at 0.1.1 (2021).

---

## Part 1 — STALE: claims that would make an LLM write wrong or non-compiling code today

Ordered by value. "Discipline held?" answers the question the task asked: whether the spec's
stated "verify at write time / don't cite the default of the moment" rule actually protected the
text.

### S1 — `rand` 0.10 renamed `OsRng` → `SysRng`; the spec's §B12 and Version pins still say `OsRng` (HIGH)

**What is stale.** `security.md:25` ("prefer `rand::rngs::OsRng` for keys and security-critical
nonces"), `security.md:33` ("use `OsRng` (or `getrandom`) directly … in `rand` 0.8.x … `thread_rng()`,
in 0.9+ it is `rng()`"), `security.md:41` (`SaltString::generate(&mut OsRng)`), `SKILL.md:438`
("`rand` 0.8 / 0.9 split … The `OsRng` recommendation in §B12 holds for both"), and
`references/sources.md:131` (`ThreadRng` … "seeded from `OsRng`").

**Evidence.** crates.io: `rand` max stable **0.10.2** (2026-08-25); 0.10.0 published
**2026-02-08**; `rand_core` 0.10.1. rand `CHANGELOG.md` 0.10.0: "Rename `os_rng` -> `sys_rng`,
`OsRng` -> `SysRng`, `OsError` -> `SysError`", "Rename `Rng` -> `RngExt` as upstream `rand_core`
has renamed `RngCore` -> `Rng`", "Remove fns `SeedableRng::from_os_rng`, `try_from_os_rng`",
"Removed feature `small_rng`", `rand_chacha` dependency replaced by `chacha20`. docs.rs
`rand` 0.10.2 `rngs` module lists `SysRng`, `SysError`, `ThreadRng`, `StdRng`, `SmallRng`, the
ChaCha/Xoshiro types — **no `OsRng`** and no deprecated alias. Separately RUSTSEC-2026-0097
(2026-04-09): `rand::rng()` / `thread_rng()` are unsound when a custom `log` logger calls back
into `rand::rng()` during reseeding (every 64 KiB); patched 0.8.6 / 0.9.3 / 0.10.1.

**Consequence.** On a rand 0.10 project (the current default resolution for a fresh
`cargo add rand`), the spec's literal advice yields `E0432: unresolved import rand::rngs::OsRng`.
That compile error is exactly the Tier A trigger: the cheapest fix that compiles is to downgrade
`rand`, or to swap in `rand::rng()` — a *different* threat-model decision (thread-local reseeding
chain) than the one §B12 intended. `SmallRng` also lost its feature flag (now unconditional), so
the BANNED `SmallRng` bullet is slightly easier to trip.

**Discipline held?** No. rand 0.10.0 shipped **five months before** the 0.4.7 crypto pass
(2026-07-09) that wrote `security.md:41`, and the Version-pins bullet explicitly asserts the
`OsRng` name "holds for both" 0.8 and 0.9 without mentioning 0.10.

**Warranted?** Yes — high. Fix shape: state the rule as "OS-backed entropy: `rand::rngs::OsRng`
(rand ≤ 0.9) / `rand::rngs::SysRng` (rand ≥ 0.10, rand_core 0.10), or the `getrandom` crate
directly, which is stable across the rename"; extend `SKILL.md:438` to a 0.8 / 0.9 / 0.10 split
(`thread_rng()` → `rng()`; `OsRng` → `SysRng`; `Rng` → `RngExt`); add the RUSTSEC-2026-0097 floor.

### S2 — `argon2` 0.6 / `password-hash` 0.6 restructured; `SaltString::generate(&mut OsRng)` does not type-check against them (HIGH, partially unverified)

**What is stale.** `security.md:41` and `references/sources.md:177` give
`SaltString::generate(&mut OsRng)` as the REQUIRED per-credential salt call.

**Evidence.** crates.io: `argon2` **0.6.0** published **2026-08-27**; `password-hash` 0.6.1
(2026-07-07, docs.rs "released July 7, 2026"). argon2 `CHANGELOG.md` 0.6.0: "Bump `password-hash`
to v0.6", "Rename `simple` feature to `password-hash`", "Upgrade to Rust 2024 edition; MSRV 1.85",
`std` feature removed. crates.io dependency API for `password-hash` 0.6.1: **`rand_core ^0.10`**
and **`getrandom ^0.4`** (both optional). docs.rs crate root for 0.6.1 shows the type moved under
a `phc` module ("DEPRECATED: import this as `password_hash::phc::PasswordHash`"). Because
password-hash 0.6 is on rand_core 0.10, the only OS RNG that satisfies its bound is rand 0.10's
`SysRng` (or `getrandom` 0.4) — rand 0.9's `OsRng` is a rand_core 0.9 type and will not unify.

**Unverified.** The exact new signature of `SaltString::generate` (which trait bound —
`TryCryptoRng` vs `CryptoRng` — and whether a `try_from_rng` variant exists): docs.rs returned
404 at three paths (`password_hash/struct.SaltString.html` for `latest` and `0.6.1`, and
`password_hash/phc/struct.SaltString.html`), and the raw source path on GitHub also 404'd. Treat
the *name* `SaltString::generate` as probably intact and the *argument* as changed.

**Warranted?** Yes, with S1: the spec should name the salt call generically ("the KDF crate's
own salt generator, fed from the OS RNG type matching your `rand_core` major") and keep the
literal `&mut OsRng` only as the ≤ 0.5 form.

### S3 — `jsonwebtoken` 11.0.0 removed `Validation::insecure_disable_signature_validation` (HIGH)

**What is stale.** `security.md:39` BANNED bullet and the `SKILL.md:309` code-pattern row both
key on `insecure_disable_signature_validation()`.

**Evidence.** crates.io: `jsonwebtoken` max **11.0.0**, published **2026-07-24** (15 days after
the 0.4.7 pass). Upstream `CHANGELOG.md` 11.0.0: "BREAKING: `Validation.insecure_disable_signature_validation`
has been removed, use `dangerous::insecure_decode` instead"; also "`Algorithm`, `KeyAlgorithm`,
`EllipticCurve` and `ThumbprintHash` are now `non_exhaustive`", `DecodingKey.as_bytes` removed.
10.0.0 (2025-09-29): "now using traits for crypto backends, you have to choose between
`aws_lc_rs` and `rust_crypto`". docs.rs 11.0.0 `Validation` page confirms the method is gone and
confirms the rest of the spec's claim set is **still accurate**: `new(Algorithm)`,
`set_audience`, `set_issuer`, `set_required_spec_claims` exist; `validate_exp`, `validate_aud`,
`aud`, `iss` fields exist; "Validation only happens if `aud` claim is present in the token. Adding
`aud` to `required_spec_claims` will make it required"; `required_spec_claims` "Defaults to
`{"exp"}`".

**Discipline held?** Bad luck rather than negligence — the removal post-dates the pass by two
weeks. But the bullet is now a grep for a symbol that does not exist on the current major, and
the replacement (`dangerous::insecure_decode`) is a *free function in a module literally named
`dangerous`*, which is a better grep target anyway.

**Warranted?** Yes — high. Add `jsonwebtoken::dangerous::insecure_decode` (≥ 11) beside the old
name (≤ 10) in both the BANNED bullet and the code-pattern row.

### S4 — `sqlx` 0.9 changed the SQL-injection *shape*: `query(&format!(..))` no longer compiles, `AssertSqlSafe(format!(..))` is the new cheapest-fix-that-compiles (HIGH)

**What is stale.** `security.md:91` ("`sqlx::query(&format!("SELECT … WHERE id = {id}"))` … SQL
injection") and the `SKILL.md:371` code-pattern row (`sqlx::query(&format!(...))` /
`query_as(&format!(...))`).

**Evidence.** crates.io: `sqlx` **0.9.0** published **2026-05-21**. Upstream `CHANGELOG.md` 0.9.0
breaking list: "all `query*()` functions now take `impl SqlSafeStr` which is only implemented for
`&'static str` and `AssertSqlSafe`"; MSRV 1.94; "SQLite extension loading is now `unsafe`";
"`SqliteValue` is now `!Sync` and `SqliteValueRef` is `!Send`"; deprecated runtime+TLS combo
features deleted. docs.rs `sqlx::AssertSqlSafe` (0.9.0): "Using this API means that **you** have
made sure that the string contents do not contain a SQL injection vulnerability … Use at your own
risk"; `SqlSafeStr` is implemented for `&'static str` and for `AssertSqlSafe<T>` wrapping `String`,
`Box<str>`, `Arc<str>`, `Cow<'static, str>`.

**Consequence.** On sqlx 0.9 the spec's BANNED shape is a *compile error* (E0277), and the LLM's
reflex fix — wrap it in `AssertSqlSafe(...)` — compiles and is the identical injection. The spec's
trigger no longer fires on the code that actually ships. The two secondary changes are also in
scope: `sqlite-load-extension` now requires an `unsafe` block (→ §B5 `// SAFETY:` + §B25a: the
extension is a C library with its own thread-safety contract), and `SqliteValue: !Sync` is a §B18
shape.

**Warranted?** Yes — high. Add `AssertSqlSafe(format!(...))` / `AssertSqlSafe(s)` where `s`
derives from input to the BANNED bullet and the code-pattern row; keep the `&format!` form for
≤ 0.8.

### S5 — §C6 recommends `derivative`, unmaintained since 2024 (HIGH — the spec's own §A1 "earlier-era default" class)

**What is stale.** `deps-macros-ergonomics.md:83`: "For finer control, use `derive_more` or
`derivative` and document the choice."

**Evidence.** RUSTSEC-2024-0388 (informational: unmaintained, dated **2024-06-26**): "The
`derivative` crate is no longer maintained. Consider using any alternative, for instance:
`derive_more`, `derive-where`, `educe`." crates.io: last publish **2021-01-23** (2.2.0), still
23.6M downloads / 90 days — i.e. the training corpus is saturated with it, which is precisely the
mechanism the 0.6.0 "default-of-an-earlier-era" bullet (`deps-macros-ergonomics.md:19`) describes.

**Discipline held?** No. The advisory predates every release of this spec (first commit
2026-05-17); the crate was cited unverified and never re-checked, including by the 0.6.0 pass
that added the earlier-era bullet to the same file.

**Warranted?** Yes — high by the spec's own standard (`cargo audit` in the project would flag it
the moment the LLM follows the advice). Replace with `derive_more` / `derive-where` / `educe`.

### S6 — `reqwest` 0.13 renamed the TLS-bypass methods; the ban keys only on the old names (HIGH-MEDIUM)

**What is stale.** `security.md:40` BANNED bullet, `SKILL.md:199` phrase row and `SKILL.md:308`
code-pattern row name `danger_accept_invalid_certs(true)` / `danger_accept_invalid_hostnames(true)`.

**Evidence.** crates.io: `reqwest` 0.13.0 published **2025-12-30**, current 0.13.4. docs.rs
`ClientBuilder` (0.13.4): `danger_accept_invalid_certs` — "Deprecated: use
`ClientBuilder::tls_danger_accept_invalid_certs()` instead"; `danger_accept_invalid_hostnames` —
deprecated → `tls_danger_accept_invalid_hostnames()`; `add_root_certificate` — deprecated →
`tls_certs_merge()` / `tls_certs_only()` (the spec already has this half right — good);
`tls_certs_only` / `tls_certs_merge` exist, not deprecated. reqwest `CHANGELOG.md` 0.13.0: rustls
is now the default backend, "rustls crypto provider defaults to aws-lc instead of ring", root
features removed in favor of `rustls-platform-verifier`, "Many TLS-related methods renamed … but
previous name left in place with a 'soft' deprecation."

**Consequence.** A substring grep still hits (the new names contain the old), but the row as
written teaches the LLM one token; code written *from* the spec against 0.13 emits a deprecation
warning, and the Tier-A reflex to silence it is to rename to the `tls_` form — which is fine,
except the spec's own trigger then no longer names what is in the file.

**Discipline held?** Half. The 0.4.7 pass knew reqwest 0.13 (it cites `tls_certs_only` as "the
current, non-deprecated form") but did not carry the rename through to the banned method.

**Warranted?** Yes. List both spellings in the BANNED bullet and both trigger rows; note the
default-provider change (aws-lc-rs) in the §B12 "high-level libraries" sentence (see S10).

### S7 — `ammonia` (a 🔴 §C12 row) has had three XSS bypasses in ten months (MEDIUM)

**What is at risk.** `deps-macros-ergonomics.md:172-173` name `ammonia` as the 🔴 fix for
hand-rolled HTML sanitization and as the post-`pulldown-cmark` sanitizer.

**Evidence.** RUSTSEC-2025-0071 (2025-09-21, mXSS via embedded SVG/MathML; patched ≥ 4.1.2),
RUSTSEC-2026-0193 (2026-06-30, mXSS via MathML `annotation-xml` encoding strip; ≥ 4.1.3),
RUSTSEC-2026-0213 (2026-07-21, XSS via SVG `animate`/`set` `attributeName="href"` → `javascript:`
link; ≥ 4.1.4, published 2026-07-22). All three require the caller to have **widened the default
allowlist** (`svg`, `math`, `annotation-xml`, `animate`/`set` are not allowed by default).

**Warranted?** Recommendation stands (ammonia is still the only maintained Rust sanitizer with
this scope), but the 🔴 row should carry two clauses it does not have: (1) "do not add `svg`/`math`
to ammonia's tag allowlist for untrusted content — every 2025–26 bypass required it", (2) a
version floor (≥ 4.1.4) and the reminder that for a 🔴 row `cargo audit` is part of the fix, not
a later gate.

### S8 — `lru` (named in §B14 and §C12) carries two 2026 unsoundness advisories (MEDIUM)

**Evidence.** RUSTSEC-2026-0002 (2026-01-07): `IterMut::next` violates Stacked Borrows; patched
≥ 0.16.3. RUSTSEC-2026-0253 (2026-05-12): `LruCache::pop()` not panic-safe — if a key's `Drop`
panics, `detach()` is skipped and a later eviction writes to freed memory; patched **≥ 0.18.2**
(published 2026-08-03, i.e. *after* the 0.6.0 catalog fetched its download count on 2026-08-19 —
the catalog cites 314M for a crate that was, at that moment, patched for 16 days). Current 0.18.3.

**Warranted?** Version floor only; the recommendation is still right and `moka` is unaffected.
Note the panic-in-`Drop` mechanism is itself the spec's §B4 "panic-in-Drop" hazard surfacing as a
library UAF — a usable cross-reference.

### S9 — `quick-xml` (§C12 row) had two untrusted-input DoS advisories, patched in 0.41.0 (MEDIUM-LOW)

**Evidence.** RUSTSEC-2026-0194 (2026-06-29): O(N²) duplicate-attribute check per start tag on
untrusted XML. RUSTSEC-2026-0195 (same date): `NsReader` allocates ~3× tag size of namespace
bindings with no bound *before* the caller sees the event. Both patched ≥ 0.41.0 (2026-06-29);
current 0.42.0 (2026-08-22). The §C12 row's justification is correctness ("entity refs, CDATA");
on untrusted XML the same crate needed a §B7/§B14-shaped fix seven weeks before the row was
written.

**Warranted?** Version floor in the row; optional cross-ref to §B7.

### S10 — Other named crates whose status changed (MEDIUM-LOW, batched)

- **`serde_yaml` successor** — `deps-macros-ergonomics.md:19` says "no successor named here —
  verify the current recommendation". The advisory DB now names them: RUSTSEC-2025-0068
  (2025-09-11) declares **`serde_yml`** — the fork an LLM is most likely to reach for (22.5M
  downloads, still publishing as of 2026-05-27) — *unsound and archived* ("`serde_yml::ser::Serializer.emitter`
  can cause a segmentation fault"), and recommends `serde_norway` (maintained fork) or
  `serde_yaml_ng` (last publish 2024-05-26, on unmaintained `unsafe-libyaml`). The spec's hedge
  leaves the LLM free to pick the unsound one; it should at least say "not `serde_yml`".
- **`backoff`** — RUSTSEC-2025-0012 (2025-03-04) unmaintained, "you can use `backon`". The §C12
  row (`deps-macros-ergonomics.md:153`) hedges with "verify current maintenance status"; it can
  now simply cite the advisory and drop `backoff` as an option.
- **`async-std`** — RUSTSEC-2025-0052 (2025-08-24) "has been discontinued", alternative `smol`.
  `async.md:290-293` (§C3) still treats `async-std` as a live runtime to avoid *mixing with*
  tokio; it should be "discontinued — migrate, don't mix".
- **`ring`** — `security.md:26` "Default to high-level libraries (`age`, `ring`, `rustls`)".
  RUSTSEC-2025-0010 (2025-03-05) marks only `ring` < 0.17 unmaintained; 0.17.14 (2025-03-11) is
  the last release — 18 months without a release for a crypto crate, while rustls, reqwest 0.13
  and jsonwebtoken 10 all moved their default provider to `aws-lc-rs` (reqwest changelog; jsonwebtoken
  changelog; crates.io shows `aws-lc-rs` 1.18.1 published 2026-09-01). Not "unmaintained", but no
  longer the ecosystem default; the sentence should read "`rustls` (default provider `aws-lc-rs`)".
- **`fxhash`** — RUSTSEC-2025-0057 (2025-09-05) unmaintained → `rustc-hash`. The spec's
  `SKILL.md:272` trigger says "FxHashMap" and `sources.md` correctly cites `rustc-hash`; no text
  change needed, recorded so nobody adds `fxhash` later.
- **`sled`** (§C12a row, `deps-macros-ergonomics.md:187`) — listed as a persistent-storage option
  *for crash-consistency*. crates.io: max stable 0.34.7 (2021), 1.0.0-alpha.124 (2024-10-11).
  Upstream README, verbatim: "if reliability is your primary constraint, use SQLite. sled is
  beta." and "the on-disk format is going to change in ways that require manual migrations
  before the `1.0.0` release!" Naming it in a durability row is a stale recommendation; drop it or
  caveat it (the other three — `rusqlite` 0.40.2, `redb` 4.2.0, `fjall` 3.1.10 — are all current).
- **`anyhow`** — RUSTSEC-2026-0190 (2026-06-25): `Error::downcast_mut` after `context` is
  unsound; patched ≥ 1.0.103. Version floor only (§C2 recommends `anyhow` for binaries).
- **`tar`, `zip`** (§C2 archive bullet says "`tar::Archive::unpack` applies its own path guard
  (verify what your pinned version documents)") — the verification now has concrete floors:
  `tar` RUSTSEC-2026-0067 (2026-03-19; symlink-then-directory entry lets `unpack` chmod an
  arbitrary directory; ≥ 0.4.45) and RUSTSEC-2026-0068 (PAX size header ignored when base header
  size is non-zero — parser differential); `zip` RUSTSEC-2025-0168 (2025-03-16; symlink earlier
  in the archive reused for later entries → arbitrary file write; ≥ 2.3.0; current 8.6.0).
- **`shlex`** (§C12 row) — RUSTSEC-2024-0006 concerns the *quoting* API (`quote`/`join`), not
  the splitting the row recommends; patched ≥ 1.3.0, current 2.0.1. No change.
- **`h2`** — RUSTSEC-2026-0258 (2026-08-17): unbounded empty DATA frames queued without limit;
  ≥ 0.4.16 — a §B14 instance inside hyper's own stack (see M5).

### S11 — Wording rot inside the Version pins section (LOW)

- `SKILL.md:431` and `unsafe-and-ffi.md:35` still hedge `Vec::into_raw_parts` as "verify against
  your toolchain; treat as unstable below a confirmed 1.93" / "stable as of Rust 1.93 if confirmed
  by your toolchain". It shipped in 1.93.0 on 2026-01-22 (std docs: since 1.93.0; `String::into_raw_parts`
  too). The MSRV-1.85 caveat is still right; the "if confirmed" hedge reads as if the author was
  unsure the release happened.
- `.github/workflows/ci.yml:24` pins `dtolnay/rust-toolchain@1.97.0`; 1.97.1 (2026-07-16) and
  1.98.0 (2026-08-20) exist. Deliberate pinning is fine (the spec's own "toolchain is part of the
  artifact" rule), but see M4: a pinned *Cargo* is also a pinned set of Cargo CVEs.
- `references/sources.md:195` (§E6): "its successor has itself been renamed since" — no evidence
  found: `iai-callgrind` is at 0.16.1 (2025-07-30), repository `iai-callgrind/iai-callgrind`,
  README carries no rename/deprecation notice. The clause looks like an unverified guess —
  the spec's own hallucination class, in the paragraph that warns about crate-name rot. Strike or
  source it.
- §C12 download counts drifted (e.g. `csv` 228M → 236M, `base64` 1.45B → 1.51B, `serde_json`
  1.19B → 1.24B). By design ("at time of writing"); no action.

---

## Part 2 — MISSING: developments since the spec's last touch that fit an existing category

### M1 — Edition 2024 made `std::env::set_var` / `remove_var` `unsafe`; the spec never mentions them (HIGH)

**Why in-scope.** The spec targets edition 2024 and its Operating-mode rule 4 demands a
`// SAFETY:` for every `unsafe` block; §B25a already grounds the exact hazard (CVE-2020-26235,
`getenv`/`setenv` race). Yet `grep set_var skill/` returns nothing.

**Evidence.** Edition guide, "Newly unsafe functions": `std::env::set_var`, `std::env::remove_var`,
`CommandExt::before_exec` are `unsafe` in 2024 — "It can be unsound to call `std::env::set_var`
or `std::env::remove_var` in a multithreaded program due to safety limitations of the way the
process environment is handled on some platforms." Migration lint `deprecated_safe_2024`;
`cargo fix --edition` rewrites the call to
`// TODO: Audit that the environment access only happens in single-threaded code.` +
`unsafe { std::env::set_var(...) }` — and the guide states the lint "cannot verify correctness".

**The LLM failure shape.** The model writes `// SAFETY: single-threaded` above `set_var` inside
`#[tokio::main]` (multi-thread runtime, worker threads already running) or after a `tracing`
subscriber spawned a thread — a plausible, false invariant that compiles, passes tests, and is the
§B25a race. Worse, `cargo fix` leaves a `TODO` comment that the model will treat as "already
audited".

**Placement.** §B25a bullet (the process environment *is* a non-thread-safe C library) + a
code-pattern row: `unsafe { std::env::set_var(...) }` / `remove_var` anywhere other than the top
of `main` before any thread/runtime exists → §B25a, §B5.

### M2 — Edition 2024 `unsafe extern` blocks with `safe fn` items: a new way to launder FFI into safe Rust (HIGH)

**Why in-scope.** §B25's "exported entry point trusts the type system" is the *export* direction.
The *import* direction now has syntax for the same mistake, and it produces no `unsafe` token at
any call site. `grep -E 'unsafe extern|safe fn' skill/` finds nothing.

**Evidence.** Edition guide, "Unsafe extern blocks": extern blocks must be `unsafe extern`
(lint `missing_unsafe_on_extern`); items inside may be `safe` or `unsafe` (default `unsafe`);
"By writing `safe fn` in an `extern` block, the author takes on the responsibility of
guaranteeing that the function's actual behavior matches its declared signature and that it is
safe to call without an `unsafe` block." Example in the guide: `pub safe fn sqrt(x: f64) -> f64;`
vs `pub unsafe fn strlen(p: *const c_char) -> usize;`.

**The LLM failure shape.** `unsafe extern "C" { pub safe fn parse(buf: *const u8, len: usize) -> i32; }`
— compiles, every caller is now "safe", and no `// SAFETY:` is ever written. Any pointer/length,
handle, callback, or global-state (§B25a) function marked `safe` is the finding.

**Placement.** §B25 BANNED bullet + code-pattern row (`safe fn` / `safe static` inside
`unsafe extern` whose signature has a raw pointer, length, handle, or whose library has global
state → §B25/§B25a). Also worth one line in Version pins: "`unsafe extern` required in 2024,
`safe` qualifier stable since 1.82."

### M3 — Cargo dependency cooldown (`[registry] global-min-publish-age`) stabilized for Rust 1.100 (HIGH once shipped; verify)

**Evidence.** RFC 3923 (`cargo-min-publish-age`). rust-lang/cargo PR #17335 "feat(resolver):
Stabilize min-publish-age" — **merged 2026-08-28**, stabilization target **Rust 1.100.0**
(expected ~2026-09-24; not yet stable at audit time). Config: `[registry] global-min-publish-age = "7 days"`;
override for an urgent fix: `CARGO_RESOLVER_INCOMPATIBLE_PUBLISH_AGE=allow cargo update -p foo`;
`cargo install` ignores it; git/path dependencies and registries that do not publish `pubtime`
are not covered; the RFC itself says it "should not be relied upon for security by itself". The
`pubtime` index field it depends on was stabilized in Cargo 1.94 (2026-03-05) and crates.io
started recording it in its 2026-01-21 update. Related `--publish-time` time-travel flag remains
unstable (tracking #16271). `registry.min-publish-age` (the per-registry form) was removed before
stabilization (#17353).

**Why it fits §A1.** The arrayref incident (M4) was live for 86 minutes; a 7-day cooldown would
have excluded it from any fresh resolution. It also closes the gap the spec's yanked-version
bullet leaves open: `--locked` protects existing pins, but the *first* resolution of a new
dependency has no protection at all today.

**Placement.** §A1 defense paragraph + Post-flight (a `.cargo/config.toml` line). Write it as
"stable from Rust 1.100 — verify" until the release lands; do not pin a default duration.

### M4 — Supply-chain incident base is stale again: three Cargo CVEs and a maintainer-compromise class since TrapDoor (2026-05) (HIGH — grounding + one new incident *class*)

The §A1 incident list (`deps-macros-ergonomics.md:36-40`, `sources.md` "Documented incidents")
ends at TrapDoor (2026-05). Since then:

- **arrayref 0.3.10 / append-only-vec 0.1.9 / internment 0.8.7 (2026-08-20)** — Rust blog
  "Supply chain attack on arrayref"; RUSTSEC-2026-0259 … -0266. Legitimate, widely-used crates
  received malicious versions from a compromised maintainer ("their computer or credentials are
  likely compromised"), each depending on a freshly-published `proc-macro1` whose *build script*
  downloaded a payload. Online 86 / 107 / 90 minutes; `arrayref` 0.3.10 downloaded 2,285 times,
  "less than 10% of `arrayref` download traffic … as most users had older versions in their
  lockfiles". Six pure-malicious crates (`proc-macro1`, `proc-macro-en`, `aovine`, `arone`,
  `aronenao`, `tinymember`) deleted. **This is a different class from everything §A1 lists**: a
  known-good *name* with a compromised *source* via the registry itself — the spec covers that
  trust decision only for git/`[patch]` overrides (the `onering` bullet). The lockfile was the
  control that limited blast radius, which is the strongest real-world evidence the spec has for
  its "commit `Cargo.lock`" rule; the incident should be cited there, not only under slopsquatting.
- **Cargo CVE-2026-33056 (2026-03-21)** — a malicious crate tarball could chmod arbitrary
  directories during extraction (the `tar` crate bug RUSTSEC-2026-0067 inside Cargo); fixed in
  Rust 1.94.1; crates.io added upload restrictions on 2026-03-13 and audited all published crates;
  third-party registries remained exposed until patched.
- **Cargo CVE-2026-5222 / CVE-2026-5223 (2026-05-25)** — credentials for a sparse registry at
  `…/index` were reused for `…/index.git` (all Cargo 1.68–1.95; low severity); a crafted tarball
  could extract one level above its own cache directory and overwrite sibling crates' caches
  (third-party registries; crates.io forbids symlinks). Fixed in 1.96.0 (cargo#17031).
- **crates.io phishing campaign (2025-09-12)** — `rustfoundation.dev` lookalike soliciting GitHub
  credentials; "no evidence of a compromise of the crates.io infrastructure". The
  account-credential vector that precedes the arrayref-class incident.
- **crates.io platform changes** (dev updates 2026-01-21, 2026-07-13): Trusted Publishing now
  supports GitLab CI and has a "Trusted Publishing-only" enforcement mode that disables API-token
  publishing; `pull_request_target`/`workflow_run` triggers are blocked for Trusted Publishing
  ("responsible for multiple security incidents in the GitHub Actions ecosystem"); crate pages
  now show a **Security tab with RustSec advisories**, an **unmaintained-crate warning**, and
  banners pointing at **standard-library alternatives**. The spec's "verify on crates.io before
  adding" step now lands on a page that shows exactly the §A1 earlier-era signal.

**Toolchain consequence for the Version-pins "toolchain is part of the artifact" bullet.** Three
Cargo CVEs in six months mean a pinned toolchain is also a pinned vulnerability set: a CI pinned
to 1.94.0 or 1.95.x still carries CVE-2026-33056 / -5223 when it touches a third-party registry.
The bullet should say "pinned *and patched*: re-check the pinned point release against the Rust
security advisories".

### M5 — 2026 RustSec advisories that are real-world instances of the spec's own categories (MEDIUM — grounding, no rule change)

`references/sources.md` grounds several categories on documentation or non-Rust CVEs. These are
Rust, top-crate, dated instances:

| Category | Advisory | Why it is the category's exact shape |
|---|---|---|
| §B5 padding-byte leak | diesel RUSTSEC-2026-0134, diesel-async RUSTSEC-2026-0138 (2026-04-24; ≥ 2.3.8 / ≥ 0.9.0) | `#[repr(C)]` `MYSQL_TIME` mirror cast to a byte array — "this cast exposes padding bytes … this is undefined behaviour". `sources.md` cites only Levin/Shnatsel 2026; this is a named crate. |
| §B26 debug-panics / release-wraps | bytes RUSTSEC-2026-0007 (2026-02-03; ≥ 1.11.1) | `BytesMut::reserve`: unchecked `new_cap + offset`; "observable in release builds (integer overflow wraps), whereas debug builds panic due to overflow checks" → corrupted capacity → OOB. Verbatim the spec's thesis, in a 994M-download crate. |
| §C2 SQL injection inside the ORM | diesel RUSTSEC-2026-0136 (2026-04-24; ≥ 2.3.8) | `COPY FROM`/`COPY TO` options accepted `'` unquoted → option injection. The ORM's own string-building surface is still an injection point. |
| §C2 tar/zip-slip | tar RUSTSEC-2026-0067/-0068, zip RUSTSEC-2025-0168 | see S10 — the "verify your pinned version's unpack guard" sentence now has floors, and the tar bug became a Cargo CVE. |
| §B14 unbounded admission | h2 RUSTSEC-2026-0258 (2026-08-17; ≥ 0.4.16); quick-xml RUSTSEC-2026-0195 | empty DATA frames queued without limit; namespace bindings allocated before the caller can apply a cap. |
| §B7 recursion DoS | time RUSTSEC-2026-0009 (2026-02-05; ≥ 0.3.47) | RFC 2822 parser stack exhaustion on deprecated syntax; fix was a depth limit. |
| §B18 / §C8 | tokio RUSTSEC-2025-0023 (2025-04-07; ≥ 1.44.2) | broadcast channel clones in parallel with only `T: Send` — unsound for `Send + !Sync` clones. |
| §B16 Eq/Ord contract | Rust 1.96 compatibility note | "`BTreeMap::append()` optimization may cause panics for incorrect `Ord` impls" — a wrong `Ord` now panics instead of silently mis-ordering. |
| §B4 panic-in-Drop | lru RUSTSEC-2026-0253 | a panicking key `Drop` inside `pop()` leaves dangling list pointers → UAF on next eviction. |
| log hygiene (no current row) | tracing-subscriber RUSTSEC-2025-0055 (2025-08-29; ≥ 0.3.20) | ANSI escape sequences in logged user input reach the terminal (CWE-117 log injection); the spec has §B12's Debug-leak but no log-*injection* shape. Candidate bullet, not a category. |

### M6 — Rust 1.86–1.98 additions that create a new failure mode or a new *fix* the spec does not name (MEDIUM)

Verified against `RELEASES.md` and, where noted, std docs "since" markers (std docs build 1.98.0,
2026-08-18):

- **`{integer}::strict_add/sub/mul/…` — since 1.91.0** (std docs). Panic on overflow in *both*
  profiles: the per-site answer to §B26's "debug panics, release wraps" for code that cannot set
  `overflow-checks = true` globally (libraries — exactly the case `data-and-types.md:80` says the
  global flag does not cover). §B26's REQUIRED lists `checked_*`/`saturating_*`/`wrapping_*`
  only.
- **`str::floor_char_boundary` / `ceil_char_boundary` — since 1.91.0** (std docs). The std fix
  for §B28's truncation shape (`&s[..s.floor_char_boundary(n)]`); `data-and-types.md:104-109`
  names only `is_char_boundary`, `s.get(a..b)` and `chars().take(n)`.
- **`unchecked_shl` / `unchecked_shr` / `unchecked_neg` stabilized in 1.93.0** (`RELEASES.md`).
  `unsafe`, UB when the count ≥ bit width — a new "fast" shape for the §B26 shift bullet
  (`data-and-types.md:74`) that an LLM reaches for under "optimize"; also `deref_nullptr`
  became deny-by-default and `function_casts_as_integer` warn-by-default (§B5 🟢 candidates).
- **Let chains (1.88.0, 2026-06-26, edition 2024 only)** — the release post says they require
  2024 because they "depend on the `if let` temporary scope change for more consistent drop
  order": a guard/`RefCell` borrow taken in the first `let` of `if let … && let …` lives through
  the remaining conditions — the §B4a family with new syntax; `drop-and-raii.md` §B4a mentions
  only `if let … else` and tail expressions.
- **`dangerous_implicit_autorefs` (warn 1.88, deny 1.89)**, **`invalid_null_arguments` (1.88)**,
  **`dangling_pointers_from_locals` and `integer_to_ptr_transmutes` (warn, 1.91)** — rustc lints
  that mechanize slices of §B5 (implicit `&` through a raw-pointer deref, null passed to
  `ptr::copy`, returning a pointer to a local, `transmute::<usize, *const T>`). Per the
  Enforcement-tiers rule these are 🟢 (delegate) and could be listed next to `unexpected_cfgs`.
- **`mismatched_lifetime_syntaxes` (warn, 1.89.0)** — flags `fn items(scores: &[u8]) -> std::slice::Iter<u8>`
  ("it's not syntactically obvious that a lifetime exists"); a 🟢 backstop for §B1's hidden
  return-lifetime shape.
- **`i128`/`u128` are FFI-safe since 1.89** (no longer `improper_ctypes_definitions`;
  `#[repr(u128)]` stabilized) — §B25's "every `extern "C"` function takes/returns `#[repr(C)]`
  types only" is unchanged, but the 128-bit exception LLMs were trained to avoid is gone.
- **`File::lock` / `try_lock` / `lock_shared` — since 1.89.0** (std docs) — the std primitive for
  §C12a's "concurrent writers race on read-modify-write" row.
- **1.90: `lld` is the default linker on `x86_64-unknown-linux-gnu`** — a §D5-adjacent link-step
  behavior change (different error texts, different symbol-resolution order).
- **1.94: `SystemTime::checked_sub_duration` returns `None` for pre-Windows-epoch** (§B27
  `.unwrap()` shape); Cargo parses TOML 1.1; `CARGO_BIN_EXE_<crate>` available at runtime (§D2).
- **1.95: `cfg_select!` stabilized** (§C7 — same `unexpected_cfgs` checking applies; verify),
  `if let` guards, `bool: TryFrom<{integer}>` (a validate-before-mint helper for §B25's `bool`
  parameter rule), "non-exhaustive enum matching now reads discriminant" (an invalid discriminant
  from C now manifests earlier — §B25).
- **1.96: `assert_matches!`/`debug_assert_matches!` stabilized** (§D1 — a std oracle for
  variant-shape assertions); `BTreeMap::append` panic on bad `Ord` (M5).
- **1.97: Cargo `build.warnings` config stabilized** — `[build] warnings = "deny"` is now the
  cargo-native form of §C7's "treat the lint as `deny`, not `warn`, in CI"
  (`deps-macros-ergonomics.md:90`); `resolver.lockfile-path` stabilized; v0 symbol mangling
  default (no effect on `#[no_mangle]`); `std::char` constants/functions deprecated.
- **1.98: `c_void_returns` (warn)** — an `extern fn` returning `core::ffi::c_void` (should be
  `()`) — §B25; **`invalid_runtime_symbol_definitions` (deny) / `suspicious_runtime_symbol_definitions`
  (warn)** — defining core runtime symbols (`malloc`, `memcpy`, …) via `#[no_mangle]` — the
  compiler took over part of `unsafe-and-ffi.md:107`'s "`#[no_mangle]` … silent linker
  collisions" bullet (🟢 candidate); **`repr(transparent)` stricter about which fields have
  trivial layout** (§C1 newtype advice, compile-only); **`{integer}::format_into` + `NumBuffer`**
  ("performance … matches the dedicated `itoa` library") — the Substitution catalog's `itoa`/`ryu`
  row now has a std alternative for integers; Windows thread-locals moved to Fiber Local Storage
  (§D5 platform note); `Send/Sync` for `CommandArgs`, none for `env::Vars` (compile-only).
- **1.85: async closures `async || {}`** — already cited at `async.md:109` as "stable Rust 1.85"
  — **correct** (release blog 2025-02-20). (An automated summary of `RELEASES.md` I obtained
  placed `async_closure` under 1.87 and misdated 1.85; the release blog is authoritative.)

### M7 — clippy 1.93–1.98: new lints that map onto spec categories (LOW-MEDIUM, 🟢 tier)

From the clippy `CHANGELOG.md`: 1.98 — `for_unbounded_range` (`suspicious`; `for i in 0..` —
§B26/§B14), `with_capacity_zero` (`pedantic`), `unused_async_trait_impl` (`pedantic` — §B15a),
`unnecessary_unwrap_unchecked` (`complexity` — §B5), `by_ref_peekable_peek`; 1.97 — `assert_is_empty`,
`manual_assert_eq`, `useless_borrows_in_formatting`; moves `overly_complex_bool_expr`
`correctness`→`pedantic`, `nonminimal_bool` `complexity`→`pedantic`; 1.96 — `manual_noop_waker`
(§B15b), `manual_pop_if`; 1.95 — `manual_checked_ops` (`complexity` — rewrites hand-rolled
overflow checks to `checked_*`, §B26), `duration_suboptimal_units`, `disallowed_fields`; 1.94 —
`ptr_offset_by_literal`, `same_length_and_capacity`. No group change for `await_holding_lock`,
`unwrap_used`, `arithmetic_side_effects`, `cast_possible_truncation`. No new lint covers
`unbounded_channel`. Nothing in the Post-flight block is invalidated.

---

## Verdict — did the "don't cite the default of the moment" discipline hold?

**Where it held:** the OWASP floors are cited as living and are still exact; the tokio pins are
precise to the point release and all verify; the `jiff`/`chrono`/`time` and `backon`/`backoff`
hedges were the right call; the `iai` warning was prescient; the §C12 catalog's "downloads at time
of writing" framing is honest by construction; `derivative` aside, every §C12/§C12a crate is
alive and publishing in 2026.

**Where it did not hold — and why, structurally:** the rot is concentrated in *API names inside
category bodies*, not in the Version-pins section. `rand::rngs::OsRng` (renamed 5 months before
the bullet was written), `SaltString::generate(&mut OsRng)` (its crate moved majors 7 weeks after),
`insecure_disable_signature_validation` (removed 2 weeks after), `danger_accept_invalid_certs`
(soft-deprecated 6 months before, half-updated), `sqlx::query(&format!)` (uncompilable since
May 2026), `derivative` (unmaintained two years before the spec existed). The Version-pins section
verifies **std and tokio**; nothing verifies the ~40 third-party symbol paths the modules quote
(`security.md` alone quotes a dozen). The discipline is stated but has no mechanism behind it for
crate APIs, which is the exact "stated but not enforced" gap this spec diagnoses in other people's
code.

**Concrete remedy (process, not content):** a short "third-party API names cited" ledger in
`references/sources.md` (crate, major, symbol path, date verified), plus a `dev/` probe that
extracts backticked `crate::path::Name` tokens from `skill/*.md` and checks each against docs.rs
(HTTP 200/404) on a schedule — the same shape as the existing `dev/validate.mjs` link check, one
layer deeper. That would have caught S1–S4 and S6 mechanically.

**What blocks (would make an LLM emit wrong/unsafe/uncompilable code today):** S1, S2, S3, S4,
S5, S6 — all in `security.md`, `deps-macros-ergonomics.md:83`, and the matching `SKILL.md`
trigger rows. **What should ship with them:** M1, M2 (edition-2024 `unsafe` surfaces the spec
targets by name but never mentions), M4 (arrayref class + Cargo CVEs), S7–S9 version floors.
**What can wait for the next pins refresh:** M3 (once 1.100 ships), M5 grounding entries, M6
(`strict_*`, `floor_char_boundary`, `build.warnings`), M7, S10, S11.

---

## Appendix — every source consulted, with what it showed

Grouped by kind. "404" entries are recorded so the corresponding claim stays marked unverified.

### Rust toolchain (rust-lang.org)

- <https://raw.githubusercontent.com/rust-lang/rust/master/RELEASES.md> — release list 1.85.0 …
  1.98.1 (the 1.98.1 entry is dated 2026-09-03, i.e. pre-drafted); per-version Language / Stabilized
  APIs / Cargo / Compatibility Notes for 1.93–1.98 (source for M6 bullets: `unchecked_shl`,
  `deref_nullptr`, `pubtime`, `cfg_select!`, `build.warnings`, `c_void_returns`,
  `invalid_runtime_symbol_definitions`, `repr(transparent)` strictness, `BTreeMap::append`,
  Cargo CVE fixes in 1.96). The automated summary of the 1.85–1.92 range was internally
  inconsistent (misdated 1.85, misplaced `async_closure`) and was cross-checked against the release
  blog below where cited.
- <https://blog.rust-lang.org/releases/> — 15 most recent release announcements with dates
  (1.89.0 2025-08-07 … 1.98.0 2026-08-20; no 1.98.1 announced yet).
- <https://blog.rust-lang.org/> — 2026 post index (37 posts) and relevant 2025 posts; source of
  the URLs below.
- <https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/> — edition 2024, async closures,
  `home_dir` change; release date 2025-02-20 (confirms `async.md:109` and the Version-pins date).
- <https://blog.rust-lang.org/2025/06/26/Rust-1.88.0/> — let chains (edition 2024 only, "depends
  on the `if let` temporary scope change"), naked functions, `cfg(true/false)`, Cargo cache GC.
- <https://blog.rust-lang.org/2025/08/07/Rust-1.89.0/> — `mismatched_lifetime_syntaxes` example and
  rationale, `File::lock` family, `i128`/`u128` FFI-safe, cross-compiled doctests.
- <https://blog.rust-lang.org/2026/08/20/Rust-1.98.0/> — algebraic float ops, `format_into`/`NumBuffer`
  ("matches the dedicated `itoa` library"), `ManuallyDrop<Box>` guarantee, stabilized API list.
- <https://doc.rust-lang.org/std/boxed/struct.Box.html> — `new_uninit`/`new_uninit_slice` since 1.82.0,
  `new_zeroed*` since 1.92.0; docs build 1.98.0 (2026-08-18).
- <https://doc.rust-lang.org/std/vec/struct.Vec.html> — `into_raw_parts` since 1.93.0, `push_mut` 1.95.0.
- <https://doc.rust-lang.org/std/primitive.u32.html> — `strict_add/sub/mul` since 1.91.0,
  `checked_signed_diff` 1.91.0, `isolate_lowest_one`/`bit_width` 1.97.0.
- <https://doc.rust-lang.org/std/primitive.str.html> — `floor_char_boundary`/`ceil_char_boundary`
  since 1.91.0, `split_at_checked` 1.80.0, `is_char_boundary` 1.9.0.
- <https://doc.rust-lang.org/std/fs/struct.File.html> — `lock`/`lock_shared`/`try_lock`/`unlock`
  since 1.89.0.
- <https://doc.rust-lang.org/edition-guide/rust-2024/newly-unsafe-functions.html> — `set_var`,
  `remove_var`, `before_exec` now `unsafe`; rationale; lint `deprecated_safe_2024`; the `cargo fix`
  TODO comment (M1).
- <https://doc.rust-lang.org/edition-guide/rust-2024/unsafe-extern.html> — `unsafe extern`,
  `safe`/`unsafe` item qualifiers, author obligation, lint `missing_unsafe_on_extern` (M2).
- <https://raw.githubusercontent.com/rust-lang/rust-clippy/master/clippy_lints/src/await_holding_invalid.rs>
  — `AWAIT_HOLDING_LOCK` version 1.45.0, group `suspicious`; known false positive on explicitly
  dropped guards (#6446).
- <https://raw.githubusercontent.com/rust-lang/rust-clippy/master/CHANGELOG.md> — new lints and
  group moves for clippy 1.92–1.98 (M7).

### Cargo / crates.io / supply chain

- <https://blog.rust-lang.org/2026/05/25/cve-2026-5222/> and
  <https://blog.rust-lang.org/2026/05/25/cve-2026-5223/> (via search) — registry-credential
  sharing across `.git` suffix (Cargo 1.68–1.95, low); tarball extraction one level above the
  crate cache (third-party registries, medium); fixed 1.96.0; PR rust-lang/cargo#17031.
- <https://blog.rust-lang.org/2026/03/21/cve-2026-33056/> — malicious crate could chmod arbitrary
  directories during extraction (the `tar` bug); fixed 1.94.1; crates.io upload restrictions since
  2026-03-13; third-party registries exposed.
- <https://blog.rust-lang.org/2026/08/20/supply-chain-attack-on-arrayref/> — arrayref 0.3.10 /
  append-only-vec 0.1.9 / internment 0.8.7 malicious versions via compromised maintainer; build
  script downloading a payload; 86–107 minutes online; six malicious crates deleted; "check your
  local dependencies" recommendation only.
- <https://blog.rust-lang.org/2025/09/12/crates-io-phishing-campaign/> — `rustfoundation.dev`
  phishing for GitHub credentials; no infrastructure compromise.
- <https://blog.rust-lang.org/2026/01/21/crates-io-development-update/> — RustSec Security tab on
  crate pages; Trusted Publishing for GitLab CI; Trusted-Publishing-only mode; blocked
  `pull_request_target`/`workflow_run`; `pubtime` recorded "enabling Cargo to implement cooldown
  periods".
- <https://blog.rust-lang.org/2026/07/13/crates-io-development-update/> — source viewer, native
  usernames, expanded RustSec integration with unmaintained-crate warnings, std-alternative
  banners, Svelte frontend; no publisher-security policy changes.
- <https://github.com/rust-lang/cargo/pull/17335> — "feat(resolver): Stabilize min-publish-age",
  merged 2026-08-28, target Rust 1.100.0; `[registry] global-min-publish-age`;
  `CARGO_RESOLVER_INCOMPATIBLE_PUBLISH_AGE=allow`; `cargo install` ignores it.
- Search results (rust-lang/cargo #17009 tracking, #17012 implementation, #17327, #17353,
  RFC 3923 text, cargo#16271 `--publish-time` tracking, renovate#41659) — RFC semantics: applies
  only to registries publishing `pubtime`, not git/path; "should not be relied upon for security
  by itself"; `--publish-time` remains unstable.
- <https://crates.io/api/v1/crates/<name>> for 110 crates (tokio, axum, sqlx, reqwest, serde,
  hyper, clap, rand, rand_core, tonic, tower, subtle, tracing, async-trait, trait-variant,
  zeroize, secrecy, jsonwebtoken, rustls, argon2, password-hash, pbkdf2, rsa, aead, bytemuck,
  zerocopy, lru, moka, dashmap, backon, backoff, governor, glob, walkdir, base64, tempfile, askama,
  tera, jiff, chrono, time, serde_json, ureq, dirs, directories, unicode-normalization, quick-xml,
  unicode-width, textwrap, form_urlencoded, shlex, byteorder, bytes, ipnet, geo, ammonia,
  pulldown-cmark, mime, rusqlite, sled, redb, fjall, redis, csv, semver, url, rust_decimal,
  structopt, serde_yaml, serde_yml, serde_yaml_ng, lazy_static, once_cell, regex, fancy-regex,
  onig, pcre2, memchr, smallvec, indexmap, slab, arc-swap, criterion, iai, iai-callgrind,
  cargo-semver-checks, cargo-mutants, cargo-hack, cargo-deny, cargo-audit, cargo-vet, loom,
  tokio-console, serde_stacker, cap-std, derive_more, derivative, deadpool, bb8, flate2, zip,
  tar, getrandom, thiserror, anyhow, diesel, futures, tokio-util, rustls-webpki, webpki,
  native-tls, openssl, ring, aws-lc-rs, uuid, hashbrown, parking_lot, crossbeam, rayon, bincode,
  postcard, prost, bitflags, itertools, proc-macro-error, paste, instant, dotenv, dotenvy) —
  `max_version`, `max_stable_version`, newest publish date, all-time and 90-day downloads. Key
  values used above: rand 0.10.2 (2026-08-25), rand 0.10.0 (2026-02-08), argon2 0.6.0
  (2026-08-27), password-hash 0.6.1, jsonwebtoken 11.0.0 (2026-07-24) / 10.0.0 (2025-09-29),
  reqwest 0.13.4 / 0.13.0 (2025-12-30), sqlx 0.9.0 (2026-05-21), tokio 1.53.1 (2026-07-20) /
  1.44.0 (2025-03-07) / 1.47.0 (2025-07-26), lru 0.18.3 / 0.18.2 (2026-08-03), ammonia 4.1.4
  (2026-07-22), quick-xml 0.42.0 / 0.41.0 (2026-06-29), tar 0.4.46 / 0.4.45 (2026-03-19),
  bytes 1.12.1 / 1.11.1 (2026-02-03), anyhow 1.0.104 / 1.0.103 (2026-06-25), derivative 2.2.0
  (2021-01-23), backoff 0.4.0 (2021-12-14), backon 1.6.0 (2025-10-18), sled 0.34.7 stable /
  1.0.0-alpha.124 (2024-10-11), ring 0.17.14 (2025-03-11), aws-lc-rs 1.18.1 (2026-09-01),
  serde_yml 0.0.13 (2026-05-27), serde_yaml_ng 0.10.0 (2024-05-26), iai 0.1.1 (2021-01-24),
  iai-callgrind 0.16.1 (2025-07-30), cargo-semver-checks 0.50.0 (2026-08-01).
- <https://crates.io/api/v1/crates/{password-hash/0.6.1,argon2/0.6.0,rand/0.10.2,jsonwebtoken/11.0.0,reqwest/0.13.4}/dependencies>
  — password-hash 0.6.1 → `rand_core ^0.10`, `getrandom ^0.4` (optional); rand 0.10.2 →
  `rand_core ^0.10`, `chacha20 ^0.10`, `getrandom ^0.4`; jsonwebtoken 11 → `aws-lc-rs ^1.15`
  optional, `getrandom ^0.2`; reqwest 0.13.4 → `rustls ^0.23.4`, `rustls-platform-verifier`,
  `hyper-rustls`, `native-tls` optional.
- <https://api.github.com/repos/rustsec/advisory-db/contents/crates> — 915 crates with advisories;
  intersection with the spec's crate list (47 hits) used to scope the per-crate checks.

### RustSec (advisory pages and raw advisory files)

- <https://rustsec.org/advisories/> — full listing: newest RUSTSEC-2026-0274 (2026-09-01); 197
  advisories in 2026; used to spot spec-relevant 2026 entries (ammonia, quick-xml, lru, rand,
  anyhow, diesel, h2, tar, bytes, time, rustls-webpki, arrayref family, cxx, memmap2, etc.).
- <https://rustsec.org/packages/<crate>.html> for: lru, ammonia, quick-xml, rand, rand_core,
  anyhow, diesel, rustls-webpki, slab, tracing, tracing-subscriber, backoff, structopt, derivative,
  serde_yml, serde_yaml, fxhash, async-std, bincode, dashmap, zerocopy, hashbrown, once_cell,
  tokio, hyper, bytes, shlex, sqlx, tar, zip, regex, chrono, time, dirs, directories, rusqlite,
  smallvec, arc-swap, crossbeam, prost, ring, openssl, webpki, rsa, rustls, tonic, base64,
  instant, paste, proc-macro-error, dotenv, h2, lazy_static — per-crate advisory ID lists
  (lazy_static: none).
- <https://raw.githubusercontent.com/rustsec/advisory-db/main/crates/<crate>/<ID>.md> for:
  lru/RUSTSEC-2026-0253 (2026-05-12, unsound, ≥ 0.18.2, panic-unsafe `pop()` → UAF),
  lru/RUSTSEC-2026-0002 (2026-01-07, `IterMut` Stacked Borrows, ≥ 0.16.3),
  ammonia/RUSTSEC-2026-0213 (2026-07-21, SVG `animate`/`set` → `javascript:` href, ≥ 4.1.4),
  ammonia/RUSTSEC-2026-0193 (2026-06-30, MathML `annotation-xml` mXSS, ≥ 4.1.3),
  ammonia/RUSTSEC-2025-0071 (2025-09-21, SVG/MathML mXSS, ≥ 4.1.2),
  quick-xml/RUSTSEC-2026-0194 and -0195 (2026-06-29, O(N²) attribute check; unbounded namespace
  allocation; ≥ 0.41.0), anyhow/RUSTSEC-2026-0190 (2026-06-25, `downcast_mut` unsound, ≥ 1.0.103),
  diesel/RUSTSEC-2026-0134 (2026-04-24, padding bytes in `MYSQL_TIME` cast, ≥ 2.3.8),
  diesel/RUSTSEC-2026-0136 (2026-04-24, `COPY` option injection, ≥ 2.3.8),
  diesel-async/RUSTSEC-2026-0138 (padding bytes, ≥ 0.9.0),
  tracing-subscriber/RUSTSEC-2025-0055 (2025-08-29, ANSI injection, ≥ 0.3.20),
  backoff/RUSTSEC-2025-0012 (2025-03-04, unmaintained → backon),
  derivative/RUSTSEC-2024-0388 (2024-06-26, unmaintained → derive_more/derive-where/educe),
  async-std/RUSTSEC-2025-0052 (2025-08-24, discontinued → smol),
  ring/RUSTSEC-2025-0010 (2025-03-05, < 0.17 unmaintained) and RUSTSEC-2025-0009 (AES/QUIC
  overflow panic, ≥ 0.17.12), bytes/RUSTSEC-2026-0007 (2026-02-03, `reserve` overflow wraps in
  release → OOB, ≥ 1.11.1), tar/RUSTSEC-2026-0067 (2026-03-19, symlink chmod escape, ≥ 0.4.45)
  and -0068 (PAX size desync), zip/RUSTSEC-2025-0168 (2025-03-16, symlink arbitrary write,
  ≥ 2.3.0), time/RUSTSEC-2026-0009 (2026-02-05, RFC 2822 stack exhaustion, ≥ 0.3.47),
  tokio/RUSTSEC-2025-0023 (2025-04-07, broadcast `!Sync` clone, ≥ 1.44.2),
  h2/RUSTSEC-2026-0258 (2026-08-17, unbounded empty DATA frames, ≥ 0.4.16),
  serde_yml/RUSTSEC-2025-0068 (2025-09-11, unsound + archived; alternatives serde_norway,
  serde_yaml_ng), arrayref/RUSTSEC-2026-0260 (0.3.10 removed; 86 minutes; 2,285 downloads),
  rustls-webpki/RUSTSEC-2026-0049 (CRL distribution-point matching, ≥ 0.103.10) and -0098 (URI
  name constraints, ≥ 0.103.12), slab/RUSTSEC-2025-0047 (`get_disjoint_mut` OOB, ≥ 0.4.11),
  shlex/RUSTSEC-2024-0006 (quote API, ≥ 1.3.0), fxhash/RUSTSEC-2025-0057 (2025-09-05,
  unmaintained → rustc-hash), structopt/RUSTSEC-2022-0104 (2022-02-08, unmaintained — confirms
  the ID the spec cites), rand/RUSTSEC-2026-0097 (2026-04-09).
- <https://rustsec.org/advisories/RUSTSEC-2026-0097.html> — rand: `rng()`/`thread_rng()` unsound
  with a custom `log` logger (aliased `&mut` during 64 KiB reseed); affected `rand::rng` ≥ 0.9.0,
  `thread_rng` ≥ 0.7.0 < 0.10.0; patched ≥ 0.10.1 / ≥ 0.9.3 / ≥ 0.8.6; GHSA-cq8v-f236-94qc.

### Crate documentation and changelogs

- <https://raw.githubusercontent.com/tokio-rs/tokio/master/tokio/CHANGELOG.md> — newest 1.53.1
  (2026-07-20); `biased` for `join!`/`try_join!` in 1.46.0 (2025-07-02); `SetOnce` in 1.47.0
  (2025-07-25); `task::coop` in 1.44.0 (2025-03-07); 1.49.0 deprecated `set_linger`; nothing
  else deprecated/removed through 1.53.1.
- <https://raw.githubusercontent.com/tokio-rs/tokio/master/tokio/src/task/mod.rs> — the
  `#[doc(hidden)] #[deprecated = "Moved to tokio::task::coop::consume_budget"] pub use coop::consume_budget;`
  re-export (and the same for `unconstrained`).
- <https://docs.rs/tokio/latest/tokio/task/index.html> — 1.53.1 module page lists `coop`
  submodule; `consume_budget` absent at the old path (hidden deprecated re-export).
- <https://docs.rs/tokio/latest/tokio/task/coop/index.html> — `consume_budget`, `cooperative`,
  `has_budget_remaining`, `poll_proceed`, `unconstrained`; `Coop`, `RestoreOnPending`,
  `Unconstrained`.
- <https://docs.rs/tokio/latest/tokio/task/fn.consume_budget.html> — **404** (consistent with the
  hidden re-export).
- <https://docs.rs/tokio/latest/tokio/sync/struct.SetOnce.html> — exists in 1.53.1; methods
  `new`, `const_new`, `new_with`, `const_new_with`, `initialized`, `get`, `set`, `into_inner`,
  `wait`.
- <https://raw.githubusercontent.com/rust-random/rand/master/CHANGELOG.md> — 0.10.0 (2026-02-08)
  renames (`OsRng` → `SysRng`, `Rng` → `RngExt`, `os_rng` → `sys_rng`), removals
  (`from_os_rng`, `ReseedingRng`, `small_rng` feature), `chacha20` dependency; 0.10.1 soundness
  fix and `log` feature deprecation; 0.9.0 `thread_rng()` → `rng()`, `gen` → `random`.
- <https://docs.rs/rand/latest/rand/rngs/index.html> — 0.10.2 `rngs` contents: `SysRng`,
  `SysError`, `ThreadRng`, `StdRng`, `SmallRng`, ChaCha/Xoshiro; no `OsRng`.
- <https://raw.githubusercontent.com/RustCrypto/password-hashes/master/argon2/CHANGELOG.md> —
  0.6.0 (2026-08-27): password-hash 0.6, edition 2024 / MSRV 1.85, `simple` → `password-hash`
  feature, `std` feature removed, `parallel` feature, `PasswordVerifier<str>`.
- <https://docs.rs/password-hash/latest/password_hash/> — 0.6.1 crate root: `phc` module,
  deprecated root import of `PasswordHash`, features `rand_core` ^0.10 / `getrandom` ^0.4 / `phc`.
- <https://docs.rs/password-hash/latest/password_hash/struct.SaltString.html>,
  <https://docs.rs/password-hash/0.6.1/password_hash/struct.SaltString.html>,
  <https://docs.rs/password-hash/latest/password_hash/phc/struct.SaltString.html>,
  <https://docs.rs/argon2/latest/argon2/password_hash/struct.SaltString.html>,
  <https://raw.githubusercontent.com/RustCrypto/traits/master/password-hash/src/salt.rs> — all
  **404**; the new `SaltString::generate` signature is therefore unverified (S2).
- <https://raw.githubusercontent.com/Keats/jsonwebtoken/master/CHANGELOG.md> — 11.0.0
  (2026-07-24) removal of `insecure_disable_signature_validation` → `dangerous::insecure_decode`,
  `non_exhaustive` enums, key-API renames; 10.0.0 (2025-09-29) backend trait split
  (`aws_lc_rs` / `rust_crypto`); 10.x dates.
- <https://docs.rs/jsonwebtoken/latest/jsonwebtoken/struct.Validation.html> — 11.0.0 fields and
  methods; `aud` "only happens if `aud` claim is present"; `required_spec_claims` default
  `{"exp"}`; method absent.
- <https://raw.githubusercontent.com/seanmonstar/reqwest/master/CHANGELOG.md> — 0.13.0: rustls
  default, aws-lc default provider, `rustls-platform-verifier` roots, `tls_certs_only(your_roots)`,
  soft-deprecated renames (no dates in file; 0.13.0 date from crates.io).
- <https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html> — 0.13.4: `tls_certs_only`,
  `tls_certs_merge` (current); `add_root_certificate`, `danger_accept_invalid_certs`,
  `danger_accept_invalid_hostnames` deprecated with the `tls_`-prefixed replacements; doc text
  "any certificate for any site will be trusted".
- <https://raw.githubusercontent.com/launchbadge/sqlx/main/CHANGELOG.md> — 0.9.0 breaking list
  (`impl SqlSafeStr`, MSRV 1.94, unsafe extension loading, `SqliteValue: !Sync`, feature removals,
  tracing field rename, `PgConnectOptions::options()` escaping).
- <https://docs.rs/sqlx/latest/sqlx/struct.AssertSqlSafe.html> — 0.9.0 doc text ("you have made
  sure that the string contents do not contain a SQL injection vulnerability … Use at your own
  risk"); `SqlSafeStr` impls.
- <https://raw.githubusercontent.com/briansmith/ring/main/README.md> — grepped for
  maintain/deprecat/aws-lc/no longer: no maintenance-status notice (so "unmaintained" is *not*
  asserted for 0.17).
- <https://raw.githubusercontent.com/iai-callgrind/iai-callgrind/main/README.md> — grepped for
  renam/deprecat/successor/formerly: nothing (S11 — no evidence of a rename).
- <https://raw.githubusercontent.com/spacejam/sled/main/README.md> — "if reliability is your
  primary constraint, use SQLite. sled is beta." / on-disk format will change before 1.0.0 (S10).
- <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html> — Argon2id
  five equivalent configs incl. m=19456/t=2/p=1; scrypt table; bcrypt ≥ 10; PBKDF2-HMAC-SHA256
  600 000 / SHA-512 220 000 (unchanged from the spec's citation).

### CI / GitHub Actions

- Search: GitHub changelog 2026-05-14 "Upcoming image migrations", 2026-06-11 "New runner images
  in public preview", actions/runner-images #14226 / #13855, Ubuntu2604-Readme — Ubuntu 26.04
  runners in public preview (`ubuntu-26.04`, `ubuntu-26.04-arm`); no `ubuntu-latest` migration
  date; Ubuntu 22.04 images deprecating from 2026-09-17; 26.04 image drops pre-cached Node/Go
  versions.
- Search: actions/checkout releases (v7.0.1, 2026-07-17; v7 refuses fork checkout under
  `pull_request_target`/`workflow_run` by default, `allow-unsafe-pr-checkout`), actions/setup-node
  (v7, Node 24, `package-manager-cache`), GitHub changelog "Safer pull_request_target defaults"
  (2026-06-18) — no v8 of either action; Node 20 removed from runners September 2026.

### Repository files read (local)

`skill/SKILL.md` (all 514 lines), `skill/deps-macros-ergonomics.md`, `skill/security.md`,
`skill/data-and-types.md` (§B26–§B28), `skill/references/sources.md` (all 265 lines),
`CHANGELOG.md` (release headings + 0.4.7–0.6.0 bodies), `docs/reviews/README.md`,
`docs/reviews/gap-audit-supply-chain-build.md` (format template), `.github/workflows/ci.yml`,
`.github/workflows/npm-publish.yml`, `package.json` / `.claude-plugin/plugin.json` /
`.codex-plugin/plugin.json` (version 0.6.0); plus targeted greps across all ten modules for
"stable since", crate names, version numbers, `set_var`, `unsafe extern`, `safe fn`,
`floor_char_boundary`, `strict_`, `OsRng`, `ring`, `async-std`, `fxhash`, `bincode`, `derivative`.
