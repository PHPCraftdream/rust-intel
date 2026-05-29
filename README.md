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

**v0.4.0 — std-primitives coverage (2026-05-29).** Closes the last systematically-missed gap under the spec's scope: everyday `std` primitives that compile, pass ASCII/small-number tests, and break in production. Three new Tier B categories — **§B26 Lossy numeric conversions** (`as`-cast truncation, float→int saturating), **§B27 Wall-clock vs monotonic time** (`SystemTime` for durations, `.elapsed().unwrap()`), **§B28 UTF-8 and string-boundary hazards** (`&s[..]` panics on a char boundary, `len()`-as-char-count) — plus bullet-level additions to existing categories for `Box::leak` vs `OnceLock`/`LazyLock`, `mem::forget`, `FuturesUnordered` caps, `serde_json` numeric fidelity, `env::var` panics, `Vec` O(n²) front-mutation, `{:?}`-on-bytes, recursion-depth DoS, `sort_unstable` order, and PII logging. Category count 41 → 44; slash commands unchanged. With the post-compilation taxonomy now near-saturated, future work shifts toward infrastructure (an `examples/` regression corpus, CI link-checking). See [`CHANGELOG.md`](CHANGELOG.md) for full notes.

**v0.3.2 — accuracy patch (2026-05-29).** Same-day follow-up patches on top of v0.3.0's content release. v0.3.1 fixed five accuracy bugs (`mpsc::Sender::send` cancel-safety, the non-existent `cargo expand --type-sizes`, the `tokio::task::consume_budget` path, `subtle::Choice` vs `bool`, the C-DEREF citation) and extended seven categories with new BANNED/REQUIRED bullets. v0.3.2 fixes three bugs introduced in v0.3.1 (the `Notify` lost-wakeup pattern was missing its load-bearing `.enable()`; `tokio::task::coop::consume_budget` was pinned to the wrong tokio version; the `thiserror` `#[from]` bullet was both inaccurate and out-of-scope, now reframed as error-context erasure), catches the trigger table up to the v0.3.1 rules, and adds bullets for `tokio::time::interval` first-tick, atomic memory ordering, `broadcast` lag-is-data-loss, and blind-test antipatterns. Category count stays 41; slash commands unchanged. See [`CHANGELOG.md`](CHANGELOG.md) for full notes.

**v0.3.0 — scope reframe, accuracy pass, taxonomy expansion (2026-05-28).** Major content release: the spec was explicitly reframed to cover only bugs that compile and pass tests but still break, eight accuracy bugs were fixed, and the count grew from 26 to 41. Full details — including the scope reframe rationale — in [`CHANGELOG.md`](CHANGELOG.md).

## Layout

```
rust-intel/
├── rust-intel.md                       # The spec itself (Claude Code skill)
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
- `rust-intel.md` → `<target>/skills/rust-intel/SKILL.md` (the skill — Claude Code activates it automatically on Rust tasks)
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

Start `claude` inside the directory you installed to (or anywhere if you used `--user`), ask for any Rust task, and the assistant should reference rules from §A1–§D2 unprompted. Try:

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

Three tiers plus a meta-layer:

| Tier | Coverage | Categories |
|---|---|---|
| Self-monitoring | Prompt-trigger table (phrase- *and* code-pattern-based) → activates relevant categories | top of spec |
| **Tier A** | Compile-fix reflexes that leave silent residue — the LLM "fixes" the red squiggle in a way that compiles while leaving a real defect behind | §A1–§A3 |
| **Tier B** | Silent correctness bugs, caught only in production | §B1–§B28 |
| **Tier C** | Architecture and ergonomics, expensive to undo | §C1–§C11 |
| **Tier D** | Testing and CI gaps — tests pass not because the code is correct but because the tests are blind | §D1, §D2 |

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

MIT — see [`LICENSE`](LICENSE).

The repository is prose-first (a specification, three command files, and documentation). MIT is sufficient. If executable Rust code is added later (e.g., the planned `examples/` corpus), the project may move to MIT/Apache-2.0 dual licensing — the standard Rust-ecosystem convention — at that point.
