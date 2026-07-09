# Gap audit — deserialization & parsing attack surface (resource exhaustion + structural attacks on untrusted input)

**Scope.** This audit hunts for real, documented, Rust-specific deserialization/parsing footguns that (a) an LLM would plausibly emit, (b) compile and pass `cargo test` on small/benign input, (c) DoS or corrupt in production on adversarial input, and (d) are **not already covered** by the rust-intel skill. It focuses on decompression/archive bombs, recursion bombs *inside third-party parser crates* (as opposed to the hand-written recursion of §B7), serde-specific structural gaps beyond §B20's field-presence coverage, and algorithmic-complexity attacks in parser crates beyond §B16's ReDoS/HashDoS. I checked each candidate against the *actual bullet text* in `data-and-types.md` (§B16, §B20, §B29, §C4, §E2/§E3, Substitution catalog), `security.md` (§C2), and `unsafe-and-ffi.md` (§B7), not just section titles.

The existing coverage that candidates most often collided with:

- **§B7** (`unsafe-and-ffi.md`) covers three things: large *stack* arrays, **hand-written** unbounded recursion depth ("a recursive-descent parser, tree/JSON/expression walk with no depth limit"), and `Vec::with_capacity(n)` / `vec![0u8; n]` where `n` is a wire length-prefix. Its recursion bullet is explicitly scoped to *code you wrote*; its allocation bullet is explicitly scoped to a *single visible preallocation call*.
- **§B20** (`data-and-types.md`) covers `Option<T>` + `#[serde(default)]` null-vs-absent, `untagged` variant overlap, `rename` typos, f64 precision, and the `flatten` + `deny_unknown_fields` *incompatibility* and `flatten`'s u128/non-string-key breakage.
- **§B16** covers HashDoS (untrusted keys + fast/fixed-seed hasher) and ReDoS (backtracking regex engines).
- **§B26** covers integer overflow / narrowing casts generically.

Five candidates survived; two were folded into a single entry; three were rejected as already-covered or out-of-scope (see verdict).

---

## Gap 1 — Decompression bomb: capping compressed input does not cap decompressed output (🔴)

