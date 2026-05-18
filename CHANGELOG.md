# Changelog

Format — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning — [SemVer](https://semver.org/).

Major = breaking changes to BANNED/REQUIRED wording that tooling depends on.
Minor = new categories or substantive additions.
Patch = wording refinements, fixes, new sources.

## [Unreleased]

_No unreleased changes._

See [`docs/roadmap.md`](docs/roadmap.md) for planned work: §B16 `Send + Sync` on `dyn` async trait objects, §B17 `?Sized` mishandling, source-anchor IDs in `docs/sources.md`, and a possible hot-path / extended-reference split of the skill.

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
