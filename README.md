# rust-intel

A living specification that defends against the systematic mistakes LLMs make when writing Rust.

## What this is

An empirically-grounded ruleset covering **26 categories of errors** that language models (Claude / GPT / Cursor / Codestral / DeepSeek) systematically produce in Rust as of 2026. Every category is backed by a specific study or production incident — see [`docs/sources.md`](docs/sources.md).

The core idea: Rust's compiler catches a large class of LLM mistakes (and a known empirical finding is that **76.3% of all compilation failures from LLM agents** fall into just two categories — project organization and type/trait semantics, per Rust-SWE-Bench). But the bugs that survive `cargo build` and `cargo test` and only surface in production — **silent correctness bugs** — are where most of the harm lives. This spec is structured around closing that gap.

## Status

**v0.2.0 — tooling restructure (2026-05-18).** The skill itself is unchanged from v0.1.2. What changed: the three slash commands moved into a namespace (`/rust-intel-cc:audit`, `/rust-intel-cc:fix`, `/rust-intel-cc:plan` — colon-namespaced under one umbrella), installers now default to **project-local** `./.claude/` (use `--user` / `-User` for the old user-global `~/.claude/` behaviour), and `.bat` wrappers are shipped for Windows `cmd.exe`. Installers sweep the legacy v0.1.x flat layout automatically. See [`CHANGELOG.md`](CHANGELOG.md) for full migration notes.

## Layout

```
rust-intel/
├── rust-intel.md                       # The spec itself (Claude Code skill)
├── README.md                           # This file
├── CHANGELOG.md                        # Version history
├── install.sh / install.ps1 / install.bat       # One-command install (project-local by default; --user for global)
├── uninstall.sh / uninstall.ps1 / uninstall.bat # Inverse of install
├── commands/
│   ├── README.md
│   └── rust-intel-cc/                  # Namespace dir → /rust-intel-cc:* commands
│       ├── audit.md                    # /rust-intel-cc:audit  — scan existing code
│       ├── fix.md                      # /rust-intel-cc:fix    — diagnose an error
│       └── plan.md                     # /rust-intel-cc:plan   — pre-flight a new task
└── docs/
    ├── roadmap.md                      # Planned commands and category expansions
    └── sources.md                      # Empirical sources and citations
```

## How to use it

### Install (skill + commands)

**Default is project-local** — files land in `./.claude/` of whatever directory you ran the installer from. Pass `--user` (or `-User` on PowerShell) to install to the user-global `~/.claude/` instead.

```bash
# macOS / Linux
./install.sh                  # project-local: $PWD/.claude/
./install.sh --user           # user-global:   $HOME/.claude/
./install.sh --symlink        # symlink instead of copy (tracks repo updates)

# Windows (PowerShell)
.\install.ps1                 # project-local
.\install.ps1 -User           # user-global

# Windows (cmd.exe)
install.bat                   # project-local
install.bat -User             # user-global
```

`CLAUDE_CONFIG_DIR` env var overrides everything if set.

The installer copies:
- `rust-intel.md` → `<target>/skills/rust-intel/SKILL.md` (the skill — Claude Code activates it automatically on Rust tasks)
- `commands/rust-intel-cc/{audit,fix,plan}.md` → `<target>/commands/rust-intel-cc/*.md` (the three slash commands)

It also sweeps any prior install at the same target — including the legacy v0.1.x flat layout (`commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, and the very early `commands/rust-intel.md`) — so re-running it cleanly migrates from any older version.

### Uninstall

```bash
# macOS / Linux
./uninstall.sh                # project-local
./uninstall.sh --user         # user-global

# Windows (PowerShell)
.\uninstall.ps1
.\uninstall.ps1 -User

# Windows (cmd.exe)
uninstall.bat
uninstall.bat -User
```

Only touches the paths the installer creates. Other skills and commands under the target `.claude/` are not touched.

### Verify

Start `claude` inside the directory you installed to (or anywhere if you used `--user`), ask for any Rust task, and the assistant should reference rules from §A1–§C7 unprompted. Try:

```
/rust-intel-cc:audit src/
/rust-intel-cc:fix  E0277: the trait bound `T: Send` is not satisfied
/rust-intel-cc:plan write a tokio task that consumes a sqlx stream and pushes to a websocket
```

### As a checklist for humans

The document reads top-to-bottom. The minimum bar before committing any non-trivial Rust: walk the **Pre-flight checklist** (7 questions at the end of the spec) and the **Post-flight checklist** (the list of things to surface in a summary).

### Commands

Three commands live under [`commands/rust-intel-cc/`](commands/rust-intel-cc/) and share a single source of truth — the skill itself, never a copy:

| Command | Trigger | Use case |
|---|---|---|
| [`audit`](commands/rust-intel-cc/audit.md) | `/rust-intel-cc:audit [path]` | Scan existing Rust against all 26 categories, return a triaged report with concrete fixes. |
| [`fix`](commands/rust-intel-cc/fix.md) | `/rust-intel-cc:fix <error>` | Map a compiler / clippy / panic / runtime symptom onto a category, propose a root-cause fix. |
| [`plan`](commands/rust-intel-cc/plan.md) | `/rust-intel-cc:plan <task>` | Run a task description through the trigger table and Pre-flight checklist before any code is written. |

Details: [`commands/README.md`](commands/README.md).

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
