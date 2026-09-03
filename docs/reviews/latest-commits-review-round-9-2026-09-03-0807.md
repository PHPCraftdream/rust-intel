# Round 9 review of the latest changes — 2026-09-03 08:07 CEST

- **Committed base:** `44e31aa2b2861c7d0acbd8fb43e2ef413f14dcb0` (`docs: add round 8 review of latest commits`)
- **New implementation commits after the base:** none (`git rev-list --count 44e31aa..HEAD` = `0`)
- **Actual review subject:** the unstaged remediation snapshot on top of `44e31aa`
- **Snapshot identity:** `git diff --binary --no-ext-diff | git hash-object --stdin` = `f8922e1ad32170bef13c4d3097f40074fc9362a4`
- **Snapshot size:** 25 tracked files, 146 insertions, 98 deletions
- **Excluded pre-existing untracked work:** `.githooks/` and `docs/reviews/fix-plan-2026-08.md`
- **Method:** one focused pass over each of the ten normative modules, central trigger/tier and mirror review, current primary-source verification, ordinary repository checks, Windows path negative controls, installation/package integration checks, then a separate synthesis pass
- **Verdict:** **REQUEST CHANGES**

There is no newer implementation commit to review after Round 8. To avoid reporting the documentation-only
`44e31aa` as if it contained the fixes, this round reviews the current remediation patch and identifies it by
its Git diff hash. The patch closes many Round-8 defects and keeps the two distributed skill trees in sync,
but it is not ready to become the implementation commit. Three canonical red paths remain incomplete, several
recipes are non-compiling or nondeterministic, central activation remains weaker than the corrected module
text, and the fixture's new path guard is bypassed by a Windows junction.

## Executive result

- **Three conditional P1 paths remain:** the FFI allow-list does not model nullable/caller-unsafe callbacks,
  and code-only unbounded `JoinSet` growth or dropped `spawn_local` handles can miss canonical red enforcement.
- **The most concrete tooling regression is reproduced:** direct repository-local `TEMP` is handled, but a
  junction alias to the same directory defeats the lexical containment test and causes recursive self-copy.
- **Four replacement recipes are still operationally wrong:** paused-time counter acknowledgement can race,
  `assert_matches!` is shown without its required import, the rollback example can replace the primary error,
  and the module-local Miri command can omit unsafe workspace members.
- **Central trigger coverage is still incomplete:** `spawn_local`, unbounded `JoinSet`, SCC guards, public API
  leakage, and persisted-layout migration can evade or weaken the corrected module rules.
- **Evidence/deployment is unchanged:** the cited fix plan is absent from `HEAD`, npm omits the cited reports,
  and the active Codex installation still matches the old `7a567a6` baseline in all 11 normative files.
- **Ordinary checks are green:** JavaScript syntax, `npm run validate`, mirror parity, whitespace, and npm pack
  all pass. They do not cover the counterexamples below.

## Conditional P1 findings

### FFI callback types still omit nullability and caller-side safety

**Location:** `skill/unsafe-and-ffi.md:37` and its package mirror.

The revised allow-list correctly requires an explicit C ABI, but permits only `extern "C" fn(...)`. A Rust
function pointer is non-null, so a nullable C callback must cross the boundary as
`Option<extern "C" fn(...)>`; accepting a C null as a bare function pointer is invalid. The list also omits
`unsafe extern "C" fn(...)`, which is the correct type when invoking the callback has caller preconditions.
This becomes P1 when generated boundary code trusts the incomplete type recipe and creates an invalid function
pointer or exposes a preconditioned callback as safely callable.

