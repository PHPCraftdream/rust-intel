# Gap audit — cryptography, secrets handling, randomness

> **Status:** Historical input to v0.4.7. The current rules and second-pass corrections are tracked in [`README.md`](README.md) and the canonical modules; this file is not normative.

Scope: what is MISSING from the current §B12 (crypto), §B24 (constant-time), §C2 (error/injection) bodies in `skill/security.md`, restricted to bugs that compile, pass `cargo test`, and break or leak in production. Baseline read in full: `skill/security.md` (all of §B12/§B24/§C2) and `skill/SKILL.md` (trigger tables, tier definitions, version pins). Coverage was verified by grepping the entire `skill/` tree for `salt`, `jwt`, `aud`, `issuer`, `tls`, `certificate`, `zeroize`, `secrecy`, `argon2`, `padding oracle` — not by trusting headers. Already-covered candidates were discarded (see verdict).

Each entry: why in-scope → why not covered → minimal compiles-but-broken example → source → suggested tier → placement.

---

## Gap 1 — TLS certificate / hostname validation bypass (`danger_accept_invalid_certs` and friends)

**Why in-scope.** `ClientBuilder::danger_accept_invalid_certs(true)` (and `danger_accept_invalid_hostnames(true)`, or a custom rustls `ServerCertVerifier` that returns `Ok` unconditionally) is the canonical LLM move when a request against a dev/self-signed endpoint fails with a certificate error — the cheapest fix that compiles. It passes every test (tests run against localhost or a mock with exactly such a cert), and in production silently accepts any certificate for any site → full MITM on every connection. This is precisely the Tier-A-shaped reflex ("compiler/runtime complained, silence the symptom") landing in Tier-B security territory.

**Why not covered.** `skill/security.md` never mentions TLS, certificates, hostname verification, `reqwest`, or `rustls` verifiers. §B12 lists `rustls` once — only as a *recommended* high-level library ("Default to high-level libraries (`age`, `ring`, `rustls`)"). The SKILL.md trigger row for "TLS" points to §B12 ("Nonce reuse, weak primitives, hallucinated crypto API") — none of which is this bug. Grep for `certificate`/`accept_invalid` across `skill/`: zero hits.

**Minimal example (compiles, tests green against a local self-signed server, MITM in prod):**
```rust
let client = reqwest::Client::builder()
    .danger_accept_invalid_certs(true)   // "fix" for the dev cert error
    .build()?;
let secret = client.post(api_url).bearer_auth(token).send().await?;
```

**Source.** Official `reqwest` docs: "If invalid certificates are trusted, *any* certificate for *any* site will be trusted for use... introduces significant vulnerabilities" — https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.danger_accept_invalid_certs ; catalogued as a vulnerability pattern e.g. https://www.sourcery.ai/vulnerabilities/rust-reqwest-accept-invalid-certs (CWE-295).

