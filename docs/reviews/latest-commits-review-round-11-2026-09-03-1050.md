# Round 11 review of the latest commits — 2026-09-03 10:50 CEST

- Commit range: `57c8a7c0ebd5e01f0b0b0ffd44d32974d1dc34ee..f2b4897563b53c239290ccd72352c127e5a30b61`
- Implementation commit reviewed: `f2b4897` — `rust-intel: correctness fixes from round-10 independent review`
- Delta: 18 files, 80 insertions, 54 deletions
- Pre-existing untracked paths excluded: `.githooks/` and `docs/reviews/fix-plan-2026-08.md`
- Method: one pass over each of the ten normative modules, central trigger/tier review, canonical/package-mirror comparison, primary documentation/API checks, validator and packaging checks, installation/evidence checks, and a separate synthesis pass
- Verdict: **REQUEST CHANGES**

`f2b4897` is a substantial correction pass. It closes the regex complexity and process-isolation
contradictions, the `spawn_local`, `assert_matches!`, `thread::scope`, proc-macro facade, drop/panic,
foldhash, and most `#[non_exhaustive]` issues. All repository checks pass and the two distributed copies
of every normative Markdown file are byte-identical.

The implementation is nevertheless incomplete. Five grouped conditional-P1 activation families can still avoid a
canonical red rule; the cancellation, concurrency, public-API, crypto, and persisted-format fixes each
retain at least one factual or semantic defect; and no regression fixture was added for any of the newly
corrected high-risk rules. Release evidence and the active Codex installation also remain stale.

## Executive result

- Conditional-P1 activation remains incomplete for common unbounded channel constructors, `JoinSet`
  construction through `FromIterator`, blanket impls through fundamental type constructors, template
  autoescape failures, and either independently missing Markdown XSS defense.
- The most consequential P2 contradictions are concrete: `select!` still calls atomicity cancel-safe in
  its REQUIRED rule; the red JoinHandle tier drops the documented-detach exception; current `scc` method
  names are wrong; a read/shared guard is mistaken for an exclusive TOCTOU guard; a public type alias is
  incorrectly classified as unnameable; and the password-hash 0.6 recipe omits its feature boundary.
- The new persisted-data corpus/version wording still does not protect top-level structs, retrofitted
  version bytes, or field order beneath Borsh's explicit enum discriminants.
- The green validators establish mirror and basic document consistency, not semantic closure: fixtures
  still cover only B5 and B26, and the duplicate-trigger validator silently skips the new valid GFM row
  whose leading pipe is absent.

## Conditional P1 findings

### §B14 still misses common unbounded channels and `JoinSet` construction through `FromIterator`

Locations: `skill/SKILL.md:100,368-369`, `skill/concurrency-and-state.md:120-125`, and mirrors.

The new structural channel row names only Tokio, Flume, and async-channel. A code-only request using
`std::sync::mpsc::channel()`, `crossbeam_channel::unbounded()`, or
`futures::channel::mpsc::unbounded()` therefore does not activate §B14, although the first is documented
as having an “infinite buffer” and the latter two are explicitly unbounded.

The adjacent central row says “any task-insertion method,” which semantically covers `Extend::extend`
despite the narrower example list. It does not clearly cover construction through `FromIterator`:
`xs.collect::<JoinSet<_>>()` builds the set through `Iterator::collect`, not a method called on an existing
`JoinSet`. Current Tokio documents that `FromIterator` spawns every supplied future. The module body is
narrower still, naming only unbounded `.spawn()`; it should explicitly agree with the central semantic rule.

