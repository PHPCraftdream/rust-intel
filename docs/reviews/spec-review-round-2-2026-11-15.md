# Spec review, round 2 — 2026-11-15

Second pass over the shipped specification, same six lenses (correctness, currency, completeness, conciseness, consistency, convenience). Reviewed tree: `302eeee`, which carries the round-1 fixes ([round 1](spec-review-2026-11-15.md)).

## Method and limits

Round 1 read every file. Round 2 did what a read cannot: it checked the spec's citations and version pins mechanically against primary sources, cross-checked the files against each other with a script, reviewed the round-1 fix edits themselves, and opened the evidence ledger for the first time.

- **Advisories.** Every full `RUSTSEC-…` id cited in `skill/*.md` (50, plus the eight of the 0259–0266 range) was looked up on `api.osv.dev`: package, fixed versions and report date compared with the text. 16 CVE and three GHSA ids were looked up the same way.
- **Version pins.** 62 keyword checks were run against the per-version sections of `rust-lang/rust` `RELEASES.md` (145 versions, newest 1.100.0). Three pins are not in the release notes under any spelling tried and stay unverified: the `OwnedFd` double-close abort (1.80), `Duration::try_from_secs_f64` (1.66) and the future `let_underscore_drop_guard`.
- **Structure.** A script compared, per sphere file, the header's "holds the category bodies for …" list, the "Tiers in this file" line, the actual headings, the 🔴 list in `SKILL.md`, every `§` reference, every file reference, the advisory ids against the ledger, and the trigger rows per category.
- **Ledger.** `references/sources.md` lines 1–155 (benchmarks, field report, industry reports, incidents) were read. Lines 156 on (normative sources, 149 KB) were checked only mechanically: ids and URL liveness for all 420 URLs.
- **Not done.** The sphere files were not re-read in full; the round-1 read was reused and only changed passages were re-read. URL fragments were not checked. Four CVE ids (CVE-2026-35348, -35368, -5222, -5223) are absent from OSV and stay unverified, not refuted. Five ledger URLs could not be reached from this machine (two answer 403 to scripts, three time out).
- **A mistake of this review.** The link checker took URLs from the rule text as well and therefore sent a GET to two example addresses of the SSRF rule: a loopback port and the link-local metadata address. The first was refused, the second timed out; nothing answered. A link check over this spec needs an explicit filter for example hosts.
- Nothing in `skill/` was changed by this round.

## Verdict

Of 58 advisory ids, one statement is stale — and it is load-bearing: the `rsa` Marvin advisory, presented as "open by design, no fixed version", was fixed in `rsa` 0.10.0 on 2026-11-08. Every version pin that the release notes mention agrees with them; two facts the release notes add are missing from the spec. The round-1 fixes hold, with three that need a second touch. The ledger's own rule — every claim traceable to an entry — is not met for 21 advisory ids.

| Severity | Count |
|---|---|
| Major | 2 |
| Minor | 14 |
| Nit | 7 |

Confirmed and unchanged: the 0259–0266 range is the `arrayref` incident (0260 `arrayref` 0.3.10, 0262 `append-only-vec` 0.1.9, 0266 `internment` 0.8.7, the rest the malicious helper crates); the `greentic` advisories do say the malware fired when a depending project was opened in VS Code; fixed versions match for `tokio`, `cap-primitives`, `rand`, `anyhow`, `tar`, `zip`, `quick-xml`, `lru`, `rustls`, `wasmtime`, `suppaftp`, `cryptoki`, `ringbuf`, `rojo`, `zbus_polkit`, `iceoryx2-bb-container`, `connectrpc`, `azure_core`, `manzana`, `dbn`; `pqc_kyber`, `stack-graphs`, `tokio-tar` and `rio` still have no fix. Pins confirmed against release notes include 1.100 (never type, custom allocators, minimum publish age, `cargo install` using the packaged lockfile), 1.98 (derived `PartialOrd`, `c_void_returns`, `NumBuffer`, algebraic float operations), 1.97 (`build.warnings`), 1.96 (`assert_matches!`), 1.95 (`if let` guards, `cfg_select!`, `bool: TryFrom`), 1.94 (`CARGO_BIN_EXE_*` at run time, `SystemTime` on Windows), 1.93, 1.91, 1.89, 1.88, 1.86, 1.82, 1.81 and the 1.98.1 / 1.99.1 fixes.

