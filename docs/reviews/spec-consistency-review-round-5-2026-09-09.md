# Spec consistency review — round 5, 2026-09-09

Base: `1dfd3f2`.

Scope: a bounded review of `security.md` (§B12/§B24/§C2), its affected core
triggers and supporting sources. Other theme modules, the full advisory/version
inventory and installer internals were not substantively re-audited. No subagents
were used. Earlier-round findings are not counted again.

## Findings and fixes

### P2 — error opacity was extended beyond the authentication boundary

§B24 and the §C2 carve-out required one opaque error for every post-decryption
parse failure. This could erase protocol-required distinctions even when the
record had already passed authentication.

The normative counterexample is TLS 1.3: failed record deprotection requires
`bad_record_mac`, while successfully decrypted inner plaintext with no nonzero
content-type octet requires `unexpected_message`. These are different stages.

Fixed the rules and triggers to preserve opaque authentication failures and
prevent unauthenticated-plaintext oracles, while retaining protocol/disclosure
policy after authentication. A uniform error body alone is not a timing defense.
[RFC 8446 §5.2](https://www.rfc-editor.org/rfc/rfc8446#section-5.2),
[RFC 8446 §5.4](https://www.rfc-editor.org/rfc/rfc8446#section-5.4).

### P2 — fixed-width hashing was presented as secret-length protection

§B24 suggested hashing both operands before comparison when length is sensitive.
This fixes the comparison width, not preprocessing work. In sha2 0.10.9,
SHA-256 consumes 64-byte blocks and the software backend iterates over them.
Inference: different secret lengths can cause different work before comparison
when hashing happens inside the observable request path.

Fixed the rule to require a defined observation boundary and reviewed fixed-size
representation/processing strategy for length hiding. Fast digests are not a
replacement for a password-verification KDF. This is source-level reasoning;
no timing benchmark or demonstrated remote exploit is claimed.
[SHA-256 block processing](https://raw.githubusercontent.com/RustCrypto/hashes/sha2-v0.10.9/sha2/src/core_api.rs),
[Software compression loop](https://raw.githubusercontent.com/RustCrypto/hashes/sha2-v0.10.9/sha2/src/sha256/soft.rs).

### P2 — argument separation was described as a universal Windows guarantee

§C2 promised that each `.arg()` becomes exactly one argv element without shell
parsing. Windows children parse a command-line string; conventional native
parsers, custom parsers and batch wrappers are different contracts.

A rustc 1.97.0 probe compared a native child with a simple `.cmd` forwarding
wrapper. Metacharacter and percent-variable literals arrived unchanged in both.
A newline-bearing value arrived intact natively but was rejected by the batch
spawn with `InvalidInput`. Assertions checked exact successful outputs and the
expected rejection. This is a boundary diagnostic, **not** an injection exploit.

Fixed the guidance and triggers to account for child parsing, implicit batch
shell handling, explicit rejection and target-specific option/operand syntax.
`--` is conditional on target support; rejecting a batch input is not permission
to bypass the protection with raw shell text.
[Rust process argument contract](https://doc.rust-lang.org/std/process/index.html#windows-argument-splitting),
[Command::arg](https://doc.rust-lang.org/std/process/struct.Command.html#method.arg).

### P2 — the cookie rule rejected required cross-site flows

§C2 mandated Lax or Strict on every session/auth cookie. The HTTPWG cookie draft
explicitly identifies cross-site embedding and SSO cases needing None, and login
POST flows broken by Lax.

Fixed the policy to preserve HttpOnly/Secure for session credentials while
choosing SameSite for the actual flow. Intentional None requires Secure and
appropriate CSRF/state validation; browser delivery restrictions still matter.
A cookie 0.18.2 diagnostic serialized and reparsed a synthetic session cookie,
asserting `SameSite=None`, `Secure` and `HttpOnly`. It did not test a browser or
claim that these attributes alone prevent CSRF.
[HTTPWG cross-site use cases](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#name-mashups-and-widgets),
[SameSite API](https://docs.rs/cookie/0.18.2/cookie/enum.SameSite.html).

### P2 — directory ensure was conflated with exclusive creation

§C2 grouped `create_dir_all` with exists-then-`File::create` and prescribed
exclusive creation as the general remedy. That changes a recursive, idempotent
ensure operation into a different contract.

The diagnostic checked repeated recursive ensure, two concurrent creators
synchronized after both observed absence, a missing-parent `create_dir` control
and repeated exclusive file creation. Both recursive creators succeeded;
the controls returned `NotFound` and `AlreadyExists`, respectively.

Fixed the rule to call `create_dir_all` directly for ensure, reserve exclusive
creation for that requirement, and retain error/partial-parent and containment
caveats. The concurrency case used a barrier, not timing sleeps or stress load.
[create_dir_all contract](https://doc.rust-lang.org/std/fs/fn.create_dir_all.html),
[Exclusive file creation](https://doc.rust-lang.org/std/fs/struct.OpenOptions.html#method.create_new).

## Verification and limits

- Standalone std diagnostics passed on rustc 1.97.0, edition 2024,
  `x86_64-pc-windows-msvc`. The final cookie diagnostic passed with
  `cargo run --offline --locked`, pinned to cookie 0.18.2.
- `npm run validate` passed both phases: core checked 12 skill Markdown files;
  fixture validation reported 2 cases and **494 controls executed**. This run
  included all rule, trigger and source edits; only this result report was added
  afterward. These tooling controls do not measure semantic audit coverage.
- Skill validation, canonical/mirror agreement (13 files), and
  `git diff --check` passed.
- No cryptographic implementation, secret-bearing service, timing benchmark,
  installer code, dependency version or project version was changed. The source
  arguments are not claims of constant-time or TLS implementation testing.
- No push or release was performed; the pre-existing untracked `.githooks/`
  directory was left untouched.

All five P2 findings are addressed within this scope. The `skill-creator`
discipline kept requirements tied to the actual contract and avoided replacing
one universal claim with another.
