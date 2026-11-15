# Spec review — 2026-11-15

Full read of the shipped specification after the split into sphere files: `skill/SKILL.md` and all 22 sphere files, against six lenses — correctness, currency, completeness, conciseness, consistency, convenience. Reviewed tree: `d5935da` plus the uncommitted documentation and held-text changes of the same day.

## Method and limits

- One reviewer read every file in full, in one context. That is the mode `SKILL.md` itself advises against for a full pass ("one agent per sphere file"); it finds cross-file problems well and is weaker on depth per sphere. `dev/review-modules.workflow.js` (one agent per sphere) is the deeper second pass.
- `skill/references/sources.md` (173 KB) was **not** reviewed. Rule text that quotes it was read; the ledger entries themselves were not checked.
- Checked against primary sources during this review: stabilization versions in `rust-lang/rust` (`library/core/src/num/int_macros.rs`, `library/core/src/macros/mod.rs`), tokio source (`task/join_set.rs`, `io/util/async_write_ext.rs`, `io/util/copy.rs`), docs.rs for `tokio-stream`, and the crates.io API for 21 crates the spec pins.
- Not re-checked: the 2026 advisories and CVE narratives, the Rust 1.98–1.100 behavior notes, and the incident write-ups. They read as internally consistent; this review does not vouch for them.
- Nothing in `skill/` was changed.

## Verdict

The rule text is technically careful: of the claims checked against sources, one was wrong and one names a path that does not exist. The weak sides are elsewhere — the always-loaded core is 160 KB, a handful of single-line bullets carry 11% of the sphere text, the same material is stated up to five times, two rules contradict each other, and the severity tiers leave injection-class defects below XSS and timing.

| Lens | Major | Minor | Nit |
|---|---|---|---|
| Correctness | 0 | 6 | 4 |
| Consistency | 3 | 9 | 0 |
| Currency | 1 | 4 | 1 |
| Completeness (candidates) | — | 8 | — |
| Conciseness | 2 | 4 | 0 |
| Convenience and calibration | 1 | 5 | 0 |

Confirmed correct where a mistake looked likely: `assert_matches!` stable in 1.96.0; `strict_add` 1.91.0; `checked_shl` 1.7.0; `JoinSet` implements both `FromIterator` and `Extend`; `write`/`write_buf` are documented cancel safe and `write_all` is not; `tokio::io::copy` carries no cancel-safety note; the resolved versions of `tokio` (1.54.1), `cap-std` (4.0.3), `rand` (0.10.3), `reqwest` (0.13.5), `sqlx` (0.9.0), `tar` (0.4.46), `zip` (9.6.0), `password-hash` (0.6.1) and `quick-xml` (0.42.0) agree with the pins.

## Correctness

| ID | Sev | Location | Problem | Fix |
|---|---|---|---|---|
| C1 | Minor | `SKILL.md:544` | "`wrapping_div` since 1.38" is wrong. `wrapping_div` is stable since **1.2.0** (`num_wrapping`); 1.38.0 is `wrapping_div_euclid`. | Replace the example with `wrapping_div_euclid` since 1.38, or give 1.2 for `wrapping_div`. |
| C2 | Minor | `async-machinery.md:82` | `tokio::sync::mpsc::ReceiverStream` does not exist; the type is `tokio_stream::wrappers::ReceiverStream` (likewise `BroadcastStream`). `SKILL.md:67` and `deps-supply-chain.md:15` use the right path. | Correct the path. |
| C3 | Minor | `async-machinery.md:17` | "`tokio::spawn(x.bar())` fails" is stated without a condition. With a concrete type the future's `Send`-ness leaks through and the call compiles; it fails in generic code (`T: Foo`) and behind `dyn`. A literal reader concludes AFIT futures are never `Send`. | Say "in generic code over the trait". Add rustc's warn-by-default `async_fn_in_trait` as the backstop for public traits. |
| C4 | Minor | `async-tasks-blocking.md:28`, `SKILL.md:585` | "Enable `#[warn(unused_must_use)]` at crate level" and `-W unused_must_use` change nothing: the lint is warn-by-default, and a crate-level attribute is `#![…]`. | Require `#![deny(unused_must_use)]` (or `-D unused_must_use` in CI) if the rule is meant to bite. |
| C5 | Minor | `async-tasks-blocking.md:47` | "the ~100µs figure is a rough floor" refers to a figure the file never states. | State it ("more than roughly 10–100µs between `.await` points") or drop the reference. |
| C6 | Minor | `unsafe-ffi-abi.md:4` | Header lists "§B25a 🔴", but the file holds only §B25; §B25a is in `unsafe-sync-memory.md`. | Remove §B25a from the header. |
| C7 | Nit | `deps-supply-chain.md:41` | "The git/`[patch]` BANNED bullet below" — the bullet is above (line 33). | "above". |
| C8 | Nit | `concurrency-locks-state.md:25` | "`OnceLock` / `LazyLock` (stable ≥ 1.80)" — `OnceLock` is 1.70; `SKILL.md:545` has it right. | Split the two versions. |
| C9 | Nit | `semantics-and-conformance.md:34` | The endianness example also contains an unremarked `payload.len() as u16` truncation (§B26). An example should carry only the defect it illustrates. | `u16::try_from(payload.len())?`, or a comment. |
| C10 | Nit | `async-machinery.md:70` | "`#[tokio::main(flavor = "current_thread")]` and `#[tokio::test]` both default to current-thread" — only `#[tokio::test]` defaults; the first is explicit. | Reword. |

