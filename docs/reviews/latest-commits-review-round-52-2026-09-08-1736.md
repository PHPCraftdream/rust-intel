# Round 52 — full specification and release-readiness review

Review date: 2026-09-08. Reviewed source: `0eee91f3c505cbd5a44c676cd356fb9018607b97`.

## Verdict

Finding groups: **0 P0, 3 P1, 22 P2, 23 P3**. Related locations/remedies are grouped;
these are not counts of affected downstream applications.

**NOT READY for release.** The strongest findings are three P1 recommendation defects:
an exclusive-reference FFI callback recipe, platform-unsound shell escaping, and incomplete
HTML-context escaping. These can cause vulnerabilities in code following the guidance.
The exact-head CI also has two failing Windows recovery lanes. The local validator passing
does not establish the truth of the normative Rust rules.

No P0 is established. This repository is guidance plus installation/validation tooling;
a hazardous recommendation is not evidence that every consumer is already exploitable.
Likewise, an empty-directory recovery mismatch is a release-gate failure, not demonstrated
loss of user files. Severity below is calibrated to the actual defect, not inherited from
earlier reports or inferred from the number of red CI jobs.

This is a **review-only change**. Production files, versions, tags, publication and push are
outside this change. Concurrent working-tree edits to the two PowerShell installers were
observed and preserved; they are not included in this report's tested source snapshot or
in its commit. An uncommitted longer retry budget is not accepted as a proven fix.

## Scope, method and limitations

- Latest implementation commits: `c283e05` and `0eee91f`, following round 51's `af85727`.
  Their Bash compatibility, PowerShell invocation/environment, and orphan-directory
  recovery changes were inspected. They do not change the normative modules.
- Full normative scope: core `skill/SKILL.md`, all ten theme modules, the source ledger,
  the packaged audit workflow and the three command adapters. Unlike rounds limited to
  tooling diffs, this pass reopens the specification itself. All thirteen files in the
  canonical skill tree match their Codex mirror.
- Repository/release scope: Node installers and transaction model, shell/PowerShell
  recovery boundaries, validation/coordinator contracts, fixture oracles, package inventory,
  manifests, license inclusion, release-version machinery, CI and review/closure claims.
- Module-focused reviews were accepted and synthesized with primary-source checks;
  testing and semantic-conformance received a direct reviewer pass. Suggestions already
  covered elsewhere, unsupported severity upgrades and preference-only omissions were
  removed. The `rust-intel` discipline shaped the review: concrete counterexamples,
  independent oracles, version-aware source checks and explicit evidence limits.
- This is broad release review, **not** a formal proof, an independent implementation of
  the JavaScript lexer, an exhaustive enumeration of all installer interleavings, or an
  executed Rust program for every prose example. Large fixture tables were checked through
  their mechanisms, targeted counterexamples and full execution; a green count is not
  claimed as semantic verification of every sentence.
