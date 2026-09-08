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

Repository tooling and the published npm package require Node.js 24 or newer. Both JavaScript
installers and both validator entry points enforce this floor at process startup; the
`package.json` `engines` entry is package metadata, while the startup check is the hard runtime
guard. CI tests both the current Node 24 line and the exact `24.0.0` floor.

## Validator contract

`dev/validate.mjs` is deliberately a repository validator, not a general CommonMark/GFM parser.
Its supported Markdown surface is explicit:

- It recognizes exactly two global, top-level trigger-table anchors: `User request contains... | Activates category | Specific risk` and `Code pattern in user input | Activates`.
- Each anchor has a canonical end/scaffold boundary (`**Triggered by code, not phrase**` or `When two or more triggers fire in one request`); raw column-1 leading pipes, declared widths, and a nonempty body are required. The scaffold continues through the `Category map`, whose module/category parity is checked.
- Duplicate keys are the sorted set of inline-code tokens in a code-pattern row; ordinary emphasis, strong emphasis, and strikethrough remain allowed text, while prose-only rows (with no inline code) are not deduplicated. Any raw `<` outside inline code in a code-pattern row's first cell is unsupported and rejected explicitly (including raw-HTML/autolink-like syntax); bracketed link/image/reference-like syntax and a broad repository-style URI/email-like token ban outside inline code are also rejected. This is a documented repository subset, not an exact GFM claim.
- In trigger-table cells, the repository convention treats a pipe preceded by an odd number of backslashes as escaped content; an even number leaves the pipe as a column separator. This parity convention is explicit repository policy, not a claim about GFM/cmark-gfm behavior.
- Project fences are standalone and allow 0–3 leading spaces. Container-prefixed fences and angle-leading raw-HTML-style lines are rejected explicitly.
- Workflow metadata is declarative and frozen: `MODULES` and `AUDIT_UNITS` must be direct `deepFreezeRecords([...])` initializers. Inline consumption of those arrays and primitive `.length` bindings are supported in dot/bracket form, with or without full parentheses. The static direct-use and mutation contract is intentionally limited to literal, unescaped `MODULES`/`AUDIT_UNITS` references and literal property/index and mutator names. Within that scope, direct RHS-leading reference aliases, destructuring of either root array or its nested arrays, and bindings of `.map()`/`.filter()` results are unsupported and rejected: a derived array may retain frozen-record references in its descendants, so bounded static scope analysis cannot prove that the frozen graph is no longer reachable. The validator statically rejects direct or bound reference aliases, direct property/index mutations, bracket mutators, and mutation written through parenthesized, update, or compound-assignment forms. Escaped spellings are a runtime-only boundary: escaped `IdentifierName` forms in dotted access (including `\uXXXX` and `\u{...}`) and escape sequences inside quoted bracket keys are not statically modeled; indirect record provenance through `at`/`find`, `for...of` variables, and callbacks is likewise not modeled. `deepFreeze` remains the runtime fail-fast backstop. This contract does not claim that all mutations are statically rejected. Workflow code should use explicit loops that project only the primitive values it needs.

## Status

**Unreleased (in preparation, not tagged).** The current tree is pre-bump: manifests and the release banner remain `v0.6.0`, while the next package release is planned as **MINOR `0.7.0`**. Repository tooling requires Node.js 24 or newer; the current Node 24 and exact `24.0.0` CI definitions are present, but no current-head CI result is claimed here.

