# Spec consistency review — round 4, 2026-09-09

Base: `1aa09d3`.

Scope: a bounded review of public-API evolution, test placement/profile coverage,
and Serde contracts/buffering, including their core summaries and source ledger.
This is not an exhaustive pass over every module, version pin or advisory. No
subagents, load benchmarks or dependency/version changes were used. Earlier-round
findings are not counted again.

## Findings and fixes

### P2 — non-exhaustive tuple variants still expose positional fields

§C1a claimed that adding a positional element to a non-exhaustive tuple variant
could not break consumers. The attribute blocks construction and tuple-style
patterns, but external braced patterns can still bind numeric fields:

```rust
match event {
    upstream::Event::Tuple { 0: value, .. } => value,
    _ => panic!("unexpected test variant"),
}
```

A two-crate rustc 1.97.0 diagnostic rebuilt the same consumer against three
upstream definitions. Its field-0 result was 7 originally, 99 after inserting a
same-typed field before the old field, and 7 after appending instead. Inserting a
boolean before the old `u32` produced the expected E0308 in a typed consumer.
Thus a change can either break compilation or silently change meaning.

Fixed §C1a and both relevant core rows to preserve exposed indices, types and
meaning even with the attribute. Appending avoids index shifts, not every
auto-trait, behavioral or layout compatibility hazard.
[Non-exhaustive pattern rules](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute).

### P2 — support crates were presented as an internals-access mechanism

§D2 offered a dev-only support crate alongside actual private-test-access options
and claimed unit tests could see `pub(crate)` and below without module limits.
Neither sharing a workspace nor being a dev dependency grants another crate's
private access. Within a crate, private-item access still follows module ancestry.

A separate support crate calling an upstream `pub(crate)` function failed with
the expected E0603; the public-entry-point control compiled. Fixed the guidance
to put private tests under the defining module, distinguish shared helpers from
visibility grants, and retain an explicit compatibility policy for public
feature-gated support APIs. Such a feature is not automatically semver-exempt.
[Privacy rules](https://doc.rust-lang.org/reference/visibility-and-privacy.html),
[Cargo feature compatibility](https://doc.rust-lang.org/cargo/reference/semver.html#cargo).

### P2 — release-profile tests did not cover the shipped panic strategy

§D3's configuration-overlap recipe stopped at `cargo test --release`. Ordinary
Cargo test harnesses use unwinding even when the release profile requests abort.
Consequently a passing panic-recovery or panic-cleanup test is not evidence for
the aborting executable's behavior.

With `[profile.release] panic = "abort"`, the diagnostic's release test asserted
and printed `unwind`; its ordinary release executable printed `abort`, both from
the same library function inspecting `cfg!(panic = ...)`.

Added a separate deployment-strategy check in §D3 and the post-flight summary,
with an isolated artifact-level behavioral test when the panic contract matters.
The local diagnostic verified strategy selection only; it did not deliberately
abort a process or establish crash-cleanup behavior.
[Cargo panic profile contract](https://doc.rust-lang.org/cargo/reference/profiles.html#panic).

### P2 — Serde requirements overrode valid directional and priority contracts

§B20 required round-trips for every (de)serialization and disjointness for every
untagged enum. That excludes deliberate input-only/output-only types and Serde's
documented ordered fallback. Adding an inverse trait or changing the wire format
to satisfy those mandates can expand the interface or change the protocol.

On serde 1.0.228 / serde_json 1.0.151, a Deserialize-only DTO with a renamed field
decoded its independent input vector. Trying to serialize it produced the
expected E0277. A Deserialize-only untagged enum with `Text(String)` before
`Any(Value)` deliberately chose the text variant for a string and the general
variant for a boolean.

Scoped tests to supported directions. Compatible pairs still need round-trip
properties over their valid domain and equality/normalization relation. Overlap
needs an asserted priority unless unique variant identity is the contract; adding
a discriminator to an existing wire format requires a compatibility decision.
Aligned the three-state serialization control with the same directionality rule.
The rename-vector clarification uses the existing §F1 independent-oracle rule;
it is not counted as a separate discovery.
[Serialize](https://docs.rs/serde/1.0.228/serde/trait.Serialize.html),
[Deserialize](https://docs.rs/serde/1.0.228/serde/trait.Deserialize.html),
[Untagged dispatch order](https://serde.rs/enum-representations.html#untagged).

### P2 — buffering and slowdown were generalized to the entire input

§B20 and its source ledger claimed that flattening and internally/adjacently
tagged enums always materialized the whole request, with a broadly stated
slowdown. Pinned derive source distinguishes the paths: known non-flattened
fields deserialize directly, remaining flatten entries are collected, and an
adjacent-tag payload is buffered when it precedes the tag.

The serde 1.0.228 / serde_json 1.0.151 diagnostic asserted these outcomes:

| Deserialization path | Outcome for `u128` value 7 |
| --- | --- |
| Known field alongside a flattened extra-fields map | Accepted |
| Field inside a flattened struct | Rejected: `u128 is not supported` |
| Adjacent tag before payload | Accepted |
| Same adjacent payload before tag | Rejected: `u128 is not supported` |

The format-support difference demonstrates which paths pass through the limited
internal representation; it is not an allocation benchmark. Fixed the module,
core trigger and source ledger to describe path-dependent buffering, preserve
input bounds and measurement requirements, and remove the universal multiplier.
[Struct visitor](https://raw.githubusercontent.com/serde-rs/serde/v1.0.228/serde_derive/src/de/struct_.rs),
[Adjacent-tag visitor](https://raw.githubusercontent.com/serde-rs/serde/v1.0.228/serde_derive/src/de/enum_adjacently.rs).

## Verification

- Standalone diagnostics used rustc 1.97.0 and edition 2024. Final Cargo checks
  used `cargo run --offline --locked --release` and
  `cargo test --offline --locked --release -- --nocapture` with the Serde pins
  above. Both passed; the three compile-fail controls were expected rejections,
  not unresolved test failures.
- Repository core validation passed: 12 skill Markdown files checked.
- Skill validation, canonical/mirror agreement (13 files), and
  `git diff --check` passed.
- The full 494-control tooling fixture suite was not rerun for these prose
  corrections; previous runs are not claimed as fresh evidence for this change.
- No unrelated cleanup, push, release or version bump was performed.

All five findings are addressed within the stated scope. The `skill-creator`
review discipline influenced the corrections by keeping requirements tied to
the supported contract rather than adding universal constraints.
