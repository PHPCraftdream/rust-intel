# Round 12 review of the latest commits — 2026-09-03 12:45 CEST

- Commit range: `ad31d89f4cea002e7a3aed7daee7d970540e78a5..31a350591ee9db67fcf90ca1388b715e680bfa54`
- Implementation commit reviewed: `31a3505` — `rust-intel: correctness fixes from round-11 independent review`
- Delta: 13 files, 53 insertions, 50 deletions
- Pre-existing untracked paths excluded: `.githooks/` and `docs/reviews/fix-plan-2026-08.md`
- Method: one pass over each of the ten normative modules, central trigger/tier review, Round-11 closure accounting, primary documentation/API checks, canonical/package-mirror comparison, validator/fixture/packaging checks, active-install comparison, and a separate synthesis pass
- Verdict: **REQUEST CHANGES**

`31a3505` closes most of Round 11 accurately. In particular, the channel-constructor list, cancellation
criteria, documented-detach exception, public-alias rule, password-hash 0.6 feature gates, dependency
severity, C9 spawn coverage, set-family trigger, and the main persisted-layout explanations are materially
better. Repository checks pass and every changed normative file is byte-identical to its package mirror.

The pass is not complete. The central persisted-format trigger still omits removals and accepts versioning
without the module-required prior-layout corpus, so code-only requests can bypass the red conformance rule
for changes that reinterpret deployed bytes. The new `JoinSet` wording also treats a concurrent/later drain
as if it were backpressure, although `FromIterator` spawns the entire input before the first drain. Several
P2 contradictions or false positives remain, and none of the corrected high-risk families gained a
behavioral regression control. Release evidence and the installed Codex skill remain stale.

## Executive result

- Two conditional-P1 activation gaps remain in the central §F1 row: positional variant/field **removal** is
  absent, and a version byte suppresses activation without the prior-layout corpus required by the module.
- `JoinSet` growth is recognized through `Extend`/`FromIterator`, but “matching/continuous drain” is accepted
  without a cap; this does not bound peak or steady-state occupancy.
- The SCC trigger still enumerates only four guard origins, and the C12 central trigger rejects the module's
  valid drop-raw-events remedy.
- The new covered-type definition contradicts its own `Vec<T>` example, while the persisted-corpus marker
  requirement is impossible for singleton/zero-byte domains.
- Green validation proves structural consistency only: the no-leading-pipe blind spot is merely documented,
  fixtures still cover only B5/B26, cited evidence is absent from `HEAD`/the package, and the active Codex
  installation matches the v0.6.0 baseline rather than this commit.

## Conditional P1 findings

### §F1 activation omits positional variant/field removals

Locations: `skill/SKILL.md:406` and mirror; compare `skill/semantics-and-conformance.md:19`.

The central code trigger activates only when a diff “inserts or reorders” enum variants or struct fields.
The module correctly includes insertion, reorder, **or removal**. Under default ordinal Borsh encoding,
removing `B` from `enum E { A, B, C }` shifts `C` from tag 2 to tag 1; old `B` bytes can decode as the new
`C` when their payload shapes are compatible. A code-only request performing that removal therefore avoids
the central §F1 activation despite the same deployed-data hazard the row is intended to catch.

