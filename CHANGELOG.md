# Changelog

Format — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning — [SemVer](https://semver.org/).

Major = breaking changes to BANNED/REQUIRED wording that tooling depends on.
Minor = new categories or substantive additions.
Patch = wording refinements, fixes, new sources.

## [Unreleased]

Staged, not yet cut into a numbered release. Five batches of work sit here: a fifth-pass accuracy/content batch, a sixth-pass **usability refactor**, a seventh-pass **final consistency/usability fix pass**, an eighth-pass **corrective pass** (external review — one verified bug, a 🔴-propagation gap, three undisclosed-precondition gaps, meta-layer recalibration), and a **Tier E content batch** that opens a new top-level axis (systemic cost / performance) alongside the correctness tiers. The first four batches left the category count unchanged at **44** (no categories added, cut, merged, or renumbered); the Tier E batch raises it to **50** (§E1–§E6) and the tier count from **four** to **five**. All edits are documented under the spec's `[Unreleased]` staging; no version has been assigned yet.

---

### Tier E — Systemic-cost performance block (new content; 44 → 50 categories; four → five tiers)

A new top-level tier — **TIER E — Systemic cost: correct in the small, wrong at scale** (§E1–§E6) — opens a *different axis* from the correctness tiers A–D. This is a reframing of the frontier of failure: as the safe, locally-correct code in a system accumulates, the system breaks **as a whole** — latency, allocation pressure, accidental complexity, lock contention — even though no single line is "wrong". The cost is paid only under load, *outlives* correctness (a passing test on a small input proves nothing about it), and is invisible to `rustc` / `clippy` / `cargo test` exactly the way the Tier B/C/D bugs are. Tier E therefore does not use the BANNED/REQUIRED grammar of the correctness tiers; each law is framed as **where the cost hides / the cheap move / when not to touch it**. Nothing in Tier E is **🔴** (it is entirely 🟡/🟢) — a systemic-cost finding is never a hard blocker — and §E6 (measure-first) is built in specifically to keep the tier from degenerating into over-flagging: only accidental-O(n²) (§E3) and `clippy::perf`-obvious wins are proactive; everything else is profile-gated.

#### Added

- **New tier — TIER E (Systemic cost), §E1–§E6.** Sixth conceptual axis after the meta-layer and A/B/C/D; 🟡/🟢 only; profile-disciplined via §E6.
- **§E1 — Serialism that need not exist.** Independent `.await`s run sequentially → `join!` / `try_join!` / `buffer_unordered` / `JoinSet`; CPU-bound work on the async runtime → `spawn_blocking` / `rayon`.
- **§E2 — Allocation that need not happen.** Reflexive `clone` / `collect` / `format!`; `Vec::with_capacity` for known sizes; `Cow` / `&str` over owned `String`; reuse buffers; `bytes` for shared/zero-copy slices.
- **§E3 — Complexity that compounds.** Accidental O(n²) (the one always-fix case); the wrong container (`HashSet` / `VecDeque` / `SmallVec` / `BTreeMap` / `phf` chosen by access pattern).
- **§E4 — Contention that serializes.** `Arc<Mutex<_>>` on a hot path → atomic / `ArcSwap` / sharding / channel-ownership; shrink the critical section; pick the hasher by trust boundary (fast `FxHashMap` / `foldhash` / `ahash` for trusted keys, DoS-resistant default for untrusted — see §B16); false sharing → `CachePadded`.
- **§E5 — Work already done.** `Regex::new` / parsing repeated per call → `LazyLock` / `OnceLock`; unbuffered I/O → `BufReader` / `BufWriter`; reuse scratch buffers; lazy `tracing` evaluation; `dyn` dispatch in a hot path → generics / enum.
- **§E6 — Measure before you spend.** Profile-first discipline: `cargo flamegraph` / `perf`, `dhat` / `heaptrack`, `tokio-console`, `criterion`. §E3 and the `clippy::perf`-obvious wins are proactive; the rest is profile-gated — do not optimize on a guess.

#### Changed (structural propagation)

- **Category count 44 → 50** and **"four tiers" → "five"** propagated across every place either number is stated: the spec opening ("forty-four categories" and "The categories split into four tiers…" + tier list gains a Tier E line), the Enforcement-tiers preamble ("all 44 categories"), and the README's spec-architecture table (new Tier E row, count to 50).
- **Front-matter `description`** extended so the skill matches performance/scale queries (systemic-cost / latency / allocation / contention), without disturbing the existing correctness-hazard list.
- **Both trigger tables** route performance symptoms to §E*: the phrase table (slow at scale, two sequential `.await`s, too many allocations, lock contention, "faster HashMap", recompiles `Regex`) and the code-pattern table map onto §E1–§E6, with the hasher row split by trust boundary (§E4 + §B16).
- **`commands/rust-intel-cc/audit.md`** — the category walk now iterates §A1 → … → **§E6** and groups findings A → B → C → D → **E**, with an explicit note that Tier E is a different axis (systemic cost, never 🔴) and so never enters the 🔴-only Post-flight summary.
- **`commands/rust-intel-cc/fix.md`** — routing table gains performance rows (slow/high-latency-at-scale, sequential `.await`s, allocation churn, quadratic-at-scale, lock contention, "faster HashMap", `Regex`-in-loop / unbuffered I/O) mapping the symptom shape onto the right §E law, all under §E6 (measure first).
- **`docs/roadmap.md`** and **`docs/sources.md`** — Tier E logged as shipped content; normative performance sources added under §E* (see the sources.md entry in this batch).

This is a **MINOR** change by SemVer (new categories), but per `[Unreleased]` policy no version number is assigned yet.

_No version number assigned yet; these changes will be dated and versioned on the next release at the maintainer's instruction._

---

### Corrective pass (eighth review pass — external review: one verified bug, a 🔴-propagation gap, three undisclosed-precondition gaps, meta-layer recalibration)

The eighth pass was opened in response to an external review of the frozen spec — so the seventh pass's **"frozen"** verdict is hereby **superseded** (the freeze held for content saturation, not for correctness or for gaps the review surfaced from outside the loop). It found and closed one verified factual error (§C2's path-traversal guard), one propagation gap in the 🔴 list (§B13 lived in the tiers but never reached the operating-mode / audit / fix surfaces that consume it), and three in-scope gaps that were **unstated preconditions of the spec's own remedies** (`catch_unwind` × `panic = "abort"`, `thread_local!` × `.await`, `block_in_place` on a current-thread runtime — each a case where following an existing recommendation silently does nothing or panics unless the precondition is known). It also recalibrated several meta-rituals so that strictness is proportional. No category was added, cut, or renumbered — the count stays **44**; the seventh-pass block below is left intact as a historical record.

#### Fixed (correctness / consistency)

- **§C2 — verified factual error.** The path-traversal guard for `Path::join` was `has_root()`, which lets a bare `\\server\share` through (on Windows that is a `Component::Prefix` with no `RootDir` → `has_root() == false`), even though `join` discards the base anyway. The primary guard is now: reject a leading `Component::Prefix`/`RootDir` component.
- **§B3 — `write_all_buf` reclassified** from "cancel-safe-with-caveat" to cancel-safe (on cancellation the buffer is partially advanced — resume from the remainder).
- **🔴 list de-duplicated and propagated.** §B13 (`Relaxed`-publish) had lived only in "Enforcement tiers": Operating mode step 7 now **references** the canonical list instead of re-listing it; `commands/rust-intel-cc/audit.md` (step 6 and the summary header) likewise reference the canon; the Post-flight summary template in `audit.md` gained a §B13 line; `commands/rust-intel-cc/fix.md` gained a routing row for the atomic-ordering (ARM) symptom → §B13.
- **§B13 trigger-gap closed** — new row in the code-pattern table for `Ordering::Relaxed`-publication.
- **Operating mode step 1 ↔ Blocking protocol** — contradiction over unknown versions resolved ("ask" → "proceed with stated assumptions, ask to confirm"), aligning step 1 with the sixth-pass Blocking protocol.
- **Version pins** — `extern "C-unwind"` marked stable 1.71 (distinct from 1.81 = abort-by-default for plain `extern "C"`); `clippy::await_holding_lock` marked warn-by-default (`suspicious` group, since 1.45) — a manual `-W` is redundant.
- **`README.md`** — "Three tiers plus a meta-layer" → "Four" (a relic from before Tier D). **`docs/roadmap.md`** — the §B15a–e split marked ✅ shipped (sixth pass), the remaining dedup/rebalance separated out. **`CHANGELOG.md`** — removed the duplicated sixth-pass header (this same entry).

#### Added (bullets inside existing categories — count stays 44)

- **§B4 + §B25** — `catch_unwind` is inert under `panic = "abort"` (it catches nothing, and the guard code behind it never runs) and requires `UnwindSafe`; this was an unstated precondition of the spec's own recommendations.
- **§C9** — a `thread_local!` read after `.await` reads another worker's value or the default on a multi-thread runtime (the task can migrate between threads) → use `tokio::task_local!`.
- **§B11** — `spawn_blocking` pool starvation (default 512).
- **§B15c** — `block_in_place` panics on a current-thread runtime.
- **§B16** — HashDoS: for keys from untrusted input, do **not** swap the default `RandomState` for a fixed-seed `FxHashMap`/`fnv`/`ahash`.
- **§B20** — `#[serde(flatten)]` silently disables `deny_unknown_fields` and breaks `u128` / non-string map keys.
- **§B21** — a panic in a detached task (dropped `JoinHandle`) is silently swallowed.
- **§B26** — `saturating_sub` on `usize` (lengths / cursors) masks a logic bug.
- **§B5** — strict-provenance list extended (`map_addr` / `dangling` / `without_provenance`, stable 1.84); `Vec::into_raw_parts` preferred on ≥ 1.93.
- **§B4a** — let-chains have spread to `if let` match-guards (stable 1.95); the one silent-runtime never-type-fallback case is deny-by-default (edition 2024 / 1.92) and out of focus.
- **Version pins** — recent tokio APIs: `biased` in `join!` / `try_join!` (1.46), `SetOnce` (1.47), the coop module (1.44).

#### Changed (calibration / usability — strictness made proportional, no rule removed)

