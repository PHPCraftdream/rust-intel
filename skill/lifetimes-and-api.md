# Rust Intel — Lifetimes & Public API Surface

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §B1, §C1 (and §C1a), §A3. Tier labels (🔴/🟡/🟢; A–F) and all cross-references are preserved verbatim.
> **Tiers in this module:** §B1a/b 🟡 · §C1 🔴 (blanket impl in pub API of a published library; rest is 🟡) · §C1a 🟡 · §A3 🟡. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §B1. Lifetime laundering and lifetime leaking

Two distinct lifetime traps LLMs make with high frequency. They look similar from the outside (both involve `<'a>` in a signature where it shouldn't be) but the diagnostic and the fix are different. Treat them as separate sub-categories.

### §B1a. Lifetime laundering

**The trap**: one `'a` parameter binds both an input and a cached output, hiding a lifetime collapse from the local view. The signature compiles in isolation but the function becomes uncallable in practice.

**Why this happens**: the transformer's attention doesn't extend beyond the function body. Locally, `<'a>` looks elegant; the cross-function constraint is invisible.

**BANNED pattern (synthetic):**
```rust
fn lookup<'a>(s: &'a str, cache: &mut HashMap<String, &'a str>) -> &'a str { ... }
//                                                       ^^^ caller's `s` lifetime
//                                                       leaks into the cache type
```
Compiles in isolation; collapses to an empty lifetime when called twice with different inputs.

**BANNED pattern (realistic — typical LLM output for "add caching"):**
```rust
use std::collections::HashMap;

fn first_word<'a>(s: &'a str, cache: &mut HashMap<String, &'a str>) -> &'a str {
    if let Some(cached) = cache.get(s) {
        return cached;
    }
    let word = s.split_whitespace().next().unwrap_or("");
    cache.insert(s.to_string(), word);
    word
}
```
Compiles, passes unit tests with a single input. Fails the moment a second call site passes a `&str` with a different lifetime: the cache forces all entries to share one `'a`, which the borrow checker collapses to the empty intersection.

**Prompt triggers that produce this**: "add caching to this function", "memoize", "speed up by storing results", "build a lookup". Whenever the user mentions caching of returned references, this category activates.

**REQUIRED**:
- Separate input and output lifetimes (`<'input, 'cache>`) when they should be independent, OR store owned data (`HashMap<String, String>`).
- For any function returning `&T` derived from inputs, write a comment showing two consecutive calls with disjoint inputs before the signature is final.
- Higher-Ranked Trait Bounds (`for<'a> Fn(&'a T) -> &'a U`) deserve extra care: do not drop `for<'a>` when generalizing.

### §B1b. Lifetime leaking through public APIs

**The trap**: exposing `'a` in a *public* function signature when the lifetime is an implementation detail. The function compiles, the lifetime is genuine, and the signature is technically more "zero-copy" than the alternative — but every downstream caller is now forced to juggle that lifetime through their own code.

**Distinct from §B1a**: laundering is *one `'a` binding too many things inside one function*; leaking is *exposing an `'a` in a `pub` signature that should not have been part of the public API at all*. A function can suffer from leaking without any laundering, and vice versa.

**BANNED in published library APIs unless zero-copy is an explicitly documented design goal**:
```rust
// Forces every caller to track 'a through their own code:
pub fn parse<'a>(source: &'a str) -> Document<'a> { ... }
```

**REQUIRED**:
- Default to owned return types in public APIs: `pub fn parse(source: &str) -> Document { ... }` where `Document` owns its data.
- If zero-copy is a real design requirement, document it explicitly and consider exposing both variants (`parse` returning owned + `parse_borrowed` returning the lifetime-parameterized version) so callers opt in.
- Note any `pub fn` with a non-`'static` output lifetime inline (at write time) so the user can confirm the lifetime is intentional, not residual.

## §C1. Blanket impls in public APIs (semver hazard)

**The trap**: `impl<T: Display> Bar for T` in a published crate is a versioning landmine. Consumers may have `impl Bar for MyType` that becomes ambiguous when an upstream blanket impl is added or narrowed. The breakage surfaces months later on consumer CI, not the author's.

**REQUIRED in any `pub` API**:
- Blanket `impl<T: Bound>` only when the trait is **sealed** (private supertrait the crate controls):
  ```rust
  mod sealed { pub trait Sealed {} }
  pub trait MyTrait: sealed::Sealed { ... }
  ```
- Otherwise: write per-type impls or use a marker trait the crate exposes for opt-in.
- For any public trait being added, explicitly state in a comment whether it is sealed or open to external impl.
- Respect orphan rules: never `impl ForeignTrait for ForeignType`. Use the newtype pattern: `pub struct MyWrapper(pub Foreign);`.
- For **zero-cost** newtypes, prefer `#[repr(transparent)] pub struct MyWrapper(Foreign);` — this guarantees the same layout, size, and alignment as `Foreign`, so it can be transmuted to/from `Foreign` (with the usual `// SAFETY:` discipline) and crosses FFI boundaries identically. Without `#[repr(transparent)]`, the layout is `#[repr(Rust)]` (per §B5: stable attribute, unspecified layout) and you have *no* guarantee that the wrapper is a pure compile-time fiction — even for a single-field struct, the compiler is technically free to add padding or change alignment.

## §C1a. Missing `#[non_exhaustive]` on a published API's enums and structs

**The trap**: a public `enum` or `struct` in a *published* crate, declared without `#[non_exhaustive]`, freezes its shape into the semver contract. Adding a variant or a field later is a **major** breaking change: downstream `match` arms stop being exhaustive (a hard compile error in consumer crates) and downstream struct-literal construction breaks. The author's crate compiles fine; the break surfaces on consumer CI — exactly the §C1 delayed-blast pattern. LLMs reliably omit the attribute, most damagingly on **error enums**, which are the types downstream code matches on most. (This is the author-side rule; §B6 covers the *consumer* side — treating someone else's enum as if it were `#[non_exhaustive]`.)