**Why it's in-scope.** A handler that reads a gzip/zlib/zip/tar body, caps the *compressed* size (via `Content-Length`, or the zip crate's own internal `.take(compressed_size)`), and then calls `decoder.read_to_end(&mut out)` compiles, round-trips on benign archives, and passes every test — then a ~1 KB adversarial payload (the classic 10 MB → 10 GB gzip ratio, or `zip`'s nested-bomb) inflates to gigabytes and OOM-aborts the process. The amplification happens *inside a trusted-looking decode call*, with no attacker-controlled integer literal anywhere in the code.

**Why it's not already covered.** §B7's allocation bullet targets a *visible* `Vec::with_capacity(n)` / `vec![0u8; n]` where `n` is a length field the code itself reads from the wire — the mitigation it names is "clamp `n`" and "`Read::take(limit)`" *on the input*. A decompression bomb has **no such `n`**: the code never sees the decompressed size as an integer it could clamp; the growth is driven by `read_to_end` on a streaming decoder that produces unbounded output from bounded input. `flate2` has no built-in output limit — its decoders produce unbounded output on `read_to_end`, and capping is entirely the caller's responsibility ([flate2 `Decompress` docs](https://docs.rs/flate2/latest/flate2/struct.Decompress.html)). Critically, the `zip` crate *does* wrap its reader in `.take(compressed_size)` internally — bounding the **compressed** side and giving a false sense of safety — while the decompressed side stays unbounded ([zip `read.rs`](https://docs.rs/zip/latest/zip/read/struct.ZipArchive.html)), and header size hints "may not be the actual uncompressed size for malicious or corrupted files" ([rawzip docs](https://docs.rs/rawzip)). Grepping §B7 for "decompress", "gzip", "inflate", "flate2", "zip" returns nothing; the whole shape (`take` on the *output* of the decoder, not the input) is absent.

**Concrete compiles-but-dangerous shape:**
```rust
use std::io::Read;
use flate2::read::GzDecoder;

// Caller already capped the COMPRESSED body to, say, 1 MiB. Feels safe. It isn't.
fn decode_body(compressed: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut out = Vec::new();
    GzDecoder::new(compressed).read_to_end(&mut out)?; // 1 KiB in -> multi-GiB out -> OOM
    Ok(out)
}
```
The fix wraps the **decoder** in `.take(MAX + 1)` and errors if the limit is hit — the mirror of §B7's `Read::take` advice, but applied to the decoder's output rather than the socket's input:
```rust
const MAX: u64 = 64 << 20;
let mut limited = GzDecoder::new(compressed).take(MAX + 1);
let mut out = Vec::new();
limited.read_to_end(&mut out)?;
if out.len() as u64 > MAX { return Err(/* decompression bomb */); }
```

**Grounding source.** [flate2 `Decompress` docs](https://docs.rs/flate2/latest/flate2/struct.Decompress.html) (no output limit; `total_out` is the only observability); [zip `ZipArchive` docs](https://docs.rs/zip/latest/zip/read/struct.ZipArchive.html) (internal `.take` bounds compressed only); [rawzip docs](https://docs.rs/rawzip) (size hint untrustworthy on malicious archives); OWASP "Zip bomb" / CWE-409 (Improper Handling of Highly Compressed Data).

**Severity.** 🔴 — clean remote DoS on untrusted input, invisible to tooling, and the false-safety from an *input* cap makes it worse than §B7's naked `with_capacity`. Matches §B7's own 🔴-adjacent framing of "clean remote DoS vector."

**Suggested placement.** New BANNED bullet in **§B7** (`unsafe-and-ffi.md`), directly after the `with_capacity(untrusted_n)` bullet, plus a trigger-table row in SKILL.md ("decompress", "gunzip", "inflate", "unzip", "extract archive", "gzip/deflate/zlib body" → §B7 decompression bomb) and a code-pattern row (`GzDecoder`/`DeflateDecoder`/`ZlibDecoder`/`ZipArchive` + `read_to_end`/`extract` with no output cap). It is a genuinely distinct *shape* from the existing bullet (amplification inside the decode call, no clampable `n`), so it warrants its own bullet even though it lives under the same category.

---

## Gap 2 — Recursion bomb inside a third-party parser AST / no-parse deserialization path (🟡, 🔴 on a security boundary)

**Why it's in-scope.** Deeply nested JSON/YAML pins a worker or aborts the process via stack overflow — a `SIGSEGV`/abort, **not** a catchable panic (§B7 already makes this point for hand-written recursion). The in-scope subtlety is that an LLM reasonably *believes it is protected*: "serde_json has a recursion limit," which is true for `from_str`/`from_slice` (default 128, [serde_json `Deserializer`](https://docs.rs/serde_json/latest/serde_json/struct.Deserializer.html)). But that limit is enforced **only during the parse-from-text phase**. Recursing over an *already-constructed* `serde_json::Value` — via `IgnoredAny`, a second `T::deserialize(value)`, `#[serde(flatten)]`/`untagged` (which route through the buffered `Content` tree), or any middleware that hands you a `Value` — **bypasses the depth check entirely** and overflows the stack.

**Why it's not already covered.** §B7's recursion bullet is scoped to "a recursive-descent parser, tree/JSON/expression walk" that the author *wrote* — hand-rolled recursion with "no depth limit," fixed by "a `depth: u32` parameter" or an explicit `Vec` stack. That advice does not reach the case where the recursion lives *inside serde/serde_json's own visitor machinery* and the author wrote no recursive function at all — you cannot add a `depth` parameter to `IgnoredAny` or to a derived `Deserialize`. It also does not address the *false-safety* asymmetry (parse path guarded, AST/`deserialize`-from-`Value` path unguarded). `serde_yaml` has the analogous hole with **no default limit and no parse-vs-AST distinction**: unbounded YAML nesting/anchors aborted via uncontrolled recursion ([RUSTSEC-2018-0005](https://rustsec.org/advisories/RUSTSEC-2018-0005.html)). Grepping §B7 and §B20 for "IgnoredAny", "recursion_limit", "serde_stacker", "Value", "AST" returns nothing.

**Concrete compiles-but-dangerous shape:**
```rust
// Middleware handed us an already-parsed Value (depth limit already consumed/bypassed).
// The re-deserialize walks the AST with NO depth check -> stack overflow -> abort (uncatchable).
fn handle(v: serde_json::Value) -> Result<Config, serde_json::Error> {
    serde_json::from_value(v) // recurses to the depth of `v`; 128-limit does not apply here
}

// Or the skip path, same overflow, looks maximally innocent:
#[derive(serde::Deserialize)]
struct Ping { id: u64 } // unknown deeply-nested fields skipped via IgnoredAny -> overflow
```

**Grounding source.** [serde issue #3023 — stack overflow in `IgnoredAny` on deeply nested `serde_json::Value`](https://github.com/serde-rs/serde/issues/3023) (explicitly: "deserializing from an already constructed AST bypasses these checks"); [serde_json `Deserializer` docs](https://docs.rs/serde_json/latest/serde_json/struct.Deserializer.html) (128 default, parse-phase only); [serde-json #162 / #334](https://github.com/serde-rs/json/issues/162) (recursion-limit configurability history); [`serde_stacker`](https://github.com/dtolnay/serde-stacker) (dtolnay's own dynamic-stack-growth adapter — the canonical mitigation); [RUSTSEC-2018-0005](https://rustsec.org/advisories/RUSTSEC-2018-0005.html) (serde_yaml uncontrolled recursion → abort).

**Severity.** 🟡 by default, **🔴 when the nested value is attacker-supplied on a request path** — same tiering logic §B7 uses for its untrusted-recursion bullet (uncatchable abort = DoS).

**Suggested placement.** Add to the existing **§B7** recursion bullet a sub-clause: "the depth limit inside a third-party parser applies to its *parse* phase only — re-deserializing an already-built `serde_json::Value` (or via `IgnoredAny`/`flatten`/`untagged`) bypasses it; `serde_yaml` has no limit at all (RUSTSEC-2018-0005). Mitigate with `serde_stacker` or by capping input depth/size before the AST is built." Add SKILL.md trigger rows: phrase ("re-deserialize a Value", "from_value", "middleware JSON", "parse YAML config from upload") and code-pattern (`serde_json::from_value` / `IgnoredAny` on untrusted input; `serde_yaml::from_*` on an untrusted body). This is a **sub-clause of §B7**, not a new category — the failure mode (uncatchable stack overflow on untrusted depth) is identical; only the *locus* of the recursion (inside a dependency) is new.

---

## Gap 3 — `#[serde(flatten)]` / internally-tagged / adjacently-tagged: silent switch to buffer-everything mode (🟡)

**Why it's in-scope.** Adding `#[serde(flatten)]` (or an internally/adjacently-tagged enum) to a struct compiles, passes unit tests on small fixtures, and silently switches serde from streaming into a "collect the *entire* input into an in-memory `Content` tree, then re-deserialize from it" mode. Consequences an LLM will not anticipate: (a) ~2× deserialization time and an allocation that would otherwise not happen — a per-request performance cliff on a hot path; (b) error messages lose line/column and field names (they point at the end of the struct); (c) a large untrusted body is *fully materialized* into the `Content` tree regardless of how few fields you keep — an allocation-amplification distinct from Gap 1.

**Why it's not already covered.** §B20 mentions `flatten` **only** in the narrow context of its *incompatibility with `deny_unknown_fields`* and its u128/non-string-key breakage. It says nothing about the buffering *performance/allocation cliff*, the streaming break, or the error-quality regression — which are the reasons this bites in production. §E2 (allocation) is generic and does not name the `flatten`/tagged-enum trap. Grepping §B20 and §E2 for "Content", "buffer", "streaming", "internally tagged" (in a perf sense) returns only the `deny_unknown_fields` incompatibility note.

**Concrete compiles-but-dangerous shape:**
```rust
#[derive(serde::Deserialize)]
struct Envelope {
    id: u64,
    #[serde(flatten)]                 // <- flips the whole struct into buffered Content mode
    meta: std::collections::HashMap<String, serde_json::Value>,
}
// On a 10 MB request body you keep `id` from, serde still buffers the ENTIRE input into
// an intermediate Content tree first; ~2x slower, allocates, and errors lose position info.
```

**Grounding source.** [serde #2186 — "Avoid lossy buffering in `#[serde(flatten)]`"](https://github.com/serde-rs/serde/issues/2186) (buffers all unknown entries, allocates, confuses position-tracking deserializers); [serde #2363](https://github.com/serde-rs/serde/issues/2363) (fixing it cuts deserialization time ~50%, up to ~86% when only a subset of fields matters — quantifies the cliff); [serde #1183](https://github.com/serde-rs/serde/issues/1183) (internal buffering disrupts format-specific features); [serde #2035](https://github.com/serde-rs/serde/issues/2035) (flatten error messages lose position/field); [serde #1495](https://github.com/serde-rs/serde/issues/1495) (internally-tagged enums hit the same buffering, >2× slower); [Armin Ronacher, "Abusing Serde"](https://lucumr.pocoo.org/2021/11/14/abusing-serde/) (the `Content` mechanism explained).

**Severity.** 🟡 (Tier E cost / correctness-of-errors) — never 🔴; matches §E2's tiering. Escalate to surface on a per-request or hot deserialization path.

**Suggested placement.** Extend the existing §B20 `flatten` bullet (it already discusses `flatten`) with the buffering cliff, *or* add a Substitution-catalog-style note under §E2. Since §B20 already owns `flatten`, the cleanest home is a new sentence on that bullet plus a §E2 cross-reference. Not a new category.

---

## Gap 4 — `#[serde(deny_unknown_fields)]` absent where request validation matters; duplicate-key last-wins (🟡)

**Why it's in-scope.** By default serde **ignores unknown fields** and, for JSON objects, **silently accepts duplicate keys with last-wins semantics**. Both compile and pass tests. In a request-validation or security context, ignoring unknown fields lets a client smuggle typo'd or malicious fields past validation (e.g. `{"amount": 5, "amout": 5000}` — the typo'd real field is dropped, the attacker's is honored, or a mass-assignment field slips through); duplicate keys enable request-smuggling-style parser-differential attacks (a WAF/proxy sees the first value, the Rust service the last). Neither is caught by any test that only feeds well-formed input.

**Why it's not already covered.** §B20 mentions `deny_unknown_fields` **only to warn that it does NOT catch typos in your own struct's serialize names** — the opposite direction. It never says "add `deny_unknown_fields` on untrusted request structs so unexpected incoming fields are rejected." §B29 covers `collect::<HashMap>` last-wins for *your* iterator, not serde's JSON-object duplicate-key handling during deserialization. Grepping §B20/§B29 for "duplicate key", "last wins" (in a JSON-object sense), "mass assignment", "deny_unknown_fields" (as a *recommendation* for untrusted structs) confirms the gap.

**Concrete compiles-but-dangerous shape:**
```rust
#[derive(serde::Deserialize)] // no deny_unknown_fields
struct Transfer { to: String, amount: u64 }
// Client sends {"to":"x","amount":1,"amount":1000000} -> last-wins, amount=1000000 silently.
// Or {"to":"x","amount":1,"is_admin":true} -> unknown field ignored, no error, validation blind.
```

**Grounding source.** [serde `deny_unknown_fields` container attribute](https://serde.rs/container-attrs.html#deny_unknown_fields) (default is to ignore unknown fields; duplicate keys not rejected); OWASP Mass Assignment / API8:2023; the JSON-object duplicate-key ambiguity is [RFC 8259 §4](https://www.rfc-editor.org/rfc/rfc8259#section-4) ("names within an object SHOULD be unique" — implementations differ, enabling parser-differential smuggling).

**Severity.** 🟡 — a validation/correctness hazard on untrusted request bodies; surface when the struct deserializes untrusted input in an auth/authorization/financial path.

**Suggested placement.** New REQUIRED/BANNED pair in **§B20**: "REQUIRED — put `#[serde(deny_unknown_fields)]` on any struct deserialized from an untrusted request where unexpected fields should be rejected (mass-assignment / smuggling defense); note it is incompatible with `flatten` (see the existing bullet). Be aware JSON duplicate keys are last-wins by default — a parser-differential smuggling vector against an upstream proxy." Trigger-table row: "validate request body", "reject unexpected fields", "PATCH/PUT body" → §B20.

---

## Gap 5 — `count * item_size` length-prefix overflow *before* the untrusted-length clamp fires (🟡)

**Why it's in-scope.** Length-prefixed binary protocol parsing frequently computes a byte budget as `count * size_of::<Item>()` (or `header.width * header.height * 4`) and clamps *that product* against a maximum before allocating. In release builds the multiply **wraps silently** (§B26), so a crafted `count` produces a tiny wrapped product that passes the clamp — then the subsequent read/loop/`with_capacity` uses the *original* huge `count`, causing OOM or a huge read. The bug is that the overflow fires *before* and *defeats* the very length check meant to stop §B7's allocation DoS.

**Why it's *marginally* distinct — reported with that caveat.** §B26 already bans bare `*` on untrusted integers and §B7 bans `with_capacity(untrusted_n)`. This is genuinely the intersection of the two, and the task brief explicitly asked to report it *only* if there is a distinct angle. The distinct angle: the defect is not the allocation and not the raw multiply in isolation — it is that **the overflow silently neutralizes a bounds check that looks correct**, so a reviewer who has internalized both §B26 and §B7 can still ship it (they see a clamp, they see `checked`-less multiply as "just arithmetic," and the two rules don't point at each other). If the maintainers judge that §B26's "counter/offset/size" framing plus §B7 already covers it, it is a **merge**, not a new item — hence 🟡 and flagged as the weakest survivor.

**Concrete compiles-but-dangerous shape:**
```rust
let count = read_u32(&mut input)? as usize;        // untrusted
let bytes = count * std::mem::size_of::<Record>(); // release: wraps to a small value
if bytes > MAX_BYTES { return Err(TooLarge); }     // passes on the wrapped small value
let mut v = Vec::with_capacity(count);             // uses the ORIGINAL huge count -> OOM
```

**Grounding source.** §B26 (release wrap semantics, `overflow-checks=false` default) is the mechanism; the *pattern* (overflow defeating a size check) is [CWE-190 → CWE-789](https://cwe.mitre.org/data/definitions/190.html) (Integer Overflow leading to Uncontrolled Memory Allocation) — the canonical chained-weakness. Real-world instances are legion in image/font/protocol parsers.

**Severity.** 🟡 — remote OOM DoS; escalate to 🔴 only on a network-facing parser. Report as a **one-line cross-reference bullet** joining §B26 and §B7, not a standalone category.

**Suggested placement.** A single cross-reference bullet added to **§B7**'s allocation section: "compute the byte budget with `checked_mul` — a wrapping `count * item_size` in release silently *passes* the size clamp, then the original `count` OOMs (CWE-190→789); the overflow defeats the very check meant to stop this." Mirror pointer from §B26.

---

## Verdict

I started with roughly nine candidates. **Five survived** scrutiny as genuine gaps: (1) decompression bombs — the strongest, a truly distinct shape with no clampable `n` and active false-safety from input caps — 🔴; (2) recursion inside a parser's AST / no-parse deserialize path bypassing serde_json's parse-phase-only depth limit, with `serde_yaml` having no limit at all — a real sub-clause of §B7; (3) the `flatten`/tagged-enum buffer-everything cliff — well-documented across five serde issues, orthogonal to §B20's existing `flatten`+`deny_unknown_fields` note; (4) missing `deny_unknown_fields` on untrusted request structs plus JSON duplicate-key last-wins — §B20 currently discusses the attribute only in the opposite (self-typo) direction. **One (5)** survived only *marginally* — the `count * item_size` overflow-before-clamp — and is reported explicitly as a merge-or-new judgment call for the maintainer, since §B26 and §B7 nearly cover it and the novelty is only that the overflow defeats the bounds check.

**Rejected as already-covered or out-of-scope:** hand-written recursive-descent depth bombs (squarely §B7); generic `Vec::with_capacity(untrusted_len)` OOM (explicitly §B7); ReDoS / catastrophic backtracking (§B16); HashDoS via crafted keys — including multipart-boundary hash-flooding, which is just HashDoS with a different key source (§B16). **quick-xml "billion laughs"** was investigated and *dropped*: quick-xml does not resolve DTD/external entities by default and treats unknown entities as errors unless the caller explicitly supplies a custom-entity map, so the classic exponential entity-expansion attack is not a documented default-behavior footgun for that crate (unlike `serde_yaml`'s anchor/alias recursion, which is real and is folded into Gap 2). I did not manufacture an XML entry on weak grounding.
