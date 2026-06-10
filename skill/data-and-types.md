# Rust Intel — Data, Types, Numerics & Iterators (serde, Eq/Hash, numeric, strings, allocation/complexity cost)

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §B6, §B16, §B20, §B26, §B27, §B28, §B29, §C4, §E2, §E3. Tier labels (🔴/🟡/🟢; A–E) and all cross-references are preserved verbatim.
> **Tiers in this module:** §B6 🟡 · §B16 🟡 · §B20 🟡 · §B26 🟡 (narrowing as — 🟢 except trust boundary) · §B27 🟡 · §B28 🟡 · §B29 🟡 · §C4 🟡 · §E2 🟡/🟢 · §E3 🟡/🟢. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §B6. Pattern matching exhaustiveness drift

**The trap**: a `match` written today is exhaustive. After someone adds a new enum variant, it may silently become non-exhaustive only in `if let` form, or use a wildcard `_ => ...` that swallows the new case.

**REQUIRED**:
- For every `match` on an enum I do not own: assume the enum is `#[non_exhaustive]` and handle the fallback explicitly with a logged/typed error, not silent ignore.
- For every `match` on an enum I own: avoid wildcard arms unless I want adding-a-variant to compile silently. Use explicit arms.
- For every `if let Some(x) = ...` on a `Result` or option-chain that could grow new "interesting" failure modes, prefer `match` with explicit arms.

**BANNED**:
- `_ => unreachable!()` or `_ => panic!()` for enums where new variants could legitimately be added.
- `_ => Ok(())` swallowing an error case.

## §B16. Equality and hashing contracts

**The trap**: `derive`-ed `Eq`/`Hash` is correct by construction. The moment a manual `impl PartialEq` or manual `impl Hash` enters the type — to normalize case, ignore a field, hash-by-key-only — the `HashMap`/`HashSet` contract `a == b ⇒ hash(a) == hash(b)` can be quietly violated. Compiles, runs, passes a few unit tests, and silently *loses entries from the map* in production: insert returns `None` (saying "no previous"), get returns `None`, but `len()` keeps incrementing — duplicate keys living at different hash buckets. Mirror trap on the ordering side: manual `Ord` that is not a *total* order corrupts `BTreeMap` ordering and `<[T]>::sort` (the sort assumes total order; if the relation is not total, the sort can produce arbitrary output, and `BTreeMap` invariants silently rot).

**BANNED**:
- Manual `impl PartialEq` whose result differs from `derive(PartialEq)` **on a type that also implements/derives `Hash` or is used as a `HashMap`/`HashSet` key**, without a corresponding manual `impl Hash` that matches. (A manual `PartialEq` on a type that is never hashed is sound — the contract only binds when `Hash` exists.)
- Manual `impl PartialOrd` without `impl Ord` for a type used as a key in `BTreeMap` / `BTreeSet` or as input to `.sort()` / `.sort_by()`.
- `sort_unstable` / `sort_unstable_by` / `sort_unstable_by_key` when the relative order of equal elements matters. "Unstable" means equal elements may be reordered, so a multi-key sort (sort by B over data already sorted by A) silently loses the secondary order. Use the stable `sort` / `sort_by_key` when the tie-break order is load-bearing; `sort_unstable` only when equal elements are genuinely indistinguishable or their order is irrelevant.
- `f64` / `f32` fields on a type that is later used as a `HashMap` or `BTreeMap` key, unless wrapped in `ordered_float::NotNan` / `ordered_float::OrderedFloat`. NaN breaks reflexivity (`NaN != NaN`), which breaks `Eq`'s contract; floats also have no total order in `PartialOrd` (NaN is unordered).
- Reaching for `f64::to_bits()` as a "trick" to hash a float — this works for bit-equal floats but splits `-0.0` and `+0.0` into two distinct keys (different bit patterns, yet `==` says equal — breaking the `a == b ⇒ hash(a) == hash(b)` contract) and treats NaN as a key (every NaN bit pattern is its own key, which is almost never what the caller wants).
- For a `HashMap`/`HashSet` whose **keys come from untrusted input** (request bodies, headers, parsed external data), replacing the default `RandomState` hasher (SipHash-1-3, seeded with per-process random state) with a fast hasher — `FxHashMap`/`rustc-hash` or `fnv` (not keyed at all, so always floodable on untrusted keys), or `ahash`/`foldhash`/`hashbrown` **configured with a fixed seed** (default-random `ahash`/`foldhash` are themselves DoS-resistant and fine for untrusted keys) — reintroduces **HashDoS**: an attacker who knows the (fixed or absent) seed forges keys that all collide into one bucket, degrading lookups to O(n) and burning CPU. std's own docs warn about exactly this. Use the default `RandomState` for untrusted keys; reserve the fast fixed-seed hashers for internal keys you control (enum tags, small integers, interned ids).
- Sorting floats with `v.sort_by(|a, b| a.partial_cmp(b).unwrap())` **panics** the moment a `NaN` is present (`partial_cmp` returns `None`). Use `v.sort_by(f64::total_cmp)` (a total order; `NaN` sorts to one end). The same `partial_cmp().unwrap()` trap hits `min`/`max` over floats. (If the values are provably non-`NaN` — validated, or `NotNan`/`OrderedFloat`/`Duration` — `partial_cmp().unwrap()` is not a bug, though `total_cmp` is still the cheaper default.)
- A comparator passed to `sort_by`/`sort_unstable_by` must be a consistent total order (strict weak ordering). An inconsistent comparator (e.g. one that flips direction based on external state) **may** make modern Rust's sort panic, and in any case yields an unspecified order (never UB) instead of silently scrambling — it only passed tests on small inputs by luck.

