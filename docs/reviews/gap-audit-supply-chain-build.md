# Gap audit — supply-chain, build scripts, macro-hygiene attack surface

Scope: what is MISSING from §A1 (`skill/deps-macros-ergonomics.md`), §C5–§C11, the SKILL.md
"Version pins" section, and `docs/sources.md` in the supply-chain / build-time / macro-trust
area. Method: read the exact existing bullet text first, then web-verify each candidate
against a citable primary source. Candidates that turned out already covered are listed in
the verdict, not as entries. No repo files were edited.

What §A1 ALREADY covers (checked against actual text, not headers): slopsquatting /
typosquatting with named incidents (CrateDepression 2022, `faster_log`/`async_println` 2025);
the build-time-execution vector itself ("a crate's `build.rs` and any proc-macro it exports
run arbitrary code ... during `cargo build`"); dependency confusion ("a private crate name
shadowed by a public one on a default registry"); the mitigation stack "pin exact versions
and commit `Cargo.lock` ... lean on `cargo-deny` / `cargo-audit` (RustSec advisory DB),
`cargo-vet` ..., `--locked`/vendored builds"; and skimming `build.rs`/proc-macro of a new
direct dep before first build. §C10/§C7 already own feature unification incl. the
dev-dependency leak (resolver v1 vs v2) and the cargo#2524 target-feature gotcha.

---

## Gap 1 — Yanked-crate handling: `--locked` builds a yanked (possibly advisory-flagged) version silently

**Why in-scope.** Compiles, tests green, CI green — the defect is invisible until the day the
lockfile is regenerated (then the build breaks with "no compatible versions") or until the
yank reason turns out to be a security advisory the project kept building against for months.
An LLM asked to "fix the CI dependency error" will reflexively run `cargo update` (silently
swapping many versions) or loosen the version req — the cheapest fix that compiles, classic
Tier A residue.

**Why not covered.** Grep for `yank` across `skill/` and `docs/sources.md`: zero hits. §A1's
lockfile bullet says commit `Cargo.lock` and use `--locked`, but never states the yank
semantics: a yanked version stays downloadable, an existing `Cargo.lock` keeps resolving it,
and `cargo build --locked` emits only a *warning* ("package `log v0.4.24` in Cargo.lock is
yanked ... consider running without --locked"), never an error. Only fresh resolution refuses
it.

**Minimal compiles-but-dangerous shape.**
```toml
# Cargo.lock (committed) pins log 0.4.24 — later yanked upstream for a soundness bug.
# `cargo build --locked` in CI: warning only, exit 0, green forever.
# New contributor / fresh `cargo install`: hard failure — "candidate versions ... were yanked".
```
The mitigable pattern worth a REQUIRED bullet: `cargo deny check advisories` (config has an
explicit yanked-crate check) or `cargo audit -D warnings` in CI turns the silent warning into
a red build with a stated reason; the fix is a *targeted* `cargo update -p <crate>`, never a
blanket `cargo update`.

**Sources.** Cargo Book, `cargo yank` — yank "will not delete any data", existing lockfiles
still resolve it: <https://doc.rust-lang.org/cargo/commands/cargo-yank.html>; cargo-audit
yanked-crate detection (Inside Rust blog):
<https://blog.rust-lang.org/inside-rust/2020/01/23/Introducing-cargo-audit-fix-and-more/>;
cargo-deny advisories config (yanked check):
<https://embarkstudios.github.io/cargo-deny/checks/advisories/cfg.html>; observed `--locked`
warning-not-error behavior: <https://github.com/starship/starship/issues/6494>.

**Severity.** 🟡 (write-time/CI discipline; escalates to 🔴 only when the yank reason is a
RUSTSEC advisory — which the existing §A1 🔴 "unverified dependency" umbrella then owns).

**Placement.** New bullet inside §A1's "Build-time code execution" defense paragraph, or a
short sibling paragraph "Lockfile hygiene and yanked versions" in §A1.

---

## Gap 2 — `build.rs` that reaches the network at build time (non-hermetic build)

**Why in-scope.** The canonical LLM move when a crate needs `protoc`, a model file, a C
library, or a schema: emit a `build.rs` that shells out to `curl`/`git clone` or uses
`reqwest::blocking` to fetch it. It compiles, tests pass on the author's machine, and it
breaks (or is silently substituted) in production CI: offline/vendored builds fail,
`--locked` gives no integrity protection (the download is outside Cargo's hash-verified
graph), the fetched artifact can change or be MITM'd between builds, and reproducibility is
gone. This is a distinct shape from Gap 1 in §A1's existing text: not *whose code runs at
build time*, but *unpinned bytes entering the build outside the lockfile*.

**Why not covered.** §A1's build-time paragraph covers a malicious dependency's `build.rs`
reading secrets; nothing in §A1/§C7/§C10 bans or gates *writing* a network-touching
`build.rs` yourself, and no bullet mentions hermeticity, `--offline`/`cargo vendor`
compatibility, or hash-pinning downloaded artifacts. The Cargo Book itself only has
conventions (write only to `OUT_DIR`), not enforcement — sandboxing of build scripts is an
open, unimplemented proposal (cargo#5720, open since 2018).

**Minimal compiles-but-dangerous shape.**
```rust
// build.rs — compiles, works on the dev box, green tests
fn main() {
    let out = std::env::var("OUT_DIR").unwrap();
    std::process::Command::new("curl")
        .args(["-L", "https://example.com/latest/schema.fbs", "-o", &format!("{out}/schema.fbs")])
        .status().unwrap();          // unpinned URL, no checksum, no offline path
}
```
REQUIRED-shaped fix: no network in `build.rs` — vendor the artifact into the repo or fetch it
in a separate, explicit CI step with a pinned checksum; if a build-time download is truly
unavoidable, verify a hardcoded SHA-256 and provide an offline fallback so `cargo build
--offline` / `cargo vendor` still work.

**Sources.** Cargo Book, Build Scripts (arbitrary code, `OUT_DIR` convention only):
<https://doc.rust-lang.org/cargo/reference/build-scripts.html>; cargo sandboxing proposal,
open/needs-RFC: <https://github.com/rust-lang/cargo/issues/5720>; reproducible-builds
rationale (unpinned build-time inputs break verifiability):
<https://reproducible-builds.org/>.

**Severity.** 🟡 (supply-chain integrity + CI breakage; 🔴 if the downloaded artifact is
executed at build time — that collapses into §A1's existing 🔴).

**Placement.** New bullet(s) in §A1's "Build-time code execution" paragraph — it is the
write-side twin of the existing read-side (malicious dep) coverage. A trigger-table row for
SKILL.md fits: "download in build.rs", "fetch protoc/schema at build time" → §A1.

---

## Gap 3 — `[patch]` / git dependencies without a pinned `rev` (unverified, moving upstream)

**Why in-scope.** The LLM reflex for "the bug is fixed upstream but unreleased" or "use my
fork" is `[patch.crates-io] foo = { git = "https://github.com/someone/foo" }`. It compiles
and tests green *today*. A git dependency without `rev` (or with only `branch`) follows the
remote HEAD: the effective source can change under you on the next lockfile refresh, the fork
owner (or an account takeover — cf. the compromised `onering` crate, an account-level
compromise on crates.io itself) can push anything, and none of the §A1 mitigations apply —
RustSec advisories, `cargo audit`, and `cargo vet` key on registry versions, so a git/patch
override walks *around* the entire audit stack §A1 prescribes. Also semver-silent: `[patch]`
in the workspace root applies to the whole graph, including transitive users of `foo`.

**Why not covered.** Grep for `\[patch\]`, `git =`, `rev` (dependency sense) across `skill/`:
zero hits. §A1's BANNED list covers adding an *unverified crate name*; it says nothing about
an unverified *source* for a known-good name — which is the same trust decision with a
better disguise ("it's still `serde`, just my fork").

**Minimal compiles-but-dangerous shape.**
```toml
[patch.crates-io]
tokio = { git = "https://github.com/rando/tokio", branch = "fix-timeout" }  # no rev pin
# Whole workspace now compiles rando's HEAD-of-branch instead of the audited registry crate;
# cargo audit / cargo vet no longer see it; next `cargo update` pulls whatever HEAD is then.
```
REQUIRED-shaped fix: any `[patch]`/git dependency names a full-commit `rev`, points at a repo
the user explicitly named, is flagged in the post-flight summary exactly like a new
dependency (§A1 🔴 protocol), and carries a removal condition ("until foo 1.2.4 releases").

**Sources.** Cargo Book, Overriding Dependencies (`[patch]` semantics, applies graph-wide):
<https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html>; Cargo Book,
Specifying Dependencies from git (branch/rev resolution; crates.io rejects git deps in
published crates): <https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#specifying-dependencies-from-git-repositories>;
account-compromise incident class: compromised `onering` crate (Aikido, 2026):
<https://www.aikido.dev/blog/compromised-rust-crate-onering-performs-code-exfiltration>.

**Severity.** 🔴 for an unpinned/unnamed-by-user fork (it *is* §A1's "unverified dependency"
in different syntax); 🟡 for a rev-pinned, user-approved temporary patch.

**Placement.** New bullet under §A1's BANNED list + one defense bullet; trigger-table row:
"use my fork", "patch the dependency", "the fix isn't released yet" → §A1.

---

## Gap 4 — Incident base is stale: 2025-12 / 2026 crates.io incidents and the proc-macro trust precedent are uncited

Not a new category — a grounding gap against the spec's own acceptance rule ("every category
ships with a source") and its claim of covering "real supply-chain incidents".

**What's missing from `docs/sources.md`** (currently ends at `faster_log`/`async_println`,
2025-09):
- `evm-units` / `uniswap-utils` (crates.io advisory, 2025-12-03):
  <https://blog.rust-lang.org/2025/12/03/crates.io-malicious-crates-evm-units-and-uniswap-utils/>
- `finch-rust` / `sha-rust` (crates.io advisory, 2025-12-05):
  <https://blog.rust-lang.org/2025/12/05/crates.io-malicious-crates-finch-rust-and-sha-rust/>
- crates.io malicious-crate notification-policy update (2026-02-13) — official
  acknowledgment that takedowns are now routine:
  <https://blog.rust-lang.org/2026/02/13/crates.io-malicious-crate-update/>
- TrapDoor cross-ecosystem campaign incl. crates.io (2026-05):
  <https://thehackernews.com/2026/05/trapdoor-supply-chain-attack-spreads.html>,
  <https://socket.dev/blog/trapdoor-crypto-stealer-npm-pypi-crates>
- The serde_derive precompiled-binary episode (2023, reverted in v1.0.184) as the canonical
  citation for §A1's proc-macro-trust sentence — currently that sentence has no source at
  all: <https://www.bleepingcomputer.com/news/security/rust-devs-push-back-as-serde-project-ships-precompiled-binaries/>,
  <https://github.com/serde-rs/serde/issues/2538>

**Severity/placement.** Documentation-tier: extend the "Documented incidents" section of
`docs/sources.md` and the §A1 "Real attack cases (2022–2026)" list. No new lettered category.

---

## Verdict

Eight initial candidates; four survived. Killed by the existing text: (1) proc-macros as a
distinct attack vector — §A1's build-time paragraph already names proc-macros alongside
`build.rs`, so only the citation gap (Gap 4) remains; (2) dependency confusion — literally
named in §A1; (3) dev-dependency feature leakage into release builds — §C10 covers it more
precisely (resolver v1 vs v2) than my candidate did; (4) "cargo-vet/cargo-audit/cargo-deny
missing" — all three are already in §A1's defense stack, though as "lean on", not a REQUIRED
CI bullet (the yanked-crate entry, Gap 1, is the piece of that which is genuinely absent and
has a concrete compiles-but-dangerous shape). What survived is exactly the write-side and
lifecycle material §A1 lacks: yank semantics under `--locked`, network in `build.rs`,
unpinned `[patch]`/git overrides that bypass the audit stack, and a stale incident base. All
four are grounded in primary sources (Cargo Book, rust-lang blog advisories, cargo issue
tracker); none required trusting a secondary blog for a load-bearing claim.