- The "Principle" section was condensed (~13 → 4 lines).
- Operating mode step 3 (text-first for traits) scoped to the public API of a published library.
- Operating mode step 5 (`/// cancel-safe:`) narrowed to functions actually in a cancellation context.
- Enforcement tiers: narrowing `as` stays 🟢 but with a trust-boundary caveat; the canonical "inline-flag policy" is stated once, in 🟡.
- **§A2** — "`Box<T>` for a small `Sized` is almost always wrong" softened (recursion / `Pin` / `dyn` are exceptions).
- **§B7** — the 64 KiB stack threshold moved from BANNED to a guideline (escalate on recursion / deep chains / a reduced stack); "2 MiB on tokio tasks" → "worker thread".
- **§B12** — "mandatory human cryptographer review" reserved for custom / protocol-level crypto.
- **§B16** — the inline flag for a manual `PartialEq`/`Ord` narrowed to non-trivial contracts.
- **§C4** — algorithmic O(n²) (always fix) separated from micro-allocations (profile-gated).
- Trigger table: three duplicated phrase rows merged. Tier A intro: the residual compile-only list collapsed to a pointer.

#### Tooling/docs

- `commands/rust-intel-cc/audit.md`, `commands/rust-intel-cc/fix.md`, `README.md`, `docs/roadmap.md` — see above.

_No version number assigned yet; these changes will be dated and versioned on the next release at the maintainer's instruction._

---

### Final fix pass (seventh review pass — resolve refactor seams, close one currency gap, then freeze content)

The seventh pass found the content saturated but the sixth-pass refactor had left a few seams (the rebuilt post-flight contradicted leftover "surface every X" tails in category bodies; the closing manifesto still said "every rule is a HARD constraint" against the new tiers; §B26 had been *over*-softened into under-flagging). It also surfaced one genuinely new coverage gap (edition-2024 drop-order changes) and verdict'd that the review loop has hit diminishing returns — this is the last content pass; further signal should come from *using* the spec, not another audit.

#### Fixed (contradictions and one regression)

- **§B26 under-flagging regression.** The refactor had made `overflow-checks = true` the primary defense and gated manual `checked_*` to (a) untrusted boundaries and (b) typed-error-on-wraparound — leaving an ordinary long-lived counter in a project that doesn't set the global flag (the default) and isn't from a trust boundary protected by *nothing* in release. Restored a third case: `checked_*` covers any monotonically accumulating value when `overflow-checks = true` is not guaranteed in the build profile. Routine bounded `i + 1` / `(lo + hi) / 2` remain explicitly out (no return to over-flagging).
- **Post-flight ↔ category bodies contradiction.** The refactor rebuilt the post-flight checklist as "surface ONLY the 🔴 tier", but nine non-🔴 category bodies (§A3, §B1b, §B2, §B8, §B9, §B15a, §B16, §B20, §C5) still ended with "Surface every X **in the post-flight summary**" — pointing into a list that now excludes them. Those nine now say "flag inline (at write time)"; the rule stays, the contradiction is gone. Operating mode step 7 likewise rewritten to "surface the 🔴-tier (canonical list in Enforcement tiers), note the rest inline." The five remaining "in the post-flight summary" mentions are all 🔴 categories, where the reference is correct.
- **Closing manifesto vs Enforcement tiers.** The final "When this command is loaded" section still said "Treat every rule above as a HARD constraint … surface violations as blocking" — a direct contradiction of the just-added tier model. Reworded to: 🔴 are hard constraints (surface always, block per the Blocking protocol); 🟡 applied while writing without per-occurrence reporting; 🟢 owned by clippy.
- **§C5 "surface every clone".** Narrowed to: a `.clone()` introduced *to silence a borrow error* gets an inline one-line justification; routine / `Arc::clone` / `Copy`-type clones are 🟢 (clippy) / 🟡 (write-time), not surfaced — consistent with the tiers.

#### Added (one currency gap; a subsection, not a new category — count stays 44)

- **§B4a — Edition-2024 temporary-scope drop-order changes** (subsection of §B4, like §B1a/§B1b). The spec targets edition 2024 but had not covered edition 2024's own *silent* behavior changes. Two are genuine "compiles, tests green, drop order silently shifted" hazards: the `if let … {} else {}` scrutinee temporary now drops before the `else` block (`if_let_rescope`; the canonical case is an `RwLock` deadlock that 2021 has and 2024 silently fixes — or code relying on the extended temporary lifetime that now drops early), and tail-expression temporaries now drop before the block's locals (`tail_expr_drop_order`, advisory lint with **no autofix**). Pairs with let-chains (1.88). Plus a phrase trigger, a code-pattern trigger, and a version-pins note. (RPIT `use<>` capture, `unsafe extern`, `gen` blocks, static-mut `&raw`, never-type fallback were all evaluated and correctly left out — each is compile-only or deny-by-default, not a silent post-compilation bug.)

#### Changed (usability / dedup)