## Consistency

| ID | Sev | Location | Problem | Fix |
|---|---|---|---|---|
| K1 | Major | `security-boundary.md:23` vs `async-locks-cancel.md:34`, `:47` | §C2 bans `.unwrap()` on `Mutex::lock()` in production code. §B2 names `.lock().unwrap()` as the default way to propagate poison and calls it "the most common mutex idiom", not to be flagged per call. The spec's own REQUIRED snippets use it (`async-locks-cancel.md:25`, `concurrency-locks-state.md:49`). Two sphere agents will give opposite verdicts on the same line. | Delete the §C2 bullet and point to the poison policy. |
| K2 | Major | `SKILL.md:97-114`, `security-boundary.md:4`, `async-tasks-blocking.md:48`, `security-crypto.md:71` | The 🔴 list has hand-rolled HTML escaping (XSS) and `==` on a secret, but SQL injection, shell and CRLF injection, SSRF, path traversal and zip-slip are 🟡, as are attacker-sized allocation and decompression bombs (§B7). Separately, bodies declare escalations the "canonical" list does not carry: §B11 "🔴 when the work's duration is attacker-influenced", and the network condition on §B24's decrypt oracle. | Add conditional-🔴 entries for §C2 (injection, SSRF, traversal with untrusted input) and §B7 (attacker-controlled size), in the form §B14 already uses; add the §B11 and §B24 conditions; update the file headers. |
| K3 | Major | `deps-supply-chain.md:52` vs `:22` | Line 22 says the "commit for binaries, not libraries" convention is retired and a library's committed `Cargo.lock` binds nobody downstream. Line 52 cites the retired FAQ anchor and tells a library not to "force … a committed lockfile of one resolved graph onto every downstream consumer" — which line 22 says cannot happen. | Rewrite the library half of line 52 to match line 22. |
| K4 | Minor | `SKILL.md:8` vs `async-machinery.md:118`, `:75`, `async-locks-cancel.md:16`, `lifetimes-and-api.md:55` | The scope statement omits compile-only failures and names "`no_std` reflexive `std::*` imports" among them; §C3 requires exactly that. `for x in stream` and `Rc` across threads are compile errors too. §B1a sits in Tier B ("fail in production") while its own text says the failure is a borrow-checker rejection at a later call site. | Drop the compile-only bullets, or mark each as "compile error — listed for the fix, not as a finding". Describe §B1a as a delayed API constraint. |
| K5 | Minor | `security-boundary.md:32`, `:33`, `:36`, `:38`; `async-tasks-blocking.md:80`; `async-locks-cancel.md:46`; `async-tasks-blocking.md:77` | Remedies sit under the **BANNED** heading in §C2; a banned shape sits under **REQUIRED** in §B21. Two files grade findings as **P1/P2**, a scale defined nowhere in the skill or the commands. The audit header tells agents to report "a BANNED pattern present". | Move the remedies under REQUIRED; express severity in the 🔴/🟡 vocabulary. |
| K6 | Minor | `async-locks-cancel.md:32-47`, `concurrency-locks-state.md:90` | The mutex-poisoning policy is stated in full twice. The two agree, but with K1 the topic has three homes. | Keep one (§B17) and reference it. |
| K7 | Minor | `security-boundary.md:30` | The same bullet gives "`zip` ≥ 2.3.0" and "patched 9.0.5". | One floor: ≥ 9.0.5, noting it covers RUSTSEC-2025-0168. |
| K8 | Minor | `security-boundary.md:19` | Calls "Operating mode item 7" the canonical inline-flag policy; the canonical definition is the 🟡 paragraph of Enforcement tiers (`SKILL.md:122`). | Fix the pointer. |
| K9 | Minor | `SKILL.md:10`, `:50`, `:75`, `:617`; headers of three files; headings | "theme modules" (twice) beside "sphere files"; "this command" for a skill; `drop-and-raii.md`, `lifetimes-and-api.md` and `semantics-and-conformance.md` keep the older "Module of…" header; lettered sub-categories use `###` for §B1a/b, §B4a, §B15a–e and `##` for §B3a, §B18a, §B25a, §C1a, §C12a, §D1a. | One term, one header shape, one heading level. |
| K10 | Minor | `SKILL.md:97` | "for crypto and unsafe-with-unstated-invariants, block" names two of the three hard-block cases; the unverified dependency is the third (`SKILL.md:63`, `:621`). | Name all three. |
| K11 | Minor | `SKILL.md:275` | The phrase row still presents the `cap-std` advisory as repository-only; rows `:415`, `:543`, `:607` were updated to RUSTSEC-2026-0482. | Align the row. |
| K12 | Minor | `lifetimes-and-api.md:99`, `SKILL.md:328` | The body sends the reader to a trigger row for the full definition of "uncovered". The definition's home is inverted: a trigger row should point to the body. | Move the definition into §C1. |

