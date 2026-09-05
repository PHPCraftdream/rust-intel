בס״ד

לכבוד הקדוש ברוך הוא — *for the glory of the Holy One, blessed be He*

# rust-intel

**v0.6.0 (2026-08-19).** New category **§C12/§C12a** — reaching for a world-recognized crate instead of reinventing a solved problem (27 utility rows + 2 infrastructure rows, each gated on a nameable silent-failure input; the HTML-sanitization and Markdown-rendering rows are 🔴), plus a §A1 "default-of-an-earlier-era" bullet and new phrase/code-pattern triggers. Numbered categories now **59** (Tier C now runs §C1–§C12). See [`CHANGELOG.md`](CHANGELOG.md).

A living specification that defends against the systematic mistakes LLMs make when writing Rust.

## What this is

An empirically-grounded ruleset for the Rust mistakes that **survive `cargo build` and `cargo test`** but still wreck things in production or rot the codebase over time. Every category is backed by a specific study, production incident, or systematically observed LLM output pattern — see the shipped [evidence base](skill/references/sources.md).

> **Per-rule grounding ≠ measured coverage.** Each category is grounded individually (above). `examples/fixtures/` now holds a deterministic two-case calibration *seed* for §B5/§B26 — a regression tripwire, not a coverage figure. There is still no agent-level corpus measuring *what fraction* of real silent-failure bugs the audit catches. Expanding the corpus to deliberately broken Rust per category and exercising it through `/rust-cc-audit` remains tracked in [`docs/roadmap.md`](docs/roadmap.md) §4; overall completeness is still author-asserted.

The premise: Rust's compiler catches a large class of LLM mistakes (a known empirical finding is that **76.3% of all compilation failures from LLM agents** fall into just two categories — project organization and type/trait semantics, per Rust-SWE-Bench). Categories where the failure mode is a compile error are *deliberately omitted* from this spec — the compiler is sufficient. What this spec covers is what's left after `rustc`, `clippy`, and `cargo test` have all said "fine":

- **Silent correctness bugs** — `HashMap` corruption from inconsistent `Hash`/`Eq`, `tokio::sync::Mutex` held across `.await`, lost `JoinHandle`s, `RefCell` runtime panics under contention.
- **Design hazards** — `Deref` used for inheritance, manual `unsafe impl Send` without invariant, reflexive `Arc<Mutex<HashMap>>` where a single owner exists.
- **Runtime data corruption** — `serde` "absent" vs "null" conflation, `#[serde(untagged)]` overlap, `select!`-cancelled side effects.
- **Performance and resource leaks** — async `Drop` that doesn't drop, blocking calls on async runtime, unbounded channels.
- **Cryptographic and security pitfalls** — non-constant-time comparison, `OsRng` skipped for `thread_rng`, nonce reuse.

The exact category count is given in the spec itself; the count is allowed to evolve.

## Validator contract

`dev/validate.mjs` is deliberately a repository validator, not a general CommonMark/GFM parser.
Its supported Markdown surface is explicit:

- It recognizes exactly two global, top-level trigger-table anchors: `User request contains... | Activates category | Specific risk` and `Code pattern in user input | Activates`.
- Each anchor has a canonical end/scaffold boundary (`**Triggered by code, not phrase**` or `When two or more triggers fire in one request`); raw column-1 leading pipes, declared widths, and a nonempty body are required. The scaffold continues through the `Category map`, whose module/category parity is checked.
- Duplicate keys are the sorted set of inline-code tokens in a code-pattern row; ordinary emphasis, strong emphasis, and strikethrough remain allowed text, while prose-only rows (with no inline code) are not deduplicated. Any raw `<` outside inline code in a code-pattern row's first cell is unsupported and rejected explicitly (including raw-HTML/autolink-like syntax); bracketed link/image/reference-like syntax and a broad repository-style URI/email-like token ban outside inline code are also rejected. This is a documented repository subset, not an exact GFM claim.
- In trigger-table cells, the repository convention treats a pipe preceded by an odd number of backslashes as escaped content; an even number leaves the pipe as a column separator. This parity convention is explicit repository policy, not a claim about GFM/cmark-gfm behavior.
- Project fences are standalone and allow 0–3 leading spaces. Container-prefixed fences and angle-leading raw-HTML-style lines are rejected explicitly.
- Workflow metadata is declarative and frozen: `MODULES` and `AUDIT_UNITS` must be direct `deepFreezeRecords([...])` initializers. Inline consumption of those arrays and primitive `.length` bindings are supported. Direct RHS-leading reference aliases, destructuring of either root array or its nested arrays, and bindings of `.map()`/`.filter()` results are unsupported and rejected: a derived array may retain frozen-record references in its descendants, so bounded static scope analysis cannot prove that the frozen graph is no longer reachable. Workflow code should use explicit loops that project only the primitive values it needs; mutations through the frozen graph remain rejected.

