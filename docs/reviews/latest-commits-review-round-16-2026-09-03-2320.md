# Round 16 review of the latest commits — 2026-09-03 23:20 CEST

- Review range: `ab6c28824f6ba95fb65b872954e4069a5a648b55..19f6599b3d5395374ee6d587030abd856fd07774`
- Commits reviewed:
  - `70e47edaf6b410506808d58fb4dd7b426276ae30` — `docs: add round 15 synthesis — consolidated task list from 4 parallel reviews`
  - `1591d394d885dfde7b22f49075160deb4c467b2b` — `rust-intel: correctness fixes from round-15 synthesis (13 items)`
  - `19f6599b3d5395374ee6d587030abd856fd07774` — `docs: clarify docs/reviews/ citations are repository-only, not npm-shipped`
- Combined delta: 13 files, 521 insertions, 46 deletions.
- Pre-existing untracked path excluded: `.githooks/`.
- Method: **static review only**. Per the request, no project test, validator, fixture,
  syntax-check, build, installer, or package command was run. The review used revision-qualified Git
  inspection, direct source reading, manual state-machine and serialization traces, SHA-256
  comparisons, and read-only checks of the official GFM and bincode specifications.
- Verdict: **REQUEST CHANGES**.

The batch closes both Round-15 P2 findings and most of the P3/process work. The central and module
rules are mirrored byte-for-byte, the package/repository evidence distinction is now explicit, and
the active Codex installation is current. It is not correct enough to approve, however: the newly
added claim that pairwise schema transpositions are equivalent to all permutations is false for the
positional formats the rule names. A small bincode counterexample satisfies the stated
distinct-signature condition while a three-cycle remains invisible. The two new Markdown scanners
also implement only approximations of the GFM states their comments promise.

## Executive result

- **One conditional-P1 finding:** the §F1 pairwise-reduction theorem is false and can approve a
  corpus that misses a silent persisted-data reinterpretation.
- **Two P3 finding groups:** the `\"` guard does not track real fenced-code state, and the
  leading-pipe block-start allowlist still misses valid GFM boundaries.
- **Round-15 task closure:** Tasks 1–4 and 7–10, 12–14 are closed; Task 5 is incorrect; Tasks 6 and
  11 are only partially closed; Task 15 is operationally closed (13/13 installed files match).
- **No finding** against the deliberate bare-`<` approximation in `blockStartRe`: it is now
  explicitly documented, has no live exposure in `SKILL.md`, and was an allowed resolution in the
  synthesis. It remains accepted technical debt, not a newly undisclosed defect.

## Conditional-P1 finding

### 1. Pairwise transpositions are not equivalent to all permutations for positional encodings

Locations:

- `skill/semantics-and-conformance.md:19`
- `skill/SKILL.md:410`
- the byte-identical Codex mirrors at the same locations
- `docs/reviews/round-15-synthesis-2026-09-03-2146.md:175-199`

The new text says that, under any canonical positional encoding, an invisible permutation implies
an invisible transposition of a moved pair. It concludes that checking `C(n, 2)` pair swaps is
equivalent to checking all `n! - 1` permutations and that distinct per-position encoded signatures
are the closed form. Canonical value encoding is not enough to prove this. Concatenated field
encodings may have different lengths, so a permutation can move byte boundaries even when no pair
swap is invisible.

A concrete bincode 2 counterexample needs no exotic or invalid value:

```rust
struct Record {
    a: [u8; 2],
    b: u8,
    c: u8,
}

let old = Record { a: [1, 2], b: 1, c: 2 };
```

Bincode serializes fixed arrays without a length and struct fields sequentially without field-name
metadata, so the old bytes are `01 02 01 02`. The corpus signatures are all distinct:
`a = [01 02]`, `b = [01]`, `c = [02]`.

Every transposition is observable:

| New declaration order | Decode of the old bytes | Result |
|---|---|---|
| `b, a, c` | `b=1, a=[2,1], c=2` | differs |
| `a, c, b` | `a=[1,2], c=1, b=2` | differs |
| `c, b, a` | `c=1, b=2, a=[1,2]` | differs |

