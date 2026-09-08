---
description: Before writing Rust — run the task through rust-intel's trigger table and Pre-flight checklist. Returns a plan, not code.
argument-hint: "<task description>"
---

# /rust-cc-plan

Catches mistakes at the design stage, while rolling them back is still cheap. This is **not** a code generator — it's a structured pre-flight before you start.

## Arguments

- `$ARGUMENTS` — task description in natural language. More detail → sharper plan.

## Process

1. **Load the `rust-intel` skill.** If unavailable, emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.

2. **Pin the world.** `Cargo.toml` declares a version *range* per dependency, not the exact version in use — read the actual resolved versions from `Cargo.lock` (or `cargo metadata`), plus `CLAUDE.md` (if present). Record the resolved versions. If they're missing or insufficient for the task, ask — don't invent.

3. **Run the trigger table.** Match phrases from `$ARGUMENTS` against the trigger table in the `rust-intel` skill (the "Self-monitoring" section near the top of the spec). Record **every** activated category — the table is the source of truth for the phrase→category mapping; this command does not duplicate it. If ≥2 categories fire, flag the task as high-risk and enumerate exactly which ones the plan defends against.

4. **Pre-flight checklist.** Walk the 9-question Pre-flight checklist defined at the end of the `rust-intel` skill (section "Pre-flight checklist"). For each question, ask the user only if the answer isn't already implied by context or by step 2. Don't ask all nine mechanically — that becomes noise. The skill is the canonical source of question wording; this command does not duplicate the checklist, but the two questions most often dropped at plan time are quoted verbatim from it so they cannot be skipped:
   - **Reference**: "does this code claim conformance to anything external (spec, RFC, format, reference impl, the project's own docs)? If yes — have I read the claimed reference, and can I name the edge cases it mandates? (Tier F)"
   - **Inverse pair**: "am I writing one half of an encode/decode, parse/Display, encrypt/decrypt pair? If yes, the round-trip property test ships in the same change (§F4) — except a `Display`/`FromStr` pair where `Display` is documented as human-readable/lossy, which has no round-trip law to ship a test for."

5. **Compose the plan.** Format:

```
# Plan: <short task name>

## Activated categories
- §B2 (Mutex across .await) — shared state between tasks
- §B3 (cancel safety) — timeout was mentioned
- §C2 (error handling) — public library function
**Risk level:** high (3 categories)

## Context
- Stack: tokio 1.X, sqlx 0.Y (resolved versions from `Cargo.lock`/`cargo metadata`)
- Crate type: library / binary
- Idioms from CLAUDE.md: <if any>

## Open questions (will block code-writing)
1. Cancel-safety boundary: if the timeout fires after `db.commit()`, what behavior?
   — retry / rollback / propagate?
2. Backpressure policy for the event queue: block producer / drop oldest / drop newest?
3. Trait `Storage` — sealed, or open to external impls?

## Solution structure
1. <step — module/function, and what matters about it for the activated categories>
2. <step>
3. ...

## Risk points (flag upfront in the code)
- `handle_request` will use `tokio::select!` — needs an explicit `cancel-safe: yes/NO` annotation (§B3).
- `Arc<Mutex<State>>` in `AppState` — guard must NOT cross `.await` (§B2); critical section ≤ 10 lines.
- `process_batch` — bounded channel `mpsc::channel(N=?)` with an explicit policy (§B14).

## After implementation (Post-flight)
- `cargo clippy -- -W clippy::await_holding_lock -W clippy::unwrap_used ...`
- If any `unsafe` is added — `cargo +nightly miri test`.
- Surface in the summary — file:line + justification each — every 🔴-tier item from the skill's Enforcement tiers (e.g. `unsafe`, `unbounded_channel`, a new dependency (§A1 defense)). Red-only: `unwrap` and routine `Arc<Mutex<_>>` are noted inline at write time, not enumerated in the summary.
```

6. **If any blockers are unresolved — stop, don't proceed with the plan.** Emit a blocking message in the spec's canonical form listing what's needed from the user.

## Behavioral principles

- **Don't write code.** Not even fragments, not even "for illustration". This command is the design phase.
- **Don't skip triggers.** If a phrase in the task activates a category, it belongs in the list — even if it seems "not relevant here". The spec is built around the fact that LLMs systematically misjudge category relevance.
- **Trait hierarchies — text before approval** (operating mode rule 3). If the task needs a new public trait, describe the signatures in the plan and mark "requires confirmation before impl".
- **Crypto — special mode** (§B12). If activated, the plan must contain a "Threat model: <…> — requires confirmation" section; code doesn't start without it.

## Limits

- The plan defends against categories that **exist in the spec**. New bug classes (see draft categories in `docs/roadmap.md`) aren't covered until they migrate into the main ruleset.
- This isn't a full architectural review. It's a pre-flight against the risk matrix, not a design doc.
