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

4. **Walk every category in the skill.** Iterate from §A1 through the final Tier F category (§F4) as enumerated in the `rust-intel` skill. For each, apply that category's BANNED/REQUIRED rules verbatim from the skill — do not re-state them here. The skill is the single source of rule wording; this command is the workflow harness. Note that Tier E is a different axis — systemic cost (performance), not correctness — and is entirely 🟡/🟢, never 🔴. Tier F is reviewed with a different stance (see the skill's "Tier F — how to review for meaning"): first obtain the named spec/reference and the project's own guarantee-bearing docs (README, SECURITY.md, design docs), extract the mandated behaviors/guarantees into a checklist, then check the code against that list — enumerate, don't sample. If a claimed reference is unavailable, report "conformance to <X> not verified — reference not available" as a finding.

5. **For every finding, produce:**
   - **Category:** `§XN — name`
   - **File:line:column** (or line range for multiline patterns)
   - **Citation** of the relevant fragment (3–10 lines of context)
   - **Why it's dangerous** — one sentence referencing the spec's wording
   - **Concrete fix** — a patch or code that applies to this file (not generic advice like "use a bounded channel")
   - **Severity:** `critical` (silent data loss / UB / leak / deadlock), `high` (probable production bug), `medium` (antipattern with no immediate risk), `info` (style).
   - **Evidence** — how this was established, not how confident you feel, and **never a sort key**:
     - `pattern` — the BANNED shape is present here and no calibration note in the category excuses it, but you did not follow a caller path. A path you followed that dead-ended without reaching an entry point is also `pattern`.
     - `traced` — you followed a named entry point (public API, request handler, accept loop, FFI export, CLI argument, build script) to this site. Name it: *"Reached from: …"*. A hazard sitting *inside* an entry point (an `extern "C"` body, `main`, a handler body) is `traced` with that entry named. Do not claim `traced` without naming the entry.
     - `proven` — a run showed it: a repro or test that fails *for the predicted reason*, or miri / loom / a sanitizer. Reading the code more carefully is not a run; a failure on compilation, on a panic in setup, or on a wrong expectation in the repro is not proof either.

     `pattern` is a normal, respectable result — most static findings are `pattern`, and mislabelling one `traced` is the only thing that makes this field worthless. **For categories with no caller path by nature — manifests/lockfiles/toolchains/CI (§A1, §C5–§C11), public-API and semver shape (§B1*/§C1*), test code (Tier D), documented guarantees (§F2) — `pattern` is *complete* evidence, not a candidate:** the artifact establishes the finding and there is no path to follow. **Severity and evidence are independent axes:** a `critical` / `pattern` finding is legitimate — do not deflate severity because you did not trace, and do not inflate evidence because severity is high.

5a. **A candidate that no entry point can reach is not a finding.** Production code whose sole live caller is a test, a `cfg`-disabled branch, a private function with no live caller — record it in an *Unreachable matches* section with what you checked, and leave it out of the severity counts. Unreachability is a **result**, not a failure to find something: reporting it stops the next audit re-deriving it, while silently dropping it loses the work. Four limits:
   - **`cargo test` is an entry point.** For Tier D categories the test code *is* the audit surface — a match inside a test is never `unreachable`.
   - **In a library crate the public API is an entry point.** An item reachable from the crate root via `pub`/`pub use` is never `unreachable`, however few in-crate callers it has: the caller is a downstream user you cannot see.
   - **It requires showing no path exists, not failing to find one.** Undetermined reachability (dyn dispatch, macro-generated calls, a registry lookup) stays a finding labelled `pattern`.
   - **A 🔴 occurrence that is unreachable still appears in the Post-flight 🔴 summary** with that status — this bucket never removes an occurrence from the 🔴 inventory.

   Conversely, never weaken a check, widen a category, or stretch a calibration note to make something reportable — finding less than expected is an outcome; manufacturing a finding is a defect in the audit.

