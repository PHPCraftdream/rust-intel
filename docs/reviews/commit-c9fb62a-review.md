# Review of commit `c9fb62a`

- **Commit:** `c9fb62a432796eec6fe5df93a3a8a565eee1adb1`
- **Parent:** `0a31099e562c5c3c7cffb6d8f1861c823c509c12`
- **Reviewed:** 2026-08-08
- **Verdict:** **REQUEST CHANGES**

This review covers the `c9fb62a` delta and the resulting 0.5.0 release state. Three of the four findings in `docs/reviews/commit-0a31099-review.md` are fully resolved. The installer correction blocks each newly tested path shape in isolation, but a composition of two of those shapes still bypasses the overlap guard.

## Finding

### P1 — `missing/..` can expose an existing symlink after the only physical-resolution pass

**Location:** `rust-cc-install.sh:90-150`; incomplete regression matrix at `.github/workflows/ci.yml:76-89`.

`canonical_candidate` first walks the original spelling to its nearest existing ancestor and resolves that ancestor physically. It then calls `normalize_path_components` once. Normalization can remove a missing component followed by `..` and thereby expose an existing symlink that was not reachable during the first walk. The resulting path is returned without another physical-resolution pass, so the symlink remains unresolved during the prefix comparison.

The two new CI cases test these ingredients separately:

- case 4 checks a missing component followed by `..`, with no symlink after it;
- case 5 checks an immediately reachable symlink, with no missing component before it.

Their composition is still accepted. A safe probe of the committed functions used this layout:

```text
/tmp/probe/link -> <repo>/skill
candidate=/tmp/probe/missing/../link/skills/rust-intel
```

The function returned:

```text
source=<repo>/skill
candidate=/tmp/probe/link/skills/rust-intel
physical-expected=<repo>/skill/skills/rust-intel
```

The string-prefix guard therefore sees an unrelated `/tmp/probe/link/...` destination and does not reject it. During installation, cleanup initially cannot traverse `missing/..`; then `mkdir -p` creates `missing`, walks back through `..`, follows `link`, and creates the destination below the source tree. The subsequent `find "$REPO_DIR/skill"` can descend into the directory it is populating, recreating the recursive self-copy/path-growth failure the guard is intended to prevent. The same construction applies to the commands-tree comparison.

**Recommended correction:** after lexical component normalization, perform physical canonicalization again: walk the normalized candidate to its nearest existing ancestor, resolve that ancestor with `cd` plus `pwd -P`, and append the now dot-free missing suffix. Alternatively, structure the helper as a convergence loop that cannot return until both lexical normalization and physical-prefix resolution have been applied to the final spelling. Add a sixth execution test combining `missing/..` with an existing symlink into each protected source tree.

## Disposition of the previous review

| Previous finding | Result in `c9fb62a` |
|---|---|
| Value-specific and struct-to-bytes `transmute` obligations | **Fixed.** The rule now speaks about the actual argument/result, distinguishes generic all-values APIs, and treats padding as a separate obligation. |
| Missing-component/`..` installer bypass | **Partially fixed.** Pure lexical traversal is blocked, but the composed traversal-plus-symlink bypass above remains. |
| Out-of-scope per-unit source evidence | **Fixed.** Evidence is intersected with `scoperResult.files`, and invalid paths are surfaced separately. |
| Trailing whitespace in the committed report | **Fixed.** The metadata is a list, the tree passes the whitespace check, and CI now enforces the invariant. |

## Confirmed good changes

- The revised `transmute` guidance matches the value-specific standard-library contract and no longer treats a byte array as having a repr attribute to match.
- `noSourceEvidence` now counts only paths present in the scoped Rust file set.
- Out-of-scope source evidence is retained as an explicit synthesis signal rather than silently discarded.
- The canonical skill and Codex mirror remain byte-identical.
- The whole tracked tree passes the new empty-tree `git diff --check` gate.
- The installer tests materially improve coverage for normal installation, pure lexical traversal, and directly reachable symlinks, despite missing the composed case above.

## Verification performed

Passed at `c9fb62a`:

- `npm run validate`
- `node dev/sync-mirror.mjs --check`
- `node dev/check-release-version.mjs 0.5.0`
- `node --check dev/validate.mjs`
- `node --check skill/audit-project.workflow.js`
- `bash -n rust-cc-install.sh rust-cc-uninstall.sh`
- `git diff --check 4b825dc642cb6eb9a060e54bf8d69288fbee4904 -- .`
- `git diff HEAD^ HEAD --check`
- `npm pack --dry-run --json`

Exposed a defect:

- A non-mutating probe of the committed normalization/canonicalization functions showed that `missing/../link`, where `link` is an existing symlink into `skill/`, is returned with the symlink unresolved and therefore bypasses the overlap comparison.

The repository checks are green, but the remaining P1 is a composition gap in a destructive/recursive-copy safety boundary. The commit should not be treated as closing the installer finding until that case is rejected at runtime.