- **🔴 list de-duplicated.** The ~11-item 🔴 set lived identically in both "Enforcement tiers" and the post-flight checklist. Enforcement tiers is now the single canonical list; the post-flight references it and keeps only the toolchain commands (clippy/miri/test) and optional tools. Removes the fifth duplication surface the refactor had inadvertently created.
- **§C1 blanket-impl 🔴 scoped to published libraries.** Marked 🔴 only for a *published* library's public API (a semver hazard); for bin/internal crates it is not a 🔴 concern.
- **§B13 atomic `Relaxed`-publish promoted to 🔴.** A `Relaxed` store/load used to publish data to another thread is a data race invisible to tooling and to tests on x86 (the dev machine's strong memory model hides it) that breaks on ARM — it fits the 🔴 criteria (invisible to tooling, not caught by tests, silent corruption) better than some items already there.

#### Minor

- **§A2/§B2** — note that a `LazyLock`/`OnceLock` init closure that panics poisons the cell (every later access panics, not just the first); don't panic in lazy init.
- **§B3** — the `/// cancel-safe:` annotation requirement aligned with the softened Operating mode step 5 ("every *non-trivial* async fn").
- **§B8** — `async ||` closures (stable 1.85) added to the list of future-producing forms that are inert until polled.
- **§C1** — fixed a dangling "§B5/T4" cross-reference to "§B5".
- **`commands/rust-intel-cc/audit.md`** — the report-format example aligned to the 🔴-only post-flight (it had still listed `unwrap`/`Arc<Mutex<_>>`/`.lock().unwrap()` counts as mandatory summary lines).
- **`docs/sources.md`** — added the USENIX Security 2025 package-hallucination study (19.7% non-existent packages, 58% repeatable across runs) as a quantified slopsquatting anchor, with an explicit PyPI/npm-not-crates.io caveat.

The trigger table's risk column was reviewed for consolidation but left intact — on inspection each entry carries disambiguation or a memorable code signature rather than a verbatim restatement, so collapsing it would cost navigation nuance for little gain.

With these seams closed, the post-compilation content taxonomy is treated as **frozen**; the next signal comes from running the spec on real code, not from further review passes.

---

### Usability refactor (sixth review pass — "make it easier to apply", not new content)

The sixth pass found the content saturated and accurate, but the document bloated and ritualistic: a 56-bullet post-flight that duplicated category bodies, "everything is a HARD constraint" with no triage, and over-flagging (every `as`, every `+`, every `clone`) that trains the reader to ignore the whole spec. This refactor reorganizes for **applicability** without removing a single rule.

#### Added

- **"Enforcement tiers" section** — the core change. Three tiers tell the reader *how strictly* to act on each category, orthogonally to the A/B/C/D *what-kind-of-bug* tiers: **🔴 surface-always / may block** (~11 high-blast-radius classes: unsafe, crypto, FFI, slopsquatting/new-dep, manual `Send`/`Sync`, async-`Drop`, secret-`==`, unbounded channel, blanket impl, `Pin::new_unchecked`, dropped `JoinHandle`), **🟢 delegate to clippy** (narrowing `as`, `clone_on_copy`/`redundant_clone`, `unexpected_cfgs` — don't hand-check what the linter catches), **🟡 apply while writing** (everything else — write it right, don't spam the summary). Goal: a summary a human reads in ten seconds where every line is worth acting on.

#### Changed

- **Post-flight checklist rebuilt: ~56 bullets → ~11.** Now a flat signature list of only the 🔴-tier occurrences, with the "why/how" left in the category bodies (where it already lived) instead of duplicated. The clippy command gains `-W clippy::arithmetic_side_effects` (see accuracy fix below). All the dropped 🟡-bullets (`as`, `+`/`sum`, `clone`/`to_string`, `sort_unstable`, `pub fn` lifetimes, `RefCell::borrow_mut`, `Path::join`, `read`/`write`, …) **remain as rules in their category bodies** — only the noisy re-surfacing mandate was removed.
- **§B26 over-flagging softened.** `overflow-checks = true` (release profile) is now the *primary* defense; manual `checked_*` is reserved for untrusted boundaries and typed-error-on-wraparound. The BANNED wording no longer reads as "every arithmetic" — it targets values from untrusted input, unbounded growth, or monotonic accumulation; routine `i + 1` / `(lo + hi) / 2` are explicitly out.
- **Operating mode mandates narrowed.** `/// cancel-safe:` annotation is required only for an `async fn` with more than one side-effecting `.await` or one documented to run under `select!`/`timeout` — not every async fn (the old mandate generated noise the spec itself calls ~50% unreliable). "Show the caller" is required only when the returned reference binds more than one input lifetime (the actual §B1a shape), not every `&T`.
- **Blocking protocol narrowed.** Refuse-to-generate is now limited to three cases where the cost of guessing is catastrophic or irreversible: crypto without a threat model (§B12), `unsafe` with caller invariants unstated (§B5), and adding an unnamed/unverified dependency (§A1). Everything else (unknown crate versions, missing trait defs, drop semantics) switches to "proceed with explicitly stated assumptions" — generate the code, flag the assumptions, ask to confirm — instead of blocking the user.
- **§B15 split into labeled subsections** §B15a (AFIT vs RPITIT) / §B15b (Pin, Waker) / §B15c (sync↔async bridging) / §B15d (`Stream` vs `Iterator`) / §B15e (tokio sync/timing primitives), as sub-headings under the unchanged `## §B15` — like the existing §B1a/§B1b. No renumber; every bullet preserved; trigger references point at the sub-anchors where natural.
- **Opening de-duplicated.** The scope thesis ("compiles + tests ≠ correct") and the compile-only-exclusions list were restated 3–5 times across front-matter, the opening, the tier intro, "Principle", and the Tier B intro; each is now stated once canonically. The giant sentence that re-listed all 44 categories in prose was trimmed to a scope line plus a pointer to `docs/sources.md` for the empirical figures.

#### Accuracy fixes folded into the same pass

- **§B26 — `clippy::arithmetic_side_effects` is in the `restriction` group, not `pedantic`.** The text claimed it was pedantic and a "same blind spot as the cast lint"; in fact `-W clippy::pedantic` (which the post-flight runs) catches the lossy-cast lint but **not** integer overflow — you must enable `arithmetic_side_effects` explicitly. Reworded, and the flag added to the post-flight clippy command.
- **§C2 — `Path::join` guard corrected for Windows.** `is_absolute()` is the wrong check: `join` discards the base on `has_root()`, and `/etc/passwd` or `\\server\\share` give `is_absolute() == false` while still dropping the base. Now recommends `has_root()` (or rejecting a leading `RootDir`/`Prefix` component).
- **§B26 — `overflow-checks = true` hot-path caveat.** Noted the global runtime cost (~5–15%, inhibits autovectorization); for numeric hot paths, prefer targeted `checked_*` at the few real overflow sites over the global flag.
- **§B12 — unsourced "~23%" figure removed** (it had no entry in `docs/sources.md`); the documented "~57% of crypto vulnerabilities missed by static analyzers" is kept.

#### Tooling/docs (this pass)

- **`README.md`** — one paragraph distinguishing the A/B/C/D category tiers (what kind of bug) from the 🔴/🟡/🟢 enforcement tiers (how strictly to act). No version/Status/count change.
- **`docs/roadmap.md`** — the rejected `§B18 #[no_std]` draft moved to an explicit "Rejected — out of scope by design" section; the "add ~5 more trigger patterns" item inverted to "consolidate, don't grow"; the per-tier-file split question closed ("one `SKILL.md`; consolidate internally instead"); infrastructure (`examples/` corpus, CI link-checker) promoted to highest-value-next.

---

### Fifth review pass (accuracy + content)

A fifth review pass (empirical, against rustc 1.93 / tokio 1.52.3) found three fresh inaccuracies in the v0.4.0 text, one content gap (integer overflow) that survived the saturation sweep, and a command-file bug that survived all five rounds. Integer overflow was folded into §B26 rather than made a new category.

### Changed (accuracy fixes — regressions from v0.4.0)

- **§B15 — `watch::Receiver` `changed()` claim corrected.** v0.4.0 said `changed().await` "returns immediately the first time" on a fresh receiver. Verified false on tokio 1.52.3: the initial value is marked **seen** at receiver creation, so `changed().await` is *pending until the next `send`* — it does not fire for the initial value. `borrow()`-returns-initial is correct and kept; the loop example now uses `borrow_and_update()`.
- **§B28 — `ß` case-mapping example was backwards.** The length-changing example `ß → ss` was attributed to the wrong direction: `ß` is unchanged by `to_lowercase()` and becomes `SS` under `to_uppercase()`. Corrected to `ß → SS` under `to_uppercase`; the Turkish `İ → i̇` example correctly illustrates `to_lowercase`.
- **§B27 — `Instant::saturating_add` does not exist on stable.** The overflow bullet recommended it; `Instant` has `checked_add` and `saturating_duration_since` but no `saturating_add` (that is a `Duration` method). Reworded to split the two types.

### Added (content — folded into existing categories, no new category, count stays 44)

- **§B26 (renamed "Lossy numeric conversions and integer overflow") — integer overflow + div/rem-by-zero + index OOB.** The headline addition: bare integer `+`/`-`/`*`/`pow`/`sum` on untrusted or accumulating values **panics in debug but silently wraps in release** (`overflow-checks = false` is the release default), so `cargo test` (debug) stays green while the shipped release binary wraps a counter/offset/size through zero — the most dangerous debug-vs-release divergence in the language, caught by no default lint. Plus `a / b` / `a % b` panic on a zero divisor (debug *and* release), and `slice[i]`/`split_at` panic on an untrusted out-of-bounds index. REQUIRED: `checked_*`/`saturating_*`/`wrapping_*`, `overflow-checks = true` for prod release builds, `slice.get(..)`.
- **§C4 — partial `Read`/`Write`.** A single `read`/`write` may transfer fewer bytes than requested even without EOF (sockets, pipes); use `read_exact`/`write_all`/`read_to_end` or loop.
- **§C2 — `Path::join` with an absolute segment.** `base.join(untrusted)` silently discards `base` if the segment is absolute — a path-traversal hazard; validate with `Path::is_absolute` / reject `..` / canonicalize-and-check.

### Changed (self-monitoring + checklist)

- Trigger table extended (+4 phrase, +5 code-pattern) for integer overflow, div-by-zero, partial read/write, and `Path::join`. Post-flight checklist gains the matching surface-able items. Version-pins note added: integer-overflow behavior is not version-gated (`checked_*` etc. stable since 1.0).

### Fixed (command files)

- **`commands/rust-intel-cc/audit.md` — Tier D was invisible to `/rust-cc-audit`.** The category-walk said "iterate from §A1 through the final **§C** category" and grouped findings "by tier (A → B → **C**)", silently skipping Tier D (§D1, §D2), which has existed since v0.3.0. This is the audit-command analog of the README "§A1–§C11" bug fixed in v0.3.2 — it survived all five review rounds. Now walks through §D2 and groups A → B → C → D.
- **`commands/rust-intel-cc/fix.md`** — routing table extended with rows for §B26 (overflow / lossy cast / div-by-zero), §B27 (duration looks wrong / `.elapsed().unwrap()` panic), §B28 (`byte index not a char boundary` panic / mid-character truncation).
- **`README.md`** — stale Layout comment for `roadmap.md` ("Planned commands and category expansions" → "Roadmap: open directions and structural notes").

_No version number assigned yet; these changes will be dated and versioned on the next release at the maintainer's instruction._

The post-compilation taxonomy is now near-saturated under the spec's scope. See [`docs/roadmap.md`](docs/roadmap.md) for the remaining work, which is now mostly **infrastructure** rather than content: an `examples/` regression corpus (deliberately-broken Rust per category, run through `/rust-cc-audit`), CI markdown/link checking, and the still-open structural question of splitting the overloaded §B15.

## [0.4.0] — 2026-05-29

Content release. Closes the last systematically-missed gap under the spec's scope — everyday **`std` primitives that compile, pass ASCII/small-number tests, and break in production** — with three new Tier B categories plus a batch of bullet-level additions to existing ones. A fourth review pass found v0.3.2 itself clean (zero regressions — the first patch in the project's history to introduce no new bugs), so this release is purely additive. **Category count 41 → 44.** No renumber of existing categories; slash commands and install/uninstall behavior unchanged. Re-run the installer.

### Added (new Tier B categories)

- **§B26. Lossy numeric conversions.** `as`-casts silently truncate, wrap, or saturate with no panic and no default warning (`clippy::cast_possible_truncation` is pedantic / off-by-default). Covers narrowing/sign-changing integer casts (`u64 as u32`, `len() as u32`), the `usize`-is-32-bit-on-wasm32 trap, and float→int saturation (since Rust 1.45: `300.0_f32 as u8 == 255`, `NaN as i32 == 0`). REQUIRED: `try_from` for narrowing; explicit range checks before float→int. This is the backing rule for the long-orphaned `as`-cast line in the post-flight checklist.

- **§B27. Wall-clock vs monotonic time.** Measuring durations/timeouts with non-monotonic wall-clock time (`SystemTime::now()`, `Utc::now()`) breaks when the clock steps (NTP, DST, manual change); `.elapsed().unwrap()` / `.duration_since().unwrap()` panic in production on a backwards step because both return `Result` for exactly that reason. REQUIRED: `Instant::now()` for all durations/deadlines/benchmarks; `SystemTime` only for absolute timestamps; handle the `Err` or use `saturating_duration_since`.

- **§B28. UTF-8 and string-boundary hazards.** String ops that are correct on ASCII and panic or corrupt on non-ASCII: `&s[a..b]` with computed indices panics on a non-char-boundary (`&"café"[0..4]`), `s.len()` (bytes) conflated with character count, `to_lowercase`/`to_uppercase` (full Unicode, can change length) used for ASCII protocol comparisons. REQUIRED: `s.get(a..b)` / `char_indices` / `chars().take(n)`; `unicode-segmentation` for graphemes; `eq_ignore_ascii_case` for protocol strings.

### Added (bullet-level, existing categories)

The eight items previously parked in the roadmap's v0.4.0 backlog, plus four medium-priority finds from the fourth review pass, shipped into existing categories:

- **§A2** — `Box::leak(Box::new(...))` for globals (leaks on every re-init path; use `OnceLock`/`LazyLock`, stable ≥ 1.80); `RefCell` where `Cell` suffices for `Copy`/replace-whole interiors (avoids the §B17 `BorrowMutError` panic surface).
- **§B4** — `mem::forget`/`ManuallyDrop` without a manual drop silently disables RAII (fd/connection/lock never released) — the §C5 reflexive-`.clone()` reflex applied to `Drop`.
- **§B7** — unbounded recursion **depth** over untrusted input (recursive-descent parser, tree/JSON walk) overflows the stack, which is `SIGSEGV`/abort — *not* a catchable panic, so a clean DoS vector. (Distinct from the existing frame-size trap.) REQUIRED: explicit depth limit or iterative rewrite.
- **§B14** — `FuturesUnordered`/`JoinSet` grown unbounded (same hazard as an unbounded channel), and an empty `FuturesUnordered` in a `select!` arm returns `Poll::Ready(None)` immediately → 100% CPU busy-loop.
- **§B15** — `watch::Receiver::borrow()` returns the **initial** value before any `send`, and the first `changed().await` returns immediately; use `borrow_and_update()` to avoid re-processing.
- **§B16** — `sort_unstable*` when the relative order of equal elements matters silently breaks a multi-key sort's secondary order; use stable `sort`/`sort_by_key` when the tie-break is load-bearing.
- **§B20** — deserializing a large integer (snowflake ID, ns timestamp, `u64` > 2^53) into an `f64` field or via `Value::as_f64()` silently loses precision (53-bit mantissa).
- **§C2** — `env::var("X").unwrap()` panics both on a missing var and on a non-UTF8 value (common on Windows); use `var_os` / handle `VarError::NotPresent`.
- **§C4** — `Vec::remove(0)`/`insert(0, _)`/`contains` in a loop is O(n²) (use `VecDeque`/`swap_remove`/`HashSet`); `{:?}` on `&[u8]`/`Vec<u8>` prints a decimal array, not hex (use `hex::encode` for non-secret bytes).
- **§C9** — logging PII (email, name, phone, address, government ID, card, IP) through `Debug`/`tracing` is a compliance leak (GDPR/PCI) distinct from §B12's crypto-secret coverage; classify and redact PII fields.