## Major

| ID | Location | Problem | Fix |
|---|---|---|---|
| R2-1 | `security-crypto.md:53`, `SKILL.md:346`, `references/sources.md:251` | RUSTSEC-2023-0071 (`rsa`, Marvin) is described as having "no fixed version available" and used as the worked example of an advisory that is "open by design". The advisory was updated on 2026-11-08: fixed in **`rsa` 0.10.0** (migration to `crypto-bigint`, constant-time mitigations); 0.10.0 is the current stable release. A reader following the spec keeps an attacker-timed path off `rsa` instead of upgrading, and a reader on 0.9 is told nothing can be done. | Pin `rsa` ≥ 0.10.0. Keep the lesson as history — the advisory stood open for three years on a maintained, correctly used crate — and keep the "check RUSTSEC before adding a crypto dependency" rule. |
| R2-2 | `references/sources.md:5`, 21 ids in rule text | The ledger's own discipline line says a claim with no ledger entry "is considered under-grounded and belongs in the … roadmap". 21 advisory ids cited in rule text have no ledger entry: RUSTSEC-2016-0005, 2021-0141, 2022-0011, 2024-0388, 2025-0012, 2025-0052, 2025-0068, 2025-0071, 2025-0141, 2025-0168, 2026-0002, 2026-0068, 2026-0190, 2026-0193, 2026-0194, 2026-0213, 2026-0253, 2026-0280, 2026-0281, 2026-0373, 2026-0533. Two of them were added by the round-1 fixes. Nine of the ten URLs written in rule text are not in the ledger either. Nothing checks this parity. | Either add the entries, or state the policy in the ledger ("an advisory id is its own citation; an entry is required only when the rule quotes the advisory's content") — and enforce whichever is chosen in the validator. |

## Minor

