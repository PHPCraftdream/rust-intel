# Round 13 review of the latest commits — 2026-09-03 13:47 CEST

- Commit range: `2773b82800a59fb4f84934353e98cfb9ae2953ee..5417d3cae48387e285f532fbabbe9dad75ee6e10`
- Implementation commit reviewed: `5417d3c` — `rust-intel: correctness fixes from round-12 independent review`
- Delta: 10 files, 74 insertions, 33 deletions
- Pre-existing untracked paths excluded: `.githooks/` and `docs/reviews/fix-plan-2026-08.md`
- Method: one pass over each of the ten normative modules, central trigger/tier review, Round-12 closure accounting, primary documentation/API checks, canonical/package-mirror comparison, validator/fixture/packaging checks, active-install comparison, and a separate synthesis pass
- Verdict: **REQUEST CHANGES**

`5417d3c` closes both conditional-P1 findings from Round 12 and most of that round's smaller precision
issues. Positional removals now activate §F1; the prior-release corpus and multi-layout version dispatch are
correctly layered; C12 accepts either raw-event removal or rendered-output sanitization; covered-type and
DashMap-lock wording are improved; and the leading-pipe convention gained real enforcement plus a negative
control. Validation, syntax, mirror, whitespace, and package checks all pass.

The correction is nevertheless incomplete. The `JoinSet` rewrite introduces a nonexistent API claim and
contradicts its own bounded-admission remedy. Concurrent-map activation still misses lock-owning SCC and
DashMap entry values. Most importantly, the persisted-layout corpus is infeasible for repeated small
domains and can omit nested enum branches. Several lower-severity false positives and validation gaps also
remain. The corpus defect is conditional-P1 where deployed bytes are at risk, and the guard-activation gap
is P2, so another correction commit is required before release.

## Executive result

- **One conditional-P1 finding:** the corpus contract remains infeasible for repeated small domains and
  ambiguous/incomplete for nested layout branches. It is P1 only when deployed persisted/wire bytes are at
  risk; otherwise it is a specification-quality defect.
- **One P2 finding:** SCC/DashMap guard-type activation remains incomplete and contains incorrect API
  attribution.
- **Seven P3 findings:** residual `JoinSet` wording/API errors, password-hash/Argon2 feature-name
  conflation, an overbroad TOCTOU exemption, an inapplicable §B1a witness, GFM-valid leading-pipe false
  negatives, absent semantic regression controls, and mutation-fixture coupling to arbitrary worktree
  contents.
- Repository structure is healthy, but the cited fix plan is still absent from `HEAD`/the package and the
  active Codex installation still matches the v0.6.0 baseline rather than current `HEAD`.

## Conditional P1 finding

### Persisted-layout corpus remains infeasible and can omit reachable layout branches

Locations: `skill/SKILL.md:406`, `skill/semantics-and-conformance.md:19`, and mirrors.

The singleton/ZST exception is correct but too narrow. The rule still demands values that are both
non-default and non-equal at every meaningful position. For three `bool` fields, `true` is the only
non-default value; `{ true, true, true }` cannot detect any reorder. The same pigeonhole failure occurs
whenever repeated positions outnumber a small domain's available distinct non-default values.

Coverage is also stated around persisted top-level types without unambiguously requiring every layout
branch recursively reachable from them. With `struct Record { inner: Inner }` and
`enum Inner { A, B, C }`, one `Record { inner: A }` can satisfy the literal top-level-struct requirement;
reordering `Inner::B` and `Inner::C` then leaves the fixture green while old records silently change meaning.

Define distinguishability across the **whole corpus**, allow defaults where necessary, and require each
reorderable position to have a unique value-vector across fixtures. For booleans, one-hot records such as
`100`, `010`, and `001` detect every swap. Require every serialized branch recursively reachable from each
persisted root — especially every nested enum variant — in at least one enclosing prior-release golden
fixture. Exact golden bytes still pin singleton/zero-byte positions.

