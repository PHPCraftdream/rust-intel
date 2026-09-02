# Rust Intel — Lifetimes & Public API Surface

> Module of the **rust-intel** skill. Core — operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category→module map — lives in `SKILL.md`. This module holds the category bodies for §B1, §C1 (and §C1a), §A3. Tier labels (🔴/🟡/🟢; A–F) and all cross-references are preserved verbatim.
> **Tiers in this module:** §B1a/b 🟡 · §C1 🔴 (blanket impl in pub API of a published library; rest is 🟡) · §C1a 🟡 · §A3 🟡. Derived from SKILL.md → Enforcement tiers (canonical).
> **Audit semantics:** 🔴 = report every occurrence; 🟡 = write-time discipline — report only load-bearing/non-obvious cases; 🟢 = clippy's, don't hand-report. Audit the *artifact* (a BANNED pattern present, a REQUIRED code artifact absent); process-REQUIREMENTs ("propose first", "ask the user") are not auditable findings.

---

## §B1. Lifetime laundering and lifetime leaking

Two distinct lifetime traps LLMs make with high frequency. They look similar from the outside (both involve `<'a>` in a signature where it shouldn't be) but the diagnostic and the fix are different. Treat them as separate sub-categories.

### §B1a. Lifetime laundering

**The trap**: one `'a` parameter binds both an input and a cached output, hiding a cross-call constraint from the local view. The signature compiles in isolation, but the cache's element type captures the caller's input lifetime — every source ever inserted into the cache must outlive it.

**Why this happens**: the transformer's attention doesn't extend beyond the function body. Locally, `<'a>` looks elegant; the cross-function constraint is invisible.

**BANNED pattern (synthetic):**
```rust
fn lookup<'a>(s: &'a str, cache: &mut HashMap<String, &'a str>) -> &'a str { ... }
//                                                       ^^^ caller's `s` lifetime
//                                                       leaks into the cache type
```
Compiles in isolation. Note what does *not* break it: calling it twice with different inputs is fine — the borrow checker does not force an empty lifetime intersection; it shortens both borrows to one shared overlapping region while every source is still alive. The real failure (below) needs a shorter-lived source inserted while the cache remains usable after that source is dropped.

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
Compiles, passes unit tests with a single input, and even survives two same-scope calls with different inputs — the compiler simply picks one region common to all sources that are still alive. It fails the moment a *shorter-lived* source is inserted while the cache is used after that source's scope ends: all entries share the cache's single `'a`, so the borrow of the inner source must outlive that scope:

```rust
let mut cache: HashMap<String, &str> = HashMap::new();
{
    let short_lived = String::from("temporary input");
    first_word(&short_lived, &mut cache); // a borrow of `short_lived` enters the cache
}
// error[E0597]: `short_lived` does not live long enough — the cache's element type
// still holds `&'a str` values borrowed from it, and the cache is used again below,
// so `'a` must reach past `short_lived`'s scope.
let long_lived = String::from("another input");
let w = first_word(&long_lived, &mut cache);
```

A genuine borrow-checker rejection (`compile_fail` shape), not an "empty intersection" hand-wave: a cache of references cannot outlive any source it has borrowed from.

**Prompt triggers that produce this**: "add caching to this function", "memoize", "speed up by storing results", "build a lookup". Whenever the user mentions caching of returned references, this category activates.

**REQUIRED**:
- Make the cache **own** the stored value (`HashMap<String, String>`), or borrow from a storage/arena lifetime proven to outlive the cache (`HashMap<String, &'arena str>`, where `'arena` is the arena's lifetime, not any single call's input).
- Splitting the parameter into `<'input, 'cache>` is **not** a fix by itself: if the cached value genuinely borrows from the current call's input, the compiler demands `'input: 'cache` on the cache type, which is the exact coupling the split claimed to remove. Separate input/output lifetimes are only a valid fix when the returned/cached value does **not** borrow from the call's input.
- Only for the laundering shape — one `'a` binding a call's input *and* a cache/output that outlives it — write a comment showing a call that inserts a short-lived source and then uses the cache after that source's scope ends (the `E0597` shape above). Two same-scope calls with disjoint inputs do **not** expose this collapse, and a plain function returning a reference derived from a single input needs no such witness.
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

**The trap**: `impl<T: Display> Bar for T` in a published crate is a versioning landmine. Consumers may have `impl Bar for MyType` that breaks when an upstream blanket impl is later added (a coherence conflict — `E0119`, two impls now overlap) or narrowed (a downstream type that relied on the wider impl now fails an unsatisfied-bound error instead). The breakage surfaces months later on consumer CI, not the author's.

**REQUIRED in any `pub` API**:
- Blanket `impl<T: Bound>` only when the trait is **sealed** (private supertrait the crate controls):
  ```rust
  mod sealed { pub trait Sealed {} }
  pub trait MyTrait: sealed::Sealed { ... }
  ```
- Otherwise: write per-type impls or use a marker trait the crate exposes for opt-in.
- For any public trait being added, explicitly state in a comment whether it is sealed or open to external impl.
- Respect orphan rules: never `impl ForeignTrait for ForeignType`. Use the newtype pattern: `pub struct MyWrapper(pub Foreign);`.
- For **zero-cost** newtypes, prefer `#[repr(transparent)] pub struct MyWrapper(Foreign);` — this guarantees the same layout, size, and alignment as `Foreign`, so it is ABI-compatible for the documented FFI/use cases. It does **not** by itself make `transmute` sound: the §B5 value-validity, ownership, provenance, and lifetime proofs still apply. Without `#[repr(transparent)]`, the layout is `#[repr(Rust)]` (stable attribute, unspecified layout) and you have no guarantee that the wrapper is a pure compile-time fiction.

## §C1a. Missing `#[non_exhaustive]` on a published API's enums and structs

**The trap**: a public `enum` or `struct` in a *published* crate, declared without `#[non_exhaustive]`, freezes its shape into the semver contract. Adding a variant or a field later is a **major** breaking change: downstream `match` arms stop being exhaustive (a hard compile error in consumer crates) and downstream struct-literal construction breaks. The author's crate compiles fine; the break surfaces on consumer CI — exactly the §C1 delayed-blast pattern. LLMs reliably omit the attribute, most damagingly on **error enums**, which are the types downstream code matches on most. (This is the author-side rule; §B6 covers the *consumer* side — treating someone else's enum as if it were `#[non_exhaustive]`.)