**REQUIRED**:
- If you customize `PartialEq`, customize `Hash` to match: `a == b ⇒ hash(a) == hash(b)`. Write the proof in a comment on the `impl Hash` block.
- For float keys, use `ordered_float::NotNan<f64>` (excludes NaN at construction) or normalize before hashing into a canonical form.
- `Ord` requires a *total* order: antisymmetric, transitive, total. `PartialOrd` does not. Before writing `impl Ord`, prove totality for your type — including edge cases (empty, all-equal, mixed signs for numerics).
- Flag a manual `impl PartialEq` / `impl Hash` / `impl Ord` inline (at write time) only when its contract is **non-trivial** — case/whitespace normalization, an ignored or derived field, a partial order, or any logic that can diverge from `derive`. A straightforward total `impl Ord` (or `PartialEq`) that simply compares one field or delegates to the fields in order needs no flag.

## §B20. `serde` field-presence vs null vs default

**The trap**: `Option<T>` with `#[serde(default)]` deserializes both `{ "field": null }` and `{}` (field absent) to `None`. For protocols where "absent" and "explicitly null" carry different semantics (HTTP PATCH, JSON-Merge-Patch, "preserve this field" vs "clear this field"), this collapse is a silent semantic bug — the code compiles, deserializes successfully, and propagates the wrong intent downstream. Adjacent traps: `#[serde(untagged)]` enums silently pick the first matching variant when two variants accept overlapping structural shapes; `#[serde(rename = "...")]` typos pass `cargo build` and corrupt the wire format.

**BANNED**:
- `Option<T>` field with `#[serde(default)]` in any API that must distinguish "field absent" from "field present as null" — both deserialize to `None` and the caller can no longer tell which the client sent.
- `#[serde(untagged)]` enum where two variants accept overlapping structural shapes — the first matching variant wins, silently, on inputs the API author did not anticipate. (Tag with `#[serde(tag = "type")]` instead, or write a custom `Deserialize` that proves disjointness.)
- `#[serde(rename = "wire_name")]` without a round-trip test (encode → decode equality on a representative sample of values).
- Trusting `#[serde(deny_unknown_fields)]` to catch typos — it catches unknown *incoming* fields, not typos in the struct field names that are being serialized.
- Deserializing a large integer (snowflake ID, nanosecond timestamp, `u64` > 2^53) into an `f64` field, or reading it via `serde_json::Value::as_f64()` — `f64` has only 53 bits of integer mantissa, so values above 2^53 silently lose precision (IDs collapse to neighbors). Use `u64`/`i64` typed fields, or `serde_json::Value::as_u64()`, and prefer `arbitrary_precision` only when you control both ends.
- Combining `#[serde(flatten)]` with `#[serde(deny_unknown_fields)]`: the two are documented as incompatible, and the failure is silent — `deny_unknown_fields` simply **stops rejecting** unknown fields (no error, unknown keys are accepted) once a sibling field is flattened. Separately, `flatten` routes the flattened fields through serde's internal `Content` buffer, which **cannot represent `u128`/`i128`** (deserialization fails with "u128 is not supported") and mishandles non-string map keys — fields that deserialize fine directly break the moment they sit behind a `flatten`. Don't pair the two attributes; if you need both behaviors, write a custom `Deserialize` (intercepting `MapAccess`) instead.

