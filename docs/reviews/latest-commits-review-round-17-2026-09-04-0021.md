# Round 17 review of the latest commit — 2026-09-04 00:21 CEST

- Review range: `b0f381f7fb515da4cf1f8159a69abb39ae9e9036..91077f45337aae9eb4276d8acaed0f9eb57df643`
- Commit reviewed: `91077f45337aae9eb4276d8acaed0f9eb57df643` —
  `rust-intel: correctness fixes from round-16 independent review`
- Combined delta: 8 files, 85 insertions, 16 deletions.
- Pre-existing untracked path excluded: `.githooks/`.
- Method: **static review only**. Per the request, no project test, validator, fixture,
  syntax-check, build, installer, or package command was run. Evidence came from revision-qualified
  Git inspection, direct source reading, manual state traces, SHA-256 comparisons, and the official
  GFM specification.
- Coverage boundary: bounded single-context diff review. All eight changed files were read;
  unchanged async, unsafe/FFI, concurrency, data/types, security, drop/RAII, dependencies/macros,
  lifetimes/API, and testing modules were not re-audited in this round.
- Verdict: **REQUEST CHANGES**.

The conditional-P1 correction is now sound in the repository: the false pairwise-permutation
equivalence is gone, the exact proposed layout is the mechanical check for an actual change, the
full permutation property remains for a proactive corpus, and the three-cycle counterexample is
preserved in the module, central trigger, changelog, and correction ledger. The GFM table-boundary
fix also correctly handles effective indentation columns and end-of-line heading/list markers.

No new P1 or P2 remains in the committed repository content. Three P3 groups keep the result from
approval: the escape guard still accepts invalid fence openers/closers, the new ledger row describes
the counterexample's consequence inaccurately, and the active Codex installation still contains
the pre-fix §F1 text in exactly the two changed skill files.

## Executive result

- **No P1/conditional-P1 finding in the committed tree.** Round 16's persisted-format defect is
  correctly fixed at `HEAD`.
- **No P2 finding.** The concrete normative remedy is accurate and mirrored.
- **Three P3 finding groups:** incomplete GFM fence parsing, an inaccurate ledger sentence, and a
  stale active Codex installation.
- **Round-16 closure:** conditional-P1 finding closed in the repository; table-boundary P3 closed;
  escape-guard P3 partial; deployment remains incomplete.

## P3 findings

### 1. The escape guard still treats invalid GFM fence prefixes as real fenced blocks

Locations:

- `dev/validate.mjs:485-508`
- `dev/validate-fixtures.mjs:373-390`

The new state object correctly remembers the opener's marker and length, and `fenceCloser()`
correctly rejects a shorter or wrong-marker closer. That closes the two cases covered by the new
fixtures. Opening-state recognition remains broader than GFM in two independently observable ways.

First, both opener and closer regexes begin with `^\s{0,3}`. GFM permits zero to three **spaces**,
not arbitrary whitespace. A leading tab advances to column 4 and makes the line indented code, not
a fenced-code delimiter. The current scanner nevertheless opens on `\t```` and closes a real fence
on `\t````. The first form can hide a later prose `\"` false negative; the second can expose a
legitimate code example to a false positive.

Second, the opener regex stops immediately after the marker run:

```js
const run = line.match(/^\s{0,3}(`{3,}|~{3,})/);
```

For a backtick fence, GFM forbids every backtick in the info string. A line such as
````text
```lang`invalid
````
is not an opening fence, but the guard enters fenced state and suppresses later `\"` findings until
some matching closer-looking line. Round 16 explicitly requested a control for this case; the new
fixture set adds only the shorter-closer and wrong-marker controls. It also omits the requested
trailing-text and container-nested cases. The source comment discloses that only top-level fences
are supported and a static scan confirms no current skill fence is nested, so the container gap is
transparent technical debt; the tab and invalid-info cases are unqualified false classifications.

The primary grammar is [GFM §4.5, Fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks):
an opener is indented by at most three spaces, a backtick info string contains no backtick, and a
closer uses the same marker with sufficient length and only trailing spaces.

Required correction:

1. Use literal spaces (`^ {0,3}`), not `\s`, for top-level fence indentation.
2. When opening a backtick fence, reject a remainder containing a backtick; tilde-fence info remains
   unrestricted by that rule.