6. **Report grouping:**
   - By severity (critical → info).
   - Inside a severity, by tier (A → B → C → D → E → F). **Evidence is not a sort key** — it records how a finding was established, not how much it matters, and artifact-established categories are complete at `pattern`; ranking by it would push them below a traced guess.
   - End with a Post-flight summary in the spec's canonical form: surface **only** the 🔴-tier occurrences — see the `rust-intel` skill's *Enforcement tiers* for the canonical list (it is the single source; do not duplicate it here). Do not enumerate 🟢-tier items (`unwrap`/`expect`, `clone_on_copy`, narrowing `as` casts, etc.) — those are left to clippy. Non-🔴 antipatterns surfaced as individual findings above stay there; they are not re-aggregated into the summary. Tier E (systemic cost / perf) is entirely 🟡/🟢, so it never surfaces in the Post-flight summary either — perf findings appear as ordinary findings above, like any other non-🔴 antipattern.

## Report format

```
# rust-cc-audit report

**Scope:** <path>
**Pinned versions:** tokio=X.Y, sqlx=A.B, ...
**Found:** N critical, M high, K medium, L info  (evidence: P proven, T traced, C pattern — P+T+C equals N+M+K+L)

---

## CRITICAL

### [§B2] src/handler.rs:47–52 — Mutex held across .await · evidence: traced
**Reached from:** `POST /items` → `axum` handler `put_item` → `update_cache` (this site)
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

### [§B8] src/notifier.rs:88 — Forgotten .await · evidence: pattern
(no "Reached from:" line — the caller path was not followed, and inventing one would be worse than omitting it)
...

---

## HIGH
...

---

## Unreachable matches (not findings)

Candidates that matched a BANNED shape but that no entry point reaches — recorded so the next audit does not re-derive them, and **not** counted in **Found:**. A 🔴 occurrence listed here still appears in the Post-flight summary with this status. Write "none" when there are none.

- **[§B7]** `src/legacy/import.rs:210` — `read_to_end` on an unbounded decoder in **production** code whose only live caller is `#[cfg(test)]`; the module is private and no `pub`/`pub use` path reaches it (checked: `lib.rs`, crate-root re-exports, every `pub use`). Not `unreachable` had the item been `pub`: a downstream user would be the caller.

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
- Spec / documented-guarantee divergence on a wire format, security guarantee, or persisted data (§F1/§F2): none
- Leaked / unclosed boundary resource an untrusted peer can hold open (§F3): none
```

## Behavioral principles

- **Don't invent findings.** If a category isn't activated, don't mention it. A short report beats a synthetic one.
- **Report what you established, not what you suspect.** Label each finding's evidence honestly (`pattern` / `traced` / `proven`) and never label up: unfollowed paths stay `pattern`, and "I read it carefully" is not `proven`. Never weaken a check or stretch a calibration note to make something reportable — an empty section is an outcome; a manufactured finding is a defect in the audit itself.
- **Don't "fix" in the repo.** Report only. Applying fixes is a separate step the user authorizes.
- **Block on uncertainty.** If a crate version is unknown and §A1 needs it, emit a blocking message — don't guess.
- **Don't restate the spec.** Reference the paragraph (`§B2`) instead of paraphrasing its text.

## Limits

- This is static analysis via reading. It doesn't replace `cargo clippy`, `miri`, `tokio-console`, `loom` — the spec's Post-flight checklist still recommends them explicitly. Concretely: without a run, nothing here can be `proven`, so a report of all-`pattern` findings is the expected shape of a pure reading pass, not a weak one.
- Categories that need runtime observation (steady-state memory growth for §B10) can only be flagged as "candidate" — not confirmed without profiling. Some hazards are not decidable by reading *or* by a single run — a race with no synchronization point to pin it to is the standard case. Say so plainly and name what would settle it (`loom` model, sanitizer, sustained load), rather than upgrading a guess to `traced`.