### Changed (wording accuracy)

- **§B15 — `Notify` pattern wording corrected.** v0.3.2's comment said `.enable()` "registers the waker"; per tokio's docs `enable()` does not register the task `Waker` (that happens at poll/await) — it *arms the future for wakeups* by adding it to the notify list. Reworded to "arms the wakeup"; the code and its load-bearing-`.enable()`-before-the-check semantics are unchanged.

### Changed (self-monitoring + checklist)

- **Trigger table** extended for every new rule: +8 phrase triggers (numeric cast, time measurement, substring/case, global/singleton, large JSON id, env var, sort-by, recursive parser) and +10 code-pattern triggers (`as`-narrowing, `SystemTime` duration, `&s[..]`/`len()`-as-chars, `Box::leak`, `mem::forget`, `FuturesUnordered`, `watch::channel`, `Vec` front-mutation, `{:?}`-on-bytes, `sort_unstable*`).
- **Post-flight checklist** gains surface-able items for the new categories and bullets (narrowing casts, `SystemTime`-for-duration, computed `&s[..]`, `Box::leak`, `mem::forget`, unbounded `FuturesUnordered`, `env::var().unwrap()`, `sort_unstable*`, `Vec` front-mutation, depth-unbounded recursion, PII-through-`Debug`).
- **Version pins** — float→int saturating cast pinned to Rust 1.45; `LazyLock` to 1.80 (alongside `OnceLock`).

### Tooling and documentation

- **`README.md`** — Status block gains a v0.4.0 entry (v0.3.2 preserved; v0.3.0 condensed to a one-line scope-reframe reference). Spec-architecture table Tier B range `§B1–§B25` → `§B1–§B28`. Category count updated to 44.
- **`docs/roadmap.md`** — the "Deferred to v0.4.0" backlog is now "Shipped in v0.4.0" with each item mapped to its landing category; the §B15-split and section-rebalance notes remain open as structural work; a saturation note redirects future effort to infrastructure.
- **`docs/sources.md`** — normative-source entries added for the three new categories (Rust Reference on `as`-cast semantics, `std::time` on monotonic vs wall-clock, `str` UTF-8 docs).
- **`CHANGELOG.md`** — the v0.3.2 line-endings note was corrected (it claimed the working tree was renormalized to LF; in fact only the index is LF-canonical, the Windows working copy stays CRLF by design under `eol=lf`).

### Migration

Re-run the installer. The skill grew by three categories and ~a dozen bullets; nothing was renumbered or removed, so any reference to §A1–§D2 or §B1–§B25 remains valid (§B26–§B28 are new). Slash commands and scripts are unchanged.

## [0.3.2] — 2026-05-29

Same-day patch on top of v0.3.1. Fixes three bugs **introduced by v0.3.1 itself** (a third review pass caught them), corrects an internal category count, catches the trigger table up to the v0.3.1 rules, and adds four bullet-level pitfalls under the existing scope. **No new categories** — total stays at 41. **No renumber.** Re-run the installer; nothing else changes.

### Changed (accuracy fixes — all regressions from v0.3.1)

- **§B15 — the `Notify` lost-wakeup pattern was missing its load-bearing `.enable()`.** v0.3.1 added a bullet whose example (`let permit = notify.notified(); pin!(permit); if !condition() { permit.await; }`) registered the waker only at `.await` — *after* the condition check — leaving the exact race the bullet claimed to close. Per tokio's docs, a `Notified` future does not receive wakeups until it is polled or explicitly armed. The corrected pattern arms the waker with `notified.as_mut().enable();` between `pin!` and the check, so a `notify_one()` landing between check and await is not lost. Variable renamed `permit` → `notified` (it is a `Notified` future, not a semaphore permit).

- **§B11 + Version pins — `tokio::task::coop::consume_budget` was pinned to the wrong version.** v0.3.1 claimed the `coop::` path was stable since tokio 1.39.1. In fact the *function* is stable since 1.39.1 at `tokio::task::consume_budget`; the `tokio::task::coop` module did not exist until **tokio 1.44.0**, which is also when the old path became `#[deprecated]`. Both §B11 and the Version-pins section now give the correct dual path keyed on MSRV (`tokio::task::consume_budget` below 1.44, `tokio::task::coop::consume_budget` on 1.44+).

- **§C2 — the `thiserror` `#[from]` bullet was both inaccurate and out-of-scope; reframed.** v0.3.1 claimed two interconvertible `#[from]` variants make `?` "silently prefer" one impl. That is wrong: two `#[from]` on the same source type is a hard `E0119` compile error, not a silent preference — and a compile error is out of scope for this spec by design. The bullet is reframed onto a genuinely in-scope hazard: **reflexive `#[from]` erases call-site context** — `#[from] io::Error` collapses every `?` on an I/O operation into one variant, so production logs say "I/O error" with no indication of *which* operation failed. Compiles, tests pass, diagnostics rot. Fix: reserve `#[from]` for source types that already uniquely identify the failure; otherwise carry context with `#[source]` + explicit `.map_err(...)` per call site.

### Changed (minor wording)

- **§B8 — `tokio::sync::oneshot::Receiver` has no `.recv()` method.** The bullet's variable was named `recv`, falsely implying a `.recv()` call (which `mpsc::Receiver` has, but `oneshot::Receiver` does not — it *is* a `Future`, awaited directly). Renamed to `rx` and added a parenthetical noting the receiver is awaited directly.

- **§B15 — `block_in_place` was loosely called a "sync-to-async bridge".** It is the opposite: it lets an async task run *blocking* code on the current worker without starving siblings; you still cannot `.await` inside it without a `Handle`. Reworded to distinguish it from `spawn_blocking` and from a sync→async bridge.

- **§B-tier intro — "twenty-four categories" → "twenty-five".** §B1–§B25 is twenty-five categories; the prose count had not been updated when v0.3.0 added §B16–§B25.

### Changed (trigger table caught up to v0.3.1)

v0.3.1 added rules but no triggers for them, so the self-monitoring layer never surfaced them proactively. Added:

- **Phrase triggers** (5): `interval`/periodic/timer → §B15; exit/bail-out → §B4; wait-for-signal/condition-variable → §B15 (`Notify`); log-this-struct/derive-Debug on secret-bearing types → §B12; compare-floats/approximately-equal → §D1.
- **Code-pattern triggers** (8): `std::process::exit` below a live guard → §B4; `Arc::strong_count`/`Rc::strong_count` in a conditional → §B13; `assert_eq!` with an `f32`/`f64` operand → §D1; `notify.notified()` → §B15; `#[derive(Debug)]` on a struct with a `password`/`secret`/`token`/`key`/`seed` field → §B12; `impl Drop` whose body can panic → §B4; `tokio::time::interval(...)` → §B15; `oneshot::channel()` with the result discarded/`.unwrap()`-ed → §B8.

### Added (bullet-level, no new categories)

- **§B15 — `tokio::time::interval` first-tick semantics.** The first `.tick().await` returns immediately (at creation), not after one period; the default `MissedTickBehavior::Burst` fires missed ticks back-to-back to "catch up", producing a load spike. REQUIRED: discard the first tick or use `interval_at(Instant::now() + period, period)`, and set `MissedTickBehavior::Delay`/`Skip` explicitly.

- **§B13 — atomic memory ordering.** `Ordering::Relaxed` on an atomic used to *publish* data establishes no happens-before edge — the reader can observe the flag before the payload writes, a data race that x86's strong model hides in tests but that breaks on ARM/AArch64. Use `Release`/`Acquire` (or `AcqRel`/`SeqCst` for RMW) when the atomic gates other memory; `Relaxed` only for standalone counters; don't blanket-`SeqCst`; model-check with `loom`.

- **§B14 — `broadcast::RecvError::Lagged(n)` is data loss, not a transient error.** `Lagged(n)` means `n` messages are gone forever and the receiver has skipped to the oldest still-buffered one; a `match { Err(Lagged(_)) => continue }` loop recovers nothing and masks the loss. Log/metric the skipped count and decide explicitly whether dropping is acceptable.

