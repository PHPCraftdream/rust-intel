# Round 15 review of the latest commits — 2026-09-03

- Commit range: `d10427d8131653a4af6a63499773a29e10688b85..adee2e94d05817d0d0e89d9da4c50744e4ef46d1`
- Commits reviewed:
  - `adee2e9` — `rust-intel: correctness fixes from round-14 independent review`
- Delta: 16 files, 223 insertions, 71 deletions
- Method: one pass over each of the ten normative modules, primary documentation/API checks, canonical/package-mirror comparison, validator/fixture/packaging checks, and a separate independent verification pass against the round-14 findings list
- Verdict: **APPROVED**

Round 14's 14 findings (one conditional P1, two P2, ten P3, plus two operational) are all addressed in `adee2e9`. The persisted-layout corpus oracle is restated as decode-observable with a schema-mutation negative control; recursive coverage is defined over the finite schema graph with exactly two representatives per recursive edge; concurrent-map activation is semantic ("any live value that owns or contains a map guard") and covers mapped/iterator/wrapper/match-binding shapes with corrected `scc` return types; `JoinSet` admission uses strict `len() < N` pre-insertion; the Argon2 recipe states both feature obligations (`rand` + `rand_core/getrandom`); §B1a wording covers out-parameter cache captures; public type-alias nameability is reconciled across central and module texts; `HashMap`/`HashSet` collect survivor identity is correctly scoped to `FromIterator`'s coalescing contract; §B6 gains both phrase and code-pattern triggers; the leading-pipe validator is a three-state header/delimiter/body machine with HTML-block and link-reference-definition exclusions; fixture controls scope per row, add C12/F1 presence checks, include optional validator inputs, and properly classify junction errors; header-line tracking catches the delimiter-cited-instead-of-header regression. Validation passes, mirrors are byte-identical, and no new defects were introduced.

## Round-14 closure accounting

| Round-14 item | Status in `adee2e9` |
|---|---|
| Conditional P1: typed value-vector → decode-observable permutation oracle | **Closed.** §F1 in both `skill/semantics-and-conformance.md` and `skill/SKILL.md` restates the oracle as decode-observable with the bincode cross-type counterexample and offers the schema-mutation negative control as the stronger construction. |
| P2: recursive coverage finite graph | **Closed.** "Every variant at every nesting depth" replaced by "finite graph of distinct serialized type/variant definitions, walked to a fixed point" with exactly two representatives per recursive edge. |
| P2: map-guard activation semantic + transitive, correct producer signatures | **Closed.** Trigger is "any live value that owns or contains a map guard" covering mapped (`MappedRef`/`MappedRefMut`), iterator (`RefMulti`/`RefMutMulti`), wrapper, and match-binding shapes; `scc::get_sync`/`get_async` return type corrected to `Option<OccupiedEntry>`. |
| P3: JoinSet `len() <= N` → `len() < N` | **Closed.** Pre-insertion gate is strict `len() < N`; `len() <= N` reserved for post-insertion invariant. |
| P3: Argon2 both feature obligations | **Closed.** States `argon2`'s `rand` feature for `SaltString::generate` AND `rand_core`'s `getrandom` feature for `OsRng`. |
| P3: §B1a witness wording | **Closed.** Dropped "returned reference" qualifier; out-parameter cache capture (`fn remember<'a>`) is now explicitly covered. |
| P3: public type-alias nameability | **Closed.** `lifetimes-and-api.md` includes `pub type` alias as a third naming path. |
| P3: HashMap/HashSet collect survivor identity | **Closed.** Reworded to `FromIterator`-level coalescing only; explicit loop recommended when survivor identity is load-bearing. |
| P3: §B6 phrase + code trigger | **Closed.** Phrase trigger and code-pattern trigger added to `skill/SKILL.md`, scoped to ordinary owned enums. |
| P3: table state machine | **Closed.** Three-state machine detects pipe-less header, delimiter, and body rows; block-start exclusions extended to HTML blocks and link reference definitions. |
| P3: row-scoped controls | **Closed.** `rowOf` helper added; B2, B14, C12, and F1 controls scope to individual rows; C12 and F1 presence checks added. |
| P3: optional validator inputs | **Closed.** `.app.json` and `.mcp.json` copied when present. |
| P3: junction error classification | **Closed.** Only symlink-creation failure is skipped; post-creation exceptions are reported as test failures. |
| P3: header line tracking | **Closed.** `headerLine` tracked separately; controls 8–11 assert exact cited line. |
| Operational: npm package excludes docs/reviews/ | **Open** (outside code-fix scope). |
| Operational: active Codex installation at v0.6.0 | **Open** (outside code-fix scope; requires local reinstall). |

## Verification performed

| Check | Result |
|---|---|
| `npm run validate` | PASS — 12 skill Markdown files and 2 fixture cases |
| Canonical `skill/` vs `skills/rust-intel/` mirror | PASS — byte-identical across all 12 module files |
| Round-14 finding cross-check | PASS — all 14 code/documentation findings verified closed |
| `git diff --check adee2e9` | PASS — no whitespace errors |
| New defect scan | PASS — no new issues identified in validator, fixtures, or skill modules |

## Module-level result

| Module | Result |
|---|---|
| Async | Map-guard activation now semantic and transitive; producer signatures corrected; cancellation, blocking, and task-lifecycle rules show no regression. |
| Unsafe / FFI | Clean; no changes in this round, no regression. |
| Concurrency / state | `JoinSet` admission inequality corrected; TOCTOU and unbounded-admission rules unchanged and closed. |
| Data / types | `FromIterator` survivor contract correctly narrowed; §B6 trigger added; other data rules show no regression. |
| Security | Argon2/password-hash recipe now complete with both feature obligations; JWT, TLS, and KDF rules show no regression. |
| Drop / RAII | Clean; no changes in this round, no regression. |
| Dependencies / macros / ergonomics | C12 presence control added; rule text unchanged and correct. |
| Lifetimes / API | B1a cache-capture wording corrected; public type-alias nameability reconciled; other rules show no regression. |
| Testing | Table state machine rewritten; row-scoped controls, optional inputs, and junction classification all improved; fixture harness validates. |
| Semantics / conformance | Decode-observable oracle and finite recursive coverage both closed; no regression in other §F rules. |
