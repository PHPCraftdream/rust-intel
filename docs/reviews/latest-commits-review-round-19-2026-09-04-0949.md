# Round 19 review of the latest commits — 2026-09-04 09:49 CEST

## Scope and method

- Review base: `3bce0e1932b0abd281fdf3961092237c5de92dfd`
  (`rust-intel: second-pass fixes from @oh's review of eca76bf`).
- Reviewed head: `7726ed6124f9ff723f7c3882aad4e08d6c394c87`
  (`rust-intel: correctness fixes from round-18 independent review`).
- Range: `3bce0e1932b0abd281fdf3961092237c5de92dfd..7726ed6124f9ff723f7c3882aad4e08d6c394c87` —
  39 commits, 58 files, `+7596/-553`: the three 2026-08 audits, the round 3–18 review reports, the
  round-15 synthesis, the fix-plan, and the normative fix commits `d855da7`, `9d8fc6e`, `a0955f9`,
  `30b1f67`, `a0197be`, `f2b4897`, `31a3505`, `5417d3c`, `d10427d`, `adee2e9`, `1591d39`,
  `91077f4`, `e76c372`, `7726ed6`.
- Method: static, revision-qualified Git inspection only. Every changed normative and tooling file
  was read in full at `HEAD` (`skill/SKILL.md`, all ten theme modules,
  `skill/references/sources.md`, `dev/validate.mjs`, `dev/validate-fixtures.mjs`,
  `docs/reviews/README.md`, the `[Unreleased]` section of `CHANGELOG.md`); the remaining changed
  files (`skill/audit-project.workflow.js`, `README.md`, `package.json`, `.gitignore`,
  `.github/workflows/npm-publish.yml`) were read as their range diffs; the module and `SKILL.md`
  deltas were additionally read as `git diff -U0 --word-diff` so every clause introduced in the
  window was seen next to what it replaced. The validator's fence, table, category-count and mirror logic was hand-traced. External
  claims were checked against primary sources (docs.rs API pages and feature manifests, crate
  changelogs, RustSec advisory pages, `releases.rs`, the GFM specification, the cmark-gfm
  `scanners.re` source, the Rust Reference, the serde and rustls sources via the GitHub API).
- Per the explicit request, no test, validator, fixture runner, build, installer, package command or
  other project executable was run, and no sub-agents were spawned. This report makes no dynamic
  pass claim.
- Mirror parity was established from the index, not by running `dev/sync-mirror.mjs`: `git ls-files -s`
  reports byte-identical blob hashes for all 13 files under `skill/` and `skills/rust-intel/`, and the
  working tree is clean against `HEAD` for `skill/`, `skills/`, `dev/`.

## Executive result

- **No P1 finding.**
- **No P2 finding.** The round-16 conditional-P1 (`§F1` pairwise reduction) stays correctly closed:
  the three-cycle arithmetic was re-derived from the bincode 2 layout and every table entry in
  `skill/SKILL.md:410`, `skill/semantics-and-conformance.md:19` and the ledger row is right.
- **Six P3 finding groups**, four in the tooling/changelog layer and two in normative text:
  the table-boundary classifier still uses ECMAScript whitespace (the exact class rounds 17–18
  removed from the fence regexes); the fixture suite's self-description is stale again; the
  `[ \t]*` closer suffix is attributed to the GFM spec text, which actually says "spaces"; the
  changelog carries a wrong Rust 1.100 date and no record of the round-16 tooling and round-17
  fixes; `SKILL.md:8` folds associated constants into the `where Self: Sized` escape hatch; and the
  §C10 rustls worked example states an unreleased major (`0.24`) as shipped fact.
- **Round-18 closure:** both P3 findings are closed exactly as requested; the accepted
  top-level-only fence limitation remains disclosed and unchanged.
- **Primary-source verification:** every crate/version/advisory/toolchain claim introduced in the
  window that was checked (listed in the verification record) matched its source. No factual error
  was found in the normative rule text beyond the two P3 precision items above.
