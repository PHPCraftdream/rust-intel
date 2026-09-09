# Spec consistency review — round 6, 2026-09-09

Base: `f5ff4b2`.

Scope: a bounded review of dependency overrides, procedural-macro consumer paths,
Cargo cfg/build-script/feature behavior, and the zero-dependency decision rule in
`deps-macros-ergonomics.md`. This is not a complete advisory refresh or behavioral
verification of every utility-catalog crate. No subagents were used.

## Prior-round disposition

The user's follow-up asked whether previous reviews had also been fixed. All
confirmed findings in rounds 1–5 of this series were already addressed and
committed: round 1 `19675ad`, round 2 `f52ea1b`, round 3 `1aa09d3`, round 4
`1dfd3f2`, round 5 `f5ff4b2`. Their closing reports and fixing commits were
cross-checked; there was no deferred fix from these five rounds to carry into
this one. This does not assert closure of every historical audit in the repo.

## Findings and fixes

### P2 — every patch was treated as a git source

§A1 required a full git `rev` for any `[patch]`, including valid local-path
overrides. The source review trigger was conflated with one source kind's pinning
mechanism.

A tiny package depended on an exact version replaced by a local
`[patch.crates-io]` path entry. It built offline and returned its asserted marker
without any git fields. Fixed the rule, core triggers and source ledger to review
the replacement source first. Git pin/approval requirements remain; local path
contents need provenance/reproducibility review and are not frozen by a lockfile.
[Cargo patch sources](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html#the-patch-section).

### P2 — the facade recipe confused macro import with generated-path resolution

§C6 said consumers of a facade needed both implementation and facade crates,
while presenting the facade as an alternative to resolving renamed dependencies.
A facade can re-export the derive, but its generated runtime path still needs
the consumer-visible name.

A local proc-macro/facade/consumer diagnostic invoked the re-exported derive with
only the facade as a direct dependency. Renaming it broke the generated hard-coded
root with E0433; an explicit crate-path override restored the expected result.
Fixed the direct/transitive dependency distinction and required ordinary,
renamed and offered facade-only consumer cases.
[Procedural macro hygiene](https://doc.rust-lang.org/reference/procedural-macros.html#procedural-macro-hygiene),
[Dependency renaming](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#renaming-dependencies-in-cargotoml).

### P2 — expected cfgs were limited to explicit declarations

§C7 required every feature to appear literally in `[features]` and every cfg to
be manually declared. It also implied every manifest feature needed a code gate.

With no `[features]` table and `unexpected_cfgs = "deny"`, a probe built with and
without the implicit feature of an optional dependency. The built-in `windows`
cfg also worked without a manual declaration. A misspelled `hleper` control failed
and named `helper` as an expected value; restoring it returned the build to green.

Fixed the rule to include implicit features, their `dep:` suppression, built-in
cfgs and custom declarations, without inventing gates for forwarding features.
[Optional features](https://doc.rust-lang.org/cargo/reference/features.html#optional-dependencies),
[Built-in cfg names](https://doc.rust-lang.org/rustc/check-cfg.html#well-known-names-and-values).

### P2 — build-script change detection omitted environment inputs

§C7 described reruns as occurring only for listed paths, and its recipe did not
cover dynamically read environment inputs affecting generated output.

An incremental build script read a controlled environment value through
`std::env::var`: after changing `alpha` to `beta`, its executable still printed
`alpha`. Adding `rerun-if-env-changed` made subsequent `beta` and `gamma`
invocations regenerate correctly, without a clean build or timing sleeps.

Fixed the recipe and trigger to distinguish file/directory tracking, external
environment inputs, automatically tracked `env!`/`option_env!` and build-script
recompilation. Cargo-provided build variables are not treated as ordinary external
`rerun-if-env-changed` inputs.
[Cargo change detection](https://doc.rust-lang.org/cargo/reference/build-scripts.html#change-detection).

### P2 — workspace membership was confused with build selection

§C10 described unification across the entire workspace and banned dev-only
activations themselves, rather than reliance on them for normal requirements.
The lockfile's broad graph is not the final compilation feature set.

A three-member workspace had A enable a shared feature in a dev dependency,
while B's normal dependency omitted it:

| Build of B | Shared feature |
| --- | --- |
| Resolver v1, isolated B | Disabled |
| Resolver v1, artifact from workspace release build | Enabled |
| Resolver v2, artifact from workspace release build | Disabled |

Fixed the rules and trigger to account for package selection and resolver/target
context. Legitimate dev-only additions are retained; a library must declare its
normal requirements and be checked outside the co-built workspace configuration.
[Cargo compilation feature selection](https://doc.rust-lang.org/cargo/reference/resolver.html#features).

### P2 — declining a dependency implied accepting a missing behavior

§C12 required custom implementations to document which catalog input they would
not handle. A zero-new-dependency constraint does not establish such a gap or
authorize dropping a requested behavior.

A std-only signed four-byte decoder handled the catalog's negative-value and
short-input concerns, with boundary controls checked against `i32::from_be_bytes`
and explicit length rejection. This is not an exhaustive parser audit or a reason
to reimplement std; it refutes the assumption that every custom implementation
must miss the named case. Fixed the rule to verify actual edge cases and seek an
explicit requirements decision for a real gap. This correction also follows
`skill-creator`'s preservation of user intent.
[Native signed byte conversion](https://doc.rust-lang.org/std/primitive.i32.html#method.from_be_bytes).

## Verification

- Diagnostics used rustc/Cargo 1.97.0, edition 2024, on
  `x86_64-pc-windows-msvc`. Cargo projects used local-only dependencies, offline
  execution and retained lockfiles for follow-up runs. Expected compile-fail
  controls were followed by successful corrected cases.
- `npm run validate` passed both phases: core checked 12 skill Markdown files;
  fixture validation reported 2 cases and **494 controls executed**. The run
  included all six corrections and this report apart from its final result entry.
  These tooling controls are not a measurement of semantic audit coverage.
- Skill validation, mirror agreement (13 files), and `git diff --check` passed.
- No repository implementation code, project/dependency version or release
  artifact was changed. No push was performed; pre-existing `.githooks/` was
  left untouched.

All six P2 findings are corrected and verified within the stated scope. No
confirmed finding from this round is deferred.