## Status

**v0.5.0 (2026-08-08).** Second distribution channel, a review-of-reviews pass, and the repo's first CI. Codex plugin manifest + `rust-intel-codex` installer; the evidence base moved *inside* the skill (`skill/references/sources.md`); corrected §B5 union validity and `transmute` sufficiency, §B12 zeroization, §B20 duplicate keys, §C1 `repr(transparent)`; archive safety split along the right axis — zip-slip traversal to §C2, aggregate extraction quotas to §B7; new §B26 shift-count rule; the fan-out audit now records which artifacts each unit actually opened. Numbered categories remain **58**. See [`CHANGELOG.md`](CHANGELOG.md).
**v0.4.7 — five-audit gap cluster: crypto, FFI/unsafe, deserialization, concurrency, supply-chain (2026-07-09).** 25 findings from five dedicated gap audits (`docs/reviews/gap-audit-*.md`), each verified still-uncovered, grounded in a citable source, and independently reviewed before merge. Numbered categories unchanged (still **58**) — one new lettered sub-category §B25a is counted under §B25. **§B12/§B24 crypto & secrets:** JWT `aud`/`iss` claim validation (not just `alg`), TLS validation bypass (`danger_accept_invalid_certs` → MITM, CWE-295), KDF salt misuse + OWASP-floor Argon2/PBKDF2 params, zeroize defeated by moves/realloc, `rsa`/Marvin advisory selection; §B24 widened from `==`-timing to secret-dependent side channels (a decrypt-failure oracle collapses to one opaque error, with a §C2↔§B24 carve-out). **§B5/§B25/new §B25a FFI/unsafe:** the C library's own thread-safety contract (the §B18 per-handle-lock fix masks it — CVE-2020-26235), callback-context UAF, exported `#[no_mangle]` entry points trusting the type system, `union` field reads. **§B7/§B20 deserialization DoS:** decompression bombs (capping compressed input doesn't cap output), recursion bombs inside a parser's AST (`from_value` bypasses serde_json's depth limit), the `flatten` buffer-everything cliff, `deny_unknown_fields` on untrusted structs. **§B14/§B3a/§B13/§B17 admission-control exhaustion:** unbounded task/connection admission (`Arc<Semaphore>` before spawn), accept-error classification, insert-only unbounded caches, retry-storm jitter, `RwLock` reentrant-read deadlock. **§A1 supply-chain lifecycle:** yanked-version handling under `--locked`, network access in your own `build.rs`, unpinned `[patch]`/git overrides. **PATCH** bump (bullets/documentation + one lettered sub-category with unchanged numbered count, per the §B18a/§C1a v0.3.2 precedent). See [`CHANGELOG.md`](CHANGELOG.md).
**v0.4.6 — §B5 padding-byte info-leak on serialize (2026-07-07).** One bullet-pair, no new categories (still **58**): the write-direction dual of §B5's read rule — turning a struct into `&[u8]` by a raw cast (`from_raw_parts(&t as *const _ as *const u8, …)`, `bytes_of`, `transmute`) copies its uninitialized inter-field padding, which is UB to read (miri flags it) *and* leaks stale memory across a trust boundary (Heartbleed-class disclosure). Fix: derive `bytemuck::NoUninit` / `zerocopy::IntoBytes` and let them reject padded types at compile time, or serialize field-by-field. Grounded in CWE-212/908 + miri-assisted LLM audits of real crates. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.5 — substitution catalog + plugin/npm distribution (2026-06-17).** A Tier E appendix in `data-and-types.md`: a pattern → cheaper-representation lookup table (~22 rows, 4 groups — ownership/allocation, lookup/complexity, the hasher ladder, concurrent maps by access shape), every row gated by §E6 measure-first; no new categories (still **58**). Plus two clone-free install paths: the repo is now a Claude Code **plugin + marketplace** (`/plugin marketplace add PHPCraftdream/rust-intel`) and an **npm package** (`npx rust-intel-cc`), published by CI on every release tag. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.4 — §D1a gains the façade fitted to the test (2026-06-15).** One bullet, no new categories (still **58**). A fourth shape under §D1a oracle validity: where the *circular oracle* writes the test from the code, the *façade fitted to the test* writes the code from the test — given the goal "make this test pass," an agent emits the declaration the test probes (a config key, header, status string) without the behavior behind it; tests are green, the feature is absent. Grounded in Chacon 2026, "Grit" (Rust-Git reimplementation, 360k LOC, 99.3% tests green, "not *tested*"). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.3 — siblings of safe-looking primitives (2026-06-15).** Three bullets, no new categories (still **58**): §C2 path-traversal recipe gains a TOCTOU caveat (`canonicalize` + `starts_with` defeats the static symlink, not a racing one — CWE-367; use `openat`+`O_NOFOLLOW` / `cap-std` when the tree is attacker-mutable); §B9 gains `std::thread::scope` as the sync mirror of §B21 (auto-join on the closing brace can deadlock; child panic re-panics the parent); §B16 gains a ReDoS sibling-of-HashDoS bullet (`regex` is linear by construction; `fancy-regex`/`onig`/`pcre2` reintroduce catastrophic backtracking — CWE-1333). Plus a README recall-honesty note (per-rule grounding ≠ measured coverage). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.2 — concurrency/hang/flaky-test patterns (2026-06-14).** Two new numbered categories + a lettered sub-section + three extensions, extracted from real fixes: §B3a (coordinator-loop livelock — release leadership and exit on persistent error), §D4 (filtered test-runner output hides hangs — `pipefail` + nextest SLOW/TIMEOUT), §D5 (Windows LNK1104 from zombie test process, defense-in-depth on top of §D4). Extensions: §B2 (DashMap `Ref` across `.await` is an invisible shard lock), §B21 (periodic task must hold `Weak`, not `Arc`), §D1 (`interval` + `start_paused` tick discipline). **56 → 58 categories.** See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.1 — Tier F semantic conformance (2026-06-10).** Added Tier F (§F1–§F4): defects of *meaning* — code that compiles, passes tests, implements the wrong thing. Plus §D1a (oracle validity) and §D3 (test/prod divergence). **51 → 56 categories, 5 → 6 tiers (A–F).** See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.0 — fan-out audit workflow (2026-06-10).** Shipped `audit-project.workflow.js` — one agent per module, async split into two, runtime slicing of trigger tables (zero duplication), structured findings schema, synthesized `/rust-cc-audit` report. Module headers enriched with tier badges + audit semantics. `audit.md` gains fan-out-preferred note. Installers deliver the workflow. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.3 — accuracy pass (2026-06-10).** Factual/dating fixes (F1–F4): `clippy::await_holding_lock` group history corrected, MSRV 1.84→1.85, §C7 resolver v1/v2 qualification, `never_type_fallback` dating 1.92→1.85. Three minor clarifications (§B2, §B9, §B12, §B15a). No category changes (still **51**). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.2 — four content additions (2026-06-09).** From a study of Microsoft's *Rust Patterns & Engineering How-Tos*: §C1a (`#[non_exhaustive]` producer-side semver rule, 🟡), §B18a (variance/`PhantomData` soundness in raw-pointer wrappers, 🔴), expanded §B4 (memory-vs-resource `Drop` at exit, recursive `Drop` stack overflow, drop-order shutdown deadlock), and §B5 (unsafe→safe boundary principle: value-invariant guards vs relational invariants). Still **51** categories (sub-sections counted under parent). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.1 — structural repackaging (2026-05-31).** The single-file spec is now a **modular skill**: `SKILL.md` (core — protocols, enforcement tiers, the trigger table, and a category→module map) plus nine theme modules under `skill/` holding the category bodies. No rule or category changes (still **51**) — content is byte-complete vs 0.3.0. `SKILL.md` also tells the agent to run a full audit/review by **fanning out one sub-agent per module** (via a workflow) instead of holding all categories in one context. Installers ship the modules; the single-file reference is retired (kept in git history). See [`CHANGELOG.md`](CHANGELOG.md).

