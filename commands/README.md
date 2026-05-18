# Commands

Thin commands built on top of the `rust-intel` skill. All of them rely on **one** source of truth — `../rust-intel.md` — and never copy rules.

## Architectural principle

```
rust-intel.md  ──  knowledge (26 categories, BANNED/REQUIRED, checklists)
       ▲
       │ invoke skill
       │
┌──────┴──────────────────┬──────────────────────┬──────────────────────┐
│ /rust-intel-cc:audit    │ /rust-intel-cc:fix   │ /rust-intel-cc:plan  │  ← process only
└─────────────────────────┴──────────────────────┴──────────────────────┘
```

- **Knowledge** lives in the skill — edit once, every command sees the change immediately.
- **Process** lives per command — what to scan, what to output, what to ask.

If a command wants a new rule, the rule lands in `rust-intel.md`, not in the command file. Duplication of knowledge is forbidden by design.

## Commands

All three live under the `rust-intel-cc` namespace (the directory `commands/rust-intel-cc/`) and are invoked with the colon-separator that Claude Code uses for nested commands.

| File | Trigger | Use case |
|---|---|---|
| `rust-intel-cc/audit.md` | `/rust-intel-cc:audit [path]` | Scan existing Rust against all 26 categories |
| `rust-intel-cc/fix.md` | `/rust-intel-cc:fix <error>` | Explain a compiler / runtime error and propose a root-cause fix |
| `rust-intel-cc/plan.md` | `/rust-intel-cc:plan <task>` | Pre-flight a task through the trigger table before any code is written |

## Installation

Use the one-command installer at the repo root. By default it installs **project-local** — into `./.claude/` of whatever directory you ran it from. Pass `--user` to install to the user-global `~/.claude/` instead.

```bash
# macOS / Linux  (project-local by default)
./install.sh
./install.sh --user           # user-global

# Windows (PowerShell)
.\install.ps1
.\install.ps1 -User

# Windows (cmd.exe)
install.bat
install.bat --user
```

The installer also handles the skill (`rust-intel.md` → `skills/rust-intel/SKILL.md`) and sweeps any prior install (including the legacy flat layout from v0.1.x with `commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, and the very early `commands/rust-intel.md`).

## Dependency on the skill

All three commands assume the `rust-intel` skill is registered in Claude Code at the same target. The installer puts it there for you.

If the skill is unavailable, the commands emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.
