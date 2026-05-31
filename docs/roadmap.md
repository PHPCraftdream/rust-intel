# Roadmap

What's planned beyond v0.4. Ordered by value-per-cost.

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

## 2. Shipped expansions (archive)

Categories that were drafted here with observed patterns and have since moved into the main spec. Kept as an archive of how the taxonomy grew, not as an active backlog. (The one draft that was *rejected* rather than shipped is recorded under [Rejected — out of scope by design](#rejected--out-of-scope-by-design).)

- **§B16 (draft) `serde` (de)serialization edge cases.** ✅ shipped in v0.3.0 — field-presence vs null and `#[serde(untagged)]` overlap now live in the main spec.
- **§B17 (draft) FFI and `Drop` across the ABI boundary.** ✅ shipped in v0.3.0 as §B25 ("Panic and ownership across `extern \"C\"` ABI"): panic-across-boundary, `catch_unwind` discipline, `Box::into_raw`/`Box::from_raw` allocator pairing, `Vec::into_raw_parts`/`Vec::from_raw_parts` `cap` matching, paired `rust_drop_T` free functions, `#[repr(C)]` layout verification. The async-`Drop` side is also covered by the new §B22.
- **§C8 (draft) Workspace-level dependencies and feature unification.** ✅ shipped in v0.3.0 — now part of the main spec under workspace feature unification.
- **§C9 (draft) `tracing` instrumentation patterns.** ✅ shipped in v0.3.0 — span leakage across `.await` and context loss in `tokio::spawn` now live in the main spec.

**Tier D — Testing and CI gaps.** ✅ shipped in v0.3.0 as a new tier (§D1 tests that pass by luck, §D2 integration vs unit placement drift). Originally not in the roadmap; promoted directly because the empirical pattern was clear (LLM-generated tests routinely rely on `thread::sleep` and bare `#[should_panic]`).

### Shipped in v0.4.0

The bullet-level items below were observed during the v0.3.x review passes and batched for v0.4.0. All are now shipped — most as bullets under existing categories, the rest folded into three new Tier B categories. All sit under the current scope (compile-clean, test-green, broken anyway).

- **`std::env::var` non-UTF8 / missing panics** → §C2 ✅. `var("X").unwrap()` panics on non-UTF8 (common on Windows) or missing vars at startup; `var_os` avoids the UTF-8 requirement.
- **`Box::leak` for globals** → §A2 ✅. Intentional leak that grows on every re-init path; `OnceLock`/`LazyLock` (stable ≥ 1.80) is the right tool.
- **`mem::forget` disabling RAII** → §B4 ✅. Same class as the reflexive `.clone()` of §C5, but for `Drop`.
- **`serde_json` numeric fidelity** → §B20 ✅. `Value::as_f64` / deserializing large integers into `f64` silently loses precision above 2^53 (snowflake IDs, nanosecond timestamps).
- **`tokio::sync::watch::Receiver` semantics** → §B15 ✅. `borrow()` returns the initial value before any send; needs `borrow_and_update` to avoid re-looping `changed()`.
- **`FuturesUnordered` without a cap** → §B14 ✅. Unbounded `.push()` is the same growth hazard as an unbounded channel; an empty set in `select!` busy-loops.
- **`{:?}` on `&[u8]`/`Vec<u8>` prints decimal** → §C4 ✅. Non-secret bytes (hashes, checksums, wire frames) come out as `[222, 173, ...]`, not hex; use `hex::encode`.
- **`Cell` vs `RefCell` for `Copy` interiors** → §A2 ✅. `Cell<T>` avoids the runtime borrow-flag and §B17 panic surface for `Copy`/replace-whole cases.

Three further gaps surfaced during the pass were large enough to ship as **new Tier B categories** (they were not in the original backlog): **§B26 Lossy numeric conversions** (`as`-cast truncation, float→int saturating), **§B27 Wall-clock vs monotonic time** (`SystemTime` for durations, `.elapsed().unwrap()`), and **§B28 UTF-8 and string-boundary hazards** (byte-indexing panics on a non-char-boundary, `len()`-as-char-count) ✅. Category count 41 → 44.

**Structural (form, not content).** Splitting the overloaded §B15 (AFIT/RPITIT vs Pin/Waker) into §B15a–e is ✅ shipped (sixth pass) — the spec now carries §B15a (AFIT), §B15b (Pin/Waker), §B15c (sync↔async bridging), §B15d (`Stream` vs `Iterator`), and §B15e (tokio sync/timing), with references to bare `§B15` covering all five. **Still open:** deduping repeated trigger-table rows and rebalancing section length toward high-frequency categories (§C4/§C5) and away from low-frequency depth (§B5/§B25 are large relative to how often unsafe/FFI actually appears). Order: land the link-checker and `examples/` corpus ([§4](#4-infrastructure--highest-value-next)) first so the remaining dedup/rebalance is verifiable.

With the bullet-level backlog now drained and three new categories shipped, the post-compilation *correctness* content taxonomy is close to saturation. A corrective eighth review pass has since landed accuracy fixes and clarifications under `[Unreleased]` without touching the category count. The taxonomy has since been extended along a new, orthogonal axis: a top-level **Tier E — Systemic cost (§E1–§E6)** ✅ shipped, covering performance/scale cost (latency, allocation, complexity, contention) that survives `rustc`/`clippy`/tests — enforced 🟡/🟢, never 🔴 (category count 44 → 50). The next center of gravity remains infrastructure rather than new correctness rules — the `examples/` regression corpus and CI link-checking in [§4 below](#4-infrastructure--highest-value-next).

> Categories whose primary failure mode is a compile error (lifetime variance, GATs lifetime bounds, object safety from generic methods, cyclic workspace deps, `?`-in-`main`) are out of scope by design — the compiler is sufficient. They will not be added even with good wording.

### Rejected — out of scope by design

These were drafted but will **not** be promoted. Recorded here (rather than left in the backlog above) so they stop reading as "someday" items.

- **§B18 (draft) `#[no_std]` and `alloc`.** Rejected under the v0.3 scope reframe: its primary failure mode is a compile error (`std::*` paths missing in `no_std`), which the compiler catches — the same reason as the compile-only blockquote above. Not a silent post-compilation bug, so it does not qualify for the spec.

## 3. Meta-layer refinements

- **Trigger table:** consolidate, not grow — the table is now a source of duplication. Collapse the risk column into pointers (`→ §Bx`) and merge duplicate phrase/code rows rather than adding more.
- **Calibrated uncertainty:** add a self-assessment scale for cases where LLMs are prone to overconfidence (§B3 already flagged as one such case).
- **Repro snippets:** for each BANNED formulation, attach a minimal compilable example (needed as the test corpus for §1 tooling).

## 4. Infrastructure — highest value next

This is now the top of the value-per-cost order. The two items below are also **prerequisites for the remaining structural work** (the §B15a–e split itself is already shipped; what's left is dedup of repeated rows and section-length rebalance): a broken-link checker has to be in place *before* sections are renumbered and cross-references move, and the `examples/` corpus is what makes any restructuring verifiable rather than vibes.

- Public repository — ✅ shipped in v0.1+.
- **CI: broken-internal-link checks** (plus markdown linting). Highest value — must land *before* the remaining dedup / section-length rebalance so renumbering can't silently rot cross-references.
- **Test corpus: `examples/`** with deliberately broken Rust per category, to run through `/rust-cc-audit` as a regression suite. Needed as the safety net for structural edits and for the §1 repro-snippet work.
- **Dedup + section-length rebalance** — the structural work still open (the §B15a–e split is ✅ shipped; see [§2 "Structural"](#2-shipped-expansions-archive)). Sequence it *after* the link-checker and corpus above so the change is verifiable.

## Open questions

- ~~Should `rust-intel.md` be split into per-tier files, or is the current density still net-positive?~~ **Resolved (v0.3.x): split into a modular skill.** `SKILL.md` holds the core (protocols, enforcement tiers, trigger table, category→module map); per-theme modules under `skill/` hold the category bodies. A Claude Code skill is a *directory* (SKILL.md + supporting files loaded on demand), so single-file install was never the real constraint. The single-file `rust-intel.md` reference was retired — the modules are now the one source of truth. Split is by theme (so most cross-references fall inside a module), with tier kept as a per-category label.
- Do human-readable artifacts (README, CHANGELOG, roadmap) need a Russian translation, or is English enough alongside the English spec?
- What's the right versioning granularity: each new category = minor, or batch them?
