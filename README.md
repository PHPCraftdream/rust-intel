# rust-intel

A living specification that defends against the systematic mistakes LLMs make when writing Rust.

## What this is

An empirically-grounded ruleset covering **26 categories of errors** that language models (Claude / GPT / Cursor / Codestral / DeepSeek) systematically produce in Rust as of 2026. Every category is backed by a specific study or production incident — see [`docs/sources.md`](docs/sources.md).

The core idea: Rust's compiler catches a large class of LLM mistakes (and a known empirical finding is that **76.3% of all compilation failures from LLM agents** fall into just two categories — project organization and type/trait semantics, per Rust-SWE-Bench). But the bugs that survive `cargo build` and `cargo test` and only surface in production — **silent correctness bugs** — are where most of the harm lives. This spec is structured around closing that gap.

## Status

**v0.1 — initial release.** 26 categories, ~730 lines. Living document — categories are added as new empirical data arrives. See [`CHANGELOG.md`](CHANGELOG.md).

## Layout

```
rust-intel/
├── rust-intel.md          # The spec itself (Claude Code skill)
├── README.md              # This file
├── CHANGELOG.md           # Version history
├── commands/              # Slash commands built on top of the skill
│   ├── README.md
│   ├── rust-audit.md      # /rust-audit  — scan existing code
│   ├── rust-fix.md        # /rust-fix    — diagnose an error
│   └── rust-plan.md       # /rust-plan   — pre-flight a new task
└── docs/
    ├── roadmap.md         # Planned commands and category expansions
    └── sources.md         # Empirical sources and citations
```

## How to use it

### As a Claude Code skill

`rust-intel.md` ships with YAML frontmatter and registers as a Claude Code skill. Skills are not invoked by slash command — Claude Code activates them automatically when the current task matches the skill's description (in this case, any Rust-writing task).

**Install** (run from the repo root after cloning):

```bash
# macOS / Linux
mkdir -p ~/.claude/skills/rust-intel
cp rust-intel.md ~/.claude/skills/rust-intel/SKILL.md
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills\rust-intel" | Out-Null
Copy-Item -Path .\rust-intel.md -Destination "$env:USERPROFILE\.claude\skills\rust-intel\SKILL.md"
```

Or symlink, so the skill tracks repo updates (Unix only):

```bash
ln -s "$(pwd)/rust-intel.md" ~/.claude/skills/rust-intel/SKILL.md
```

To verify installation: start `claude` in any Rust project, ask for any Rust task, and the assistant should reference rules from §A1–§C7 unprompted. For a one-command install of skill + all three commands, see [`install.sh`](install.sh) / [`install.ps1`](install.ps1).

### As a checklist for humans

The document reads top-to-bottom. The minimum bar before committing any non-trivial Rust: walk the **Pre-flight checklist** (7 questions at the end of the spec) and the **Post-flight checklist** (the list of things to surface in a summary).

### As a foundation for tooling

Three commands live under [`commands/`](commands/) and share a single source of truth — the skill itself, never a copy:

| Command | Trigger | Use case |
|---|---|---|
| [`/rust-audit`](commands/rust-audit.md) | `/rust-audit [path]` | Scan existing Rust against all 26 categories, return a triaged report with concrete fixes. |
| [`/rust-fix`](commands/rust-fix.md) | `/rust-fix <error>` | Map a compiler / clippy / panic / runtime symptom onto a category, propose a root-cause fix. |
| [`/rust-plan`](commands/rust-plan.md) | `/rust-plan <task>` | Run a task description through the trigger table and Pre-flight checklist before any code is written. |

Installation: see [`commands/README.md`](commands/README.md).

## Spec architecture

Three tiers plus a meta-layer:

| Tier | Coverage | Categories |
|---|---|---|
| Self-monitoring | Prompt-trigger table → activates relevant categories | top of spec |
| **Tier A** | Mass compilation failures, caught by `rustc` | §A1–§A4 |
| **Tier B** | Silent correctness bugs, caught only in production | §B1–§B15 |
| **Tier C** | Architecture and ergonomics, expensive to undo | §C1–§C7 |

Tier B is where the real value lives: 15 categories, each with measured frequency and/or documented production incidents.

## Principles for evolving the spec

1. **Every category must be grounded.** No rule lands without one of (a) a published study with numbers, (b) a documented production incident, or (c) a systematically observed LLM output pattern.
2. **The spec defends against LLMs, not humans.** Categories where LLMs don't err more often than humans don't belong here — that's just Rust style.
3. **Proof before rule.** If a category lacks a sharp BANNED/REQUIRED formulation, it stays in the roadmap, not the main spec.
4. **Sources are transparent.** Every number in the spec maps to an entry in `docs/sources.md`.

## Contributing

See [`docs/roadmap.md`](docs/roadmap.md) for open directions. A new category is accepted if it meets the principles above and ships with a source.

## License

MIT — see [`LICENSE`](LICENSE).

The repository is prose-first (a specification, three command files, and documentation). MIT is sufficient. If executable Rust code is added later (e.g., the planned `examples/` corpus), the project may move to MIT/Apache-2.0 dual licensing — the standard Rust-ecosystem convention — at that point.