The validator fixture suite currently has **494** controls. Of these, **419** spawn child processes (**390** validator-entrypoint and **29** focused lexer/helper children), and **75** run in-process; the fixture registry machine-checks that split against the spawns it actually routes. Focused children return structured semantic observations that the parent judges against each control's expected outcome. The separate `dev/test-installer-recovery.mjs` matrix covers installer interruption/restart behavior. The bounded JavaScript scanner rejects mismatched delimiters, preserves private-name roles, tracks class-body roles across brace-bearing `extends` expressions, and handles ordinary, static, private, computed, string, and numeric class-field names. The round-42 partial fixes (`ef20ca5`, `14a672a`, `49dd4f0`) add the latter field-name coverage, parameterized `pwsh`/`powershell.exe` recovery plus Windows validator lanes, and — in `49dd4f0` — the sequential core/fixture coordinator (`dev/validate-all.mjs`) and its then shared semantic oracle (`dev/validate-lexer-observations.mjs`; retired and deleted by the round-47 anti-vacuity gate rebuild — see `CHANGELOG.md`). The ordinary Windows coordinator has passed, and the earlier `0xC0000409` fixture fault has not reproduced, in three runs against `49dd4f0` (the round-43 reviewed head, 484 controls) on Node v24.12.0 / Windows 10.0.19045: two ordinary `npm run validate` coordinator runs (276.451 s, 285.209 s) and one progress-instrumented fixture-only run (246.310 s, 484/484 controls, last live control 460), all exit 0. Those runs predate the round-43, round-44, and round-45 fixing passes, so no measurement exists at any fixing state's committed tree except the round-44 fixing run recorded in the CHANGELOG — taken before that pass's final documentation edits, so the measured tree differs from the committed one in exactly the files edited afterwards (368 s, exit 0, 486/486 controls, same host) — and the round-45 fixing run recorded in the CHANGELOG (344 s, exit 0, 490/490 controls, same host; measured at that pass's tree with every code and documentation fix in place except the insertion of its own figures). This is non-reproduction evidence only, not a demonstrated fix, and independent review and exact-head CI remain required.

Release readiness still requires clean ordinary validation, the complete same/cross recovery matrix, independent HS review, and exact-head CI. The documented Windows contract is process interruption, not sudden-power-loss durability; no closure, version bump, tag, push, or publication is claimed.

**v0.6.0 (2026-08-19).** Added §C12/§C12a and related §A1 default-of-an-earlier-era coverage; numbered categories reached **59**. This entry backfills the release's omitted Status record. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.5.3 (2026-08-19).** Added `cargo-semver-checks` to Post-flight and corrected its scope boundary. No category change; **58** categories.

**v0.5.2 (2026-08-14).** Added evidence labels and unreachable-match reporting to audit outputs, with schema and report-contract validation. No category change; **58** categories.

**v0.5.1 (2026-08-14).** Corrected performance-gate guidance to use deterministic counters for failures and wall-clock measurements as trends. No category change; **58** categories.

**v0.5.0 (2026-08-08).** Added the Codex distribution channel and installer, moved the evidence base inside the skill, corrected the B5/B12/B20/C1 rules, and improved fan-out artifact tracking. Numbered categories remained **58**. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.7 (2026-07-09).** Closed a five-audit gap cluster across crypto, FFI/unsafe, deserialization, concurrency, and supply chain, including lettered B25a. Numbered categories remained **58**. See [`CHANGELOG.md`](CHANGELOG.md).

**v0.4.6 (2026-07-07).** Added the B5 padding-byte information-leak rule for raw serialization. No category change; **58** categories.

**v0.4.5 (2026-07-05).** Added the Tier E substitution catalog and Claude Code plugin/marketplace plus npm distribution. Numbered categories remained **58**.

**v0.4.4 (2026-06-15).** Added the D1a "facade fitted to the test" semantic-conformance pattern. No category change; **58** categories.

**v0.4.3 (2026-06-15).** Added TOCTOU, scoped-thread, and ReDoS precision coverage plus the recall-honesty note. Numbered categories remained **58**.

**v0.4.2 (2026-06-14).** Added B3a coordinator livelock and D4/D5 hang and test-runner coverage, plus related extensions. Categories grew from **56** to **58**.

**v0.4.1 (2026-06-10).** Added Tier F semantic conformance, D1a oracle validity, and D3 test/production divergence. Categories grew from **51** to **56**.

**v0.4.0 (2026-06-10).** Added the fan-out audit workflow, structured findings, runtime table slicing, and enriched module headers. Numbered categories remained **51**.

