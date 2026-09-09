# Spec consistency review — 2026-09-09

Base: `3c52371`.

Scope: a bounded, single-reviewer consistency pass over core operating rules,
trigger summaries, the audit adapter, and selected module contracts. Particular
attention went to §B19, §B7, §C1, §B4a and the recently added performance guidance.
This is not a new exhaustive audit of every crate-version pin, advisory, source
or category. No independent agent evaluation was performed.

## Findings and fixes

### P2 — §B19 could turn a valid finite pass into growing work

The original rule banned a captured-length index loop even when its contract was
to process only the original elements. Its replacement required rechecking the
length. If each iteration appends one item, both the index and length grow, so
their difference never reaches zero. The same section prescribed BFS-style
layers/FIFO work for DFS and required snapshots without establishing that the
algorithm needed pre-mutation state.

Fixed in [concurrency-and-state.md](../../skill/concurrency-and-state.md): choose
the iteration boundary, FIFO/LIFO order and snapshot strategy by the intended
traversal; preserve index validity, termination and resource bounds.

Evidence: the Rust Reference's loop semantics plus a bounded rustc 1.97.0 probe.
The original-elements pass completed after two iterations. The growing variant
was deliberately stopped after six steps, with `len - index == 2` throughout.
The invariant establishes the continuing-work mechanism; no exhaustion test was
run. [Rust Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#iterator-loops).

### P2 — §B7's short recipe omitted the resource-budget prerequisite

The detailed rule and source ledger correctly required finite input/depth/work
budgets. The REQUIRED list still offered an iterative `Vec` worklist as an
alternative to a depth limit, without carrying those budgets forward.

Fixed in [unsafe-and-ffi.md](../../skill/unsafe-and-ffi.md): iterative traversal
is an implementation choice within the budget and must cover later traversal
and teardown. Evidence is the contradiction between the two live instructions;
moving traversal state to the heap does not cap its growth or work.

### P2 — final checklists and the audit adapter broadened blocking

The core Blocking protocol allowed explicit assumptions outside three
implementation prerequisites. The final pre-flight text instead paused for any
uncertainty; the closing trait rule also lost its published-library scope. The
audit adapter treated missing crypto/unsafe context as a reason to stop the
entire inspection, even though reporting missing evidence requires no speculative
implementation.

Fixed in [SKILL.md](../../skill/SKILL.md) and
[audit.md](../../commands/rust-intel-cc/audit.md): read-only inspection reports
verification limits and continues supported checks; an affected implementation
still waits for its security prerequisites. The trait approval summary now
matches Operating mode item 3 and respects prior approval. Post-flight wording
requires reporting checks actually executed or unavailable.

Evidence: conflicting instructions within the shipped workflow. These are
artifact-established findings; no claim of an independent model behavior test
is made.

### P3 — newtype wording incorrectly moved destruction to compile time

Fixed in [lifetimes-and-api.md](../../skill/lifetimes-and-api.md): potential
elimination of wrapper overhead is distinct from runtime field initialization,
destruction and a representation/ABI promise.

Evidence: a rustc 1.97.0 probe observed a wrapped field's destructor when the
wrapper was dropped at runtime, matching the Reference's recursive field-drop
rule. [Rust Reference](https://doc.rust-lang.org/reference/destructors.html).

### P3 — tail-temporary wording conflated evaluation with the returned value

Fixed in [drop-and-raii.md](../../skill/drop-and-raii.md): ordinary tail
temporaries end before block locals in edition 2024, while a value moved out of
the block follows its destination's scope; lifetime-extension rules still apply.

Evidence: the edition-2024 probe recorded `temporary`, then `local` at block exit,
and `result` only when the caller subsequently dropped that value.
[Edition Guide](https://doc.rust-lang.org/edition-guide/rust-2024/temporary-tail-expr-scope.html).

## Verification and limits

- Repository core validator: passed, 12 skill Markdown files checked.
- Skill validator: passed.
- Canonical/mirror agreement and `git diff --check`: passed.
- Bounded Rust diagnostic: passed on rustc 1.97.0, edition 2024.
- The full 494-control suite passed earlier in this preparation sequence. It was
  not rerun for this prose-only correction; validators and fixtures are unchanged.

All five findings above are addressed. This disposition applies to the stated
review scope, not to an exhaustive release certification.
