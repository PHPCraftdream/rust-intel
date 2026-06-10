# Sources

The empirical basis for the `rust-intel` skill. Grouped by source type.

> **Discipline:** every numeric figure or categorical claim in the spec must be traceable to an entry below. If a source is missing here, the claim is considered under-grounded and belongs in [`roadmap.md`](roadmap.md), not the main ruleset.

## Academic benchmarks

### RustEvo²
Post-cutoff API drift benchmark for Rust.
- **Source:** arXiv:2503.16922 — <https://arxiv.org/abs/2503.16922>
- **Key figure:** pass@1 drops from **56.1% → 32.5%** on APIs that changed after the model's knowledge cutoff.
- **Used in:** §A1 (API hallucinations), Operating mode step 1 (pin the world).

### SafeTrans
Safety benchmark for Rust transpilation / generation.
- **Source:** arXiv:2505.10708 — <https://arxiv.org/abs/2505.10708>
- **Key figures:**
  - E0277 + E0308 together account for **>18% of all errors** in LLM-generated Rust, up to **30%** for some models.
  - Tier A errors land in 18–30% of generations.
- **Used in:** Tier A intro (compile-failure context). An earlier draft's Tier A category for trait bounds / type mismatches was retired in v0.3.0 as out-of-scope — rustc catches these directly — but the empirical share is preserved here as motivation for the Tier A scope decision. (Note: the §A2 slot was renumbered after retirement; today's §A2 is "Smart pointer misuse" and is unrelated.)

### CRUST-Bench
C→Rust translation benchmark with test coverage.
- **Source:** arXiv:2504.15254 — <https://arxiv.org/abs/2504.15254>
- **Used in:** Tier B context (the gap between "compiles" and "correct"). Also §F1/§D1a premise: the benchmark judges correctness by *reference tests derived from the source C codebase* — an external oracle — precisely because a transpilation validated only against its own understanding can be self-consistent and wrong; that external-oracle design is the methodological basis those categories enforce.

### SafeGenBench
Safety benchmark for generated code, including crypto.
- **Source:** arXiv:2506.05692 — <https://arxiv.org/abs/2506.05692>
- **Key figure (corrected):** SafeGenBench reports that a large share of security vulnerabilities in LLM-generated code that compiles go undetected by static analyzers. **Caveat:** the benchmark is multi-language (Rust is not a separate track) and uses Semgrep-class tooling rather than CodeQL; the previously-cited "~57%, crypto-Rust, CodeQL" figure could not be verified against the paper and has been removed. Treat as directional support for "compiles ≠ secure", not a Rust-specific number.
- **Used in:** §B12 (crypto silent insecurity), Tier B intro.

### Rust-SWE-Bench
Benchmark of 500 real-world repository-level Rust issues from 34 popular crates.
- **Source:** "Evaluating and Improving Automated Repository-Level Rust Issue Resolution with LLM-based Agents", arXiv:2602.22764 — <https://arxiv.org/abs/2602.22764>
- **Key figure (compilation-failure distribution):** **76.3%** of all compilation failures from LLM agents fall into just two categories:
  - 43.7% — failure to model project organization (E0433, E0432, E0425, E0412, E0405).
  - 32.6% — failure to respect type/trait semantics (E0599, E0308, E0277, E0407).
- **Key figure (task resolution):** ReAct-style agents resolve up to 21.2% of issues; RustForger with Claude Sonnet 3.7 reaches 28.6% (34.9% over the strongest baseline).
- **Used in:** justifies the §A1 priority and the v0.3.0 decision to retire the (now-renumbered-away) trait-bounds Tier A category from the spec (compile-only — out of scope).

### AkiraRust
LLM-aided Rust repair framework with a feedback-guided thinking switch (FSM-driven dual-mode reasoning).
- **Source:** "AkiraRust: Re-thinking LLM-aided Rust Repair Using a Feedback-guided Thinking Switch", arXiv:2602.21681 — <https://arxiv.org/abs/2602.21681>
- **Key figure:** GPT-5 alone reaches 75% pass rate on the benchmark; AkiraRust's repair loop reaches 100%, isolating the qualitative gap between raw LLM and feedback-guided repair on Rust ownership/lifetime/aliasing issues.
- **Used in:** general taxonomy context; supports the "compile-fix loop is required" framing behind /rust-cc-fix.

## Field report (published)

