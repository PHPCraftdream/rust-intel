# Commands

Thin commands built on top of the `rust-intel` skill. All of them rely on **one** source of truth — `../rust-intel.md` — and never copy rules.

## Architectural principle

```
rust-intel.md  ──  knowledge (26 categories, BANNED/REQUIRED, checklists)
       ▲
       │ invoke skill
       │
┌──────┴──────┬─────────────┬──────────────┐
│ /rust-audit │ /rust-fix   │ /rust-plan   │  ← process only
└─────────────┴─────────────┴──────────────┘
```

- **Knowledge** lives in the skill — edit once, every command sees the change immediately.
- **Process** lives per command — what to scan, what to output, what to ask.

If a command wants a new rule, the rule lands in `rust-intel.md`, not in the command file. Duplication of knowledge is forbidden by design.

## Commands

| File | Trigger | Use case |
|---|---|---|
| `rust-audit.md` | `/rust-audit [path]` | Scan existing Rust against all 26 categories |
| `rust-fix.md` | `/rust-fix <error>` | Explain a compiler / runtime error and propose a root-cause fix |
| `rust-plan.md` | `/rust-plan <task>` | Pre-flight a task through the trigger table before any code is written |

## Installation

Claude Code looks for user commands in `~/.claude/commands/`. To install:

**Windows (PowerShell):**
```powershell
Copy-Item -Path .\commands\*.md -Destination "$env:USERPROFILE\.claude\commands\"
```

**macOS / Linux:**
```bash
cp commands/*.md ~/.claude/commands/
```

Or symlink, if you want command updates to track repo updates:
```bash
ln -s "$(pwd)/commands/rust-audit.md" ~/.claude/commands/rust-audit.md
ln -s "$(pwd)/commands/rust-fix.md"   ~/.claude/commands/rust-fix.md
ln -s "$(pwd)/commands/rust-plan.md"  ~/.claude/commands/rust-plan.md
```

Once installed, the commands appear in `/`-autocomplete inside Claude Code.

## Dependency on the skill

All three commands assume the `rust-intel` skill is registered in Claude Code. The skill source is `../rust-intel.md`.

**Install the skill (do this before running any command).** Run from the **repo root**, not from inside `commands/`:

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

Or use the one-command installer at the repo root: `./install.sh` (Unix) or `./install.ps1` (Windows).

If the skill is unavailable, the commands emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.
