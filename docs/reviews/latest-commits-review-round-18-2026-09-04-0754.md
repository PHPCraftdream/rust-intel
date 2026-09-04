# Latest commits review — round 18 (2026-09-04 07:54 CEST)

## Scope and method

- Review base: `6c1661568f234ad5a5aadcb99b489615a5553fe2`
  (`docs: add round 17 review of latest commit`).
- Reviewed head: `e76c3725f896c818414bb5fa1df3ce51671300fb`
  (`rust-intel: correctness fixes from round-17 independent review`).
- Range: `6c1661568f234ad5a5aadcb99b489615a5553fe2..e76c3725f896c818414bb5fa1df3ce51671300fb`.
- Delta: one commit, three files, `+31/-8`:
  `dev/validate-fixtures.mjs`, `dev/validate.mjs`, and `docs/reviews/README.md`.
- Method: static, revision-qualified Git inspection; direct reading of every changed hunk and its
  surrounding implementation; counterfactual tracing against the round-17 findings; SHA-256
  comparison of the canonical, Codex-mirror, and active-install skill trees; comparison with the
  official GFM grammar, the cmark-gfm reference scanner, and ECMAScript regexp semantics.
- Per the explicit request, no tests, validators, fixture runners, syntax checks, builds, installers,
  packaging commands, or other project executables were run. Consequently this report makes no
  dynamic pass claim.
- Coverage boundary: this is a bounded single-context review of the post-round-17 delta, not a new
  full-project audit. Delegated module fan-out was unavailable in this session. The unchanged
  normative modules were not re-audited end to end: `async.md`, `unsafe-and-ffi.md`,
  `concurrency-and-state.md`, `data-and-types.md`, `security.md`, `drop-and-raii.md`,
  `deps-macros-ergonomics.md`, `lifetimes-and-api.md`, `testing.md`, and
  `semantics-and-conformance.md`.

## Executive result

- **No P1 or P2 finding** in the reviewed commit.
- **Two P3 finding groups** remain in the fence-state correction: the closer still accepts more
  trailing characters than cmark-gfm, and the regression set still does not exercise a
  tab-indented fake closer.
- The round-17 ledger finding is **closed**: the unchanged calibration fixture and the separately
  remapped deployed record are now distinguished correctly.
- The round-17 active-install finding is **closed in the observed environment**: all 13 canonical
  files are byte-identical to both `skills/rust-intel/` and the active Codex installation.
- Overall verdict: **correct direction and no high-severity regression, but not yet complete**.

## P3 findings

### 1. `fenceCloser()` still accepts non-GFM trailing whitespace

Location: `dev/validate.mjs:495`.

The commit correctly changes the *leading* indentation from `\s{0,3}` to literal spaces and adds
the missing backtick-info-string rejection. The closing expression nevertheless remains:

```js
/^ {0,3}(`{3,}|~{3,})\s*$/
```

That final `\s*` is wider than the grammar it claims to model. The cmark-gfm reference scanner
accepts only ASCII space or tab after the delimiter and before the line ending (`[ \t]*[\r\n]`).
ECMAScript `\s`, by contrast, contains every `WhiteSpace` and `LineTerminator` character, including
form feed, vertical tab, non-breaking space, and Unicode line separators.

Concrete counterexample, using form feed (`U+000C`) after the would-be closer:

````text
```md
let recipe = "a";
```<U+000C>
let escaped = "x \" y";
```
````

cmark-gfm keeps the middle delimiter-looking line as fenced content because form feed is not in its
closing-fence suffix class. The validator closes the fence because JavaScript `\s*` accepts the form
feed, then reports the following legitimate in-code `\"` as a leaked prose escape. This is a false
positive in the guard the commit is trying to make GFM-accurate.

Primary references:

