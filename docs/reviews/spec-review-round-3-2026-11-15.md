# Spec review, round 3 — 2026-11-15

Third pass over the shipped specification. Reviewed tree: `d97331f` (the round-1 fixes plus the round-2 report). The round-2 findings (R2-1 … R2-23) are still open and are not repeated here; where round 3 changes one of them, it says so.

## Method and limits

Rounds 1 and 2 read the files and checked ids and version pins. Round 3 asked a question neither could: do the spec's own **quotations** say what its sources say?

- **Quote audit.** 227 quotations of 40 characters or more (111 in rule text, 116 in `references/sources.md`) were matched, after normalising case, punctuation and markup, against: the `rust-src` 1.100.0 tarball (1,161 files of `std`/`core`/`alloc`), the published `.crate` files of the crates on a list of 82 (every one whose index entry and tarball downloaded) at their current stable release (source and rustdoc comments), 41 of 59 documentation repositories and pages (Reference, edition guide, API guidelines, Criterion book, serde, Kani, cargo-hack, cargo-deny), the text of 100 of 108 advisories on OSV, and 363 of the 376 pages the ledger links to. 126 matched; 101 did not.
- **Triage of the 101.** Every one that quotes an *external* source was re-checked by hand against that source, with a second script and, for pages that refuse scripts, with `curl` using a browser agent string. The rest are the spec's own words in quotation marks — hypothetical model output ("cancel-safe because all `.await` points are idempotent"), trigger phrases, earlier-draft wording the ledger records as withdrawn — which have no source to match.
- **Other checks.** All 89 advisory ids in the ledger (42 of them cited nowhere in rule text) were looked up on OSV; the four CVE ids absent from OSV (CVE-2026-35348, -35368, -5222, -5223) were looked up on cve.org; three ledger claims about release notes were checked against `RELEASES.md`; the commands and the audit workflow were checked as consumers of the spec; `references/sources.md` lines 156–335 were read in full.
- **Not done.** Lines 336–425 of the ledger (about 60 KB) were checked only mechanically, not read. The Cargo book source repository answered 404 for every path in the quote-audit run (its layout changed), so Cargo quotations were checked only through four hand-picked pages on `doc.rust-lang.org/cargo`. Quotations from sources that are not text on the web (the QuickCheck paper, the Grit blog's script-rendered page, a Medium article that times out) were not checked. The POSIX §4.16 sentence could not be matched because the page encodes `<slash>` as markup.
- **A defect of the tool.** The quote scanner's first run died on a malformed HTML entity in one of the downloaded pages; the fix is in the script, not in the repository. The first spot-check script was refused by `rfd.shared.oxide.computer` and `pubs.opengroup.org` because of its agent string, and reported both pages as unreadable; with a browser agent string both load, and the three RFD 609 quotations turned out to be exact. A failed fetch is not evidence of a missing quotation, and none is reported as one here.
- Nothing in `skill/` was changed by this round.

## Verdict

The quotations are mostly sound. Of those that quote an external text, two in rule text and six in the ledger are not what the source says today: two are verbatim strings that do not exist (a panic message and its replacement in a newer version), the rest are paraphrases inside quotation marks. That is a small number and none changes a rule, but the spec's own convention is that a quoted string can be searched for, and eight cannot. One round-1 fix was not carried into the ledger, and the ledger refers to old file names in five places. A larger weakness lies in how the evidence is kept: about 25 ledger entries rest on local probes that nobody can re-run, and 61 of its 72 `docs.rs` links point at `latest`, so each of them verifies the current release rather than the release the claim names.

| Severity | Count |
|---|---|
| Major | 1 |
| Minor | 9 |
| Nit | 4 |

Confirmed exact: the three RFD 609 quotations (the page loads with a browser agent string); "Rust has the highest mean package hallucination rate" and the Rust-over-40% sentence in *Importing Phantoms*; all three VeruSAGE figures ("14%", "7% and 2%", "less than 1.5%"); the SafeTrans E0599 sentence; the Unicode FAQ sentence on case-folded text; the `regex` sentence on iterator worst case; the `clippy` message for `not_unsafe_ptr_arg_deref`; the `cargo-semver-checks` lint description; the Reference sentence on union validity; the jsonwebtoken `aud`/`iss`/`sub` "only happens if … claim is present" rule; `Defaults to None`; the Criterion FAQ quotation; `cargo yank` "does not delete any data". Confirmed advisory data: all 89 ledger ids resolve, with matching package and fixed versions in every case where the ledger states them; the 1.96 `BTreeMap::append` note and the 1.98.1 date (2026-09-03) in the ledger match `RELEASES.md`; `rust-lang/rust` #155010 is still open.

## Major

| ID | Location | Problem | Fix |
|---|---|---|---|
| R3-1 | `references/sources.md` (about 25 entries), `examples/` | At least 25 of 254 ledger entries name a toolchain and state a local probe, control or diagnostic as evidence — "a rustc 1.97.0 probe …", "a Tokio 1.53.1 control …", "a Cargo 1.97.0 workspace …" (33 lines name a toolchain; `rustc 1.97.0` 19 times, `Tokio 1.53.1` 5, `Cargo 1.97.0` 4). No probe source is in the repository (`examples/` holds two files); the ledger says only "recorded as observations with their platform and toolchain (no URL)". The entries carry the weight of the spec's most precise claims (drop order, `catch_unwind` during unwinding, resolver v1 against v2 feature activation, `Take::limit` and `read_line`). A reader cannot rerun one, and the next toolchain bump cannot be checked against them: the round-2 finding that 1.100 changed `Iterator::{min,max}(_by_key)` is exactly the kind of change a rerun would have caught or confirmed. | Commit each probe as a small file under `docs/probes/<id>.rs` or `.sh` with the toolchain it ran on, reference it from the entry, and add a scheduled job that reruns them on the current stable. Entries whose probe is lost should say so in one clause. |

## Minor

| ID | Location | Problem | Fix |
|---|---|---|---|
| R3-2 | `testing-oracles.md:26` | The spec quotes tokio's panic for `pause()` on a multi-thread runtime as "time cannot be frozen from within a multi threaded runtime". No such string exists in tokio 1.54.1. `time::pause()` fails with "`time::pause()` requires the `current_thread` Tokio runtime. This is the default Runtime used by `#[tokio::test]`." ("time cannot be frozen from outside the Tokio runtime" is the no-runtime case.) The behavior the sentence describes is right; only the quoted text is invented. | Quote the real message, or drop the quotation marks. |
| R3-3 | `deps-cargo-macros.md:52` | The worked example quotes rustls 0.23's panic as "no process-level CryptoProvider available — call `CryptoProvider::install_default()` before this point". rustls 0.23.46 prints: "Could not automatically determine the process-level CryptoProvider from Rustls crate features. Call CryptoProvider::install_default() before this point to select a provider manually, or make sure exactly one of the 'aws-lc-rs' and 'ring' features is enabled." The shorter text is from the first 0.23 releases. The example's point — both provider features enabled in one graph, so `ClientConfig::builder()` panics — still holds. | Replace the quotation with the 0.23.46 text and say which release range prints which. |
| R3-4 | `references/sources.md:366` | The correction entry for the blanket version pins says "`checked_add` 1.0, `checked_shl` 1.7, `wrapping_div` 1.38" and links the `wrapping_div` documentation page, which says stable since **1.2.0**. Round 1 fixed the same sentence in `SKILL.md:544` and left this copy. | Correct the ledger sentence the way `SKILL.md` was corrected. |
| R3-5 | `references/sources.md:240`, `:247`, `:274`, `:304`, `:350` | The ledger names files that no longer exist: `data-and-types.md` (twice), `security.md`, `concurrency-and-state.md`, `async.md`. README says the split was a pure move, but these pointers stop at the old names. The rule text has none left. | Replace with the sphere files, or say "(until 0.8.0 `async.md`)". |
| R3-6 | `references/sources.md` (61 of 72 `docs.rs` URLs) | `docs.rs/<crate>/latest/…` is used under claims that name a version. The `jsonwebtoken` entry (`:248`) says "documented there" about `insecure_disable_signature_validation`; the linked page is now 12.0.0, whose `Validation` page does not list that method (the spec elsewhere says it was removed in 11.0.0). The same entry's links to `latest` check today's 12.x behavior while the observation they support was made on 9.3.1 and 11.0.0. | Version-pin the URL wherever the claim is version-scoped (`…/jsonwebtoken/11.0.0/…`); keep `latest` only for claims about the current API. |
| R3-7 | `references/sources.md:311` (twice), `:249`, `:335`, `:400` | Paraphrases inside quotation marks. tokio `Semaphore` docs: "limit the number of requests that **can be processed at the time**", not "are processed at a time". tokio discussion #5091: "doesn't manage the **file descriptor** limit for you", not "fd limit". OWASP: "a unique salt **must be added to each password**", not "must be generated for each password". blessed.rs: "an unofficial guide to the Rust ecosystem", not "an unofficial, hand-curated guide to the crates.io ecosystem". CVE-2026-35353 (OSV text): "umask-**derived** permissions", not "umask-based". | Quote exactly or remove the quotation marks. |
| R3-8 | `references/sources.md:237` | "header size hints 'may not be the actual uncompressed size for malicious or corrupted files'", attributed to the `zip` documentation. The sentence is not on `ZipArchive` or `ZipFile` in the current docs (the `size()` entry reads "Get the size of the file, in bytes, when uncompressed"). It may come from an older release. | Re-locate the source or drop the quotation marks; version-pin the link. |
| R3-9 | `commands/rust-intel-cc/fix.md` (symptom table) | Eight categories appear in no symptom row of the diagnostic command: §B6, §B19, §B29, §C1, §C3, §C4, §C6, §C12. Four of them have ordinary symptoms — a new variant silently ignored (§B6), a traversal that stops early (§B19), `zip` that drops the tail (§B29), a short read treated as complete (§C4). | One row each for §B6, §B19, §B29, §C4. |
| R3-10 | `references/sources.md:134-135` | The quotation "less than 10% of download traffic … most users had older versions in their lockfiles" is credited to the Rust blog post of 2026-08-20; the post does not contain it. It is on the RustSec advisory RUSTSEC-2026-0260. | Cite RUSTSEC-2026-0260 for the quotation. |

## Nit

| ID | Location | Problem |
|---|---|---|
| R3-11 | `references/sources.md:391` | The crates.io update text quotes the tab as `'Code'`; the source has double quotes. Harmless, but it is a quotation. |
| R3-12 | `references/sources.md:231` | The first segment of the Reference quotation ("reading a union field reads the bits of the union at the field's type") does not match the current Reference, which has moved that sentence; the second half ("It is the programmer's responsibility …") matches. |
| R3-13 | `jsonwebtoken` entry (`:248`) | Quotes "only happens if the `aud` claim is present"; the docs read "only happens if aud claim is present" — no article. |
| R3-14 | repository tooling | Round 2's list of checks worth moving into the validator gains one: a scheduled job that extracts every quotation of 40 characters or more, with its URL, and re-matches it. It found eight defects here at the cost of one script. |

## Effect on round 2

R2-2 stands, and R3-5 and R3-7 are further instances of the ledger drifting from the text it grounds. R2-15 (the dead OWASP link): the working page is `JSON_Web_Token_Cheat_Sheet.html`; the round-2 report's claim that the link checker found nothing else was wrong only in what it could not check — Cargo documentation.

## Still open

Round 1: L1–L6, N1–N3, U5. Round 2: R2-1 (the `rsa` advisory, a Major), R2-2 and R2-3 … R2-23. Not examined by any round: `references/sources.md` lines 336–425 as prose, and the sphere files as a whole read again after the round-1 edits.

## Status after the fixes (same day)

Applied: R3-2 (tokio's real `pause()` message, versioned), R3-3 (rustls's two texts and the releases that print them: 0.23.25 and earlier, 0.23.30 and later), R3-4, R3-5, R3-7 (five paraphrases corrected; the OSV text of CVE-2026-35353 now quoted), R3-8 (the quotation withdrawn — the zip 9.6.0 sources contain no such warning), R3-9 (four rows in `/rust-cc-fix`: §B6, §B19, §B29, §C4), R3-10, R3-11, R3-12, R3-13; R3-6 in part — the `jsonwebtoken` entry now states which versions documented the escape hatch and which removed it, but its link still points at `latest` and the other 60 `docs.rs/…/latest` links were judged to support claims about the current API and left as they are; R3-1 in part — the ledger states that its probes were run once and cannot be re-run and that new probes must be committed under `docs/probes/`; re-creating the existing ones is a roadmap item; R3-14 is a roadmap item.