But the three-cycle `b, c, a` decodes the same bytes as `b=1, c=2, a=[1,2]`: the fixture is
unchanged. Thus all pairwise negative controls pass and all position signatures differ, yet a
non-identity permutation is invisible. Another deployed record, for example
`a=[3,4], b=5, c=6`, is silently reinterpreted by that same three-cycle.

The official bincode 2 specification supplies every premise of the trace: fixed arrays omit their
length, `u8` is one byte, and struct fields are encoded sequentially in declaration order with no
names or padding. See [bincode 2.0.1 serialization specification](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md).

Impact is conditional-P1 because the rule governs already-persisted/disk/DB/wire bytes and presents
the reduction as a sufficient safety gate. Following it on a heterogeneous or variable-width field
group can leave existing records silently mapped to different named values. This also invalidates
the synthesis's statement that the oracle itself is sound and the changelog's unqualified claim
that the persisted-format oracle was rebuilt successfully.

Required correction:

1. Remove the claimed `C(n, 2)` equivalence and the distinct-signature closed form from both rule
   copies.
2. For a concrete code change, require decoding the golden corpus under the **exact proposed
   layout**; that is one schema mutation, not `n! - 1` hypothetical mutations.
3. If the skill also wants a corpus that proactively detects every future reorder, retain the full
   permutation property unless a stronger, stated premise is proved (for example fixed equal-width
   framed positions or a uniquely-decodable construction). Canonical encoding by itself is not that
   premise.
4. Add the `[u8; 2], u8, u8` three-cycle as the negative calibration example and record a ledger
   correction for Round-15 synthesis Task 5 and the earlier final review that proposed this
   reduction.

## P3 findings

### 1. The escape guard toggles on fence-looking prefixes rather than parsing fenced blocks

Location: `dev/validate.mjs:471-480`.

The guard uses one Boolean and toggles it on every line matching
`/^\s{0,3}(?:```|~~~)/`. That is not GFM fenced-code state:

- a closing fence must use the same marker character as the opener;
- it must be at least as long as the opener;
- it may contain only trailing spaces;
- a backtick opener's info string cannot itself contain a backtick;
- fences inside block containers cannot be recognized from this absolute-line prefix alone.

For example, after a four-backtick opener, a three-backtick content line incorrectly flips
`inFence` to false, so a later legitimate `\"` example inside the still-open code block is rejected.
A `~~~` content line inside a backtick fence causes the same false positive. Conversely, a
fence-looking but invalid backtick opener whose info string contains another backtick flips the
Boolean to true and can hide a real prose escape.

The official GFM rules require the same fence type and a closing fence at least as long as its
opener. See [GFM §4.5, Fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks).

Track the opening marker and length and validate closing syntax, or reuse a Markdown parser. Add
controls for a shorter closer, a mismatched marker, trailing non-space text on a would-be closer,
an invalid backtick info string, and container-nested fences. The clean-TOML row control is useful
but does not exercise this guard's fence state.

### 2. `blockStartRe` still misses valid GFM boundaries after a table

Locations:

- `dev/validate.mjs:296-308`
- `dev/validate-fixtures.mjs:309-350`

The Round-15 fix correctly removed link-reference definitions, added a basic indented-code case,
and documented the accepted broad `<` check. The resulting regex still under-recognizes block
starts that terminate the open table:

- Empty ATX headings are valid (`#`, `##`, etc.), but `#{1,6}\s` requires whitespace after the
  marker and misses end-of-line.
- Empty bullet and ordered list items are valid outside a paragraph (`-`, `*`, `+`, `1.`, `1)`),
  but both list alternatives likewise require following whitespace. At a table boundary these are
  block structures, not table rows.
- GFM expands tabs to four-column tab stops for block indentation. Lines such as `  \tcode` and
  `   \tcode`, or a leading tab followed by additional whitespace and then content, begin an
  indented code block. `(?: {4,}|\t)\S` recognizes only four literal spaces or a column-one tab
  immediately followed by a non-space.

In `tableState === 'body'`, each missed boundary is reported as a missing-leading-pipe row even
though it is not a table row. The only new indentation control uses exactly four literal spaces;
there are no tab-expanded, empty-heading, or empty-list controls.

