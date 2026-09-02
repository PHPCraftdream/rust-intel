# Round 3 review of the latest commits — 2026-09-02 11:53 CEST

- **Range:** `7a567a6..9a808f3`
- **Commits reviewed:** `eca76bf`, `3bce0e1`, `d1f3df6`, `39afc18`, `9a808f3`
- **Reviewed state:** committed `HEAD` only; the pre-existing dirty worktree was excluded
- **Verdict:** **REQUEST CHANGES**

The two implementation commits close most findings from the previous review, and the three
research commits contain substantial useful work. The series is not complete, however. The
research commits intentionally do not integrate their own accepted findings, so the committed
skill still contains the already-recorded P1 errors. This round also found additional false or
unsafe normative guidance that the claimed full correctness pass missed, plus several errors in
the reports themselves.

The most important positive results are:

- §C12/§C12a now reach the dependency audit unit, and the new header → category map → workflow
  parity check closes the original routing gap.
- the npm duplicate-publish path compares the local tarball integrity with `dist.integrity` and
  fails on a mismatched artifact;
- the Haversine, dyn-compatibility, category-count, checkpoint-policy, Markdown-sanitization, and
  missing marketplace-description defects identified by the prior reviews are materially improved;
- canonical and Codex copies remain byte-identical at committed `HEAD`;
- `npm run validate`, fixture validation, JavaScript syntax checks, `git diff --check`, and
  `npm pack --dry-run --json` pass in a detached worktree at `9a808f3`.

## P1 findings

### P1 — `QueryBuilder` is described as binding values when `push()` actually appends raw SQL

**Location:** `skill/security.md:92`; missed by
`docs/reviews/correctness-audit-2026-08.md:4` and only partially approached by
`docs/reviews/currency-audit-2026-08.md:167-169`.

