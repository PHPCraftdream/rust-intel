# Commands

Thin commands built on top of the `rust-intel` skill. All of them rely on **one** source of truth — the `rust-intel` skill in `../skill/` — and never copy rules.

## Architectural principle

```
skill/ (SKILL.md core + theme modules)  ──  knowledge (categories, BANNED/REQUIRED, checklists)
       ▲
       │ invoke skill
       │
┌──────┴─────────┬──────────────┬─────────────────┐
│ /rust-cc-audit │ /rust-cc-fix │ /rust-cc-plan   │  ← process only
└────────────────┴──────────────┴─────────────────┘
```

- **Knowledge** lives in the skill — edit once, every command sees the change immediately.
- **Process** lives per command — what to scan, what to output, what to ask.

If a command wants a new rule, the rule lands in the relevant `skill/` module, not in the command file. Duplication of knowledge is forbidden by design.

## Repo layout vs installed layout

The repo organises the three command source files under `rust-intel-cc/` for readability. The installer flattens that on copy: the target files are named `rust-cc-<sub>.md` directly under `commands/`. The slash commands are therefore plain `/rust-cc-audit`, `/rust-cc-fix`, `/rust-cc-plan` — no colon namespace.

| Repo source | Installed path | Slash command |
|---|---|---|
| `commands/rust-intel-cc/audit.md` | `<claude>/commands/rust-cc-audit.md` | `/rust-cc-audit [path]` |
| `commands/rust-intel-cc/fix.md`   | `<claude>/commands/rust-cc-fix.md`   | `/rust-cc-fix <error>` |
| `commands/rust-intel-cc/plan.md`  | `<claude>/commands/rust-cc-plan.md`  | `/rust-cc-plan <task>` |

This split keeps the repo tidy (one umbrella directory for three related commands) while keeping the slash surface flat and short (no namespace prefix in the prompt).

## Installation

Use the one-command installer at the repo root. By default it installs **project-local** — into `./.claude/` of whatever directory you ran it from. Pass `--user` to install to the user-global `~/.claude/` instead.

```bash
# macOS / Linux  (project-local by default)
./rust-cc-install.sh
./rust-cc-install.sh --user           # user-global

# Windows (PowerShell)
.\rust-cc-install.ps1
.\rust-cc-install.ps1 -User

# Windows (cmd.exe)
rust-cc-install.bat
rust-cc-install.bat -User
```

The installer also handles the skill (`skill/*.md` → `skills/rust-intel/`, modular) and sweeps every prior layout at the target — v0.2.1+ flat-with-prefix, v0.2.0 namespace dir, and the v0.1.x flat-no-prefix layout.

## Dependency on the skill

All three commands assume the `rust-intel` skill is registered in Claude Code at the same target. The installer puts it there for you.

If the skill is unavailable, the commands emit `⚠️ BLOCKED: skill rust-intel is not registered` and stop.