## Currency

Live crates.io data, 2026-11-15.

| ID | Sev | Location | Problem | Fix |
|---|---|---|---|---|
| U1 | Major | `security-crypto.md:42-44`, `SKILL.md:340` | `jsonwebtoken` **12.0.0** was published 2026-11-13. The JWT rules are stated as verified against 9.3.1 and 11.0.0 (`Validation` defaults, `aud`/`iss` behavior, the removed and replacement no-validation APIs). | Re-verify against 12.0.0 and update the version qualifiers. |
| U2 | Minor | `deps-ergonomics.md:92`, `concurrency-channels.md:26`, `SKILL.md:399` | `lru` **0.19.0** (2026-10-18). The text says "newer 0.18.x releases are fine … current release was 0.18.4". The ≥ 0.18.2 floor still holds; a pre-1.0 minor is a breaking release by §A1's own rule. | Refresh the note. |
| U3 | Minor | `deps-ergonomics.md:89` | `ammonia` **4.2.5** was published 2026-11-13. The row pins ≥ 4.1.4 and counts "three XSS bypasses in ten months". | Check RustSec for a new advisory and the floor. |
| U4 | Minor | `async-machinery.md:27`; `unsafe-sync-memory.md:26`; `deps-cargo-macros.md:52`; `security-crypto.md:29`; `deps-ergonomics.md:70`; `drop-and-raii.md:51`, `:28` | Dated status claims the 1.100 pass did not refresh: `dyn`-compatibility "through mid-2026"; `Read::read_buf` "nightly-only as of Rust 1.98"; rustls 0.24 "pre-release at the 2026-09-08 round-52 review" with latest stable 0.23.44 (now 0.23.46; 0.24 is still `-dev.3`); `pqc_kyber` "no patched release at the 2026-09-29 review" (still 0.7.1 from 2023); `backon` "actively maintained — last publish Oct 2025" (unchanged for 13 months); a lint false negative probed "on 1.97.0 only"; a lint with "milestone 1.101". | Re-verify each against 1.100 and current releases. Remove process words such as "round-52 review" from rule text. |
| U5 | Minor | `deps-ergonomics.md:66-92` | 32 crates.io download counts are quoted to three digits. They only age. | Keep the order of magnitude, or drop them and keep the ledger entry. |
| U6 | Nit | `SKILL.md:532`, `async-locks-cancel.md:30` | The clippy 1.45 / 1.50–1.60 group history of `await_holding_lock` cannot matter under an MSRV floor of 1.85. | Cut to "warn-by-default (`suspicious`)". |

## Completeness — candidates

None of these is in the spec (checked by search). Each fits the acceptance test — compiles, passes its tests, the cheapest fix is the wrong one — but each needs a grounding source before it lands (principle 1).

