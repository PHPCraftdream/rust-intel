# rust-intel

A living specification that defends against the systematic mistakes LLMs make when writing Rust.

## What this is

An empirically-grounded ruleset for the Rust mistakes that **survive `cargo build` and `cargo test`** but still wreck things in production or rot the codebase over time. Every category is backed by a specific study, production incident, or systematically observed LLM output pattern — see [`docs/sources.md`](docs/sources.md).

The premise: Rust's compiler catches a large class of LLM mistakes (a known empirical finding is that **76.3% of all compilation failures from LLM agents** fall into just two categories — project organization and type/trait semantics, per Rust-SWE-Bench). Categories where the failure mode is a compile error are *deliberately omitted* from this spec — the compiler is sufficient. What this spec covers is what's left after `rustc`, `clippy`, and `cargo test` have all said "fine":

- **Silent correctness bugs** — `HashMap` corruption from inconsistent `Hash`/`Eq`, `tokio::sync::Mutex` held across `.await`, lost `JoinHandle`s, `RefCell` runtime panics under contention.
- **Design hazards** — `Deref` used for inheritance, manual `unsafe impl Send` without invariant, reflexive `Arc<Mutex<HashMap>>` where a single owner exists.
- **Runtime data corruption** — `serde` "absent" vs "null" conflation, `#[serde(untagged)]` overlap, `select!`-cancelled side effects.
- **Performance and resource leaks** — async `Drop` that doesn't drop, blocking calls on async runtime, unbounded channels.
- **Cryptographic and security pitfalls** — non-constant-time comparison, `OsRng` skipped for `thread_rng`, nonce reuse.

The exact category count is given in the spec itself; the count is allowed to evolve.

## Status

**v0.4.0 — fan-out audit workflow (2026-06-10).** Shipped `audit-project.workflow.js` — one agent per module, async split into two, runtime slicing of trigger tables (zero duplication), structured findings schema, synthesized `/rust-cc-audit` report. Module headers enriched with tier badges + audit semantics. `audit.md` gains fan-out-preferred note. Installers deliver the workflow. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.3 — accuracy pass (2026-06-10).** Factual/dating fixes (F1–F4): `clippy::await_holding_lock` group history corrected, MSRV 1.84→1.85, §C7 resolver v1/v2 qualification, `never_type_fallback` dating 1.92→1.85. Three minor clarifications (§B2, §B9, §B12, §B15a). No category changes (still **51**). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.2 — four content additions (2026-06-09).** From a study of Microsoft's *Rust Patterns & Engineering How-Tos*: §C1a (`#[non_exhaustive]` producer-side semver rule, 🟡), §B18a (variance/`PhantomData` soundness in raw-pointer wrappers, 🔴), expanded §B4 (memory-vs-resource `Drop` at exit, recursive `Drop` stack overflow, drop-order shutdown deadlock), and §B5 (unsafe→safe boundary principle: value-invariant guards vs relational invariants). Still **51** categories (sub-sections counted under parent). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.1 — structural repackaging (2026-05-31).** The single-file spec is now a **modular skill**: `SKILL.md` (core — protocols, enforcement tiers, the trigger table, and a category→module map) plus nine theme modules under `skill/` holding the category bodies. No rule or category changes (still **51**) — content is byte-complete vs 0.3.0. `SKILL.md` also tells the agent to run a full audit/review by **fanning out one sub-agent per module** (via a workflow) instead of holding all categories in one context. Installers ship the modules; the single-file reference is retired (kept in git history). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.0 — content release (2026-05-29).** The first tagged release since 0.2.2 — it collapses all interim work (drafted under provisional 0.3.x / 0.4.0 labels, never tagged) into one version. The spec was reframed to cover only bugs that compile and pass tests but still break, then grown from **26 to 51 categories** across **five tiers (A–E)**: silent correctness bugs (async cancellation, `Mutex`-across-`.await`, UB, TOCTOU, crypto, FFI, lossy numeric/`as`-casts, wall-clock vs monotonic, UTF-8 boundaries, iterator/slice adapter traps), architecture/ergonomics, testing/CI gaps, and a top-level **Tier E — Systemic cost** (latency, allocation, complexity, contention; enforced 🟡/🟢, never 🔴). Includes an external multi-agent review pass — evidence-base accuracy fixes, build-time supply-chain coverage (§A1), and anti-dogmatism calibration. Slash commands unchanged. See [`CHANGELOG.md`](CHANGELOG.md) for full notes.