**v0.3.0 — content release (2026-05-29).** The first tagged release since 0.2.2 — it collapses all interim work (drafted under provisional 0.3.x / 0.4.0 labels, never tagged) into one version. The spec was reframed to cover only bugs that compile and pass tests but still break, then grown from **26 to 51 categories** across **five tiers (A–E)**: silent correctness bugs (async cancellation, `Mutex`-across-`.await`, UB, TOCTOU, crypto, FFI, lossy numeric/`as`-casts, wall-clock vs monotonic, UTF-8 boundaries, iterator/slice adapter traps), architecture/ergonomics, testing/CI gaps, and a top-level **Tier E — Systemic cost** (latency, allocation, complexity, contention; enforced 🟡/🟢, never 🔴). Includes an external multi-agent review pass — evidence-base accuracy fixes, build-time supply-chain coverage (§A1), and anti-dogmatism calibration. Slash commands unchanged. See [`CHANGELOG.md`](CHANGELOG.md) for full notes.

## Layout

```
rust-intel/
├── .claude-plugin/                     # Claude Code plugin + marketplace manifests
│   ├── plugin.json                     # Plugin manifest (skills/commands paths, version)
│   └── marketplace.json                # This repo is its own marketplace (/plugin marketplace add PHPCraftdream/rust-intel)
├── skill/                              # The skill (this is what installs) — modular
│   ├── SKILL.md                        # Core: protocols, enforcement tiers, trigger table, category→module map
│   ├── <theme>.md                      # Theme modules (async, unsafe-and-ffi, security, … — the category bodies)
│   ├── references/sources.md           # The evidence base — ships inside the skill
│   └── audit-project.workflow.js       # Fan-out project audit (one agent per module)
├── skills/rust-intel/                  # DERIVED mirror of skill/ — Codex needs a skills/<name>/ layout.
│                                       # Never edit by hand: run `npm run sync` (dev/sync-mirror.mjs); CI enforces byte-identity.
├── .codex-plugin/plugin.json           # Codex plugin manifest (points at skills/rust-intel/)
├── bin/install.js                      # npx installer (npm package: rust-intel-cc)
├── bin/install-codex.js                # Codex user-skill installer (rust-intel-codex)
├── package.json                        # npm package manifest (published on release tags by CI)
├── .github/workflows/npm-publish.yml   # Publishes rust-intel-cc to npm on every v* tag
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

### Install — three ways

#### 1. Claude Code plugin (recommended — one command, auto-updates)

Inside any Claude Code session:

```
/plugin marketplace add PHPCraftdream/rust-intel
/plugin install rust-intel@rust-intel
```

That's it — no clone, cross-platform, and updates arrive via `/plugin` (or `claude plugin update rust-intel`). The plugin ships the skill (auto-activates on Rust tasks) plus the commands under the plugin namespace: `/rust-intel:audit`, `/rust-intel:fix`, `/rust-intel:plan`.

#### 2. npx (no clone, flat `/rust-cc-*` command names)

```bash
npx rust-intel-cc                # project-local: ./.claude/
npx rust-intel-cc --user        # user-global:   ~/.claude/
npx rust-intel-cc --uninstall   # inverse (add --user for global)
```

Same layout as the shell installers below: skill in `<target>/skills/rust-intel/`, commands flattened to `/rust-cc-audit`, `/rust-cc-fix`, `/rust-cc-plan`. Published to npm automatically on every release tag.

#### 3. Shell installers (from a clone; `--symlink` for development)

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

`CLAUDE_CONFIG_DIR` affects the npx installer only when `--user` is passed; without `--user`, npx always targets the current project's `./.claude/`. The shell installers always honor `CLAUDE_CONFIG_DIR` when it is set, overriding their default and `--user`/`-User` target.

The installer copies:
- `skill/**/*.{md,js}` → `<target>/skills/rust-intel/` (the modular skill, including `references/`; Claude Code activates it automatically on Rust tasks)
- `commands/rust-intel-cc/{audit,fix,plan}.md` → `<target>/commands/rust-cc-{audit,fix,plan}.md` (the three slash commands; installer flattens with a `rust-cc-` prefix on copy)

It also sweeps any prior install at the same target — including the legacy v0.1.x flat layout (`commands/rust-audit.md`, `commands/rust-fix.md`, `commands/rust-plan.md`, and the very early `commands/rust-intel.md`) — so re-running it cleanly migrates from any older version.

### Codex installation

The repository also exposes a Codex plugin manifest at `.codex-plugin/plugin.json`. For a direct local user-skill install, run:

```powershell
node bin/install-codex.js                 # $env:CODEX_HOME\skills\rust-intel, or ~/.agents/skills/rust-intel
node bin/install-codex.js --user-dir D:\Users\me\.agents\skills
node bin/install-codex.js --uninstall
```

The npm package exposes the same command as `rust-intel-codex`. Start a new Codex thread after installation so the updated skill is loaded. If you use a Codex marketplace, add this repository as a local plugin source; no marketplace file is modified by the installer.

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

### Verify Claude Code

Start `claude` inside the directory you installed to (or anywhere if you used `--user`), ask for any Rust task, and the assistant should reference rules from §A1–§F4 unprompted. Try:

```
/rust-cc-audit src/
/rust-cc-fix  E0277: the trait bound `T: Send` is not satisfied
/rust-cc-plan write a tokio task that consumes a sqlx stream and pushes to a websocket
```

### Verify Codex

Start a new Codex thread after installation. Use `/skills` to confirm that `rust-intel` is listed, then mention `$rust-intel` in a Rust request to activate it (see the [official Codex skills documentation](https://developers.openai.com/codex/skills)). The Codex installer installs the `rust-intel` skill only; it does not install Claude Code's `/rust-cc-audit`, `/rust-cc-fix`, or `/rust-cc-plan` commands.

### As a checklist for humans

The document reads top-to-bottom. The minimum bar before committing any non-trivial Rust: walk the **Pre-flight checklist** (9 questions at the end of the spec) and the **Post-flight checklist** (the list of things to surface in a summary).

### Commands

Three commands live under [`commands/rust-intel-cc/`](commands/rust-intel-cc/) and share a single source of truth — the skill itself, never a copy:

| Command | Trigger | Use case |
|---|---|---|
| [`audit`](commands/rust-intel-cc/audit.md) | `/rust-cc-audit [path]` | Scan existing Rust against all categories from the spec, return a triaged report with concrete fixes. |
| [`fix`](commands/rust-intel-cc/fix.md) | `/rust-cc-fix <error>` | Map a compiler / clippy / panic / runtime symptom onto a category, propose a root-cause fix. |
| [`plan`](commands/rust-intel-cc/plan.md) | `/rust-cc-plan <task>` | Run a task description through the trigger table and Pre-flight checklist before any code is written. |

Details: [`commands/README.md`](commands/README.md).

## Spec architecture

Six tiers plus a meta-layer:

| Tier | Coverage | Categories |
|---|---|---|
| Self-monitoring | Prompt-trigger table (phrase- *and* code-pattern-based) → activates relevant categories | top of spec |
| **Tier A** | Compile-fix reflexes that leave silent residue — the LLM "fixes" the red squiggle in a way that compiles while leaving a real defect behind | §A1–§A3 |
| **Tier B** | Silent correctness bugs, caught only in production | §B1–§B29 |
| **Tier C** | Architecture and ergonomics, expensive to undo | §C1–§C12 |
| **Tier D** | Testing and CI gaps — tests pass not because the code is correct but because the tests are blind | §D1–§D5 |
| **Tier E** | Systemic cost (performance / scale / contention) — correct in the small, wrong at scale — cost that survives correctness; enforced 🟡/🟢, never 🔴 | §E1–§E6 |
| **Tier F** | Semantic conformance — defects of *meaning*: spec/reference divergence, violated documented guarantees, boundary/error-path resource lifecycle, missing round-trip obligations. Found by reading the *claim*, not by pattern-matching | §F1–§F4 |

The A/B/C/D/F tiers classify *what kind* of bug a category targets. Orthogonally, the spec's **Enforcement tiers** (🔴 surface-always / may block · 🟡 apply silently while writing · 🟢 delegate to clippy) say *how strictly* to act on each — so a post-flight summary stays short and every line is worth acting on, instead of flagging every cast and clone. See the "Enforcement tiers" section in the spec.

A Tier A category for trait bounds / type mismatches (E0277/E0308) was present in earlier drafts and retired in v0.3.0: compile-only failures are out of scope, the compiler is sufficient. The remaining Tier A categories were renumbered to close the gap.

Tier B is the centre of the spec: silent correctness bugs that survive `rustc`, `clippy`, and `cargo test`. Each category cites a published study, production incident, or systematically observed LLM output pattern.

## Principles for evolving the spec

1. **Every category must be grounded.** No rule lands without one of (a) a published study with numbers, (b) a documented production incident, or (c) a systematically observed LLM output pattern.
2. **The spec defends against LLMs, not humans.** Categories where LLMs don't err more often than humans don't belong here — that's just Rust style.
3. **Proof before rule.** If a category lacks a sharp BANNED/REQUIRED formulation, it stays in the roadmap, not the main spec.
4. **Sources are transparent.** Every number in the spec maps to an entry in the shipped [evidence base](skill/references/sources.md).

## Contributing

See [`docs/roadmap.md`](docs/roadmap.md) for open directions. A new category is accepted if it meets the principles above and ships with a source.

## License

Dual-licensed under either **MIT** ([`LICENSE-MIT`](LICENSE-MIT)) or **Apache License 2.0** ([`LICENSE-APACHE`](LICENSE-APACHE)), at your option — the standard Rust-ecosystem convention. SPDX-License-Identifier: `MIT OR Apache-2.0`.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual-licensed as above, without any additional terms or conditions.