**REQUIRED in a published library** (not bin / internal / workspace-private crates):
- Mark a public `enum` — especially an error or protocol/event enum — `#[non_exhaustive]` when future variants are plausible, which is the default assumption for those kinds.
- Mark a public `struct` `#[non_exhaustive]` when future fields are plausible. This forbids downstream struct-literal construction (`Foo { a, b }`), so **ship a constructor or builder** (`Foo::new(...)`) at the same time — otherwise the type is unconstructable by consumers.
- Enum-level `#[non_exhaustive]` only buys the right to add new **variants** — it does nothing for new **fields inside an existing variant's payload**. Mark a struct-like variant whose fields might grow `#[non_exhaustive]` on the variant itself (`enum Event { #[non_exhaustive] Connected { id: u32 }, ... }`) or wrap its payload in a dedicated `#[non_exhaustive] struct` — without one of these, adding a `Connected` field later is a major break for every downstream arm that destructures the variant (`Event::Connected { id } => …`), even though the enum itself is `#[non_exhaustive]` (per the Cargo Book SemVer reference, "Major: adding new fields to an enum variant" — doc.rust-lang.org/cargo/reference/semver.html#enum-fields-new, whose two stated mitigations are exactly these). Note the variant-level attribute also forbids downstream construction of that variant (a struct-literal for a struct-like variant, a tuple pattern/tuple-constructor call for a tuple-like one) and forces a wildcard in any match on it, mirroring the struct rule above. Variant-level `#[non_exhaustive]` protects **tuple-like** variants the same way it protects struct-like ones — external code can neither construct nor exhaustively match a `#[non_exhaustive]` tuple variant, so adding a new positional element later does not break it, exactly as adding a field to a `#[non_exhaustive]` struct-like variant does not. A named/struct-like payload (over bare positional fields) is still often the better *ergonomic* choice for a variant expected to grow — new fields can be named and are self-documenting at the call/match site — but that is a readability argument, not a semver-protection one: the attribute itself does not require it.
- Accept the cost: downstream must write a wildcard arm (`_ => …`) and `..` in patterns. That cost *is* the feature — it buys the right to grow the type without a major version bump.

