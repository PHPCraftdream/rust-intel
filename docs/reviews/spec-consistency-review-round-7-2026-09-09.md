# Spec consistency review — round 7, 2026-09-09

Base: `6d42683`.

Scope: a bounded review of initialization, raw access, Send/Sync/drop-check and
FFI transport/ownership/thread rules in `unsafe-and-ffi.md`, with its core
summaries and source ledger. `drop-and-raii.md` was read for lifecycle context;
its transaction, shutdown and edition rules were not exhaustively re-audited.
No subagents or deliberate native undefined-behavior executions were used.

## Findings and fixes

### P1 — serialization was offered as a general FFI thread-safety remedy

§B18/§B25a prescribed per-handle or global locking, or an arbitrary dedicated
thread, without a separate allowed-thread check. These mechanisms prevent some
overlap but cannot authorize an operation on the wrong thread.

GLFW's documented contract is a counterexample: initialization, event processing
and window creation/destruction are main-thread restricted. A worker holding a
global mutex still violates that contract. The priority concerns an insufficient
soundness recipe, not a discovered exploit in this repository.

Fixed the module, core triggers and source entry to require per-operation thread
affinity, including teardown, independently of serialization/reentrancy/init
order. No forbidden GLFW call was made.
[GLFW thread requirements](https://www.glfw.org/docs/latest/intro_guide.html#thread_safety).

### P2 — initialization was equated with writing every byte

§B5 limited zeroed `MaybeUninit` staging to zero-valid `T` and required every
portion to be initialized before promotion. Validity is required when creating
the `T`; padding need not be initialized.

Controls successfully wrote a nonzero value into zeroed staging storage and
initialized only the fields of a padded struct before `assume_init`. Fixed the
distinction between storage creation, value promotion, partial-construction
cleanup and raw-byte serialization. The padding-read ban remains.
[MaybeUninit validity](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html).

### P2 — raw-access proofs were stronger or weaker than the actual contract

§B5 demanded static alignment proof, rejected reference coexistence instead of
conflicting access, omitted the shared-slice `UnsafeCell` exception and required
all-source-values validity for a checked union read. Conversely, its `Pod`
summary suggested no further checks were needed.

Correct controls exercised a shorter raw-pointer reborrow, shared slice mutation
inside `Cell`, checked aligned/unaligned reads, and a union read limited to 0/1
with invalid input rejected before the read. Fixed the rules to preserve the
actual access and value proof; bit-pattern validity does not establish byte
extent, alignment or ownership/lifetime conditions.
[Slice requirements](https://doc.rust-lang.org/std/slice/fn.from_raw_parts.html),
[Pointer read](https://doc.rust-lang.org/std/ptr/fn.read.html),
[Union value validity](https://doc.rust-lang.org/reference/items/unions.html#reading-and-writing-union-fields),
[Checked byte conversion](https://docs.rs/bytemuck/1.25.2/bytemuck/fn.try_from_bytes.html).

### P2 — manual Send/Sync was tied to synchronization primitives

§B18 rejected implementations without a lock/atomic-style primitive, excluding
valid unique-ownership transfer. A Box-like raw owner can use the appropriate
`T: Send` and `T: Sync` proofs without introducing shared mutable access.

A uniquely owned `Cell<u32>` was moved to a worker, updated, read and reclaimed
there. A compile-fail control requesting Sync for that Cell owner produced
E0277. Fixed the ownership-versus-sharing distinction and retained transfer/drop
thread requirements; this does not authorize arbitrary FFI handles to migrate.
[Rustonomicon ownership proof](https://doc.rust-lang.org/nomicon/send-and-sync.html).

### P2 — missing PhantomData was treated as a drop-check hole despite Drop

§B18a described a missing ownership marker as allowing Drop to read freed data,
without accounting for an explicit generic Drop implementation's existing
drop-check obligation.

Paired compile controls retained a short-lived reference in the same marker-free
raw owner. With Drop, rustc rejected it at implicit destruction with E0597;
removing only Drop allowed compilation. The no-Drop control was not executed.
Fixed the audit to inspect fields and implementations, preserving separate
variance, auto-trait and advanced drop-glue obligations.
[Drop-check and PhantomData](https://doc.rust-lang.org/nomicon/phantom-data.html).

### P2 — FFI transport advice suggested Rust-only representations

The buffer recipe named a Rust tuple as a boundary representation, and the string
recipe did not clearly separate `CString` ownership from pointer transport.
Under `deny(improper_ctypes_definitions)`, rustc rejected both a tuple-returning
extern function and a by-value CString parameter. A `#[repr(C)]` descriptor
compiled.

Fixed the recipes to use separate scalar arguments/out-parameters or matching
C-layout descriptors, with CString retained on the Rust side unless ownership
is explicitly transferred through its raw-pointer API.
[Tuple layout](https://doc.rust-lang.org/reference/type-layout.html#tuple-layout),
[CString contract](https://doc.rust-lang.org/std/ffi/struct.CString.html).

### P2 — every FFI pointer was assigned an owning-handle contract

§B25 demanded constructor origin and full prior initialization for all pointers,
including borrowed input and output storage. It also called Rust-minted Box
exports unconditionally valid, despite later reclaiming preconditions.

Controls read a prefix of caller-owned input and wrote a caller-provided
uninitialized output slot before promoting it. Fixed contracts by role:
borrowed read extent, writable output/postconditions, or ownership transfer and
exactly-once reclamation per ownership handoff. A repeated Box→raw→Box cycle
also passed: it transfers ownership again without freeing twice. A raw pointer
copy is not another owner; constructor origin alone does not establish current
liveness or exclusive reclamation.
[Out-pointers](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html#out-pointers),
[Box layout and ownership](https://doc.rust-lang.org/std/boxed/index.html#memory-layout).

## Verification

- Positive controls passed on rustc 1.97.0, edition 2024,
  `x86_64-pc-windows-msvc`, with no third-party dependencies.
- The same controls passed installed Miri with `-Zmiri-strict-provenance` on
  `rustc 1.99.0-nightly (3659db0d3 2026-07-05)`, using offline/locked execution.
  Each unsafe operation had a local safety justification. This validates the
  executed controls under that pin, not all aliasing models or native C behavior.
- E0597, E0277 and the tuple/CString ABI diagnostics were expected compile-fail
  controls, not unresolved failures. No invalid-pointer or wrong-thread foreign
  call was executed; no toolchain or project version was changed.
- `npm run validate` passed both phases: core checked 12 skill Markdown files;
  fixture validation reported 2 cases and **494 controls executed**. All rule,
  source and trigger edits were present; only this report's final verification
  and disposition text changed afterward. These tooling controls do not measure
  semantic audit coverage.
- Skill validation, mirror agreement (13 files) and `git diff --check` passed.
- No version bump, push or release was performed. The pre-existing untracked
  `.githooks/` directory was left untouched.

All seven findings (one P1, six P2) are corrected within the stated scope; none
is deferred. The `skill-creator` discipline kept requirements tied to the actual
operation and ownership role,
rather than replacing the previous overstatements with blanket exemptions.
