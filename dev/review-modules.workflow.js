// Parallel per-module review of the rust-intel skill.
// One agent per skill/ module (each goes DEEP on its small module across all
// lenses), then a synthesis agent merges + prioritizes. Run via:
//   Workflow({ scriptPath: "dev/review-modules.workflow.js" })
// Maintainer tool — not installed to users. Keep MODULES in sync with skill/.

export const meta = {
  name: 'review-rust-intel-modules',
  description: 'Parallel per-module review of the rust-intel skill: one agent per module (all lenses, deep since each module is small), then a synthesis agent merges findings.',
  phases: [
    { title: 'Review', detail: 'one agent per skill/ module, all lenses' },
    { title: 'Synthesize', detail: 'merge + dedup + prioritize findings' },
  ],
}

const DIR = 'D:/dev/rust/rust-intel/skill'
const MODULES = [
  'SKILL.md',
  'lifetimes-and-api.md',
  'async.md',
  'concurrency-and-state.md',
  'unsafe-and-ffi.md',
  'data-and-types.md',
  'security.md',
  'drop-and-raii.md',
  'deps-macros-ergonomics.md',
  'testing.md',
  'semantics-and-conformance.md',
]

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['module', 'score', 'findings', 'summary'],
  properties: {
    module: { type: 'string' },
    score: { type: 'number', description: '0-10 quality of this module' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'lens', 'location', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] },
          lens: { type: 'string', description: 'correctness | logic | precision | calibration | anti-stupidity' },
          location: { type: 'string', description: '§id and/or quoted anchor' },
          quote: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

function reviewPrompt(m) {
  return `Review ONE module of the rust-intel skill: ${DIR}/${m}

It is a self-contained module of a "defense against LLM Rust failure modes" spec — it holds category bodies (BANNED/REQUIRED rules for bugs that survive rustc/clippy/tests). The CORE (operating mode, blocking protocol, enforcement tiers, the trigger table, version pins, and the category->module map) lives in SKILL.md; you do NOT need it to judge this module.

Read the whole module (it is small — go DEEP, not broad-and-shallow). Apply ALL these lenses to THIS module only:
1. Technical correctness — wrong Rust facts (APIs, semantics, UB, atomics, async cancellation, FFI ABI, edition/version claims).
2. Internal logic/consistency — a rule contradicting another in this module; BANNED vs REQUIRED mismatch.
3. Precision of the prescribed fix — vague/incomplete/wrong-in-some-cases remedies; does the fix actually close the hazard it names?
4. Calibration / anti-zealotry — absolutism where nuance is needed; cargo-cult ceremony; false-positive-prone triggers.
5. Anti-stupidity / foot-guns — advice a literal-minded model would apply to make things WORSE; security theater.

IMPORTANT: cross-references to OTHER modules (e.g. "see §B25", "§E4 -> §A2/§B2") are navigational BY DESIGN after the doc was split into modules — do NOT flag them as broken links or as defects.

Return: the module name, a 0-10 score, a list of findings (each: severity, lens, location with §id + short quote, problem, concrete fix), and a one-line summary. Be rigorous and honest — report only real issues, no quota-filling. If the module is clean, say so with few/zero findings.`
}

phase('Review')
const reviews = (await parallel(
  MODULES.map((m) => () =>
    agent(reviewPrompt(m), { label: `review:${m}`, phase: 'Review', schema: REVIEW_SCHEMA })
  )
)).filter(Boolean)

phase('Synthesize')
const totalFindings = reviews.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0)
const synthesis = await agent(
  `You are synthesizing a per-module review of the rust-intel skill. Below is JSON: an array of per-module review results (module, score, findings[], summary).

Produce a single prioritized report:
- Group by severity (Critical -> Major -> Minor); within each, order by how load-bearing the fix is.
- Dedup findings that recur across modules (state "recurs in: <modules>").
- For each kept finding: module, §location, one-line problem, one-line fix.
- Flag any finding that looks arguable vs solid.
- End with: per-module scores table, total finding counts by severity, and the 3 highest-value fixes to make first.

Do NOT invent findings not present in the input. JSON input:
${JSON.stringify(reviews)}`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { moduleCount: MODULES.length, totalFindings, perModule: reviews, synthesis }