The normative text recommends `sqlx::QueryBuilder` because it allegedly “binds as it pushes.”
That is false and can turn the recommended SQL-injection fix into another injection. SQLx warns
that [`QueryBuilder::push`](https://docs.rs/sqlx/latest/sqlx/struct.QueryBuilder.html#method.push)
appends an unsanitized SQL fragment; values must use `push_bind()`. Dynamic identifiers and syntax
must come from a closed allowlist because bind parameters cannot represent them.

**Required correction:** require `push_bind()` for every untrusted value and reserve `push()` for
static or explicitly allowlisted SQL syntax. Add `QueryBuilder::push(format!(...))` and
`.push(untrusted)` to the code-pattern trigger.

### P1 — the write-path containment recipe still follows an existing symlink out of the base

**Location:** `skill/security.md:87`; not reported by the correctness audit.

Rejecting absolute/root/prefix components and `..` is not sufficient for a not-yet-created write
target. With `base/link -> /outside`, the token-free path `base/link/new_file` escapes the base.
The same paragraph also compares a canonical target with a base that is not explicitly canonical.

**Required correction:** for a static tree, canonicalize the trusted base and the existing target
or nearest existing parent before comparison. For an attacker-mutable tree, create/open relative to
an already-open directory handle with no-follow semantics (`openat`/`openat2` or a verified
capability-based library). Do not present lexical validation as a write-containment boundary.

### P1 — `black_box`/`inline(never)` are presented as enough to rescue hand-written secret comparison

**Location:** `skill/security.md:58`; absent from the correctness report despite its
“every technical claim” scope.

The BANNED wording only rejects a hand-written XOR comparator when it lacks `black_box` and
`#[inline(never)]`, implying those annotations make it acceptable. Rust explicitly documents that
[`black_box`](https://doc.rust-lang.org/core/hint/fn.black_box.html) provides no cryptographic or
security guarantee. Optimizer/codegen changes can still destroy constant-time behavior.

**Required correction:** ban hand-written secret equality regardless of these annotations. Require
the primitive's verifier or a maintained, verified constant-time implementation such as `subtle`;
retain threat-model and version verification under §B12/§A1.

### P1 — §B1a's lifetime explanation and proposed fix are both incorrect

**Location:** `skill/lifetimes-and-api.md:15,25,40,45`; missed by the correctness audit.

Two calls using different inputs do not by themselves force an “empty intersection.” Rust may
shorten both borrows to a shared overlapping lifetime. The failure appears when a shorter-lived
source is inserted and the cache remains usable after that source dies. Merely changing the
signature to `<'input, 'cache>` also cannot store an input-borrowed slice in the cache without an
`'input: 'cache` relation, restoring the coupling the proposed fix claims to remove.

**Required correction:** use a `compile_fail` example with an inner-scoped source and a later cache
use. The cache must own the stored value, or borrow from an arena/storage lifetime proven to outlive
the cache. Separate lifetimes are appropriate only when the returned value does not borrow from the
current input.

### P1 — field order cannot implement the documented worker shutdown protocol

**Location:** `skill/drop-and-raii.md:32`; missed by the correctness audit.

Dropping either the standard or Tokio `JoinHandle` detaches rather than joins. If a custom
`Drop::drop` explicitly joins, that method runs before automatic field destruction, so putting the
sender field first still does not close it before the join. Following the current guidance either
detaches the worker or keeps the join-before-close deadlock.

**Required correction:** use explicit shutdown state, normally `Option<Sender>` and
`Option<JoinHandle>`: take and close/drop the sender, then take and join the thread. Tokio needs an
explicit async `shutdown(self)` because `Drop` cannot await. Mention field order only for a
specifically documented join-on-drop wrapper.

### P1 — the correctness report recommends relying on an unsupported Serde combination

**Location:** `docs/reviews/correctness-audit-2026-08.md:97-99`, concerning
`skill/data-and-types.md:53,59`.

The report observed that its tested outer `deny_unknown_fields` currently rejects an unknown key,
then narrows Serde's incompatibility warning to the flattened inner type. Serde's official
[flatten documentation](https://serde.rs/attr-flatten.html) says the combination is unsupported
for both the outer and inner structs. A current implementation observation must not become a
security-boundary guarantee.

**Required correction:** keep the unsupported-combination warning and recommend a custom
`Deserialize` implementation when strict unknown-field rejection and flattening are both required.

## P2 findings

### P2 — the public-struct SemVer rule is overbroad

**Location:** `skill/lifetimes-and-api.md:83,85-95`; missed by the correctness audit.

A public struct that already contains a private field cannot be constructed or exhaustively
destructured downstream. Cargo's
[SemVer guide](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private)
classifies adding/removing another private field as compatible. `#[non_exhaustive]` is needed when
future growth would otherwise break downstream construction or patterns, not mechanically on every
public struct.

### P2 — the correctness audit missed two basic data/type errors, and one proposed fix is invalid

**Locations:** `skill/data-and-types.md:69,149`; and
`docs/reviews/gap-audit-completeness-2026-08.md:230`.

- `usize as u64` and `u32 as usize` are lossless on the cited 32-bit targets, while the explanation
  switches to the actually narrowing `u64 as usize`. The rule flags the wrong conversions.
- `BufReader` does not flush on drop; it has no output to flush. Dropping it discards unread buffered
  bytes. Only `BufWriter` attempts a drop-time flush and cannot report that error.
- `serde_json`'s `arbitrary_precision` feature does not make NaN or infinity valid JSON numbers.
  [`Number::from_f64`](https://docs.rs/serde_json/latest/serde_json/struct.Number.html#method.from_f64)
  still rejects them. Use rejection or an explicit tagged/string representation.

### P2 — testing.md states the opposite of `grep`'s exit contract

**Location:** `skill/testing.md:81,84`; missed by the correctness audit.

The text says `grep` returns `0` when nothing matched. GNU grep returns `0` when a line matched,
`1` when none matched, and `2` on error. [GNU grep exit status](https://www.gnu.org/s/grep/manual/html_node/Exit-Status.html)
The broader warning about gating on an unprotected pipeline is valid, but its outcome depends on the
filter and pattern; the stated mechanism is false.

### P2 — §F4 turns a recommendation into a nonexistent universal `Display`/`FromStr` contract

**Location:** `skill/semantics-and-conformance.md:105`; missed by the correctness audit.

Rust explicitly says a [`Display` implementation may be lossy or not parseable](https://doc.rust-lang.org/std/fmt/trait.Display.html#completeness-and-parseability).
Round-trip compatibility is desirable when the display form is documented as lossless and
machine-parseable, but it is not automatically the API contract for every type implementing both
traits. Scope the mandatory property to an actual inverse/documented representation; otherwise
require the real documented law.

### P2 — §C12 remains incomplete and internally inconsistent after both fix passes

**Locations:** `skill/SKILL.md:278-284`, `skill/deps-macros-ergonomics.md:139,153,159,165,173`.

- Phrase triggers still omit a normal “parse XML” request unless code matching the separate
  code-pattern trigger is already present. There is no validator tying catalog rows to trigger
  coverage.
- The HTML-escaping row names attribute-context XSS but remains 🟡, contradicting the rule that a
  security-hole row is 🔴.
- Selecting `backon` does not close the row's no-jitter failure: its
  [`ExponentialBuilder::default()`](https://docs.rs/backon/latest/backon/struct.ExponentialBuilder.html#default)
  has `jitter: false`. Require `.with_jitter()` and an explicit attempts/total-delay policy.
- The Markdown row says the desired `http`/`https`/`mailto` allowlist is what Ammonia does by
  default. Ammonia's
  [default scheme set](https://docs.rs/ammonia/latest/ammonia/struct.Builder.html#method.url_schemes)
  is much broader. It excludes browser-executable `javascript`/`data`, but exact policy requires
  configuring `Builder::url_schemes`.
- The persistent-file row says a truncated JSON file loads partial/wrong data “not an error.” A
  normal JSON parser rejects truncation. Keep crash consistency as a detected corruption/service
  failure and use concurrent lost updates as the genuinely silent scenario.

### P2 — the new validators do not enforce all invariants their comments and commits claim

**Location:** `dev/validate.mjs:185-195`; trigger coverage around `skill/SKILL.md:278-284`.

The category-count check proves that expected phrases exist. It does not reject an additional stale
count elsewhere in the same live file, so adding “contains 58 categories” leaves validation green
as long as the three expected 59-category phrases remain. Likewise, category parity proves routing
at category granularity but not that every §C12 catalog task has a usable phrase trigger.

**Required correction:** scan every live count mention and reject any non-current value; derive a
catalog-to-trigger inventory or add an explicit validated mapping for each C12/C12a row.

### P2 — the completeness report does not supply the candidate inventory it claims to contain

**Location:** `docs/reviews/gap-audit-completeness-2026-08.md:3,7,41,261-277`.

The report claims 63 candidates and says it carries the ledger's explicit candidate inventory and
out-of-scope list. It enumerates 1-26, then collapses 27-63 into “See Rejected and deferred.” The
later grouped bullets are unnumbered and cannot be reconciled to those 37 candidate IDs. This
repeats the class of arithmetic/provenance problem for which `docs/reviews/README.md` already
contains a historical-count erratum.

**Required correction:** give every candidate a stable ID and exactly one disposition, then derive
the six/twenty/rejected totals mechanically.

### P2 — the currency report contains actionable factual and severity errors

**Locations:** `docs/reviews/currency-audit-2026-08.md:96-118,189-213,235-242,464-476`.

- S2 elevates an explicitly unverified `SaltString::generate` hypothesis to HIGH. In
  `password-hash` 0.6.1, the verified API includes
  [`generate_salt()`](https://docs.rs/password-hash/latest/password_hash/fn.generate_salt.html)
  behind `getrandom`; the report should distinguish this from the `rand_core`/`SysRng` path.
- S6 calls the reqwest TLS-method rename a blocker while admitting the old soft-deprecated aliases
  still exist and the current trigger substring still matches. That is documentation staleness,
  not a detection failure.
- The `lru` chronology says an August 3 release came after an August 19 fetch, and maps the advisory
  to double-panic-in-Drop rather than unsafe-state restoration during unwinding.
- The Rust 1.88 let-chain item gives 2026 instead of 2025 and calls the topic missing even though
  `skill/drop-and-raii.md:42` already covers it. This also contradicts the completeness report at
  line 250.
- `mismatched_lifetime_syntaxes` is an adjacent readability lint, not mechanical coverage for
  §B1's lifetime relations.

### P2 — release-workflow comments still assert the assumption the code was changed to distrust

**Location:** `.github/workflows/npm-publish.yml:3,25-26`.

The publish implementation correctly treats tags as movable, but the file still says “a git tag is
immutable” and “same immutable tag.” Replace these with “the tag names a committed tree for this
run” and “same tag ref.” The current contradiction is especially misleading because lines 81-84
correctly explain that immutable releases/tag protection are not enabled.

## P3 findings

### P3 — the second-pass commit message records a false compiler result

`3bce0e1` says a method taking `Self` by value makes a trait dyn-incompatible and was confirmed with
E0038. On rustc 1.97, `trait T { fn f(self); }` still permits `&dyn T`; the by-value receiver is
implicitly non-dispatchable. The final `SKILL.md:8` wording does not repeat this specific error, so
this is historical/provenance damage rather than a remaining normative defect. Correct it in this
review ledger rather than rewriting history.

### P3 — one correctness finding is severity-inflated

`docs/reviews/correctness-audit-2026-08.md:142-148` correctly moves
`inefficient_to_string` from `clippy::perf` to `pedantic`, but calls it P2 even while noting that the
prescribed Post-flight command already enables `pedantic`. The text is wrong, but the prescribed
pipeline does not miss the lint; P3 is proportionate.

## Commit-by-commit disposition

| Commit | Result | Review |
|---|---|---|
| `eca76bf` | **PARTIAL** | Closes most prior findings; leaves C12 trigger/tier/default-policy gaps and contradictory immutable-tag comments. |
| `3bce0e1` | **PARTIAL** | Improves dyn wording and map validation; count and catalog-trigger invariants remain weaker than claimed, and the commit message records a false by-value-`Self` result. |
| `d1f3df6` | **PARTIAL** | Valuable gap research; candidate inventory is not auditable, and at least two proposed remedies (`arbitrary_precision`, broad redirect exemption) need correction. |
| `39afc18` | **REQUEST CHANGES** | Finds real errors but its “every technical claim” completeness claim is disproved by multiple security-, lifetime-, Drop-, data-, testing-, and SemVer-level misses; one Serde correction relies on unsupported behavior. |
| `9a808f3` | **PARTIAL** | Strong ecosystem update overall; contains unverified HIGH advice, chronology/year mistakes, and several severity/coverage overclaims. |

## Coverage and verification

The review compared each commit and the combined range, inspected all changed release/validation
logic, and reviewed every skill module either through a dedicated module pass or a bounded local
fallback. Delegated passes completed for async, concurrency, data/types, security, drop/RAII,
dependencies/macros, and lifetimes/API. The delegation service hit its usage limit before the final
testing and semantics passes; those two modules were reviewed locally against committed blobs, and
their two concrete findings above were checked against GNU grep and Rust's standard-library docs.
The dirty worktree was never used as evidence for committed `HEAD` and no pre-existing change was
modified.

Checks run in a detached worktree at `9a808f3`:

- `npm run validate` — pass;
- `node dev/validate-fixtures.mjs` — pass (through `npm run validate`);
- `node --check dev/validate.mjs` — pass;
- `node --check skill/audit-project.workflow.js` — pass;
- `git diff --check 7a567a6..HEAD` — pass;
- `npm pack --dry-run --json` — pass, 37 entries, integrity
  `sha512-/pZIBGlmbxCT0sQGJ2Fjsv+k9QUUzQBjhzBKKloVzWwey/FXPYs4wT1EiIv7MAz0Dwz6gUlV4HjylhI+QyBm0w==`.

Green repository checks establish structural consistency, not the factual correctness of the
normative prose. The series should not be treated as a complete correction pass until the P1 items
above are fixed and the report/validator claims are narrowed or mechanically enforced.
