# Spec review, round 4 — 2026-11-15

Fourth pass over the shipped specification. Reviewed tree: `0f5003d`, which carries the fixes from rounds 2 and 3. Rounds 1–3 findings that are still open (round 1: L1–L6, N1–N3, U5; the validator checks listed in `docs/roadmap.md`) are not repeated, except where round 4 measures them.

## Method and limits

Rounds 2 and 3 checked ids, versions and quotations against outside sources. Round 4 turned inward, with three methods the earlier rounds did not use:

- **Review of the fix edits themselves.** The 35 files changed by the round 2–3 fixes were re-read through their diffs, and every claim the fixes added was traced to a source or a script run: the `ammonia` preconditions against the OSV text of each advisory, the rustls message text against the published `.crate` of eight releases, the `trait-variant` blanket impl against its source, the `jsonwebtoken` removal against its CHANGELOG.
- **Mechanical cross-checks over the whole shipped text.** Each stated crate floor, each stabilization version and sixteen recurring numbers (pool size, KDF floors, depth limits, redirect hops, advisory lag, download counts, MSRV, …) were collected from all files and compared; thirty named cross-references of the form "§X's … bullet" were checked against the target's text; the 17 `rust` code blocks were parsed with `rustfmt` 1.9.0 (parse only; nothing was compiled or run); an offline typo scan flagged rare words one edit away from a frequent word; markup was checked for odd backticks and bold markers, table cell counts, heading jumps and invisible characters; the sibling lists in the 22 file headers were compared with the real groups.
- **Measurement of what an activation costs.** Byte sizes were converted at 3.6 bytes per token, a rough figure for markdown with code, and compared with the layout before the split (`d866857~1`).
- **Not done.** The sphere files were not read again in full after round 1. The cross-checks cover numbers, ids, references and markup; a contradiction stated in different words is invisible to them. Nothing was compiled or run, so every claim that code "compiles but is wrong" is as unverified as it was. `skill/references/sources.md` lines 336–425 are still unread as prose. Nothing in `skill/` was changed by this round.

## Verdict

No new defect in a rule's meaning was found. The findings are slips left by the fixes of rounds 2 and 3 (a severity cue the canonical list does not carry, a version range stated one release short), typos, and one gap between the Blocking protocol and an Operating-mode rule. The measurements settle two earlier questions: the sibling lists, numbers and cross-references are consistent; and the core file, not the number of spheres, decides what an activation costs.

| Severity | Count |
|---|---|
| Major | 0 |
| Minor | 6 |
| Nit | 3 |

Verified clean: 10 groups with 22 files and every "Sibling spheres" list correct; 30 named cross-references resolve to text that exists; every reference to an Operating-mode or Pre-flight item is within the 7 and 9 items; all numbers compared agree across files (512 blocking-pool threads, 600 000 PBKDF2 iterations, 19 MiB Argon2, serde_json depth 128, 10 redirect hops, 83 days of advisory lag, 64 KiB stack guideline, 2 MiB thread budgets, the 1.85 MSRV floor); no invisible characters; no table with a wrong cell count; 14 of 17 `rust` blocks parse as written or inside a function, and the other three contain deliberate `{ ... }`; the claims added in rounds 2 and 3 about `ammonia` (five advisories, fixed versions, preconditions), `trait-variant` (blanket `impl` of the original trait for the Send variant), `jsonwebtoken` (removal in 11.0.0) and the cargo-semver-checks lint hold.

## Minor

| ID | Location | Problem | Fix |
|---|---|---|---|
| R4-1 | `security-boundary.md:44`, `SKILL.md` red list | Round 2's severity cues were added to nine §C2 bullets, among them "**Name lookups after `chroot` while still privileged**": "Severity: 🔴 when untrusted input reaches it". The canonical 🔴 entry for §C2 lists SQL, command and CRLF injection, SSRF, traversal and archive escape, DNS rebinding and PID-keyed authorization — not this one. The defect is a privilege escalation through an attacker-writable new root, not untrusted input reaching a sink, so the cue's wording does not fit either. | Drop the cue from this bullet, or add the case to the list in words that fit ("an attacker-writable root before privileges are dropped"). |
| R4-2 | `deps-cargo-macros.md:52`, `references/sources.md` (new entry) | The round-3 fix says the old rustls text was printed by "0.23.25 and earlier". Bisecting the published crates: 0.23.0, .13, .20 and .25 through .29 print the old text, 0.23.30 and later the new one. | "0.23.29 and earlier" in both places. |
| R4-3 | `references/sources.md:232`, `:251` | Two typos: "laundries attacker-controlled bits" (should be "launders"), and "The Rust APIs — The Rust APIs — `argon2::…`" (phrase doubled). The offline scan found no other duplicated word or phrase and no other typo in the shipped files; it cannot find a misspelling of a word the corpus never repeats. | Fix both. |
| R4-4 | `SKILL.md:81` against `:60` and `:572` | The Blocking protocol says the agent hard-blocks in "the irreversible / security-critical three" cases, and the Pre-flight closing paragraph says the checklist "does not add a fourth, blanket reason to pause". Operating mode item 3 tells the agent to propose a new public trait's signature "and wait for approval before committing impls": a fourth stop, narrower than "blanket" but still a stop that the Blocking protocol does not list. An agent following the protocol literally may not stop there; one following item 3 will. | Name the case in the Blocking protocol as a fourth, non-blocking gate ("propose, wait for approval, draft in the meantime"), or reword item 3 as "propose the signature and state it as an assumption" for non-published crates and keep the wait only for published libraries, as it already says. |
| R4-5 | `deps-supply-chain.md:19` | "`LazyLock`/`OnceLock`, stable since Rust 1.80" — `OnceLock` is 1.70, `LazyLock` 1.80. Round 1 corrected the same sentence in `concurrency-locks-state.md:25` and the pin in `SKILL.md`; this copy remained. The pin and API checks found no other API with two different versions except `OwnedFd` (1.80 for the double-close abort in `SKILL.md`, 1.86 for the null-pointer checks in `testing-harness.md`, which are two different features) and a lint group (`suspicious` since 1.61 for `await_holding_lock`, 1.73 for `non_canonical_partial_ord_impl`, two different lints). | Split the two versions. |
| R4-6 | `dev/held.mjs`, `docs/held/`, `dev/validate.mjs`, `.github/workflows/ci.yml` | A hold is checked only when someone runs `node dev/held.mjs status`; the release checklist asks for that, CI does not. A later edit to a held passage's context silently turns the hold `inconsistent`, and the next `hold`/`release` refuses to run — found at release time, the worst moment. The release checklist step that moves `[Unreleased]` into a dated section also moves the held CHANGELOG line, which the hold must still find unchanged. | Run `node dev/held.mjs status` in the core validator (exit 1 on `inconsistent`); it reads files only. This adds a control, so it belongs with the other validator checks in the roadmap. |