**Calibration — do not slap it on everything**:
- Only the **public** surface of a **published** crate. In a binary, an internal module, or a workspace-private crate there is no external consumer, so the attribute is pure friction — skip it.
- Not for genuinely closed types whose shape is complete by definition (`enum Direction { North, South, East, West }`, a fixed `struct Rgb { r, g, b }`). Forcing a `_ =>` arm on a type that will never grow only hides real non-exhaustiveness bugs.
- Not for a **named-field** struct that already has **at least one private field**: per Cargo's own SemVer guide, adding or removing another private field to such a struct is a semver-compatible change, and downstream code already cannot construct it with a struct literal or match it exhaustively (it cannot name the private field). The attribute earns its keep on a struct whose fields are **all currently public**, where adding a field would otherwise break downstream construction and exhaustive patterns. This exception does **not** carry over to **tuple structs**: `pub struct Foo(pub i32, i32)` already has a private field at index 1, but *inserting* a new field before the existing public index 0 shifts every downstream positional access (`foo.0` now means something else) — a breaking change despite already having a private field. For a tuple struct the safe operation is only *appending* a new private field at the end, never inserting before an existing index.
- It is **not** retroactive insurance: adding `#[non_exhaustive]` to an *already-published* exhaustive type is itself a breaking change. Decide at first publication, flag the decision inline (at write time).

This is the §C1/§A3 semver discipline applied to a type's *data shape* rather than its impls or visibility: every detail of a `pub` type's shape is a commitment unless you opt out of it up front.

## §A3. `pub` as a hammer for `E0603`

**The trap**: `rustc` emits `E0603` ("module/item is private"). The cheapest fix is to add `pub`. The fix **compiles** — and silently enlarges the crate's public API surface, making every now-`pub` item that is externally reachable a semver commitment. For library crates this is load-bearing: removing or renaming the item is now a breaking change. For binary crates it leaks internal abstractions out of their module, encouraging unrelated code to depend on them.

**REQUIRED**:
- When `E0603` fires, the first question is *where the call site lives*, not *how to make the symbol visible*. If the caller is inside the same crate, the answer is almost always `pub(crate)`. If the caller is in a parent module, `pub(super)`. `pub` (the unrestricted form) is only the right fix when the symbol is genuinely part of the crate's public API.
- New types default to private. Promote to `pub(crate)` only when needed across modules; promote to `pub` only when intended as part of the public API.
- Never re-export types via `pub use` from a public module without confirming they should be part of the public surface.
- For library crates: every `pub` item that is **externally reachable** — reachable from the crate root through an unbroken chain of `pub` modules and `pub use` re-exports — is a semver commitment; treat such a `pub fn` as load-bearing. A `pub` item behind a private module ancestor, with no `pub use` path from the crate root, is *not* actually part of the public API whatever the keyword says. Enable rustc's `unreachable_pub` lint (allow-by-default; it fires exactly on "`pub` items not reachable from other crates") so "syntactically `pub` but not actually reachable" surfaces as a deliberate-intent-vs-accident signal instead of an invisible default. Flag a newly-`pub` item inline (at write time) so the user can confirm the visibility decision.

**BANNED**:
- Reaching for `pub` to silence `E0603` without considering `pub(crate)` / `pub(super)` / `pub(in path)` first.
- Adding `pub` to a struct field to silence an access error inside the same crate.

---
