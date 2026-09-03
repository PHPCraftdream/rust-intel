# Round 15 review (rush) of the latest commits — 2026-09-03 16:53 CEST

- Commit range: `2011a1b781f0e5bf6c46e04b8d05a5a656835c90..adee2e94d05817d0d0e89d9da4c50744e4ef46d1`
- Commits reviewed:
  - `adee2e9` — `rust-intel: correctness fixes from round-14 independent review`
- Delta: 16 files, 223 insertions, 71 deletions
- Range note: while this review was in progress, two docs-only commits (`f0d6db7`, `d07836a`, "docs: add round 15 review of latest commits") landed on top of `adee2e9`. Both add only the parallel reviewer's own markdown artifacts under `docs/reviews/`; they touch no `skill/`, `skills/rust-intel/`, or `dev/` file, so the reviewed implementation content at current `HEAD` is byte-identical to `adee2e9`. Per the parallel-reviewer arrangement, those files were not read or reviewed.
- Pre-existing untracked path excluded: `.githooks/`
- Method: one pass over each normative module touched by the delta, central trigger ↔ module-body cross-reference checks in both directions, Round-14 closure accounting, primary-source verification (docs.rs for scc, dashmap, tokio, borsh; the bincode 2 spec; password-hash 0.5.0 and rand_core 0.6.4 Cargo manifests; rust-lang/rust#120146 and the `rustc_privacy` `check_unnameable` implementation for `unnameable_types`), manual canonical/`skills/rust-intel/` byte comparison (`cmp` over all 11 top-level module files), a hand trace of the rewritten validator table state machine against constructed inputs, and fixture-anchor verification — with automated validation (validate.mjs / validate-fixtures.mjs / npm pack / sync-mirror) deliberately NOT run this round per the review constraints
- Verdict: **REQUEST CHANGES**

`adee2e9` closes both substantive Round-14 defects correctly. The persisted-layout oracle is now
decode-observable — every non-identity sibling permutation must fail to decode or decode unequal
to the named-field expectation under the proposed layout — and every factual leg of it verified
against primary sources (bincode 2: `bool` is one byte, anything but `0`/`1` is
`DecodeError::InvalidBooleanValue`, `u8` is a raw byte, struct fields are positional and unnamed).
Recursive coverage is now defined over the finite schema graph walked to a fixed point, with two
representatives per recursive edge, and borsh's `Option<T>`/`Box<T>` impls are real. Map-guard
activation is now semantic (guard ownership/liveness, no `let` restriction), covers DashMap's
mapped/iterator/wrapper shapes, and — checked against scc and dashmap docs — every corrected
producer signature is right: scc `entry_sync`/`entry_async` return `Entry`,
`get_sync`/`get_async`/`begin_sync`/`begin_async`/`any_sync`/`any_async` return
`Option<OccupiedEntry>`, `replace_sync`/`replace_async` return `ReplaceResult`, scc locks
per-bucket, DashMap `map`/`try_map` yield `MappedRef`/`MappedRefMut`, iteration yields
`RefMulti`/`RefMutMulti`, `try_entry` returns `Option<Entry>`. The `JoinSet` inequality is now
strict (`len() < N` before insertion, `<= N` as the post-insertion invariant) and its arithmetic
checks out. The two-feature Argon2/`OsRng` recipe is exactly right (verified against
password-hash 0.5.0's `rand_core = { default-features = false }` dependency and rand_core 0.6.4's
empty default feature set with `std = ["alloc", "getrandom", ...]`). The mutation harness copies
optional `.app.json`/`.mcp.json` inputs; the junction control no longer converts its own
regressions into environmental skips; the leading-pipe machine catches pipe-less headers and
delimiters and cites the header's own line; and the new `rowOf`-scoped presence controls close the
two-rows-one-check hole. Mirrors are byte-identical; the fixture anchors and every required token
were verified present on the exact rows the controls scope to.

The result is not clean. The nameability fix overcorrected into a new factual error: the module
now presents `unnameable_types` as implementing its (correct, language-level) alias-inclusive
definition of nameable, but rustc's lint does not count type aliases as naming paths —
`check_unnameable` compares the `Reexported` and `Reachable` effective-visibility levels, and a
trivial `pub type` propagates only `Reachable` (rust-lang/rust#120146, open). The rewritten
table-parsing state machine also retains one self-contradictory path that can manufacture a
phantom table — plus two smaller wording drifts, a copy-unsafe escaped-TOML snippet, and a
misquote of std's `HashSet` docs.

## Executive result

- **No conditional-P1 findings.** The Round-14 conditional-P1 (typed value-vectors are not a wire
  oracle) is closed with a sound decode-observable obligation.
- **One P2 finding:** the nameability paragraph now defines `pub type` aliases as a naming path —
  correct at the language level — but in the same breath claims rustc's `unnameable_types` "catches
  the reachable-but-not-nameable case above". It does not: the lint still fires on alias-exposed
  types (#120146), so the text now misstates a tool it recommends, in the paragraph whose purpose
  is deciding what is a semver commitment.
- **Five P3 findings:** a delimiter-row mismatch path in the validator that promotes the delimiter
  to a header candidate and can build a phantom table its own comment says GFM recognizes no
  table for; literal `\"` escapes leaked into `SKILL.md` (one inside an inline-code span, so the
  rendered `rand_core` manifest line is invalid TOML and disagrees with `security.md`); the new
  §B6 rows offer a "deliberately logged/typed fallback" remedy for owned enums that the §B6 body
  does not; §B1a's activation rows still require a *returned* reference although the witness
  definition now covers out-parameter captures; and "HashSet's `FromIterator` documents nothing
  beyond the coalescing" — the impl documents nothing at all.
- Operationally, nothing moved: the npm package still ships a `CHANGELOG.md` that cites
  `docs/reviews/` evidence while `package.json` excludes the directory, and the active Codex
  installation still differs from current canonical content (spot-verified).

## P2 finding

### The alias-inclusive nameability definition is correct Rust but wrong about `unnameable_types`

Location: `skill/lifetimes-and-api.md:124` (and mirrors).

The fix adds a third naming path: "**Nameable**: an external crate can write an import path to the
item — which requires an unbroken chain of `pub` modules, `pub use` re-exports, **or a public type
alias along the path** (`pub type PublicS = hidden::S;` already names the type downstream as
`crate::PublicS` ...)". The language-level claim is true: downstream can write
`dependency::PublicS` and use the alias transparently, so publishing such an alias is a semver
commitment. Keeping the alias in the definition is right.

The defect is the same paragraph's next sentence, carried over unchanged: "`unnameable_types` (also
allow-by-default; **catches the reachable-but-not-nameable case above**)". With the definition
broadened, "the case above" now includes alias-exposed types as *nameable* — and rustc's lint does
not agree. `unnameable_types` fires from `rustc_privacy`'s `check_unnameable` when the type's
`Reachable` effective-visibility level is public while its `Reexported` level is not; a trivial
type alias propagates only `Reachable`, never `Reexported`. rust-lang/rust#120146 ("effective
visibilities: Count types leaked through trivial type aliases as reexported", open, filed by
petrochenkov) tracks exactly this gap using the same shape as the module's own example
(`pub use m::A as U;` counts as reexported; `pub type V = m::B;` does not). RFC 2145's intended
model — nameable "directly, or through reexports, **or through trivial type aliases**" — is the
design the module now describes; the implementation has not caught up to it.

Concrete consequence: for

```rust
mod hidden { pub struct S; }
pub type PublicS = hidden::S;
```

the lint fires on `S` today. An auditor following the module — which says `S` is nameable via the
alias and that `unnameable_types` catches only genuinely unnameable types — reads the firing as
noise at best, or (worse, and more plausibly) concludes `S` is *not* really nameable and drops it
from the public surface in a minor release: the exact semver break §A3 exists to prevent. The
module must state both halves: the alias is a real naming path and a real commitment, AND
`unnameable_types` does not model it yet (#120146), so its firing on an alias-exposed type is a
known lint false positive, not evidence of non-commitment.

This also corrects Round 14's own P3, whose required remedy ("the module still creates a false
`unnameable_types` finding ... Include public type aliases in the module definition") assumed the
module's definition and the lint's behavior could be reconciled by broadening the definition. They
cannot be: the language-level premise ("a downstream crate can name `crate_name::PublicS`") was
right, but the lint continues to fire regardless of what the module says, so the "false finding"
lives in the lint, not in the module. A ledger row is warranted (see Prior-review correction
below); the prior review file is not rewritten.

## Prior-review correction (ledger row recommended)

Round 14, P3 row beginning "`skill/lifetimes-and-api.md:124`": the row's claim "A downstream crate
can name `crate_name::PublicS`, so the module still creates a false `unnameable_types` finding"
mis-attributes the false positive. The finding (the lint firing) is produced by rustc, not by the
module's prose, and it persists after the module is corrected; the row's cited source (the lint's
documentation page) does not establish that the lint treats aliases as naming paths, and the
implementation (`check_unnameable`'s Reexported-vs-Reachable comparison, #120146) shows it does
not. Per the ledger convention the correction is recorded here with a recommended row, and the
Round-14 file stands unmodified.

## P3 findings

| Location | Finding and required correction |
|---|---|
| `dev/validate.mjs:336-341` (and the mirrored pipe-less path `:380-388` + `:363-372`) | On a header/delimiter cell-count mismatch the machine promotes the **delimiter row itself** to a header candidate (`tableState = 'header'; headerHadPipe = true; ...`), directly against its own inline comment ("cell-count mismatch: GFM §4.10 — no table recognized") and against GFM: a delimiter-shaped line cannot open a table, so no delimiter row can ever be a valid header. Constructed false positive: `a \| b \| c` / `\|---\|---\|` / `\|---\|---\|` / `x \| y` — GFM parses one paragraph (no table anywhere), while the machine enters `body` on line 3 and reports line 4 as a "table row missing its leading `|`". On mismatch, flush the block instead of promoting (or track that the candidate was delimiter-shaped and refuse to confirm it). Not reachable in the current `SKILL.md` content, but it is the same false-positive family this rewrite was meant to close. |
| `skill/SKILL.md:202`; `skill/SKILL.md:408`; compare `skill/security.md:42`; mirrors | Literal `\"` escapes leaked into the generated text. On line 202 they sit **inside an inline-code span** — `` `rand_core = { version = \"0.6\", features = [\"getrandom\"] }` `` — where CommonMark backslash escapes do not apply, so the rendered snippet is `version = \"0.6\"`, invalid TOML if copied, and inconsistent with `security.md`'s correct unescaped spelling of the same manifest line. Line 408's `\"every enum variant at any nesting depth\"` is prose and renders acceptably, but is still source noise. Strip the backslashes in both places (and in the mirror via sync). |
| `skill/SKILL.md:189,404`; compare `skill/data-and-types.md:9-20`; mirrors | Both new §B6 rows end with "explicit arms, or a deliberately logged/typed fallback" as the remedy for a wildcard on an enum **the crate itself owns**. The module body's owned-enum rule is stricter: "avoid wildcard arms unless I want adding-a-variant to compile silently. Use explicit arms." — the logged/typed fallback is the module's discipline for enums you do **not** own (the `#[non_exhaustive]`-assumption bullet), and a logged wildcard still swallows a future variant silently at the type level. Align the rows with the body (explicit arms for owned enums; logged/typed fallback for external enums), or amend the body to license the fallback deliberately. |
| `skill/SKILL.md:176`; `skill/lifetimes-and-api.md:57`; compare `skill/SKILL.md:85,490`; mirrors | The §B1a witness was correctly broadened to out-parameter captures (`fn remember<'a>(s: &'a str, cache: &mut Vec<&'a str>)` — the example compiles and is the right shape), but both activation layers still gate on a return: the central phrase row reads ""cache", "memoize", "store results" **with returned `&T`**" and the module's prompt-triggers line says "caching of **returned references**". A request to capture into a `&mut` cache argument matches neither. Reword both to "an input-derived borrow captured into a cache/container", matching the fixed witness definition. |
| `skill/data-and-types.md:135`; mirror | "`HashSet`'s `FromIterator` **documents nothing beyond the coalescing**" misquotes std: the `impl FromIterator<T> for HashSet<T, S>` carries no doc comment at all (verified against the std docs) — not even the coalescing sentence that `HashMap`'s impl has. The intent (no survivor-identity promise) is correct and the `HashMap` quotation itself is verbatim-accurate; say "documents nothing" instead. |

## Operational completeness

Carried over unchanged from Rounds 13–14, neither touched nor closed by `adee2e9`:

- `CHANGELOG.md:11` still promises "full evidence for every item lives in `docs/reviews/`" while
  `package.json:9-15` ships only `bin/`, `skill/`, `skills/`, `.codex-plugin/`,
  `commands/rust-intel-cc/`, and `CHANGELOG.md` — zero review files in the tarball.
- The active `C:\Users\Computer\.agents\skills\rust-intel` installation still differs from current
  canonical content (spot-verified with `cmp` on three files during this review). Reinstall and
  byte-verify only after the normative corrections land.

## Round-14 closure accounting

| Round-14 item | Status in `adee2e9` |
|---|---|
| Typed value-vectors are not a wire/decode oracle (conditional-P1) | **Closed.** Decode-observable permutation oracle plus optional schema-mutation negative control; every bincode claim verified against the 2 spec (bool `0`/`1` only, `InvalidBooleanValue` otherwise; `u8` raw byte; positional unnamed fields). |
| Recursive coverage as an infinite obligation (P2) | **Closed.** Finite schema graph, fixed point, one visit per type/variant definition (per monomorphization), two representatives per recursive edge; borsh `Option<T>`/`Box<T>` impls verified. |
| Map-guard activation syntactic/incomplete (P2) | **Closed.** Ownership/liveness definition, wrapper and match-binding shapes included, `let` restriction removed, DashMap mapped/iterator families added; all corrected scc/dashmap producer signatures verified against current docs. |
| `JoinSet` admission off-by-one (P3) | **Closed.** Strict `len() < N` before insertion; `<= N` reserved as the post-insertion invariant; the `while len() >= N { join_next().await }` idiom and the peak-of-one example both check out. |
| Argon2/`OsRng` incomplete feature recipe (P3) | **Closed.** Both obligations stated (generator feature AND `rand_core/getrandom`); verified password-hash 0.5.0 pulls `rand_core` with `default-features = false`, rand_core 0.6.4 has an empty default set, `std` implies `getrandom`, and `OsRng` is gated on `getrandom`/`std`. |
| §B1a "returned reference" witness wording (P3) | **Closed centrally** (`SKILL.md:85,490`; module REQUIRED bullet's "cache/output" phrasing was already compatible); activation rows still return-gated — see P3 above. |
| Public type-alias nameability (P3) | **Overcorrected.** Alias added as a naming path (language-correct) but the `unnameable_types` sentence is now factually wrong — see the P2. Round-14's own remedy was incomplete on the lint half. |
| Leading-pipe parser: header/delimiter blind spots, block-start false positives, false diagnostic claim (P3) | **Closed**, with one residual phantom-table promotion path (P3 above). Header errors now cite the header's own line; the machine was hand-traced on header-pipe-less, delimiter-pipe-less, block-start, and mismatch inputs. |
| Semantic regression controls partial (P3) | **Closed.** `rowOf`-scoped controls for both B2 rows (each reverts red independently), new C12 (both files) and F1 (module section + trigger row) controls; every anchor and required token verified present on the exact scoped line/section. |
| Optional `.app.json`/`.mcp.json` inputs (P3) | **Closed.** Copied when present; matches validate.mjs's manifest-conditional reads. |
| Junction catch-all converting regressions into skips (P3) | **Closed.** Only link-creation failure skips; every later exception is now a reported failure; env restore and cleanup paths traced correct. |
| Collection survivor behavior overclaimed (P3) | **Closed**, modulo the `HashSet`-docs phrasing nit (P3 above). `HashMap`'s FromIterator sentence quoted verbatim-accurately; explicit-loop advice added. |
| §B6 lacks general activation (P3) | **Closed.** Phrase row plus code-pattern row, scoped to owned enums, placed directly under the §F1 protocol-wildcard row it must stay distinct from; remedy wording drift noted above. |
| npm evidence gap; active Codex install | **Open/unchanged.** |

## Ten-module coverage record

| Module | Round-15 result |
|---|---|
| Async | §B2 map-guard rewrite verified against scc 3.8.x and dashmap 6.2.1; locking-model and signature claims all correct. No regression in cancellation/blocking/task-lifecycle text. |
| Unsafe / FFI | Not touched by the delta; previously closed state confirmed present. |
| Concurrency / state | `JoinSet` inequality fixed and verified; §B14 trigger row consistent with the module body. |
| Data / types | §B6 triggers added (one remedy-wording drift); `collect` survivor text fixed (one std-docs phrasing nit). |
| Security | Two-feature Argon2/`OsRng` recipe verified correct against the actual Cargo manifests; no other delta. |
| Drop / RAII | Not touched by the delta; previously closed state confirmed present. |
| Dependencies / macros / ergonomics | C12 presence control added and anchor-verified; no new dependency/build/proc-macro defect. |
| Lifetimes / API | §B1a witness broadened correctly; the nameability paragraph now misdescribes `unnameable_types` (P2) and the activation rows lag the new definition (P3). |
| Testing | Leading-pipe machine substantially hardened and hand-traced; one residual promotion path; fixture controls verified anchor- and token-true, junction and copy fixes correct. |
| Semantics / conformance | Both Round-14 §F1 defects closed with verified facts; the rewritten bullet is internally consistent (same-type value-vector uniqueness is equivalent to byte-signature distinctness, so the retained "simpler rule" special case does not contradict the new oracle). |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` / `node dev/validate-fixtures.mjs` / `npm pack` / `dev/sync-mirror.mjs` | **NOT RUN this round** — the review constraints for this round forbid executing the validation/test/pack scripts, so no automated pass/fail result is claimed; the checks below are the manual substitutes |
| Validator state machine | Hand-traced on constructed inputs: piped header + pipe-less delimiter (both errors, correct lines), pipe-less header + piped delimiter (header error at the header's own line — the fixed bug), header/delimiter mismatch (no table, no error), block starts after a table (quiet), pipe-less body row (error). One residual false-positive path found (delimiter promoted to header candidate). |
| `blockStartRe` behavior | Evaluated directly (the regex literal copied and run against constructed lines via `node -e` — no project script executed): fully anchored; `  <div>`, `  [x]: url`, headings, lists, fences, blockquotes recognized; a mid-line `<` in a pipe-less row is NOT a block start (still flagged). The comment's "≤3 spaces" claim matches the implementation — an earlier suspicion of unanchored alternation was tested and refuted. |
| Canonical `skill/` vs `skills/rust-intel/` | PASS — all 11 top-level module files byte-identical via `cmp` (nested `references/` not compared this round) |
| Fixture anchors and tokens | PASS — every `rowAnchor` resolves to exactly one row and every `require` token was verified present on that same line or section via `grep`/`awk` (B2 phrase row 207, B2 code row 305, B14 row 370, C12 row 374, F1 row 408, deps C12 row 179) |
| External facts — scc | VERIFIED — `entry_sync`/`entry_async` → `Entry`; `get_sync`/`get_async`, `begin_sync`/`begin_async`, `any_sync`/`any_async` → `Option<OccupiedEntry>`; `replace_sync`/`replace_async` → `ReplaceResult`; per-bucket read-write locking (docs.rs/scc HashMap) |
| External facts — dashmap | VERIFIED — `Ref::map`/`try_map` → `MappedRef`, `RefMut::map`/`try_map` → `MappedRefMut`; `iter()` yields `RefMulti`, `iter_mut()` yields `RefMutMulti`; `entry()` → `Entry`, `try_entry()` → `Option<Entry>` (docs.rs/dashmap) |
| External facts — bincode 2 spec | VERIFIED — `bool` one byte, `0`/`1` only, other bytes → `DecodeError::InvalidBooleanValue`; `u8` single raw byte; struct fields in declaration order with no names |
| External facts — borsh | VERIFIED — `BorshSerialize` impls exist for `Option<T>` and `Box<T>` (docs.rs/borsh) |
| External facts — password-hash/rand_core | VERIFIED — password-hash 0.5.0: `rand_core` default feature, dependency `default-features = false`, own `getrandom` feature = `rand_core/getrandom`; rand_core 0.6.4: empty default set, `std = ["alloc", "getrandom", "getrandom/std"]`, `OsRng` gated on `getrandom`/`std` |
| External facts — tokio `JoinSet` | VERIFIED — no `Stream` impl on current tokio 1.x; `join_next*`/`try_join_next`/`poll_join_next*` and `len()` all exist (docs.rs/tokio) |
| External facts — `unnameable_types` | VERIFIED — lint fires on Reexported-vs-Reachable gap; trivial `pub type` propagates only Reachable; rust-lang/rust#120146 open; RFC 2145's alias-inclusive model unimplemented (rustc_privacy `check_unnameable`, #120146) |
| External facts — std `FromIterator` docs | VERIFIED — `HashMap` impl doc contains the quoted "all but one ... will be dropped" sentence; `HashSet` impl doc has no doc comment at all |
| `git diff --check 2011a1b..adee2e9` | PASS — no whitespace errors |
| Repository Cargo checks | Not applicable — no `Cargo.toml` |

## Recommended correction order

1. Fix the `unnameable_types` sentence in `skill/lifetimes-and-api.md:124` (keep the alias as a
   language-level naming path and semver commitment; state that the lint does not model it yet,
   citing rust-lang/rust#120146, and that its firing on alias-exposed types is a known false
   positive), and add the ledger row correcting Round 14's P3 on this point.
2. Remove the delimiter→header promotion in `dev/validate.mjs`'s mismatch branch (flush instead,
   or refuse to confirm a delimiter-shaped candidate) so the machine cannot build a phantom table.
3. Strip the literal `\"` escapes from `skill/SKILL.md:202,408`; align the §B6 rows' remedy and
   the §B1a activation rows with their module bodies.
4. Reword the `HashSet` `FromIterator` clause to "documents nothing".
5. Then the carried-over operational half: make the packaged review evidence resolvable (or use
   tagged repository links), and reinstall/byte-verify the active Codex skill.