Permit both safe and unsafe explicit-ABI function pointers, and require `Option<...>` whenever the foreign
contract admits null. See the standard library's [function-pointer safety and ABI rules](https://doc.rust-lang.org/std/primitive.fn.html)
and the guaranteed nullable-pointer representation of [`Option<extern "C" fn>`](https://doc.rust-lang.org/std/option/#representation).

### Unbounded `JoinSet` growth is red in policy but absent from structural activation

**Location:** `skill/SKILL.md:100,362` and its package mirror.

Tier metadata now correctly makes unbounded `JoinSet` growth a surface-always §B14 finding, but the structural
trigger still recognizes only `FuturesUnordered`. Code containing repeated `JoinSet::spawn`, `spawn_local`, or
`spawn_blocking` without a cap/drain can therefore avoid loading the module and suppress a canonical red finding.
This is conditional P1 when the set really can grow without bound; bounded or continuously drained use is not
the defect. Add all `JoinSet` spawning forms to structural activation with those cap/drain conditions.
[`JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html).

### Dropped `spawn_local` handles evade the canonical red supervision rule

**Location:** `skill/async.md:149-150,284`; `skill/SKILL.md:103,306` and their package mirrors.

The module now correctly allows executor-appropriate `spawn_local`, but the surface-always §B21 summary and
structural trigger cover only `tokio::spawn`. Dropping a handle returned by `tokio::task::spawn_local` or
`LocalSet::spawn_local` also detaches the task. This is conditional P1 when the handle is actually discarded
without awaiting, supervision, or an explicit detached-by-design contract. Apply §B21 to every Tokio spawning
API that returns a `JoinHandle`. [`spawn_local`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_local.html).

## P2 findings

### Tooling and integration

| Location | Finding | Required correction |
|---|---|---|
| `dev/validate-fixtures.mjs:76-83` | `path.resolve` checks lexical paths only. With `TEMP=D:\\dev\\rust\\.round9-tmp-alias`, where that path is a junction to `D:\\dev\\rust\\rust-intel\\.round9-tmp-real`, the validator exits 1 after recursively copying the repository into itself. | Resolve the physical source and candidate with `fs.realpathSync.native`/`realpathSync` before a case-aware containment check; verify the sibling fallback too. Add a junction/symlink negative control. [`path.resolve`](https://nodejs.org/api/path.html#pathresolvepaths), [`fs.realpathSync`](https://nodejs.org/api/fs.html#fsrealpathsyncpath-options). |
| `CHANGELOG.md:11,21`; `package.json:7-18`; active installation | The Round-8 evidence/deployment gap is untouched: `docs/reviews/fix-plan-2026-08.md` is not an object in `HEAD`; npm ships the changelog but zero `docs/reviews/*` entries; installed `C:\\Users\\Computer\\.agents\\skills\\rust-intel` matches baseline `7a567a6` in 11/11 normative files and this snapshot in 0/11. | Commit or withdraw the cited plan; include reports or stable repository URLs in the package; after normative fixes land, reinstall and byte-verify the Codex skill. |

### Async, concurrency, and resource bounds

| Location | Finding | Required correction |
|---|---|---|
| `skill/async.md:17,21`; `skill/SKILL.md:205` | The central rule still describes every concurrent-map guard as a DashMap-style shard guard and names only `entry()`/`get()`. SCC has different locking/API semantics; notably `get_async` yields an exclusive occupied entry that can self-deadlock across another await. | Split DashMap and SCC wording, call the common object a map guard, and cover SCC's `*_async` and `*_sync` entry/guard APIs. [`scc::HashMap`](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html). |

### Unsafe, FFI, and cleanup

| Location | Finding | Required correction |
|---|---|---|
| `skill/unsafe-and-ffi.md:29`; compare `skill/SKILL.md:509` | The central post-flight correctly changed Miri to `--workspace`, but the normative module still prescribes bare `cargo +nightly miri test`, which can omit unsafe members of a non-virtual workspace. | Use `cargo +nightly miri test --workspace` or enumerate the relevant packages. [Cargo package selection](https://doc.rust-lang.org/cargo/commands/cargo-test.html#package-selection), [Miri usage](https://github.com/rust-lang/miri#using-miri). |
| `skill/drop-and-raii.md:15` | The paragraph explains that `rollback().await?` can replace the primary operation failure, then still marks that exact expression as REQUIRED. | Match the rollback result explicitly: return the primary error on successful rollback and preserve both errors when rollback also fails. [`?` propagation](https://doc.rust-lang.org/core/result/#the-question-mark-operator-). |

### Data, dependencies, and security

| Location | Finding | Required correction |
|---|---|---|
| `skill/data-and-types.md:33` | The regex policy remains internally inconsistent: all backtracking engines are banned without an engine-native interrupt, while the same rule permits a killable subprocess. For Rust `regex`, a one-shot search is bounded by pattern/haystack/compiled-size limits, but iterator searches may require a match/application budget; `dfa_size_limit` limits the DFA cache, not the compiled program. | Separate linear `regex` from backtracking engines. Bound pattern, haystack and `size_limit`; additionally bound iterator match/application work. Require an engine interrupt/step limit or killable process for backtracking. [`regex` untrusted-input guidance](https://docs.rs/regex/latest/regex/#untrusted-input), [`RegexBuilder`](https://docs.rs/regex/latest/regex/struct.RegexBuilder.html). |
| `skill/deps-macros-ergonomics.md:51` | The recipe treats `cargo deny check advisories` as a red gate for yanked packages, but cargo-deny's default is `yanked = "warn"`. A locked yanked dependency may remain; Cargo does not itself promise a failing diagnostic. | Configure `yanked = "deny"`, or use an equivalently failing `cargo audit` policy; describe Cargo's documented locked-yanked resolution behaviour without promising a warning. [Cargo yanked versions](https://doc.rust-lang.org/cargo/reference/resolver.html#yanked-versions), [cargo-deny advisories config](https://embarkstudios.github.io/cargo-deny/checks/advisories/cfg.html). |
| `skill/SKILL.md:202`; compare `skill/security.md:34` and `skill/SKILL.md:455` | The short security-randomness trigger still recommends version-unqualified `StdRng::from_os_rng()`, removed in rand 0.10, despite the detailed migration note being correct. | Make the short recipe version-aware or simply require OS-backed entropy; for rand 0.10 use `StdRng::try_from_rng(&mut SysRng)` or `rand::make_rng::<StdRng>()`. [current `StdRng`](https://docs.rs/rand/latest/rand/rngs/struct.StdRng.html), [rand 0.10 migration](https://rust-random.github.io/book/update-0.10.html). |

### Testing and CI recipes

| Location | Finding | Required correction |
|---|---|---|
| `skill/testing.md:30` | The construction handshake and first-tick accounting are fixed, but “a shared counter checked after each `advance`” is not an acknowledgement: `advance` need not wait for expired-timer tasks to finish. An immediate load can still observe the old value; bare `Notify` can coalesce notifications. | Await a lossless per-tick acknowledgement (`mpsc`/watch sequence or fresh oneshot), including the immediate first tick, before the next advance. [`advance` caveat](https://docs.rs/tokio/latest/tokio/time/fn.advance.html), [`Notify` permit semantics](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html). |
| `skill/testing.md:31` | The Rust ≥1.96 branch calls unqualified `assert_matches!`, but the macro is not in the prelude, so the copyable recipe does not compile without an import. | Include `use std::assert_matches;` (or use the qualified macro path). [`assert_matches!`](https://doc.rust-lang.org/std/macro.assert_matches.html). |
| `skill/testing.md:26` | General `pause()`/`advance()` guidance omits the `time,test-util` feature requirements and the current-thread runtime requirement; explicit `pause()` on a multi-thread runtime panics. | Prefer `#[tokio::test(start_paused = true)]` on the default/current-thread runtime with both features, or use explicit synchronization where those prerequisites do not hold. [`tokio::time::pause`](https://docs.rs/tokio/latest/tokio/time/fn.pause.html). |

### Semantics and public API

| Location | Finding | Required correction |
|---|---|---|
| `skill/SKILL.md:397` | Persisted-layout activation is suppressed by “a version bump or golden-bytes fixture.” A Cargo/package semver bump is not present in old bytes and cannot stop an old ordinal tag from being reinterpreted. | Require an explicit on-wire/on-disk format version with migration/rejection policy, or a passing previous-release golden decode fixture when claiming compatibility. [bincode enum encoding](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md#L678-L710). |
| `skill/lifetimes-and-api.md:87-92` | The sealing snippet uses `mod sealed { pub trait Sealed {} }`, which triggers `unnameable_types`, not `private_bounds`; the prescribed `#[allow(private_bounds)]` does not make the recommended lint configuration pass. This was probed on rustc 1.85, 1.87, 1.93, 1.96 and 1.97. | Either allow/document `unnameable_types` narrowly on the public trait inside the private module, or make it `pub(crate)` and narrowly allow `private_bounds` on the public supertrait. [`private_bounds`](https://doc.rust-lang.org/stable/rustc/lints/listing/warn-by-default.html#private-bounds), [`unnameable_types`](https://doc.rust-lang.org/stable/rustc/lints/listing/allowed-by-default.html#unnameable-types). |
| `skill/lifetimes-and-api.md:124` | The text first excludes every `pub` item behind a private ancestor from public API, then correctly admits that the same item can leak through a public signature. It says such leakage fails reachability, but rustc counts signature leakage as reachable; that is why `unreachable_pub` misses it. | Define reachability as direct access, re-export, **or signature leakage**; reserve “internal” for items satisfying none of them, and use `unnameable_types` for reachable-but-unimportable leakage. [`unreachable_pub`](https://doc.rust-lang.org/stable/rustc/lints/listing/allowed-by-default.html#unreachable-pub). |
| `skill/lifetimes-and-api.md:111` | Preserving public tuple indices fixes field-access compatibility, but “a new private field is safe” is still false: a new `Rc<()>` after the last public index can remove `Send`/`Sync` without moving `.0`. | Call the index rule tuple-field-access compatibility only; separately preserve auto traits, derived/public trait behaviour, and documented layout/ABI guarantees. [Cargo SemVer guide](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private), [`auto_trait_impl_removed`](https://github.com/obi1kenobi/cargo-semver-checks/blob/main/src/lints/auto_trait_impl_removed.ron). |
| `skill/SKILL.md:203,298,305,328` | The corrected public-surface rules still lack activation for their defining inputs. `E0603`, “make visible/re-export”, a leaked private type in a `pub fn`, or the B1a shared input/cache lifetime shape can avoid loading the module. | Add phrase triggers for visibility/re-export errors and code triggers for unnameable/non-`'static` public signatures and the B1a short-lived-source/cache shape. |

## P3 findings

| Location | Finding and correction |
|---|---|
| `skill/SKILL.md:311` | The TOCTOU trigger is still broader than the actual bug: `if value.is_valid() { shared_map.insert(...) }` is not check-then-act merely because the map is shared. Require a predicate over mutable shared state whose truth the later operation relies on. |
| `skill/data-and-types.md:32,212` | aHash and foldhash are still conflated. Default randomized aHash documents DoS resistance; the adaptive-warning language applies to foldhash. Scope warnings to the actual hasher/seeding contract. [`aHash::RandomState`](https://docs.rs/ahash/latest/ahash/random_state/struct.RandomState.html), [foldhash](https://docs.rs/foldhash/latest/foldhash/). |
| `skill/unsafe-and-ffi.md:106` | The text says to scope the `Box<T>` exception to exports, then admits imports with a full allocator/layout/validity/ownership proof. State the default and exceptional import proof directly rather than contradicting the scope sentence. |
| `skill/unsafe-and-ffi.md:117-118`; `skill/drop-and-raii.md:21` | A result-returning `Write` call is not guaranteed not to panic because a custom `Write` implementation may panic. Require a specifically audited non-panicking sink and handle its `Result`, or omit the diagnostic. Say “second panic” only when an outer unwind is already active. [`Write::write_fmt`](https://doc.rust-lang.org/std/io/trait.Write.html#method.write_fmt). |
| `skill/async.md:310`; `skill/SKILL.md:178,321` | “Any side effect” in a `select!` arm overstates the rule; atomic, idempotent, transactional, or otherwise recoverable progress can be cancel-safe. Trigger on unrecoverable partial progress in a losing polled future. [Tokio cancellation safety](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety). |
| `skill/async.md:215`; `skill/SKILL.md:211` | The lead wording still implies every manual future must store a cloned waker. The actual obligation is to arrange a re-poll; storage is required when the future owns an external completion source. [`Future::poll`](https://doc.rust-lang.org/std/future/trait.Future.html#tymethod.poll). |
| `skill/SKILL.md:248` | The phrase trigger still treats a generic “wait for signal” as the multi-waiter `enable()` race. Scope it to concurrent condition-check waiters or `notify_waiters` registration; the structural trigger at line 350 already makes this distinction, and documented single-consumer `notified().await` is not itself defective. [`Notify`](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html). |
| `skill/SKILL.md:355`; `skill/async.md:145` | The oneshot structural trigger still flags every discarded send result although the module now permits documented best-effort delivery. Distinguish contractual delivery/value recovery from explicitly best-effort sends. [`oneshot::Sender::send`](https://docs.rs/tokio/latest/tokio/sync/oneshot/struct.Sender.html#method.send). |
| `skill/deps-macros-ergonomics.md:88` | The module still says unknown feature names “never warn”, contradicting the corrected central trigger. Rust 1.80+ checks Cargo cfg names by default; CI must promote `unexpected_cfgs` if a warning is insufficient. [Cargo-specific cfg checking](https://doc.rust-lang.org/stable/rustc/check-cfg/cargo-specifics.html). |
| `skill/SKILL.md:509-512` | The corrected Miri comment cites §D4 for package selection, but §D4 is output-pipeline handling. Cite §C10/Cargo package selection, optionally §D3 for configuration coverage. |
| `skill/SKILL.md:292` | The slowloris phrase row still treats the absence of a separate absolute deadline as the defect, despite the module correctly allowing a rate floor combined with a finite size/duration bound. Say “no finite stage-lifetime bound.” [Apache `mod_reqtimeout`](https://httpd.apache.org/docs/2.4/mod/mod_reqtimeout.html). |
| `skill/SKILL.md:395` | Cancelled `read_exact` does not necessarily “lose” bytes: it may consume input and partially modify the buffer without reporting the valid prefix length, so retrying can misalign framing. Use that exact consequence. [`AsyncReadExt::read_exact`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncReadExt.html#method.read_exact). |
| `skill/SKILL.md:305` | “Blanket form covering an open type parameter” is ambiguous and reverses Reference terminology. Say “an impl containing an **uncovered** type parameter” and include a non-self-`T` positive and covered negative example. [Rust blanket implementations](https://doc.rust-lang.org/reference/glossary.html#blanket-implementation). |
| `dev/validate-fixtures.mjs:5-9,21-26,48-51` | The fixture suite intentionally has no semantic trigger/recipe witnesses, so all cross-text failures above remain green. Add compiler-backed and source-level positive/negative probes for the repaired high-risk rules, especially FFI callbacks, spawning, sealing/reachability, tuple auto-traits, virtual time, and persisted formats. |

## Round-8 closure accounting

| Round-8 area | Round-9 status |
|---|---|
| Security-sensitive RNG activation | **Core closed**: phrase and code activation now cover security output and deterministic/`SmallRng` use. The short constructor recipe remains P2-stale for rand 0.10. |
| Slowloris minimum-rate bypass | **Core closed**: rate now needs finite size/duration. Phrase/read-exact wording has two P3 residues. |
| FFI `char`, Rust-ABI function pointer, enum representation | **Partial**: `char`, bare Rust-ABI pointers, and every enum representation are corrected; nullable/unsafe callbacks remain conditional P1. |
| Caught-panic payload/reporting | **Partial**: borrowed downcast and unknown-payload containment are present; the proposed `Write` sink still lacks a no-panic proof. |
| oneshot best-effort calibration | **Module closed; trigger partial**. |
| SCC guard model | **Partial**: module improved; central wording/activation remains DashMap-specific. |
| executor-appropriate spawning | **Partial**: `spawn_local` is allowed, but red supervision does not activate for it. |
| nested `block_on` outcomes | **Closed**. |
| empty `FuturesUnordered` spin | **Closed**. |
| unbounded `JoinSet` red metadata | **Partial**: tier list closed, structural trigger missing. |
| regex/backtracking policy | **Partial**: direction improved, exact budgets/interrupt alternatives remain inconsistent. |
| public reachability, sealing, blanket impl, tuple structs | **Partial/not correctly closed**, as detailed above; B1a witness and enum/variant `non_exhaustive` distinctions are correct. |
| stale `build.rs` inputs | **Closed**: central structural activation was added. |
| SQLx and command-argv calibration | **Closed**. |
| paused time and `assert_matches!` | **Partial**: construction/first-tick/MSRV/partial-move fixes closed; acknowledgement, import, and runtime/features remain open. |
| workspace Miri | **Central closed; module partial**. |
| Markdown count wrappers | **Closed for `**`, `__`, `*`, `_`, and backticks**, with a new underscore coexistence control. |
| repository-local OS temp | **Lexical case closed; physical alias open** due to the junction bypass. |
| Node compatibility floor | **Closed** at `>=16.7.0`, matching `fs.cpSync`. [Node 16.7.0](https://nodejs.org/en/blog/release/v16.7.0). |
| BTree witness, rustls classification, serde facade, TOML comment | **Closed**. aHash/foldhash calibration retains a P3 ambiguity. |
| yanked packages and `unexpected_cfgs` | **Partial**: central wording improved; failing policy/module wording remain inaccurate. |
| Borsh and `Display`/`FromStr` | **Closed**. Persisted-format version-bump suppression is a separate P2. |
| Evidence and installed Codex copy | **Open/unchanged**. |

## Verification performed

All checks ran against the snapshot hash stated above. The implementation patch remained unstaged.

| Check | Result |
|---|---|
| `node --check dev/validate.mjs`; `node --check dev/validate-fixtures.mjs`; both workflow scripts | PASS |
| `npm run validate` | PASS — 12 skill Markdown files; 2 fixture cases |
| Canonical `skill/` vs `skills/rust-intel/` parity | PASS |
| `git diff --check` | PASS |
| `npm pack --dry-run --json` | PASS — 37 entries; 564,303 bytes packed; 1,557,269 unpacked; integrity `sha512-b4THSrcHivIZRHVKxQv5mD/b9qE9jKw2w6azuuSwHGdmz0dta0DQQ18mCWEKfH2TyT83JluE0wa/3rpNtgE1fA==` |
| Direct local temp: `$env:TEMP="$repo\.round9-tmp-direct"; $env:TMP=$env:TEMP; node dev/validate-fixtures.mjs` (then restore both variables) | PASS — lexical fallback works |
| Junction alias whose physical target is inside the repo | **FAIL** — recursive self-copy/path explosion reproduced in 7.7 s |
| Committed fix-plan object | FAIL — absent from `HEAD` |
| npm evidence entries | FAIL — zero `docs/reviews/*` files |
| Active Codex install parity | FAIL — 11/11 baseline; 0/11 `HEAD`; 0/11 working snapshot |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

The two temporary probe targets and the exact junction were revalidated and removed after the test. The Git
diff hash returned to `f8922e1ad32170bef13c4d3097f40074fc9362a4`; the two pre-existing untracked paths
were neither modified nor staged. This repository has no `Cargo.toml`, so cargo/clippy/Miri execution is not
applicable to the repository itself; Rust recipe claims were checked against primary documentation and targeted
compiler probes instead.

## Recommended correction order

1. Fix the callback allow-list, then make all central red triggers match their module rules (`spawn_local`,
   `JoinSet`, SCC, public leakage).
2. Repair the copy destination with physical-path containment and add the junction regression control.
3. Correct the executable recipes: virtual-time acknowledgements/prerequisites, `assert_matches!` import,
   rollback error precedence, module Miri scope, rand 0.10, yanked-policy failure, and persisted format versioning.
4. Reconcile the remaining P3 wording so phrase triggers, structural triggers, and normative bodies cannot give
   opposite answers.
5. Add semantic positive/negative witnesses, commit or remove the cited evidence, publish resolvable report
   links, then reinstall and byte-verify the Codex skill only after the normative implementation commit lands.
