# Final Round 15 review of the latest commits — 2026-09-03 16:53 CEST

- Review range: `2011a1bb4533a29d1961f9de317a85da59c323ba..879490a8565b0fe41c5db9074e11c306cb27d409`
- Implementation range isolated for correctness review: `2011a1bb4533a29d1961f9de317a85da59c323ba..adee2e94d05817d0d0e89d9da4c50744e4ef46d1`
- Commits reviewed:
  - `adee2e9` — `rust-intel: correctness fixes from round-14 independent review`
  - `f0d6db7` — `docs: add round 15 review of latest commits`
  - `d07836a` — `docs: add round 15 review of latest commits`
  - `879490a` — `docs: add round 15 review of latest commits (rush, parallel pass)`
- Combined delta: 19 files, 665 insertions, 71 deletions
- Pre-existing untracked path excluded: `.githooks/`
- Method: **static review only**. Per the request, no project test, validator, fixture, syntax-check, build, installer, or package command was run. The review used revision-qualified diffs, direct source inspection, manual state-machine traces, SHA-256 comparison of canonical/mirrored/installed skill files, and read-only checks of primary upstream sources.
- Verdict: **REQUEST CHANGES**

`adee2e9` closes the substance of the conditional-P1 and the two P2 findings from Round 14. The persisted-layout oracle is now decode-observable, recursive coverage is finite, concurrent-map activation follows guard ownership rather than a narrow syntax list, and the `JoinSet` and Argon2 feature recipes are materially correct. Most of the smaller Round-14 corrections also landed.

The result is not release-ready. Two load-bearing accuracy defects remain: JSON-style `\"` escapes corrupt a copyable TOML recipe in the central skill, and the public-alias paragraph presents `unnameable_types` as matching an alias-inclusive nameability model that rustc still does not implement. The validator rewrite also has false-negative and false-positive paths, while several central triggers lag the module rules they are meant to activate. Of the three preceding Round-15 reports, the first `APPROVED` verdict is superseded; the two later reports contain most of the necessary evidence but disagree on severity and leave no single canonical disposition.

## Executive result

- **No conditional-P1 finding.** Round 14's persisted-layout defect is fixed at the semantic level.
- **Two P2 findings:** the central password-hash recipe contains invalid literal escapes, and the public-alias guidance misstates current `unnameable_types` behavior in a semver-sensitive rule.
- **Eight P3 finding groups:** §B6 routing/remedy drift; §B1a activation drift; an unnecessarily factorial F1 obligation; GFM block-start misclassification; two table-state transition holes; stale/incomplete fixture controls; a `HashSet` documentation misattribution; and incomplete changelog/review-report provenance.
- **Two operational gaps remain open:** the npm package excludes the review evidence cited by its own changelog, and the active Codex installation matches current canonical content in 0/13 tracked skill files.

## P2 findings

### 1. Literal `\"` escapes make the central Cargo recipe invalid

Locations: `skill/SKILL.md:202,408` and `skills/rust-intel/SKILL.md:202,408`.

The password-hash trigger contains the inline-code recipe:

```text
rand_core = { version = \"0.6\", features = [\"getrandom\"] }
```

Backslash escapes are not interpreted inside a Markdown code span, so copying this text produces invalid TOML. The canonical module at `skill/security.md:42` has the correct unescaped form. The same artifact appears in prose in the F1 row. Mirror equality faithfully duplicates the defect and the validator has no guard for it.

The underlying feature advice is otherwise accurate: the official `password-hash` 0.5.0 manifest defines `getrandom = ["rand_core/getrandom"]` and pulls optional `rand_core` with `default-features = false`. Restore plain quotes in both central rows and add a correction-sensitive control for the clean security recipe, preferably together with a narrowly-scoped validator rejection for accidental `\"` in skill prose/code spans.

