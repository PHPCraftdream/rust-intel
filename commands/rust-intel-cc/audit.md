---
description: Scan Rust code against the categories from rust-intel and return a triaged report with concrete fixes.
argument-hint: "[path]"
---

# /rust-cc-audit

Audits Rust code against the full taxonomy in the `rust-intel` skill. Removes the developer's need to know every category — finds what a senior reviewer with that document in their head would catch.

## Arguments

- `$ARGUMENTS` — path to a file, directory, or crate. Defaults to the current working directory.

## Process

1. **Load the `rust-intel` skill.** This is the only source of rules. If the skill is unavailable, emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.

2. **Pin the world.** Read `Cargo.toml` (and `CLAUDE.md`, if present). Record the exact versions of `tokio`, `axum`, `sqlx`, `reqwest`, `serde`, `hyper`, `clap`, and any other key dependency. Without this, §A1 (API hallucinations) cannot be checked — block instead of guessing.

3. **Determine scope.**
   - If `$ARGUMENTS` is empty: walk `src/**/*.rs` relative to cwd.
   - If a file: just that file.
   - If a directory: every `*.rs` recursively, excluding `target/`.
   - Skip generated code (`OUT_DIR`, `build.rs` output).

   **Fan-out preferred for broad scope.** For a whole-crate or directory scope, prefer the fan-out workflow from the skill's "Running a full pass" section — the shipped `audit-project.workflow.js` (one agent per module, async split into two). The serial walk below is the fallback for a single file or when the Workflow tool is unavailable.

4. **Walk every category in the skill.** Iterate from §A1 through the final §E category (§E6) as enumerated in the `rust-intel` skill. For each, apply that category's BANNED/REQUIRED rules verbatim from the skill — do not re-state them here. The skill is the single source of rule wording; this command is the workflow harness. Note that Tier E is a different axis — systemic cost (performance), not correctness — and is entirely 🟡/🟢, never 🔴.

5. **For every finding, produce:**
   - **Category:** `§XN — name`
   - **File:line:column** (or line range for multiline patterns)
   - **Citation** of the relevant fragment (3–10 lines of context)
   - **Why it's dangerous** — one sentence referencing the spec's wording
   - **Concrete fix** — a patch or code that applies to this file (not generic advice like "use a bounded channel")
   - **Severity:** `critical` (silent data loss / UB / leak / deadlock), `high` (probable production bug), `medium` (antipattern with no immediate risk), `info` (style).

6. **Report grouping:**
   - By severity (critical → info).
   - Inside a severity, by tier (A → B → C → D → E).
   - End with a Post-flight summary in the spec's canonical form: surface **only** the 🔴-tier occurrences — see the `rust-intel` skill's *Enforcement tiers* for the canonical list (it is the single source; do not duplicate it here). Do not enumerate 🟢-tier items (`unwrap`/`expect`, `clone_on_copy`, narrowing `as` casts, etc.) — those are left to clippy. Non-🔴 antipatterns surfaced as individual findings above stay there; they are not re-aggregated into the summary. Tier E (systemic cost / perf) is entirely 🟡/🟢, so it never surfaces in the Post-flight summary either — perf findings appear as ordinary findings above, like any other non-🔴 antipattern.

## Report format

```
# rust-cc-audit report

**Scope:** <path>
**Pinned versions:** tokio=X.Y, sqlx=A.B, ...
**Found:** N critical, M high, K medium, L info

---

## CRITICAL

### [§B2] src/handler.rs:47–52 — Mutex held across .await
```rust
let guard = state.lock().unwrap();
let value = guard.get(&key).cloned();
some_async_op(value).await  // ← guard still alive
```
**Why dangerous:** `std::sync::Mutex` blocks the tokio worker across `.await` — deadlocks under load.
**Fix:**
```rust
let value = {
    let guard = state.lock().unwrap();
    guard.get(&key).cloned()
};  // guard dropped before .await
some_async_op(value).await
```

### [§B8] src/notifier.rs:88 — Forgotten .await
...

---

## HIGH
...

---

## Post-flight summary

Surface **only** the 🔴-tier occurrences — see the `rust-intel` skill's *Enforcement tiers* for the canonical list (it is the single source). 🟢-tier items (`unwrap`/`expect`, `clone_on_copy`, narrowing `as` casts) are left to clippy and are not listed here. The lines below are an illustrative shape, not the authoritative inventory.

- `unsafe` / `transmute` / `mem::uninitialized`/`zeroed` (§B5): none
- Crypto calls — library / primitive / params (§B12): none
- New `Cargo.toml` dependencies — name + version + justification (§A1): none
- Manual `unsafe impl Send`/`Sync` (§B18): none
- `unbounded_channel` / unbounded `FuturesUnordered` (§B14): 1 (src/events.rs:14 — unjustified)
- atomic `Relaxed`-publish to another thread (§B13): none
- `tokio::spawn` whose `JoinHandle` is dropped (§B21): none
- `impl Drop` doing async work (§B22): none
- `==`/`!=` on secret material (§B24): none
- `extern "C"` / `Box::from_raw` / `from_raw_parts` (§B25): none
- `Pin::new_unchecked` (§B15b): none
- Blanket impl in a public API (§C1): none
```

## Behavioral principles

- **Don't invent findings.** If a category isn't activated, don't mention it. A short report beats a synthetic one.
- **Don't "fix" in the repo.** Report only. Applying fixes is a separate step the user authorizes.
- **Block on uncertainty.** If a crate version is unknown and §A1 needs it, emit a blocking message — don't guess.
- **Don't restate the spec.** Reference the paragraph (`§B2`) instead of paraphrasing its text.

## Limits

- This is static analysis via reading. It doesn't replace `cargo clippy`, `miri`, `tokio-console`, `loom` — the spec's Post-flight checklist still recommends them explicitly.
- Categories that need runtime observation (steady-state memory growth for §B10) can only be flagged as "candidate" — not confirmed without profiling.