**REQUIRED**:
- For three-state semantics (absent / null / value), use `Option<Option<T>>` with `#[serde(default, deserialize_with = "double_option")]`, or a custom enum (`enum FieldUpdate<T> { Absent, Null, Set(T) }`) with an explicit `Deserialize` impl. Document the chosen scheme on the field.
- For `#[serde(untagged)]`, prove disjointness of variant shapes (no two variants accept the same JSON shape) or add a discriminator tag.
- Round-trip every (de)serialization with a property test (`proptest` or `quickcheck`) — encode arbitrary value, decode, assert equal.
- Flag each `#[serde(untagged)]`, `#[serde(rename = "...")]`, and `#[serde(default)]` on `Option<T>` inline (at write time).

## §B26. Lossy numeric conversions and integer overflow

**The trap**: `as`-casts between numeric types silently truncate, wrap, or saturate — no panic, no warning by default (`clippy::cast_possible_truncation` is pedantic, off by default, so the LLM never sees it). It compiles every time, tests on small numbers are green, and it breaks on large IDs/offsets/lengths in production. The same blind spot covers plain integer arithmetic: a bare `+`/`-`/`*` that overflows **panics in debug but silently wraps in release** (`overflow-checks` is off by default in the release profile), so the profile you test in and the profile you ship in disagree — and a `/`/`%` by zero or an out-of-range index panics in both.