- Overall verdict: **REQUEST CHANGES** (P3-only, consistent with the calibration rounds 17–18
  applied); nothing here weakens a shipped rule.

## P3 findings

### 1. `blockStartRe` and the blank-line test still classify by ECMAScript `\s`

Locations: `dev/validate.mjs:322` (`blockStartRe`), `dev/validate.mjs:376-377` (`line.trim()`),
`dev/validate-fixtures.mjs:336-371` (no control exercises the class).

Rounds 17 and 18 replaced `\s` with literal spaces / `[ \t]` in the fence opener and closer because
ECMAScript `\s` admits form feed, vertical tab, non-breaking space and the Unicode separators that
GFM never treats as indentation or marker whitespace. The table machine's block-start classifier was
not brought along. `blockStartRe` still reads

```js
/^\s{0,3}(#{1,6}(?:\s|$)|```|~~~|>|[-*+](?:\s|$)|\d{1,9}[.)](?:\s|$)|((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$|<)/
```

— five `\s` positions (leading indentation, ATX suffix, bullet suffix, ordered-marker suffix,
thematic-break interior) — and the "blank line ends the table" test is `line.trim() === ''`, where
`String.prototype.trim` strips every Unicode `White_Space` character, not GFM's space/tab.

cmark-gfm's grammar is narrower on every one of those positions: `_scan_atx_heading_start` is
`[#]{1,6} ([ \t]+|[\r\n])`, list markers need a space/tab (or EOL), thematic breaks allow only
"spaces or tabs" between marker characters, indentation is spaces with tab expansion, and a blank
line "contain[s] no characters, or only spaces or tabs". Meanwhile the table extension's `matches()`
keeps a table open for any line that parses as a row with `n_columns >= 1`, and a block start ends
it only if a real block start is recognized. So each of the following pipe-less lines placed directly
under a body row is a **table row** to cmark-gfm but a silent block boundary to the validator
(state flushed, no leading-pipe error):

| Line after a body row | Validator | cmark-gfm |
|---|---|---|
| ` - item` (U+00A0 non-breaking space, then a bullet) | block start (`\s{0,3}` + `[-*+]\s`) | one-cell row — should be flagged |
| `# Heading` (U+00A0 after `#`) | ATX heading (`#{1,6}\s`) | not a heading (`[ \t]` required) — row |
| `\f` followed by three backticks | fence start | no fence (`\f` is not indentation) — row |
| a line consisting only of ` ` or `\f` (U+00A0 or form feed) | blank, flush | not blank — one-cell row |

None of these shapes exist in `SKILL.md` today, so there is no live exposure; this is the same
validator-robustness class as rounds 17–18, left half-corrected. Primary references:
[GFM §2.1 / §4.1 / §4.2 / §5.2](https://github.github.com/gfm/),
[cmark-gfm `scanners.re`](https://github.com/github/cmark-gfm/blob/master/src/scanners.re),
[ECMAScript `String.prototype.trim` / `CharacterClassEscape :: s`](https://tc39.es/ecma262/).

Correction: replace `\s` with ` ` / `[ \t]` in `blockStartRe` (indentation as ` {0,3}`, marker
suffixes as `(?:[ \t]|$)`, thematic-break interior as `[ \t]*`), test blankness with
`/^[ \t]*$/` instead of `trim()`, and add two negative controls (an NBSP-prefixed bullet and an
NBSP-only line directly after the `Rc<RefCell<...>>` row, both expected to be flagged as
pipe-less rows).

Secondary note in the same mechanism: unlike the escape guard, the table machine is not
fenced-code-aware — a ```` ``` ```` line flushes state, but the lines inside the fence are then
scanned as candidate rows. A future fence in `SKILL.md` that contains a Markdown table example
(`| a | b |`, `|---|---|`, `x | y`) would raise a spurious leading-pipe error. The two fences
present today (`skill/SKILL.md:52-58`, `:506-533`) contain no pipe, so this is disclosed debt,
not a live defect; a one-line fence-state skip reusing `fenceCloser()` would close it.

### 2. The fixture suite's self-description is stale again

Location: `dev/validate-fixtures.mjs:5`.

The header still says "twenty hand-written controls". Counting the numbered blocks at `HEAD`:
Controls 1–3 (README), 4 (junction), 5 (leading pipe), 6–7 (width variants), 8–12
(header/delimiter/three block-boundary probes), 13–15 (empty heading/list/tab expansion), 16–20
(five fence-state probes), 21–22 (two invalid-opener probes) = **22**. The round-17 commit did
update this sentence (`seventeen` → `twenty`, +3); the round-18 commit added two controls and
renumbered the comments (`16-18` → `16-20`, `19-20` → `21-22`) but not the header. The "thirteen
rule-text presence controls" count is still correct (13 entries in `ruleTextControls`).

This is precisely the hand-maintained-count drift the validator's own category-count check exists
to catch in the spec; the fixture file has no equivalent guard for itself. Correction: `twenty` →
`twenty-two`, or derive the number in the message from the control arrays.

### 3. The `[ \t]*` closer suffix is attributed to the GFM spec text, which says "spaces"

Locations: `dev/validate.mjs:488-489` (comment: "GFM §4.5: a closer … followed only by spaces or
tabs"), `CHANGELOG.md:57` ("narrows … to GFM's exact suffix class"),
`docs/reviews/README.md:31` (cites cmark-gfm correctly).

The behaviour is right: cmark-gfm's `_scan_close_code_fence` is `` [`]{3,} / [ \t]*[\r\n] `` /
`[~]{3,} / [ \t]*[\r\n]`, and CommonMark ≥ 0.30 reads "followed only by spaces or tabs". But the
document the comment cites — the GFM specification (version 0.29-gfm, the only published GFM spec
text) §4.5 — says: "The closing code fence may be indented up to three spaces, and may be followed
only by spaces, which are ignored." The tab allowance is the reference *implementation's*
behaviour (and later CommonMark), not GFM §4.5's. Round 17's review quoted the spec correctly
("only trailing spaces"); round 18's finding cited the scanner; the fix commit's comment merged
the two into a misattributed quote.

Also worth one line in the same comment: the `[ \t]*$` closer is CR-intolerant by design (round 18
suggested `\r?`; the fix declined on the grounds that no tracked file has CR). That is true today —
`git ls-files --eol` shows all 36 scanned files as `i/lf w/lf` — and it is *guaranteed* rather than
incidental only because `.gitattributes` pins `* text=auto eol=lf`. The comment should name that
invariant, since a checkout without the attribute (a copied tree, a downstream fork) would leave
every fence open from its first opener and silently disable the guard for the rest of the file.

Correction: cite cmark-gfm's scanner (and/or CommonMark 0.30 §4.5) for "spaces or tabs" rather than
GFM §4.5; state the `eol=lf` dependency next to the regex.

### 4. `CHANGELOG.md` `[Unreleased]`: a wrong Rust 1.100 date and an incomplete round record

Locations: `CHANGELOG.md:22`, `:51`, `:57`.

(a) Line 22: "Item 6.19 (Cargo `global-min-publish-age`) is gated on Rust 1.100 shipping
(~2026-09-24)". Per `releases.rs` on 2026-09-04: stable is 1.98.1 (1.98.0 shipped 2026-08-20),
beta 1.99.0 ships **2026-10-01**, nightly 1.100.0 ships **2026-11-12**. 2026-09-24 is not a Rust
release date at all (the six-week cadence from 1.98.0 gives 10-01 and 11-12). The same wrong date
appears in `docs/reviews/currency-audit-2026-08.md:370` (M3) and `docs/reviews/fix-plan-2026-08.md:262`
(6.19), from which the changelog copied it. The gating decision itself is right — the stabilization
PR targets 1.100 — only the date is wrong, by seven weeks.

(b) The paragraph at line 51 is headed "Eight further review rounds (rounds 8–15)" and lists the
fix commits through `adee2e9` and the round-15 synthesis, yet its bullets now also carry the round-16
`§F1` correction (line 54) and the round-18 fence-suffix fix (line 57). Two normative fix commits in
the range are recorded nowhere in the changelog: `e76c372` (round 17: literal-space fence
indentation in both fence regexes, rejection of a backtick-fence opener whose info string contains
a backtick, three new controls, the ledger-row rewording) and the tooling half of `91077f4` (round
16: fence marker/length state replacing the boolean toggle, `blockStartRe` end-of-line
heading/list markers, column-based tab expansion, five new controls). `docs/reviews/README.md`'s
own quality gate requires "a post-merge regression record in a **committed** artifact — the
release's `CHANGELOG.md` entry"; the round-16 and round-17 tooling changes currently have none.

(c) Minor: line 21 says "two Cargo CVEs (2026-33056, 2026-5222/-5223)" while naming three
identifiers (four with CVE-2026-33055, which `references/sources.md:122` includes); "two rounds of
Cargo advisories", as `sources.md` phrases it, is the accurate count.

Correction: fix the date (or drop it and say "when 1.100.0 ships, scheduled 2026-11-12"); retitle
the paragraph to cover rounds 8–18 and add a sentence each for the round-16 tooling half and
round 17; reword (c).

### 5. `SKILL.md:8` gives associated constants a `where Self: Sized` escape hatch they do not have

Location: `skill/SKILL.md:8` (scope line, second exception), mirrored byte-identically.

The sentence reads: "adding a method that is not dyn-dispatchable — generic over types, lacking a
`self` receiver, mentioning `Self` outside the receiver, an opaque return (`async fn`,
`-> impl Trait`), or an associated const — additionally strips the trait's dyn-compatibility
**unless it carries `where Self: Sized`** (verified against rustc: none of these six shapes need to
be generic to trigger E0038 …)".

Per the Rust Reference's dyn-compatibility rules, "It must not have any associated constants" is an
unconditional condition of the *trait*; the "explicitly non-dispatchable" `where Self: Sized`
opt-out is defined only for associated *functions*. An associated const is not a method, cannot be
made non-dispatchable, and — on stable — cannot carry a `where` clause at all (that syntax is the
unstable `generic_const_items` feature). A reader following the sentence literally would write
`const N: usize where Self: Sized;` expecting to keep `dyn Trait`; it does not compile. The
underlying claim the round-3 ledger row fixed (a by-value `self` method does not by itself break
`dyn`) is unaffected.

Primary reference: [Rust Reference — Dyn compatibility](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility)
(conditions 3 and 5).

Correction: split the const out — "…or an opaque return — strips dyn-compatibility unless it
carries `where Self: Sized`; adding an associated const strips it unconditionally (no opt-out
exists)" — and count the shapes accordingly.

### 6. §C10's rustls worked example states an unreleased major as shipped fact

Location: `skill/deps-macros-ergonomics.md:118`, mirrored byte-identically.

"From 0.24 the provider must be passed explicitly to the builder (compile-time), so this shape is
specific to the 0.23 window." As of 2026-09-04 rustls **0.24 has not shipped**: the latest release
is `v/0.23.43` (2026-07-29, GitHub releases), and docs.rs lists only `0.24.0-dev.0` (2026-01-28)
and `0.24.0-dev.1` (2026-07-23, failed to build). The technical content is consistent with the
main branch — `rustls/src/client/config.rs:196` on `main` is
`pub fn builder(provider: Arc<CryptoProvider>) -> ConfigBuilder<Self, WantsVerifier>`, versus
`pub fn builder() -> …` plus `builder_with_provider(...)` at `v/0.23.43`
(`rustls/src/client/client_conn.rs:315,354`) — but it is a pre-release API, and the module's own
§A1 rule is that an API not verified against a *released, pinned* version is stated as an
assumption, not as fact. A reader on the day 0.24.0 ships with a different builder signature would
be misled by a sentence the spec presents as settled.

Correction: "the `0.24` development line (pre-release as of 2026-09; `0.24.0-dev.*`) passes the
provider to `builder(...)` explicitly — verify against the released 0.24 when it exists".

### Minor precision notes (P3, wording only)

- `skill/async.md:17`: "`entry()`/`try_entry()` return the `Entry` enum itself" — on dashmap 6.2.1
  `try_entry()` returns `Option<Entry<'_, K, V>>`; `SKILL.md:208` and `:306` already phrase this
  neutrally ("from `entry()`/`try_entry()`").
- `skill/references/sources.md:276` dates quick-xml RUSTSEC-2026-0195 as 2026-06-29; the RustSec
  page and package index show it issued 2026-07-02 (RUSTSEC-2026-0194 likewise 2026-07-02). Verify
  which date field the entry intends.

## Round-18 closure matrix

| Round-18 item | Round-19 disposition |
|---|---|
| `fenceCloser()` trailing class wider than cmark-gfm | **Closed.** `dev/validate.mjs:495` is `` /^ {0,3}(`{3,}\|~{3,})[ \t]*$/ ``; a hand-trace leaves the fence open on a three-backtick line followed by a space and a form feed, and closes it on three backticks with zero to three leading spaces or on four backticks; the form-feed control at `dev/validate-fixtures.mjs:385` exercises exactly the round-18 counterexample. Only the citation is off (finding 3). |
| Missing tab-indented fake-closer control | **Closed.** `dev/validate-fixtures.mjs:386` adds it as an in-fence positive control; the tab-prefixed fence line fails `^ {0,3}`, so the fence stays open and the following `\"` is unflagged, as intended. The diagnostic at `:415` now spells `\\"`. |
| Round-17 accepted debt: top-level-only fences | **Unchanged and disclosed** (`dev/validate.mjs:493`). No nested fence exists in any `skill/*.md`; no mechanical enforcement was added. Not re-raised. |
| Round-18 recommendation 4: dynamic run in a non-read-only round | Out of this round's scope; the fix commit message records reverting each half of the closer fix and re-running the fixtures. |

## Static verification record

| Check | Result |
|---|---|
| Reviewed commit count | 39 (`3bce0e1..7726ed6`) |
| Changed non-review files | 21 in the range (13 mirror copies aside): 16 read in full at `HEAD`, 5 as range diffs (see Scope); word-diffs of every module and `SKILL.md` |
| Canonical `skill/` vs `skills/rust-intel/` | 13/13 index blob hashes identical (`git ls-files -s`); working tree clean vs `HEAD` for `skill/`, `skills/`, `dev/` |
| Line endings | all 36 tracked files under `skill/`, `skills/`, `dev/` plus `README.md`, `CHANGELOG.md`, `docs/reviews/README.md` are `i/lf w/lf`; `.gitattributes` `* text=auto eol=lf`; `core.autocrlf=input` |
| Numbered-category count | 59, re-derived from `## §<LETTER><DIGITS>.` headings (A 3, B 29, C 12, D 5, E 6, F 4); lettered sub-sections correctly excluded by the regex |
| Fence guard hand-trace | Opener `^ {0,3}` + backtick-free info string; closer marker/length/`[ \t]*` — all consistent with cmark-gfm `scanners.re` |
| Table machine hand-trace | Header/delimiter/body transitions, `[x]:` row, indented-code and empty-marker boundaries consistent with cmark-gfm `add_child` finalization; `\s` residue per finding 1 |
| §F1 three-cycle arithmetic | Re-derived: `01 02 01 02` under `b,c,a` → `b=1,c=2,a=[1,2]` (unchanged); `03 04 05 06` → `b=3,c=4,a=[5,6]`; all three transpositions detectable; `{n:2,flag:false}` under `{flag,n}` fails on invalid `bool` |
| jsonwebtoken | 10.4.0 docs: `insecure_disable_signature_validation` deprecated since 10.1.0 → `dangerous::insecure_decode`; 11.0.0 docs: method absent, `dangerous` module present, `aud`/`iss` default `None`, `algorithms` default `[HS256]`; features: only `use_pem` default, `rust_crypto`/`aws_lc_rs` opt-in |
| password-hash / argon2 | 0.6.1: `generate_salt`/`try_generate_salt` and `hash_password` behind `getrandom`, `hash_password_with_rng` behind `rand_core`; 0.5.0: `default = [rand_core]`, `rand_core` does not enable `getrandom`, separate `getrandom` feature; argon2 0.5.3: `rand` → `password-hash/rand_core`, no `rand_core`/`getrandom` feature |
| rand | 0.10.0 changelog: `OsRng`→`SysRng`, `Rng`→`RngExt` (`RngCore`→`Rng`), `from_os_rng` removed, `make_rng` added, `from_rng`→`try_from_rng`; `rngs` lists `SysRng` (`sys_rng` feature), `StdRng`, `SmallRng`; RUSTSEC-2026-0097 patched ≥ 0.8.6 / 0.9.3 / 0.10.1 |
| reqwest 0.13.4 | `danger_accept_invalid_certs`/`_hostnames` deprecated → `tls_danger_accept_invalid_*`; `tls_certs_only`/`tls_certs_merge(impl IntoIterator<Item = Certificate>)`; `add_root_certificate` deprecated; `resolve`/`resolve_to_addrs`; `redirect(Policy)` |
| sqlx 0.9.0 | `query(sql: impl SqlSafeStr)`; `AssertSqlSafe` and `SqlSafeStr` at crate root |
| RustSec floors | lru 2026-0002 (≥ 0.16.3) and 2026-0253 (≥ 0.18.2, panic in `pop()` → UAF); anyhow 2026-0190 (≥ 1.0.103); ammonia 2025-0071/2026-0193/2026-0213 (≥ 4.1.4); quick-xml 2026-0194/0195 (≥ 0.41.0); tar 2026-0067/0068 (≥ 0.4.45, CVE-2026-33056); zip 2025-0168 (≥ 2.3.0); bincode 2025-0141, backoff 2025-0012 (→ backon), serde_yml 2025-0068 (unsound; serde_norway/serde_yaml_ng named), async-std 2025-0052 (→ smol), derivative 2024-0388 (derive_more/derive-where/educe) — all as stated |
| Supply-chain incident | Rust blog 2026-08-20: arrayref 0.3.10 (86 min), append-only-vec 0.1.9 (107 min), internment 0.8.7 (90 min), malicious deps `proc-macro1`, `arone`, … — matches `deps-macros-ergonomics.md:40`; RUSTSEC-2026-0259 is the `arone` advisory, consistent with the `0259–0266` range |
| Rust toolchain dates/lints | 1.88 (2025-06-26: let chains, `dangerous_implicit_autorefs` warn, `invalid_null_arguments`); 1.89 (2025-08-07: `dangerous_implicit_autorefs` deny, `mismatched_lifetime_syntaxes`, `File::lock`/`try_lock`/`lock_shared`, i128/u128 FFI-safe, `repr(u128)`); 1.91 (2025-10-30: `floor_char_boundary`, `strict_*`, both lints); 1.93 (2026-01-22: `Vec::into_raw_parts`, `unchecked_shl/shr/neg`, `function_casts_as_integer`, `deref_nullptr` deny); 1.94 (2026-03-05: `SystemTime` Windows-epoch `None`, runtime `CARGO_BIN_EXE_*`); 1.94.1 (2026-03-26: tar 0.4.45, CVE-2026-33055/33056); 1.95 (2026-04-16: `cfg_select!`, `bool: TryFrom<{integer}>`, `if let` guards, non_exhaustive discriminant read); 1.96 (2026-05-28: `assert_matches!`, CVE-2026-5222/5223); 1.97 (2026-07-09: `build.warnings`); 1.98 (2026-08-20: `c_void_returns`, `invalid_runtime_symbol_definitions` deny + `suspicious_…` warn, `format_into`/`NumBuffer`; no `read_buf` stabilization) — all as stated in Version pins / modules |
| clippy 1.93–1.98 | Every lint/group in `SKILL.md:462` matches clippy's `CHANGELOG.md` (1.94 pedantic pair; 1.95 `manual_checked_ops` complexity, `duration_suboptimal_units` pedantic, `disallowed_fields` style; 1.96 two complexity lints; 1.97 two pedantic + `useless_borrows_in_formatting` perf + both group moves; 1.98 five lints in the stated groups) |
| tokio | 1.39.0 yanked → 1.39.1 (`consume_budget`); 1.44.0 `task::coop`; 1.46.0 `biased` in `join!`/`try_join!`; 1.47.0 `SetOnce`; `JoinSet` (1.53.1) exposes every method named in `SKILL.md:371`, implements `Extend`/`FromIterator` ("equivalent to calling `JoinSet::spawn` on each element"), no `Stream`; `Notify` docs: "can only happen if there are two concurrent calls to `recv`", `notify_waiters` stores no permit |
| scc 3.8.8 / dashmap 6.2.1 | Every return type in `async.md:17` and `SKILL.md:208/306` matches (`entry_*` → `Entry`, `get_*`/`begin_*`/`any_*` → `Option<OccupiedEntry>`, `replace_*` → `ReplaceResult`, `try_entry` → `Option<Entry>`; dashmap `mapref::{entry,one,multiple}` types, `RwLock` shards) |
| serde `Content` | `private/de.rs` on `master`: no `U128`/`I128` variant — the §B20 `flatten` claim holds |
| GFM / cmark-gfm | Spec §4.5 closer text "followed only by spaces"; `scanners.re` closer `[ \t]*[\r\n]`, opener info string backtick-free, ATX `([ \t]+\|[\r\n])` — findings 1 and 3 derive from this |
| Rust 1.99/1.100 dates | `releases.rs`: 1.99.0 → 2026-10-01, 1.100.0 → 2026-11-12 — finding 4(a) |
| rustls | Releases: latest `v/0.23.43` (2026-07-29); docs.rs: `0.24.0-dev.0/dev.1` only; `main` `config.rs:196` `builder(provider: Arc<CryptoProvider>)` vs `v/0.23.43` `client_conn.rs:315` `builder()` — finding 6 |
| Rust Reference dyn compatibility | "must not have any associated constants" unconditional; `where Self: Sized` opt-out defined for functions only — finding 5 |
| Tests/validators/fixtures/build/install/package | **NOT RUN**, per request |
| Sub-agents | Not used |
| Pre-existing `.githooks/` | Untracked, excluded, not modified or staged |

## Recommended correction order

1. Finding 1 — bring `blockStartRe` and the blank-line test to `[ \t]`, add the two NBSP controls
   (same mechanism as the round 17–18 fixes; one small commit).
2. Finding 4 — fix the 1.100 date, retitle the rounds paragraph, record the round-16 tooling half
   and round 17 (and the round-19 fixes when they land).
3. Findings 5 and 6 — the two normative wording corrections in `SKILL.md:8` and
   `deps-macros-ergonomics.md:118`, re-mirrored.
4. Findings 2 and 3 — the fixture header count and the closer-suffix citation / `eol=lf` note.
5. In a later non-read-only round, run the normal validation workflow and re-verify the active
   Codex installation; this round intentionally supplies static evidence only.
