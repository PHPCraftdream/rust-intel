# Correctness fact-check audit — `skill/` (Tiers A–F, excluding §C12/§C12a)

- **Tree audited:** `3bce0e1` (`rust-intel: second-pass fixes from @oh's review of eca76bf`)
- **Scope:** every technical claim in `skill/SKILL.md` and the theme modules that is checkable by compiling Rust, running it, reading a crate's current docs/source, or querying crates.io / RustSec. §C12/§C12a were fixed in this session and are out of scope; the rest of the spec was treated as unaudited for this purpose.
- **Reviewed:** 2026-09-02
- **Toolchain used:** `rustc 1.97.0 (2d8144b78 2026-07-07)` (the CI pin), plus installed `1.80`/`1.81`/`1.85`/`1.87`/`1.88`/`1.89`/`1.93.0`/`1.94.0`/`1.95.0`/`1.96.0` for version-gate checks. Crates: `tokio 1.53.1`, `futures 0.3.34`, `serde 1.0.229` + `serde_json 1.0.151` (and `serde 1.0.130` + `serde_json 1.0.70` as a 2021-era control), `jsonwebtoken 9.3.1` and `11.0.0`.
- **Verdict:** **REQUEST CHANGES** — 9 factual errors in normative rule text (3 of them inside 🔴 categories), 8 lower-severity errors, 1 dead citation. No finding invalidates a category; every one is a wrong *mechanism*, *example*, or *version/ID* that an agent following the text verbatim would repeat.

Method: a claim was reported only with positive evidence of being wrong — a compiled-and-run snippet, the crate's own source/docs, or a registry/advisory record. Everything else checked is listed under "Confirmed good" with how it was checked, so the next audit does not redo it.

## Findings

### P1 — §B12 misstates how `jsonwebtoken` treats `aud`: a token carrying a foreign audience is *rejected* by default, not accepted

**Location:** `skill/security.md:38` ("`jsonwebtoken` checks `aud` *only if the token contains one*, so a token minted by the same IdP key for a **different service or tenant** authenticates"); the same reading is recorded as source grounding in `skill/references/sources.md:176`.

Compiled and ran against both major versions in use (HS256, `Validation::new(Algorithm::HS256)` untouched):

```text
[jwt 11] default Validation: aud=None validate_aud=true required={"exp"}
[jwt 11] token WITH aud=other-service, default Validation -> REJECTED: InvalidAudience
[jwt 11] token WITHOUT aud, default Validation -> ACCEPTED
[jwt 9]  default Validation: aud=None validate_aud=true required={"exp"}
[jwt 9]  token WITH aud=other-service, default Validation -> REJECTED: InvalidAudience
[jwt 9]  token WITHOUT aud, default Validation -> ACCEPTED
```

The doc sentence the spec paraphrases ("Validation only happens if `aud` claim is present in the token") means the opposite of what the spec concludes: when the token *has* an `aud` and `Validation.aud` is `None`, the token is rejected as `InvalidAudience`. The real default-accept gaps are (a) a token with **no** `aud` claim at all passes, and (b) `iss` is never checked unless `set_issuer` is called — so a different-*tenant* token passes only via issuer, or via an IdP that omits `aud`. The REQUIRED remedy (`set_audience`, `set_issuer`, `set_required_spec_claims(["exp","aud","iss"])`) is still exactly right; the "why" is inverted, and a reviewer who tests the spec's stated scenario will see it rejected and conclude the rule is noise.

**Recommended correction:** replace the mechanism sentence with: "a token that carries an `aud` the service did not configure is rejected, but a token that *omits* `aud` is accepted, and `iss` is not checked at all unless set — so an IdP-issued token for another tenant (same key, different `iss`, or no `aud`) authenticates." Update `sources.md:176` to quote the observed behavior, not the ambiguous doc line.

### P1 — §A1 names a real crate as a non-existent hallucination: `tokio-utils` exists on crates.io

**Location:** `skill/deps-macros-ergonomics.md:45` ("`tokio-utils` does not exist, `tokio-util` does").

`https://crates.io/api/v1/crates/tokio-utils` (2026-09-02):

```text
"name":"tokio-utils","created_at":"2023-03-31T02:16:49Z","downloads":516164,
"max_version":"0.1.2","description":"Tools for asynchronous programming in Tokio applications"
```