**REQUIRED in a published library** (not bin / internal / workspace-private crates):
- Mark a public `enum` — especially an error or protocol/event enum — `#[non_exhaustive]` when future variants are plausible, which is the default assumption for those kinds.
- Mark a public `struct` `#[non_exhaustive]` when future fields are plausible. This forbids downstream struct-literal construction (`Foo { a, b }`), so **ship a constructor or builder** (`Foo::new(...)`) at the same time — otherwise the type is unconstructable by consumers.
- Accept the cost: downstream must write a wildcard arm (`_ => …`) and `..` in patterns. That cost *is* the feature — it buys the right to grow the type without a major version bump.

**Calibration — do not slap it on everything**:
- Only the **public** surface of a **published** crate. In a binary, an internal module, or a workspace-private crate there is no external consumer, so the attribute is pure friction — skip it.
- Not for genuinely closed types whose shape is complete by definition (`enum Direction { North, South, East, West }`, a fixed `struct Rgb { r, g, b }`). Forcing a `_ =>` arm on a type that will never grow only hides real non-exhaustiveness bugs.
- It is **not** retroactive insurance: adding `#[non_exhaustive]` to an *already-published* exhaustive type is itself a breaking change. Decide at first publication, flag the decision inline (at write time).

This is the §C1/§A3 semver discipline applied to a type's *data shape* rather than its impls or visibility: every detail of a `pub` type's shape is a commitment unless you opt out of it up front.

## §A3. `pub` as a hammer for `E0603`

**The trap**: `rustc` emits `E0603` ("module/item is private"). The cheapest fix is to add `pub`. The fix **compiles** — and silently enlarges the crate's public API surface, making every item now-`pub` a semver commitment. For library crates this is load-bearing: removing or renaming the item is now a breaking change. For binary crates it leaks internal abstractions out of their module, encouraging unrelated code to depend on them.

**REQUIRED**:
- When `E0603` fires, the first question is *where the call site lives*, not *how to make the symbol visible*. If the caller is inside the same crate, the answer is almost always `pub(crate)`. If the caller is in a parent module, `pub(super)`. `pub` (the unrestricted form) is only the right fix when the symbol is genuinely part of the crate's public API.
- New types default to private. Promote to `pub(crate)` only when needed across modules; promote to `pub` only when intended as part of the public API.
- Never re-export types via `pub use` from a public module without confirming they should be part of the public surface.
- For library crates: every `pub` item is a semver commitment. Treat `pub fn` as load-bearing. Flag a newly-`pub` item inline (at write time) so the user can confirm the visibility decision.

**BANNED**:
- Reaching for `pub` to silence `E0603` without considering `pub(crate)` / `pub(super)` / `pub(in path)` first.
- Adding `pub` to a struct field to silence an access error inside the same crate.

---