Add “removes” to both enum-variant and struct-field shapes and retain the existing explicit-discriminant
qualification. Borsh's official specification defines structs by declaration-order fields and enums by an
ordinal followed by the variant payload; the current derive docs separately explain the explicit-discriminant
opt-in. Sources: [Borsh specification](https://borsh.io/),
[Borsh `use_discriminant`](https://docs.rs/borsh/latest/borsh/derive.BorshSerialize.html#2-borshuse_discriminantbool-item-level-attribute).

### §F1 central `version OR corpus` logic bypasses the module's required compatibility evidence

Locations: `skill/SKILL.md:406` and mirror; compare `skill/semantics-and-conformance.md:19`.

The central row suppresses activation when it sees either version/dispatch metadata **or** a prior-release
golden corpus. The module requires the prior-release corpus for a positional layout change and additionally
requires version/dispatch policy when more than one incompatible layout is deployed. Those controls are not
substitutes: a version byte routes records but proves nothing about the old decoder branch, while a corpus
cannot route two incompatible deployed layouts. Because code triggers decide whether the module is loaded,
the central `OR` lets versioned-but-untested compatibility work avoid the red rule altogether.

State the module contract centrally: require the prior-layout corpus, plus unambiguous version/metadata,
per-version dispatch, and support/migrate/reject policy whenever more than one layout exists.

## P2 findings

| Location | Finding | Required correction |
|---|---|---|
| `skill/SKILL.md:369`; `skill/concurrency-and-state.md:125`; mirrors | The new `JoinSet` rule treats a “matching `.join_next()` drain” or “continuously-drained use” as an alternative to a cap. `attacker_jobs.map(work).collect::<JoinSet<_>>()` synchronously spawns every supplied future before draining begins; a loop may also insert faster than completions while still calling `join_next`. Peak/steady-state tasks therefore remain attacker-controlled. | Require a hard concurrency cap or the same proved finite-total/finite-backlog envelope used for channels. For streams, gate insertion at a maximum set length and await removal before adding more. Describe removal semantically (`join_next*`, poll/try forms, `join_all` where appropriate), not as one spelling. [Tokio `JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html#impl-FromIterator%3CF%3E-for-JoinSet%3CT%3E). |
| `skill/SKILL.md:206,304`; mirror | SCC's current names were corrected, but the origin list is still treated as exhaustive. Current `try_entry`, `begin_sync`/`begin_async`, and `any_sync`/`any_async` also yield `Entry`/`OccupiedEntry` guards that can remain live across `.await`; those shapes avoid the B2 code trigger. | Trigger semantically on any live `scc::hash_map::{Entry, OccupiedEntry}` across `.await`; keep method names as pinned-major examples rather than the definition. [scc `HashMap`](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html). |
| `skill/SKILL.md:373`; compare `skill/deps-macros-ergonomics.md:179`; mirror | The central C12 row requires a post-render sanitization pass plus URL-scheme validation. The module correctly permits either sanitizing rendered HTML **or** dropping both `Event::Html` and `Event::InlineHtml`, with URL schemes checked independently. Safe drop-events + allowlist code is therefore still classified as a red finding. | State the first defense as “drop both raw-HTML event kinds or sanitize rendered HTML”; independently require a link/image scheme allowlist unless the selected sanitizer enforces it. [pulldown-cmark `Event`](https://docs.rs/pulldown-cmark/latest/pulldown_cmark/enum.Event.html), [ammonia URL schemes](https://docs.rs/ammonia/latest/ammonia/struct.Builder.html#method.url_schemes). |
| `skill/SKILL.md:307`; mirror | The definition says `T` is covered only when nested in another “(local) type”, then correctly says external `Vec<T>` covers it. Locality is not a condition of coverage; the condition is a non-fundamental type constructor. This can falsely label `Option<T>`/other external non-fundamental wrappers as blanket impls. | Remove “(local)” and separate coverage from the orphan rule's locality concept. Preserve the correctly-added exception for `&`, `&mut`, `Box`, and `Pin`. [Rust Reference glossary](https://doc.rust-lang.org/reference/glossary.html#blanket-implementation). |
| `skill/SKILL.md:406`; `skill/semantics-and-conformance.md:19`; mirrors | Requiring a “non-equal and non-default” marker at **every** serialized position is not satisfiable for `()`, `PhantomData<T>`, singleton enums, zero-byte fields, and other singleton/invariant-constrained domains. For example, `Record { marker: (), left: u32, right: u32 }` has no non-default value for `marker`, although the meaningful integer reorder is testable. | Require pairwise-distinguishable values where the field domain and wire representation permit, across multiple samples when necessary. For singleton/zero-byte positions, rely on exact golden bytes and distinguish the neighboring meaningful positions. |

## Operational completeness

This is not a normative-rule severity finding, but the delivery remains incomplete. `CHANGELOG.md:11` and
`docs/reviews/README.md:12-14` cite `docs/reviews/fix-plan-2026-08.md`, which is absent from `HEAD` (the
worktree copy is untracked and user-owned). The npm tarball ships the citing changelog but no
`docs/reviews/*`. The active `C:\Users\Computer\.agents\skills\rust-intel` matches the v0.6.0/origin
baseline in 11/11 normative files and current `31a3505` in 0/11. Commit or withdraw the cited plan, make
shipped evidence resolvable, and reinstall/byte-verify Codex only after normative corrections land.

## P3 findings

| Location | Finding and correction |
|---|---|
| `skill/SKILL.md:206`; mirror | `DashMap::RefMut` is called a shard-local `MutexGuard`; it contains an `RwLockWriteGuard`, while `Ref` contains the corresponding read guard. Say “shard-local RwLock write guard”; retain the Mutex analogy only for conflicting re-entry. [DashMap source](https://docs.rs/dashmap/latest/src/dashmap/mapref/one.rs.html). |
| `skill/SKILL.md:316`; mirror | “Only a guard that excludes all other access” is broader than necessary. A per-key or shard write guard may serialize every access capable of changing the checked predicate while unrelated keys remain accessible. Require exclusion of every **competing** access and state that all access paths must honor the discipline. |
| `skill/security.md:42`; `skill/SKILL.md:201`; mirrors | `SaltString::generate(&mut OsRng)` is still described as valid for all `password-hash <= 0.5`. Version 0.1 has no such method, while 0.5 exposes it under `rand_core` (default there, absent with `default-features = false`). Say “0.5.x with `rand_core`” and verify any older supported minor separately. [0.5 method](https://docs.rs/password-hash/0.5.0/password_hash/struct.SaltString.html#method.generate), [0.5 features](https://docs.rs/crate/password-hash/0.5.0/features). |
| `dev/validate.mjs:283-286` | The added comment accurately documents the leading-pipe convention but adds no enforcement. A valid GFM duplicate row without an outer pipe is still treated as the end of the table and skipped. Parse both valid forms or fail explicitly on a convention violation, then add a mutation test. [GFM tables, example 199](https://github.github.com/gfm/#example-199). |
| `dev/validate-fixtures.mjs:5-9,21-26,48-51,219-226`; `examples/fixtures/cases.json:1-9` | Fixtures still exercise only two category detectors, B5 and B26. Reverting the new JoinSet, password-hash, public-alias, or persisted-format corrections in canonical and mirror files leaves all checks green. Add focused positive/negative or compiler-backed controls for changed high-risk invariants without pinning complete prose. |

## Round-11 closure accounting

| Round-11 item | Status in `31a3505` |
|---|---|
| Common unbounded-channel constructors | **Closed**: std, Crossbeam, futures-mpsc, Tokio, Flume, and async-channel are covered under a semantic no-cap rule. |
| `JoinSet` `Extend`/`FromIterator` construction | **Partial**: construction paths are recognized; drain-without-cap is incorrectly accepted. |
| Fundamental constructors in blanket-impl detection | **Partial**: `&`/`&mut`/`Box`/`Pin` exception and witness are correct; the new “local type” definition contradicts ordinary non-fundamental coverage. |
| C12 autoescape and independent Markdown defenses | **Partial**: extension/mode activation and independent URL defense landed; the valid drop-events branch is missing centrally. |
| `select!` cancellation criteria | **Closed**: atomicity alone is no longer sufficient. |
| Dropped JoinHandle exception/API attribution | **Closed**: documented detach and actual Handle/Runtime forms are aligned. |
| SCC APIs/guard semantics | **Partial**: four current names and read/write distinction are correct; other guard origins remain outside the trigger and one phrase says `MutexGuard`. |
| Exclusive guard for B13 TOCTOU | **Closed in substance**: shared/read guard is correctly rejected; one overbroad phrase remains P3. |
| Public type aliases and nameability | **Closed**. |
| password-hash 0.6 feature/version boundary | **Closed** for 0.6.x; the older `<=0.5` branch remains overbroad. [password-hash 0.6.1 features](https://docs.rs/crate/password-hash/0.6.1/features). |
| New-dependency review vs red-finding severity | **Closed**. |
| Persisted top-level structs, retrofit collision, version dispatch, Borsh payload order | **Partial**: explanations improved, but removal activation, central `version OR corpus` logic, and universally satisfiable marker guidance remain open. |
| C9 spawn coverage | **Closed**. |
| Ord introduction and set-family activation | **Closed**. |
| Leading-pipe row/validator | **Partial**: current row restored; validator blind spot remains. |
| Behavioral regression fixtures | **Open/unchanged**. |
| Release evidence and active Codex installation | **Open/unchanged**. |

## Ten-module coverage record

| Module | Round-12 result |
|---|---|
| Async | Cancellation and JoinHandle fixes closed; no new async-module finding. |
| Unsafe / FFI | No target-delta finding; prior callback, ownership, panic-boundary, and Miri corrections remain closed. |
| Concurrency / state | `JoinSet` drain is not a bound; SCC guard-origin gaps; two wording inaccuracies. |
| Data / types | Ord intro and `HashSet`/`BTreeSet` coverage closed; no new module finding. |
| Security | 0.6.x feature gates and salt rationale closed; `<=0.5` recipe remains semver/feature-fragile. |
| Drop / RAII | No target-delta finding; caught-panic correction remains closed. |
| Dependencies / macros / ergonomics | C12 central rule omits the module's valid raw-event filtering branch; dependency severity closed. |
| Lifetimes / API | Fundamental exception landed, but covered-type locality definition is contradictory; public aliases closed. |
| Testing | Current row restored, but validator enforcement and behavioral regression controls remain absent. |
| Semantics / conformance | Removal activation gap; impossible marker requirement; central/module corpus-version mismatch. |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files and 2 fixture cases |
| JS syntax checks | PASS — both validators, shipped audit workflow, and both installers |
| `git diff --check ad31d89..31a3505` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — all normative files byte-identical |
| `npm pack --dry-run --json` | PASS — 37 entries; 586,999 bytes packed; 1,624,017 unpacked; integrity `sha512-/0tpBeqv98mvriK0Ck/cHaX37qgxUz1yuPOdEa5hMvBl2WH6xc8Gdl7FnKuQhwFHj/D0fF/2hbNy1IMsFFSJCg==` |
| Fix-plan object in `HEAD` | FAIL — `docs/reviews/fix-plan-2026-08.md` is absent |
| Review evidence in npm tarball | FAIL — zero `docs/reviews/*` entries |
| Active Codex skill parity | FAIL — 11/11 installed normative files match v0.6.0/origin baseline; 0/11 match `31a3505` |
| Repository Cargo checks | Not applicable — no `Cargo.toml`; version-sensitive Rust/crate claims were checked against primary docs |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

## Recommended correction order

1. Close both red §F1 activation gaps — removals and `version OR corpus` — then make `JoinSet` require
   actual bounded admission rather than a later/concurrent drain.
2. Complete semantic activation for every SCC entry guard and reconcile C12's central rule with the
   module's drop-events remedy.
3. Reconcile the covered-type and persisted corpus/version contracts; make marker guidance satisfiable
   for singleton and zero-byte domains.
4. Correct the DashMap/TOCTOU/password-hash wording and turn the documented table convention into an
   executable validation invariant.
5. Add regression controls for the corrected high-risk families, commit or remove unresolved evidence
   references, then reinstall and byte-verify the Codex skill.