| ID | Topic | Home |
|---|---|---|
| P1 | Graceful shutdown that waits only for `tokio::signal::ctrl_c()`: a container stop sends SIGTERM, so no cleanup path ever runs in production. | §B21 / §B4 |
| P2 | Outbound HTTP with no timeout: `reqwest`'s total and connect timeouts are off by default, so a stalled upstream holds the task. §F3 covers only the inbound peer. | §F3 / §C2 |
| P3 | CORS "fixed" with `CorsLayer::permissive()` / `very_permissive()` or `allow_origin(Any)` next to credentials. | §C2 |
| P4 | A 413 "fixed" by removing the request-body limit, or a framework path that has none. | §B7 |
| P5 | Tests that never run: `cargo nextest` does not run doctests, and `--all-targets` does not select them. Same shape as the workspace-root hole in §D4. | §D4 |
| P6 | §B12 asks for a nonce budget but never names the usual answers — XChaCha20-Poly1305 for random nonces at volume, AES-GCM-SIV for misuse resistance — and has no rule on associated data. | §B12 |
| P7 | Small backstops: `clippy::wildcard_enum_match_arm` for §B6; `tokio::sync::watch` in §C8's selection list; `PhantomData<Cell<T>>` also makes the type `!Sync` (`unsafe-sync-memory.md:59`); `clippy::let_underscore_lock` covers `parking_lot` guards (`drop-and-raii.md:28`); libtest's own "has been running for over 60 seconds" line beside nextest's `SLOW` (`testing-harness.md:48`); the path `serde_with::rust::double_option` (`data-contracts.md:63` gives a bare `double_option`). | as listed |
| P8 | Execution policy. Post-flight tells the agent to run build, test and Miri. There is no clause for a host or project that forbids the agent to run them (CI-only projects). | `SKILL.md:569` — "if running is not permitted, list the commands as not run and say so" |

## Conciseness

Byte counts are UTF-8 bytes per line.

| ID | Sev | Finding |
|---|---|---|
| L1 | Major | `SKILL.md` is 160.6 KB and loads on every activation. The two trigger tables are 103.9 KB of it: 142 phrase rows (46.7 KB, median 316 B) and 149 code rows (57.2 KB, median 248 B). Nine rows over 1 KB hold 22.0 KB; row `:439` alone is 8.0 KB and repeats `semantics-and-conformance.md:21`. A trigger row needs a pattern, a category and one line of risk. |
| L2 | Major | Fifteen single-line bullets over 3 KB hold 68.8 KB — 11% of all sphere text. The largest: `semantics-and-conformance.md:21` (10.7 KB), `security-boundary.md:29` (8.6 KB), `unsafe-ffi-abi.md:29` (5.4 KB), `security-crypto.md:46` (5.0 KB), `concurrency-channels.md:22` (4.2 KB), `async-locks-cancel.md:17` (4.1 KB), `concurrency-races.md:38` (4.0 KB), `unsafe-ffi-abi.md:30` (4.0 KB). One line is one diff hunk and one blame entry, so the per-file history the split was made for stops at "this 10 KB line changed". |
| L3 | Minor | The same material in several places: the DashMap/scc guard-type list (`SKILL.md:211`, `:325`, `async-locks-cancel.md:17`); the `JoinSet` cap (`SKILL.md:397`, `concurrency-channels.md:22`); the `password-hash` feature matrix (`SKILL.md:206`, `security-crypto.md:46`); HTML/Markdown XSS (`SKILL.md:296`, `:401`, `deps-ergonomics.md:76`, `:89`, `:90`); the `cap-std` advisory-lag story five times (`SKILL.md:275`, `:415`, `:543`, `:607`, `security-boundary.md:29`); the `assert_matches!` fallback (`SKILL.md:521`, `testing-oracles.md:31`); §C4 against §E2/§E3 against the Substitution catalog. Every copy is a place to forget on the next edit — K11 is one already. |
| L4 | Minor | Evidence inside the rules: 79 RUSTSEC ids, 27 CVE ids and 14 "observed on rustc/clippy x.y" probe logs in rule text, with sample sizes and quotations (`security-crypto.md:11` is the fullest case). `SKILL.md:10` says citations and figures live in `references/sources.md`. One grounding clause per rule is enough. |
| L5 | Minor | The three header lines of each sphere file total 20.5 KB and carry history ("until v0.8.0 the group was one module…", "preserved verbatim") that no agent needs. |
| L6 | Minor | Digressions longer than their rule: three ways to reject a zero cap (`concurrency-channels.md:22`); fixed versus username-derived salt, argued three times (`security-crypto.md:46`); distributed exactly-once delivery inside a category about map check-then-act (`concurrency-races.md:38`); clippy release notes for lints the spec does not use (`SKILL.md:518`). |

## Convenience and calibration