**v0.3.3 (2026-06-10).** Accuracy pass covering lint history, MSRV, resolver qualification, and related clarifications. Numbered categories remained **51**.

**v0.3.2 (2026-06-09).** Added the non-exhaustive producer rule, PhantomData variance guidance, Drop-at-exit coverage, and unsafe-to-safe boundary guidance. Numbered categories remained **51**.

**v0.3.1 (2026-05-31).** Repackaged the single-file specification as a modular skill with theme modules and references, and documented the fan-out review protocol. Numbered categories remained **51**.

**v0.3.0 (2026-05-29).** Reframed the specification around silent failures that compile and pass tests, expanding coverage from **26** to **51** categories across five tiers.

## Layout

The `dev/` utilities include `validate-all.mjs`, the isolated core-plus-fixture coordinator,
`snapshot-install.mjs`, a byte-aware installer inventory used by rollback and recovery checks,
`validate-lexer-probes.mjs`, the focused child-process probes used by resource-heavy lexer controls,
and `test-installer-recovery.mjs`, the separate generated boundary matrix for installer
interruption/restart behavior. Set `RUST_INTEL_POWERSHELL_EXECUTABLE` to
select the PowerShell runtime used by the helper (`pwsh` by default; `powershell.exe` exercises
the Windows PowerShell 5.1 surface used by the `.bat` wrappers). `npm run validate` runs `dev/validate-all.mjs`, which executes the core validator and the fixture suite as sequential sibling Node processes. The core phase runs with `RUST_INTEL_SKIP_NESTED_FIXTURES=1`; setting that variable yourself runs `dev/validate.mjs` without its nested fixture suite. `RUST_INTEL_VALIDATE_TIMEOUT_MS` caps each coordinator phase in milliseconds (default 20 minutes; a malformed value is a hard error), and the CI lanes that run the coordinator pin their job timeouts above two per-phase defaults plus setup margin so a hung phase is attributed by the coordinator's own ETIMEDOUT diagnostic rather than cut off by an opaque job cancellation. The recovery helper's current-Bash and Node results include
same- and cross-operation execution evidence; cross-operation cases use a clean opposite-operation
expected side plus a subject-only corruption calibration. These results do not by themselves
establish failed-list propagation, timeout coverage, or the full Bash 3.2/PowerShell runtime
contract. Focused lexer children return JSON containing the control ID and a semantic observation; the parent validates it against a behavioral differential — the same child run against a temp-tree copy of the repository whose `dev/js-lexer.mjs` carries a run-time-chosen mutation (or none), so the child's byte-identical source text proves nothing and only genuinely executing the mutated lexer can satisfy the expectation.

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
├── bin/install-transaction.js           # Shared transactional installer engine
├── bin/install-codex.js                # Codex user-skill installer (rust-intel-codex)
├── bin/node-version.js                 # Shared Node.js floor guard
├── package.json                        # npm package manifest (published on release tags by CI)
├── dev/                                # Validation, mirror, release, and review utilities
│   ├── validate-all.mjs                # Isolated core + fixture validation coordinator
│   ├── validate.mjs                    # Repository validator; runs the fixture suite unless RUST_INTEL_SKIP_NESTED_FIXTURES=1
│   ├── validate-fixtures.mjs           # Fixture-control runner
│   ├── validate-lexer-probes.mjs        # Focused child-process lexer probes
│   ├── sync-mirror.mjs                 # Canonical skill -> Codex mirror sync/check
│   ├── set-release-version.mjs         # Update package and plugin manifest versions
│   ├── calibrate-release-version.mjs    # Crash/recovery calibration for release transactions
│   ├── snapshot-install.mjs             # Byte-aware installer inventory for rollback checks
│   ├── test-installer-recovery.mjs      # Separate interruption/restart matrix helper (not numbered fixture controls)
│   ├── js-lexer.mjs                     # Shared bounded JavaScript lexical scanner
│   ├── check-release-version.mjs       # Verify a release tag matches all manifests
│   ├── semver.mjs                      # Shared version parsing/comparison helpers
│   └── review-modules.workflow.js      # Fan-out review workflow helper
├── .github/workflows/npm-publish.yml   # Publishes rust-intel-cc to npm on every v* tag
├── .github/workflows/ci.yml            # Repository validation and Node floor checks
├── README.md                           # This file
├── CHANGELOG.md                        # Version history
├── .gitattributes                      # Line-ending rules (LF for source, CRLF for .ps1/.bat)
├── .gitignore                          # Ignores /.claude/ (project-local install target) and target/
├── rust-cc-install.sh / rust-cc-install.ps1 / rust-cc-install.bat       # One-command install (project-local by default; --user for global)
├── rust-cc-uninstall.sh / rust-cc-uninstall.ps1 / rust-cc-uninstall.bat # Inverse of install
├── examples/
│   ├── README.md                       # Fixture calibration notes
│   └── fixtures/
│       ├── cases.json                  # Positive/negative fixture inputs
│       ├── positive.rs                 # Rust examples expected to pass
│       └── negative.rs                 # Rust examples expected to be flagged
├── commands/
│   ├── README.md
│   └── rust-intel-cc/                  # Repo umbrella dir (installer flattens to /rust-cc-* commands)
│       ├── audit.md                    # /rust-cc-audit  — scan existing code
│       ├── fix.md                      # /rust-cc-fix    — diagnose an error
│       └── plan.md                     # /rust-cc-plan   — pre-flight a new task
└── docs/
    ├── roadmap.md                      # Roadmap: open directions and structural notes
    ├── sources.md                      # Empirical sources and citations
    └── reviews/                        # Review reports and the correction ledger
        └── README.md
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