## Layout

```
rust-intel/
├── skill/                              # The skill (this is what installs) — modular
│   ├── SKILL.md                        # Core: protocols, enforcement tiers, trigger table, category→module map
│   ├── <theme>.md                      # Theme modules (async, unsafe-and-ffi, security, … — the category bodies)
│   └── audit-project.workflow.js       # Fan-out project audit (one agent per module)
├── README.md                           # This file
├── CHANGELOG.md                        # Version history
├── .gitattributes                      # Line-ending rules (LF for source, CRLF for .ps1/.bat)
├── .gitignore                          # Ignores /.claude/ (project-local install target) and target/
├── rust-cc-install.sh / rust-cc-install.ps1 / rust-cc-install.bat       # One-command install (project-local by default; --user for global)
├── rust-cc-uninstall.sh / rust-cc-uninstall.ps1 / rust-cc-uninstall.bat # Inverse of install
├── commands/
│   ├── README.md
│   └── rust-intel-cc/                  # Repo umbrella dir (installer flattens to /rust-cc-* commands)
│       ├── audit.md                    # /rust-cc-audit  — scan existing code
│       ├── fix.md                      # /rust-cc-fix    — diagnose an error
│       └── plan.md                     # /rust-cc-plan   — pre-flight a new task
└── docs/
    ├── roadmap.md                      # Roadmap: open directions and structural notes
    └── sources.md                      # Empirical sources and citations
```

## How to use it

### Install (skill + commands)

**Default is project-local** — files land in `./.claude/` of whatever directory you ran the installer from. Pass `--user` (or `-User` on PowerShell) to install to the user-global `~/.claude/` instead.

```bash
# macOS / Linux
./rust-cc-install.sh                  # project-local: $PWD/.claude/
./rust-cc-install.sh --user           # user-global:   $HOME/.claude/
./rust-cc-install.sh --symlink        # symlink instead of copy (tracks repo updates)

# Windows (PowerShell)
.\rust-cc-install.ps1                 # project-local
.\rust-cc-install.ps1 -User           # user-global

# Windows (cmd.exe)
rust-cc-install.bat                   # project-local
rust-cc-install.bat -User             # user-global

# Note: --symlink is bash-only. PowerShell and cmd.exe installers always copy.
```

`CLAUDE_CONFIG_DIR` env var overrides everything if set.

The installer copies:
- `skill/*.md` → `<target>/skills/rust-intel/` (the modular skill — `SKILL.md` core plus theme modules; Claude Code activates it automatically on Rust tasks)
- `commands/rust-intel-cc/{audit,fix,plan}.md` → `<target>/commands/rust-cc-{audit,fix,plan}.md` (the three slash commands; installer flattens with a `rust-cc-` prefix on copy)

