# Round 14 review of the latest commits — 2026-09-03 14:59 CEST

- Commit range: `9a873ff7b31f6adcfe6041595d752a1ba3ba7d86..d10427d8131653a4af6a63499773a29e10688b85`
- Commits reviewed:
  - `00d773b` — `docs: commit fix-plan-2026-08.md`
  - `d10427d` — `rust-intel: correctness fixes from round-13 independent review`
- Delta: 13 files, 453 insertions, 45 deletions
- Pre-existing untracked path excluded: `.githooks/`
- Method: one pass over each of the ten normative modules, central trigger/tier review, Round-13 closure accounting, primary documentation/API checks, canonical/package-mirror comparison, validator/fixture/packaging checks, active-install comparison, and a separate independent synthesis pass
- Verdict: **REQUEST CHANGES**

The two commits close much of Round 13 correctly. The missing fix plan is now tracked; nested non-recursive
layout branches and repeated small domains are addressed; direct SCC/DashMap entry guards are named;
`JoinSet` no longer claims a `Stream` implementation; the password-hash and Argon2 public feature names
are separated; TOCTOU and ordinary multi-input lifetime wording are narrowed; the mutation harness copies
a curated input set; and different-width pipe-less table rows now fail validation. The repository validates,
the shipped mirrors are identical, and the package dry-run is structurally healthy.

The result is not release-ready. The persisted-layout oracle is still expressed through typed values rather
than observable bytes/decode results, allowing a conforming corpus to miss a wire-compatible cross-type
field reorder. The new recursive-coverage wording is literally impossible for recursive types. Map-guard
activation still omits live mapped/iterator/wrapper guards and contains an incorrect return-type claim. Ten
lower-severity groups remain in cap arithmetic, security and lifetime wording, public API consistency,
validator parsing and oracles, standard-library contract precision, and trigger completeness.

## Executive result

- **One conditional-P1 finding:** the persisted-layout corpus can remain green across a semantically
  load-bearing reorder because typed value-vector uniqueness is not a wire/decode oracle. It is P1 when
  already-deployed disk/database/wire bytes are at risk; otherwise it is a specification defect.
- **Two P2 findings:** recursive-layout coverage is stated as an infinite obligation, and concurrent-map
  guard activation still has semantic holes plus incorrect API descriptions.
- **Ten P3 findings:** `JoinSet` admission is off by one; the Argon2 recipe does not enable the shown OS RNG;
  B1a and public-alias wording are inconsistent; the leading-pipe parser has false negatives and positives;
  semantic controls remain partial; the fixture harness can false-fail or false-skip; collection survivor
  behavior is overclaimed; and §B6 lacks a general activation path.
- Operationally, the fix plan is now in `HEAD`, but review evidence is still absent from the npm tarball and
  the active Codex installation still matches v0.6.0 rather than current `HEAD`.

## Conditional P1 finding

### Typed value-vectors do not prove byte-level layout distinguishability

Locations: `skill/SKILL.md:406`, `skill/semantics-and-conformance.md:19`, and mirrors.

The corrected rule requires every reorderable position to have a unique value-vector across the corpus.
That works for repeated fields of the same type, including the new one-hot `bool` example, but equality of
vectors from different Rust types is undefined and is not the compatibility property being protected.

For default bincode encoding, consider:

```rust
struct S { n: u8, flag: bool }
```

Prior-release fixtures `{ n: 0, flag: false }` and `{ n: 1, flag: true }` give apparently distinct typed
vectors `(0u8, 1u8)` and `(false, true)`. On the wire both position vectors are `[0, 1]`: bincode encodes
`false`/`true` as `0`/`1`, encodes `u8` directly, and serializes struct fields in declaration order without
names. After reordering the declaration to `{ flag, n }`, both old records still decode to their original
logical values, so the supposedly distinguishing golden corpus stays green.

State the observable obligation: for every non-identity permutation of mutually reorderable sibling
positions, at least one prior-release fixture must either fail decoding or decode unequal to its named-field
or variant expectation. Distinct encoded-byte signatures within every wire-compatible sibling group are one
sufficient construction; a schema-mutation negative control is a stronger oracle. Source:
[bincode 2 specification](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md).

## P2 findings

### Recursive coverage is stated as an impossible infinite obligation

Locations: `skill/SKILL.md:406`, `skill/semantics-and-conformance.md:19`, and mirrors.

