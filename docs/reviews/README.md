# Review ledger

The five gap audits below were merged into v0.4.7. This ledger records the second-pass corrections so future audits do not treat historical review prose as current rule text.

| Review | v0.4.7 status | Second-pass action |
|---|---|---|
| crypto/secrets | Integrated | Corrected zeroization wording; moves/copies and reallocations are caveats, not a universal `memcpy` claim. |
| FFI/unsafe | Integrated | Corrected the union rule: a read needs valid bits for the selected field type; a tag is required only for a tagged-union contract. |
| deserialization/DoS | Integrated | Direct Serde struct visitors commonly reject duplicate fields; last-wins is a separate `Value`/map/custom-path policy. `serde_yaml` wording is version-aware. |
| concurrency/exhaustion | Integrated | No rule rollback; workflow now also audits admission-control artifacts outside `*.rs`. |
| supply-chain/build | Integrated | No rule rollback; workflow now includes lockfiles, toolchains, CI, scripts, and policy files. |

## Historical-count erratum

The crypto review's prose count was inconsistent with its listed candidates. The integrated change set contains the five in-scope crypto findings plus two explicitly out-of-scope candidates; it is not a thirteen-item result. Use the rule ledger and changelog bullets as authoritative, not the old arithmetic sentence.

## Review quality gate

Every future gap review must include: (1) a candidate inventory, (2) positive and negative calibration examples, (3) a primary source per accepted rule, (4) an explicit out-of-scope list, and (5) a post-merge regression entry in `docs/checkpoints/` or the repository's current checkpoint mechanism.