- References were checked against current primary documentation on the review date.
  Current stable Rust documentation identifies **1.98.1**; local Rust probes used **1.97.0**.
  Volatile crate metadata is a dated observation, not a permanent latest-version promise.
  [Rust 1.98.1 announcement](https://blog.rust-lang.org/2026/09/03/Rust-1.98.1/).

All repository locations below refer to the reviewed SHA. Normative findings also apply to
the corresponding `skills/rust-intel/` mirror. P1 means high-priority unsafe guidance;
P2 means a substantive correctness/release-evidence defect; P3 means narrower calibration,
maintenance or documentation work. Missing rules are reported only with a concrete failure
mechanism, not because the catalog could include another popular crate.

### Latest-commit disposition

| Commit | Change under review | Acceptance at the reviewed head |
|---|---|---|
| `c283e05` | Ten files, +265/-8: Bash 3.2-compatible bookkeeping, created-directory tracking across installer backends, Windows quoting and recovery harness adjustments. | Bash 3.2, Bash boundary and both Node installer lanes now pass. Those repairs have real CI evidence; they are not all still open merely because a different lane fails. |
| `0eee91f` | Four files, +39/-6: PowerShell module-path/environment normalization and bounded empty-directory cleanup retries. | Windows validator lanes pass, but both PowerShell installer recovery lanes still fail. The commit title is not proof that all orphan-directory cases are closed. |

## Executed evidence

| Check | Result | What it establishes |
|---|---|---|
| Ordinary `npm run validate`, fixed reviewed source, Node 24.12.0 on Windows | PASS; core and **494/494** controls; 365.579 s | The actual coordinator and complete registered fixture suite passed locally. |
| Canonical/mirror check | PASS; thirteen files | Both distribution copies contain the same rules and workflow. |
| Release-version check | PASS at 0.6.0 | Existing manifest versions agree; no version was changed. |
| Release calibration | PASS; 48 abrupt Windows boundaries, fail-after 1/2/3 and recursive-cleanup negative control | The calibrated transaction/version paths and their negative controls behave as asserted. |
| `actionlint` | PASS | Workflow syntax and supported expression/action structure pass that checker. |
| `npm pack --dry-run --json` | PASS; 39 entries, 634,395 packed bytes, 1,774,459 unpacked bytes | Expected skill/mirror, four bin files, three commands, plugin metadata and both licenses are included. No publication occurred. |
| Local sparse PowerShell cross-restart after-commit reproduction | PASS, 5.54 s | The hosted failure below did **not** reproduce in this local PowerShell 5.1 attempt. |
| Mixed panic-strategy probe, unwinding rlib plus aborting executable | Process aborted; same rlib with unwinding executable returned `caught=true` | A per-crate unwind setting does not provide the isolation claimed by the FFI recipe. |
| Actual nonce-injection helper, positive nonce versus zero | Nonzero adds the expected diagnostic; zero omits it | The zero/sentinel collision is a real boundary defect, independent of its very small random probability. |

Exact-head [CI run 34238245028](https://github.com/PHPCraftdream/rust-intel/actions/runs/34238245028)
finished **FAILURE**: eight jobs passed and both Windows installer recovery lanes failed.
The passing jobs include Linux repository checks, exact Node 24.0.0, both Windows validator
versions, both Node installer flavors, Bash boundaries and Bash 3.2. This replaces older
claims that current tooling has never been pushed or exercised by CI: those claims are no
longer true. It does not replace the requirement for a fully green release candidate.

## P1 — unsafe recommendations

### P1-01 — borrowing a callback context must not automatically mean `&mut`

Location: `skill/unsafe-and-ffi.md:112`, `:121` (§B25).

The corrected ownership rule rightly bans reclaiming the callback's `Box` on each call, but
prescribes `&mut *(p as *mut Ctx)` without requiring serialized, non-reentrant invocation.
Two overlapping callbacks can therefore create overlapping exclusive references before
either reaches an internal mutex. A mutex *inside* `Ctx` does not repair those references.

Require the foreign library's concurrency/reentrancy contract. Use shared access plus
appropriate synchronized interior state when concurrency is permitted; use `&mut` only
with a proven exclusivity interval. Keep the existing unregister → drain → free lifetime
rule. These are separate temporal and aliasing obligations.
[Rust reference aliasing rules](https://doc.rust-lang.org/reference/behavior-considered-undefined.html),
[Nomicon FFI callbacks](https://doc.rust-lang.org/nomicon/ffi.html#callbacks-from-c-code-to-rust-functions).

Acceptance: include serial, concurrent and reentrant callback contracts; a regression example
must reject the overlapping-`&mut` shape even when `Ctx` contains a lock.

### P1-02 — `shell-escape` is not a platform-independent shell-injection remedy

Location: `skill/security.md:91` (§C2).

The fallback recommendation names `shell-escape` without constraining the actual shell.
Its Windows implementation returns a string unchanged when it contains no quote or
whitespace; shell metacharacters such as `&` and `|` are not sufficient to trigger quoting.
Its dispatch also depends on the host environment, not the interpreter the caller selected.
That cannot justify interpolation into arbitrary `cmd.exe`, PowerShell or remote-shell text.
This is established from the [crate's source](https://docs.rs/shell-escape/latest/src/shell_escape/lib.rs.html),
not by executing an injected command.

Keep direct executable plus argument-vector construction as the default. If shell syntax is
unavoidable, require a named interpreter and a context-specific, documented escaping or
data-passing mechanism. Do not offer this crate as the universal escape hatch.

Acceptance: benign metacharacter cases must preserve a single data argument on every claimed
shell; test both injection metacharacters and option handling without running harmful payloads.

### P1-03 — HTML autoescape does not secure every interpolation context

Location: `skill/deps-macros-ergonomics.md:165` (§C12), routed by `skill/SKILL.md:288`, `:375`.

The row covers attribute-context escaping but remedies it with ordinary Askama/Tera HTML
autoescape. For an unquoted `data-x={{ value }}`, a value containing a space and another
attribute can change the element structure without needing a quote or angle bracket.
A quoted `href` still requires a permitted URL scheme: HTML escaping does not reject a
`javascript:` URL. Script/style/event-handler contexts require different handling.

Tera explicitly does not perform contextual autoescaping.
[Tera autoescape](https://keats.github.io/tera/#auto-escaping),
[Askama HTML escaper](https://docs.rs/askama/latest/askama/filters/struct.Html.html),
[OWASP output-context rules](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

Restrict the recipe to text and quoted innocuous attributes; require quotes, prohibit
untrusted interpolation into dangerous contexts, and validate URL schemes before attribute
encoding. Template-extension checks remain useful but are not the complete security control.

Acceptance: negative examples for unquoted attributes, unsafe URL schemes and script/style
contexts must remain unsafe under the review rule even with `.html` autoescape enabled.

## P2 — correctness and release-evidence defects

### P2-01 — exact-head Windows recovery is not clean

Location: `rust-cc-install.ps1:192`, `rust-cc-uninstall.ps1:113`,
`dev/test-installer-recovery.mjs`; CI evidence rather than a proven root-cause location.

Both Windows recovery lanes fail. The pwsh log's sparse-install / after-commit /
cross-restart case expects the clean-operation inventory but observes an additional empty
`skills` directory. Existing `commands` and `keep.md` inventory entries agree. The mismatch
is meaningful because clean-operation equivalence is the tested recovery contract.
[pwsh job](https://github.com/PHPCraftdream/rust-intel/actions/runs/34238245028/job/102101444380),
[PowerShell job](https://github.com/PHPCraftdream/rust-intel/actions/runs/34238245028/job/102101444163).

Local non-reproduction means the precise cause remains open. Sharing violations, retry
exhaustion and cleanup bookkeeping must be distinguished with actual exception/path
evidence. Merely increasing the retry duration does not establish which mechanism failed.
Do not weaken inventory comparison or use recursive deletion to make this test green.

Acceptance: determine the failure mechanism, add the corresponding negative control and
obtain passing native PowerShell and pwsh recovery lanes on the final candidate SHA.

### P2-02 — one unwinding crate does not protect an aborting application

Location: `skill/unsafe-and-ffi.md:117` (§B25).

The suggested escape hatch is to compile the FFI crate with `panic="unwind"` even when
the rest of the program aborts. A directly executed probe contradicts it: an rlib compiled
with unwind contains `catch_unwind`, but an executable linked with abort still aborts on
that panic. Switching the executable to unwind makes the same catch return normally.
Specify the final artifact/linkage strategy, not only a library crate's compilation option.
[Rust linkage/unwinding restrictions](https://doc.rust-lang.org/reference/linkage.html#prohibited-linkage-and-unwinding),
[rustc panic strategy](https://doc.rust-lang.org/rustc/codegen-options/index.html#panic).

Also qualify that a panic hook runs before the catch; catching is not a promise of no
logging or no side effects. Avoid panic-producing operations where the boundary cannot
support unwinding.

### P2-03 — the wakeup recipes do not fully establish readiness correctness

Location: `skill/async.md:215`, `:246` (§B15b/§B15e).

For a manual future, storing a waker after observing “not ready” can lose a completion
between the observation and registration. Require register-then-check, check/register/recheck,
or a lock/atomic protocol proving the same ordering, not just eventual waker storage.
[AtomicWaker example](https://docs.rs/futures/latest/futures/task/struct.AtomicWaker.html).

The `Notify` example correctly calls `enable()` before checking the condition, but uses
a single `if` and resumes after notification without checking the predicate again. Another
consumer can consume the state before this waiter resumes. Show a condition loop with
rearming/replacing the completed `Notified` future; do not repoll a completed one.
[Tokio's multi-consumer example](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html).

Acceptance: completion-between-check-and-register and competing-consumer negative controls.

### P2-04 — value preservation and queue fairness are different cancellation contracts

Location: `skill/async.md:314` (§B23), with queued-lock guidance in the same module.

`Sender::reserve().await` helps avoid losing the owned message when a `select!` arm loses,
but cancelling it loses the sender's place in the queue. Repeated cancellation can starve
the operation. State both properties; preserve the pending future outside repeated selection
when queue position matters. Apply the distinction to fair lock/semaphore acquisition too.
[Tokio Sender reserve cancellation](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html#method.reserve).

### P2-05 — `block_in_place` does not let another branch of the same task progress

Location: `skill/async.md:229` (§B15c).

The recipe says sibling tasks are not starved, but presents `block_in_place` alongside
`spawn_blocking` without the important same-task qualification. Other spawned tasks may
progress; another branch of the current `join!` cannot run while this branch blocks. If the
blocking call waits for that branch, it deadlocks. Require `spawn_blocking` or task separation
for that dependency shape, while retaining the existing multi-thread-runtime prerequisite.
[Tokio block_in_place](https://docs.rs/tokio/latest/tokio/task/fn.block_in_place.html).

### P2-06 — nonce policy must follow the primitive, including per-key limits

Location: `skill/security.md:23` and the AEAD parameter checklist (§B12).

The unconditional CSPRNG-nonce opening is not a universal cryptographic rule. RFC 8439's
ChaCha20 nonce construction requires uniqueness and specifies a counter-oriented approach;
random selection alone does not establish uniqueness. For random AES-GCM IVs, the review
must include the aggregate per-key invocation/collision budget across instances and restarts.
Require the scheme's nonce construction, persistence/multi-writer uniqueness, maximum
invocations/message size and approved tag length, not merely “OS randomness + correct width.”
[RFC 8439 §2.6](https://www.rfc-editor.org/rfc/rfc8439#section-2.6),
[NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final).

The counter-with-explicit-justification carve-out is useful, but it must not contradict the
opening mandate. This is guidance correction, not a request to implement custom crypto.

### P2-07 — DNS pinning is not complete SSRF control when a proxy resolves the target

Location: `skill/security.md:92` (§C2).

The direct-client validation/pinning recipe does not constrain reqwest's default system
proxy behavior. With a proxy, destination resolution can happen at the proxy and bypass the
local resolver override on which the recipe relies. This is a documented-mechanism inference,
not a separately executed proxy exploit in this review.
[reqwest proxy configuration](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.proxy),
[no_proxy](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.no_proxy).

Require direct/no-proxy operation or a trusted proxy enforcing the same destination policy.
Also retain an explicit hop bound when installing a custom redirect policy and a finite
request budget; a custom policy must not accidentally discard the default redirect limit.
[reqwest redirect policy](https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html).

### P2-08 — eviction can break the promised per-key single-flight property

Location: `skill/concurrency-and-state.md:102`; `skill/SKILL.md:207`, `:212` (§B13/§B14).

An `Arc<OnceCell<_>>` stored per key suppresses duplicate work only while all requesters
find that same cell. Evict key K while cell C1 is initializing; a later request inserts C2
and starts a second initializer for K. The existing “bound the map” advice must distinguish
result-cache eviction from in-flight registry lifetime. Keep active entries until completion
or use an explicit generation/ownership protocol. A bounded cache alone proves neither.
[Tokio OnceCell](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html).

Acceptance: evict-during-initialization test with a per-key invocation counter.

### P2-09 — signed division overflow is missing from the numeric boundary rule

Location: `skill/data-and-types.md:72`, `:80`, `:91`; `skill/SKILL.md:267`, `:383` (§B26).

`MIN / -1` and `MIN % -1` can panic even when ordinary overflow checks are disabled.
Checking only zero divisors and repeating “debug panics, release wraps” misses this input.
Use checked division/remainder or explicitly reject the signed-overflow pair; add both
operators to the boundary corpus. The broad version-pin summary needs the same exception.
[Rust operator overflow rules](https://doc.rust-lang.org/reference/expressions/operator-expr.html#overflow).

### P2-10 — ignored unknown fields are not mass assignment

Location: `skill/data-and-types.md:65`, `skill/references/sources.md:178`,
`commands/rust-intel-cc/fix.md` (§B20).

Serde ignoring an unknown key does not assign it to privileged state. Conversely,
`deny_unknown_fields` does not prevent assignment to a sensitive field that is *known* to
the deserialized type, such as `is_admin`. Keep strict parsing for typo/schema ambiguity,
but require a request-specific DTO or explicit writable-field allowlist for mass assignment.
[Serde container attributes](https://serde.rs/container-attrs.html),
[OWASP mass assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html).

Acceptance: a request with a known privilege field must still be rejected/ignored according
to authorization policy even when the parser rejects unknown fields.

### P2-11 — stack growth is not an attacker-controlled recursion budget

Location: `skill/unsafe-and-ffi.md:53` and the corresponding fix-command row (§B7).

Offering `serde_stacker` **or** a depth cap treats stack-overflow mitigation as an alternative
resource bound. Stack growth can prevent stack exhaustion while allowing unbounded work or
memory, and later recursive traversal/drop remains a separate obligation. Require finite
input/depth/work budgets for hostile data; add stack growth only where needed within them.
[serde_stacker scope and caveats](https://docs.rs/serde_stacker/latest/serde_stacker/).

### P2-12 — the edition-2024 resolver default is 3, not 2

Location: `skill/deps-macros-ergonomics.md:97`, `:101`, `:105`; core feature trigger (§C7/§C10).

Resolver-2 feature separation remains relevant, but edition 2024 defaults to resolver 3,
including Rust-version-aware dependency fallback. A virtual workspace needs an explicit
root resolver rather than inference from member editions. Label inherited behavior “v2+,”
state the v3 resolution consequence, and scope historical resolver-v1 complaints accordingly.
[Edition Guide](https://doc.rust-lang.org/edition-guide/rust-2024/cargo-resolver.html),
[Cargo resolver versions](https://doc.rust-lang.org/cargo/reference/resolver.html#resolver-versions).

### P2-13 — git locking and Cargo Vet capabilities are misstated

Location: `skill/deps-macros-ergonomics.md:32`, `skill/SKILL.md:414`,
`skill/references/sources.md:252` (§A1).

A branch declaration with a retained lockfile does not silently advance on each locked
build: Cargo records the exact commit. Full `rev` remains a defensible policy against
re-resolution drift, but the rationale must distinguish an applicable update or lockfile
regeneration from using the existing lock. Configured Cargo Vet can audit git changes
against a registry base with exact-SHA delta audits; saying git inherently bypasses it is
incorrect. Registry advisories alone still do not attest a fork's bytes.
[Cargo git dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#specifying-dependencies-from-git-repositories),
[Cargo Vet git auditing](https://mozilla.github.io/cargo-vet/first-party-code.html).

### P2-14 — feature-union behavior needs an additivity rule

Location: `skill/deps-macros-ergonomics.md:87` (§C7/§C10).

Name/combination checks do not forbid a feature that disables behavior or silently chooses
an exclusive backend. Two individually correct consumers can enable both features in the
final dependency graph and change policy through `cfg` precedence. State that features add
capabilities and that `default-features=false` is not a global disable. Prefer explicit
runtime/configuration selection for exclusive policy; if combinations are invalid, reject
them explicitly and test every supported combination.
[Cargo feature unification](https://doc.rust-lang.org/cargo/reference/features.html#feature-unification).

### P2-15 — source execution review starts too late for IDE-open attacks

Location: `skill/deps-macros-ergonomics.md:49` (§A1).

“Inspect build.rs/proc-macros before the first build” omits the workspace-open boundary.
RustSec's September 7 notices describe malicious greentic package versions executing malware
when a depending project is opened in VS Code. Extend the rule to acquisition/open/build
execution surfaces and granting workspace trust; keep unfamiliar trees untrusted or isolated
until reviewed. Do not claim an exact carrier filename: removed malware artifacts were not
downloaded or executed for this review.
[RUSTSEC-2026-0280](https://rustsec.org/advisories/RUSTSEC-2026-0280.html),
[RUSTSEC-2026-0281](https://rustsec.org/advisories/RUSTSEC-2026-0281.html),
[VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust).

### P2-16 — command/workflow adapters drift from the canonical contracts

Locations: `commands/rust-intel-cc/plan.md:18`, `:22`, `:63`;
`commands/rust-intel-cc/fix.md`; `skill/audit-project.workflow.js:91`, `:215`.

The plan still names seven preflight questions, whereas the core has nine; the missing two
are external-reference and inverse-pair obligations. Its example surface list also reintroduces
blanket `unwrap`/`Arc<Mutex<_>>` reporting despite the core's red-only summary policy.
The scoper schema and prompt obtain “pinned versions” from Cargo.toml even though the core
correctly requires Cargo.lock/metadata. Merely inventorying a lockfile is not resolving versions.

The fix router retains weaker recipes for regex match timeouts, recursion and mass assignment,
and its Windows row suggests filename-based zombie reaping despite §D5's owned-PID rule.
Its sample lint flag is `clippy.await_holding_lock`, not `clippy::await_holding_lock`.
Adapters also broadly block missing context where the core permits stated assumptions outside
three security-critical cases. These are shipping behavior instructions, not cosmetic examples.

Acceptance: route to canonical wording, verify all nine questions, resolve actual versions,
remove conflicting remedies, and test adapter contracts as well as core/mirror consistency.
[Cargo manifest versus lockfile](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html).

### P2-17 — the anti-vacuity claim is stronger than its evidence

Location: `README.md:48`, `dev/validate-fixtures.mjs:439` and related closure records.

The nonce mechanism is useful against accidental shortcuts; it is not proof that the probe
vehicle can obtain an observation **only** by executing the lexer to the final operation.
The vehicle can read the mutated source and recover the injected literal. Round 51 already
executed that counterexample; the two latest implementation commits leave this mechanism
and claim unchanged. This review rechecked that unchanged scope and the source visibility,
but did **not** rerun all of round 51's forged vehicles.

Retain behavioral differential testing, document that it assumes a non-forging vehicle as
well as a non-forging lexer, and attach coverage claims only to mutations actually tested.
Do not begin another integrity-proof redesign merely to outwit arbitrary malicious test code.
The scanner's full language/large-input correctness is a separate review obligation.
See [round 51 evidence](latest-commits-review-round-51-2026-09-08-1049.md).

### P2-18 — the semver gate does not cover the advertised blanket-impl changes

Location: `skill/SKILL.md:535` (§C1/Post-flight).

The mechanically caught examples include blanket-impl narrowing, but the tool documents
generics/lifetime gaps and the impl-bound check remains open. Adding a `Clone` bound to
an existing blanket implementation can remove downstream coverage; removing a bound can
create new overlap. Do not promise that a bare `cargo semver-checks` proves these changes
compatible. Require manual coherence/coverage review and downstream compile cases alongside
the tool. This finding is source-backed; the checker was not installed and run on a new
two-version blanket-impl fixture in this pass.
[Tool limitations](https://github.com/obi1kenobi/cargo-semver-checks#will-cargo-semver-checks-catch-every-semver-violation),
[open impl-bound check](https://github.com/obi1kenobi/cargo-semver-checks/issues/142).

### P2-19 — commit errors/cancellation can leave an unknown durable outcome

Location: `skill/drop-and-raii.md:11`, `:14` (§B4).

The commit method consumes the transaction, so the caller cannot simply decide what to do
with “the tx” after failure. The current drivers also differ: tokio-postgres marks the
transaction done before awaiting COMMIT, so cancellation then does not schedule Drop rollback;
SQLx clears its open flag after successful completion and can queue rollback on the remaining
paths. Neither proves that a delivered COMMIT whose response was lost did not take effect.
[tokio-postgres 0.7.18 implementation](https://docs.rs/tokio-postgres/0.7.18/src/tokio_postgres/transaction.rs.html),
[SQLx 0.9.0 implementation](https://docs.rs/sqlx-core/0.9.0/src/sqlx_core/transaction.rs.html).

Distinguish pre-commit application failure, rollback failure/cancellation, and ambiguous
commit completion. State driver/backend connection disposition and prohibit blind retry
of non-idempotent effects; use the application's idempotency/reconciliation contract.
Audit `timeout`/`select!` around commit as well as around reads. The duplicate-effect risk
is an inference from acknowledgement loss and the cited state machines, not a live database
experiment performed here. For payment-like at-most-once effects the downstream impact is high.

### P2-20 — dropping one sender does not prove shutdown before join

Location: `skill/drop-and-raii.md:34` (§B4).

The `drop(sender); handle.join()` remedy still hangs if any other sender clone remains and
the receiver waits for channel closure. Tokio permits need accounting too. Field/local drop
order controls owned handles, not aliases retained elsewhere. Require revocation of all
strong sending capabilities, or an independent authoritative shutdown signal. Receiver-side
close-and-drain must also account for outstanding permits.
[std Sender closure contract](https://doc.rust-lang.org/std/sync/mpsc/struct.Sender.html),
[Tokio Receiver closure](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Receiver.html).

Acceptance: a sender-clone-retained negative control must not hang the shutdown test;
demonstrate the intended cancellation/revocation policy explicitly.

### P2-21 — migration lints are not complete drop-order coverage

Location: `skill/drop-and-raii.md:43`, `:49` (§B4a).

A bounded two-edition probe on rustc 1.97.0 used a trailing
`if let None = Some(D("temporary")) {}` after a significant-Drop local. Destruction order
changed from local-first in 2021 to temporary-first in 2024, with neither migration lint
emitted under `-W rust-2024-compatibility`. The corresponding upstream false-negative issue
is open. Review significant-Drop temporaries structurally in tails and scrutinees even when
the lint is silent; do not assume a newer compiler fixes this without testing it.
[Rust issue 155010](https://github.com/rust-lang/rust/issues/155010),
[Edition Guide tail scope](https://doc.rust-lang.org/edition-guide/rust-2024/temporary-tail-expr-scope.html).

### P2-22 — the no-unwind cleanup rule stops at `process::exit`

Location: `skill/drop-and-raii.md:19`, `:20`; core termination triggers (§B4).

Direct `process::abort` and panic-abort paths also skip stack destructors, but the code-pattern
rule targets exit and treats panic-abort only as a catch limitation. A `BufWriter` followed
by abort loses unflushed user-space output despite owning a destructor. Extend the rule to
all non-unwinding termination paths: explicit fallible cleanup before intentional termination,
or crash/recovery-safe external state where unwinding cannot be promised. RAII is not a
crash-consistency guarantee.
[Rust process termination](https://doc.rust-lang.org/reference/destructors.html#process-termination-without-unwinding).

## P3 — narrower defects and calibration

| ID | Location at reviewed SHA | Finding and required disposition |
|---|---|---|
| P3-01 | `dev/validate-fixtures.mjs:452`, `:4489` | Five success-valued nonces permit zero, but the injected `reachedNonce` uses zero/falsiness as “not reached.” A forced-zero run loses the trailing diagnostic. Exclude zero or use a distinct sentinel; add a deterministic zero-boundary control. With independent 48-bit draws, the natural per-suite probability is approximately 1.78×10^-14, so this is real but not a plausible explanation for ordinary CI failures. |
| P3-02 | `skill/unsafe-and-ffi.md:35`, `:85`, `:87`; source ledger | Pointer-to-integer casts participate in exposed-provenance semantics; they are not universally unsound simply because strict provenance is preferable. Likewise every raw-pointer wrapper does not necessarily need an additional `PhantomData`: inspect actual fields, variance, ownership, drop-check and auto-trait obligations. Keep the unsafe invariant, remove unconditional false-positive tests. [Pointer provenance](https://doc.rust-lang.org/std/ptr/index.html#provenance), [Nomicon PhantomData](https://doc.rust-lang.org/nomicon/phantom-data.html). |
| P3-03 | `skill/unsafe-and-ffi.md:45`, `:57`, `:107` | A 1 MiB stack allocation is not guaranteed to overflow every debug thread; stack sizes differ. A BANNED bullet positively instructs checked multiplication and needs moving/rewording. The generic custom-allocator `Box<T,A>` discussion should label its unstable allocator-API context. These are calibration/availability errors, not evidence that checked multiplication or ordinary Box is unsafe. |
| P3-04 | `skill/async.md:74` | The illustrative framing receiver uses `&TcpStream` with an `AsyncReadExt::read` shape requiring mutable AsyncRead access. Use a valid owned/borrowed read half or the appropriate readiness/try-read API; compile positive recipes, not only the separate fixture files. |
| P3-05 | `skill/async.md:349`, `:357`, `:367` | `in_current_span()` is not the only correct spawn instrumentation: explicit `.instrument(parent_span)` is valid. Tokio task-local access outside its scope fails rather than inherently reading a previous request's value. Scope bans to the actual missing-span/access contract. [tracing Instrument](https://docs.rs/tracing/latest/tracing/trait.Instrument.html), [Tokio LocalKey](https://docs.rs/tokio/latest/tokio/task/struct.LocalKey.html). |
| P3-06 | `skill/async.md:339` | The WASM runtime statement needs a target distinction: unsupported browser/unknown-unknown facilities are not a universal ban covering supported WASI cases. Verify target and enabled features. [Tokio WASM support](https://docs.rs/tokio/latest/tokio/#wasm-support). |
| P3-07 | `skill/concurrency-and-state.md:50`; `skill/references/sources.md:232` | An unjoined scoped child's panic is propagated after the scope closure returns; it does not itself skip ordinary parent statements between spawn and the end of that closure. Explicit join-and-unwrap there is a different path. Preserve the valid RAII advice with the correct timing. [std thread scope](https://doc.rust-lang.org/std/thread/fn.scope.html). |
| P3-08 | `skill/concurrency-and-state.md:125`, `:133` | Require positive configured capacities. A zero-capacity bounded Tokio channel panics; a drain-at-limit loop with a zero task limit can fail to progress. Broadcast's effective ring capacity can exceed the requested value through power-of-two rounding; budget memory accordingly. [mpsc channel](https://docs.rs/tokio/latest/tokio/sync/mpsc/fn.channel.html), [broadcast channel](https://docs.rs/tokio/latest/tokio/sync/broadcast/fn.channel.html). |
| P3-09 | `skill/concurrency-and-state.md:181` | Sync-to-async bridging need not always be `try_send`: `blocking_send` is valid from an actual synchronous thread when blocking is the stated backpressure policy. Keep it forbidden on async workers. [Sender blocking_send](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html#method.blocking_send). |
| P3-10 | `skill/data-and-types.md:83`; `skill/SKILL.md:382` | Shift-overflow coverage must include a negative signed RHS. The explanatory `n % BITS` shorthand is not correct for all signed-negative inputs. State validity conditions without teaching that formula as universal. |
| P3-11 | `skill/data-and-types.md` (§B29); current-version section | Rust 1.98 introduces explicitly algebraic floating-point operations. The current-spec pass should distinguish their relaxed laws from ordinary operators where reproducibility, NaN or signed-zero behavior is contractual. This is new-API coverage, not a claim that ordinary float operators silently became fast-math. [Rust releases](https://doc.rust-lang.org/releases.html#version-1980-2026-08-20). |
| P3-12 | `skill/data-and-types.md:89`, `:209`, `:218`, `:226` | Date/source or label the overflow-cost percentage, small-Vec crossover and hasher speed ranking as workload-dependent heuristics. `len()` counts elements, not necessarily bytes; AtomicUsize wrap scale depends on target width. Holding a DashMap guard across await can deadlock on a conflicting access, not automatically on every read-only path. |
| P3-13 | `skill/deps-macros-ergonomics.md:22`, `:49`, `:107` | Clarify exact locked resolution versus exact `=version` manifest constraints. “Test the full declared range” needs an operational locked/latest/direct-minimum policy, not an impossible exhaustive promise. Semver-incompatible duplicates are not inherently incorrect when no type/global-state boundary is shared, including separate workspace binaries. [Cargo resolution recommendations](https://doc.rust-lang.org/cargo/reference/resolver.html#recommendations). |
| P3-14 | `skill/deps-macros-ergonomics.md:118`, `:181` | Dated “latest” pins have drifted: rustls 0.23.44 and lru 0.18.4 were published before this review; the existing lru >=0.18.2 advisory floor remains valid. Date snapshots or verify live; do not confuse freshness with a security-floor defect. [rustls metadata](https://crates.io/api/v1/crates/rustls), [lru metadata](https://crates.io/api/v1/crates/lru). |
| P3-15 | `.github/workflows/ci.yml:25` and matching toolchain gates | CI pins 1.97.0 while 1.97.1 fixed an LLVM miscompilation and stable is now 1.98.1. Recheck the patched-toolchain policy before release; preserving an older compatibility lane is a separate decision. No concrete miscompilation of this repository was demonstrated. [Rust 1.97.1](https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/). |
| P3-16 | `skill/testing.md` (§E6) | Pinned compiler/allocator/target alone do not make every allocation/query/instruction count deterministic. RandomState keys, input seeds, scheduling and cache state can change the work. Fix or bound relevant entropy/state before making an exact counter a hard gate; retain dedicated-hardware measurement as a separate case. [RandomState](https://doc.rust-lang.org/std/collections/hash_map/struct.RandomState.html). |
| P3-17 | `skill/security.md` (§B24/§B12) | Qualify constant-time comparison by length policy and primitive: some comparisons disclose unequal lengths, so require fixed/public length where that is assumed. State JWT audience/issuer requirements against the actual token profile rather than asserting every valid JWT profile requires the same claims. Preserve the multi-service/tenant rejection tests where those claims are the boundary. [subtle ConstantTimeEq](https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html), [RFC 7519 claims](https://www.rfc-editor.org/rfc/rfc7519#section-4.1). |
| P3-18 | `skill/lifetimes-and-api.md:84`, `:95` | Do not ban an intentional first-release extension-trait blanket impl merely because it is unsealed. Distinguish initial API design from changing published coverage. “Foreign trait + foreign Self” is not the full orphan rule: `impl From<Local> for Vec<Local>` is a legal counterexample. Use the actual ordered local-type/uncovered-parameter rule before prescribing a wrapper. [Rust coherence](https://doc.rust-lang.org/reference/items/implementations.html#trait-implementation-coherence), [RFC 2451](https://rust-lang.github.io/rfcs/2451-re-rebalancing-coherence.html). |
| P3-19 | `skill/lifetimes-and-api.md:124`; `skill/SKILL.md:310` | Public associated-type projections can name a hidden concrete type, e.g. `<Factory as Has>::Output`; public module paths, re-exports and free aliases are not the only naming routes. A two-crate metadata probe compiled on Rust 1.97. Treat `unnameable_types` as a triage signal, not an exact nameability oracle. [Associated types](https://doc.rust-lang.org/reference/items/associated-items.html#associated-types). |
| P3-20 | `skill/lifetimes-and-api.md:13`, `:65` | A cache of borrowed input is sound when deliberately bounded by the input lifetime; its short-lived-source witness failing in rustc proves an API constraint, not a silent dangling reference. Borrowed public return values are also idiomatic views and do not force every caller to write lifetime annotations. Keep lifetime witnesses as use-case/design tests; label owned-return defaults as a tradeoff, not a universal Rust safety rule. [Lifetime elision](https://doc.rust-lang.org/reference/lifetime-elision.html), [caller control](https://rust-lang.github.io/api-guidelines/flexibility.html#c-caller-control). |
| P3-21 | `skill/lifetimes-and-api.md:95`, `:96` | The suggested newtype need not publish its inner tuple field to satisfy coherence. Default that field to private. `repr(transparent)` is an intentional layout/ABI commitment, not a prerequisite for an optimized zero-overhead wrapper; require it when that representation contract is wanted. [Transparent representation](https://doc.rust-lang.org/reference/type-layout.html#the-transparent-representation), [private fields](https://rust-lang.github.io/api-guidelines/future-proofing.html#c-struct-private). |
| P3-22 | `skill/lifetimes-and-api.md:104`; `skill/references/sources.md:155` | A non-exhaustive struct can be created through `Default`, conversions or factories, or intentionally be producer-only; constructor/builder are not the only valid story. The source ledger also overstates field additions as universally major despite the module's correct existing-private-field calibration. Preserve externally observable guarantees rather than freezing every private detail. [Cargo private-field rules](https://doc.rust-lang.org/cargo/reference/semver.html#struct-private-fields-with-private). |

### P3-23 — empirical evidence needs correct denominators and traceable sources

Locations: `skill/references/sources.md:16`, `:54`, `:61`, `:143`, `:198`, and core summaries.

- SafeTrans's 18–30% observation concerns shares of categorized compilation errors in the
  reported model results, not 18–30% of generated programs. Do not change the denominator.
  E0599 counts alone also do not prove every occurrence was an invented API.
  [SafeTrans §5.2](https://arxiv.org/html/2505.10708v2).
- The 80k-LOC field article describes its own experiment but supplies no runnable benchmark
  artifact/raw results sufficient for the ledger's “anyone can reproduce” claim. Its shown
  mutex example has no await although the explanation invokes await deadlock. Treat the
  field report as anecdotal motivation, not the authority for a standard-library contract.
  [Field report](https://uproger.com/ya-zastavil-llm-pisat-rust-polgoda-vot-chto-oni-stabilno-lomayut/).
- Several added rule rows cite a library/docs label without a direct source URL. Attach
  versioned/section-specific primary references to load-bearing claims, particularly where
  this review found contradictions. The source ledger's “JoinSet bounds concurrency” summary
  needs an explicit admission bound; merely constructing a JoinSet does not impose one.
  The Drop ledger especially needs versioned driver implementations and migration-lint
  limitations; a generic destructor-reference link does not substantiate third-party rollback
  state machines. Lifetime/coherence/nameability policy needs its own primary-source cluster.
- Keep correct figures: RustEvo's 56.1%/32.5% comparison is supported. Do not generalize
  Faros/Lightrun multi-language survey/telemetry observations into a measured Rust-specific
  failure probability. AkiraRust's Miri-pass metric is not interchangeable with semantic
  equivalence. These are evidence-label corrections, not grounds to discard the categories.
  [RustEvo](https://arxiv.org/abs/2503.16922),
  [AkiraRust](https://arxiv.org/html/2602.21681v1).

## Coverage and positive findings

| Surface | Checked obligations and disposition |
|---|---|
| Core and routing | Category/module mapping, nine preflight questions, red/yellow/green semantics, hard-block exceptions and version pins; adapter and reference drift reported above. |
| Async | Cancellation, lock lifetime, task ownership, joins, manual futures, timers, bridging, tracing and runtime targets; wakeup/fairness/bridging corrections above. Existing lost-JoinHandle and self-retaining-task rules are present, not new omissions. |
| Unsafe/FFI | Provenance, allocation/resource bounds, Send/Sync, variance, pointer/allocator ownership, callback lifetime and foreign thread safety; callback aliasing and panic strategy are substantive remaining defects. |
| Concurrency/state | Lock order, single-flight, admission/cache bounds, atomic protocols, borrow/lock reentrancy, channel selection and contention; cache eviction lifetime remains a missing premise. |
| Data/types | Eq/Hash, serialization presence, numeric conversions/overflow, clocks, UTF-8, float contracts and systemic cost; signed division and mass-assignment explanation need correction. |
| Security | AEAD/KDF/RNG version lines, JWT, TLS, secret formatting, constant-time comparisons, process/path/archive/HTTP boundaries; shell, nonce-policy and proxy-context findings above. |
| Dependencies/macros | Registry/advisory checks, maintained alternatives, feature/workspace composition, macro rename paths, build-script reruns, curated substitutions and reuse; resolver/git-vet/additivity findings above. |
| Drop/RAII | Transaction/drop behavior, error preservation, destruction order, exit/static/buffer behavior, recursive drop, channel shutdown and edition migration; ambiguous commit, cloned senders and silent migration-lint misses remain material. |
| Lifetimes/API | Lifetime witnesses, caller control, blanket/coherence rules, sealing, non-exhaustive evolution, newtypes and public nameability; compiler-enforced constraints must not be mislabeled as silent UB, and semver-checker coverage is overstated. |
| Testing/CI | Oracle independence, negative controls, adversarial stream chunking, test/prod divergence, paused-time prerequisites, loom instrumentation, output/exit preservation and owned-process cleanup. These main disciplines are sound; counter determinism and adapter drift need the qualifications above. |
| Semantic conformance | External reference versus self-round-trip, prior-release bytes, schema mutation, recursive type coverage, version dispatch, early-exit cleanup, absolute stage deadlines and inverse-law direction. No additional independent P1/P2 was established in this module. Its long positional-format bullet is a maintenance/readability concern, not by itself a correctness defect. |
| Packaging/tooling | Expected npm inventory, both licenses, mirror and version agreement, native entrypoints and recovery tests; most exact-head CI lanes pass, Windows recovery remains open. |

Verified advisory floors for the named quick-xml, ammonia and lru issues remain valid;
the stale-alternative warnings for backoff, derivative, serde_yml, dotenv, async-std and
bincode remain supported. Registry existence and an empty advisory query are not a code
safety certification. No removed malicious crate was installed to verify an advisory.

## Release acceptance checklist

1. Correct the three P1 recipes and add calibrated positive/negative examples for each.
2. Resolve P2 findings against primary contracts, synchronize the mirror, and align all
   shipping command/workflow adapters. Keep recommendation fixes separate from preference edits.
3. Diagnose Windows recovery and pass the full matrix on the **final candidate SHA**.
   Preserve unrelated files and strict recovery inventory equivalence.
4. Compile executable positive Rust recipes with their stated MSRV/features and test
   behavioral claims such as cancellation, callback aliasing and nonce construction with
   suitable focused harnesses. The existing fixture syntax check is not this coverage.
5. Make test/closure claims no broader than the negative controls actually executed;
   retain the documented threat-model boundary of mutation testing.
6. Re-run validator, mirror/version checks, package inspection, actionlint and required
   platform lanes after fixes. Review the packed artifact rather than only the source tree.
7. Make the release version, tag, push and publication decisions separately with explicit
   authorization. This report neither changes versions nor publishes anything.

Review tasks completed by this change: latest-commit inspection, full theme coverage,
current-source verification, test/CI evidence assessment, synthesis and written report.
Finding remediation is not claimed by a review commit.