The relevant primary rules are [GFM §2.2, Tabs](https://github.github.com/gfm/#tabs),
[GFM §4.2, ATX headings](https://github.github.com/gfm/#atx-headings), and
[GFM §5.2, List items](https://github.github.com/gfm/#list-items).

Compute indentation by columns rather than raw prefix shape; accept heading/list markers followed
by whitespace **or end-of-line**; and add positive boundary controls for the forms above. This is a
validator-robustness defect: no current canonical trigger row has one of these shapes.

## Completeness against the Round-15 synthesis

| Task | Round-16 disposition |
|---|---|
| 1. Remove literal `\"` artifacts | **Closed.** Plain quotes are present in both central rows and mirrors. |
| 2. Correct alias/`unnameable_types` guidance | **Closed.** The alias remains a naming path; rust-lang/rust#120146 is explicitly identified as a lint false positive; the downstream path is `the_crate::PublicS`. |
| 3. Split §B6 routing/remedies by ownership | **Closed.** Owned and external/non-exhaustive enum shapes now have separate phrase and code triggers with matching remedies. |
| 4. Broaden §B1a phrase activation | **Closed.** Return-value gating is removed in the central row and module. |
| 5. Make §F1 mechanically feasible | **Incorrect.** The new pairwise theorem is false; see conditional-P1 finding 1. |
| 6. Correct the GFM allowlist | **Partial.** Link references and the basic four-space case are corrected; additional real GFM boundaries remain missing. The documented `<` over-approximation is accepted. |
| 7. Preserve a pipe-less header candidate after flush | **Closed.** The current line is reprocessed after `flushTableBlock()`. The delimiter-promotion comment now matches cmark-gfm behavior. |
| 8. Fix `HashSet::FromIterator` attribution | **Closed.** The text distinguishes undocumented `FromIterator` from documented `From<[T; N]>`. |
| 9. Refresh fixture metadata/messages | **Closed.** The header records 12 handwritten and 13 rule-text controls; messages are round-agnostic. |
| 10. Pin corrected rule text | **Closed.** §B12 module/row, §B1a, and §B13 tokens are scoped and mirrored indirectly by the byte-equality check. |
| 11. Add the escape-class guard | **Partial.** Present, but its fenced-block state is unsound; see P3 finding 1. |
| 12. Add correction-ledger rows | **Closed for the requested five rows.** A later correction row will be needed for Task 5 after this review is fixed. |
| 13. Bring the changelog through rounds 8–15 | **Closed as a summary.** The new §F1 claim must be corrected together with finding 1. |
| 14. Resolve npm/repository evidence ambiguity | **Closed by explicit policy.** `19f6599` says citations are repository-only and gives a commit-pinned directory link instead of promising npm-shipped reports. |
| 15. Refresh the active Codex installation | **Closed operationally.** All 13 installed files match canonical SHA-256 hashes. |

## Static verification record

| Check | Result |
|---|---|
| Tests, validators, fixtures, syntax checks, builds, installers, package commands | **NOT RUN**, per the explicit request |
| Reviewed range | Three commits, 13 files, +521/-46 |
| Canonical `skill/` vs `skills/rust-intel/` | **13/13 SHA-256 matches** |
| Canonical `skill/` vs active `C:\Users\Computer\.agents\skills\rust-intel` | **13/13 SHA-256 matches** |
| Round-15 Tasks 1–15 | Individually traced to current text/tooling/state; disposition table above |
| §F1 pairwise proof | Refuted by the bincode `[u8; 2], u8, u8` three-cycle above |
| GFM scanner claims | Checked against the official GFM tabs, headings, lists, and fence rules |
| Package evidence policy | Static `package.json` allowlist still excludes `docs/`; changelog now explicitly points package readers to the repository |
| `.githooks/` | Pre-existing, untracked, excluded, not modified or staged |

## Recommended correction order

1. Correct §F1 in canonical/module/central/mirror text, add the three-cycle calibration example, and
   amend the changelog and review ledger so the false Round-15 proof is not left authoritative.
2. Replace the Boolean fence toggle with marker/length-aware fenced-block state and add adversarial
   fixture controls.
3. Complete `blockStartRe` for tab-expanded indentation and end-of-line heading/list markers, with
   focused controls for each boundary.
4. Only after those edits, run the normal validation/install verification in a non-read-only round;
   this review intentionally supplies no dynamic green claim.