3. Add negative/positive controls for a tab-indented fake opener and closer, a backtick in the info
   string, and trailing non-space text on a would-be closer. Either implement container-aware state
   or mechanically enforce the documented top-level-only invariant.

### 2. The correction-ledger row says the unchanged fixture is silently remapped

Location: `docs/reviews/README.md:30`.

The row first states, correctly, that the `a=[1,2], b=1, c=2` fixture decodes under order `b,c,a`
back to the same named values. It immediately describes this as "silently remapping an
already-deployed record." That specific record is not remapped; its unchanged decode is why the
pairwise-only corpus remains green. The actual hazard is that another value under the same schema,
such as `a=[3,4], b=5, c=6`, is remapped even though the calibration fixture and all pairwise checks
gave no warning. The normative module and central trigger include that second record and are
accurate; only the ledger compresses the causal chain into a contradiction.

Rewrite the clause to say that the fixture remains unchanged, allowing the pairwise corpus to pass
while other deployed values can be remapped, and include or link the second-record witness. This is
provenance accuracy, not a remaining defect in the live §F1 rule.

### 3. The active Codex installation still ships the old conditional-P1 wording

Locations:

- canonical: `skill/SKILL.md`, `skill/semantics-and-conformance.md`
- installed: `C:\Users\Computer\.agents\skills\rust-intel\SKILL.md`,
  `C:\Users\Computer\.agents\skills\rust-intel\semantics-and-conformance.md`

Static SHA-256 comparison gives:

- canonical vs repository Codex mirror: **13/13 matches**;
- canonical vs active installation: **11/13 matches**;
- the two mismatches are exactly `SKILL.md` and `semantics-and-conformance.md`.

The installed copies still contain Round 15's false `C(n, 2)` equivalence. Thus the commit fixes
the repository and package source but not the Codex instance currently consuming the skill. This
remains P3 under the project's established operational calibration, even though the stale content
is the former conditional-P1 guidance. Reinstall and byte-verify in a non-read-only round after the
remaining repository corrections land.

## Round-16 finding closure

| Round-16 item | Round-17 disposition |
|---|---|
| False pairwise reduction in §F1 | **Closed in repository.** Exact-proposed-layout check, full proactive permutation property, stronger-premise caveat, counterexample, changelog, and ledger are present. Active installation is stale; see P3 finding 3. |
| Escape guard did not track real fence state | **Partial.** Marker and length are tracked; GFM indentation and backtick-info constraints remain wrong, and requested controls are incomplete. |
| `blockStartRe` missed empty headings/lists and tab-expanded indentation | **Closed.** Effective-column calculation and marker-followed-by-EOL alternatives are correct for the stated table-boundary purpose; three focused controls were added. |
| Accepted bare-`<` approximation | **Unchanged by design.** Still documented and accepted, with no live canonical exposure. |
| Review/changelog provenance for the pairwise error | **Substantially closed.** Both artifacts were updated; the ledger's consequence sentence needs the P3 wording fix above. |

## Static verification record

| Check | Result |
|---|---|
| Tests, validators, fixtures, syntax checks, builds, installers, package commands | **NOT RUN**, per the explicit request |
| Reviewed range | One commit, 8 files, +85/-16 |
| All changed files | Read directly and traced against every Round-16 required correction |
| §F1 exact-layout remedy | **Correct** in canonical module and central trigger |
| Canonical `skill/` vs `skills/rust-intel/` | **13/13 SHA-256 matches** |
| Canonical `skill/` vs active installation | **11/13 SHA-256 matches**; both §F1-bearing files are stale |
| New table-boundary logic | Static trace agrees with GFM tabs/headings/list boundary rules |
| New fence logic | Marker/length cases close; tab indentation and invalid backtick info string remain open |
| Current canonical literal `\"` occurrences | None found outside or inside fences by direct text search |
| Current nested skill fences | None found by static pattern search; unsupported future shape remains documented |
| `.githooks/` | Pre-existing, untracked, excluded, not modified or staged |

## Recommended correction order

1. Tighten fence opener/closer recognition and add the missing adversarial controls.
2. Correct the ledger's unchanged-fixture/remapped-other-record sentence.
3. In a later non-read-only round, run the normal validation workflow, reinstall the active Codex
   skill, and verify 13/13 parity. This review intentionally makes no dynamic green claim.