Sources: [password-hash 0.5.0 Cargo.toml](https://github.com/RustCrypto/traits/blob/password-hash-v0.5.0/password-hash/Cargo.toml), [CommonMark code spans](https://spec.commonmark.org/0.31.2/#code-spans), and [TOML strings](https://toml.io/en/v1.0.0#string).

### 2. Alias-inclusive nameability is correct, but the claimed rustc lint behavior is not

Location: `skill/lifetimes-and-api.md:124` and mirror.

The new language-level rule is right: `pub type PublicS = hidden::S;` gives downstream code a usable public name and therefore creates an API/semver commitment. The example should say `dependency_name::PublicS`, not `crate::PublicS`, because `crate::` refers to the downstream crate itself.

The following claim is not right: that `unnameable_types` catches only the reachable-but-not-nameable case under that alias-inclusive definition. Current `rustc_privacy` compares `Level::Reachable` with `Level::Reexported`; a type alias propagates reachability but does not make the hidden target reexported. Consequently the lint still fires on the alias-exposed type. Rust issue #120146 tracks exactly this mismatch and remains open as of this review.

State both facts explicitly: the alias is a real public naming path and commitment, while `unnameable_types` currently reports this case as a known false positive. A reviewer must not use that lint result as evidence that the alias can be removed compatibly.

Sources: [`rustc_privacy::check_unnameable`](https://github.com/rust-lang/rust/blob/master/compiler/rustc_privacy/src/lib.rs) and [rust-lang/rust#120146](https://github.com/rust-lang/rust/issues/120146).

## P3 findings

### 1. §B6 is only partially routed and its central remedy conflicts with the module

Locations: `skill/SKILL.md:189,404`, `skill/data-and-types.md:11-20`, and mirrors.

Both new central rows cover only enums owned by the current crate. The module also owns the foreign/`#[non_exhaustive]` case: there a wildcard is required, but a silent-ignore/`Ok(())` fallback is the defect. That input still lacks a central activation route. Conversely, the central owned-enum rows offer a “deliberately logged/typed fallback,” while the module requires explicit arms when the enum is owned so a newly added variant causes a compile-time exhaustiveness failure.

Split the routing and remedy by ownership: owned enum → explicit arms; foreign/non-exhaustive enum → mandatory fallback, but it must be intentionally logged or typed rather than silently ignored. Also distinguish silent ignore from `_ => panic!()`/`unreachable!()`: the latter compiles past the new variant and then fails loudly at runtime.

### 2. §B1a's definition was broadened, but its phrase triggers still require a return

Locations: `skill/SKILL.md:176`, `skill/lifetimes-and-api.md:57`, compared with `skill/SKILL.md:85,491` and mirrors.

The corrected witness properly includes a function returning `()` that captures an input borrow through a `&mut` cache argument. However, the central phrase trigger still says “with returned `&T`” and the module trigger still says “caching of returned references.” A request describing only an out-parameter capture can therefore miss the category before the correct body is loaded.

Use the same semantic trigger everywhere: an input-derived borrow captured into a cache/container that outlives the call, whether returned or written through an argument.

### 3. F1 trades an infinite-depth obligation for a potentially factorial schema obligation

Locations: `skill/SKILL.md:408`, `skill/semantics-and-conformance.md:19`, and mirrors.

The finite graph and two-representative recursion rule are sound. The new oracle nevertheless quantifies over every non-identity permutation and recommends constructing the reordered schema. Read literally, that asks for `n! - 1` mutations for an `n`-field sibling group. Under the canonical positional encodings named by the rule, pairwise transpositions are enough: if a larger permutation is observationally invisible, at least two moved positions share the relevant observable signature, so swapping that pair is also invisible. State the `C(n, 2)` reduction or define distinct encoded signatures as the primary closed-form obligation.

The sentence that a `u8` sibling “needs” values outside `0`/`1` is also too strong. Such values are a useful sufficient construction because they force invalid-`bool` decoding, but unequal byte-vectors can already be built within `0`/`1` in some corpora.

### 4. The GFM block-start allowlist is both over- and under-inclusive

Locations: `dev/validate.mjs:296-302`, `dev/validate-fixtures.mjs:333-346`.

`blockStartRe` treats every line beginning with `<` as an HTML block. GFM has seven specific start conditions; a pipe-less table row beginning with inline/generic-looking text such as `<T as Trait>::f | risk` does not automatically meet one of them and can escape the leading-pipe check. The `\[[^\]]*\]:` branch similarly accepts any bracket-colon prefix without requiring a valid label, destination, optional title, or end of definition. Even if a valid reference definition were treated as a boundary by another parser, malformed/reference-looking table cells are false negatives here. The fixture suite contains only positive block-start examples, so it cannot catch either overmatch.

The parser also has no explicit representation of a continuing HTML block and omits some block forms discussed by cmark-gfm, including indented-code handling. Replace the coarse regex with the actual GFM start predicates needed at a table boundary or use the same parser as the rendered target. Add negative controls for `<` and `[label]:` prefixes that do not form a block.

Sources: [GFM HTML blocks](https://github.github.com/gfm/#html-blocks), [GFM link reference definitions](https://github.github.com/gfm/#link-reference-definitions), [GFM tables](https://github.github.com/gfm/#tables-extension-), and [cmark-gfm table extension](https://github.com/github/cmark-gfm/blob/master/extensions/table.c).

### 5. Two state transitions can fabricate a table or lose a valid candidate

Location: `dev/validate.mjs:330-388`.

First, after a piped header candidate and a mismatching piped delimiter, lines 336-341 promote that delimiter to a fresh header candidate even though the comment correctly says GFM recognized no table. A second identical delimiter then confirms a phantom table, and a following pipe-less line is falsely reported as a body row.

Second, when a pending piped candidate is followed by a pipe-less multi-cell header and then a matching delimiter, lines 375-379 flush and return before registering the pipe-less line as the new pending header. The subsequent real table can therefore remain forever outside `body`, allowing later missing-leading-pipe rows to escape.

On a delimiter mismatch, flush without promoting the delimiter. After rejecting a pending candidate, reprocess or fall through so the current line can become the next candidate. Add transition-level controls for both sequences.

### 6. Fixture metadata and correction-sensitive coverage remain incomplete

Location: `dev/validate-fixtures.mjs:5-12,333-383`.

The file header still advertises seven hand-written and two rule-text controls although it now contains eleven and nine. The generic failure text still attributes new controls to the “round-13 correction.” More importantly, the security row, §B1a trigger pair, and B13 exemption remain unpinned. A row-scoped security control requiring the exact unescaped TOML token would have caught the P2 introduced in this commit.

Refresh the self-description and add narrow controls for the changed semantic obligations. Presence checks are not full behavioral oracles, so keep that limitation explicit.

### 7. The `HashSet::FromIterator` wording attributes documentation that is not there

Location: `skill/data-and-types.md:135` and mirror.

The conclusion is correct: `collect::<HashSet<_>>()` has no documented survivor-identity promise. The sentence saying its `FromIterator` implementation “documents nothing beyond the coalescing” is still inaccurate because that implementation has no such documentation at all; the explicit equal-value coalescing sentence belongs to another conversion. Say simply that `HashSet::FromIterator` documents no survivor contract, while the current insertion path keeps the original element.

Source: [std `HashSet`](https://doc.rust-lang.org/std/collections/struct.HashSet.html).

### 8. Changelog and Round-15 provenance are not canonical

Locations: `CHANGELOG.md:37-47`, the three preceding Round-15 reports, and `docs/reviews/README.md`.

The Unreleased changelog summarizes corrective rounds only through rounds 5-7 even though rounds 8-14 changed normative skill text and tooling. `adee2e9` also has no changelog entry. That leaves the public release history materially behind the content being prepared for release.

The three report commits add another ambiguity:

- `f0d6db7` says **APPROVED**, claims validation was run, and says no new defects were found. That verdict is disproved by the literal `\"` artifact and the compiler/parser findings above. Its base `d10427d..adee2e9` also includes the intervening Round-14 report commit while its stated delta counts only the implementation files. It does not satisfy this round's static-only/no-tests constraint.
- `d07836a` uses the correct implementation range and finds most residual issues. Its P2/P3 allocation should be reconciled with the semver impact of the alias/lint mismatch.
- `879490a` usefully confirms the alias and state-machine defects, but its recorded base hash `2011a1b781f0e5bf6c46e04b8d05a5a656835c90` is not the actual Round-14 commit `2011a1bb4533a29d1961f9de317a85da59c323ba`; the quoted range is not reproducible as written.

Treat this final report as the Round-15 synthesis, add ledger rows for corrected Round-14 claims where appropriate, and summarize rounds 8-15 in `CHANGELOG.md` before release.

## Operational completeness

- `package.json` still excludes `docs/reviews/`, while `CHANGELOG.md:11` promises that full evidence lives there. This report infers the package gap from the static `files` allowlist; no pack command was run.
- Canonical `skill/` and `skills/rust-intel/` files are SHA-256-identical for all 13 tracked skill files.
- The active `C:\Users\Computer\.agents\skills\rust-intel` installation matches current canonical content in 0/13 tracked files. Reinstall only after the normative corrections land, then verify parity.
- `.githooks/` was pre-existing, untracked, excluded from review input, and was neither modified nor staged.

## Round-14 closure accounting

| Round-14 item | Final Round-15 disposition |
|---|---|
| Typed value-vectors were not a wire/decode oracle | **Closed.** Decode-observable oracle and bincode counterexample are correct; reduce the residual permutation arithmetic. |
| Recursive coverage was infinite | **Closed.** Finite schema graph and terminating/recursive representatives are sound. |
| Map-guard activation was syntactic/incomplete | **Closed.** Ownership/liveness definition, wrappers, mapped/iterator guards, and corrected SCC producer families are present. |
| `JoinSet` cap was off by one | **Closed.** Strict pre-insertion `len() < N`; `<= N` retained only as the postcondition. |
| Argon2/`OsRng` feature closure | **Closed in the module; corrupted in the central copy.** Both feature obligations are correct, but the copyable TOML has literal escapes. |
| §B1a excluded cache-only functions returning `()` | **Closed in the rule; partial in activation.** Core witness is correct, phrase triggers remain return-gated. |
| Public type-alias nameability | **Closed at the language level; inaccurate for the recommended lint.** Add the rustc #120146 caveat. |
| Header/delimiter/body leading-pipe detection | **Substantially closed; residual state-machine holes remain.** Own-line reporting is fixed. |
| Row-scoped C12/F1/B2/B14 controls | **Closed for the named rows; incomplete for security/B1a/B13 and block-start negatives.** |
| Optional `.app.json`/`.mcp.json` mutation inputs | **Closed.** |
| Junction catch-all converted regressions into skips | **Closed.** |
| Collection survivor identity was overclaimed | **Closed semantically; one documentation attribution remains.** |
| §B6 lacked general activation | **Partial.** Owned-enum path landed; foreign/non-exhaustive routing and remedy separation remain. |
| npm evidence and active Codex install | **Open.** |

## Static verification record

| Check | Result |
|---|---|
| Project tests, validators, fixtures, builds, installer, package dry-run | **NOT RUN**, per the explicit request |
| Implementation diff and three report commits | Read in full/statistically scoped; combined delta 19 files, +665/-71 |
| Canonical vs packaged Codex mirror | 13/13 SHA-256 matches |
| Active Codex installation | 0/13 SHA-256 matches current canonical |
| `password-hash` 0.5.0 feature claim | Confirmed from the official Cargo.toml: own `getrandom` forwards to `rand_core/getrandom` |
| GFM block rules | Checked against the official GFM specification and cmark-gfm source; coarse `<`/bracket-colon matching is not equivalent to the grammar |
| `unnameable_types` alias behavior | Confirmed from current `rustc_privacy`; rust-lang/rust#120146 remains open |
| Package review evidence | Statically absent from the `package.json` `files` allowlist |

## Recommended correction order

1. Remove the literal `\"` artifacts and add the exact security-recipe control.
2. Correct the alias/`unnameable_types` paragraph and record the Round-14 correction in the review ledger.
3. Fix the delimiter-mismatch and lost-candidate transitions; replace the coarse GFM block-start regex and add positive/negative transition controls.
4. Reconcile §B6 and §B1a activation with their module semantics; reduce F1 to pairwise transpositions/encoded signatures; fix the `HashSet` wording.
5. Refresh fixture metadata, changelog and Round-15 provenance, make cited evidence resolvable from the package, then reinstall and byte-verify the active Codex skill.
