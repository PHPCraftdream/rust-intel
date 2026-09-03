# Round 10 review of the latest commits — 2026-09-03 09:28 CEST

- Commit range: ef89d4fcaa83712ec6a55940579da84f0e9db6c0..a0197be244733b24611aee9c1601e6a66fd6fdad
- Implementation commit reviewed: a0197be — rust-intel: correctness fixes from round-8 and round-9 independent reviews
- Delta: 25 files, 250 insertions, 128 deletions
- Pre-existing untracked paths excluded: .githooks/ and docs/reviews/fix-plan-2026-08.md
- Method: one pass over each of the ten normative modules, central trigger/tier review, canonical/package-mirror comparison, primary documentation/API checks, validator and packaging checks, negative-control review, installation/evidence checks, and a separate synthesis pass
- Verdict: REQUEST CHANGES

a0197be fully closes the FFI callback conditional-P1 and partially closes the JoinSet and JoinHandle
activation findings, along with most recipe errors from Round 9. The commit is
substantive and the repository checks are green, but the closure is not complete. Five code-only gaps still
miss canonical red rules, several corrected recipes remain semantically or API-inaccurate, and the commit's
own evidence/deployment claims are not reproducible from the repository or installed skill.

## Executive result

- Five conditional P1 paths remain: ordinary manifest dependency additions, unbounded channels,
  JoinSet::*_on growth, several Tokio APIs whose dropped JoinHandle detaches, and the three canonical
  §C12 XSS shapes have no complete structural activation.
- The most important P2 correctness errors are actionable: regex iterator complexity is still understated,
  the backtracking/process-limit alternatives contradict each other, cancellation safety wrongly treats
  atomicity as sufficient, and the central matches!/salt recipes do not compile on the documented/current APIs.
- Public API and persisted-data coverage is still incomplete: B1b and hidden parameter types are not
  activated, and one golden fixture or a checked version byte does not prove compatibility for all old layouts.
- Round-9 tooling remediation is functionally present: the new physical-path junction control runs without
  a skip and the normal validators pass. Release evidence remains absent from HEAD and from the npm tarball,
  while the active Codex installation is still the pre-fix baseline.

## Conditional P1 findings

### Code-only unbounded channels do not activate canonical §B14

Locations: skill/SKILL.md:100,208,227,365 and the package mirror.

The enforcement list marks unbounded_channel red, but the structural table has no constructor trigger for
tokio::sync::mpsc::unbounded_channel(), flume::unbounded(), or async_channel::unbounded(). A manifest or
source review containing only this code can therefore avoid §B14 even though Tokio documents unbounded
buffering and possible process abort on memory exhaustion.

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