- **§D1 — tests against fiction.** Three blind-test antipatterns: a mock/fake that only ever returns success (proves behavior against fiction, never against the dependency's real failure modes); `#[ignore]` left on "temporarily" (invisible to `cargo test`, rots silently while CI stays green); tests sharing mutable global state (static cell, fixed-name temp file, hard-coded port) that pass only by run order and flake under `cargo test`'s default parallelism.

### Tooling and documentation

- **`README.md`** — Status block gains a v0.3.2 entry (the v0.3.0 entry is preserved below it for the scope-reframe context). The "Verify" section's category range corrected from `§A1–§C11` to `§A1–§D2` so Tier D is visible.
- **`docs/roadmap.md`** — new "Deferred to v0.4.0" subsection listing the bullet-level additions surfaced by the third review pass (`env::var`, `Box::leak`, `mem::forget`, `serde_json` fidelity, `watch::Receiver`, `FuturesUnordered`, `{:?}`-on-bytes, `Cell` vs `RefCell`) plus structural notes (possible §B15 split, section-length rebalancing).
- **`rust-intel.md`** — re-confirmed LF-canonical in the index (the committed blob is LF); the Windows working copy stays CRLF by design under `* text=auto eol=lf`, and git no longer warns because the canonical eol is explicit. (No content change — this corrects the wording of the original v0.3.2 note; nothing was actually re-converted.)

### Migration

Re-run the installer. The skill content changed (three corrections, two wording fixes, a count fix, twelve new trigger rows, four new bullets); slash commands and install/uninstall behavior are unchanged.

If you copied the v0.3.1 §B15 `Notify` pattern into your code, re-copy it — the v0.3.1 version had a real lost-wakeup race (missing `.enable()`). If you pinned tokio between 1.39.1 and 1.43 and used the `tokio::task::coop::consume_budget` path the v0.3.1 text suggested, switch to `tokio::task::consume_budget` (the `coop` module only exists from 1.44).

## [0.3.1] — 2026-05-28

Same-day patch on top of v0.3.0. Five accuracy bugs in the v0.3.0 text fixed, seven existing categories extended with bullets covering pitfalls under the spec's stated scope (compiles + tests pass but still breaks). **No new categories** — total stays at 41. **No renumber.** Anyone running v0.3.0 re-runs the installer; nothing else changes.

### Changed (accuracy fixes)

- **§B23 — `tokio::sync::mpsc::Sender::send` is NOT cancel-safe in `select!`.** v0.3.0 text claimed it was; per tokio's own documentation, when `send` is cancelled in a `select!` arm, the message is **dropped and lost**. The two-step `Sender::reserve().await` → `Permit::send(value)` is the canonical cancel-safe pattern (reserve acquires capacity asynchronously and is cancel-safe; the synchronous `Permit::send` cannot fail at that point). Section rewritten to remove the false claim and document the correct pattern.

- **§B25 — `cargo expand --type-sizes` does not exist.** v0.3.0 text recommended this fictional invocation for FFI layout verification. `cargo expand` is a third-party macro-expansion plugin with no such flag. Replaced with the real nightly tool `cargo +nightly rustc --lib -- -Zprint-type-sizes` plus a stable-toolchain fallback using `std::mem::size_of`, `std::mem::align_of`, and `std::mem::offset_of!` in a unit test asserted against expected C-side values.

- **§B11 + Version pins — `tokio::task::consume_budget` path is deprecated.** The canonical location is `tokio::task::coop::consume_budget`; the older `tokio::task::consume_budget` re-export is now `#[deprecated]`. Spec text and version pins updated. Stable since **tokio 1.39.1** (1.39.0 was yanked).

- **§B24 — `subtle::ConstantTimeEq::ct_eq` returns `Choice`, not `bool`.** v0.3.0 phrasing "`x.ct_eq(&y).into()` returns `bool`" was technically correct but invited readers to write `if x.ct_eq(&y) { ... }` (which does not compile). Reworded to be explicit: `ct_eq` returns `subtle::Choice` and must be converted via `bool::from(choice)` or `choice.into()`. Also flagged: never branch directly on `Choice` — the whole point is to keep the comparison branch-free until the explicit conversion.

- **§C11 — C-DEREF citation made verbatim.** v0.3.0 paraphrased the API Guideline; the rest of the spec uses literal quotes. Now uses the verbatim form: *"Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). The traits should be used only for that purpose."*

### Changed (category extensions, no new categories)

- **§B12 (Crypto) — Debug leakage, JWT `alg: none`, AEAD nonce width, key zeroization.** New BANNED bullets cover `#[derive(Debug)]` on structs with `password`/`secret`/`token`/`api_key`/`private_key`/`seed`/`mnemonic`/`cookie` fields (printed by `{:?}` in logs); JWT verification that accepts `alg: none` (always pin allowed algorithms explicitly); AEAD encryption with a nonce length other than the algorithm's specified width (96 bits / 12 bytes for AES-GCM and ChaCha20-Poly1305). New REQUIRED bullet covers `zeroize` discipline (`#[derive(Zeroize, ZeroizeOnDrop)]`) for key material.

- **§C2 (Error handling) — `Box<dyn Error>` in libraries, ambiguous `#[from]`.** New BANNED bullets cover `Result<T, Box<dyn Error>>` as the return type of any `pub fn` in a published library crate (callers can't match), and `thiserror::Error` enums with two or more `#[from]` variants over interconvertible source types (the `?` operator's resolution becomes ambiguous).

- **§D1 (Tests by luck) — floating-point exact equality.** New BANNED bullet: `assert_eq!` on computed `f32`/`f64` values flakes between debug/release, architectures, and compiler versions. Use `approx::assert_relative_eq!` / `assert_abs_diff_eq!` or manual epsilon comparison.

- **§B4 (Drop and RAII) — `process::exit` skips Drop, panic-in-Drop.** New BANNED bullets: `std::process::exit(...)` from code paths with stack-local guards (transactions, file handles, lock guards) — `process::exit` does not unwind; `Drop::drop` body that can itself panic during a panic unwind (double-panic aborts the process). Cross-link added pointing to §B22 for the async cleanup constraint.

- **§B8 (Silent task dropping) — `oneshot` channel drop cascades.** New BANNED bullets: `let _ = tx.send(value);` on a `tokio::sync::oneshot::Sender` (discarding the `Err(value)` when the receiver is gone makes the producer's work invisible), and `recv.await.unwrap()` on a `oneshot::Receiver` when the producer can fail or be dropped. Cross-link added pointing to §B21 for the work-runs-but-can't-be-observed case.

- **§B15 (Advanced async) — `Notify` lost-wakeup, half-consumed `Stream`, `select! biased`.** Three new BANNED bullets: `notify.notified().await` without first checking the represented condition (the canonical fix is the `notified() → pin! → check → await` four-step); dropping a half-consumed `Stream` without explicit acknowledgement that buffered items are lost; `tokio::select! { ... }` without `biased;` when arm priority matters (default per-poll pseudo-random can starve a low-priority arm). One REQUIRED bullet: use `biased;` for deterministic left-to-right arm priority.

- **§B13 (TOCTOU) — `Arc` count races, HashMap iter order.** New BANNED bullets: `if Arc::strong_count(&arc) == 1 { ... }` is a TOCTOU race — use `Arc::into_inner(arc)` (returns `Option<T>`) or `Arc::try_unwrap(arc)`. Restated that the same TOCTOU pattern via `HashMap::iter` + `HashMap::insert` is broken. New REQUIRED bullet: for ordered iteration, use `BTreeMap` or collect-then-sort — `HashMap::iter` order is randomized per-process and per-rehash, and tests that depend on it flake across machines.

### Changed (cross-links between overlapping categories)

- **§B17 ↔ §A2** — opening of §B17 now explicitly states it covers the single-threaded reentrant-borrow hazard, while §A2 covers the thread-safety dimension. Same `Rc<RefCell<T>>` symptom, different failure modes.
- **§B21 ↔ §B8** — opening of §B21 now distinguishes "future never polled" (§B8) from "work ran but you can't cancel/observe" (§B21).
- **§B22 ↔ §B4** — opening of §B22 now points to §B4 for sync RAII contracts and frames §B22 as "what is **not** possible with Drop in async".
- **§B23 ↔ §B3** — opening of §B23 now states explicitly that it is the `select!`-specific application of §B3's general cancel-safety rule.

### Changed (front-matter)

- **`description` extended with hazard-area triggers.** Added a closing sentence: "Covers async, unsafe, FFI, concurrency, crypto, supply-chain, and tests-that-pass-by-luck hazards." This improves Claude Code's skill matching on user queries that name the hazard area rather than the failure mode.

### Tooling and documentation

- **`README.md` Layout** — `.gitattributes` and `.gitignore` now appear in the repository diagram with one-line descriptions. Both are functionally significant (line-ending discipline, project-local install target ignored) and were previously invisible from the docs.
- **`docs/roadmap.md`** — Tier D (§D1, §D2) is now flagged `✅ shipped in v0.3.0`. The category-expansions section previously listed only `§B16`/`§B17`/`§C8`/`§C9` shipments and silently omitted the new tier.
- **`commands/rust-intel-cc/fix.md`** — routing table extended with 15 new rows mapping symptoms for §B16–§B25, §C8–§C11, §D1, §D2. The table is still declared "non-exhaustive", but the most common symptoms now route correctly.
- **`.gitattributes`** — deduplication pass. Removed seven explicit `text eol=lf` rules for `*.md`, `*.rs`, `*.toml`, `*.lock`, `*.json`, `*.yml`, `*.yaml` since they are already covered by `* text=auto eol=lf`. Kept the necessary overrides: `*.sh`/`*.bash` → LF; `*.ps1`/`*.bat`/`*.cmd` → CRLF. Binary-section comment block tightened.
- **`rust-intel.md`** — working-tree line endings renormalized to LF (the v0.3.0 commit landed with `i/lf w/crlf`, which would have re-triggered the CRLF warning on the next edit). Now `i/lf w/crlf attr/text=auto eol=lf` — git no longer warns because the canonical eol is explicit.

### Migration

Re-run the installer. The skill content changed (eight new BANNED bullets, several technical corrections, extended description); slash commands and install/uninstall behavior are unchanged.

If you have automation that hard-codes routing for `tokio::task::consume_budget`, `cargo expand --type-sizes`, or the v0.3.0 §B23 "send is cancel-safe" claim, update it: those are gone in v0.3.1.

## [0.3.0] — 2026-05-28

First content release since v0.1.x. The skill itself (`rust-intel.md`) is **substantively rewritten**: scope is explicitly reframed, eight accuracy bugs from the v0.2.x text are fixed, and the category count grows from 26 to **41**. Slash commands, install/uninstall scripts, and the layout are unchanged. Anyone who already has v0.2.x installed re-runs the installer; no other migration needed.

### Changed

- **Scope, stated up front.** The spec is now explicitly scoped to bugs in code that **already compiles and passes tests**. Compile-only failure modes (lifetime variance, trait bound mismatch, GAT lifetime bound errors, object-safety from generic methods, cyclic workspace deps, `?`-in-`main`, HRTB depth, recursive macro limits, `no_std` reflexive `std::*`, self-referential structs, `From`/`Into` cycles, MSRV mismatch) are *deliberately omitted* — the compiler is sufficient, the LLM cannot ship them. This spec covers what survives `rustc`, `clippy`, and `cargo test` and still breaks. The opening section, the front-matter `description`, and the README "What this is" / "Spec architecture" sections all reflect the new scope.

- **§B3 — `AsyncWriteExt::write_buf` cancel-safety corrected (technical error).** v0.2.x text listed `write_buf` as cancel-UNSAFE; per tokio's documented cancel-safety contract, `write_buf` is cancel-safe (single-shot). The actually-unsafe variant is `write_all_buf` (safe-with-caveat: the buffer may be partially advanced) and `write_all` (unsafe). Text now distinguishes all three.

- **§B8 — `tokio::spawn(async_fn())` "future-of-future" claim removed (technical error).** v0.2.x text asserted that `tokio::spawn(async_fn())` creates a future-of-future and spawns the outer wrapper, dropping the inner. That is wrong: an `async fn` returns `impl Future` directly, and `tokio::spawn` polls it. The bullet is gone; replaced with the actual forgotten-await failure modes (a future bound to a variable but never awaited; a future-returning call in a non-async function).

- **§B9 — `tokio::sync::Mutex` "detects deadlock under `tokio-console`" claim corrected (technical error).** `tokio-console` provides *visibility* (which task holds which lock, who is waiting), not detection. Deadlock detection is `parking_lot::deadlock::check_deadlock()` for sync sections or human review of documented lock-acquisition orders. Reworded accordingly.

- **§B5 — `#[repr(Rust)]` framing corrected (technical error).** v0.2.x described `#[repr(Rust)]` as "unstable". The attribute itself is stable (it is the default repr); what is unspecified is the *layout* the default implies. Reworded; expanded list of pinned reprs (`repr(C)`, `repr(transparent)`, `repr(uN)`).

- **§B5 — `slice::align_to` removed from "safe abstractions" list (technical error).** `<[T]>::align_to::<U>` is `unsafe fn`; v0.2.x had it in the safe-defaults list alongside `bytemuck::Pod` / `bytemuck::cast_slice`. Removed from the safe list and from the "use instead of raw pointer arithmetic" list; explicit note added that it requires the same `Pod`-style invariants as `transmute` and a `// SAFETY:` block.

- **§B7 — `Box::new_uninit_slice` nightly tag removed (stale).** Stabilized in Rust 1.82 (October 2024); spec already targets Rust 1.84+. The method is now listed as a stable alternative to `vec![0u8; N].into_boxed_slice()` for zero-init-wasted scenarios, with `assume_init` flagged as `unsafe`.

- **§B7 — stack-overflow threshold rationale clarified.** The v0.2.x `N * size_of::<T>() > 4096` line conflated page size with stack budget. Replaced with the real numbers — 8 MiB on Linux main thread, 2 MiB on `std::thread::spawn`, ~2 MiB on tokio tasks — and the ~64 KiB practical rule of thumb. The `Box::new([0u8; N])` placement trap (array built on stack *before* being moved to heap) is now called out explicitly.

- **§B5 — `Vec::into_raw_parts` pinned to Rust 1.93.** Verified via the stdlib docs: stable since 1.93.0. The spec's MSRV is 1.84, so the `ManuallyDrop<Vec<T>>` + manual `(ptr, len, cap)` decomposition (stable since 1.0) is the default; the `Vec::into_raw_parts` convenience is opt-in on a bumped MSRV. The version pins section reflects this.

- **§B5 — `mem::uninitialized` / `mem::zeroed` promoted to BANNED list.** Previously surfaced inside a REQUIRED bullet about `MaybeUninit` discipline; now each has its own BANNED line spelling out the UB conditions (`mem::uninitialized` deprecated since 1.39 and UB for any type with invariants; `mem::zeroed` UB for `bool`/`&T`/`Box<T>`/`NonZero*`/restricted-discriminant enums/`#[repr(transparent)]` wrappers over those). The compiler does not stop either call.

- **§A1 — repositioned as "stale APIs and slopsquatting" (scope reframe).** Pure `E0599` hallucinations no longer qualify (compiler catches them). The category now covers stale-but-still-valid APIs, `#[deprecated]`-not-removed APIs, wrong-version-of-crate semantics drift, and supply-chain slopsquatting — exactly the cases where the code compiles and runs but is wrong (or malicious).

- **§A3 — repositioned as "`pub` as a hammer for `E0603`" (scope reframe).** Now framed as "LLM reflexively makes things `pub` to silence E0603; code compiles and works; semver surface silently expanded" — a real silent residue, not generic visibility hygiene. (Section is at §A3 in the final v0.3.0 numbering; see "Removed" below for the gap-closing renumber.)

- **§A2, §B5, §B11, §B12, §B15, §C1 — depth expansions.** §A2 (Smart pointer misuse) gains `Cow`, `Arc::make_mut`, `Rc::get_mut`/`Arc::get_mut`, `ArcSwap`. §B5 gains `MaybeUninit` discipline, strict provenance API rules (Rust 2024+), `slice::from_raw_parts` invariant list. §B11 gains `tokio::task::consume_budget`. §B12 cross-links to the new §B24 for constant-time comparison. §B15 gains `Stream` vs `Iterator` failure modes. §C1 gains `#[repr(transparent)]` zero-cost newtype guidance.

- **Trigger table — extended and split.** Phrase-based triggers extended (singletons, retries, rate-limit, batching, secret comparison, JSON parsing, tracing instrumentation, graceful shutdown, workspace features, channels, shared mutable state, type wrappers, async cleanup). New code-pattern triggers section: `async fn` with `Mutex<...>`, `Rc<RefCell<>>`, `unsafe impl Send/Sync`, untracked `JoinHandle`, `impl Drop` with `.await`, `impl Deref` on non-pointer wrappers, `#[serde(untagged)]`, untagged TOCTOU patterns, raw-bytes comparisons in security contexts, `select!` with arm side effects, `tokio::spawn` under active spans, `mem::transmute`/`ptr::read`/`slice::from_raw_parts`, large stack arrays.

- **Post-flight checklist — extended.** New surface-able items: manual `Send`/`Sync` impl (§B18), `#[serde(untagged)]` enums and string-keyed JSON (§B20), untracked `JoinHandle`s (§B21), `impl Drop` with async-looking work (§B22), `==` on secrets (§B24), every `extern "C" fn` and `Box::into_raw`/`Box::from_raw`/`Vec::into_raw_parts`/`Vec::from_raw_parts` pair (§B25), unbounded channels by runtime (§C8), spawn without `.in_current_span()` under instrumented contexts (§C9), default features that pull heavy deps (§C10), `impl Deref` on non-pointer wrappers (§C11), `thread::sleep` in tests (§D1), `#[should_panic]` without `expected` (§D1).

- **Front-matter `description`.** Was: "Hard rules for writing Rust that LLMs systematically get wrong... Defends against the full known taxonomy of LLM failure modes in Rust as of 2026." Now: "Hard rules for writing Rust in code that already compiles and passes tests but is silently broken, slow, or semver-fragile. Load this BEFORE writing any Rust code. Targets bugs that survive rustc, clippy, and cargo test but fail in production or rot the codebase."

### Added

**Tier B — Silent correctness bugs.** Ten new categories.

- **§B16. Equality and hashing contracts.** Manual `PartialEq` without matching `Hash`, manual `PartialOrd` without total-order `Ord`, `f64`/`f32` keys without `OrderedFloat`/`NotNan`. Failure mode: `HashMap` silently loses keys, `BTreeMap` behaves nondeterministically. Compiles, often passes thin tests, corrupts data at contention.
- **§B17. `RefCell` / `Mutex` runtime borrow panics.** `Rc<RefCell<T>>` in callback/traversal chains, reentrant `borrow_mut()`, undocumented borrow-disjointness invariants. Compiles, tests pass at low concurrency, production panics. REQUIRED: `try_borrow_mut()` with `BorrowMutError` handling for tree traversals.
- **§B18. Manual `unsafe impl Send` / `unsafe impl Sync`.** Reflexive `unsafe impl Send` to silence `tokio::spawn` bound errors. Now requires explicit `// SAFETY:` citing the synchronization invariant; impls without one are BANNED.
- **§B19. Iterator invalidation through indirection.** Borrow checker catches `Vec` invalidation at compile time; it does *not* catch invalidation through `RefCell<Vec<T>>`, `unsafe`, or `for i in 0..vec.len()` loops that mutate `vec.len()` mid-loop. Now covered.
- **§B20. `serde` field-presence vs null vs default.** `Option<T>` with `#[serde(default)]` conflates absent with null. `#[serde(untagged)]` enums silently match wrong variants on overlapping shapes. `#[serde(rename = "...")]` without round-trip test. Compiles, deserializes, drift downstream.
- **§B21. `JoinHandle` semantics: drop ≠ abort.** Dropping a `tokio::task::JoinHandle` *detaches* the task; it does not abort it. Spawning fire-and-forget without explicit `// fire-and-forget: detached by design` annotation is now BANNED. `JoinSet` recommended for joinable fan-in.
- **§B22. `async Drop` is not real.** `impl Drop` calling `tokio::spawn`-ing an async cleanup is fire-and-forget and may not run before runtime shutdown; `block_on` inside `Drop` re-enters the runtime and deadlocks. Resources requiring async cleanup must expose an explicit `async fn close(self)`.
- **§B23. `select!` arm side effects under cancellation.** Side effects (DB writes, channel sends, file flushes) inside a `tokio::select!` arm may not be observed if another branch wins. Each arm must be cancel-safe or guarded; side effects belong after the `select!` returns on the winning branch.
- **§B24. Timing attacks via `==` on secrets.** `if token == expected { ... }` for any secret comparison (API tokens, password-after-hash, MAC tags, OTP codes) leaks timing information. REQUIRED: `subtle::ConstantTimeEq` or `constant_time_eq` crate. Cross-linked from §B12.
- **§B25. Panic and ownership across `extern "C"` ABI.** Panics escaping `extern "C"` boundaries (UB pre-1.81, process abort since), `Box`/`Vec`/`String`/`Rc`/`Arc` passed directly through FFI (no stable ABI), allocator-mismatched `Box::from_raw`, `cap`-mismatched `Vec::from_raw_parts`, missing paired free functions, gratuitous `#[no_mangle]`. REQUIRED: `catch_unwind` wrapping, paired `extern "C" fn rust_drop_T(p: *mut T)`, `ManuallyDrop<Vec<T>>` or `Vec::into_raw_parts` (≥ 1.93) with the full tuple documented, layout verification against C headers, miri in CI for every FFI file. Absorbs the previously-roadmapped §B17 (FFI Drop).

**Tier C — Architecture and ergonomics.** Four new categories.

- **§C8. Channel-and-runtime mismatch.** `std::sync::mpsc` in async (blocks executor), `tokio::sync::mpsc` for MPMC (only first receiver gets messages), `crossbeam::channel` in async (await around recv blocks the worker). Now mapped explicitly.
- **§C9. `tracing` span leakage across `tokio::spawn`.** Spawning without `.in_current_span()` (requires `tracing::Instrument` in scope) loses span context. `spawn_blocking` requires explicit `span.enter()` inside the closure.
- **§C10. Workspace feature unification surprises.** Default features pulling heavy deps for all workspace members, dev-dependency features leaking into release builds via cargo's feature unification. `cargo hack --feature-powerset --no-dev-deps` in CI now recommended.
- **§C11. `Deref` polymorphism antipattern.** `impl Deref<Target = Inner> for Wrapper` for inheritance-style composition. Rust API Guidelines C-DEREF rule cited; explicit-accessor pattern (`fn user(&self) -> &User`) given as the right shape.

**Tier D — Testing and CI gaps.** New tier. Two categories.

- **§D1. Tests that pass by luck.** `thread::sleep` waiting for async work (flaky), `#[should_panic]` without `expected = "..."` (any panic passes including in test setup), tests asserting absence of panic instead of postconditions. REQUIRED: `tokio::time::pause`/`advance`, explicit `Notify`/`oneshot` synchronization, `expected` substring pinning.
- **§D2. Integration vs unit test placement drift.** `#[cfg(test)] mod tests` referencing private items that are later split into siblings; integration tests in `tests/` depending on `pub(crate)`. Recommendation: unit tests for private items live next to the impl; integration tests use the public API only or a `#[cfg(feature = "test-support")]` gate.

**Version pins section.** New section at the end of the spec listing the stability cutoffs assumed throughout: `Box::new_uninit_slice` (1.82), `Vec::into_raw_parts` (1.93 — `ManuallyDrop<Vec<T>>` is the MSRV-safe fallback), strict-provenance API (1.84), tokio cancel-safety contracts (1.x stable), `rand` 0.8 → 0.9 `thread_rng()` → `rng()` rename, Rust 1.80+ `unexpected_cfgs` auto-lint, AFIT (1.75), `consume_budget` (tokio 1.x), panic across `extern "C"` ABI (UB → process abort at Rust 1.81; `extern "C-unwind"` available).

### Removed

- **An earlier draft's Tier A category for trait bounds and type mismatches (E0277 / E0308).** Compile-only failure mode; rustc catches every case and the LLM cannot ship a binary with it. Out of scope for v0.3.0. Tier A numbering was tightened by renumbering the surviving categories: the former §A3 (Smart pointer misuse) is now §A2, and the former §A4 (`pub` as a hammer for E0603) is now §A3. The Tier A intro carries a short note about the historical retirement so older references resolve to context.
- **Empty roadmap entries §B16 (serde), §B17 (FFI Drop), §C8 (workspace), §C9 (tracing).** All four graduated into the main spec (now §B20, §B25, §C10, §C9 respectively). §B18 (`no_std`) remains in roadmap as low-priority but is explicitly flagged as out-of-scope by the new framing.

### Tooling and documentation

- **`README.md` Status block, "What this is", install description, layout comment, and Spec architecture table** synced to v0.3.0. Tier D added to architecture table. The "26 categories" claim is removed in favor of "the categories from the spec" (count lives in the spec, not the README).
- **`docs/roadmap.md`** fully refreshed: all `/rust-{audit,fix,plan}` references corrected to `/rust-cc-*`, broken relative paths to `commands/rust-{audit,fix,plan}.md` corrected to `commands/rust-intel-cc/{audit,fix,plan}.md`. Categories that shipped into the spec marked `✅ shipped in v0.3.0`. Out-of-scope note added.
- **`docs/sources.md`** — the single `/rust-fix` reference corrected to `/rust-cc-fix`; SafeTrans and Rust-SWE-Bench entries updated to reflect the retirement of the historical §A2 category (the empirical figures are preserved as Tier A intro motivation) and the renumbering that followed.
- **`commands/rust-intel-cc/{audit,fix,plan}.md`** — references to "`rust-intel.md`" reworded to "the `rust-intel` skill" (decouples command files from the on-disk filename, which is `SKILL.md` after install). `audit.md` example header updated from `rust-audit report` to `rust-cc-audit report`. `26 categories` references removed. `fix.md` routing table E0277/E0308 row updated to point at `out-of-scope (compile-only)` with a check for §A2/§A3/§C5 residue from the reflexive fix.
- **`commands/README.md`** — "26 categories" wording dropped.
- **Line endings.** `.bat` and `.ps1` files were stored in the working tree as LF despite `.gitattributes` declaring `eol=crlf`. Working tree now matches the attribute. (Index was correct; only the working copy needed renormalization.)
- **Windows symlink note** added to README: `--symlink` is bash-only; PowerShell and cmd.exe installers always copy.

### Migration

Re-run the installer (`./rust-cc-install.sh`, `.\rust-cc-install.ps1`, or `rust-cc-install.bat` — add `--user` / `-User` if you previously installed user-global). The skill file is byte-different; the slash commands are not; no other migration is needed.

If you have automation that hard-codes the category count or references Tier A by old number, update it: the historical §A2 category is gone, the surviving categories were renumbered (§A3 → §A2, §A4 → §A3), the total is now 41, and references to compile-only failure modes should be rerouted (the routing table in `/rust-cc-fix` already does this — E0277/E0308 etc. → `out-of-scope (compile-only)` with a check for reflexive-fix residue against §A2/§A3/§C5).

## [0.2.2] — 2026-05-18

Same-day script renaming. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2, v0.2.0, and v0.2.1 — no rule changes, no new categories.

### Changed

- **Install and uninstall scripts gained the `rust-cc-` prefix.** Generic names like `install.bat` / `install.sh` are a footgun: if the repo lives on the user's `PATH`, or if multiple tooling repos share a common convention, an unprefixed `install` shadows other things in the system. Renamed all six scripts to be project-specific:
  - `install.sh`     → `rust-cc-install.sh`
  - `install.ps1`    → `rust-cc-install.ps1`
  - `install.bat`    → `rust-cc-install.bat`
  - `uninstall.sh`   → `rust-cc-uninstall.sh`
  - `uninstall.ps1`  → `rust-cc-uninstall.ps1`
  - `uninstall.bat`  → `rust-cc-uninstall.bat`
  Internal references (`.bat` → sibling `.ps1`, `--help` text) and external docs (README, `commands/README.md`) updated to match.

### Migration

If you previously cloned the repo and ran `./install.sh` / `.\install.ps1` / `install.bat`, the next pull will rename them. Update any automation, aliases, or notes accordingly. The script behaviour is unchanged.

## [0.2.1] — 2026-05-18

Same-day rectification of v0.2.0. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2 and v0.2.0 — no rule changes, no new categories.

### Changed

- **Slash commands flattened from `/rust-intel-cc:*` to `/rust-cc-*`.** v0.2.0 misread the original intent: the repo's nested `commands/rust-intel-cc/` directory was meant for *file organization only*, with the installer flattening to a simple-prefixed slash surface. v0.2.1 honors that split:
  - **Repo source** (unchanged from v0.2.0): `commands/rust-intel-cc/{audit,fix,plan}.md`.
  - **Installed target** (new): `<claude>/commands/rust-cc-{audit,fix,plan}.md` — flat, with a `rust-cc-` prefix, no subdirectory.
  - **Slash commands** (new):
    - `/rust-intel-cc:audit` → `/rust-cc-audit`
    - `/rust-intel-cc:fix`   → `/rust-cc-fix`
    - `/rust-intel-cc:plan`  → `/rust-cc-plan`
  The installer does the rename during copy. Repo stays tidy (one umbrella directory for three related commands); slash surface stays short (no namespace prefix in the prompt).
- **Installers and uninstallers sweep every prior layout** before copying:
  - v0.2.1+ flat-with-prefix (`rust-cc-{audit,fix,plan}.md`)
  - v0.2.0 namespace dir (`rust-intel-cc/`)
  - v0.1.x legacy flat-no-prefix (`{rust-audit,rust-fix,rust-plan,rust-intel}.md`)

### Migration from v0.2.0

Re-run the installer (`./install.sh`, `.\install.ps1`, or `install.bat` — add `--user` / `-User` if you previously installed user-global). It will remove the v0.2.0 `commands/rust-intel-cc/` directory and install the v0.2.1 flat files. Update any references to the old `/rust-intel-cc:*` slash commands to the new `/rust-cc-*` form.

### Migration from v0.1.x

Same as v0.2.0's migration — re-running the installer sweeps the old `/rust-audit`, `/rust-fix`, `/rust-plan` automatically.

## [0.2.0] — 2026-05-18

Tooling restructure. The skill itself (`rust-intel.md`) is byte-identical to v0.1.2 — no rule changes, no new categories. What changed is how the slash commands are organised and how the installers behave by default.

### Changed

- **Slash commands moved into the `rust-intel-cc` namespace.** The three top-level commands are gone; they now live under `commands/rust-intel-cc/` and are invoked with the colon-namespace syntax Claude Code uses for nested commands:
  - `/rust-audit` → `/rust-intel-cc:audit`
  - `/rust-fix`   → `/rust-intel-cc:fix`
  - `/rust-plan`  → `/rust-intel-cc:plan`
  Rationale: a single `rust-intel-cc` umbrella is easier to remember, easier to grep, and isolates the three sub-commands into one Claude Code namespace instead of three top-level slots.
- **Installers default to project-local `./.claude/`** instead of user-global `~/.claude/`. Pass `--user` (bash) or `-User` (PowerShell) to get the v0.1.x global-install behaviour. `CLAUDE_CONFIG_DIR` env var still overrides everything. Rationale: a Rust skill is most useful scoped to the project being worked on; the global install is the rarer case and is now an explicit opt-in.
- **Installers and uninstallers now sweep the legacy v0.1.x flat layout** (`commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, plus the very early `commands/rust-intel.md`) and the entire `commands/rust-intel-cc/` directory before copying. Re-running the installer cleanly migrates from any previous version.

### Added

- **`install.bat` / `uninstall.bat`** — thin wrappers around the corresponding `.ps1` scripts for users in `cmd.exe`. Pass-through arguments work as expected (`install.bat -User`, etc.).
- `.gitattributes` now pins `*.bat` to CRLF (cmd.exe will not parse LF-terminated batch files reliably).
- `/.claude/` added to `.gitignore` so running the installer from the repo root does not pollute the working tree.

### Migration

For anyone upgrading from v0.1.x:

1. Pull the new repo state.
2. Re-run the installer (`./install.sh`, `.\install.ps1`, or `install.bat`). It will sweep the old flat layout — `/rust-audit`, `/rust-fix`, `/rust-plan` — from whatever target it was previously installed to, and put the new namespaced layout in its place.
3. If you previously installed to `~/.claude/` (the v0.1.x default), pass `--user` / `-User` on the new install — otherwise the installer will treat your current directory as the install target.
4. Update any tooling or notes that invoked the old slash commands to use the new namespaced names.

The skill itself activates the same way as before. Only the slash-command names changed.

## [0.1.2] — 2026-05-17

Tooling-only patch. No changes to `rust-intel.md` (the skill itself); no new categories.

### Added

- **`uninstall.sh` / `uninstall.ps1`.** Inverse of the installers — removes the rust-intel skill directory and the named command files (`rust-audit.md`, `rust-fix.md`, `rust-plan.md`, and the legacy `rust-intel.md`) from `$CLAUDE_CONFIG_DIR`. Idempotent (safe to run when nothing is installed). Narrow by design: only touches paths the installers create, so other skills and commands under `~/.claude/` are left alone.
- README "Uninstall" section documenting both scripts.

### Changed

- **`install.sh` / `install.ps1` also remove the legacy `commands/rust-intel.md`** before installing. Earliest iterations of the project shipped rust-intel as a single command file rather than a skill; that layout is no longer used, but a stale `commands/rust-intel.md` left over from such an install would shadow the proper skill in Claude Code's listing (appearing as a duplicate "rust-intel" entry). Both installers and both uninstallers now sweep this path explicitly.

## [0.1.1] — 2026-05-17

Third- and fourth-round reviews surfaced eleven issues worth a same-day patch. Two are technical errors carried over from 0.1.0 (§B15 AFIT/RPITIT conflation, §B11 `yield_now` mis-substitution) that would propagate into reader code. Three are scope or statistical overreaches (§C2 anyhow, §B5 N=40, §B14 magic numbers). One is a structural split (§B1 → §B1a + §B1b). The fourth-round review caught five further refinements introduced by the third-round patches themselves: an over-categorical RPITIT claim, a temporally-fragile `dyn`-compatibility statement, a `Vec::push` formulation that read as if `push` itself was the failure, a `rand` 0.8→0.9 API gap, and a reframing of the §B15 Pin paragraph away from a strawman toward the actual LLM failure modes (`Pin<&mut>` vs `Pin<Box>`, `Unpin` as auto-trait). Install scripts now clean-replace any prior version. No new categories; no breaking changes to BANNED/REQUIRED wording.

### Changed

- **§B15 AFIT vs RPITIT — terminology rewrite (technical correction).** The previous text described `fn bar(&self) -> impl Future + Send` as "native AFIT with a Send bound via RPITIT". This conflates two distinct syntactic forms: AFIT is `async fn bar(&self) -> T`, RPITIT is `fn bar(&self) -> impl Future + Send`. Section now leads with the AFIT/RPITIT distinction and a 4-row decision table mapping use case → construct (plain AFIT / RPITIT / `trait-variant` / `async-trait`).
- **§B11 — `yield_now` no longer presented as alternative to `spawn_blocking` for CPU-bound work (technical correction).** `yield_now` only schedules other tasks already on the same worker thread; the worker itself remains occupied. `spawn_blocking` uses a *separate* blocking-task thread pool and is the only correct answer for CPU-bound work. Text now explicitly disallows the substitution and explains the executor-starvation mechanism.
- **§C2 — anyhow rule narrowed.** "Never `anyhow::Error` in `lib.rs` public APIs" was too broad — it banned a legitimate choice in internal/workspace libraries. The rule now applies specifically to **published library crates** (anything shipped to crates.io with a `pub` API other authors consume). Internal/workspace libraries may use `anyhow` as a deliberate trade-off.
- **§B5 — `~55% UB rate` headline now discloses sample size.** Heading changed to "high UB rate in small-N studies"; body labels the 22/40 figure as directional rather than definitive, while preserving the structural claim that LLM-generated `unsafe` is significantly more dangerous than LLM-generated safe code.
- **§B14 — folk numbers "typically 100–10000" replaced with a sizing formula.** Size `N` from expected producer burst over one consumer cycle, capped by memory budget per pending message. If the right `N` cannot be reasoned about, that is itself a signal to design the backpressure policy before writing the channel.
- **§B15 — RPITIT vs AFIT softened from "different" to "share a desugar lineage, materially different at the source-code level".** AFIT desugars into RPITIT internally, so calling them "different" is technically too strong even though the *written* syntactic forms have different bound-expressing capabilities. Reworded to make the distinction precise without overclaiming.
- **§B15 — decision table `dyn`-compatibility row hedged temporally.** `dyn`-compatible RPITIT stabilization is in flight; row now says "as of stable Rust through mid-2026, verify against your `rustc --version`" rather than asserting it as a fixed property.
- **§B14 `Vec::push` example clarified.** Previous wording read as if `Vec::push` itself was the failure. Reworded to "a `Vec` that is `push`-ed in a hot loop with no consumer or cap" — the failure is the missing drain or bound, not the call.
- **§B12 — rand 0.8 / 0.9 API gap noted.** `thread_rng()` was renamed to `rng()` in `rand` 0.9. The rule (OS-backed entropy for keys/nonces/salts) is unchanged; the BANNED entry now states this explicitly and asks the user to pin the `rand` version assumed.
- **§B15 Pin reorientation.** The "you cannot hold a reference through `.await` and expect Pin to fix it" bullet was a strawman — that confusion is rare in practice. Replaced with the actual LLM-typical confusions: mixing up `Pin<&mut T>` (borrowing, stack) with `Pin<Box<T>>` (owning, heap), and the fact that `Unpin` is an auto-trait so most uses of `Pin` are incidental and add no real constraint.
- **Principle section — self-referential meta-acknowledgment.** Closes the third-round structural concern that the document's own empirics (percentages, rates, sample sizes) were stated without inline source-anchors. The Principle section now ends with a paragraph stating that every empirical figure maps to a sourced entry in `docs/sources.md`, with a recommendation to load that file alongside the skill when statistical precision matters. This makes the "prove, don't guess" principle apply to the document itself, not only the Rust it asks the reader to write.

### Added

- **§B1b — Lifetime leaking through public APIs promoted to peer subsection.** The "Related anti-pattern" tail at the end of §B1 was conceptually a separate failure mode (exposing `'a` in `pub fn` signatures is not the same as binding too many things to one `'a` *inside* a function). It now has its own BANNED/REQUIRED block, parallel in structure to §B1a (laundering). Section header renamed to "Lifetime laundering and lifetime leaking".
- **`install.sh` / `install.ps1` clean-replace step.** Both installers now remove the target skill directory contents and the three named command files before copying, so stale files from a previous version cannot linger.

## [0.1.0] — 2026-05-17

Initial release. 26 categories plus a meta-layer.

### Added

**Meta-layer:**
- "Prove, don't guess" principle.
- Blocking protocol — explicit refusal format when context is insufficient.
- Operating mode — 7 mandatory steps before generating any Rust.
- Self-monitoring — "user-phrase → activated category" trigger table.
- Pre-flight checklist (7 questions) and Post-flight checklist (what to surface in the summary).

**Tier A — Mass compilation failures:**
- §A1. API hallucinations and stale APIs (+ slopsquatting with documented attacks: CrateDepression 2022, `faster_log`/`async_println` 2025).
- §A2. Trait bounds and type mismatches (E0277 / E0308).
- §A3. Smart pointer misuse.
- §A4. Module visibility and pub leaks.

**Tier B — Silent correctness bugs:**
- §B1. Lifetime laundering (+ lifetime leaking through public APIs).
- §B2. `std::sync::Mutex` across `.await` (+ Mutex poisoning cascade, oversized critical section).
- §B3. Async cancellation.
- §B4. Drop order and RAII contracts.
- §B5. Unsafe that looks safe.
- §B6. Pattern matching exhaustiveness drift.
- §B7. Large stack allocations and arena pitfalls.
- §B8. Silent task dropping (forgotten `.await`).
- §B9. Lock ordering and ABBA deadlock.
- §B10. Reference cycles in `Rc`/`Arc` graphs.
- §B11. Blocking the async executor.
- §B12. Cryptographic code (silent insecurity).
- §B13. Check-then-act races in concurrent collections (TOCTOU).
- §B14. Unbounded channels and backpressure neglect.
- §B15. Advanced async pitfalls (AFIT, Pin, Waker, block_on).

**Tier C — Architecture and ergonomics:**
- §C1. Blanket impls in public APIs (semver hazard).
- §C2. Error handling discipline.
- §C3. Async runtime and ecosystem coherence.
- §C4. Iterator and allocation discipline.
- §C5. Reflexive `.clone()` as a borrow-checker silencer.
- §C6. Procedural macro hygiene.
- §C7. Cargo feature flag hygiene.

**Tooling:**
- `commands/rust-audit.md` — scan existing Rust against all 26 categories.
- `commands/rust-fix.md` — map an error symptom to a category and propose a root-cause fix.
- `commands/rust-plan.md` — pre-flight a new task through the trigger table and 7-question checklist.

**Repository scaffolding:**
- `LICENSE` (MIT) at repo root.
- `install.sh` / `install.ps1` for `~/.claude/` installation.
- `.gitattributes` pinning LF on `.sh`/`.md` and CRLF on `.ps1`.
- `docs/sources.md` with verified URLs for every empirical claim, including the published 2026-05-16 uproger.com field report.
- `docs/roadmap.md` listing planned categories and tooling.

### Refinements during the pre-tag polish round

- "6-month production study" relabeled to "published field report" throughout `rust-intel.md` and `docs/sources.md` — the source is a public article, not unattributed internal observation.
- README's "compiler catches ~76%" claim corrected: the 76.3% figure is the share of *compilation failures* concentrated in two categories per Rust-SWE-Bench, not a share of "typical mistakes caught."
- AFIT recommendation in §B15 reordered to lead with native AFIT + RPITIT + `+ Send`; `trait-variant` second; `async-trait` only for `dyn Trait`. (Terminology further corrected in 0.1.1.)
- `cargo check --check-cfg` instruction replaced with the actual Rust 1.80+ behavior (automatic `unexpected_cfgs` lint from `Cargo.toml` declarations).
- `bytes::Bytes` removed from the §B5 "safe abstractions" list; replaced with `bytemuck::Pod` / `bytemuck::cast_slice`, with a note that `Bytes` is a buffer container, not a safe-transmute abstraction.
- `rand::random()` "not cryptographically secure" claim corrected: `ThreadRng` is a CSPRNG; the actual ban targets `SmallRng` / `StdRng` for security work and recommends `OsRng` as the default for keys and nonces.
- Slopsquatting "~45%" figure in §A1 hedged to match the verification status in `docs/sources.md`.
- Tier B intro rewritten to motivate via §B2 (46%→19%) and SafeGenBench (~57%) instead of the unverifiable RustPrint citation.
- "The eleven categories below" in Tier B intro → "fifteen" (matches §B1–§B15).
- README slash-command misnaming: skills aren't invoked with `/`; clarified that the skill activates automatically.
- `commands/rust-audit.md` and `commands/rust-plan.md`: removed inline duplications of category-level rules and the Pre-flight checklist questions. Both now reference the skill as the source of truth.
- `commands/rust-fix.md`: clarified the symptom→category table is a routing layer, not duplicated rule knowledge.
- `RustPrint` benchmark entry removed from `docs/sources.md` and its citation in `rust-intel.md` (no verifiable source under that name).
- `LICENSE-APACHE` dropped (dual-licensing not needed for a prose-first repo; MIT alone is sufficient).

### Source basis

Built on: a published 6-month field report (~80k LOC, tokio + sqlx + unsafe), benchmarks RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust, industry reports from Faros AI and Lightrun (2026), and documented crates.io supply-chain incidents. Full list — [`docs/sources.md`](docs/sources.md).