| ID | Location | Problem | Fix |
|---|---|---|---|
| R2-3 | `drop-and-raii.md:53` | "`never_type_fallback_flowing_into_unsafe` … warn-by-default in all editions since Rust 1.80 and deny-by-default in edition 2024". Rust **1.92** made it (and `dependency_on_unit_never_type_fallback`) deny-by-default. | State 1.92. |
| R2-4 | `data-contracts.md:28`, `SKILL.md:543` | The spec documents one toolchain-dependent outcome of an inconsistent `Ord` (derived `PartialOrd`, 1.98). The 1.100 compatibility notes add a second: "`Iterator::{min,max}(_by_key)` changed which `Ord` methods they use" and "may impact types with inconsistent trait" implementations. | Add it next to the 1.98 case and to the pin. |
| R2-5 | `deps-ergonomics.md:89` | The round-1 rewrite of the `ammonia` row says "five XSS advisories in fourteen months". OSV lists seven fixed on the 4.x lines in that period; the two not counted, RUSTSEC-2021-0157 and -0158, were fixed in 4.1.7 / 4.2.3 (the new pin covers them). The row also abbreviates ids ("-0213, -0373, -0533"), so a search for `RUSTSEC-2026-0533` finds nothing. | Drop the count or correct it; write ids in full. |
| R2-6 | `SKILL.md:313`, `:452`; `deps-supply-chain.md:41`; `references/sources.md:134-140`, `:227` | Abbreviated advisory ids elsewhere: "CVE-2026-35346, -35348", "RUSTSEC-2026-0259–0266", "/ -0260 / -0266", "CVE-2026-33056 / -33055", "CVE-2026-5222 / -5223", "RUSTSEC-2026-0067 / -0068", "RUSTSEC-2020-0071 and -0159". They are invisible to search and to any id check. | Full ids; a range may stay if the members are also listed. |
| R2-7 | `SKILL.md:8` (round-1 fix) | The sentence added to the scope statement says compile errors are named "only because the cheapest fix for it leaves a silent residue". That holds for `Rc` across threads (the fix is `unsafe impl Send`), not for `for x in stream` or `no_std` imports. It also cites §A2 for `Rc` across threads; the bullet is in §B2 (`async-locks-cancel.md:16`). | "…are named for orientation, not as findings"; cite §B2. |
| R2-8 | `async-tasks-blocking.md:41` (round-1 fix) | The exception "(not in `main` before the runtime serves requests, and not in a one-shot CLI)" was put on the list heading, so it also exempts the bullets that have nothing to do with startup: `timeout` around `spawn_blocking`, inline `rayon`, the orphaned child process. | Move the exception onto the substitution bullets (`std::thread::sleep`, `std::fs`, `std::io`, blocking clients). |
| R2-9 | `SKILL.md:588` (round-1 fix) | `-D unused_must_use` in the Post-flight command turns the whole lint pass into a failure on any unused result that already exists in the workspace. Round 1 asked for a `deny` in CI; the Post-flight pass is the "see it" pass. | Decide deliberately: `-W` here plus the CI `deny` that §B8 now requires, or keep `-D` and say so. |
| R2-10 | `SKILL.md:163`, `:18` | The Tier C overview says "These are not bugs in the strict sense, but design choices". §C2 now carries conditional-🔴 injection entries and §C12 three 🔴 XSS rows. The one-line Tier C summary lists eight topics and none of the security ones. | Reword the overview: Tier C also holds the boundary rules, some of them 🔴. |
| R2-11 | `security-boundary.md` (§C2 bullets), `unsafe-sync-memory.md` (§B7 bullets) | The conditional 🔴 added in round 1 exists in the `SKILL.md` list and in the file headers only. §B14, the model for it, says "(🔴 when …)" inside the bullet. An agent reading a §C2 bullet sees no severity cue. | Add the cue to the injection, SSRF, traversal and size bullets. |
| R2-12 | `security-boundary.md:17` vs `concurrency-locks-state.md:44` | The allowance added in round 1 covers `Mutex::lock().unwrap()` only. The same poison-propagation idiom appears in the spec's own REQUIRED text as `cv.wait(guard).unwrap()` and `cv.wait_while(…).unwrap()`, and applies equally to `RwLock::read`/`write`. | "a poison-propagating `.unwrap()` on a std lock or condvar result". |
| R2-13 | `SKILL.md` trigger tables | Three categories have no trigger row at all — §C3 (runtime coherence, wasm, `no_std`), §D2 (test placement), §D5 (Windows `LNK1104`) — so Self-monitoring can never activate them; they are reachable only in a full pass. | One row each ("wasm / async-std / embassy", "move this test to `tests/`", "`LNK1104` on a test binary"). |
| R2-14 | `SKILL.md` Version pins | The pins are the index for "re-verify on an older toolchain". These above-floor APIs are recommended in bodies and have no pin line: let-chains (1.88), `File::lock` (1.89), `floor_char_boundary` and `strict_*` (1.91), `unchecked_shl`/`shr`/`neg` (1.93), `SystemTime::checked_sub` on Windows and `CARGO_BIN_EXE_*` at run time (1.94), `cfg_select!`, `if let` guards and `bool: TryFrom` (1.95), `build.warnings` (1.97), `NumBuffer` and the algebraic float operations (1.98). | One compact pin line listing them with their sections. |
| R2-15 | `references/sources.md:248` | Dead link: `cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html` answers 404. The site now serves `JSON_Web_Token_Cheat_Sheet.html`. | Update the URL. |
| R2-16 | `unsafe-core.md:11` | "the pattern … is consistent across every published audit to date". The ledger grounds the unsafe figures in one source — the field report's 40 blocks, which the ledger itself calls anecdotal and not reproducible. | "in the one small audit cited". |

