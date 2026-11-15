// Parallel per-sphere review of the rust-intel skill.
// One agent per sphere file (a few categories each — small enough to read in full and go DEEP
// across all lenses; SKILL.md, too large for one agent, is reviewed in four parts), then a
// synthesis agent merges + prioritizes. Run via:
//   Workflow({ scriptPath: "dev/review-modules.workflow.js", args: { skillDir: "<path to skill/>" } })
// Maintainer tool — not installed to users. Keep UNITS in sync with the files in skill/.

export const meta = {
  name: 'review-rust-intel-modules',
  description: 'Parallel per-sphere review of the rust-intel skill: one agent per sphere file (all lenses, deep since each file is small; SKILL.md in four parts), then a synthesis agent merges findings.',
  phases: [
    { title: 'Review', detail: 'one agent per sphere file or SKILL.md part, all lenses' },
    { title: 'Synthesize', detail: 'merge + dedup + prioritize findings' },
  ],
}

if (!args || !args.skillDir) {
  throw new Error('review-rust-intel-modules: missing required arg "skillDir" (path to the rust-intel skill dir holding SKILL.md + sphere files)')
}
const DIR = args.skillDir

// One review unit per file, except SKILL.md, which is split by anchors (its trigger tables alone
// are ~100 KB). `part` is a human-readable description of where the unit starts and ends.
const UNITS = [
  { file: 'SKILL.md', label: 'SKILL.md/core', part: 'everything from the top of the file up to, but excluding, the heading "# Self-monitoring: prompt triggers that activate failure modes" (scope, full-pass protocol, blocking protocol, operating mode, enforcement tiers, tier overviews)' },
  { file: 'SKILL.md', label: 'SKILL.md/phrase-triggers', part: 'the phrase-trigger table: from the heading "# Self-monitoring: prompt triggers that activate failure modes" through the table whose header starts "User request contains...", up to, but excluding, the line starting "**Triggered by code, not phrase**"' },
  { file: 'SKILL.md', label: 'SKILL.md/code-triggers', part: 'the code-pattern table: from the line starting "**Triggered by code, not phrase**" through the table whose header starts "Code pattern in user input", up to, but excluding, the heading "# Category map"' },
  { file: 'SKILL.md', label: 'SKILL.md/map-pins-checklists', part: 'from the heading "# Category map" to the end of the file (category map, version pins, pre-flight and post-flight checklists)' },
  { file: 'async-locks-cancel.md', label: 'async/locks-cancel' },
  { file: 'async-tasks-blocking.md', label: 'async/tasks-blocking' },
  { file: 'async-machinery.md', label: 'async/machinery' },
  { file: 'concurrency-locks-state.md', label: 'concurrency/locks-state' },
  { file: 'concurrency-races.md', label: 'concurrency/races' },
  { file: 'concurrency-channels.md', label: 'concurrency/channels' },
  { file: 'data-contracts.md', label: 'data/contracts' },
  { file: 'data-numeric-time.md', label: 'data/numeric-time' },
  { file: 'data-text-iter-cost.md', label: 'data/text-iter-cost' },
  { file: 'security-crypto.md', label: 'security/crypto' },
  { file: 'security-boundary.md', label: 'security/boundary' },
  { file: 'unsafe-core.md', label: 'unsafe/core' },
  { file: 'unsafe-sync-memory.md', label: 'unsafe/sync-memory' },
  { file: 'unsafe-ffi-abi.md', label: 'unsafe/ffi-abi' },
  { file: 'drop-and-raii.md', label: 'drop-raii' },
  { file: 'deps-supply-chain.md', label: 'deps/supply-chain' },
  { file: 'deps-cargo-macros.md', label: 'deps/cargo-macros' },
  { file: 'deps-ergonomics.md', label: 'deps/ergonomics' },
  { file: 'lifetimes-and-api.md', label: 'lifetimes-api' },
  { file: 'testing-oracles.md', label: 'testing/oracles' },
  { file: 'testing-harness.md', label: 'testing/harness' },
  { file: 'semantics-and-conformance.md', label: 'semantics' },
]

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['module', 'label', 'score', 'findings', 'summary'],
  properties: {
    module: { type: 'string', description: 'file reviewed' },
    label: { type: 'string', description: 'review unit label; return exactly the label assigned in the prompt' },
    score: { type: 'number', description: '0-10 quality of this unit' },
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

function reviewPrompt(unit) {
  const scope = unit.part
    ? `Review ONE PART of the core file of the rust-intel skill: ${DIR}/${unit.file} — ${unit.part}. Read that part in full (locate its boundaries by the anchors named; do not review the rest of the file).`
    : `Review ONE sphere file of the rust-intel skill: ${DIR}/${unit.file}`
  const nature = unit.part
    ? `The CORE (operating mode, blocking protocol, enforcement tiers, the trigger tables, version pins, and the category->module map) is what this unit belongs to; the category BODIES live in the sphere files and are reviewed by other agents.`
    : `It is a self-contained sphere file of a "defense against LLM Rust failure modes" spec — it holds a few category bodies (BANNED/REQUIRED rules for bugs that survive rustc/clippy/tests), taken from one themed group of files. The CORE (operating mode, blocking protocol, enforcement tiers, the trigger tables, version pins, and the category->module map) lives in SKILL.md and is reviewed by other agents.`
  return `${scope}

${nature}

Your review unit label is exactly: ${unit.label}
Return that exact value in the JSON label field.

Read your whole unit — it is small enough to go DEEP, not broad-and-shallow. Apply ALL these lenses to THIS unit only:
1. Technical correctness — wrong Rust facts (APIs, semantics, UB, atomics, async cancellation, FFI ABI, edition/version claims).
2. Internal logic/consistency — a rule contradicting another in this unit; BANNED vs REQUIRED mismatch.
3. Precision of the prescribed fix — vague/incomplete/wrong-in-some-cases remedies; does the fix actually close the hazard it names?
4. Calibration / anti-zealotry — absolutism where nuance is needed; cargo-cult ceremony; false-positive-prone triggers.
5. Anti-stupidity / foot-guns — advice a literal-minded model would apply to make things WORSE; security theater.

IMPORTANT: cross-references to OTHER files (e.g. "see §B25", "§E4 -> §A2/§B2", a named sphere file) are navigational BY DESIGN after the doc was split into sphere files — do NOT flag them as broken links or as defects.

Return: the file name, the unit label, a 0-10 score, a list of findings (each: severity, lens, location with §id + short quote, problem, concrete fix), and a one-line summary. Be rigorous and honest — report only real issues, no quota-filling. If the unit is clean, say so with few/zero findings.`
}

phase('Review')
const reviews = (await parallel(
  UNITS.map((unit) => () =>
    agent(reviewPrompt(unit), { label: `review:${unit.label}`, phase: 'Review', schema: REVIEW_SCHEMA })
  )
)).filter(Boolean)

phase('Synthesize')
const totalFindings = reviews.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0)
const synthesis = await agent(
  `You are synthesizing a per-sphere review of the rust-intel skill. Below is JSON: an array of per-unit review results (module, label, score, findings[], summary). Units are sphere files plus four parts of SKILL.md.

Produce a single prioritized report:
- Group by severity (Critical -> Major -> Minor); within each, order by how load-bearing the fix is.
- Dedup findings that recur across units (state "recurs in: <labels>").
- For each kept finding: unit label, §location, one-line problem, one-line fix.
- Flag any finding that looks arguable vs solid.
- End with: per-unit scores table, total finding counts by severity, and the 3 highest-value fixes to make first.

Do NOT invent findings not present in the input. JSON input:
${JSON.stringify(reviews)}`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { unitCount: UNITS.length, expectedUnits: UNITS.map((u) => u.label), totalFindings, perUnit: reviews, synthesis }