## Maintaining

### Release checklist

The Node.js floor raise from 16.7.0 to 24.0.0 removes a previously supported runtime in the 0.x
series, so the next release is a **MINOR `0.7.0`**, not a patch. Record that decision before starting
the release; routine reviews must not change the version or release notes implicitly.

1. Decide and record the bump level; for the Node-floor release, use `0.7.0`.
2. Run `node dev/set-release-version.mjs <version>` and review the three manifest changes.
   Run `node dev/calibrate-release-version.mjs` to exercise abrupt-exit recovery at every journal
   and rename boundary, requiring the hook's exact child status `86`, plus a nonexistent-boundary
   normal-completion negative control, injected failures after replacements 1–3, and cleanup against
   temporary known-good copies. If a release process is interrupted, `node dev/set-release-version.mjs --recover`
   performs recovery without changing versions.
3. Update the README version banner, keeping the exact validator-pinned sentence `Numbered categories now **N**`, and add the release's entry to **Status**. When cutting the release, remove or replace the point-in-time `Unreleased (in preparation, not tagged)` paragraph so it cannot remain beside the released entry. Retain and verify the existing `v0.6.0 (2026-08-19)` entry, add the new `v0.7.0` entry above it, keep entries in reverse chronological order, and put a blank line between every entry.
4. In `CHANGELOG.md`, insert a fresh empty `## [Unreleased]` section above the release, then move the current Unreleased body under `## [0.7.0] — <release-date>` (or the selected version/date). Re-check the fixture-control count against the header in `dev/validate-fixtures.mjs` (currently **494**) and update the changelog's count if it changed; rewrite the planned-bump sentence in past tense (for example, `This release is \`0.7.0\` (MINOR) because ...`) rather than shipping an imperative instruction.
5. Run the repository checks: `npm run validate`, `npm pack --dry-run`, the mirror check, and the
   release-version check (`node dev/check-release-version.mjs <version>`).
6. Commit the release changes with a descriptive message.
7. Push the release commit to `main` and wait for the `validate` workflow on that exact release SHA
   to finish successfully:

   ```bash
   git push origin main
   ```

8. After `validate` is green on the release SHA, create and push the release tag:

   ```bash
   git tag -a v<version> -m "Release v<version>"
   git push origin v<version>
   ```

9. Confirm the tag-triggered validation and npm publish workflows completed successfully.

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
