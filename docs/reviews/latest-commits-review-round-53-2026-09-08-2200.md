# Round 53 — full release review, round 2

Date: 2026-09-08, 22:00 CEST. Reviewed SHA:
`20c63d74fb79534029e7c779f8e5848124bd3f0e`.

## Verdict

**NOT READY for release: 2 P1, 8 P2, 3 P3 finding groups; no P0 established.**

The previous round's three P1 recommendations were corrected. All ten exact-head CI jobs
now pass, and a fresh local run passed all 494 registered controls. These are substantial
improvements, not grounds for repeating the previous red-CI verdict unchanged.

However, the real PowerShell uninstaller can delete an unrelated skill after a confirmation
answer. This was reproduced using only disposable test files. Several recommended Rust
patterns also remain incorrect, including newly corrected examples that compile but do not
satisfy their stated contract. The green suite does not exercise those contracts.

This change contains **the review report only**. It does not implement fixes, change versions,
create a tag, push, or publish. Existing `.githooks/` content was preserved.

## Scope and evidence boundaries

- Baseline: `0e46eae`, the [first full-review report](latest-commits-review-round-52-2026-09-08-1736.md).
  Window: **17 commits**, 32 changed files, +465/-275. The source was frozen in a detached
  review worktree. Main still pointed to the reviewed SHA when the report was prepared.
- All ten normative theme modules were read, including unchanged semantic-conformance
  guidance. Core review used the fully read baseline plus every current change; the installed
  baseline core was verified byte-identical to the baseline Git blob. The source ledger,
  three commands, packaged workflow contracts and canonical/mirror correspondence were checked.
- Tooling scope included all four Node bin files, the lexical helper, recovery fixture/oracle
  mechanisms, coordinator/validator contracts, changed PowerShell paths, both CI workflows,
  package inventory, version machinery and release instructions. Unchanged Bash behavior has
  exact-head CI evidence; it was not independently re-executed locally in this pass.
- This was a **single-reviewer pass**. No new sub-agents were launched. The `rust-intel` skill
  supplied the invariant, counterexample and independent-oracle discipline; its fan-out
  instruction did not override the user's prohibition on unrequested delegation.
- Coverage is broad across every theme and release surface, **not a formal proof or a claim
  that every historical report and every line of the large fixture corpus received a fresh
  manual audit**. The 494-control suite was actually executed. Targeted probes below check
  specific claims that the suite does not cover. No large-input DoS or artificial CPU-load
  experiment was used to establish the findings.
- Local environment: Node **24.12.0**, Windows, rustc **1.97.0** for the Rust probes. CI now
  pins **1.97.1**. Current stable reference pages identify **1.98.1**; no result obtained on
  local 1.97.0 is represented as a 1.98.1 execution.

### Latest-commit acceptance

| Change | Disposition |
|---|---|
| `439464f`, `83cfac6`: longer directory retries and diagnostics | Longer retries alone did not close the hosted failure: their CI runs still failed. Diagnostics made the manifest-path defect observable. The cleanup primitive has the separate P1-01 defect below. |
| `5414b8a`: pinned Rust 1.97.1 | Accepted for the previous patched-toolchain finding. A newer stable release is not automatically a reason to discard a deliberate compatibility lane. |
| `1dde165`: relative manifest paths built from normalized path components | Accepted for the previously failing sparse/cross-restart inventory case. Its CI and the final reviewed SHA's CI pass; this is stronger evidence than the earlier retry-only mitigation. |
| T1-T8, T14: module corrections | Many substantive corrections accepted. Notable remaining/new problems: recursion budget, owned-stream cancellation example, zero-capacity debug assertion, and over-broad dynamic-library panic policy. |
| T9-T11: commands, core and sources | Partially accepted. The workflow scoper now reads resolved versions, but the audit command and several canonical trigger/source summaries still contradict the corrected modules. |
| `11f15b1` / T12: nonce and evidence wording | Nonzero draws plus a forced-zero rejection check close the rare sentinel collision. The current README/helper now state the non-forging-vehicle assumption; no new integrity-proof redesign is called for. |

## Checks actually completed

