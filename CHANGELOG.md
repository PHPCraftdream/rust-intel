# Changelog

Format — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning — [SemVer](https://semver.org/).

Major = breaking changes to BANNED/REQUIRED wording that tooling depends on.
Minor = new categories or substantive additions.
Patch = wording refinements, fixes, new sources.

## [Unreleased]

### Added
- `LICENSE` (MIT) at repo root.
- Skill installation instructions in `README.md` and `commands/README.md` (concrete `cp` / PowerShell `Copy-Item` commands for `~/.claude/skills/rust-intel/SKILL.md`).
- Field-report source in `docs/sources.md` with URL — the published 2026-05-16 article on uproger.com that grounds the "6-month observation" figures.
- arXiv URLs for AkiraRust (2602.21681) and Rust-SWE-Bench (2602.22764) in `docs/sources.md`.
- Restored missing `# TIER A — Mass compilation failures` heading in `rust-intel.md`.

### Changed
- "6-month production study" relabeled to "published field report" throughout `rust-intel.md` and `docs/sources.md` — the source is a public article, not unattributed internal observation.
- README's "compiler catches ~76%" claim corrected: the 76.3% figure is the share of *compilation failures* concentrated in two categories per Rust-SWE-Bench, not a share of "typical mistakes caught."
- AFIT recommendation in §B15 reordered to lead with native AFIT + RPITIT + `+ Send`; `trait-variant` second; `async-trait` only for `dyn Trait`.
- `cargo check --check-cfg` instruction replaced with the actual Rust 1.80+ behavior (automatic `unexpected_cfgs` lint from `Cargo.toml` declarations).
- `bytes::Bytes` removed from the §B5 "safe abstractions" list; replaced with `bytemuck::Pod` / `bytemuck::cast_slice`, with a note that `Bytes` is a buffer container, not a safe-transmute abstraction.
- `rand::random()` "not cryptographically secure" claim corrected: `ThreadRng` is a CSPRNG; the actual ban targets `SmallRng` / `StdRng` for security work and recommends `OsRng` as the default for keys and nonces.
- Slopsquatting "~45%" figure in §A1 hedged to match the verification status in `docs/sources.md`.
- Tier B intro rewritten to motivate via §B2 (46%→19%) and SafeGenBench (~57%) instead of the unverifiable RustPrint citation.

### Fixed
- "The eleven categories below" in Tier B intro → "fifteen" (matches §B1–§B15).
- README slash-command misnaming: skills aren't invoked with `/`; clarified that the skill activates automatically.
- `commands/rust-audit.md` and `commands/rust-plan.md`: removed inline duplications of category-level rules and the Pre-flight checklist questions. Both now reference the skill as the source of truth.
- `commands/rust-fix.md`: clarified the symptom→category table is a routing layer, not duplicated rule knowledge.

### Removed
- `RustPrint` benchmark entry from `docs/sources.md` and its citation in `rust-intel.md` (no verifiable source under that name).
- `LICENSE-APACHE` (dropped dual-licensing — prose-first repo, MIT alone is sufficient).

See [`docs/roadmap.md`](docs/roadmap.md) for upcoming work.

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
- §B5. Unsafe that looks safe (~55% UB rate).
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

### Source basis

Built on: a published 6-month field report (~80k LOC, tokio + sqlx + unsafe), benchmarks RustEvo², SafeTrans, CRUST-Bench, SafeGenBench, Rust-SWE-Bench, AkiraRust, industry reports from Faros AI and Lightrun (2026), and documented crates.io supply-chain incidents. Full list — [`docs/sources.md`](docs/sources.md).
