# Roadmap

What's planned beyond v0.3. Ordered by value-per-cost.

## 1. Commands (tooling on top of the spec) — ✅ initial set shipped in v0.1

Goal: turn the passive skill into active tools that **find and fix** mistakes themselves, so a developer doesn't need to memorize every category.

### `/rust-cc-audit [path]` — ✅ shipped

**Use case:** "Check my code."

**Input:** path to a file, directory, or crate (defaults to the current working directory).

**Behavior:**
1. Read `Cargo.toml` to pin versions.
2. Scan Rust sources against every category in the spec.
3. For each finding: category (`§B2`), file:line, code citation, why it's dangerous, concrete fix (not generic advice).
4. Group by tier (A/B/C) and severity.
5. End with a summary in the Post-flight checklist format from the spec.

**Why first:** maximum value, minimum friction. Existing code in → triaged report out. Activates every category in one pass.

See [`../commands/rust-intel-cc/audit.md`](../commands/rust-intel-cc/audit.md).

### `/rust-cc-fix <error-message>` — ✅ shipped

**Use case:** "I have an error / panic / weird behavior."

**Input:** `rustc` / `cargo clippy` output, panic stack trace, or runtime-anomaly description.

**Behavior:**
1. Parse the message → map to a spec category (`deadlock → §B9`, `OOM in graph → §B10`, `panic 'cannot recursively acquire mutex' → §B9`). Pure compile errors like `E0277` route to `out-of-scope (compile-only)`; the tool still checks whether the *reflexive fix* the user is about to apply creates §A2/§A3/§C5 residue.
2. Explain the **root cause**, not the symptom.
3. Propose a fix that **doesn't violate other categories** (especially: not the reflexive `.clone()` from §C5).
4. State the preventive rule from the spec so the same mistake doesn't recur.

**Value:** removes the developer's need to navigate rustc docs and stale StackOverflow answers.

See [`../commands/rust-intel-cc/fix.md`](../commands/rust-intel-cc/fix.md).

### `/rust-cc-plan <task>` — ✅ shipped

**Use case:** "I want to write X."

**Input:** task description in natural language.

**Behavior:**
1. Run the description through the spec's trigger table → identify activated categories.
2. Ask clarifying Pre-flight questions (crate versions, cancel-safety, async/sync context, lifetimes).
3. Output an implementation plan with explicit risk points and preconditions.
4. **Does not write code** — plan only. Code happens in a separate step with full context loaded.

**Value:** catches mistakes at the design stage, when rolling them back is still cheap.

See [`../commands/rust-intel-cc/plan.md`](../commands/rust-intel-cc/plan.md).

## 2. Category expansions

Categories with observed patterns but insufficient empirical backing or sharp BANNED/REQUIRED wording. They move into the main spec as data accumulates.

- **§B16 (draft) `serde` (de)serialization edge cases.** ✅ shipped in v0.3.0 — field-presence vs null and `#[serde(untagged)]` overlap now live in the main spec.
- **§B17 (draft) FFI and `Drop` across the ABI boundary.** ✅ shipped in v0.3.0 as §B25 ("Panic and ownership across `extern \"C\"` ABI"): panic-across-boundary, `catch_unwind` discipline, `Box::into_raw`/`Box::from_raw` allocator pairing, `Vec::into_raw_parts`/`Vec::from_raw_parts` `cap` matching, paired `rust_drop_T` free functions, `#[repr(C)]` layout verification. The async-`Drop` side is also covered by the new §B22.
- **§B18 (draft) `#[no_std]` and `alloc`.** Remains in roadmap as low-priority. Under the v0.3 scope reframe this category does not qualify — its primary failure mode is a compile error (`std::*` paths missing in `no_std`), which the compiler catches. Kept here for visibility, not for promotion.
- **§C8 (draft) Workspace-level dependencies and feature unification.** ✅ shipped in v0.3.0 — now part of the main spec under workspace feature unification.
- **§C9 (draft) `tracing` instrumentation patterns.** ✅ shipped in v0.3.0 — span leakage across `.await` and context loss in `tokio::spawn` now live in the main spec.

> Categories whose primary failure mode is a compile error (lifetime variance, GATs lifetime bounds, object safety from generic methods, cyclic workspace deps, `?`-in-`main`) are out of scope by design — the compiler is sufficient. They will not be added even with good wording.

## 3. Meta-layer refinements

- **Trigger table:** cover ~5 more prompt patterns observed in real user requests.
- **Calibrated uncertainty:** add a self-assessment scale for cases where LLMs are prone to overconfidence (§B3 already flagged as one such case).
- **Repro snippets:** for each BANNED formulation, attach a minimal compilable example (needed as the test corpus for §1 tooling).

## 4. Infrastructure

- Public repository — ✅ shipped in v0.1+.
- CI: markdown linting, broken-internal-link checks.
- Test corpus: `examples/` with deliberately broken Rust per category, to run through `/rust-cc-audit` as a regression suite.

## Open questions

- Should `rust-intel.md` be split into per-tier files, or is the current density still net-positive?
- Do human-readable artifacts (README, CHANGELOG, roadmap) need a Russian translation, or is English enough alongside the English spec?
- What's the right versioning granularity: each new category = minor, or batch them?