This is a 🔴 slopsquatting rule, and the example teaches the exact wrong reflex: an agent that "knows" `tokio-utils` does not exist will not treat its appearance in a `Cargo.toml` as a name to verify. (Whether this particular crate is benign is beside the point; the claim of non-existence is false.) In the same sentence, "`rust-decimal` does not exist … and the typo'd variant has been weaponized" conflates two names: crates.io normalizes `-`/`_` (the API for `rust-decimal` returns `rust_decimal`), so `rust-decimal` *cannot* be registered separately; the weaponized name was `rustdecimal` (no separator), which is now deleted (`crate 'rustdecimal' does not exist`).

**Recommended correction:** use an example that is verifiably unregistered at write time and say so with a date, or better, drop the "does not exist" framing entirely — the rule is "verify every name against the registry," and a hard-coded list of non-existent names rots. Rewrite the `rust-decimal` clause to name `rustdecimal` as the weaponized typo and note the `-`/`_` normalization.

### P1 — §B5 lists `bool` as invalid for `mem::zeroed`, and describes the failure mode as silent when std aborts loudly

**Location:** `skill/unsafe-and-ffi.md:20` (`mem::zeroed::<T>()` "for any `T` whose all-zero bit pattern is not a valid value: `bool`, `&T`, `&mut T`, `Box<T>`, `NonZero*` … The function compiles for *every* `T` regardless of whether zero is a valid bit pattern; the compiler will not stop the misuse"); `skill/unsafe-and-ffi.md:19` (`mem::uninitialized` "instant UB for any type with invariants").

Compiled with 1.97.0, debug and `-O`:

```text
zeroed::<bool>()        -> false            (exit 0; all-zero is the valid value `false`)
zeroed::<&u8>()         -> "attempted to zero-initialize type `&u8`, which is invalid"
                           "thread caused non-unwinding panic. aborting."   (debug and -O)
zeroed::<Box<u8>>()     -> same abort
zeroed::<enum {A=1,B=2}>() -> same abort
uninitialized::<bool>() -> true   (0x01 fill mitigation; exit 0)
uninitialized::<u32>()  -> 16843009 (0x01010101)
```

Two errors. (1) `bool` does not belong in the `zeroed` list — zero *is* `false`. (2) For the types that are invalid, std's `assert_zero_valid` intrinsic turns the call into a deterministic, non-unwinding abort in both profiles; the docs still classify it as UB (so the BAN is correct), but "the compiler will not stop the misuse" reads as "silent UB" and is not what an agent will observe. Separately, the `mem::uninitialized` docs say it is "immediate undefined behavior to call this function on nearly all types, including integer types" — the spec's "for any type with invariants" understates the contract, and the runtime mitigation means `bool` yields `true`, not a crash.

**Recommended correction:** remove `bool` from the `zeroed` list; state that std aborts at runtime with `attempted to zero-initialize type …` for the provable cases and that this is a best-effort mitigation, not a guarantee (the rule stays because the docs define it as UB). For `uninitialized`, quote the docs' "nearly all types, including integer types".

### P2 — §B7 / SKILL trigger rows overstate the `serde_json` depth-limit bypass: `IgnoredAny` and `flatten`/`untagged` from text are still bounded

**Location:** `skill/unsafe-and-ffi.md:51` ("re-deserializing an *already-built* `serde_json::Value` (`from_value`, `IgnoredAny` skipping unknown nested fields, or `#[serde(flatten)]`/`untagged` routing through the buffered `Content` tree) walks the AST with **no** depth check and overflows the stack"); `skill/SKILL.md:259` ("serde_json's 128 limit is parse-phase only; `from_value`/`IgnoredAny`/`flatten` over an AST bypass it"); `skill/SKILL.md:327`; `skill/references/sources.md:166`.

Measured on `serde_json 1.0.151` and, as a control, `1.0.70` (2021):

```text
from_str, struct with unknown field holding a 100000-deep array (IgnoredAny path): Ok(WithIgnored { a: 1 })   [both versions]
from_str, #[serde(untagged)] enum, 100000-deep:   Err("recursion limit exceeded at line 1 column 128")
from_str::<Value>, 127-deep: Ok;  128-deep:       Err("recursion limit exceeded at line 1 column 128")
from_value::<T> on a Value built programmatically 100000 levels deep: thread 'main' has overflowed its stack
```