The new text requires every reachable enum variant “at every nesting depth.” A valid recursive schema such
as `struct Node { value: u8, next: Option<Box<Node>> }` has `Some` occurrences at arbitrarily many runtime
depths, so no finite golden corpus can satisfy the literal rule. This can make the normative audit impossible
to complete even though the finite schema graph is fully covered.

Define coverage over the finite graph of distinct serialized type/variant definitions, to a fixed point, once
per relevant monomorphization. For a recursion edge require a terminating representative, one recursive
representative, and any format-specific depth boundary rather than every runtime depth. Borsh supports both
[`Box<T>` and `Option<T>` serialization](https://docs.rs/borsh/latest/borsh/ser/trait.BorshSerialize.html),
so this is not merely a synthetic type-system case.

### Map-guard activation is still syntactic and incomplete

Locations: `skill/SKILL.md:206,304`, `skill/async.md:17`, and mirrors.

The direct SCC and DashMap entry families added in `d10427d` are correct, but the trigger still does not mean
“any live value owning or containing a map guard.” It omits DashMap
`mapref::one::{MappedRef, MappedRefMut}`, iterator items
`mapref::multiple::{RefMulti, RefMutMulti}`, and guard-bearing wrappers such as `Option<Entry>`,
`Option<Ref>`, or `TryResult<RefMut>`. The central code trigger additionally requires a guard to be “bound to
a `let`,” missing a guard retained by a `match` binding or another expression shape.

There is also a concrete API inaccuracy: SCC `entry_async()` returns `Entry::{Occupied, Vacant}`, whereas `get_async()` returns
`Option<OccupiedEntry>`. A `RefMulti` from `map.iter().next()` can therefore survive across `.await`, retain
the shard read guard, and deadlock a later exclusive access without matching the named trigger.

Make guard ownership/liveness the definition and retain type/method names only as examples. Include mapped,
iterator, entry, direct-access, SCC, and transitive wrapper shapes; remove the `let` restriction; then correct
the producer signatures. Sources: [DashMap `try_entry`](https://docs.rs/dashmap/latest/dashmap/struct.DashMap.html#method.try_entry),
[DashMap iterator item](https://docs.rs/dashmap/latest/dashmap/iter/struct.Iter.html),
[DashMap `MappedRef`](https://docs.rs/dashmap/latest/dashmap/mapref/one/struct.MappedRef.html), and
[SCC `HashMap`](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html#method.entry_async).

## P3 findings

| Location | Finding and required correction |
|---|---|
| `skill/SKILL.md:369`; `skill/concurrency-and-state.md:125`; mirrors | The admission recipe checks `len() <= N` **before** insertion, so `len() == N` admits task `N + 1`. Require `len() < N` before insertion, normally `while set.len() >= N { set.join_next().await; }`, and reserve `len() <= N` for the post-insertion invariant. The uncoupled-drain and nonexistent-`Stream` defects from Round 13 are otherwise closed. Source: [Tokio `JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html). |
| `skill/security.md:42`; `skill/SKILL.md:201`; mirror | Splitting `password-hash/rand_core` from `argon2/rand` fixes the public feature name, but `argon2 = { default-features = false, features = ["rand"] }` only exposes `SaltString::generate`; it does not by itself make `rand_core 0.6::OsRng` available. That type separately requires `rand_core/getrandom` or `std` through the selected RNG dependency/feature unification. State both feature obligations and do not call the Argon2 line a complete manifest recipe for the shown `OsRng` call. Sources: [Argon2 0.5 features](https://docs.rs/crate/argon2/0.5.3/features) and [`rand_core::OsRng`](https://docs.rs/rand_core/0.6.4/rand_core/struct.OsRng.html). |
| `skill/SKILL.md:85,489`; compare `skill/lifetimes-and-api.md:15,59-62` and central trigger `:310` | The Round-13 narrowing now requires a **returned reference** captured in a longer-lived cache. `fn remember<'a>(s: &'a str, cache: &mut Vec<&'a str>) { cache.push(s); }` returns `()` but is exactly the laundering shape. Say “an input-derived borrow captured into a cache/container that outlives the call.” The ordinary `longest` false positive remains closed. Source: [Rust Book lifetime validation](https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html). |
| `skill/lifetimes-and-api.md:124`; compare `skill/SKILL.md:308`; mirror | The central trigger correctly treats `pub type PublicS = hidden::S;` as a naming path, but the unchanged module says nameability requires public modules or `pub use`. A downstream crate can name `crate_name::PublicS`, so the module still creates a false `unnameable_types` finding. Include public type aliases in the module definition. Sources: [Rust Reference type aliases](https://doc.rust-lang.org/reference/items/type-aliases.html) and [`unnameable_types`](https://doc.rust-lang.org/nightly/nightly-rustc/rustc_lint/builtin/static.UNNAMEABLE_TYPES.html). |
| `dev/validate.mjs:275-306`; `dev/validate-fixtures.mjs:250-285` | The leading-pipe state machine misses a pipe removed from a table header (`inTable` is still false) or delimiter (`tableColumns` is still zero); controls mutate body rows only. Its block-ending allowlist is also incomplete, so valid GFM starts such as HTML blocks and link-reference definitions are falsely reported as pipe-less rows. The diagnostic's claim that a pipe-less body row silently ends the table is itself false: GFM outer pipes are optional, so the row remains part of the table. Recognize header/delimiter/body state explicitly or use a GFM parser, and add header, delimiter, and representative block-start controls. Source: [GFM tables §4.10](https://github.github.com/gfm/#tables-extension-). |
| `dev/validate-fixtures.mjs:287-312` | The new prose controls cover only B2/B14, and the central B2 control scopes all of `SKILL.md`; every required token appears in both B2 rows, so reverting either row alone stays green because the other satisfies the check. C12 and the load-bearing F1 recursive/permutation rules still have no correction-sensitive control; B13, B1a, and security changes are also unpinned. Scope each central row independently and add narrow mutation/structural controls at least for C12 and F1. |
| `dev/validate-fixtures.mjs:115-158`; `dev/validate.mjs:352-353` | The curated-copy fix closes coupling to arbitrary worktree contents for the current manifest, but omits optional `.app.json`/`.mcp.json` inputs that the validator supports; a future valid manifest using them passes normally and fails every copied control. Copy these optional inputs when present. Source: [Node `fs.cpSync`](https://nodejs.org/api/fs.html#fscpsyncsrc-dest-options). |
| `dev/validate-fixtures.mjs:215-247` | The junction test catches every post-`symlinkSync` exception as “could not create the alias.” A regression in `makeTempRootOutside`, physical resolution, or the assertion is therefore silently converted into an environmental skip. Catch/skip only the expected link-creation failure and treat all later exceptions as test failures. |
| `skill/data-and-types.md:135`; mirror | The rule promises `collect::<HashMap>` is last-wins and `collect::<HashSet>` preserves the first representative. Current implementations flow through insertion, but the public `FromIterator` contract promises only that all but one equal key/item are dropped. Do not make survivor identity a stable contract: say duplicates coalesce and the survivor is unspecified; use an explicit, documented insertion/replacement loop when first/last wins is required. Sources: [HashMap `FromIterator` source/docs](https://doc.rust-lang.org/src/std/collections/hash/map.rs.html#3003-3017) and [HashSet `FromIterator`](https://doc.rust-lang.org/std/collections/struct.HashSet.html#impl-FromIterator%3CT%3E-for-HashSet%3CT,+S%3E). |
| `skill/data-and-types.md:9-20`; compare `skill/SKILL.md:299-402`; mirror | §B6 bans wildcard arms on ordinary owned application enums, but has no general phrase or code trigger. The only wildcard-enum trigger is protocol-specific §F1, so code-only input containing `_ => Ok(())`, `_ => unreachable!()`, or `_ => panic!()` on a normal enum never loads §B6. Add calibrated phrase triggers plus a non-protocol code-pattern row. Source: [Rust Reference `non_exhaustive`](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute). |

## Operational completeness

Commit `00d773b` correctly puts `docs/reviews/fix-plan-2026-08.md` in `HEAD`, closing the repository half of
Round 13's evidence finding. The package half remains open: shipped `CHANGELOG.md:11` promises full evidence
under `docs/reviews/`, while `package.json:9-17` excludes that entire directory. The dry-run tarball contains
zero review files. Either include the cited evidence or use stable tagged repository links.

The active `C:\Users\Computer\.agents\skills\rust-intel` installation matches the `7a567a6`/v0.6.0
baseline in 13/13 tracked skill files and current `d10427d` in 0/13. Reinstall and byte-verify only after the
normative corrections land. The pre-existing untracked `.githooks/` directory was not inspected as review
input, modified, or staged.

## Round-13 closure accounting

| Round-13 item | Status in `00d773b` / `d10427d` |
|---|---|
| Persisted corpus: repeated small domains | **Closed narrowly:** corpus-level one-hot vectors solve the same-type pigeonhole case. |
| Persisted corpus: nested branches | **Partial:** non-recursive reachable branches are explicit; cross-type wire collisions remain invisible and recursive depth is over-specified. |
| SCC/DashMap direct entry families | **Partial:** named direct types landed; mapped/multi/transitive guard shapes, expression-shape independence, and exact return types remain open. |
| `JoinSet` API and coupled admission | **Partial:** uncoupled drain and `Stream` wording are fixed; the new pre-insert inequality admits `N + 1`. |
| Direct password-hash vs Argon2 feature names | **Partial:** crate feature names are fixed; the shown `OsRng` provider still needs its own feature. |
| TOCTOU pure readers | **Closed.** |
| Multi-input `longest` witness | **Closed**, but replacement wording now misses cache-only functions returning `()`. |
| Public type-alias nameability | **Partial:** central trigger fixed; module remains contradictory. |
| Different-width leading-pipe rows | **Closed for body rows**; header/delimiter and block-ending cases remain open. |
| Whole-worktree mutation copies | **Closed for the current manifest**; optional validator inputs and broad junction skip remain. |
| Semantic regression controls | **Partial:** B2/B14 presence checks landed; B2 row isolation, C12, and F1 remain open. |
| Fix-plan evidence | **Closed in `HEAD`; open in the npm package.** |
| Active Codex installation | **Open:** still v0.6.0-era content. |

## Ten-module coverage record

| Module | Round-14 result |
|---|---|
| Async | Map-guard activation remains incomplete and producer signatures are inaccurate; cancellation, blocking, and task-lifecycle rules show no regression. |
| Unsafe / FFI | Clean in the reviewed state; ABI, panic containment, ownership, callback, thread-safety, and Miri guidance remain closed. |
| Concurrency / state | `JoinSet` cap is off by one; direct SCC/DashMap additions are only partial. TOCTOU correction is closed. |
| Data / types | Cross-type wire observability defect; `FromIterator` survivor behavior is overclaimed; §B6 lacks general activation. Other Round-13 data corrections remain closed. |
| Security | Public feature-name split is correct; complete `OsRng` feature closure is not. Other security boundaries show no regression. |
| Drop / RAII | Clean; rollback precedence, destructor order, shutdown, exit, recursion, and edition-2024 scope rules remain closed. |
| Dependencies / macros / ergonomics | C12 rule text is closed and current; its correction-sensitive regression control remains absent. No new dependency/build/proc-macro defect. |
| Lifetimes / API | Ordinary multi-input return fix is closed; cache-only laundering and public type-alias module consistency remain open. |
| Testing | Body-width and curated-copy fixes landed, but table parsing, semantic controls, optional inputs, and junction error classification remain incomplete. |
| Semantics / conformance | Non-recursive nested coverage and same-type small-domain vectors improved; byte/decode observability and finite recursive coverage remain unresolved. |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files and 2 fixture cases |
| JS syntax checks | PASS — both validators, shipped audit/review workflows, and both installers |
| `git diff --check 9a873ff..d10427d` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — shipped mirrors are byte-identical |
| `npm pack --dry-run --json` | PASS — 37 entries; 594,436 bytes packed; 1,645,331 unpacked; integrity `sha512-Kqrn7z5NxjMBiZxJ1dCl+Zk3gYJidVhrZjl6hdytvPa3xMRt+7hf9xgKlWMgUdSMqQHeCN2cH1dcjHcGv4BTiA==` |
| Fix-plan object in `HEAD` | PASS — `docs/reviews/fix-plan-2026-08.md` is tracked |
| Review evidence in npm tarball | FAIL — zero `docs/reviews/*` entries |
| Active Codex skill parity | FAIL — 13/13 installed tracked files match `7a567a6`/v0.6.0; 0/13 match `d10427d` |
| Repository Cargo checks | Not applicable — no `Cargo.toml`; version-sensitive Rust/crate claims were checked against primary docs |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

## Recommended correction order

1. Replace typed value-vector uniqueness with a byte/decode-observable permutation oracle and define
   recursive coverage over the finite schema graph.
2. Make concurrent-map activation semantic and transitive, correct all producer signatures, then fix the
   `JoinSet` admission inequality and the complete Argon2/OS-RNG feature recipe.
3. Reconcile B1a and public-alias wording between central and module rules; correct collection survivor
   guarantees and add a general §B6 activation path.
4. Repair the table state machine, scope controls to individual rules/rows, add F1/C12 controls, include
   optional validator inputs, and distinguish link-creation skips from failures in the junction control.
5. Make packaged review evidence resolvable, then reinstall and byte-verify the active Codex skill.