- [GFM §4.5 — Fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks)
- [cmark-gfm closing-fence scanner](https://github.com/github/cmark-gfm/blob/master/src/scanners.re#L294-L302)
- [ECMAScript `CharacterClassEscape :: s`](https://tc39.es/ecma262/multipage/text-processing.html#sec-characterclassescape)

Recommended correction: normalize the logical line ending and use the exact suffix class, for
example `[ \t]*\r?$` after `split('\n')`, or strip a terminal `\r` first and then use `[ \t]*$`.
Add a negative control with `\f` or `\u00a0` after a would-be closer so reverting to `\s*` fails.

### 2. The fixture set still cannot detect a closer-only indentation regression

Locations: `dev/validate-fixtures.mjs:394-410`, with the production branch at
`dev/validate.mjs:494-505`.

Round 17 explicitly requested both a tab-indented fake opener and a tab-indented fake closer. The
new control at line 399 covers only the opener. That is not equivalent coverage because opener and
closer recognition are separate expressions.

Counterfactual mutation: leave the corrected opener at `^ {0,3}`, but change only
`fenceCloser()` back to `^\s{0,3}`. The new `tab-indented-fake-opener` control still passes, the
ordinary trailing-text control does not contain leading tab indentation, and no other fence control
exercises this branch. The regression suite therefore stays blind to the exact closer half named in
the round-17 finding.

Add a positive in-fence control such as:

```js
['tab-indented-fake-closer', [
  '```md',
  '\t```',
  'let escaped = "x \\" y";',
  '```',
]]
```

The validator must remain successful: the tab-indented delimiter is code-block content, so the
subsequent escape is still inside the original fence. While touching this diagnostic block, line
410 should also spell the escaped token as `\\"` in its template literal; its current `\"` renders
only `"`, dropping the backslash from the failure message. That message defect does not affect the
control's pass/fail result, but makes a failure less precise.

## Round-17 closure matrix

| Round-17 item | Round-18 disposition |
|---|---|
| Invalid GFM fence prefixes | **Partial.** Literal leading spaces and backtick-info validation are correct. The closer's trailing `\s*` remains overbroad and the tab-indented closer branch is untested. |
| Ledger says the unchanged fixture is remapped | **Closed.** `docs/reviews/README.md:30` now separates the unchanged `01 02 01 02` calibration record from the remapped `03 04 05 06` record; the stated decode `b=3,c=4,a=[5,6]` is arithmetically correct. |
| Active Codex installation is stale | **Closed in current state.** Canonical vs mirror: 13/13 SHA-256 matches; canonical vs active install: 13/13 matches; file lists also match. This operational update is outside the reviewed Git delta, so the hashes establish current state rather than commit provenance. |
| Top-level-only fence scope | **Unchanged and disclosed.** The source comment retains the limitation; a static prefix search found no currently nested skill fence. No general container-aware claim is made. |

## Static verification record

| Check | Result |
|---|---|
| Reviewed commit count | 1 |
| Changed files read | 3/3 |
| Diff whitespace check | No error reported by `git diff --check` |
| GFM opener indentation | Corrected to 0-3 literal spaces |
| Backtick info string | Correctly rejected when the remainder contains a backtick |
| Closer marker and minimum length | Preserved and correct |
| Closer trailing characters | **Incomplete:** JavaScript `\s*` is broader than cmark-gfm `[ \t]*` |
| New controls | Three added; opener/info/trailing-text paths are meaningful, but tab-indented closer and non-ASCII/control-whitespace suffix remain uncovered |
| Ledger arithmetic | Correct for both byte sequences |
| Canonical `skill/` vs `skills/rust-intel/` | 13/13 files and SHA-256 hashes match |
| Canonical `skill/` vs active installation | 13/13 files and SHA-256 hashes match |
| Tests/validators/build/install/package | **NOT RUN**, per request |
| Pre-existing `.githooks/` | Untracked, excluded from review changes, not modified or staged |

## Recommended correction order

1. Narrow `fenceCloser()`'s suffix to ASCII space/tab plus an optional CR line ending.
2. Add a form-feed or non-breaking-space false-closer control.
3. Add the missing tab-indented fake-closer control and correct its diagnostic spelling.
4. In a later non-read-only round, run the normal validation workflow; this round intentionally
   supplies static evidence only.