| ID | Sev | Finding |
|---|---|---|
| N1 | Major | Category titles no longer describe their content. §C2 "Error handling discipline" holds path traversal, archives, command, CRLF and SQL injection, SSRF, DNS rebinding, cookies, permissions, `chroot` and broken pipes. §B7 "Large stack allocations and arena pitfalls" has nothing on arenas and is mostly allocation DoS, decompression bombs and archive quotas. §B16 "Equality and hashing contracts" holds ReDoS and sort stability. §C9 "`tracing` span leakage across `tokio::spawn`" holds PII logging, log injection and `thread_local!` context. §C4 "Iterator and allocation discipline" holds partial read/write and `BufWriter` flushing. §B13 holds SQL lost updates, atomic orderings and `HashMap` iteration order. §B26 holds `debug_assert!` side effects. The cause is structural: a new numbered category is a MINOR release and the count is pinned, so new rules are filed into existing categories. Retitling needs no renumbering: the core validator counts categories by the `## §X.` prefix, not by the title (whether a fixture control pins a title was not checked). |
| N2 | Minor | Trigger rows are in the order they were added. §C2 rows sit in nine separate runs of the two tables, §B12 rows in four. Sorting by category costs nothing at run time — the audit workflow slices rows by category id — and makes the table checkable by eye. |
| N3 | Minor | §B7 (safe-code resource exhaustion) lives in `unsafe-sync-memory.md`. Nobody auditing a parser for DoS opens the "unsafe" group. `data-contracts.md` or a boundary sphere fits better. |
| N4 | Minor | Post-flight enables the whole `clippy::pedantic` group and `clippy::arithmetic_side_effects` (`SKILL.md:577-585`). Only `unwrap_used` gets a "noisy, triage by hand" note (`:609`); `arithmetic_side_effects` fires on every integer `+`, which §B26 itself says not to flag. This works against "a summary a human can read in ten seconds". Name the pedantic cast lints instead of the group, and give `arithmetic_side_effects` the same note. |
| N5 | Minor | `async-tasks-blocking.md:43` bans `std::fs::*` in any `async fn` with no exception for startup or a one-shot CLI. `tokio::fs` is the same blocking call moved to the pool. |
| N6 | Minor | `data-contracts.md:57` and `:69` require a contract test and an inline flag for every `#[serde(rename = …)]`. That contradicts the canonical inline-flag policy ("only when non-obvious or load-bearing"). |

A cost to plan for: several fixture controls pin trigger-row text (the §B2 map-guard types, the §C12 either-defense row, the §B14 `JoinSet` gate, the §B12 Argon2 feature obligations). Slimming those rows (L1) means updating the controls with them.

## Suggested order

1. Factual and contradiction fixes: C1–C6, K1, K3, K7, K11. Small, no structural change.
2. Decide the tier policy (K2). It changes what an audit reports.
3. Re-verify U1–U3 against the releases of the last four weeks.
4. Turn the nine fattest trigger rows into pointers and split the fifteen largest bullets into sub-bullets (L1, L2). This removes about 20 KB from the always-loaded core.
5. Retitle the grab-bag categories (N1).
6. File P1–P5 in `docs/roadmap.md` with sources.

## Status after the fixes (same day)

Applied: C1–C10; K1, K3–K12 (K12 only by dropping the inverted pointer; K9 left heading levels alone — the validator counts `## §X.` headings); K2 as conditional-🔴 entries for §C2, §B7, §B11 and §B24; U1 (the `Validation` defaults and setters re-read on the 12.0.0 docs — `insecure_decode` and the aud-omitted behavior test were not rerun), U2, U3, U4 (rustls, `pqc_kyber`, `backon`, `read_buf`; the 1.97 lint probe, the `dyn` async-trait note and `drop-and-raii.md:28` not re-verified), U6; N4–N6; the `Cell` backstop from P7; P1–P6 filed in `docs/roadmap.md`.

New finding while fixing U3: `ammonia` had two advisories after the pin was set — RUSTSEC-2026-0373 (issued 2026-10-17, uppercase `URL(…)` bypasses the CSS URL filter when `style` attributes are allowed) and RUSTSEC-2026-0533 (issued 2026-11-13, mutation XSS through embedded SVG/MathML; patched 4.2.5, 4.1.9, 3.3.5). The row's pin of ≥ 4.1.4 was stale; it is now ≥ 4.2.5.

Not done, by decision: L1–L6 (trigger-row and long-bullet restructuring — touches fixture controls that pin trigger-row text), N1–N3 (retitling, row order, moving §B7), U5 (download counts), P8 (Post-flight already says to "report which were executed or could not be run").