**BANNED**:
- `as` for narrowing or sign-changing integer casts without a proven range: `u64 as u32`, `i64 as i32`, `usize as u32`, `i32 as u8`, `value.len() as u32`. The high bits are silently dropped; on a `>4 GiB` / `>4 billion` collection, `len() as u32` yields garbage.
- Assuming `usize as u64` or `u32 as usize` is always lossless — `usize` is 32-bit on wasm32 and other 32-bit targets, so `u64 as usize` truncates there.
- Treating `f as iN` / `f as uN` as wrapping or UB. Since Rust 1.45 it is **saturating**: `300.0_f32 as u8 == 255`, `-1.0_f32 as u8 == 0`, `NaN as i32 == 0`, `1e30 as i32 == i32::MAX`. Code written against pre-1.45 / C semantics gets a silently saturated value instead of the expected wraparound or error.
- Bare `+` / `-` / `*` / `pow` / `Iterator::sum` / `product` on integers that **come from untrusted input, grow unbounded, or accumulate monotonically over the process lifetime** (counters, offsets, lengths, balances, running totals) without `checked_*` / `saturating_*` / `wrapping_*`. This does **not** mean every arithmetic expression: routine bounded locals (`i + 1` in a loop over a known-small range, `(lo + hi) / 2` on in-range indices, arithmetic on values you just proved fit) are fine and should not be flagged. The target is the value that can realistically reach the type's edge. In **debug** an overflow panics (`attempt to add with overflow`); in **release** — where `overflow-checks = false` by default — it **silently wraps** (two's-complement). `cargo test` runs the debug profile and stays green; the release binary wraps a counter/offset/size through zero in production. This is a classic and easily-missed debug-vs-release divergence: the profile you test in and the profile you ship in disagree, and no lint catches it by default (`clippy::arithmetic_side_effects` is in the **`restriction`** group (not `pedantic`), off by default — so unlike the lossy-cast lint, even `-W clippy::pedantic` will not surface integer overflow; you must enable it explicitly).
- `a / b` or `a % b` on integers without proving `b != 0` — both panic in **debug and release** on a zero divisor; with `b` from untrusted input this is a clean remote DoS panic. (Note also: integer `%` truncates toward zero, so `-7 % 3 == -1`, not `2` — a surprise if you expect Python-style modulo.)
- `v[i]` / `&slice[a..b]` / `slice.split_at(i)` with an index derived from untrusted input — panics on out-of-bounds (the slice/integer mirror of §B28's string-boundary panic).
- `debug_assert!` / `debug_assert_eq!` are **compiled out in release builds** (the same `cfg(debug_assertions)` axis as overflow checks). An invariant or security check that must hold in production belongs in `assert!`, not `debug_assert!`; reserve `debug_assert!` for expensive checks whose failure is non-critical. (Converse trap: `dbg!` is **not** stripped — it evaluates and prints to stderr in release too, so a forgotten `dbg!` leaks into production output.)

**REQUIRED**:
- For narrowing conversions, use `u32::try_from(x)?` (or `TryFrom` / `try_into`) and handle the range `Err`. Keep `as` only for widening (`u8 as u64`) or explicitly-truncating-by-design casts with a `// truncation intentional: <reason>` comment.
- For float→int with range control, do an explicit check (`if x.is_finite() && x >= 0.0 && x <= u8::MAX as f32`) before the `as`; do not rely on saturation as your error handling.
- **Primary — make debug and release agree:** set `overflow-checks = true` in the release profile (`[profile.release]`). This is the highest-leverage fix for a binary you control: it turns every overflow into a panic in *both* profiles, so the profile you test in and the profile you ship in no longer disagree, without auditing every `+`. **Caveat:** it is a *global* runtime cost (≈5–15%+ on arithmetic-heavy code, and it blocks autovectorization of the checked operations). For a **numeric hot-path binary** (codecs, DSP, simulation, tight numeric kernels) prefer point `checked_*` at the few sites where overflow is actually reachable over the global flag — the §C4 "profile first" principle applies. Note this is a **binary-crate** lever: a *library* does not own its consumer's `[profile.release]`, so a library should protect long-lived or untrusted arithmetic with per-site `checked_*` (the Secondary rule below) rather than assume the global flag is set.
- **Secondary — explicit per-site handling**, for (a) values arriving from untrusted input at a trust boundary, (b) any site where wraparound must be caught as a *typed error* rather than a panic, and (c) any value that accumulates monotonically over the process lifetime (long-lived counters, offsets, running totals) when `overflow-checks = true` is not guaranteed in the project's release profile — i.e. don't rely on the global flag being set if you don't control the build profile: `checked_add`/`checked_mul`/… returning `Option` (handle `None` as a real error), `saturating_*` where clamping is the correct semantics, or `wrapping_*` **only** where wraparound is intended, with a `// wrapping intentional: <reason>` comment. This case (c) is what keeps a real long-lived counter protected by default — the over-flagging guard above (routine bounded `i + 1`) still applies; the target is the value that genuinely accumulates toward the type's edge.
- For division/indexing on untrusted input: `checked_div` / `checked_rem`, and `slice.get(i)` / `slice.get(a..b)` (returns `Option`) instead of the panicking `[]`.
- Narrowing `as` casts are a 🟢-tier item (delegated to `clippy::cast_possible_truncation` under `-W clippy::pedantic`, in the Post-flight command) — do not hand-surface them; this is the backing rule clippy enforces. **Exception (mirrors the 🟢-tier caveat):** a narrowing cast *on a trust boundary* — `len() as u32`, or any cast applied to untrusted/network input — is surfaced even with clippy/pedantic off, because there the truncation is a correctness/security defect, not a lint nit.
- `saturating_sub` on a `usize` length/cursor (`len - cursor`, `end - start`, `remaining - n`) to "avoid the underflow panic" — it does not fix the bug, it hides it. When the subtrahend exceeds the minuend (a cursor past the end, an off-by-one), `saturating_sub` quietly yields `0`, so the loop terminates early or the slice comes back empty with no signal. If `cursor > len` is genuinely impossible, prove it and use plain `-` (let it panic on the violated invariant); if it is possible, it is a *logic error* to handle explicitly (`checked_sub` → `None` as a real error path), not to clamp to zero.

## §B27. Wall-clock vs monotonic time

**The trap**: measuring durations and timeouts with a wall-clock that is not monotonic — NTP correction, manual clock changes, and DST produce a negative or jumping "duration". It compiles, the test over a few seconds on a stable clock is green, and it breaks days later or whenever the user's clock shifts.

**BANNED**:
- `SystemTime::now()` / `chrono::Utc::now()` / `std::time::SystemTime` to measure intervals, durations, timeouts, or benchmarks. The wall-clock can jump backward or forward between two readings.
- `.elapsed().unwrap()` or `.duration_since(earlier).unwrap()` on a `SystemTime` — both return a `Result` precisely because the clock can go backward; `.unwrap()` panics in production on an NTP step.
- `Duration` / `Instant` arithmetic that can overflow (`instant + very_large_duration`, `d1 + d2` on untrusted inputs) without a guarded variant. `Duration` has both `checked_add` and `saturating_add`; `Instant` has `checked_add` and `saturating_duration_since` (but **no** `saturating_add` on stable) — use those rather than bare `+`.

**REQUIRED**:
- `Instant::now()` for every duration, deadline, timeout, and benchmark — it is monotonic by contract. Use `SystemTime` only for absolute wall-clock stamps (logs, "created at") that must be serialized or displayed.
- Handle the `Err` from `SystemTime::duration_since` / `elapsed`, or use `Instant::saturating_duration_since`.

## §B28. UTF-8 and string-boundary hazards

**The trap**: string operations that are correct on ASCII and panic or corrupt on non-ASCII. Tests on `"hello"` are always green; the panic is deterministic on the first accented name, emoji, Cyrillic, or CJK character in production.

**BANNED**:
- `&s[a..b]` with computed indices without checking `s.is_char_boundary(_)` — it panics if an index lands inside a multi-byte UTF-8 character (`&"café"[0..4]` panics: 4 bytes, but the boundary is inside `é`).
- Conflating `s.len()` (a count of **bytes**) with a count of characters: `s.len()` for "take the first N characters", for display width, or for limits. `"café".len() == 5`, not 4.
- `to_lowercase()` / `to_uppercase()` for comparing protocol/ASCII tokens — these are full Unicode transformations and can change length (`ß` → `SS` under `to_uppercase`; Turkish `İ` → `i̇` under `to_lowercase`). For ASCII protocols use `eq_ignore_ascii_case` / `to_ascii_lowercase`.

**REQUIRED**:
- `s.get(a..b)` (returns `Option<&str>`, never panics) instead of `&s[a..b]` for computed bounds; `char_indices()` for iteration with byte positions; `chars().take(n)` for "the first N characters".
- For correct grapheme-boundary handling (emoji clusters, combining characters) use the `unicode-segmentation` crate (`graphemes(true)`); `chars()` alone splits on code points, not graphemes.
- `eq_ignore_ascii_case` for protocol strings; full Unicode case-folding only for user-facing display text.

## §B29. Iterator and slice adapter traps

**The trap**: the most common surface in LLM-generated Rust is also where several `std` adapters have silent, non-obvious semantics. The code compiles, `clippy` is quiet, and tests on equal-length / small / sorted inputs are green — then production data hits an edge the adapter handles differently than the LLM assumed.

**Specifically dangerous patterns**:
- **`zip` silently truncates to the shorter side.** `a.iter().zip(b.iter())` yields `min(a.len(), b.len())` pairs — the tail of the longer side is dropped with no error. When the two sequences are *expected* to be equal length (rows and headers, keys and values), a length mismatch becomes silent data loss, not a panic. Check lengths first, or use `itertools::zip_eq` (which panics on mismatch) when equal length is an invariant.
- **`Vec::dedup` only removes *consecutive* duplicates.** On an unsorted vector it does **not** produce a set: `[1,2,1,1,3,3,2]` dedups to `[1,2,1,3,2]`. For set semantics, `sort` first (then `dedup`) or collect into a `HashSet`/`BTreeSet`.
- **`chunks(0)`, `windows(0)`, `step_by(0)` panic.** A zero chunk/window/step size is a runtime panic, not an empty iterator. When the size comes from config or untrusted input, this is a remote panic / DoS.
- **`collect` into a `HashMap`/`HashSet` silently overwrites duplicate keys (last wins).** `pairs.into_iter().collect::<HashMap<_,_>>()` keeps only the last value per key and the resulting `len` is smaller than the input — silent loss when the input was supposed to be unique.

**REQUIRED**:
- When two sequences must be the same length, assert it (or use `zip_eq`) instead of relying on `zip` to line them up.
- Treat any chunk/window/step size derived from input as untrusted: guard `> 0` before calling.
- When collecting key/value pairs that must be unique, verify uniqueness rather than letting `collect` coalesce silently.

**BANNED**:
- `Vec::dedup` where adjacency of duplicates is not a proven invariant — flag a `.dedup()` with no `sort`/grouping visibly preceding it (it removes only *consecutive* duplicates, so on unsorted data it is not set-deduplication).
- A chunk/window/step size flowing from config or the network into `chunks` / `windows` / `step_by` without a `> 0` guard.

---

## §C4. Iterator and allocation discipline

**The trap**: unnecessary `clone()` on `Copy` types, materializing collections mid-chain with `collect::<Vec<_>>()` only to iterate again, `format!` in hot paths, treating `String` as the default string type everywhere.

**REQUIRED**:
- Profile before defending these on micro grounds — this "profile first" caveat is about *micro-costs* (an extra allocation, a `format!`, a redundant `clone`). It does **not** apply to the algorithmic-complexity items in BANNED below: an accidental O(n²) (`remove(0)`/`contains` in a loop) is a defect to fix on sight, not a micro-optimization to defer to a profiler. As defaults:
- Prefer `&str` and `&[T]` in function signatures over `String` and `Vec<T>`.
- Iterator chains stay lazy: avoid intermediate `.collect()` unless the next stage requires materialization.
- For hot paths, write to a `&mut impl io::Write` or `&mut String` via `write!`/`writeln!` rather than allocating with `format!`.
- `clone()` is fine when needed; surface it in the summary so the user can question it.

**BANNED**:
- `Vec::remove(0)` / `Vec::insert(0, _)` in a loop (each is O(n) — it shifts the whole tail), turning an O(n) pass into O(n²); likewise `Vec::contains` inside a loop is O(n²). Tests on small N pass; production degrades to seconds/minutes at scale. Use `VecDeque` for FIFO (O(1) front ops), `swap_remove` when order doesn't matter, or a `HashSet` / `retain` instead of repeated `contains`.
- `{:?}` (Debug) on `&[u8]` / `Vec<u8>` for hashes, checksums, IDs, or wire frames — it prints a decimal array `[222, 173, 190, 239]`, not hex. Use `hex::encode` (or a `LowerHex` newtype) for byte diagnostics. (For *secret* bytes, see §B12 — don't log them at all.)
- Treating a single `io::Read::read(&mut buf)` as if it fills `buf`, or a single `Write::write(data)` as if it writes all of `data`. Both may return `Ok(n)` with `n < len` even without EOF (sockets, pipes, large buffers). The code compiles, tests pass on small local buffers where one call happens to transfer everything, and production truncates or splices messages under load / over the network. Use `read_exact` / `write_all` / `read_to_end`, or loop until the count is satisfied; reserve bare `read`/`write` for code that genuinely handles short transfers.
- A `BufWriter`/`BufReader` flushes on drop, but the implicit flush in `Drop` **discards any `io::Result`**. On a failing writer (disk full, broken pipe, closed socket) the last buffered bytes are lost with no error surfaced. Call `.flush()?` explicitly before the writer is dropped when the data must be durable.

## §E2. Allocation that need not happen — *Cheap once, ruinous in a loop.*

- **Where it shows up**: reflexive `.clone()`/`.to_vec()`/`.to_string()` to dodge a borrow (§C5); an intermediate `.collect::<Vec<_>>()` only to iterate once; `Vec`/`String` grown by `push` in a loop with no `with_capacity` when the size is known; `format!` where `write!`/`Display`/`push_str` would write in place; returning owned `Vec`/`String` where `impl Iterator`/`&[T]`/`Cow<'_, str>` (§B1b) would let the caller decide; `Box`/`Arc` that buys nothing; a large struct passed by value where `&T` suffices.
- **The cheaper move**: borrow don't clone; take `&str`/`&[T]`, return `Cow` when ownership is conditional; pre-size with `with_capacity`/`reserve`; stream with iterators instead of materializing; reuse a scratch buffer (`clear()` + refill) across iterations and calls; `bytes::Bytes` for shared/zero-copy network buffers.
- **Leave it when**: one-shot on a cold path, the clone is of a `Copy`/tiny type, or removing it tangles lifetimes for no measured gain. `clippy::perf` flags the obvious cases (`inefficient_to_string`, `useless_vec`); `redundant_clone`/`needless_collect` live in `nursery` (allow-by-default) and need an explicit `-W` — the Post-flight command enables `-W clippy::redundant_clone`.
- 🟢 + 🟡. Cross: §C5, §B1b.

## §E3. Complexity that compounds — *An O(n²) invisible at n=10 is an outage at n=10⁴.*

- **Where it shows up**: accidental quadratic — `.contains()`/`.position()`/`Vec::remove(0)`/`insert(0, _)` inside a loop (§C4); a nested-loop join that re-scans the inner collection per outer element; rebuilding or re-sorting a collection every iteration. The wrong container for the access pattern: `Vec` used for membership, front-insertion, or keyed lookup.
- **The cheaper move**: hoist the inner collection into a `HashSet`/`HashMap` once, then O(1) lookup; `VecDeque` for front/back queues; `swap_remove` when order is free; `SmallVec`/`ArrayVec` for almost-always-tiny collections; `BTreeMap` for ordered iteration; a `match` or fixed array (or `phf`) for tiny static key sets; sort once, not per iteration.
- **Leave it when**: n is provably small and bounded (a 3-element config), or the path is cold. Algorithmic complexity is the one performance class worth fixing without a profiler — unlike micro-allocation, it does not wait for load to hurt.
- 🟡 (escalate to surface on a per-request path). Cross: §C4. Verify any new crate before adding — §A1.