Add a code trigger for each supported constructor, scoped to the absence of a proven finite total/backlog bound.
[unbounded_channel](https://docs.rs/tokio/latest/tokio/sync/mpsc/fn.unbounded_channel.html).

### JoinSet structural activation omits stable _on insertion APIs

Location: skill/SKILL.md:365 and the package mirror.

The new row names .spawn(), .spawn_on(), .spawn_local(), and .spawn_blocking(), but current Tokio also
exposes spawn_local_on() and spawn_blocking_on(). An attacker-sized loop using either omitted method grows
the set without a cap or join_next() drain and evades the canonical red rule.

Add both methods or define the trigger semantically as every JoinSet task-insertion API without cap/drain.
[JoinSet](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html).

### Dropped Handle/blocking spawn handles still evade §B21

Locations: skill/SKILL.md:103,309; compare skill/async.md:284.

The module correctly says every Tokio API returning a JoinHandle must be supervised or explicitly detached,
but the canonical list and structural trigger enumerate only tokio::spawn, task::spawn_local, and
LocalSet::spawn_local. Handle::spawn, Runtime::spawn, task::spawn_blocking, and their runtime/handle
variants also return handles whose drop detaches the running task.

Make the red rule semantic (“any Tokio API returning JoinHandle”) or enumerate the stable task, Handle,
Runtime, LocalSet, and builder forms in scope. [JoinHandle](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html),
[Handle::spawn](https://docs.rs/tokio/latest/tokio/runtime/struct.Handle.html).

### Ordinary manifest dependency additions lack §A1 structural activation

Locations: skill/SKILL.md:96,194,403-405 and the package mirror.

An unverified or unnamed new dependency is canonical red, but structural rows cover only [patch]/git sources
and networked build.rs. A code-only diff adding an ordinary registry, path, renamed, target-specific,
build-, dev-, or workspace dependency can therefore miss §A1:

    [dependencies]
    plausible_llm_crate = "1"

Add a structural trigger for new entries in every Cargo dependency table; classify the finding according to
whether the crate/source was named, verified, approved, and pinned. [Cargo dependency specifications](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html).

### Canonical §C12 XSS shapes lack structural activation

Locations: skill/SKILL.md:110,286,368 and the package mirror.

The tier list makes manual HTML sanitization, Markdown-to-HTML rendering, and HTML escaping red, but the
structural §C12 row detects only hand-written CSV/URL/JSON/base64/XML/query parsing. Code-only examples such as
these can bypass the red rule:

    SCRIPT_RE.replace_all(input, "")
    input.replace('<', "&lt;")
    pulldown_cmark::html::push_html(&mut out, Parser::new(untrusted))

Add triggers for tag/script blocklists, hand-written entity escaping, and Markdown rendering without raw-HTML
filtering/sanitization and URL-scheme allowlisting. Correct the summary label so it names all three red shapes.
[pulldown-cmark::Event](https://docs.rs/pulldown-cmark/latest/pulldown_cmark/enum.Event.html),
[Askama escape modes](https://docs.rs/askama/latest/askama/derive.Template.html),
[ammonia](https://docs.rs/ammonia/latest/ammonia/).

## P2 findings

| Location | Finding | Required correction |
|---|---|---|
| skill/data-and-types.md:33; skill/SKILL.md:278 | The revised regex prose treats find_iter/captures_iter/replace_all as engine-linear and asks for a match budget only when a callback is non-O(1). Current regex 1.13.1 documents worst-case O(m·n²) for these iterator/replacement APIs; even .find_iter(untrusted).count() can be expensive. | Distinguish one-shot searches from iterator/replacement APIs and bound the number of matches (take, replacen, or an explicitly chosen earliest-mode API). Treat callback cost as a separate multiplier. [regex iterator guarantee](https://docs.rs/regex/1.13.1/regex/#iterating-over-matches), [find_iter](https://docs.rs/regex/1.13.1/regex/struct.Regex.html#method.find_iter). |
| skill/data-and-types.md:33; skill/SKILL.md:278,382 | The backtracking rule simultaneously requires an engine-native interrupt and permits a killable subprocess; attacker-controlled patterns are also described as needing “those guards” on every engine, contradicting the later linear-regex pattern-size recipe. | State the alternatives explicitly: backtracking = input/pattern cap plus engine budget OR supervised kill-and-reap subprocess; regex one-shot = pattern/size_limit/haystack bounds; iterator APIs = additional iteration budget. [RegexBuilder::size_limit](https://docs.rs/regex/1.13.1/regex/struct.RegexBuilder.html#method.size_limit). |
| skill/data-and-types.md:28; skill/SKILL.md:323 | The corrected Ord rule applies only to B-tree keys and promises “silent corruption.” A bad total order used by Vec::sort* or a heap is also a logic error; sorting may panic or produce unspecified order, and B-tree operations can panic for invalid ordering. | Cover every total-order consumer and mixed manual/derived Ord/PartialOrd/PartialEq form. Describe logic-error outcomes without claiming one universal silent result or UB. [Ord contract](https://doc.rust-lang.org/std/cmp/trait.Ord.html), [BTreeMap logic errors](https://doc.rust-lang.org/std/collections/struct.BTreeMap.html). |
| skill/async.md:313,318; skill/SKILL.md:178,324 | The select correction says an atomic or broadly transactional effect is cancel-safe “by construction.” fetch_add() followed by a pending await is atomic but is duplicated if the future is recreated after cancellation. | Use Tokio's drop-and-recreate/no-op criterion. Exempt only idempotent effects or operations with proven rollback, commit observation, or resume semantics. [Tokio cancellation safety](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety). |
| skill/async.md:149-150 | Line 150 permits executor-appropriate detached spawn_local, while line 149's exhaustive .await/tokio::spawn/stored-future alternatives still forbid it. | Say “executor-appropriate spawn primitive” in the exhaustive rule and defer handle disposition to §B21. [spawn_local](https://docs.rs/tokio/latest/tokio/task/fn.spawn_local.html). |
| skill/concurrency-and-state.md:92-93; skill/SKILL.md:314 | “Map behind a shared lock” still flags a check-and-act sequence that holds one exclusive guard across both operations; no other task can modify the map between calls. | Exempt one continuously-held exclusive guard; retain the finding for concurrent-map calls or guard release/reacquisition between check and act. [MutexGuard](https://docs.rs/tokio/latest/tokio/sync/struct.MutexGuard.html). |
| skill/SKILL.md:454 | The central preflight still gives assert!(matches!(value, pattern), "unexpected value: {value:?}") without the module's non-Copy/by-value-binding restriction. This reproduces E0382 for Result<String, _> and Ok(x). | Mirror the module qualification: use it only for Copy/non-consuming patterns, otherwise match &value or capture diagnostic data first. [matches!](https://doc.rust-lang.org/std/macro.matches.html), [E0382](https://doc.rust-lang.org/error_codes/E0382.html). |
| skill/SKILL.md:201; compare skill/security.md:42 | The central password-salt trigger still says SaltString::generate, while password-hash 0.6 uses generate_salt()/try_generate_salt() and no longer exposes that recipe at the old path. | Make the trigger version-neutral or show both password-hash ≤0.5 and 0.6 branches. [generate_salt](https://docs.rs/password-hash/0.6.0/password_hash/fn.generate_salt.html), [SaltString::generate 0.5](https://docs.rs/password-hash/0.5.0/password_hash/struct.SaltString.html#method.generate). |
| skill/semantics-and-conformance.md:19,108; skill/SKILL.md:400 | A single prior-release golden fixture can cover only one enum variant or equal-valued fields, leaving a reordered/inserted persisted value undetected. A checked version byte without a migration/compatibility/rejection policy can also discard data despite a compatibility promise. | Require a compatibility corpus covering every affected variant and discriminating values, plus explicit decode dispatch and a policy consistent with the documented guarantee. [bincode encoding](https://docs.rs/crate/bincode/2.0.1/source/docs/spec.md#L678-L710). |
| skill/SKILL.md:203,307-308; skill/lifetimes-and-api.md:124 | Public API activation still omits B1b's non-'static borrowed output and hidden/unnameable types in public parameters and other signature positions. | Add code triggers for borrowed public outputs and hidden types in parameters, returns, fields, aliases, and trait/associated-item signatures. [unnameable_types](https://doc.rust-lang.org/rustc/lints/listing/allowed-by-default.html#unnameable-types). |
| CHANGELOG.md:11,21; package.json:7-18; active installation | The cited fix plan is still absent from HEAD; npm contains zero docs/reviews/* files; installed C:\\Users\\Computer\\.agents\\skills\\rust-intel matches baseline 7a567a6 in 11/11 normative files and a0197be in 0/11. | Commit/withdraw the cited plan, publish resolvable evidence, then reinstall and byte-verify the active Codex skill after the normative corrections land. |

## P3 findings

| Location | Finding and correction |
|---|---|
| skill/drop-and-raii.md:21 | After catch_unwind returns Err, that panic's unwind is caught; a later failed report starts a new panic, not a “second panic while one is already in flight.” Keep the audited non-panicking sink requirement, but reserve double-panic/abort language for an independent outer unwind (which the thread::panicking() guard is intended to exclude). [catch_unwind](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html), [thread::panicking](https://doc.rust-lang.org/std/thread/fn.panicking.html). |
| skill/data-and-types.md:32,212; skill/SKILL.md:276 | “Confirmed safe” is stronger than foldhash's documented minimal DoS resistance for the non-interactive case, and the central trigger has no structural foldhash/default-random adaptive-attacker case. Retain “not automatically disqualified under an explicitly non-adaptive threat model” and add structural activation for attacker-influenced keys. [foldhash security boundary](https://docs.rs/foldhash/0.2.0/foldhash/), [ahash::RandomState](https://docs.rs/ahash/0.8.12/ahash/random_state/struct.RandomState.html). |
| skill/security.md:42 | A username-derived salt is correctly rejected, but a table for derive("alice") cannot be reused for derive("bob"); remove the claim of one cross-account table. State targeted precomputation, normalization/reuse, and failure to meet random-per-credential policy instead. [OWASP salting guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#salting). |
| skill/deps-macros-ergonomics.md:82 | The facade correction still calls the ordinary runtime crate ::your_macro_crate::__serde, despite saying a proc-macro crate cannot export that item. Use ::your_runtime_crate::__serde/::your_facade_crate::__serde and state the two dependencies. [Procedural macro restrictions](https://doc.rust-lang.org/reference/procedural-macros.html). |
| skill/SKILL.md:306 | The blanket-impl trigger still defines “uncovered” too narrowly as a bare parameter in the implemented self type. impl<T> Bar<T> for Vec<T> is blanket while impl<T> Bar<Vec<T>> for Vec<T> is covered. Use the Reference's uncovered-parameter definition and examples. [Rust blanket implementations](https://doc.rust-lang.org/reference/glossary.html#blanket-implementation). |
| skill/lifetimes-and-api.md:112 | The statement that retroactively adding #[non_exhaustive] is breaking for every published exhaustive type is too broad: a struct that already has a private field already forbids downstream construction/destructuring. Qualify the claim by type shape. [Cargo SemVer non_exhaustive](https://doc.rust-lang.org/cargo/reference/semver.html#attr-non-exhaustive). |
| skill/SKILL.md:206,299-310 | SCC/DashMap factual wording is corrected, but no structural row activates §B2 for a map guard held across a later await. Add guard-live-across-await patterns for both families. [scc::HashMap](https://docs.rs/scc/latest/scc/hash_map/struct.HashMap.html). |
| skill/async.md:351,357-367; skill/SKILL.md:325 | §C9 now discusses blocking/local/handle spawn semantics, while structural activation still recognizes only tokio::spawn. Expand it to all relevant spawn forms and apply .in_current_span()/capture-and-enter appropriately. [Instrument::in_current_span](https://docs.rs/tracing/latest/tracing/trait.Instrument.html#method.in_current_span). |
| skill/SKILL.md:269,381 | Central thread::scope rows say child panic re-panics the parent “on drop”; the module correctly says this occurs when thread::scope returns after auto-joining. Fix the timing description. [thread::scope](https://doc.rust-lang.org/std/thread/fn.scope.html). |
| skill/SKILL.md:382 | The ReDoS structural row still names only backtracking crates. Add regex iterator/replacement methods on attacker-controlled haystacks and input-derived Regex::new/RegexBuilder without pattern-size bounds. |
| dev/validate-fixtures.mjs:5-9,21-26,48-51 | Fixtures still exercise only B5/B26 detectors, so the validator remains green when the high-risk trigger/recipe contradictions above are present. Add compiler-backed and source-level negative controls for B14/B21/C12, regex, public API, dependency, persisted-format, and security recipes. |

## Round-9 closure accounting

| Round-9 item | Status in a0197be |
|---|---|
| Nullable/unsafe callback allow-list | Closed. Safe vs unsafe C-ABI callbacks and Option<...> nullability are explicit. |
| Junction/symlink physical temp-path bypass | Closed for the exercised path. realpathSync.native is used and the built-in junction/symlink control runs without a skip. |
| Workspace-aware Miri and rollback error precedence | Closed. Central and module recipes agree. |
| Virtual-time acknowledgement/features and assert_matches! import/fallback | Module closed; the central non-Copy fallback remains P2. |
| rand 0.10, yanked packages, SQLx/argv, Borsh/Display, oneshot/Waker/Notify/read_exact | Closed in the scoped rules. |
| JoinSet/spawn-local enforcement | Partial: common forms were added, but _on methods and other JoinHandle-returning APIs remain absent. |
| Regex guard and iterator budget | Partial/not closed. |
| Public API activation and persisted-layout evidence | Partial/not closed. |
| aHash/foldhash and caught-panic wording | Substantively improved; P3 wording/activation residues remain. |
| Evidence and active installation | Open/unchanged. |

## Verification performed

| Check | Result |
|---|---|
| npm run validate | PASS — 12 skill Markdown files and 2 fixture cases; no junction/symlink-control skip was emitted |
| JS syntax checks | PASS — both validators and both workflow scripts |
| git diff --check ef89d4f..a0197be | PASS |
| Canonical skill/ vs skills/rust-intel/ | PASS — 11 Markdown files, zero SHA-256 mismatches |
| npm pack --dry-run --json | PASS — 37 entries; 572,212 bytes packed; 1,581,117 unpacked; integrity sha512-2kX2aQSMnZq+eDKpHcRtCAvqbCfLnk9XtNATwnVsDabd4INCFV/8axMmcVpJczKqMoj+oASAobTZqXu+zhkISQ== |
| Fix-plan object in HEAD | FAIL — docs/reviews/fix-plan-2026-08.md is absent |
| Review evidence in npm tarball | FAIL — zero docs/reviews/* entries |
| Active Codex skill parity | FAIL — 11/11 installed files match baseline 7a567a6; 0/11 match a0197be |
| Repository Cargo checks | Not applicable — no Cargo.toml; Rust API claims were checked against primary docs and targeted compiler probes |
| Tool versions | Node 24.12.0; npm 11.13.0; git 2.53.0.windows.2; rustc/cargo 1.97.0 |

## Recommended correction order

1. Close the five conditional-P1 structural gaps, using semantic rules where enumerating every Tokio/Cargo/API
   spelling would be brittle.
2. Repair the regex, cancellation-safety, central matches!, salt, persisted-layout, and public-signature
   recipes; then reconcile each module with its phrase and code triggers.
3. Add compiler-backed/source negative controls for the red rules and the corrected API examples; keep canonical
   and package mirrors byte-identical.
4. Reconcile the remaining P3 wording, commit or remove the fix-plan citation, publish evidence, and reinstall
   the Codex skill only after the normative rules are correct.