## Nit

| ID | Location | Problem |
|---|---|---|
| R2-17 | `SKILL.md:12` | "more than doubles the incidents-to-PR ratio" — the ledger figure is +242.7%, which is more than a tripling. |
| R2-18 | `references/sources.md` (4 URLs) | Clippy lint pages moved from `rust-lang.github.io/rust-clippy` to `clippy.rust-lang.org`; the old URLs redirect. |
| R2-19 | toolchain pin, §D1 | 1.100: `str::escape_debug` now always escapes grapheme extenders, so `{:?}` snapshots of such strings change on the toolchain bump. A candidate example for "the toolchain is part of the artifact". |
| R2-20 | `async-machinery.md:26` | "plus a blanket impl `SendVariant: Original`" is not Rust notation; it is `impl<T: SendVariant> Original for T`. |
| R2-21 | `semantics-and-conformance.md:33` (round-1 fix) | The example encoder now panics through `.expect` on an oversized payload. Returning `Result` would keep the example to its one intended defect. |
| R2-22 | `references/sources.md:76` | "(Directionally consistent with SafeGenBench findings.)" on the unsafe figure — the SafeGenBench entry above it says that paper does not mention Rust. |
| R2-23 | `security-boundary.md` REQUIRED | The four remedies moved in round 1 now sit a screen away from the hazards they answer. The file's other bullets keep the remedy inline as "REQUIRED: …"; that form keeps both the heading discipline and the locality. |

## Round-1 fixes reviewed

Correct as applied: C1, C2, C3, C5, C6, C7, C8, C10, K1 (subject to R2-12), K3, K5, K6, K7, K8, K10, K11, K12, U2, U4, U6, N4, N6 and the header alignment of the three single-file groups. Need a second touch: K4 (R2-7), N5 (R2-8), C4 (R2-9), U3 (R2-5), K2 (R2-10, R2-11), C9 (R2-21). After the header fix the script finds every file's "holds" list, tier line and headings in agreement, and no `§` reference to a category that does not exist.

## Still open from round 1

L1–L6 (the 161.6 KB core, the nine trigger rows over 1 KB, the fifteen single-line bullets over 3 KB, duplicated material), N1–N3 (category titles, row order, the home of §B7) and U5 (download counts). `docs/roadmap.md` §3 already lists the trigger-table consolidation.

## Checks worth moving into the validator

Each is mechanical and would have caught a finding of these two rounds:

1. Every advisory id in rule text has a ledger entry, or matches the stated exemption (R2-2).
2. No abbreviated advisory id (R2-5, R2-6).
3. Each sphere header's category list and tier line equal the file's headings; every 🔴 in a header appears in the `SKILL.md` list (round-1 C6).
4. Every category has at least one trigger row (R2-13).
5. Advisory ids resolve on OSV with the cited package — a scheduled job, not a per-commit check (R2-1).

## Status after the fixes (same day)

Applied: R2-1 (`rsa` ≥ 0.10.0 in §B12, the `SKILL.md` trigger row and the ledger entry); R2-2 as the second option — the ledger now states that an advisory id or a URL cited in rule text is its own citation and that an entry is required only where a rule interprets the advisory, plus new entries for the `ammonia` advisories, the `jsonwebtoken` 12.0.0 re-read, the 1.92/1.100 release-note items and the two version-scoped panic texts (the 19 remaining ids without an entry fall under the stated exemption; enforcing it in the validator is a roadmap item); R2-3 … R2-5; R2-6 (every abbreviated id written out); R2-7 … R2-8; R2-9 as the first option — `-D unused_must_use` stays and the Post-flight note says what it does to an existing backlog; R2-10 … R2-22; R2-23 as labels on the four remedies instead of moving them back.

Not done: nothing from this report is left open except the validator checks listed at its end, which are in `docs/roadmap.md`.
