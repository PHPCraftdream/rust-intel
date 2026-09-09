# Spec consistency review — round 2, 2026-09-09

Base: `19675ad`.

Scope: a bounded consistency pass over data/type, numeric and iterator rules,
with checks against the core trigger summaries, source ledger and the related
boundary/conformance rules. Findings from the preceding round were not counted
again. This is not an exhaustive re-audit of all categories or dependency pins.

## Findings and fixes

### P2 — the one-shot exception accidentally included fixed-seed hashers

§B16 first correctly excluded unkeyed and fixed/predictable-seed fast hashers
from untrusted keys. Its final sentence then appeared to allow that entire set
for a non-interactive one-shot program. An attacker does not need runtime
feedback to prepare inputs for a known hash configuration.

Fixed the final scope: the narrow one-shot discussion applies only to foldhash's
default-random state and is not a general DoS-resistance guarantee. Fixed and
unkeyed fast hashers retain the trusted-key restriction. The source ledger was
aligned with that distinction.

Evidence: an internal rule contradiction plus foldhash's explicit warning that
`FixedState` is trivially vulnerable to HashDoS. No flooding workload was run.
[foldhash documentation](https://docs.rs/foldhash/latest/foldhash/).

### P2 — subtraction and debug-assertion guidance promised the wrong release behavior

The `saturating_sub` remedy recommended plain subtraction to panic on an invalid
cursor, although unsigned subtraction wraps with overflow checks disabled.
The debug-assertion bullet also described `debug_assertions` as the same setting
as overflow checks. Enabling one does not enable the other.

Fixed both statements: invalid external state is handled through `checked_sub`
and an error; an always-on assertion is for a programmer invariant. Deliberate
saturation remains valid when clamping is the documented contract. Debug
assertions and overflow checks are now described separately.

Bounded rustc 1.97.0 / edition-2024 probes used explicit compiler settings:

| Optimization / flags | `3_usize - 4_usize` at runtime | Failing `debug_assert!` |
| --- | --- | --- |
| `opt-level=0`, both checks enabled | Panic | Panic |
| `opt-level=3`, both checks disabled | `usize::MAX` | Inactive |
| `opt-level=3`, overflow checks enabled, debug assertions disabled | Panic | Inactive |

`checked_sub` returned `None` in every configuration. The arithmetic operands
went through `black_box` so this exercised runtime behavior, not the compiler's
constant-overflow rejection. This was a correctness probe, not a benchmark.
[Cargo profile settings](https://doc.rust-lang.org/cargo/reference/profiles.html).

### P2 — equal-length validation prescribed a panic for external input

§B29 required an up-front assertion for equal-length sequences and suggested
`zip_eq`. Both are panic-based; neither provides typed rejection of mismatched
external input. The same boundary distinction was missing from §B26's advice
to replace production security checks with assertions.

Fixed the advice to separate input validation from programmer preconditions.
External mismatches return an error; assertions remain available for invariants.
The existing warning about short-circuited `zip_eq` is preserved: its lazy check
does not establish equality independently of how the iterator is consumed.

Evidence: the mismatched-length assertion panicked in all three configurations;
the explicit validation returned an error. `zip_eq`'s lazy panic behavior is
documented by its own API, not inferred from that assertion probe.
[Iterator::zip](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.zip),
[Itertools::zip_eq](https://docs.rs/itertools/latest/itertools/trait.Itertools.html#method.zip_eq).

### P3 — valid key equivalence policies were treated as contract violations

§B16 categorically rejected raw float-bit keys and required a new manual hash
whenever equality was customized. The actual law is one-way: equal keys must
hash equally; unequal keys may collide. A documented bit-identity key is not
the same contract as numeric float equality.

Fixed the calibration for signed zero, NaN payloads and metadata fields excluded
from identity. Existing hashes are checked against the chosen equality relation.
The guidance retains project lint policy: Clippy conservatively denies manual
equality with a derived hash, so a semantic proof does not silently bypass that
lint.

Evidence: probes stored/retrieved both signed zeros and two distinct NaN bit
patterns as integer keys. A separate immutable-`Arc` identity wrapper used manual
equality with a derived content hash: unequal identities had the same hash and
remained distinct map entries; aliases compared equal and retrieved the same
entry. This establishes semantic consistency, not a green Clippy run.
[Hash/Eq contract](https://doc.rust-lang.org/std/hash/trait.Hash.html#hash-and-eq),
[Clippy lint](https://rust-lang.github.io/rust-clippy/master/index.html#derived_hash_with_manual_eq).

## Verification and limits

- All diagnostic assertions passed in the three stated compiler configurations.
- Repository core validator passed: 12 skill Markdown files checked.
- Skill validator, canonical/mirror agreement and `git diff --check` passed.
- No repository Rust implementation, dependency version or validation script
  changed; the diagnostics were standalone temporary programs.
- The full 494-control suite was not rerun for these prose corrections. Its
  earlier successful run is not presented as a new run on this change.
- The round-trip/field-name concern was not counted as a new finding: §F1/§F4
  already distinguish self-consistency from external format conformance.

All four findings are addressed in `data-and-types.md` and the source ledger.
The disposition applies to this review's stated scope.