**"Я заставил LLM писать Rust полгода. Вот что они стабильно ломают"** — uproger.com, 2026-05-16.
- **Source:** <https://uproger.com/ya-zastavil-llm-pisat-rust-polgoda-vot-chto-oni-stabilno-lomayut/>
- **Setup:** 6-month observation of Claude / GPT / Cursor generating Rust in production. ~80k LOC of streaming-data backend; stack: tokio + sqlx + unsafe hot paths. Roughly 40% of commits contained AI-generated code. Failures were classified across 50 benchmark tasks against four major models.
- **Status:** published field report, not a peer-reviewed study. Cited here because the numeric findings are documented and reproducible by anyone running the same benchmark; treat as directional but anchored to a public artifact.

Key findings used in the spec:
- **§B1 (lifetime laundering):** reproduced in 34 of 50 tasks that return a reference.
- **§B2 (Mutex across .await):** this category was the proximate cause of failure in roughly half of async tasks observed; pinning crate versions in the prompt cut the rate sharply.
- **§B2 / `await_holding_lock`:** clippy caught only ~7 of 23 cases (i.e. about 30%) — misses guards in closures, `if let`, early-return blocks. Confirmable independently by inspecting the lint's source.
- **§B3 (cancel safety):** **zero** models spontaneously mentioned cancel-safety across the timeout-using tasks; when asked directly, models answered "yes, it's cancel-safe" confidently and incorrectly in ~50% of cases.
- **§B5 (unsafe UB):** of 40 LLM-generated `unsafe` blocks — 13 definite UB, 9 conditional UB (alignment, OOB, Stacked Borrows), 18 correct. So **~55% of LLM-generated unsafe is a powder keg**. (Directionally consistent with SafeGenBench findings.)

## Industry reports

### Faros AI (2026)
- **Source:** <https://www.faros.ai/blog/ai-acceleration-whiplash-takeaways>
- **Key figure:** the incidents-to-PR ratio rises **+242.7%** as an organization moves from low to high AI adoption — an org-level adoption signal, *not* a direct AI-PR-vs-human-PR comparison. Earlier phrasing that read it as "AI-generated PRs vs human-authored" overstated the metric.

### Lightrun — State of AI-Powered Engineering 2026
- **Source:** <https://lightrun.com/ebooks/state-of-ai-powered-engineering-2026/>
- **Key figures:** **43%** of AI-generated code changes require debugging in production; among surveyed engineering leaders, **zero** rated themselves "very confident" that AI-generated code behaves correctly once deployed. **Note:** these figures concern AI-generated code in general — the report does not single out Rust or any language. Earlier phrasing ("very confident in AI-generated Rust") fabricated a Rust-specific scope and has been corrected.

### Codestral / DeepSeek-Coder studies
Method-existence hallucination rates in major code-generation models.
- **Source basis:** SafeTrans and RustEvo² breakdowns (see entries above) plus per-model evaluation cards.
- **Key figure:** LLMs generate non-existent methods (E0599) in **up to 22%** of cases for Rust.
- **Used in:** §A1.

### Slopsquatting / package-hallucination studies
- **Key figure:** crate-name hallucination rate in Rust reported as **elevated relative to other major-language ecosystems** in published slopsquatting research; primary citation is the Lanyado/Spracklen-style "Hallucinated Package Imports" line of work — verify the specific Rust figure against the source paper before quoting precisely.
- **Used in:** §A1 (slopsquatting defense).

### Package-hallucination rate (USENIX Security 2025)
- **Source:** "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs", USENIX Security 2025 (UT San Antonio / Virginia Tech / Univ. of Oklahoma).
- **Key figures:** across 16 LLMs and ~576k generated code samples, **19.7%** of recommended packages did not exist (≈5.2% for commercial models, ≈21.7% for open models); **58% of hallucinated package names recurred** across runs (which is what makes them squat-able); breakdown ≈51% fabricated / 38% name-confusion / 13% typo.
- **Caveat:** the study measured **PyPI / npm**, not crates.io — the mechanism (repeatable hallucinated names an attacker can pre-register) transfers, but the precise Rust crate-name figure is not from this study. The term "slopsquatting" was coined by Seth Larson (April 2025).
- **Used in:** §A1 (slopsquatting / supply-chain defense) — strengthens the "hallucinated dependency runs malicious code" rationale with a quantified, repeatable-hallucination anchor.

## Documented incidents

