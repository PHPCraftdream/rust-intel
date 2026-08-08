# Regression fixtures

`fixtures/cases.json` declares the expected findings for two hand-written controls. `node dev/validate-fixtures.mjs` runs a pair of crude source probes over them: the negative control must report §B5 and §B26, the positive control must stay clean.

**What this is and is not.** It is a *calibration seed* — a regression tripwire proving the union-validity and shift-count controls still discriminate, plus a structural check that the categories they cite still exist and are still routed from `SKILL.md`. It is **not** a measure of what the audit catches: two fixtures and two regexes are a floor, not coverage. The probes also deliberately assert nothing about rule *wording* — pinning prose in CI would turn every legitimate rewrite into a red build and freeze whichever phrasing shipped first. Agent-level recall over a per-category corpus of deliberately broken Rust remains future work ([`docs/roadmap.md`](../docs/roadmap.md) §4).
