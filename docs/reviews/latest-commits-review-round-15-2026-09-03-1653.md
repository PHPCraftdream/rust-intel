# Round 15 review of the latest commits — 2026-09-03 16:53 CEST

- Commit range: `2011a1bb4533a29d1961f9de317a85da59c323ba..adee2e94d05817d0d0e89d9da4c50744e4ef46d1`
- Commits reviewed:
  - `adee2e9` — `rust-intel: correctness fixes from round-14 independent review`
- Delta: 16 files, 223 insertions, 71 deletions
- Pre-existing untracked path excluded: `.githooks/`
- Additionally examined outside the range: the `7a567a6`/v0.6.0 blobs of `skill/`, only to classify the active Codex installation; `d10427d` was not re-reviewed
- Method: **static review only** — no validator, fixture, mirror-sync, pack, or Rust toolchain execution this round (a stated constraint of the request). One pass over each of the ten normative modules, central trigger/tier review in both directions for every changed row, Round-14 closure accounting, primary-source checks (scc 3.8.8 and dashmap 6.2.1 on docs.rs; `argon2` 0.5.3, `password-hash` 0.5.0 and `rand_core` 0.6.4 `Cargo.toml` sources; the bincode 2 specification; std `HashMap`/`HashSet` docs; `rustc_privacy` source and rust-lang/rust#120146; the GFM specification and cmark-gfm `table.c`/`blocks.c`), a hand trace of the new table state machine and of every fixture control against constructed inputs, canonical/package-mirror byte comparison with `cmp`, `git diff --check`, and an active-install comparison
- Verdict: **REQUEST CHANGES**

`adee2e9` closes the substance of Round 14. The persisted-layout oracle is now decode-observable and its
`u8`/`bool` witness is correct against the bincode 2 specification; recursive coverage is finite; map-guard
activation is defined by guard ownership with wrapper, `match`-binding, mapped, and iterator shapes, and every
scc producer signature it names (`entry_sync`/`entry_async` → `Entry`, `get_*`/`begin_*`/`any_*` →
`Option<OccupiedEntry>`, `try_entry` → `Option<Entry>`, `replace_*` → `ReplaceResult`) matches scc 3.8.8;
the `JoinSet` gate is strict; both Argon2/OS-RNG feature obligations are stated and verified against the
three crates' manifests; §B1a covers the out-parameter shape; §B6 has central activation; the header and
delimiter rows are now enforced with the header cited by its own line; controls are row-scoped; optional
inputs are copied; and the junction control no longer converts its own regressions into skips. The shipped
mirrors are byte-identical and the diff is whitespace-clean.

The result is still not release-ready, for a reason the commit could not see: the automated apply path
injected JSON-style `\"` escape sequences into two central `SKILL.md` rows, one of them a manifest recipe
that is now invalid TOML, and nothing in the validator detects that class. Around it sit eight
lower-severity findings — two of which correct claims made by Round 14 itself — in §B6 and public-alias
central/module consistency, the permutation obligation's arithmetic, the GFM block-start allowlist, the
state machine's pending-candidate handling, the fixture harness's own documentation, a std-doc
misattribution, and unpinned rule text.

## Executive result

- **No conditional-P1 finding.** The Round-14 conditional-P1 (typed value-vectors) is closed by a
  decode-observable oracle whose worked example was verified against the bincode 2 specification.
- **One P2 finding:** tooling-injected `\"` escape artifacts in `skill/SKILL.md:202` and `:408`, mirrored
  byte-for-byte into the Codex distribution; the `:202` occurrence turns the shown `rand_core` manifest line
  into invalid TOML and drifts from the correct module text. No validator guard exists for the class.
- **Eight P3 findings:** the public-alias sentence now contradicts how `unnameable_types` actually computes
  nameability; §B6 central rows exclude the foreign-enum case the module's first REQUIRED bullet owns; the
  permutation oracle reads as an `n! − 1` schema-construction obligation where pairwise transpositions
  suffice; the link-reference-definition block-start exclusion (and its fixture control) contradicts GFM as
  implemented by cmark-gfm, while indented code blocks are missing; a pending piped candidate followed by a
  pipe-less header escapes; the harness's scope comment and failure messages are stale; `HashSet`'s
  `FromIterator` is credited with documentation it does not have; and B13/B1a/security rule text remains
  unpinned.
- **Two Round-14 claims need ledger rows** (`docs/reviews/README.md`): link reference definitions are not
  GFM block starts that break a table, and rustc's `unnameable_types` does fire on a type leaked only through
  a `pub type` alias — the prior text called that a "false" finding.
- Operationally unchanged: `package.json` still excludes `docs/reviews/` from the tarball the changelog
  points at, and the active Codex installation still matches v0.6.0 in 13/13 tracked skill files.

## P2 finding

### Tooling-injected `\"` escapes corrupted two central trigger rows, one of them a manifest recipe

Locations: `skill/SKILL.md:202` (four occurrences) and `skill/SKILL.md:408` (two occurrences); both mirrored
verbatim into `skills/rust-intel/SKILL.md`.

The corrected password-hash row now carries, inside an inline-code span:

```
rand_core = { version = \"0.6\", features = [\"getrandom\"] }
```

Backslash escapes are not processed inside CommonMark/GFM code spans, and the skill is consumed as raw text
in any case, so the recipe as shipped is not TOML: a value cannot begin with `\`, and `cargo` rejects the
manifest at parse time. The module body this row summarizes, `skill/security.md:42`, has the correct
`rand_core = { version = "0.6", features = ["getrandom"] }` — so this is also a fresh instance of the
central-row/module drift class, introduced by the very commit that was reconciling the two. The F1 row at
`:408` carries the same artifact in prose (`a literal \"every enum variant at any nesting depth\" reading`)
where `skill/semantics-and-conformance.md:19` uses plain quotes.

A search for `\"` across `skill/*.md` returns exactly these six occurrences on two lines; the sequence did
not exist anywhere in the canonical tree before `adee2e9`. The pattern (every `"` inside the affected spans
doubled with a backslash, and only in text that passed through the automated apply path the commit message
describes) is a JSON-string escape leaking into file content. `dev/validate.mjs` has no check for it, and the
mirror-identity check propagates it faithfully to the Codex tree.

Required correction: restore plain quotes on both lines (and the mirror), then add a validator check that
rejects `\"` outside fenced code blocks in `skill/*.md` — there are zero legitimate occurrences today, and
the same apply path will run again for the next round. Sources:
[CommonMark §6.1 code spans](https://spec.commonmark.org/0.31.2/#code-spans) (backslash escapes do not
work inside code spans) and [TOML v1.0.0 strings](https://toml.io/en/v1.0.0#string).

Severity: P2, not conditional-P1 — the shipped recipe is wrong, but the failure is loud (manifest parse
error), not a silent runtime defect.

## P3 findings

| Location | Finding and required correction |
|---|---|
| `skill/lifetimes-and-api.md:124`; mirror; compare `skill/SKILL.md:308` | The amended definition counts `pub type PublicS = hidden::S;` as a naming path, then in the same bullet says `unnameable_types` "catches the reachable-but-not-nameable case above". rustc disagrees with the first half: `rustc_privacy` handles `DefKind::TyAlias` with `self.reach(def_id, item_ev)…ty()`, which marks the aliased type `Level::Reachable`, never `Level::Reexported`; `check_unnameable` fires whenever `reachable_at_vis.is_public() && reexported_at_vis != reachable_at_vis`. So the lint reports `hidden::S` although the module now calls it nameable — tracked as an acknowledged lint false positive in rust-lang/rust#120146 ("Count types leaked through trivial type aliases as reexported"), still open. Say both things: a public alias is a naming path for API-surface/semver purposes, **and** `unnameable_types` will still fire on the aliased type until #120146 lands — silence it deliberately or replace the trivial alias with `pub use`. Also fix the path: a downstream crate names it `the_crate::PublicS`, not `crate::PublicS` (`crate::` is the current crate). Ledger note: Round 14's "the module still creates a false `unnameable_types` finding" inverted the lint's behavior; its remedy (include aliases) stands for the semver definition but needed this caveat. Sources: [`rustc_privacy`](https://github.com/rust-lang/rust/blob/master/compiler/rustc_privacy/src/lib.rs), [rust-lang/rust#120146](https://github.com/rust-lang/rust/issues/120146), [`unnameable_types`](https://doc.rust-lang.org/rustc/lints/listing/allowed-by-default.html#unnameable-types). |
| `skill/SKILL.md:189,404`; compare `skill/data-and-types.md:11-20`; mirror | Both new §B6 rows are scoped to "an enum the crate itself owns" and the code row explicitly excludes "an external/`#[non_exhaustive]` enum". The module's first REQUIRED bullet (`:14`) owns exactly that case: on a foreign enum, "handle the fallback explicitly with a logged/typed error, not silent ignore." A code-only input containing `_ => {}` or `_ => Ok(())` on `std::io::ErrorKind` therefore still never routes to §B6 — the Round-14 activation gap is half-closed. The "Activates" text also says a wildcard "silently swallows every future variant", which mislabels `_ => unreachable!()`/`_ => panic!()` (the module bans them for a different reason: adding a variant compiles silently and then panics in production). Split the row: owned enum → any wildcard hides the new variant at compile time (silent for ignore/`Ok(())`, deferred runtime panic for `unreachable!()`/`panic!()`); foreign/`#[non_exhaustive]` enum → the wildcard is mandatory, and a silent-ignore arm is the finding. Source: [Rust Reference `non_exhaustive`](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute). |
| `skill/SKILL.md:408`; `skill/semantics-and-conformance.md:19`; mirrors | The oracle quantifies over "every non-identity permutation" of a sibling group and the mechanical control says "actually construct the reordered/mutated schema" — read literally, `n! − 1` schema constructions per group (a twelve-field struct: 479,001,599), the same shape of infeasible obligation the commit just removed for depth. It reduces: a permutation escapes only if every moved position decodes to its expectation, which for a canonical encoding means each moved position's byte-vector equals the byte-vector of the position it moved to, and that already makes the transposition of that pair escape. So checking the `C(n, 2)` transpositions of each wire-compatible sibling group is equivalent, and distinct per-position byte signatures are the closed form. State the pairwise reduction (with the canonical-encoding caveat; bincode 2, borsh and postcard fixtures produced by the real encoder are canonical). Separately, "a `u8` sibling needs values outside `0`/`1`" is stated as a necessity but is only a sufficient construction — `(0, 0)` against `(0, 1)` already differs. Source: [bincode 2 specification](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md). |
| `dev/validate.mjs:296-302`; `dev/validate-fixtures.mjs:333-346` | The new `\[[^\]]*\]:` block-start alternative is wrong per GFM as GitHub renders it: cmark-gfm's table `matches()` accepts any non-blank line that parses as a row (`new_row->n_columns`), `open_new_blocks` has no link-reference-definition start, and reference definitions are extracted from **paragraph** content in `finalize()` → `resolve_reference_link_definitions()`. `[probe]: https://…` directly under a table row is therefore a one-cell table row — precisely the pipe-less row this check exists to catch — and control 11 now asserts the wrong semantics (a row whose first cell begins with a bracketed token and colon would, on losing its pipe, flush the table and unprotect every later row). The HTML alternative is right in principle (`scan_html_block_start`, and condition 7 whenever the container is not a paragraph) but bare `<` over-approximates: `<T as Trait>::f \| …` is not a block start. Missing from the allowlist: an indented code block (`indented && !maybe_lazy && !parser->blank`, `maybe_lazy` only under a paragraph), so a ≥4-space line after a table would be falsely reported — the same class as the HTML false positive Round 14 raised. Remove the link-reference alternative and its control; add the indented-code start; tighten `<` to the seven start conditions. Ledger note: Round 14's claim that link-reference definitions are valid GFM starts that break a table is unsupported by the spec ("A link reference definition cannot interrupt a paragraph"; only "beginning of another block-level structure" breaks a table) and contradicted by cmark-gfm. Sources: [GFM tables §4.10](https://github.github.com/gfm/#tables-extension-), [GFM §4.7](https://github.github.com/gfm/#link-reference-definitions), [cmark-gfm `table.c`](https://github.com/github/cmark-gfm/blob/master/extensions/table.c), [cmark-gfm `blocks.c`](https://github.com/github/cmark-gfm/blob/master/src/blocks.c). |
| `dev/validate.mjs:375-379` | Hand trace: line *L* piped, non-delimiter → state `header` (`headerHadPipe = true`); line *L+1* pipe-less, multi-cell, non-delimiter → the `tableState === 'header'` branch flushes and returns **without** registering *L+1* as a pipe-less candidate; line *L+2* delimiter → state is `none`, so a piped delimiter becomes a fresh header candidate and a pipe-less one is registered as a "header"; body rows then each become header candidates and the table never reaches `body`. Result: no header error, no delimiter error, and every later pipe-less body row escapes. Per cmark-gfm's `try_opening_table_header`, *L+1* is the header (the paragraph's last line) when *L+2* matches its cell count. Contrived — it needs a piped non-table line directly above a pipe-less header — but the fix is one line: fall through to the candidate registration instead of returning after the flush. |
| `dev/validate-fixtures.mjs:5-8,139-142,378` | The scope comment still says "seven hand-written controls … two rule-text presence controls"; the file now has eleven controls and nine rule-text controls — the same stale-count defect Round 13 flagged for this comment. The rule-text failure message says "the round-13 correction looks reverted" for the seven Round-14 controls too. The optional-inputs comment says the validator "reads" `.app.json`/`.mcp.json`; `dev/validate.mjs:429-430` only checks their existence. Refresh all three. |
| `skill/data-and-types.md:135`; mirror | "`HashSet`'s `FromIterator` documents nothing beyond the coalescing" credits the impl with a guarantee it does not state: `impl FromIterator<T> for HashSet<T, S>` carries no doc text at all; the coalescing sentence ("If the array contains any equal values, all but one will be dropped") lives on `impl From<[T; N]> for HashSet<T>`. The `HashMap` quotation and the `insert` contracts are verbatim-correct. Say "documents nothing at all; only `From<[T; N]>` states coalescing". Sources: [`HashSet`](https://doc.rust-lang.org/std/collections/struct.HashSet.html), [`HashMap` `FromIterator`](https://doc.rust-lang.org/std/collections/struct.HashMap.html#impl-FromIterator%3C(K,+V)%3E-for-HashMap%3CK,+V,+S%3E). |
| `dev/validate-fixtures.mjs:363-373` | Round 14's residual list — B13, B1a, and the security recipe — is still unpinned; only the rows the commit rewrote got controls. The security omission is the one that bit: a presence control anchored on the clean `rand_core = { version = "0.6", features = ["getrandom"] }` token in `skill/SKILL.md:202` would have failed on the P2 artifact. Add row-scoped controls for the TOCTOU exemption, the §B1a out-parameter witness, and both Argon2/OS-RNG feature tokens. |

## Operational completeness

`package.json` `files` is unchanged (`bin/`, `skill/`, `skills/`, `.codex-plugin/`, `commands/rust-intel-cc/`,
`CHANGELOG.md`, the two licenses), so the tarball still cannot resolve the `docs/reviews/` evidence
`CHANGELOG.md:11` cites — inferred statically this round, not from a pack run. The active
`C:\Users\Computer\.agents\skills\rust-intel` installation matches the `7a567a6`/v0.6.0 blobs in 13/13
tracked skill files and current `adee2e9` in 0/13. The pre-existing untracked `.githooks/` directory was not
inspected as review input, modified, or staged.

## Round-14 closure accounting

| Round-14 item | Status in `adee2e9` |
|---|---|
| Typed value-vectors → decode-observable oracle | **Closed.** `u8`/`bool` witness and the `{ n: 2 }` decode-failure example verified against the bincode 2 spec (`DecodeError::InvalidBooleanValue`); residual: permutation arithmetic (P3). |
| Recursive coverage as an infinite obligation | **Closed.** Finite graph, fixed point, two representatives per recursive edge. |
| Map-guard activation semantic/transitive; producer signatures | **Closed.** Ownership definition, wrappers, `match` bindings, `MappedRef`/`MappedRefMut` (`Ref::map`/`try_map` verified on dashmap 6.2.1), `RefMulti`/`RefMutMulti`; every named scc 3.8.8 return type verified. |
| `JoinSet` admission off by one | **Closed.** Strict `len() < N` pre-insertion, `<= N` post-insertion, `while len() >= N { join_next().await }` idiom. |
| Argon2 recipe missing the OS-RNG feature | **Closed in the module** (`argon2` 0.5.3 `rand = ["password-hash/rand_core"]` is strong-dep syntax, so the line does enable `password-hash`; `password-hash` 0.5.0 pulls `rand_core` with `default-features = false`; `rand_core` 0.6.4 has no default features and `std` implies `getrandom` — all verified). **Corrupted in the central row** (P2). |
| §B1a cache-only functions returning `()` | **Closed.** `:85` and `:489`; the code-pattern row `:311` already covered the shape. |
| Public type alias in the module definition | **Closed textually; now inconsistent with `unnameable_types` mechanics** (P3). |
| Header/delimiter state machine; block-ending allowlist | **Closed for header/delimiter** with own-line citation; **allowlist partially wrong** (P3). |
| Row-scoped controls; C12/F1 controls | **Closed for the named rows** — all nine anchors resolve to exactly one line and every required token is present in the anchored line/section; B13/B1a/security still unpinned (P3). |
| Optional `.app.json`/`.mcp.json` inputs | **Closed.** |
| Junction control over-broad catch | **Closed.** Only `symlinkSync` is skip-worthy; later exceptions fail; env restore is scoped to the created-alias path. |
| Collection survivor overclaim | **Closed**; one doc misattribution remains (P3). |
| §B6 general activation | **Closed for owned enums**; foreign-enum bullet still has no central route (P3). |
| Review evidence in the npm package | **Open.** |
| Active Codex installation | **Open** — still v0.6.0 content. |

## Ten-module coverage record

| Module | Round-15 result |
|---|---|
| Async | Clean. Guard-ownership definition, wrapper/mapped/iterator shapes, per-bucket scc locking sentence ("Each read/write access to an entry is serialized by the read-write lock in the bucket containing the entry"), and all producer signatures verified. |
| Unsafe / FFI | No target-delta change; no regression observed. |
| Concurrency / state | `JoinSet` gate is correct; no other change in the delta. |
| Data / types | §B6 central rows drift from the module's foreign-enum bullet; `HashSet` `FromIterator` doc misattribution. `HashMap` `FromIterator`/`insert` quotations verified verbatim. |
| Security | Module recipe is correct and fully verified against three manifests; the central row's copy of it is invalid TOML (P2). |
| Drop / RAII | No target-delta change; no regression observed. |
| Dependencies / macros / ergonomics | C12 rows unchanged; both C12 presence anchors resolve and their tokens are present. |
| Lifetimes / API | §B1a out-parameter shape closed; alias sentence contradicts `unnameable_types`' effective-visibility computation and mis-spells the downstream path. |
| Testing | Header/delimiter enforcement and own-line citation are correct by trace; block-start allowlist, pending-candidate handling, stale harness prose, and unpinned rule text remain. |
| Semantics / conformance | Decode-observable oracle and finite recursive coverage are correct; permutation obligation over-stated; `\"` artifact in the central row's prose. |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` / `node dev/validate.mjs` | **NOT RUN** — this round was constrained to static review; no pass/fail is claimed. The new state machine was traced by hand against: a header losing its pipe (error cited at the header's own line), a delimiter losing its pipe (both errors, correct lines), a body row losing its pipe at equal/fewer/excess width, `<div>` and `[probe]:` after a table, and the pending-candidate sequence in P3 #5. |
| `node dev/validate-fixtures.mjs` | **NOT RUN** — controls 8–11 and the nine rule-text controls were checked statically: every `rowAnchor` matches exactly one line of its file; every `require` token is present in that line/section; both `forbid` tokens are absent; `expectedLine` for the header (`:302`) and delimiter (`:175`, the 3-column prefix match) controls agrees with the lines the validator would cite. |
| `npm pack --dry-run` | **NOT RUN** — tarball contents inferred from `package.json` `files` only. |
| JS syntax checks | **NOT RUN.** |
| `git diff --check 2011a1b..HEAD` | PASS |
| Canonical `skill/*.md` vs `skills/rust-intel/*.md` | PASS — `cmp` reports all 11 Markdown files byte-identical |
| `\"` scan of `skill/*.md` | FAIL — six occurrences, `skill/SKILL.md:202` (4) and `:408` (2), none elsewhere |
| Review evidence in npm tarball | FAIL (static) — `files` excludes `docs/` |
| Active Codex skill parity | FAIL — 13/13 tracked files match `7a567a6`/v0.6.0; 0/13 match `adee2e9` |
| Primary-source checks | scc 3.8.8 `HashMap` signatures; dashmap 6.2.1 `Ref::map`/`try_map` and `mapref::multiple`; `argon2` 0.5.3, `password-hash` 0.5.0, `rand_core` 0.6.4 `Cargo.toml`; bincode 2 `spec.md`; std `HashMap`/`HashSet` docs; `rustc_privacy` `check_unnameable`/`DefKind::TyAlias` and rust-lang/rust#120146; GFM §4.7/§4.10; cmark-gfm `table.c` `matches()` and `blocks.c` `open_new_blocks` |
| Repository Cargo checks | Not applicable — no `Cargo.toml`; no compilation of any kind this round |
| Tool versions (read-only inspection only) | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2 |

## Recommended correction order

1. Restore plain quotes at `skill/SKILL.md:202` and `:408` (and the mirror); add the `\"` validator guard
   and a security presence control anchored on the clean TOML token.
2. Reconcile §B6 central rows with the module's foreign-enum bullet; rewrite the alias sentence to state
   that `unnameable_types` still fires (#120146) and fix `crate::PublicS`.
3. Reduce the permutation obligation to pairwise transpositions, soften "needs values outside `0`/`1`" to a
   sufficient construction, and correct the `HashSet` doc attribution.
4. Remove the link-reference-definition exclusion and its control, add the indented-code start, narrow `<`,
   register pipe-less candidates after a flushed piped candidate, refresh the harness comment and messages,
   and add B13/B1a controls.
5. Add the two Round-14 ledger rows in `docs/reviews/README.md`; make packaged review evidence resolvable;
   reinstall and byte-verify the active Codex skill only after the corrections land.