It also sweeps any prior install at the same target — including the legacy v0.1.x flat layout (`commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, and the very early `commands/rust-intel.md`) — so re-running it cleanly migrates from any older version.

### Uninstall

```bash
# macOS / Linux
./rust-cc-uninstall.sh                # project-local
./rust-cc-uninstall.sh --user         # user-global

# Windows (PowerShell)
.\rust-cc-uninstall.ps1
.\rust-cc-uninstall.ps1 -User

# Windows (cmd.exe)
rust-cc-uninstall.bat
rust-cc-uninstall.bat -User
```

Only touches the paths the installer creates. Other skills and commands under the target `.claude/` are not touched.

### Verify

Start `claude` inside the directory you installed to (or anywhere if you used `--user`), ask for any Rust task, and the assistant should reference rules from §A1–§E6 unprompted. Try:

```
/rust-cc-audit src/
/rust-cc-fix  E0277: the trait bound `T: Send` is not satisfied
/rust-cc-plan write a tokio task that consumes a sqlx stream and pushes to a websocket
```

### As a checklist for humans

The document reads top-to-bottom. The minimum bar before committing any non-trivial Rust: walk the **Pre-flight checklist** (7 questions at the end of the spec) and the **Post-flight checklist** (the list of things to surface in a summary).

### Commands

Three commands live under [`commands/rust-intel-cc/`](commands/rust-intel-cc/) and share a single source of truth — the skill itself, never a copy:

| Command | Trigger | Use case |
|---|---|---|
| [`audit`](commands/rust-intel-cc/audit.md) | `/rust-cc-audit [path]` | Scan existing Rust against all categories from the spec, return a triaged report with concrete fixes. |
| [`fix`](commands/rust-intel-cc/fix.md) | `/rust-cc-fix <error>` | Map a compiler / clippy / panic / runtime symptom onto a category, propose a root-cause fix. |
| [`plan`](commands/rust-intel-cc/plan.md) | `/rust-cc-plan <task>` | Run a task description through the trigger table and Pre-flight checklist before any code is written. |

Details: [`commands/README.md`](commands/README.md).

## Spec architecture

Five tiers plus a meta-layer:

| Tier | Coverage | Categories |
|---|---|---|
| Self-monitoring | Prompt-trigger table (phrase- *and* code-pattern-based) → activates relevant categories | top of spec |
| **Tier A** | Compile-fix reflexes that leave silent residue — the LLM "fixes" the red squiggle in a way that compiles while leaving a real defect behind | §A1–§A3 |
| **Tier B** | Silent correctness bugs, caught only in production | §B1–§B29 |
| **Tier C** | Architecture and ergonomics, expensive to undo | §C1–§C11 |
| **Tier D** | Testing and CI gaps — tests pass not because the code is correct but because the tests are blind | §D1, §D2 |
| **Tier E** | Systemic cost (performance / scale / contention) — correct in the small, wrong at scale — cost that survives correctness; enforced 🟡/🟢, never 🔴 | §E1–§E6 |

The A/B/C/D tiers classify *what kind* of bug a category targets. Orthogonally, the spec's **Enforcement tiers** (🔴 surface-always / may block · 🟡 apply silently while writing · 🟢 delegate to clippy) say *how strictly* to act on each — so a post-flight summary stays short and every line is worth acting on, instead of flagging every cast and clone. See the "Enforcement tiers" section in the spec.

A Tier A category for trait bounds / type mismatches (E0277/E0308) was present in earlier drafts and retired in v0.3.0: compile-only failures are out of scope, the compiler is sufficient. The remaining Tier A categories were renumbered to close the gap.

Tier B is the centre of the spec: silent correctness bugs that survive `rustc`, `clippy`, and `cargo test`. Each category cites a published study, production incident, or systematically observed LLM output pattern.

## Principles for evolving the spec

1. **Every category must be grounded.** No rule lands without one of (a) a published study with numbers, (b) a documented production incident, or (c) a systematically observed LLM output pattern.
2. **The spec defends against LLMs, not humans.** Categories where LLMs don't err more often than humans don't belong here — that's just Rust style.
3. **Proof before rule.** If a category lacks a sharp BANNED/REQUIRED formulation, it stays in the roadmap, not the main spec.
4. **Sources are transparent.** Every number in the spec maps to an entry in `docs/sources.md`.

## Contributing

See [`docs/roadmap.md`](docs/roadmap.md) for open directions. A new category is accepted if it meets the principles above and ships with a source.

## License

Dual-licensed under either **MIT** ([`LICENSE-MIT`](LICENSE-MIT)) or **Apache License 2.0** ([`LICENSE-APACHE`](LICENSE-APACHE)), at your option — the standard Rust-ecosystem convention. SPDX-License-Identifier: `MIT OR Apache-2.0`.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual-licensed as above, without any additional terms or conditions.