| Check | Result | Scope of the evidence |
|---|---|---|
| `npm run validate` on frozen source | PASS: core plus **494/494** registered controls | Fresh local execution, not a copied prior-round figure. The additional unregistered forced-zero assertion also runs in this suite. |
| Exact-head GitHub Actions | **10/10 jobs successful** | [Run 34263125153](https://github.com/PHPCraftdream/rust-intel/actions/runs/34263125153): Linux repository checks, exact Node 24.0.0, both Windows validator versions, both Node installer flavors, Bash boundaries, Bash 3.2, pwsh and powershell.exe recovery. |
| Mirror | PASS: thirteen files | Canonical and Codex distribution copies agree byte-for-byte. |
| Version check | PASS at 0.6.0 | `node dev/check-release-version.mjs 0.6.0`; no bump was made. |
| Release calibration | PASS | 48 abrupt Windows boundaries, failures after replacements 1/2/3, old-or-new manifest/mode checks and nested-artifact cleanup negative case. This is process interruption, not power-loss durability. |
| `actionlint` | PASS | Workflow syntax/structure, not runtime correctness of every recommended Rust snippet. |
| `npm pack --dry-run --json` | PASS | 39 entries; 675,593 packed bytes, 1,902,983 unpacked bytes. Both licenses, four bin files, three commands, plugin metadata and both complete skill trees included. No publication. |
| Real PowerShell install → add another skill → uninstall | **Preservation violated with `Y`; preserved with `N`** | Separate installation lineages in an owned temporary target; both uninstall executions exit 0. P1-01. |
| reqwest 0.13.4, redirect policy `none()` | Direct request to the probe's own loopback server returns 200 | No external/internal-service probing was performed. P1-02. |
| Tokio 1.53.1 owned-stream cancellation | Caller buffer retains one byte; peer observes EOF | The connection was destroyed despite the claimed resumability. P2-01. |
| Two futures polled on one thread | First task reads tenant 2 after setting tenant 1 | No thread migration is necessary for TLS contamination. P2-02. |
| Serde 1.0.228 / serde_json 1.0.151 | Absent becomes explicit null after round-trip; corrected control preserves all three states | P2-03. |
| Release zero-capacity probe | Debug assertion disappears; drain predicate remains true | No infinite loop was executed. P2-05. |
| Static dangling-link write probe | Ancestor containment passes; write reaches outside the allowed base | Both base and outside destination were inside one disposable test root. P2-06. |
| Unwinding cdylib + aborting executable | DLL catches its own panic, returns 1; host exits 0 | Windows dynamic-link case, distinct from the previous rlib experiment. P2-08. |

The dependency-bearing probes used exact direct versions, a separate temporary Cargo project,
cached dependencies with `--offline`, and two build jobs. Their lockfile and build outputs are
not changes to this project's dependencies. Probe scaffolding issues were corrected before
accepting the final results; compilation/setup errors were not counted as evidence of a
product defect.

## P1 — release blockers

### P1-01 — “empty-directory-only” PowerShell cleanup can delete another skill

Locations: `rust-cc-uninstall.ps1:125`, `:264`; identical primitive at
`rust-cc-install.ps1:204`. Missing lifecycle case: `dev/test-installer-recovery.mjs:95`,
`:114`, `:261`.

The cleanup helper calls `Remove-Item -LiteralPath $entry -Force` and assumes omission of
`-Recurse` means a nonempty directory cannot be removed. That is not PowerShell's contract:
it asks for confirmation and can then remove the directory **and its children**. This is
not equivalent to Node's `fs.rmdirSync` or POSIX `rmdir`.
[Microsoft Remove-Item documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/remove-item?view=powershell-7.5),
[confirmation behavior](https://learn.microsoft.com/en-us/powershell/scripting/samples/manipulating-items-directly?view=powershell-7.6).

Executed reproduction using the actual reviewed PowerShell 5.1 scripts:

1. Install into an empty disposable configuration target. The installed ownership manifest
   records `skills` because this installation created that container.
2. Add `skills/unrelated/SKILL.md` afterwards, representing another installed skill.
3. Invoke the real uninstaller with `Y` on stdin. It exits 0, prints completion, and the
   unrelated skill is gone. In the control run, answering `N` exits 0 and preserves it.

This requires accepting the destructive confirmation; it is **not** claimed as unconditional
deletion without a prompt. It remains a P1: uninstalling rust-intel must not offer removal
of other skills as its supposedly empty-only housekeeping. Its transaction backup has
already been deleted before this container cleanup, so that backup does not recover the
unrelated content. Only test fixtures were removed in this review.

Why green CI misses it: the fresh fixture pre-creates `skills`/`commands`, so they are not
recorded as installer-created containers. Other fixtures preserve unrelated data elsewhere;
they do not install first and then add foreign content inside a recorded container. The
harness does not supply an affirmative cleanup response. Boundary enumeration is valid
for the states exercised, but does not cover this ownership-lifecycle transition.

Required correction: use a primitive that **cannot** recursively remove a nonempty directory,
such as `System.IO.Directory.Delete(path, false)`, in both helpers. Retry only appropriate
transient failures; a known nonempty directory is an immediate preserve/skip case, not a
30-second retry candidate. Do not “fix” this with `-Recurse` or `-Confirm:$false`.
[Directory.Delete contract](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.delete?view=net-10.0).

Acceptance: on both advertised PowerShell versions, install → add a foreign skill/file →
uninstall/recovery must preserve its bytes even with `Y` available on stdin, and must not
ask to delete that content. Keep the existing recovery inventory assertions unchanged.

### P1-02 — disabling redirects is offered instead of destination authorization

Location: `skill/security.md:95` (§C2).

The required recipe offers a destination allowlist **or** `Policy::none()` when redirects
are unnecessary. Disabling redirects only prevents a follow-up request. It does not stop
the **first** request to loopback, a private service or a metadata endpoint.

A reqwest 0.13.4 client configured with `no_proxy()` and `redirect(Policy::none())` successfully
requested the review's own loopback HTTP server and received 200. No redirect was involved.
That directly defeats the proposed alternative as an SSRF defense.
[reqwest redirect policy](https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html#method.none),
[OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

Always enforce the destination policy on the original URL/resolved destination; then choose
no redirects or a bounded policy that applies the same checks to each hop. Retain the newly
added proxy and overall-budget qualifications. Those corrections are good but do not repair
the incorrect **or**.

Acceptance: direct forbidden destination, allowed destination redirecting to forbidden,
and resolver/proxy routing must be separate negative cases. This is a newly found existing
defect, not a claim that the latest commit introduced SSRF into executable repository code.

## P2 — remaining or newly introduced correctness defects

### P2-01 — the corrected cancel-safe example drops the connection it promises to resume

Location: `skill/async.md:74` (§B3); changed by `5d7d343`.

Moving to `OwnedReadHalf` repairs the prior shared-`TcpStream` compilation problem, but
`handle` takes the `TcpStream` **by value** and calls `into_split()` inside the cancellable
future. Cancelling while framing drops both owned halves. Keeping `buf` in the caller
does not keep the TCP connection alive; the next invocation cannot resume that connection.

The focused Tokio 1.53.1 probe reads one byte, acknowledges partial progress through a
oneshot, cancels the owning future, and observes both facts: `buf == [7]`, and peer read
returns EOF. No sleep-based synchronization was used.
[Tokio owned write-half Drop](https://docs.rs/tokio/latest/tokio/net/tcp/struct.OwnedWriteHalf.html).

Make the connection/read state caller-owned across cancellation as well as the framing
buffer, and transfer ownership only at the intended commit point. Alternatively declare
cancellation terminal and discard that connection's buffered bytes. Do not label this
owned-connection example resumable merely because `read()` itself is cancel-safe.

### P2-02 — a single thread is not per-request `thread_local` isolation

Location: `skill/async.md:378` (§C9).

The alternative of a current-thread runtime/LocalSet prevents migration but not interleaving:
task A sets tenant 1 and yields; task B sets tenant 2; A resumes on the **same thread** and
reads 2. A deterministic, standard-library two-future probe produced exactly this result.
The effect can be security-sensitive when this state carries tenant/auth context.

Require task-local or explicitly passed context. A true thread-local is suitable only when
the whole usage interval has exclusive ownership or context is restored on every poll;
“one OS thread” alone is not that proof.
[Tokio LocalSet](https://docs.rs/tokio/latest/tokio/task/struct.LocalSet.html),
[Tokio task-local scope](https://docs.rs/tokio/latest/tokio/task/struct.LocalKey.html).

The new statement that out-of-scope Tokio task-local access fails rather than returning stale
request data is correct. This is a different, still-open std TLS alternative.

### P2-03 — the three-state Serde recipe loses absence when serialized

Location: `skill/data-and-types.md:62` (§B20).

`Option<Option<T>>` plus `default` and `deserialize_with` distinguishes incoming states,
but does not preserve absence when the type also derives `Serialize`. Actual result:

```text
{} -> value: None -> {"value":null} -> value: Some(None)
```

The receiving semantics are useful on a deserialize-only DTO; the defect is presenting
this as a complete three-state recipe alongside the module's round-trip obligation.
Add `skip_serializing_if = "Option::is_none"` to the field for this JSON representation,
or provide an equivalent explicit serializer. A control with that attribute preserved
absent, explicit null and present value independently.
[serde_with's documented double-option example](https://docs.rs/serde_with/latest/serde_with/rust/double_option/).

Acceptance: all three states must survive the composition; a value-only example is not enough.

### P2-04 — stack growth is still an alternative to a resource bound

Locations: `skill/unsafe-and-ffi.md:53`, `skill/references/sources.md:177`.
Carried from round 52 P2-11.

The module and source summary still offer `serde_stacker` **or** pre-AST depth/size limits.
Dynamic stack growth can avoid stack exhaustion while allowing unbounded memory/work;
it is not the missing hostile-input resource budget. The fix command was corrected to say
stack growth **within** a budget, making the remaining module contradiction especially clear.
[serde_stacker scope and caveats](https://docs.rs/serde_stacker/latest/serde_stacker/).

Require finite input/depth/work bounds and account for later traversal/drop. Stack growth
or an iterative traversal can be implementation choices inside those bounds. No deliberate
stack-overflow or memory-exhaustion run was needed to establish this unchanged advice defect.

### P2-05 — the new positive-capacity rule permits a debug-only production guard

Location: `skill/concurrency-and-state.md:125` (§B14); introduced by `9209b7c`.

The paragraph explains correctly why `N == 0` makes
`while set.len() >= N { set.join_next().await; }` fail to progress, then accepts
“at minimum `debug_assert!(N > 0)`.” That fallback is compiled out in ordinary release
builds. An empty JoinSet returns `None` immediately; the surrounding condition remains true.

A bounded release probe verified zero is accepted after the debug assertion and the drain
predicate stays true. The actual infinite loop was deliberately not run.
[debug_assert release behavior](https://doc.rust-lang.org/std/macro.debug_assert.html),
[JoinSet join_next](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html#method.join_next).

Require startup validation returning an error, an always-on assertion for a genuine internal
invariant, or a nonzero capacity type. Test zero in release, not only debug. The other new
positive-capacity and broadcast-rounding qualifications should be retained.

### P2-06 — “nearest existing ancestor” needs a dangling-symlink rule

Location: `skill/security.md:88` (§C2).

The static-tree write recipe says the not-yet-created tail cannot escape once its nearest
existing ancestor is canonicalized inside the base. That conclusion is unsafe if existence
is determined by the ordinary following lookup (`exists`, including the broken-link behavior
of `try_exists`). A dangling symlink is an existing directory entry whose target is absent.

Executed static-tree case, with no concurrent attacker:

```text
base/link -> outside/created.txt       (target does not exist yet)
link.exists() == false
link.symlink_metadata() identifies a symlink
nearest following-lookup ancestor == base; containment passes
write(base/link) creates outside/created.txt
```

Both locations were within the review's own temporary root; it was cleaned afterwards.
This demonstrates the natural following-lookup implementation of the prose, not that every
possible implementation of “ancestor” is unsafe.
[Path existence semantics](https://doc.rust-lang.org/std/path/struct.Path.html#method.exists),
[symlink_metadata](https://doc.rust-lang.org/std/fs/fn.symlink_metadata.html).

Specify non-following metadata/link handling, reject dangling/intermediate links under the
chosen policy, and distinguish create-new from overwrite. Capability/handle-relative creation
remains the stronger alternative. Merely replacing `exists()` with `try_exists()` does not
settle this symlink case.

### P2-07 — canonical triggers and the audit adapter still contradict corrected rules

Locations: `skill/SKILL.md:197`, `:311`, `:330`, `:353`, `:414`, `:478`;
`commands/rust-intel-cc/audit.md:18`; `commands/rust-intel-cc/fix.md:37`;
the remaining broad-blocking plan text.

The T10 core commit updates nine hunks, not all affected correspondences. Examples:

| Corrected module/adapter | Still-shipped contradiction |
|---|---|
| Git commits are locked; configured Cargo Vet can audit exact-SHA deltas | Core git triggers and a fix-router row still describe remote-HEAD following/audit-stack bypass without the corrected scope. |
| Explicit `.instrument(parent)` is valid | Core spawn guidance still mandates `.in_current_span()` as the sole future-spawn form. |
| Borrowed public returns are a use-case tradeoff | The core lifetime trigger still states every downstream caller must thread the lifetime and mandates an owned default unless zero-copy was declared. |
| Non-unwinding termination includes abort paths | The core code trigger still only lists `process::exit`; the module now explains more cases. |
| Resolved versions come from Cargo.lock/metadata; most context gaps allow stated assumptions | The unchanged **audit** command still requests exact versions from Cargo.toml and blocks when they are unknown. Fix/plan/scoper edits do not update that command. |
| Signed MIN/-1 is a release-panic exception | The core's broad version-pin summary still presents integer overflow as debug-panic/release-wrap without the exception added elsewhere. |

These are not changes in style. The core is declared canonical and the command is a shipping
entry point; an agent following one surface can contradict the accepted correction in another.
The same pattern explains why merely keeping `skill/` and `skills/` byte-identical is insufficient.

Close the correspondence set across core, module, command and source summary. Prefer routing
to one authoritative rule over copying another expanded remedy. Add conflict-focused review
cases for resolved dependency versions, explicit span instrumentation and library borrowed views.
The workflow scoper's new Cargo.lock/metadata logic and plan's nine-question checklist are accepted.

### P2-08 — the rlib panic-strategy correction overgeneralizes to a cdylib host

Location: `skill/unsafe-and-ffi.md:118` (§B25); changed by `a7d7165`.

The previous rlib result remains valid: selecting unwind for that library does not isolate
it from an abort-strategy executable's linked panic runtime. The new text additionally says
the strategy is the executable **or cdylib host's**, and requires every running-binary profile
to unwind. A separate cdylib can contain its own unwinding runtime and catch its own panic
entirely before returning across the C ABI.

Executed on Windows/rustc 1.97.0:

```text
paniclib: --crate-type cdylib -C panic=unwind
panichost: -C panic=abort, imports the DLL's C function
DLL function: catch_unwind(|| panic!(...)) -> integer result
observed: caught_in_unwinding_dll=1; host exit 0
```

The normal panic hook prints inside the DLL; no unwind crosses the exported C boundary.
Do not undo the rlib correction. State the linkage unit/panic runtime precisely, and separate
internal DLL containment from unwinding *across* an FFI boundary.
[Rust linkage](https://doc.rust-lang.org/reference/linkage.html),
[Nomicon FFI unwinding](https://doc.rust-lang.org/nomicon/ffi.html#ffi-and-unwinding).

## P3 — precision and maintenance

### P3-01 — source-ledger corrections remain incomplete

Locations: `skill/references/sources.md:59`, `:74`, `:136`, `:155`, `:156`, `:188`, `:234`
and related core/async empirical summaries.

- SafeTrans's main denominator was corrected, but the later Codestral/DeepSeek entry still
  turns E0599 into “non-existent methods in up to 22% of cases.” Error-category share is not
  generated-program prevalence, and E0599 does not uniquely identify an invented API.
  [SafeTrans §5.2](https://arxiv.org/html/2505.10708v2).
- The field-report caveat now admits missing reproducible artifacts, yet its “proximate cause
  of half of async tasks” interpretation remains in the ledger/core/async narrative. The source
  is not sufficient evidence for that precise prevalence/causation claim.
- The source summary still mandates PhantomData for every raw-pointer wrapper, still makes
  adding a field to every public struct major, and still says a scoped child's panic skips
  ordinary parent statements between spawn and the brace. Corrected module text says otherwise.
- The Cargo #2524 summary remains unqualified by resolver v1. The password-hash source entry
  retains open-ended <=0.5/>=0.6 grouping instead of the exact supported minor/features already
  explained in the security module. Its TLS example still omits the iterable around a root
  certificate that the normative reqwest recipe correctly supplies.

Attach primary, version/section-specific support to each load-bearing statement and remove
contradicted summaries, not just add corrective paragraphs beside them. The new driver-state,
SafeTrans and JoinSet ledger corrections are useful and should remain.

### P3-02 — lifetime/variance calibration still contains contradictory definitions

Locations: `skill/lifetimes-and-api.md:90`, `:91`, `:99`, `:119`;
`skill/unsafe-and-ffi.md:85`, `:90`, `:92`;
`skill/drop-and-raii.md`'s outstanding-permit explanation.

- A first-release unsealed blanket implementation is now explicitly permitted, but the next
  REQUIRED bullet retains “blanket impl ... only when ... sealed.” Make the policy conditional
  on the intended external-implementation contract, not contradictory within one list.
- The new orphan-rule paragraph defines uncovered parameters in terms of another **type
  parameter's bound**. Coverage is about occurrence under a **type constructor**, with the
  fundamental-type exceptions. The core's fuller definition is the better one.
  [Rust coherence](https://doc.rust-lang.org/reference/items/implementations.html#trait-implementation-coherence),
  [Reference glossary](https://doc.rust-lang.org/reference/glossary.html#blanket-implementation).
- Yielding `&mut T` does not by itself require the wrapper to be invariant: exclusive access
  through `&mut self` can make a covariant owning container sound, as with Vec. Audit the
  access path, not just the returned reference. Retain the new fields-may-already-suffice rule.
  [Nomicon variance](https://doc.rust-lang.org/nomicon/subtyping.html).
- A proper Tokio `close()` plus `recv()`-until-`None` drain waits for outstanding permits.
  The new prose's “messages ... after a drain loop has ended” is not that API's terminal-None
  behavior. The real risk is a drain waiting indefinitely for unreleased send capability.
  [Tokio Receiver](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Receiver.html).

These qualifications do not reopen the fixed associated-type naming route, private newtype
field, non-exhaustive construction story or the main sender-clone shutdown correction.

### P3-03 — newly edited API/Cargo explanations still need exact verification

Locations: `skill/data-and-types.md:82`, `skill/deps-macros-ergonomics.md:22`, `:94`.

- `algebraic_mul_add` is listed as a new f32/f64 method, but is absent from the current
  Rust 1.98.1 API. The stabilized algebraic list includes add/sub/mul/div/**rem**. Keep the
  useful fast-math-law warning and correct the actual method list; do not mistake ordinary
  `mul_add` for an algebraic-family method.
  [Current f32 API](https://doc.rust-lang.org/std/primitive.f32.html#method.algebraic_add).
- The lockfile paragraph first says the resolved graph is pinned, then says neither mechanism
  constrains transitive versions unnamed in the manifest. A lockfile does record those
  transitive resolutions. Also, “conventionally not committed for libraries” is stale as a
  default recommendation: Cargo guidance changed in 2023. Committing a library's lockfile
  for its own CI does not force it on downstream consumers.
  [Cargo lockfile guidance](https://blog.rust-lang.org/2023/08/29/committing-lockfiles/).
- The new exclusive-feature rejection example needs a matching matrix policy. A raw
  `cargo hack --feature-powerset check` also tries deliberately rejected combinations;
  configure exclusions/mutual-exclusivity or assert those failures separately rather than
  expecting every generated combination to succeed.
  [cargo-hack feature combinations](https://github.com/taiki-e/cargo-hack#usage).

The rustls/lru freshness snapshots were correctly dated, and the existing named advisory
floors were not found invalid by this pass. Absence of a new advisory finding is not a claim
that every catalog dependency was independently security-audited.

## Disposition of all 48 first-round finding groups

“Closed” means the original concrete objection is addressed in the reviewed source/evidence;
it is not a blanket certification of the module. A newly found defect is not charged again
under the old ID merely because it is nearby. IDs in this table are **round 52 IDs**.

| Previous ID | Disposition in round 2 |
|---|---|
| P1-01 | Closed: serial/concurrent/reentrant callback access and lifetime are separated. |
| P1-02 | Closed: shell escaping is constrained to the actual interpreter; no universal shell-escape remedy. |
| P1-03 | Closed: HTML contexts, quotes and URL schemes are qualified. |
| P2-01 | Closed for the observed hosted inventory case: exact-head Windows recovery passes. New interactive cleanup defect is P1-01 here. |
| P2-02 | Original rlib objection closed; the new cdylib generalization is P2-08 here. |
| P2-03 | Closed: waker registration ordering and Notify recheck/rearm are now required. |
| P2-04 | Closed: message preservation is distinguished from waiter-queue position. |
| P2-05 | Closed: same-task join branches are explicitly excluded from block_in_place progress promises. |
| P2-06 | Closed: primitive-specific nonce construction, per-key budgets and tag/message limits are named. |
| P2-07 | Original proxy/hop/budget omissions closed; the incorrect destination-policy alternative is a separate P1-02 here. |
| P2-08 | Closed for evicting an initializer already running: the policy must retain it or coordinate generations. Any implementation still needs a total admission/memory bound. |
| P2-09 | Partially closed: signed division/remainder fixed in module and triggers; the broad core version summary still needs alignment. |
| P2-10 | Closed: DTO/writable-field policy is separated from strict parsing. |
| P2-11 | Open: module and source ledger still offer stack growth instead of a resource budget; P2-04 here. |
| P2-12 | Module resolver-v3 correction accepted; historical source summary still needs v1 qualification under P3-01 here. |
| P2-13 | Partially closed: module/source git-locking and Vet corrections are not propagated to core/router. |
| P2-14 | Additivity correction accepted; matrix handling of intentionally invalid combinations is P3-03 here. |
| P2-15 | Closed: acquisition, workspace-open/trust and build execution surfaces are named. |
| P2-16 | Partially closed: scoper, fix and plan improved; audit command and residual blocking/routing conflicts remain. |
| P2-17 | Closed in the current README/helper: both forging assumptions are explicit; historical claims are not renewed by this report. |
| P2-18 | Closed: blanket-impl changes require manual/downstream coverage, not a promised semver-checker gate. |
| P2-19 | Closed: consumed transaction and ambiguous commit outcome are distinguished. |
| P2-20 | Main clone/permit revocation correction accepted; terminal-None wording is P3-02 here. |
| P2-21 | Closed: structural migration review is required despite silent lints. |
| P2-22 | Partially closed: abort paths are fixed in the body, not the canonical code trigger. |
| P3-01 | Closed: nonzero draw floor, runtime range check and forced-zero rejection. |
| P3-02 | Partially closed: no-universal-PhantomData calibration added; mutable-access variance and source summary remain over-broad. |
| P3-03 | Closed for the original stack-size, checked-multiply placement and allocator-API qualification objections. |
| P3-04 | Original mutable-AsyncRead compilation issue closed; connection ownership now exposes P2-01 here. |
| P3-05 | Partially closed: module instrumentation/task-local explanation corrected, core instrumentation form still stale. |
| P3-06 | Target-specific WASM qualification accepted; this pass did not execute a WASM runtime matrix. |
| P3-07 | Module fixed; source-ledger panic timing remains incorrect. |
| P3-08 | Partially closed: capacities/rounding explained, but new debug-only fallback is P2-05 here. |
| P3-09 | Closed: blocking_send is allowed from a genuinely synchronous producer under its stated policy. |
| P3-10 | Closed: negative signed shift counts and masking interpretation added. |
| P3-11 | New-API law coverage added; nonexistent method name is P3-03 here. |
| P3-12 | Main heuristic/target-width/DashMap calibration accepted; the residual bytes-versus-elements shorthand should be cleaned up with documentation precision work. |
| P3-13 | Partially closed: range-testing/duplicate-version calibration improved; lockfile transitive/library explanation is P3-03 here. |
| P3-14 | Closed: rustls/lru observations updated and dated, advisory floor distinguished. |
| P3-15 | Closed: exact patched Rust 1.97.1 CI pin. |
| P3-16 | Closed: counter reproducibility now includes input/hasher/scheduling state. |
| P3-17 | Closed for the original length-policy and JWT-profile qualifications. |
| P3-18 | Partially closed: first-release blanket/orphan nuance added, contradictory sealing/coverage definition remains. |
| P3-19 | Closed: public associated-type projections are a naming route. |
| P3-20 | Module tradeoff corrected; core lifetime trigger still contradicts it. |
| P3-21 | Original private-field/transparent-ABI recommendation corrected. |
| P3-22 | Construction options corrected; source-ledger public-field major-change overclaim remains. |
| P3-23 | Partially closed: SafeTrans denominator, field-report reproducibility caveat, driver references and JoinSet summary improved; P3-01 here lists remaining contradictions. |

## Coverage summary and release acceptance

| Theme/surface | Result of the full pass |
|---|---|
| Async | Full body reviewed; new owned-connection/TLS findings, accepted wakeup/fairness/bridging fixes. |
| Unsafe/FFI | Full body reviewed; original callback issue closed, recursion budget remains open, dynamic-library scope corrected by a probe. |
| Concurrency/state | Full body reviewed; single-flight and channel-policy corrections accepted within stated scope; release-disabled capacity guard rejected. |
| Data/types | Full body reviewed; numeric/mass-assignment fixes accepted; three-state serialization and actual algebraic API checked. |
| Security | Full body reviewed; original shell/nonce/proxy qualifications accepted; direct SSRF and static dangling-link write cases established. |
| Dependencies/macros | Full body/catalog reviewed; resolver/Vet/additivity fixes accepted with core/source and matrix qualifications. |
| Drop/RAII | Full body reviewed; commit, clones and migration fixes accepted; permit wording needs precision. |
| Lifetimes/API | Full body reviewed; original API calibration largely improved; remaining definitions/conflicts explicitly listed. |
| Testing | Full body reviewed; deterministic-counter correction accepted. Actual suite and focused positive/negative probes distinguish mechanism from merely green status. |
| Semantic conformance | Full body reviewed; external versus self-oracle, persisted layouts, lifecycle deadlines and inverse laws retained. No separate new finding manufactured for an unchanged module. |
| Installers/packaging/CI | Node transaction/ownership logic and changed Windows paths reviewed; full CI, local validation, packaging and version/calibration checks pass, but the untested interactive preservation transition fails. |

Before release:

1. Replace PowerShell cleanup with a genuinely nonrecursive primitive and add the
   **install → foreign content added → uninstall/recover** preservation case on both shells.
2. Correct the destination-policy alternative and the demonstrated Rust recipe defects.
   Compile/run positive recipes with their stated dependencies; keep absent/null/value,
   cancelled-owned-stream and single-thread task-interleaving negative cases.
3. Close core/module/command/source contradictions. Byte-identical mirrors are necessary
   but do not establish agreement between different documents inside either tree.
4. Preserve strict fixture oracles. A green recovery run does not justify relaxing inventory
   checks, and a literal assertion/count is not proof of a prose recommendation's semantics.
5. Re-run ordinary validation and the complete required platform matrix on the final fixed
   candidate, inspect the packed artifact, and obtain the repository's required independent
   acceptance. No final release SHA or publication is authorized by this report.

Task disposition: source/commit review, all-theme review, test/release-evidence checks and
report synthesis are completed by this review. Remediation is intentionally not claimed.

Housekeeping limitation: the environment rejected automated cleanup of the temporary review
worktree and interactive-test directory. They were retained, contain only review fixtures/build
outputs, and are not part of this commit or package. No probe or test process remains running.