### CrateDepression (2022)
Malicious crate `rustdecimal` — typosquat of the legitimate `rust_decimal` (~100M all-time downloads; the earlier "~3.5M" appears to have been the repo's GitHub star count, not downloads). Targeted CI pipelines.
- **Source:** Rust Security Response WG advisory, 2022-05-10 — <https://blog.rust-lang.org/2022/05/10/malicious-crate-rustdecimal/>
- **Used in:** §A1.

### `faster_log` / `async_println` (2025)
Malicious crates that scan for and exfiltrate Solana/Ethereum private keys. Reached thousands of downloads before takedown.
- **Source:** Rust Security Response WG advisory, 2025-09-24 — <https://blog.rust-lang.org/2025/09/24/crates.io-malicious-crates-fasterlog-and-asyncprintln/>
- **Used in:** §A1.

### Supply-chain trend in the Rust ecosystem (2025)
- **Observation:** attacks against crates.io rose materially in 2025 — beyond the two named incidents above, several smaller malicious-crate takedowns occurred. Published year-over-year estimates cluster around **+70–75% ecosystem-wide** (npm-dominated); no crates.io-specific percentage is published. The earlier "+100–130%" was not corroborated — treat as directional.
- **Used in:** §A1 (slopsquatting context).

### Cargo issue #2524
Known gotcha: `features = [...]` inside `[target.'cfg(...)'.dependencies]` activates globally, not per-target. <https://github.com/rust-lang/cargo/issues/2524>
- **Used in:** §C7.

## Standards and documentation (normative sources)

- **`rand` crate security policy** — `ThreadRng` is a CSPRNG (ChaCha12, seeded from `OsRng`). For keys/nonces, prefer `OsRng` directly to remove ambiguity about seeding chains. <https://github.com/rust-random/rand/blob/master/SECURITY.md>, <https://rust-random.github.io/book/guide-rngs.html>. §B12.
- **Rust 1.80 `--check-cfg` automation** — after 1.80, declared features in `Cargo.toml` automatically generate `unexpected_cfgs` warnings for typo'd `cfg(feature = "…")`. <https://blog.rust-lang.org/2024/05/06/check-cfg/>, <https://blog.rust-lang.org/2024/07/25/Rust-1.80.0/>. §C7.
- **Native async fn in traits (RPITIT)** — stabilized in Rust 1.75; idiomatic 2025–2026 pattern is `fn bar(&self) -> impl Future<Output = T> + Send`, with `trait-variant` for Send/non-Send variants and `async-trait` only for `dyn Trait` cases. <https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits/>. §B15.
- **Tokio docs** — per-function cancel-safety guarantees (`AsyncReadExt::read` is cancel-safe, `read_exact` is not, etc.). §B3.
- **Rust Reference / Nomicon** — Stacked Borrows, `repr(Rust)` vs `repr(C)`, Pin contracts. §B5, §B15.
- **Rust Reference / `std` primitive-cast docs** — `as`-cast numeric semantics: integer narrowing truncates (wraps mod 2ⁿ), and float→int casts saturate to the target's bounds (and map `NaN` to 0) as of Rust 1.45. §B26.
- **`std::time` docs** — `Instant` is monotonic and the only correct clock for measuring durations; `SystemTime` is wall-clock and can jump backward (NTP, manual changes), so `SystemTime::duration_since` / `elapsed` return a `Result` rather than a bare `Duration`. §B27.
- **Rust `std::str` / "Strings are UTF-8" (Reference & the Book)** — `str` is UTF-8; byte-range indexing (`&s[a..b]`) panics when an index is not on a `char` boundary, and `str::len` / `[u8]` length is bytes, not `char`s or grapheme clusters. §B28.
- **`clippy` lints:** `await_holding_lock`, `clone_on_copy`, `unwrap_used`, `expect_used`, `missing_safety_doc`, `undocumented_unsafe_blocks`, `redundant_clone`. Post-flight checklist.
- **`miri`** — required in CI for any file containing `unsafe`. §B5.
- **`loom`** — model checking for multi-lock code. §B9.
- **`tokio-console`** — runtime visibility for §B9, §B11.
- **`cargo-hack` + `--feature-powerset`** — §C7.
- **The Rustonomicon — Subtyping & Variance, PhantomData, Drop Check.** Variance of a type is *derived* from its fields (covariant/invariant/contravariant); a raw-pointer wrapper must use `PhantomData` to declare the variance, drop-check, and `Send`/`Sync` it actually has, or it is unsound while still compiling — there is no `unsafe` token at the variance site. <https://doc.rust-lang.org/nomicon/subtyping.html>, <https://doc.rust-lang.org/nomicon/phantom-data.html>, <https://doc.rust-lang.org/nomicon/dropck.html>. §B18a (and §B18, §B5).
- **The Cargo Book — SemVer Compatibility.** Adding a variant to a public enum, or a field to a public struct, is a **major** (breaking) change unless the type is `#[non_exhaustive]`; `#[non_exhaustive]` is the documented opt-in that makes such additions minor. Adding/removing a feature, tightening a parameter bound, and bumping MSRV are likewise classified there. <https://doc.rust-lang.org/cargo/reference/semver.html>. §C1a (and §C1, §A3).
- **Rust Reference — Destructors & drop scopes.** Struct fields drop in declaration order; locals drop in reverse declaration order; `std::process::exit` does not run destructors. The basis for the §B4 drop-order shutdown-deadlock and memory-vs-resource-at-exit rules; recursive auto-`Drop` on a deep self-owning structure overflows the stack (the §B7 DoS shape via the destructor). <https://doc.rust-lang.org/reference/destructors.html>. §B4 (with §B7).
- **`std::str::from_utf8`, `zerocopy::TryFromBytes`, `bytemuck::Pod`.** The canonical "validate raw bytes → `Result`/typed view" constructors: they check the value-invariant *on the bytes* and return `Err`/`None` rather than minting an invalid typed value (whose read would be UB). For `Pod` types every bit pattern is valid, so the compile-time bound is the guard. The basis for the §B5 unsafe→safe boundary rule. <https://doc.rust-lang.org/std/str/fn.from_utf8.html>, <https://docs.rs/zerocopy/latest/zerocopy/trait.TryFromBytes.html>, <https://docs.rs/bytemuck/latest/bytemuck/trait.Pod.html>. §B5.
- **Microsoft RustTraining — "Rust Patterns & Engineering How-Tos."** Authoritative training material; the prompting source that surfaced the §C1a (`#[non_exhaustive]`), §B4 (drop order at shutdown), §B5 (zero-copy/binary boundary), and §B18a (PhantomData/variance) additions. Each rule above is independently grounded in the normative Rust references in this section; the book is cited for provenance, not as the sole authority. <https://microsoft.github.io/RustTraining/rust-patterns-book/>. §C1a, §B4, §B5, §B18a.

### Performance (Tier E — systemic cost)

Normative basis for the Tier E laws. These are qualitative/normative sources (mechanism and recommended primitive), not numeric benchmarks — Tier E is gated on *measuring your own workload* (§E6), so no figures are quoted from them.

- **Tokio docs — structured concurrency primitives.** `join!` / `try_join!` poll a fixed set of futures concurrently on one task; `tokio::task::spawn_blocking` runs blocking/CPU-bound work on the dedicated blocking pool so it does not stall the runtime; `JoinSet` and `StreamExt::buffer_unordered` bound and drive many in-flight futures. The documented contracts are why independent `.await`s should be joined rather than serialized. <https://docs.rs/tokio/latest/tokio/macro.join.html>, <https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html>. §E1.
- **`rayon` docs — data-parallelism.** `par_iter` and the work-stealing pool are the idiomatic answer for CPU-bound parallelism (as opposed to async I/O concurrency); use it for the compute that should not sit on the async runtime, and confirm the win by profiling. <https://docs.rs/rayon/latest/rayon/>. §E1 / §E6.
- **Fast hashers — `rustc-hash` (`FxHasher`), `ahash`, `foldhash`.** Faster non-cryptographic hashers for `HashMap`/`HashSet` on hot paths. **Not DoS-resistant under a fixed seed:** a `FxHashMap`/`ahash`/`foldhash` map keyed on attacker-controlled input is collision-floodable. Choose by trust boundary — fast hasher for trusted keys; for untrusted keys keep a DoS-resistant default per **§B16** (std `RandomState`/SipHash; the SipHash HashDoS warning is already cited in the §B16 entry below). <https://docs.rs/rustc-hash/latest/rustc_hash/>, <https://docs.rs/ahash/latest/ahash/>, <https://docs.rs/foldhash/latest/foldhash/>. §E4 (with §B16).
- **std `BufReader` / `BufWriter` and `Vec::with_capacity`.** `std::io::BufReader`/`BufWriter` amortize syscalls over a buffer (unbuffered per-byte/per-line I/O is the documented anti-pattern they exist to fix); `Vec::with_capacity` (and `String::with_capacity`) pre-allocates to avoid repeated grow-and-copy when the size is known. <https://doc.rust-lang.org/std/io/struct.BufReader.html>, <https://doc.rust-lang.org/std/io/struct.BufWriter.html>, <https://doc.rust-lang.org/std/vec/struct.Vec.html#method.with_capacity>. §E2 / §E5.
- **`regex` docs — compile once.** `Regex::new` compiles the pattern (a non-trivial cost); the crate explicitly warns against recompiling in a loop and recommends compiling once and reusing (e.g. behind `LazyLock`/`OnceLock`). <https://docs.rs/regex/latest/regex/#example-avoid-compiling-the-same-regex-in-a-loop>. §E5.
- **Profiling toolchain (measure-first).** `criterion` for statistically-rigorous microbenchmarks; `dhat` (Rust feature) / `heaptrack` for allocation/heap profiling; `cargo-flamegraph` / `perf` for CPU flamegraphs; `tokio-console` for async task/latency/contention visibility. These are the instruments §E6 mandates *before* spending effort on §E1/§E2/§E4/§E5. <https://docs.rs/criterion/latest/criterion/>, <https://docs.rs/dhat/latest/dhat/>, <https://github.com/flamegraph-rs/flamegraph>. §E6.

### Semantic conformance & test-oracle validity (Tier F, §D1a, §D3)

Normative and methodological basis for Tier F and the testing sub-categories, on the Tier E precedent: these categories make **no numeric claims** — the grounding is normative (specs, CWE classes, toolchain documentation), methodological (property-based and mutation testing), and incident-class (slow-client DoS), plus the CRUST-Bench external-oracle design cited above (§F1/§D1a).

- **RFC test-vector practice.** Protocol/crypto RFCs publish test vectors precisely so implementations can be checked against the *spec's* oracle rather than their own round-trip — e.g. RFC 8439 §2.8.2 ships a worked AEAD example and test vector for ChaCha20-Poly1305. The basis for §F1's "test against the external oracle" REQUIRED and its BANNED on self-round-trip-as-conformance. <https://www.rfc-editor.org/rfc/rfc8439>. §F1 (with §F4, §D1a).
- **QuickCheck / proptest — round-trip properties.** Property-based testing's canonical law is the inverse-pair round-trip (`decode(encode(x)) == x`); it originates with QuickCheck (Claessen & Hughes, ICFP 2000) and is the worked introductory example of the `proptest` book (date parse/display round-trip). The basis for §F4's one-property-per-inverse-pair REQUIRED. <https://dl.acm.org/doi/10.1145/351240.351266>, <https://proptest-rs.github.io/proptest/>. §F4 (with §B20, §D1a).
- **Mutation testing — `cargo-mutants`.** The §D1a counterfactual ("what mutation would this test catch? a test that passes both with and without the change is not evidence") is the defining question of mutation testing, mechanized for Rust by `cargo-mutants`. <https://mutants.rs/>. §D1a.
- **CWE-404 / CWE-772 — resource release on every path.** "Improper Resource Shutdown or Release" and "Missing Release of Resource after Effective Lifetime" are the named weakness classes behind §F3's error-path-leak rules; the slow-client attack family (slowloris-class, CWE-400 uncontrolled resource consumption) is the incident class behind the no-timeout-read-on-untrusted-peer BAN. <https://cwe.mitre.org/data/definitions/404.html>, <https://cwe.mitre.org/data/definitions/772.html>, <https://cwe.mitre.org/data/definitions/400.html>. §F3.
- **`Read::read` / tokio `AsyncReadExt::read` — `Ok(0)` is EOF.** The std and tokio contracts both define a zero-byte read as end-of-stream (or empty buffer); looping on it or treating it as an error is a contract violation, not a style choice. The normative basis for §F3's EOF-policy rules. <https://doc.rust-lang.org/std/io/trait.Read.html#tymethod.read>, <https://docs.rs/tokio/latest/tokio/io/trait.AsyncReadExt.html#method.read>. §F3 (with §C4).
- **Cargo Book — profiles; `loom`.** `dev` and `release` profiles disagree by documented default on exactly the axes §D3 names: `debug-assertions` and `overflow-checks` are on in `dev`, off in `release` — so a green debug test suite is silent about release arithmetic (§B26 owns the fix). `loom` is the documented model-checker for exploring thread interleavings a single-threaded test can never produce. <https://doc.rust-lang.org/cargo/reference/profiles.html>, <https://docs.rs/loom/latest/loom/>. §D3 (with §B26, §B9, §B13).
- **§F2 — definitional.** A guarantee stated only in a project's prose (README/SECURITY.md/design doc) is, by construction, checkable only against that prose — no code-side signal, no external standard to cite. The category rests on the review procedure (extract the guarantees, check the diff against each), not on an empirical figure. §F2.

## How to add a source

1. State the claim in the spec that depends on this source.
2. Add an entry here with (a) type, (b) key figure/observation, (c) link to the spec paragraph, (d) URL/arXiv/DOI.
3. For an academic benchmark or industry report, include the year — the LLM landscape moves fast and time-anchoring matters.
4. For a production observation, state the scale (LOC, time period, stack) and label it as observation, not study, unless it is formally published.