`IgnoredAny` from text neither errors nor overflows (serde_json's ignore path is depth-safe), and the `Content` buffer for `flatten`/`untagged` is filled *through* the text deserializer, which enforces the limit — so neither "bypasses" anything on untrusted text. The only overflow is `from_value` (or `Deserializer for Value`) on a `Value` that was built *outside* the limited parser — programmatically, via the `unbounded_depth` feature, or by another format's parser. The trigger row's "middleware JSON, already-parsed JSON" scenario cannot produce a >128-deep `Value` from `serde_json::from_str` in the first place.

**Recommended correction:** narrow all four sites to: "`from_value` / deserializing *from* a `serde_json::Value` walks the AST with no depth check — the hazard is a `Value` that did not come through `serde_json`'s limited text parser (built programmatically, `unbounded_depth`, or a different format's parser)". Drop `IgnoredAny` and `flatten`/`untagged` from the bypass list.

### P2 — §B20 has the `flatten` + `deny_unknown_fields` interaction backwards

**Location:** `skill/data-and-types.md:53` ("`deny_unknown_fields` simply **stops rejecting** unknown fields (no error, unknown keys are accepted) once a sibling field is flattened"); restated at `skill/data-and-types.md:59` ("Incompatible with `flatten` (see that bullet)").

Input `{"a": 1, "b": 2, "unknown": 3}`, identical results on `serde 1.0.229` and `1.0.130`:

```text
deny_unknown_fields on OUTER + #[serde(flatten)] inner (no attr): Err("unknown field `unknown`")   -- still rejects
plain OUTER + #[serde(flatten)] inner WITH deny_unknown_fields:    Ok(...)                           -- attribute silently ignored
deny on both:                                                       Err("unknown field `unknown`")
control (deny, no flatten):                                         Err("unknown field `unknown`, expected `a` or `b`")
```

The outer struct's `deny_unknown_fields` keeps working (leftover keys the flattened field did not consume are rejected). The silent case is `deny_unknown_fields` on the *flattened inner* type, which serde ignores because the inner deserializer sees only the leftovers it recognizes. The serde docs' "not supported in combination with `flatten`" is about this inner placement (and about the attribute losing its "expected `a` or `b`" precision), not about the outer attribute going dead.

**Recommended correction:** "`deny_unknown_fields` on a struct whose field is `flatten`ed into another is silently ignored; on the outer struct it still rejects keys no flattened field consumed" — and keep the custom-`Deserialize` advice for the case where the inner boundary must be strict.

### P2 — §A2 says a panicking `OnceLock` initializer poisons the cell; it does not (only `LazyLock` poisons)

**Location:** `skill/concurrency-and-state.md:26` ("A `LazyLock::new(|| …)` / `OnceLock` init closure that can panic … poisons the cell: every later access panics, not just the first"); cross-referenced from `skill/deps-macros-ergonomics.md:199`.

```text
OnceLock 1st get_or_init (closure panics): Err
OnceLock 2nd get_or_init (closure returns 7): Ok(7);  get() -> Some(7)
LazyLock 1st deref: panics;  2nd deref: "LazyLock instance has previously been poisoned"
```

`std::sync::OnceLock::get_or_init` docs: "If `f()` panics, the panic is propagated to the caller, and the cell remains uninitialized." `LazyLock` docs: "If the initialization closure … panics, the lock will be poisoned … any threads that attempt to access this lock … will panic" and "poisoning in `LazyLock` is *unrecoverable*." The two types have opposite semantics, and the advice differs: a `OnceLock` init can be retried on the next access; a `LazyLock` cannot.

**Recommended correction:** split the bullet — `LazyLock` poisons unrecoverably; `OnceLock` leaves the cell empty and the next `get_or_init` retries (which is its own hazard: a flaky initializer runs again on every access until it succeeds).

### P2 — §B15c/§B22: `futures::executor::block_on` inside a tokio runtime does not panic, and `Handle::block_on` panics on every flavor

**Location:** `skill/async.md:187` ("`tokio::runtime::Handle::block_on` (or `futures::executor::block_on`) called from code already running inside a tokio runtime panics with 'Cannot start a runtime from within a runtime'"); `skill/async.md:252` (`Handle::block_on` in `Drop` "panic (current_thread flavor) or a deadlock (multi_thread, if the only available worker is the one running drop)").

tokio 1.53.1, `futures 0.3.34`:

```text
Handle::block_on inside multi_thread runtime (main thread) -> PANIC: Cannot start a runtime from within a runtime. ...
Handle::block_on inside spawned task on multi_thread worker -> PANIC: Cannot start a runtime from within a runtime. ...
Handle::block_on inside Drop on multi_thread worker          -> PANIC: Cannot start a runtime from within a runtime. ...
futures::executor::block_on inside multi_thread runtime      -> Ok(2)   (no panic; the timer ran on another worker)
futures::executor::block_on inside current_thread runtime    -> NO PANIC; still blocked after 3s (deadlock)
block_in_place on current_thread                             -> PANIC: can call blocking only when running on the multi-threaded runtime
```

`futures::executor::block_on` has no knowledge of tokio's context guard: it silently succeeds when another worker can drive the awaited I/O and silently deadlocks when none can — the worse outcome, and the opposite of a loud panic a test would catch. `Handle::block_on`, conversely, panics on the multi-thread flavor too (the guard is per-thread runtime context, not flavor-dependent), so the "deadlock on multi_thread" branch in §B22 does not occur.

**Recommended correction:** §B15c — "`Handle::block_on`/`Runtime::block_on` panic with 'Cannot start a runtime from within a runtime' on every flavor; `futures::executor::block_on` does *not* panic — it blocks the worker, which works by luck on a multi-thread runtime and deadlocks on `current_thread`." §B22 — drop the flavor split for `Handle::block_on` (it panics in `Drop` on both).

### P2 — §A1's stale-API example is fabricated: tokio 0.2 `mpsc::channel` returned the same tuple as 1.x

**Location:** `skill/deps-macros-ergonomics.md:15` ("`tokio` 0.2 `mpsc::channel(_)` returned a different tuple shape than `tokio` 1.x"); echoed by the assumption-comment example in `skill/SKILL.md:65` (`// ASSUMES: tokio 1.x mpsc tuple shape`).

docs.rs, `tokio 0.2.25`: `pub fn channel<T>(buffer: usize) -> (Sender<T>, Receiver<T>)` — identical to 1.x. What actually changed 0.2 → 1.0 was `Sender::send` taking `&self` instead of `&mut self`, `Receiver::recv` becoming an `async fn`, and `Receiver` losing its `Stream` impl. The sentence is the spec's only concrete example of a "stale-but-still-valid" API, and it is not one.

**Recommended correction:** replace with a real drift, e.g. `tokio 0.2 Receiver: Stream` → 1.x needs `tokio_stream::wrappers::ReceiverStream`, or `Sender::send(&mut self)` → `&self`. Change the SKILL.md example comment to something true (e.g. `// ASSUMES: tokio 1.x — mpsc::Receiver is not a Stream`).

### P2 — §E2 assigns `inefficient_to_string` to `clippy::perf`; it is `pedantic` (allow-by-default)

**Location:** `skill/data-and-types.md:155` ("`clippy::perf` flags the obvious cases (`inefficient_to_string`, `useless_vec`)").

Clippy `master` `clippy_lints/src/methods/mod.rs`: `pub INEFFICIENT_TO_STRING, pedantic`; CHANGELOG: "Downgrade [`inefficient_to_string`] to pedantic #5412". `useless_vec` is `perf` (correct). An agent relying on `clippy::perf` to catch `(&&str).to_string()` will not see the lint unless `-W clippy::pedantic` is on (the Post-flight command does enable pedantic, which is why this is P2 not P3: the text is wrong, the pipeline happens to cover it).

**Recommended correction:** move `inefficient_to_string` to the pedantic clause, or cite `useless_vec` alone for `perf`.

### P3 — §B12 cites the wrong RustSec ID for "rust-crypto is unmaintained"

**Location:** `skill/security.md:17` ("`rust-crypto` itself is **unmaintained since 2016** — RUSTSEC-2022-0011"); referenced again at `skill/security.md:48`.

RustSec advisory-db: `RUSTSEC-2016-0005` — `informational = "unmaintained"`, "rust-crypto is unmaintained; switch to a modern alternative" (2016-09-06). `RUSTSEC-2022-0011` — "Miscomputation when performing AES encryption in rust-crypto" (2022-02-28, `patched = []`), a vulnerability, not an unmaintained notice.

**Recommended correction:** "unmaintained since 2016 (RUSTSEC-2016-0005) and carrying an unpatched AES miscomputation bug (RUSTSEC-2022-0011)" — both IDs, correctly attributed; the second is the stronger reason never to propose it.

### P3 — §B15a: `#[trait_variant::make(Send)]` rewrites the trait in place; only the named form generates a variant "alongside the original"

**Location:** `skill/async.md:162`.

`trait-variant` docs for `make`: the unnamed form "causes the trait to be rewritten as" the bounded version; the named form `#[trait_variant::make(IntFactory: Send)]` "causes a second trait called `IntFactory` to be created" with a blanket impl bridging the two. The decision-table row promises "both Send-bounded and non-Send variants" but shows the syntax that yields only one.

**Recommended correction:** `#[trait_variant::make(SendName: Send)]` for the two-trait case; note that `make(Send)` alone modifies the original.

### P3 — §B9: `std::thread::scope` does not propagate the child's panic payload via `resume_unwind`

**Location:** `skill/concurrency-and-state.md:48` ("propagation via `resume_unwind`, not at the `Scope` struct's `Drop`").

```text
child: panic!("CHILD PAYLOAD 12345")
parent (caught around scope): payload = "a scoped thread panicked"
```

`scope` raises a fresh `panic!("a scoped thread panicked")` after joining; `resume_unwind` is used only for a panic in the scope's own closure. The timing claim (after auto-join, not in `Drop`) is right; the mechanism is wrong, and it matters to anyone matching on the payload or expecting the child's message in logs.

**Recommended correction:** "re-panics with its own message (`a scoped thread panicked`) — the child's payload is not forwarded; `join()` each handle to get it."

### P3 — §B16: `f64::total_cmp` puts NaN at *both* ends, by sign

**Location:** `skill/data-and-types.md:34` ("`NaN` sorts to one end").

```text
sort_by(f64::total_cmp) over [1.0, NaN, -1.0, inf, -NaN, -inf, 0.0] -> [NaN, -inf, -1.0, 0.0, 1.0, inf, NaN]
```

Negative-sign NaN sorts before `-inf`, positive NaN after `+inf` (IEEE 754 totalOrder). Code that "drains NaNs off the end" after `total_cmp` misses the negative ones.

**Recommended correction:** "NaN sorts to the ends — negative NaN first, positive NaN last."

### P3 — §B4 names a non-existent stable mechanism (`panic_in_drop`)

**Location:** `skill/drop-and-raii.md:21` ("the second panic aborts the process via `panic_in_drop`").

`panic_in_drop` is the name of an unstable `-Z panic-in-drop={unwind,abort}` compiler flag whose default is `unwind`. The abort observed here (`t_dropanic.rs`: second panic printed, then process abort) is the ordinary double-panic path — a panic while unwinding ("panic in a destructor during cleanup"). Behaviorally the bullet is right; the named mechanism is not.

**Recommended correction:** "a panic while a panic is already unwinding aborts the process (double panic)".

### P3 — `rust_decimal` download figure is stale and internally inconsistent

**Location:** `skill/deps-macros-ergonomics.md:37` and `skill/references/sources.md:92` ("~100M all-time downloads") vs `skill/deps-macros-ergonomics.md:152` (§C12 row: "132M").

crates.io API 2026-09-02: `"downloads":138019361`. Three different numbers for one crate across the spec.

**Recommended correction:** one figure, dated, in `sources.md`, referenced from both places — or drop the number from §A1 (it is decorative there).

### P3 — Dead citation: the Grit post URL 404s

**Location:** `skill/references/sources.md:204` (`https://blog.gitbutler.com/grit/`).

`curl -I`: `https://blog.gitbutler.com/grit/` → 308 → `https://blog.gitbutler.com/grit` → **404**. `https://gitbutler.com/blog/grit` returns 200 but serves a JavaScript shell, so the quoted figures (360k LOC, 41,715/42,001, 99.3%, the `extensions.objectformat` anecdote) could not be re-verified from here. This underwrites the §D1a "façade fitted to the test" shape.

**Recommended correction:** update the URL to the current location and re-confirm the quoted figures against it (or archive a copy).

## Summary table

| # | Sev | Category (tier) | Location | Claim | Verified by | Status |
|---|---|---|---|---|---|---|
| 1 | P1 | §B12 (🔴) | `security.md:38`, `sources.md:176` | foreign-`aud` token authenticates by default | `jsonwebtoken` 9.3.1 + 11.0.0 run: `InvalidAudience` | wrong mechanism, right fix |
| 2 | P1 | §A1 (🔴) | `deps-macros-ergonomics.md:45` | `tokio-utils` does not exist | crates.io API: exists, 516k dl | wrong |
| 3 | P1 | §B5 (🔴) | `unsafe-and-ffi.md:19-20` | `zeroed::<bool>` invalid; misuse not stopped | rustc 1.97 debug+release runs | `bool` wrong; abort, not silent |
| 4 | P2 | §B7 (🟡) + triggers | `unsafe-and-ffi.md:51`, `SKILL.md:259,327`, `sources.md:166` | `IgnoredAny`/`flatten` bypass depth limit | serde_json 1.0.151 and 1.0.70 runs | only `from_value` on foreign `Value` |
| 5 | P2 | §B20 (🟡) | `data-and-types.md:53,59` | outer `deny_unknown_fields` goes dead with `flatten` | serde 1.0.229 and 1.0.130 runs | inverted |
| 6 | P2 | §A2 (🟡) | `concurrency-and-state.md:26`, `deps-macros-ergonomics.md:199` | `OnceLock` init panic poisons | run + std docs | only `LazyLock` poisons |
| 7 | P2 | §B15c/§B22 (🟡/🔴) | `async.md:187,252` | `futures::executor::block_on` panics; `Handle::block_on` deadlocks on multi_thread | tokio 1.53.1 runs | no panic (deadlock/Ok); panics on all flavors |
| 8 | P2 | §A1 (🟡) | `deps-macros-ergonomics.md:15`, `SKILL.md:65` | tokio 0.2 `mpsc::channel` tuple differs | docs.rs tokio 0.2.25 signature | fabricated example |
| 9 | P2 | §E2 (🟢) | `data-and-types.md:155` | `inefficient_to_string` in `clippy::perf` | clippy source + CHANGELOG | pedantic |
| 10 | P3 | §B12 | `security.md:17,48` | RUSTSEC-2022-0011 = unmaintained | advisory-db | wrong ID (2016-0005) |
| 11 | P3 | §B15a | `async.md:162` | `make(Send)` generates a variant alongside | trait-variant docs | rewrites in place |
| 12 | P3 | §B9 | `concurrency-and-state.md:48` | scope propagates via `resume_unwind` | run: payload replaced | fresh `panic!` |
| 13 | P3 | §B16 | `data-and-types.md:34` | NaN sorts to one end | run | both ends by sign |
| 14 | P3 | §B4 | `drop-and-raii.md:21` | abort "via `panic_in_drop`" | rustc flag semantics + run | double-panic abort |
| 15 | P3 | §A1 | `deps-macros-ergonomics.md:37`, `sources.md:92` | rust_decimal ~100M | crates.io: 138M; §C12 says 132M | stale/inconsistent |
| 16 | P3 | §A1 | `deps-macros-ergonomics.md:45` | `rust-decimal` "weaponized" | crates.io normalization; `rustdecimal` deleted | conflated names |
| 17 | P3 | sources | `sources.md:204` | Grit URL | curl: 308→404 | dead link |

## Confirmed good (checked, no change needed)

Compiled/run on rustc 1.97.0 unless noted:

- **§B26** integer `x << 32` on `u32`: debug panics, release yields `x` (count masked) — exactly as written. `-7 % 3 == -1`; float→int saturation (`300f32 as u8 == 255`, `NaN as i32 == 0`, `1e30 as i32 == i32::MAX`).
- **§B28** `&"café"[0..4]` panics, `"café".len() == 5`; `"ß".to_uppercase() == "SS"`, `"İ".to_lowercase() == "i\u{307}"`.
- **§B29** `[1,2,1,1,3,3,2].dedup() == [1,2,1,3,2]`.
- **§B27** `Instant` has `checked_add` and `saturating_duration_since` but no `saturating_add` (E0599 confirmed); `Duration::saturating_add` exists.
- **§A2** `Arc::make_mut` with a live `Weak` and unique strong count: no clone, `Weak::upgrade()` → `None`.
- **§B5** `#[repr(C)] struct { bool, u32 }` is 8 bytes (3 padding bytes).
- **§C2** `Path::join` on Windows: `\windows` → `C:\windows` (first component `RootDir`, `is_absolute() == false`); `\\server\share\x` → `[Prefix, RootDir]`, both `is_absolute()` and `has_root()` true; `D:foo` (prefix, no root) replaces `base` entirely with `has_root() == false` — the "reject leading `Prefix` or `RootDir`" guard catches every case tested.
- **§B15a** `trait Foo { async fn bar(&self); }` and the RPITIT form both fail `&dyn Foo` with E0038 on 1.97 (edition 2024); `tokio::spawn`-shaped `F: Send` bound on an AFIT future fails with E0277 — both as described.
- **§B15e** `watch`: `changed()` on a fresh receiver (and on a `subscribe()`d one) is pending until the next `send` — initial value is marked seen. `Notify::enable()` pattern matches tokio docs.
- **§B3** tokio `AsyncWriteExt` docs: `write`/`write_buf` cancel-safe (nothing written), `write_all` not, `write_all_buf` partially-advanced — verbatim match. `tokio::io::copy` (1.53.1) has no cancel-safety section, as the spec says.
- **§B23** `mpsc::Sender::send` docs: "in that case, the message is dropped and will be lost"; `reserve` then `Permit::send` is the documented remedy.
- **§B11** `max_blocking_threads` default is 512; queued tasks "remain in the queue until one of the busy threads pick it up"; spawned-thread stack default 2 MiB.
- **§B15c** `block_in_place` on `current_thread` panics ("can call blocking only when running on the multi-threaded runtime").
- **§B17** std `RwLock` docs quote and the potential-deadlock example are verbatim; tokio `RwLock` is documented write-preferring.
- **Version pins:** `Vec::into_raw_parts` unstable on 1.85/1.87/1.88/1.89, stable on 1.93.0+ (docs: "1.93.0"); `Box::<[u8]>::new_uninit_slice` unstable on 1.81, stable on 1.85 (1.82 pin consistent); `if let` match guards E0658 on 1.93/1.94, compile on 1.95.0 (all editions, 2021 tested); `never_type_fallback_flowing_into_unsafe` is `warn` in `rustc +1.80 -W help`, `deny` in edition 2024 per the edition guide; `await_holding_lock` is `pedantic` at tag `rust-1.60.0` and `suspicious` at `rust-1.61.0` (introduced 1.45, moved to pedantic in 1.50 per CHANGELOG) — the pin's history is exact.
- **tokio pins:** 1.39.0 is yanked on crates.io, 1.39.0 CHANGELOG "stabilize `consume_budget`"; 1.44.0 adds `task::coop` and `tokio/src/task/mod.rs` carries `#[deprecated = "Moved to tokio::task::coop::consume_budget"] pub use coop::consume_budget;` from that tag; 1.46.0 "`biased` option for `join!` and `try_join!`"; 1.47.0 "add `SetOnce`".
- **reqwest** 0.13.4: `tls_certs_only`/`tls_certs_merge` exist; `add_root_certificate` is deprecated in their favor — as written.
- **Clippy groups** (master source): `useless_vec` perf; `redundant_clone`, `needless_collect` nursery; `cast_possible_truncation` pedantic; `arithmetic_side_effects`, `unwrap_used`, `expect_used` restriction; `await_holding_lock` suspicious; `clone_on_copy` complexity (warn-by-default, so the 🟢 delegation holds).
- **Edition 2024:** `if_let_rescope` is auto-rewritten to `match` by `cargo fix --edition`; `tail_expr_drop_order` "will otherwise not automatically make any changes" — matches §B4a.
- **RustSec:** RUSTSEC-2022-0104 is "`structopt` is in maintenance mode" (informational/unmaintained); RUSTSEC-2018-0005 serde_yaml, `patched >= 0.8.4`; RUSTSEC-2023-0071 rsa Marvin, `patched = []`; RUSTSEC-2020-0071/-0159 are the `time`/`chrono` `localtime_r` segfaults.
- **cargo#2524** title: "Conditional compilation of dependency feature based on target doesn't work" — the target-specific-features gotcha §C7 cites.
- **Rust API Guidelines C-DEREF** heading and body text match the §C11 quotation.
- **Criterion FAQ** quote about cloud-CI virtualization noise is verbatim; `iai` last published 2021-01-24 (v0.1.1), as `sources.md` says.
- **sources.md spot-checks:** uproger field report contains every figure the spec attributes to it (80k LOC, 50 tasks, 34/50, 7/23, 40 unsafe = 13/9/18, ~40% of commits, ~50% cancel-safety); Faros page states "incidents-to-PR ratio is up 242.7% as teams move from low to high AI adoption"; arXiv 2602.22764 is Rust-SWE-bench (500 tasks, 34 repos, 21.2% / 28.6%, RustForger); arXiv 2602.21681 is AkiraRust and its full text contains the 75% (GPT-5 alone) and 100% pass-rate claims; all six arXiv IDs, the four Rust-blog advisories, the crates.io 2026-02-13 post, the TrapDoor article, the Aikido `onering` post, the Microsoft RustTraining book and the predr.ag post return HTTP 200.

## Verification performed

- Scratch rustc programs (outside the repo, `D:\tmp\ri-audit\*.rs`): `t_zeroed`/`t_z1..t_z5` (zeroed/uninitialized, debug and `-O`), `t_oncelock`, `t_scope`, `t_path`, `t_misc` (debug and `-O`), `t_dropanic`, `t_instant`, `t_rawparts` (× toolchains 1.85–1.96), `t_ifletguard` (× 1.93–1.96), `t_uninit_slice` (× 1.81/1.85), `t_dynafit`, `t_afit_send`.
- Scratch cargo project `D:\tmp\ri-audit\ri-cargo` (tokio 1.53.1, futures 0.3.34, serde 1.0.229, serde_json 1.0.151, jsonwebtoken 9.3.1 + 11.0.0): `blockon`, `probe2`, `probe3`, `serde_probe` (+ `from_value` mode), `jwt`; `cargo clippy` group probe. Control project `ri-old` (serde =1.0.130, serde_json =1.0.70) for the two serde findings.
- crates.io API (`/api/v1/crates/<name>[/<version>]`) for `tokio` 1.39.0/1.39.1, `tokio-utils`, `serde-json`, `rust-decimal`, `rust_decimal`, `rustdecimal`, `iai`; RustSec advisory-db raw TOML for the six advisories cited; tokio and clippy CHANGELOGs; clippy `master` and `rust-1.60.0`/`1.61.0`/`1.62.0` sources; tokio `task/mod.rs` at 1.43.0/1.44.0/1.45.0/master; docs.rs pages for reqwest, jsonwebtoken, tokio (mpsc, watch, io::copy, AsyncWriteExt, Builder, task), trait-variant, and std (`OnceLock`, `LazyLock`, `mem::zeroed`, `mem::uninitialized`, `thread::scope`, `RwLock`, `Vec::into_raw_parts`); edition-guide pages for the three 2024 changes; HTTP status of every external URL in `sources.md` that a 20-second fetch could reach.

## Not verified / out of scope

- §C12/§C12a and the per-row download counts (fixed earlier in this session; excluded by the task).
- `lightrun.com` was unreachable from this machine (connection failure on the root too) — the 43% / "zero very confident" figures could not be re-checked.
- Rust-SWE-bench's 76.3% / 43.7% / 32.6% compilation-failure breakdown (`sources.md:37-39`) is not in the arXiv abstract; the full paper body was not fetched.
- Percentages that are opinions or unmeasurable here (`overflow-checks` "≈5–15%+", serde #2363 "~50%/~86%", the `~30%` clippy catch rate beyond its 7/23 source) were left alone.
- Whether `tokio-utils` (finding 2) is benign was not assessed — only its existence.