**Severity.** 🔴 — high blast-radius, invisible to tooling and to every test, security guarantee silently voided (same footing as §B12's other entries).

**Placement.** New BANNED bullets in §B12 (the `danger_*` builder methods and no-op `ServerCertVerifier` impls outside `#[cfg(test)]`), plus a code-pattern trigger row in SKILL.md (`danger_accept_invalid_certs` / `danger_accept_invalid_hostnames` / `verify_server_cert` returning unconditional `Ok`). The correct fix belongs in the bullet: pin the internal CA via `add_root_certificate(Certificate::from_pem(..))`, never disable validation.

---

## Gap 2 — JWT claim validation beyond `alg: none`: `aud`/`iss` unchecked, `validate_exp` disabled

**Why in-scope.** The `jsonwebtoken` crate validates `exp` by default, but `aud`/`iss`/`sub` are checked **only if you set expected values on `Validation`** — and `aud` is checked only when the token *contains* one, unless `"aud"` is added to `required_spec_claims`. LLM copy-paste from the crate README yields `decode::<Claims>(&token, &key, &Validation::new(Algorithm::HS256))`: signature and `exp` verified, audience and issuer wide open. Any token minted by the same key for a *different* service (or a different tenant's issuer in a shared-IdP setup) authenticates. Tests pass — they use tokens minted by the test itself, which trivially match. A second variant: LLMs set `validation.validate_exp = false` (or `insecure_disable_signature_validation()`) to make an expired test fixture pass, and it ships.

**Why not covered.** §B12's single JWT bullet covers exactly one thing: "JWT verification accepting the `none` algorithm. Always pin allowed algorithms..." — algorithm confusion only. Nothing in `skill/` mentions `aud`, `iss`, expiry, `required_spec_claims`, or token-audience cross-service replay (grep confirmed). Pinning `Algorithm::HS256` per the existing bullet still leaves this hole open.

**Minimal example:**
```rust
// Follows the existing §B12 rule (algorithm pinned) — still broken:
let v = Validation::new(Algorithm::RS256);          // aud: None, iss: None
let data = decode::<Claims>(&token, &pubkey, &v)?;  // token minted for ANOTHER
// service by the same IdP key decodes fine — no audience check ever ran.
```
Fix: `v.set_audience(&["my-service"]); v.set_issuer(&["https://idp.example"]); v.set_required_spec_claims(&["exp", "aud", "iss"]);`.

**Source.** Official `jsonwebtoken` docs for `Validation`: `aud` "defaults to `None`", "validation only happens if the `aud` claim is present in the token; adding `aud` to `required_spec_claims` will make it required" — https://docs.rs/jsonwebtoken/latest/jsonwebtoken/struct.Validation.html ; OWASP JWT guidance requires audience/issuer verification (https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html — the claim-validation requirements are language-independent).

**Severity.** 🔴 — authentication bypass, silent, tests structurally cannot see it (self-minted tokens always match).

**Placement.** Extend the existing §B12 JWT bullet from "pin the algorithm" to a three-part rule: pin algorithms, set `aud`+`iss` expected values, and add them to `required_spec_claims`; BAN `validate_exp = false` and `insecure_disable_signature_validation()` outside `#[cfg(test)]`. Add a trigger row: "verify a JWT", "decode the token" → §B12 (claims, not just `alg`).

---

## Gap 3 — KDF salt misuse: missing / hardcoded / reused salt; below-floor Argon2/PBKDF2 parameters

**Why in-scope.** Two adjacent LLM patterns: (a) hashing every password with the same hardcoded salt (`SaltString::from_b64("c2FsdA")` or `b"somesalt"`) or deriving the salt from the username deterministically — identical passwords produce identical hashes, rainbow/batch attacks return; (b) explicit weak parameters — `Params::new(8, 1, 1, None)` for Argon2 or `pbkdf2::<HmacSha256>(pw, salt, 1000, &mut out)` — chosen because the test suite runs faster. Both compile, both round-trip (`verify` succeeds), both pass tests, and the damage is only visible after a database dump. LLMs also copy pre-2023 PBKDF2 iteration counts (1 000–10 000) from old StackOverflow answers.

**Why not covered.** §B12 says "insufficient PBKDF2 iterations" in the *dangerous patterns* prose (no floor, no rule) and "For password hashing: `argon2`, not bare PBKDF2 or plain SHA-256" in REQUIRED. It never mentions the word "salt" anywhere in `skill/` (grep confirmed), never gives parameter floors, and "use `argon2`" does not prevent calling `argon2` with a fixed salt or degenerate params — the crate happily accepts both.

**Minimal example:**
```rust
// Uses argon2, per the existing §B12 rule — still broken:
let salt = SaltString::from_b64("c3RhdGljc2FsdA").unwrap(); // same for every user
let hash = Argon2::default().hash_password(pw.as_bytes(), &salt)?;
// verify() round-trips, tests pass; every duplicate password now has an
// identical hash and one cracked hash cracks the whole cohort.
```
Fix: `SaltString::generate(&mut OsRng)` per user; params at or above the OWASP floor (Argon2id m=19 MiB, t=2, p=1; PBKDF2-HMAC-SHA256 ≥ 600 000 iterations).

**Source.** OWASP Password Storage Cheat Sheet — "a unique salt must be added to each password"; Argon2id minimum 19 MiB / t=2 / p=1; PBKDF2 work factor 600 000 with HMAC-SHA-256 — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (parameter floors per NIST SP 800-63B-aligned 2023+ guidance).

**Severity.** 🔴 — falls under "§B12 any cryptographic operation" per SKILL.md's own Enforcement tiers; the failure is silent and catastrophic on breach.

**Placement.** New bullets inside §B12: BANNED — fixed/derived/reused salts for password hashing or key derivation; REQUIRED — `SaltString::generate(&mut OsRng)` (or the KDF API's own salt generator) per user/derivation, and concrete parameter floors with the OWASP citation (mirrors how §B12 already pins nonce width to 96 bits).

---

## Gap 4 — Zeroization defeated by moves and reallocation (`#[derive(ZeroizeOnDrop)]` is not the whole rule)

**Why in-scope.** §B12 already mandates the `zeroize` derive, but the derive only zeroes the *final* location on drop. Rust moves are memcpy: a secret built on the stack and returned/moved leaves a live byte-copy at the old address; a `String`/`Vec` that reallocates while a secret is pushed into it leaves the secret in the freed old buffer — `Zeroize` explicitly "cannot guarantee copies of the data were not previously made by buffer reallocation". An LLM that dutifully adds `#[derive(Zeroize, ZeroizeOnDrop)]` and then does `let key = read_key()?; store.set(key);` (move) or `password.push_str(&extra)` (realloc) has satisfied the current rule and still leaks. Compiles, passes tests (nothing observes freed memory), leaks in core dumps / swap / heap-inspection in production.

**Why not covered.** The §B12 "Additional REQUIRED" bullet covers only "use the derive, don't hand-roll a zeroing `Drop`". Nothing in `skill/` mentions the move/realloc copy hazard, `secrecy`'s no-realloc rationale, or Box-pinning of secrets (grep for `secrecy` hits only the Debug-redaction bullet, a different concern).

**Minimal example:**
```rust
#[derive(Zeroize, ZeroizeOnDrop)]
struct Key([u8; 32]);

fn load() -> Key { let k = Key(derive_bytes()); k }  // return = move = memcpy
let key = load();          // stale copy of all 32 bytes left at load()'s frame
// ZeroizeOnDrop later zeroes `key`'s final address only.
```
Fix: allocate the secret behind `Box`/`SecretBox<T>` (the `secrecy` crate) *at creation* so moves copy only the pointer; pre-size `Vec`/`String` secrets to final capacity to prevent realloc.

**Source.** Official `zeroize` docs, "A note on copying data" — moves, `Copy`, and `Vec`/`String` reallocation leave unzeroed copies; points at `secrecy` as the mitigation — https://docs.rs/zeroize/latest/zeroize/ ; concrete demonstration: https://benma.github.io/2020/10/16/rust-zeroize-move.html .

**Severity.** 🟡 — real but lower blast-radius (requires memory disclosure to exploit); write-time discipline, surfaced when key material is long-lived.

**Placement.** Extend the existing §B12 "Additional REQUIRED" zeroize bullet: derive is necessary, not sufficient — secrets live behind `Box`/`SecretBox` from birth, no post-construction moves of by-value key arrays, no realloc of secret buffers.

---

## Gap 5 — Decryption-failure oracle: distinguishable errors reveal padding/MAC state

**Why in-scope.** §B24 covers exactly one side channel: *timing of `==`*. The sibling channel is the **error content/shape**: a decrypt endpoint that returns (or logs, or maps to distinct HTTP statuses) "bad padding" vs "MAC mismatch" vs "invalid UTF-8 after decrypt" hands the attacker a decryption oracle — the classic padding-oracle shape (CWE-208/209, Vaudenay). LLMs produce this naturally: idiomatic Rust error handling (`thiserror` enum with `#[error("invalid padding")]` / `#[error("mac verification failed")]`, `?`-propagated to the response) is *good style everywhere else* and a vulnerability here. Compiles, passes tests (tests check that decryption fails — they even assert the distinct variants), exploitable byte-at-a-time in production. Also arises when an LLM hand-assembles CBC+HMAC instead of an AEAD and checks padding before (or distinguishably from) the MAC.

**Why not covered.** §B24's trap statement is exclusively about `==` short-circuit timing; its REQUIRED list is `ct_eq`/`verify_slice`. §B12 mentions neither error oracles nor the rule "decryption failure is one opaque error". §C2 actively pushes the *opposite* direction for general code ("carry context", "the error can no longer say which operation failed" is framed as a bug). No `skill/` text reconciles the two (grep for `oracle` hits nothing in this sense).

**Minimal example:**
```rust
#[derive(thiserror::Error, Debug)]
enum DecryptError {
    #[error("invalid padding")] Padding,        // distinct, per §C2 good practice
    #[error("mac verification failed")] Mac,    // — and together, an oracle
}
// handler: Err(e) => (StatusCode::BAD_REQUEST, e.to_string())  // ships the oracle
```
Fix: collapse every decryption/verification failure into one uniform error value and one code path (AEAD crates like `aes-gcm` already return the opaque `aead::Error` — *preserve* that opacity through the error-mapping layers; don't "improve" it with context).

**Source.** CWE-208 (Observable Timing/Behavioral Discrepancy) and CWE-209 (Error Message Information Exposure) — https://cwe.mitre.org/data/definitions/208.html , https://cwe.mitre.org/data/definitions/209.html ; the `aead` trait's deliberately opaque `Error` type documents the rationale — https://docs.rs/aead/latest/aead/struct.Error.html ("intentionally opaque to avoid sidechannel leakage").

**Severity.** 🔴 when the distinguishable error crosses a trust boundary (network response) — it is a plaintext-recovery channel on par with §B24's charter; 🟡 for logs-only exposure.

**Placement.** Best as a widening of §B24 from "timing attacks via `==`" to "side channels on secret-dependent branches" — new BANNED bullet (distinct error variants/messages/statuses distinguishing padding vs MAC vs post-decrypt parse failures across a trust boundary) plus an explicit carve-out note in §C2 ("error context stops at the crypto boundary — see §B24"). Alternatively a lettered §B24a.

---

## Gap 6 — Low-level RSA decrypt/sign on a network path: crate-documented timing side channels (RUSTSEC-2023-0071 as a pattern)

**Why in-scope.** The pure-Rust `rsa` crate carries an open, unfixed advisory: private-key operations are not constant-time, and the leak is "observable over the network" (Marvin attack; key/plaintext recovery from decryption timing alone). This is a *pattern*, not a one-off: LLMs reach for `rsa` because it is the obvious crates.io name, wire `decrypt(Pkcs1v15Encrypt, ..)` into a request handler, everything compiles and round-trips, and the deployment is remotely attackable by timing measurements with no code bug at all — the bug is the primitive choice + exposure context. The mitigation is architectural (avoid PKCS#1 v1.5 decryption on attacker-timed paths; prefer key exchange via audited constructions, or keep the advisory-carrying operation off network-observable paths), which is exactly the threat-model conversation §B12's blocking protocol exists for.

**Why not covered.** §B12 bans hand-rolled primitives and hallucinated APIs, and names `rust-crypto` (RUSTSEC-2022-0011) as unmaintained — but says nothing about *maintained, correctly-used* crates whose advisories are open by design, and nothing about consulting `cargo audit`/RUSTSEC before selecting a crypto crate. Grep for `rustsec`/`cargo audit`/`rsa` in `skill/`: only the `rust-crypto` mention.

**Minimal example:**
```rust
// Correct API usage per the crate docs — still remotely attackable:
let plaintext = priv_key.decrypt(Pkcs1v15Encrypt, &ciphertext_from_client)?;
```

**Source.** RUSTSEC-2023-0071 / CVE-2023-49092, "Marvin Attack: potential key recovery through timing sidechannels", status: no fixed upgrade available — https://rustsec.org/advisories/RUSTSEC-2023-0071.html ; upstream advisory https://github.com/RustCrypto/RSA/security/advisories/GHSA-c38w-74pg-36hr .

**Severity.** 🟡 — the rule is a selection/exposure discipline ("run `cargo audit` on crypto deps; a crate with an open side-channel advisory does not go on an attacker-timed path"), not a bannable code pattern; escalates to 🔴 via the existing "§B12 any cryptographic operation" umbrella when it actually ships.

**Placement.** New REQUIRED bullet in §B12: before adding any crypto dependency, check RUSTSEC (`cargo audit`) and state open advisories in the threat-model proposal; name `rsa`/Marvin as the worked example alongside the existing `rust-crypto` note.

---

## Verdict

Ten candidates were investigated; six survived. Rejected as **already covered**: predictable/seedable RNGs and non-CSPRNG token generation (§B12 BANNED explicitly covers `SmallRng`/`StdRng`/seedable RNGs and pins the `rand` 0.8/0.9 accessor split in SKILL.md's version pins); SHA-256-for-passwords (§B12 REQUIRED names argon2 "not … under any circumstances plain SHA-256"); JWT `alg: none` (existing §B12 bullet); `Debug`-leak of secrets (§B12 has a detailed role-scoped bullet); MAC verification via `==` (§B24 REQUIRED already mandates `verify_slice`). Rejected as **out of scope or too thin**: `rand`/`getrandom` feature-flag traps (the failure mode is predominantly a compile/link error, which the spec's charter excludes) and secrets-in-environment-variables at runtime (real, but platform-generic rather than Rust-specific, and §B12 already bans compile-time embedding). The six survivors are genuinely absent from the module text — most strikingly, the words "salt", "certificate", and "aud" appear nowhere in `skill/` today — and three of them (TLS bypass, JWT claims, salt/params) are the highest-frequency crypto mistakes in LLM-generated web-service code, arguably more common in practice than the nonce-reuse case the current §B12 leads with.