Make both rules semantic: any no-cap channel constructor, and any operation that constructs or adds tasks
to a `JoinSet`, including `Extend`/`FromIterator` and the unstable builder when applicable. Preserve the finite
total/backlog and cap/drain exceptions. Sources: [std mpsc channel](https://doc.rust-lang.org/std/sync/mpsc/fn.channel.html),
[crossbeam unbounded](https://docs.rs/crossbeam-channel/latest/crossbeam_channel/fn.unbounded.html),
[futures mpsc unbounded](https://docs.rs/futures/latest/futures/channel/mpsc/fn.unbounded.html), and
[Tokio JoinSet trait implementations](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html#trait-implementations).

### §C1's new blanket-impl definition misclassifies fundamental constructors

Location: `skill/SKILL.md:307` and mirror.

The row says a parameter is covered whenever it is nested as an argument to another type. Rust has a
specific exception: `&`, `&mut`, `Box`, and `Pin` are fundamental constructors and do **not** cover their
type argument. Consequently this published-library red case is incorrectly classified as ordinary:

```rust
impl<T> PublicTrait<Box<T>> for Box<T> { /* ... */ }
```

State the fundamental-constructor exception and add a witness alongside the existing `Vec<T>` examples.
The [Rust Reference glossary](https://doc.rust-lang.org/reference/glossary.html#fundamental-type-constructors)
defines both the exception and the breaking-change consequence.

### §C12's structural XSS row is narrower than its own canonical rules

Locations: `skill/SKILL.md:110,373`, `skill/deps-macros-ergonomics.md:145,165,178-179`, and mirrors.

Two code-only red paths remain:

1. The structural row recognizes hand-written escaping but not the catalog's extension-keyed autoescape
   failures, such as `tera.render("email.txt", ...)`, Askama `page.md`, or explicitly disabled escaping.
2. The Markdown branch requires both “no sanitization pass **and** no URL-scheme allowlist.” The module
   correctly treats those as independent obligations: a scheme allowlist does not remove raw `<script>`,
   while dropping raw-HTML events does not make a `javascript:` link safe. Either missing defense can be
   the XSS bypass.

Add the extension/escape-mode shapes and use OR semantics for the two independent Markdown defenses,
with recognition that a configured sanitizer may enforce the URL policy itself. Primary references:
[Tera autoescape suffixes](https://docs.rs/tera/latest/tera/struct.Tera.html#method.autoescape_on),
[Askama escaping modes](https://docs.rs/askama/latest/askama/derive.Template.html),
[pulldown-cmark HTML events](https://docs.rs/pulldown-cmark/latest/pulldown_cmark/enum.Event.html), and
[ammonia URL schemes](https://docs.rs/ammonia/latest/ammonia/struct.Builder.html#method.url_schemes).

## P2 findings

| Location | Finding | Required correction |
|---|---|---|
| `skill/async.md:313,318`; `skill/SKILL.md:327` | The BANNED rule and trigger correctly say atomicity alone is insufficient, but REQUIRED still permits “atomic, idempotent, recoverable.” A `fetch_add` followed by a pending await is atomic and duplicates when a losing future is recreated. | Remove atomicity from the sufficient-condition list. Require idempotence, proven rollback, commit observation, or resumable progress under Tokio's drop-and-recreate criterion. [Tokio cancellation safety](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety). |
| `skill/SKILL.md:103,311`; `skill/async.md:279,284` | The structural row preserves “detached-by-design,” but the canonical red tier now says every dropped Tokio `JoinHandle` is surfaced without the module's bounded, documented intentional-detach exception. The module also inaccurately calls Handle/Runtime APIs forms “of all three”; neither has `spawn_local`. | Put the exception in the canonical tier and say Handle/Runtime provide `spawn` and `spawn_blocking`, while local spawning belongs to `spawn_local`/`LocalSet`/local-runtime APIs. [Tokio JoinHandle](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html). |
| `skill/SKILL.md:206,304` | The new `scc` trigger uses obsolete `entry()`/`get()` names; current `scc` uses `entry_sync()`/`get_sync()` plus async forms. It also describes every DashMap/scc guard as exclusive and equivalent to `MutexGuard`; DashMap `Ref` is shared, and the deadlock condition depends on later conflicting re-entry. | Match actual guard types and current sync/async methods, and state the precise conflict rather than a universal exact-Mutex analogy. [scc HashMap methods](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html). |
| `skill/SKILL.md:316`; compare `skill/concurrency-and-state.md:92` | The module correctly exempts one continuously-held **exclusive** guard. The central row weakens that to a “shared lock” and says the same guard closes the window. A compiling counterexample is `RwLock<DashMap<...>>`: multiple outer read guards may coexist while each calls DashMap's `&self` mutation methods, so the outer guard does not serialize check-and-act. | Require one exclusive/write guard that serializes all relevant access across both operations. |
| `skill/SKILL.md:308` | A public type alias is listed as an unnameable leak location, but the alias itself creates a public name: `pub type PublicS = hidden::S;` lets downstream code write `crate::PublicS`. | Define the prerequisite as no public naming path through either re-export **or** public type alias; keep functions, fields, parameters, and trait signatures as leak sites. [Rust type aliases](https://doc.rust-lang.org/reference/items/type-aliases.html). |
| `skill/security.md:42`; `skill/SKILL.md:201` | The password-hash 0.6 recipe is feature-gated but the text presents it as unconditional and open-ended `>=0.6`. In 0.6.1, `generate_salt`/`try_generate_salt` and `PasswordHasher::hash_password` require `getrandom`; `hash_password_with_rng` requires `rand_core`. A pre-1.0 `>=0.6` promise is also semver-fragile. | Pin the 0.6.x branch and name the two feature/API paths; resolve the concrete KDF crate and enabled features before prescribing code. [generate_salt](https://docs.rs/password-hash/0.6.1/password_hash/fn.generate_salt.html), [PasswordHasher](https://docs.rs/password-hash/0.6.1/password_hash/trait.PasswordHasher.html). |
| `skill/SKILL.md:96,409` | The new dependency row correctly activates on every new dependency, but labels **every** one a slopsquatting/unverified-crate finding regardless of whether the user named it and its existence/source was verified. That contradicts the canonical red definition and the row's own instruction to classify by those facts. | Separate broad review activation from a red finding: surface/block only the unnamed or unverified case; ordinary user-named, verified dependencies still receive source/version/policy review. [Cargo dependency specification](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html). |
| `skill/semantics-and-conformance.md:19,108`; `skill/SKILL.md:406` | Corpus coverage is quantified only over enum variants; for a top-level struct, “every variant” is vacuous, and line 108 still says singular fixture. `Pair { left: 0, right: 0 }` stays green after swapping same-typed fields while `{1,2}` silently changes meaning. | Require the corpus for every persisted top-level struct and every enum variant, with distinguishable marker values at each serialized field/payload position; change the stale singular wording. [Bincode field order](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md#L678-L710). |
| `skill/semantics-and-conformance.md:19`; `skill/SKILL.md:406` | The version-byte alternative addresses only an **unrecognized** byte. Retrofitting byte `2` onto an unversioned format can misclassify an old record whose first data byte is already `2`; the policy never runs. Known older layouts and a documented compatibility promise are also not tied to decoder dispatch. | Version from the first release, or migrate behind unambiguous magic/external metadata. Require dispatch for every supported deployed layout plus an explicit support/migrate/reject policy and prior-layout corpus tests. |
| `skill/semantics-and-conformance.md:19`; `skill/SKILL.md:406` | The Borsh explicit-discriminant exemption is too broad. Explicit discriminants stabilize only an enum tag; they do not stabilize the declaration order of fields inside a struct/tuple variant. | Limit the exemption to variant insertion/reordering with unchanged unique explicit tags. Retain corpus/version requirements for payload and struct field order. [Borsh `use_discriminant`](https://docs.rs/borsh/latest/borsh/derive.BorshSerialize.html#2-borshuse_discriminantbool-item-level-attribute). |
| `CHANGELOG.md:11`; `docs/reviews/README.md:12-14`; package and active installation | The cited fix plan is absent from `HEAD`; the npm tarball includes the citing changelog but zero `docs/reviews/*`; and the active Codex skill matches baseline `7a567a6` in 11/11 normative files and current `f2b4897` in 0/11. | Commit or withdraw the cited plan, publish resolvable evidence, and reinstall/byte-verify the active Codex skill only after normative corrections land. |

## P3 findings

| Location | Finding and correction |
|---|---|
| `skill/async.md:344-368`; `skill/SKILL.md:328` | §C9's trigger still names only free Tokio spawn functions and `LocalSet`; the module's rule also applies to `Handle::spawn`, `Runtime::spawn`, their blocking forms, and relevant local-runtime/builder paths. Make the trigger semantic and preserve the different future-vs-blocking span remedies. [tracing `in_current_span`](https://docs.rs/tracing/latest/tracing/trait.Instrument.html#method.in_current_span). |
| `skill/data-and-types.md:24,28` | The corrected Ord body says outcomes are unspecified and may include panic/abort/nontermination, never UB, but the introduction still promises only silent B-tree corruption/arbitrary sort order. Reconcile the introduction with the corrected contract wording. [Ord](https://doc.rust-lang.org/std/cmp/trait.Ord.html). |
| `skill/SKILL.md:325` | The expanded order/equality trigger covers `HashMap`/`BTreeMap`, sorting, and heaps but omits the symmetric `HashSet` and `BTreeSet` key cases. Add both set families. |
| `skill/security.md:42` | The username-derived-salt correction now says deterministic salts collapse “the entire benefit” of salting. Distinct account-derived salts still prevent one candidate hash/table from being reused unchanged across every account, so the rationale is overstated even though the prescribed random-per-credential salt is safe. State the narrower targeted-precomputation, normalization/collision, cross-system/reuse, and policy losses. [OWASP salting guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#salting). |
| `skill/SKILL.md:307`; `dev/validate.mjs:248-291` | The new blanket-impl row omits the leading pipe. This is valid GFM—outer pipes may be inconsistent—so it does **not** break rendering, but the repository validator treats every non-leading-pipe line as the end of a table block and silently skips this row during duplicate-trigger validation. Restore the pipe for project consistency and make the validator parse valid GFM rows or explicitly enforce the repository's stricter table style. [GFM tables, example 199](https://github.github.com/gfm/#example-199). |
| `dev/validate-fixtures.mjs:5-9,21-26,48-51`; `examples/fixtures/cases.json:1-9` | Fixtures still implement only two crude B5/B26 detectors. `f2b4897` changes many normative triggers/recipes but adds no validator or fixture control, so semantic regressions and even the skipped row above stay green. Add focused positive/negative or compiler-backed controls for the changed P1/P2 rules without pinning prose verbatim. |

## Round-10 closure accounting

| Round-10 item | Status in `f2b4897` |
|---|---|
| Unbounded-channel structural activation | Partial: three constructors added; std, crossbeam, and futures forms remain absent. |
| JoinSet insertion coverage | Partial: stable `spawn*` methods and semantic method wording cover `Extend`; `FromIterator`/`collect`, module consistency, and builder growth remain absent. |
| Dropped JoinHandle activation | Structural trigger closed; canonical-tier intentional-detach exception regressed, and one API description is inaccurate. |
| Ordinary dependency-table activation | Substantively closed: “any table” covers target dev/build forms despite the illustrative list; finding severity is overbroad. |
| §C12 XSS activation | Partial: hand-rolled shapes added; extension-keyed autoescape and independent Markdown defenses remain incomplete. |
| Regex iterator complexity and backtracking alternatives | Closed. |
| Ord/PartialOrd scope and outcomes | Partial: core correction landed; intro and set-family trigger omissions remain. |
| `select!` atomicity/cancellation wording | Partial: BANNED/trigger fixed; REQUIRED still contradicts them. |
| `spawn_local` exhaustive rule | Closed. |
| Central `assert_matches!` fallback | Closed. |
| Password-salt version and misuse wording | Partial: renamed API and cross-account-table claim fixed; feature/version and “entire benefit” claims remain. |
| Persisted-layout corpus/version policy | Partial: enum corpus and unknown-version policy added; structs, retrofitted version dispatch, and Borsh payload fields remain open. |
| B1b and hidden-type activation | Partial: B1b and signature positions added; public alias classification is wrong. |
| Drop/caught-panic wording | Closed. |
| Foldhash threat-model wording | Closed. |
| Proc-macro facade path | Closed. |
| SCC/DashMap guard trigger and TOCTOU guard | Partial: trigger added and module exemption fixed; SCC API names/guard semantics and central exclusivity remain wrong. |
| §C9 spawn coverage | Partial. |
| `thread::scope` panic timing | Closed. |
| Behavioral regression fixtures | Open/unchanged. |
| Release evidence and active installation | Open/unchanged. |

## Disposition of disputed candidates

- The missing leading pipe at `SKILL.md:307` is **not** a table-breaking P1: GFM explicitly permits
  inconsistent outer pipes. Its real impact is a formatting inconsistency and a validator blind spot, rated P3.
- The dependency row's examples omit target-specific dev/build combinations, but its leading “any
  `Cargo.toml` dependency table” is semantically sufficient. That omission is not treated as a P1 bypass;
  the overbroad classification on the right-hand side remains P2.

## Ten-module coverage record

| Module | Round-11 result |
|---|---|
| Async | Cancellation REQUIRED contradiction; JoinHandle exception/API wording; §C9 trigger residue. |
| Unsafe / FFI | No target-delta normative finding; prior callback, ownership, panic-boundary, and Miri corrections remain closed. |
| Concurrency / state | Common unbounded constructors and `JoinSet::from_iter`; SCC API/guard semantics; exclusive-guard contradiction. |
| Data / types | Core regex correction closed; Ord introduction and set-family activation remain incomplete. |
| Security | password-hash feature/version preconditions and deterministic-salt rationale remain imprecise. |
| Drop / RAII | No target-delta normative finding; the caught-panic correction is closed. |
| Dependencies / macros / ergonomics | §C12 activation gaps and overbroad new-dependency severity. |
| Lifetimes / API | Fundamental constructors and public-alias nameability; B1b and `#[non_exhaustive]` otherwise closed. |
| Testing | Central `assert_matches!` fix closed; structural/behavioral regression controls remain absent. |
| Semantics / conformance | Top-level structs, retrofitted version dispatch, and Borsh payload-field order remain open. |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files and 2 fixture cases |
| JS syntax checks | PASS — both validators and both workflow scripts |
| `git diff --check 57c8a7c..f2b4897` | PASS |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — 11 Markdown files, zero SHA-256 mismatches |
| `npm pack --dry-run --json` | PASS — 37 entries; 580,923 bytes packed; 1,607,003 unpacked; integrity `sha512-KmlNL2sNB7y2yZ1GNfU63WykpQhrjCigpquV+I03NynIQiipUIPBUiCivf2756NQDL0yL4J/0AFKFr3ze9VubA==` |
| Fix-plan object in `HEAD` | FAIL — `docs/reviews/fix-plan-2026-08.md` is absent |
| Review evidence in npm tarball | FAIL — zero `docs/reviews/*` entries |
| Active Codex skill parity | FAIL — 11/11 installed files match baseline `7a567a6`; 0/11 match `f2b4897` |
| Repository Cargo checks | Not applicable — no `Cargo.toml`; version-sensitive Rust/crate claims were checked against primary docs |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

## Recommended correction order

1. Close the five grouped conditional-P1 families: fundamental blanket constructors, the remaining
   unbounded channel/JoinSet construction forms, and both §C12 activation gaps.
2. Reconcile each central rule with its module: cancellation criteria, intentional task detachment, SCC
   APIs/guard semantics, exclusive TOCTOU guards, dependency severity, and public alias nameability.
3. Repair the crypto and persisted-format recipes with explicit version/feature/layout preconditions and
   counterexamples for top-level structs, retrofitted versions, and Borsh payload fields.
4. Add structural and behavioral negative controls for every changed red rule; keep canonical and package
   mirrors byte-identical.
5. Commit or remove the unresolved fix-plan references, then reinstall and byte-verify the Codex skill
   after the normative corrections are complete.