This is conditional-P1 where a changed layout has deployed persisted/wire bytes: an apparently compliant
corpus can stay green while old data is reinterpreted. Sources:
[Bincode 2 specification](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md) and
[Borsh specification](https://borsh.io/).

## P2 findings

### Concurrent-map activation still omits lock-owning entry values

Locations: `skill/async.md:17`, `skill/SKILL.md:206,304`, and mirrors.

The SCC rule names only `Entry` and `OccupiedEntry`. `VacantEntry` also owns the locked bucket, and
`ReplaceResult` contains either an `OccupiedEntry` or `VacantEntry`; destructuring or retaining either value
across `.await` evades the stated type-based trigger.

The same row says DashMap `entry()` yields `RefMut` and limits its detailed guard list to `Ref`/`RefMut`.
In fact, `entry()` and `try_entry()` return `dashmap::mapref::entry::Entry`, whose occupied/vacant variants
own the shard write guard. A live entry value can therefore be the deadlocking guard even before an
`or_insert*` conversion produces `RefMut`.

Trigger semantically on every live guard-bearing value, including SCC `Entry`, `OccupiedEntry`,
`VacantEntry`, and `ReplaceResult`, plus DashMap `mapref::entry::{Entry, OccupiedEntry, VacantEntry}` and
`mapref::one::{Ref, RefMut}`. Treat producer methods as pinned-major examples, not the definition. Sources:
[SCC `VacantEntry`](https://docs.rs/scc/latest/scc/hash_map/struct.VacantEntry.html),
[SCC `ReplaceResult`](https://docs.rs/scc/latest/scc/hash_map/enum.ReplaceResult.html), and
[DashMap `entry`](https://docs.rs/dashmap/latest/dashmap/struct.DashMap.html#method.entry).

## P3 findings

| Location | Finding and required correction |
|---|---|
| `skill/SKILL.md:369`; `skill/concurrency-and-state.md:125`; mirrors | The core hard-cap correction landed, but the text says no removal operation, "however promptly" run, can bound occupancy. Starting empty, `spawn; join_next().await` before the next admission peaks at one and is exactly the later recommended admission gate. Current Tokio also does not implement `Stream` for `JoinSet`; use `poll_join_next*`. Say that draining **without an insertion gate** is not a cap and keep the `len <= N` invariant. Source: [Tokio `JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html). |
| `skill/security.md:42`; mirror | The 0.5 recipe groups `argon2` and direct `password-hash` under the feature name `rand_core`. Direct `password-hash` 0.5 exposes `rand_core`; `argon2` 0.5 exposes the public feature `rand`, which forwards to `password-hash/rand_core`. With `argon2 = { default-features = false, ... }`, enabling `argon2/rand_core` is invalid. Split the manifest advice: `password-hash/rand_core` for a direct 0.5 dependency, `argon2/rand` through Argon2. The central row, which speaks only about `password-hash`, is correct. Sources: [password-hash 0.5 features](https://docs.rs/crate/password-hash/0.5.0/features), [Argon2 0.5 features](https://docs.rs/crate/argon2/0.5.3/features). |
| `skill/SKILL.md:316`; mirror | The TOCTOU exemption requires every path that can *read or write* the checked state to use the same exclusive guard. A pure linearizable reader cannot win a check-then-act race and need not take the initializer/writer lock. Require the discipline for mutators and paths that independently make the same check-act decision; include readers only when the documented invariant forbids observing intermediate multi-step state. |
| `skill/SKILL.md:85,489`; mirror; compare `skill/lifetimes-and-api.md:59-62` | The §B1a cache-after-drop witness is required for every function whose returned reference is tied to multiple inputs. Rust's ordinary `longest<'a>(x: &'a str, y: &'a str) -> &'a str` has no longer-lived container, so that witness is inapplicable. Restrict this witness to actual lifetime capture into a cache/container; use an ordinary call-site example for multi-input returns if desired. Source: [The Rust Book, lifetime syntax](https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html). |
| `dev/validate.mjs:293-298`; `dev/validate-fixtures.mjs:227-241` | Missing-leading-pipe detection fires only when the reconstructed row has exactly the previous row's cell count. GFM permits body rows with fewer cells (padded) or more cells (excess ignored), so those valid rows still flush the table and escape enforcement. Track the recognized table from its header/delimiter and check the convention independently of body width; add fewer/excess-cell mutations. Source: [GFM tables §4.10](https://github.github.com/gfm/#tables-extension-). |
| `dev/validate-fixtures.mjs:5-9,21-26,48-51,244-250`; `examples/fixtures/cases.json:1-9` | Behavioral fixtures still detect only B5 and B26. Control 5 proves parser enforcement, not the corrected JoinSet, map-guard, C12, or persisted-layout semantics; reverting those rules in canonical and mirror files remains green. Add narrow mutation or compiler-backed controls for each changed load-bearing invariant without pinning entire prose paragraphs. |
| `dev/validate-fixtures.mjs:112-121` | Each mutation copies the entire working tree and handles unrelated locked/generated/untracked paths through a growing exclusion list. Another locked Windows artifact or a large generated directory can fail or slow validation before the controlled mutation runs; the new `.rush` exception is a symptom, not a general boundary. Copy an explicit allowlist of inputs consumed by `validate.mjs`, or tracked files plus explicitly required generated inputs. The line-5 comment should also be updated: the file now has five controls, not "two." Source: [Node `fs.cpSync`](https://nodejs.org/api/fs.html#fscpsyncsrc-dest-options). |

## Operational completeness

This is not a normative-rule severity finding, but delivery remains incomplete. `CHANGELOG.md:11` and
`docs/reviews/README.md:12-14` cite `docs/reviews/fix-plan-2026-08.md`, which is absent from `HEAD`; the
worktree copy is untracked and user-owned. The npm tarball includes the citing changelog but no
`docs/reviews/*`. The active `C:\Users\Computer\.agents\skills\rust-intel` matches the `7a567a6`/v0.6.0
baseline in 13/13 tracked skill files and current `HEAD` in 0/13. Commit or withdraw the cited plan, make
shipped evidence resolvable, and reinstall/byte-verify Codex only after normative corrections land.

## Round-12 closure accounting

| Round-12 item | Status in `5417d3c` |
|---|---|
| §F1 positional variant/field removals | **Closed**: removals now activate the central rule. |
| §F1 prior corpus plus multi-layout version/dispatch | **Closed**: the controls are layered rather than alternatives. |
| `JoinSet` hard bounded admission | **Partial/overcorrected**: cap language landed, but prompt admission-coupled removal is denied and a nonexistent Stream API is named. |
| SCC guard-type coverage | **Partial**: method-origin dependence improved; `VacantEntry`/`ReplaceResult` remain absent. |
| C12 raw-event removal vs sanitization | **Closed**: either valid branch plus the independent URL defense is represented centrally. |
| Covered-type locality/fundamental constructors | **Closed**. |
| Persisted singleton/ZST markers | **Closed narrowly**: singleton positions are handled; repeated small domains and nested variants remain open. |
| DashMap RwLock terminology | **Closed**; entry-family type coverage remains incomplete. |
| B13 competing-access qualification | **Partial**: unrelated keys are excluded, but pure readers are still unnecessarily locked. |
| password-hash 0.5 version boundary | **Partial**: 0.5 is now exact, but the direct-dependency feature is incorrectly presented as Argon2's feature too. |
| Leading-pipe validator enforcement | **Partial**: ordinary equal-width rows are caught; GFM-valid different-width rows still escape. |
| Behavioral regression fixtures | **Open/unchanged**. |
| Release evidence and active Codex installation | **Open/unchanged**. |

## Ten-module coverage record

| Module | Round-13 result |
|---|---|
| Async | Cancellation and JoinHandle corrections remain closed; no new async-module finding. |
| Unsafe / FFI | No target-delta finding; callback, ownership, panic-boundary, export, and Miri guidance remains closed. |
| Concurrency / state | `JoinSet` contradiction/API error; SCC and DashMap entry guards missing; TOCTOU pure-reader false positive. |
| Data / types | Ord/BTree and regex-budget corrections remain closed; no new finding. |
| Security | Direct password-hash vs Argon2 feature spelling remains conflated. |
| Drop / RAII | No target-delta finding; rollback, error precedence, caught-panic, and exit cleanup remain closed. |
| Dependencies / macros / ergonomics | C12 is now reconciled; dependency/build/proc-macro rules show no regression. |
| Lifetimes / API | Covered-type and public-alias fixes are closed; the pre-existing multi-input §B1a witness remains overbroad. |
| Testing | Leading-pipe enforcement is partial; semantic fixtures and mutation-harness isolation remain incomplete. |
| Semantics / conformance | Removal and layered-control gaps closed; repeated-domain markers and nested layout branches remain incomplete. |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files and 2 fixture cases |
| JS syntax checks | PASS — both validators, shipped audit/review workflows, and both installers |
| `git diff --check 2773b82..5417d3c` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — all 12 top-level shipped files byte-identical; nested reference is present in both trees |
| `npm pack --dry-run --json` | PASS — 37 entries; 590,810 bytes packed; 1,634,287 unpacked; integrity `sha512-Oz/7ayKPlGlxk7jTsX/Lyt3qvHdFOIgjjUzWsAY5e56OejWGoCQZDovJmQ0xYYzl3KLtXpwNWc8ws/usBEcprw==` |
| Fix-plan object in `HEAD` | FAIL — `docs/reviews/fix-plan-2026-08.md` is absent |
| Review evidence in npm tarball | FAIL — zero `docs/reviews/*` entries |
| Active Codex skill parity | FAIL — 13/13 installed tracked skill files match `7a567a6`/v0.6.0; 0/13 match `5417d3c` |
| Repository Cargo checks | Not applicable — no `Cargo.toml`; version-sensitive Rust/crate claims were checked against primary docs |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

## Recommended correction order

1. Define persisted-layout distinguishability across a multi-fixture corpus and require recursive coverage
   of every reachable serialized layout branch.
2. Complete semantic guard-type activation for SCC and DashMap, then resolve the cited fix-plan/package
   evidence gap.
3. Make leading-pipe enforcement independent of body width, isolate mutation fixtures from unrelated
   worktree contents, and add regression controls for the corrected high-risk families.
4. Correct the `JoinSet` description, split direct password-hash and Argon2 feature recipes, and narrow the
   TOCTOU and §B1a witness conditions.
5. Reinstall and byte-verify the active Codex skill only after the normative corrections land.