## Nit

| ID | Location | Problem |
|---|---|---|
| R4-7 | `references/sources.md` (round-3 entry "Version-scoped panic texts") | The label reads "(§B15…§C10 worked example, §D1)". §B15 is not involved; the rustls example is §C10 and the tokio text is §D1. |
| R4-8 | `docs/reviews/README.md` | The review index does not list the three spec-review reports of 2026-11-15, although it is the file the ledger tells a reader to open first. |
| R4-9 | `concurrency-channels.md:39`, `testing-oracles.md:15`, `references/sources.md:62` | The spec writes American English (93 "behavior", 74 "initializ…", 107 "serializ…") but has "Behaviour", "behavioural" and a quotation with "behaviour"; the last is a quotation and stays. `SKILL.md:290` "serialism" is a term, not a variant. |

## What an activation costs

Sizes at 3.6 bytes per token; the loaded text is `SKILL.md` plus the spheres of the categories the task touches.

| Task (categories) | Before the split | After | Difference |
|---|---|---|---|
| async service (§B2 §B3 §B8 §B11 §B14 §B21 §B23) | 307 KB | 252 KB | −55 KB |
| serde + SQL (§B20 §C2 §B7 §B13) | 465 KB | 273 KB | −192 KB |
| library API (§C1 §A3 §B1 §C7 §C10) | 254 KB | 210 KB | −44 KB |
| JWT and password hashing (§B12 §B24 §C2) | 228 KB | 236 KB | +8 KB |
| FFI wrapper (§B5 §B25 §B18) | 254 KB | 261 KB | +8 KB |
| writing tests (§D1 §D2 §D3 §D4) | 203 KB | 211 KB | +8 KB |

- `SKILL.md` is 164.1 KB (about 46 700 tokens); it was 159.1 KB at the split and 160.6 KB when round 1 measured it. The trigger tables are 64% of it — about 30 000 tokens loaded before any sphere.
- A single-topic task loads 59 000–78 000 tokens; the core is 60–80% of that. A full pass in one context would load about 220 000 tokens (about 270 000 with the ledger).
- The split saves 44–192 KB for tasks that span groups (the old modules were 45–97 KB each and tasks pulled in two to four of them) and costs 8 KB where a task fits one old module, because the core grew by 5 KB since. It was designed for the audit fan-out, where the largest agent input fell from 97 KB to 38 KB; for the interactive case the lever is the core, which is round 1's L1.
- Every fix pass so far has made the core larger: the round 2–3 fixes took `SKILL.md` from 161.6 to 164.1 KB (three trigger rows, a pins line and several clauses). Without a size budget — for example, a validator limit on the core — each future fix adds to the cost that dominates.

## Effect on earlier rounds

R3-1 (probes not kept) and R2-2 (ledger parity) are unchanged. L1 of round 1 is now measured: it is the largest convenience item in the review series. Round 1's N3 (the home of §B7) matters more after round 2 gave §B7 conditional-🔴 cues: a reader who audits a parser for DoS opens `unsafe-sync-memory.md` and finds the rule in a file named for unsafe code.

## Still open

Round 1: L1–L6, N1–N3, U5. Round 2: none of the findings; the five validator checks are in `docs/roadmap.md`. Round 3: R3-1 and R3-6 in part. Round 4: R4-1 … R4-9. Not examined by any round: `references/sources.md` lines 336–425 as prose; a read of the sphere files that compares rules with each other in different words.

## Status after the fixes (same day)

Fixed: R4-1 (the cue removed from the `chroot` bullet), R4-2 (0.23.29 in both places), R4-3 (both typos), R4-5 (`LazyLock` 1.80 and `OnceLock` 1.70 stated separately), R4-7 (label), R4-8 (the review index lists all four reports), R4-9 for the two spellings in rule text (the quotation in the ledger stays). Left open for a decision: R4-4 (name the Operating-mode approval gate in the Blocking protocol, or narrow item 3) and R4-6 (run `node dev/held.mjs status` in the core validator, which adds a control).
