// Fan-out audit of a Rust project against the rust-intel skill.
// One agent per skill module (async.md splits into two), fed runtime slices of
// SKILL.md's trigger tables + 🔴 inventory by a slicer agent, scoped to the
// target crate by a scoper agent, then merged into a /rust-cc-audit report.
//   Workflow({ scriptPath: "skill/audit-project.workflow.js",
//              args: { target: "<crate dir>", skillDir: "<skill dir>" } })
// NO rule text lives here: knowledge is in the modules, process in the workflow,
// slices arrive at runtime. Keep MODULES/AUDIT_UNITS in sync with skill/.

export const meta = {
  name: 'audit-rust-project',
  description: 'Fan-out audit of a Rust project against rust-intel — one agent per skill module',
  phases: [
    { title: 'Prepare', detail: 'slice SKILL.md triggers + scope the target crate' },
    { title: 'Audit', detail: 'one agent per module (async splits into two)' },
    { title: 'Synthesize', detail: 'merge, dedup, format the report' },
  ],
}

if (!args || !args.target) {
  throw new Error('audit-rust-project: missing required arg "target" (path to the Rust crate to audit)')
}
if (!args.skillDir) {
  throw new Error('audit-rust-project: missing required arg "skillDir" (path to the rust-intel skill dir holding SKILL.md + modules)')
}

// Module -> category-ids it owns. Mirrors the category->module map in SKILL.md.
const MODULES = [
  { file: 'async.md', categories: ['B2','B3','B3a','B8','B11','B15','B15a','B15b','B15c','B15d','B15e','B21','B22','B23','C3','C9','E1'] },
  { file: 'concurrency-and-state.md', categories: ['A2','B9','B10','B13','B14','B17','B19','C8','E4'] },
  { file: 'data-and-types.md', categories: ['B6','B16','B20','B26','B27','B28','B29','C4','E2','E3'] },
  { file: 'security.md', categories: ['B12','B24','C2'] },
  { file: 'unsafe-and-ffi.md', categories: ['B5','B7','B18','B18a','B25','B25a'] },
  { file: 'drop-and-raii.md', categories: ['B4','B4a'] },
  { file: 'deps-macros-ergonomics.md', categories: ['A1','C5','C6','C7','C10','C11','E5'] },
  { file: 'lifetimes-and-api.md', categories: ['B1','B1a','B1b','C1','C1a','A3'] },
  { file: 'testing.md', categories: ['D1','D1a','D2','D3','D4','D5','E6'] },
  { file: 'semantics-and-conformance.md', categories: ['F1','F2','F3','F4'] },
]

// One audit agent per unit. async.md splits into two (discipline vs machinery, G6).
const AUDIT_UNITS = [
  { module: 'async.md', label: 'async/discipline', onlyCategories: 'B2, B3, B3a, B8, B11, B21, B22, B23' },
  { module: 'async.md', label: 'async/machinery', onlyCategories: 'B15a–e, C3, C9, E1' },
  { module: 'concurrency-and-state.md', label: 'concurrency', requiredArtifactGroups: [] },
  { module: 'data-and-types.md', label: 'data-types', requiredArtifactGroups: [] },
  { module: 'security.md', label: 'security', requiredArtifactGroups: ['manifests', 'configs'] },
  { module: 'unsafe-and-ffi.md', label: 'unsafe-ffi', requiredArtifactGroups: ['manifests', 'configs', 'scripts', 'ffi'] },
  { module: 'drop-and-raii.md', label: 'drop-raii', requiredArtifactGroups: [] },
  { module: 'deps-macros-ergonomics.md', label: 'deps-macros', requiredArtifactGroups: ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts'] },
  { module: 'lifetimes-and-api.md', label: 'lifetimes-api', requiredArtifactGroups: ['manifests', 'toolchains'] },
  { module: 'testing.md', label: 'testing', requiredArtifactGroups: ['configs', 'ci', 'scripts'] },
  // §F1/§F2 need the project's own spec/README/docs, not just source — see scoper docsFiles + auditPrompt.
  { module: 'semantics-and-conformance.md', label: 'semantics', requiredArtifactGroups: [], requiresDocs: true },
]
for (const unit of AUDIT_UNITS) unit.requiredArtifactGroups ||= []

const SLICER_SCHEMA = {
  type: 'object',
  required: ['modules'],
  properties: {
    modules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['module', 'phraseRows', 'codePatternRows', 'redItems'],
        properties: {
          module: { type: 'string', description: 'module filename, e.g. async.md' },
          phraseRows: { type: 'string', description: 'verbatim phrase-trigger table rows whose Activates column names a § of this module' },
          codePatternRows: { type: 'string', description: 'verbatim code-pattern table rows whose Activates column names a § of this module' },
          redItems: { type: 'string', description: 'verbatim 🔴 enforcement-tier items belonging to this module' },
        },
      },
    },
  },
}

const SCOPER_SCHEMA = {
  type: 'object',
  required: ['versions', 'files', 'artifactFiles', 'claudeMdNotes', 'docsFiles', 'docsDigest'],
  properties: {
    versions: { type: 'string', description: 'pinned versions from Cargo.toml (edition, key deps + their versions, tokio/etc)' },
    files: { type: 'array', items: { type: 'string' }, description: 'list of *.rs source files, excluding target/ and generated files' },
    artifactFiles: {
      type: 'object',
      description: 'non-Rust artifacts that can change safety, compatibility, or release behavior',
      required: ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts', 'ffi'],
      additionalProperties: false,
      properties: {
        manifests: { type: 'array', items: { type: 'string' } },
        lockfiles: { type: 'array', items: { type: 'string' } },
        toolchains: { type: 'array', items: { type: 'string' } },
        configs: { type: 'array', items: { type: 'string' } },
        ci: { type: 'array', items: { type: 'string' } },
        scripts: { type: 'array', items: { type: 'string' } },
        ffi: { type: 'array', items: { type: 'string' } },
      },
    },
    claudeMdNotes: { type: 'string', description: 'project-specific constraints from CLAUDE.md if present, else empty' },
    docsFiles: { type: 'array', items: { type: 'string' }, description: 'paths to spec/guarantee-bearing docs: README, SECURITY.md, docs/**, ARCHITECTURE/THREAT-MODEL, any cited RFC/spec file. For §F1/§F2.' },
    docsDigest: { type: 'string', description: 'the project\'s stated guarantees and named specs/references, extracted verbatim where possible: what is secret, what input is untrusted, durability/ordering promises, "compatible with / port of X" claims. For §F1/§F2.' },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['module', 'label', 'findings', 'redInventory', 'artifactsReviewed', 'sourceFilesReviewed', 'docsReviewed', 'summary'],
  properties: {
    module: { type: 'string' },
    label: { type: 'string', description: 'audit unit label; return exactly the label assigned in the prompt' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'tier', 'severity', 'location', 'citation', 'why', 'fix'],
        properties: {
          category: { type: 'string', description: '§id, e.g. §B15a' },
          tier: { type: 'string', description: '🔴 | 🟡 | 🟢' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'info'] },
          location: { type: 'string', description: 'file:line' },
          citation: { type: 'string', description: 'short quoted code or anchor proving the finding' },
          why: { type: 'string', description: 'one line: why this is a hazard, in the module\'s terms' },
          fix: { type: 'string', description: 'concrete remedy' },
        },
      },
    },
    redInventory: {
      type: 'array',
      description: 'EVERY occurrence of this module\'s 🔴 items, even justified ones',
      items: {
        type: 'object',
        required: ['redItem', 'location', 'status'],
        properties: {
          redItem: { type: 'string', description: '§id + short name of the 🔴 item' },
          location: { type: 'string', description: 'file:line' },
          status: { type: 'string', description: 'one-line status: violated / justified / N/A' },
        },
      },
    },
    artifactsReviewed: {
      type: 'array',
      items: { type: 'string' },
      description: 'exact paths of non-Rust artifactFiles actually opened and reviewed; empty only when none are relevant',
    },
    sourceFilesReviewed: {
      type: 'array',
      items: { type: 'string' },
      description: 'exact source file paths actually opened and reviewed by this unit',
    },
    docsReviewed: {
      type: 'array',
      items: { type: 'string' },
      description: 'exact documentation paths actually opened and reviewed by this unit',
    },
    summary: { type: 'string' },
  },
}

function slicerPrompt() {
  const map = MODULES.map((m) => `- ${m.file}: ${m.categories.join(', ')}`).join('\n')
  return `You are slicing the trigger tables of the rust-intel skill so per-module audit agents each get only the rows relevant to their module.

Read: ${args.skillDir}/SKILL.md

It contains a phrase-trigger table and a code-pattern table; each row has an "Activates" column naming one or more § category ids. It also carries an enforcement-tier list marking some categories 🔴 (must report every occurrence).

For EACH module below, extract verbatim (do not paraphrase, copy the markdown rows exactly):
(a) phraseRows — every phrase-trigger row whose Activates column names ANY § in that module's category set,
(b) codePatternRows — every code-pattern row whose Activates column names ANY § in that module's category set,
(c) redItems — the 🔴 enforcement-tier items whose § belongs to that module.

A row may belong to several modules — duplicate it into each. If a module has none for a field, return an empty string for that field.

Module -> category ids:
${map}

Return SLICER_SCHEMA: one entry per module above (key = filename), with the three verbatim text fields.`
}

function scoperPrompt() {
  return `You are scoping a Rust crate for an audit.

Target crate dir: ${args.target}

1. Read ${args.target}/Cargo.toml. Report the Rust edition, and the pinned versions of dependencies that matter for auditing (async runtime, sync/concurrency, serialization, crypto, FFI/bindgen, etc.) — name + version each.
2. If ${args.target}/CLAUDE.md exists, read it and capture any project-specific constraints that change what counts as a finding (allowed unsafe, MSRV, forbidden deps, etc.). Otherwise leave empty.
3. Inventory the *.rs source files under ${args.target}, EXCLUDING target/ and generated files (build script output, *.gen.rs, OUT_DIR). Return their paths in files.
4. Inventory non-Rust artifacts in artifactFiles: Cargo.toml/workspace manifests, Cargo.lock or other lockfiles, rust-toolchain* and rust-toolchain.toml, .cargo/config*, deny/audit policy files, CI workflow YAML, Docker/build/release scripts, build.rs/proc-macro inputs, headers/bindgen files, and FFI/linker configuration. Exclude target/ and generated output but do not omit checked-in scripts or policy files.
5. Inventory the project's spec/guarantee-bearing docs (README, SECURITY.md, ARCHITECTURE/THREAT-MODEL, docs/**, and any RFC/spec file the code cites). Return their paths in docsFiles. Then read them and extract docsDigest: the stated guarantees (what is secret, what input is untrusted, durability/ordering promises) and every "compatible with / port of / implements <spec>" claim, verbatim where possible. This feeds the §F1/§F2 semantic-conformance audit; if there are no such docs, return empty docsFiles and an empty docsDigest.

Return SCOPER_SCHEMA.`
}

function auditPrompt(unit, slice, scope) {
  const focus = unit.onlyCategories
    ? `\nFocus ONLY on categories ${unit.onlyCategories}; ignore the rest of the module.\n`
    : '\n'
  // §F1/§F2 are unauditable from source alone — the defect lives in the gap between
  // the code and the project's own spec/docs. Feed the semantics agent the doc digest.
  const docs = unit.module === 'semantics-and-conformance.md'
    ? `\nPROJECT SPEC / DOCS (the source of truth for §F1 conformance and §F2 documented guarantees — review the code AGAINST these, not against its own internal consistency):
Doc files: ${scope && scope.docsFiles && scope.docsFiles.length ? scope.docsFiles.join(', ') : '(none found — say so; "conformance not verified: no reference" is itself a finding)'}
Stated guarantees + named specs/references:
${scope && scope.docsDigest ? scope.docsDigest : '(none extracted)'}
Read the doc files directly if you need more than the digest. For §F1, fetch/locate any cited RFC/spec and enumerate its mandated states before checking the code (Tier F stance: enumerate, don't sample).\n`
    : ''
  return `You are auditing ONE theme of rust-intel against real Rust code.

Your audit unit label is exactly: ${unit.label}
Return that exact value in the JSON label field. You are responsible for this unit's own evidence; another agent's review does not satisfy your obligations.

Read the module: ${args.skillDir}/${unit.module}
${focus}${docs}
TIER SEMANTICS:
🔴 = report EVERY occurrence (no judgement on whether it "looks fine").
🟡 = report only when load-bearing / non-obvious — skip the trivial.
🟢 = clippy's job; do NOT hand-report these.

ARTIFACT-VS-PROCESS: Audit the ARTIFACT — a BANNED pattern present in the code, or a REQUIRED code artifact that is absent. Process-REQUIREMENTs ("propose first", "ask the user", "get sign-off") are NOT auditable from source — do not emit pseudo-findings for them.

SLICE FOR THIS MODULE (from SKILL.md):
Code-pattern rows (use as starting grep targets):
${slice && slice.codePatternRows ? slice.codePatternRows : '(none)'}

Phrase-trigger rows (context for what to look for):
${slice && slice.phraseRows ? slice.phraseRows : '(none)'}

🔴 enforcement items (must inventory every occurrence):
${slice && slice.redItems ? slice.redItems : '(none)'}

TARGET CRATE:
Pinned versions:
${scope ? scope.versions : '(unknown)'}
${scope && scope.claudeMdNotes ? `Project constraints (CLAUDE.md): ${scope.claudeMdNotes}\n` : ''}Source files:
${scope ? (scope.files || []).join('\n') : '(unknown)'}
Non-Rust audit artifacts:
${scope && scope.artifactFiles ? JSON.stringify(scope.artifactFiles, null, 2) : '(unknown)'}

METHOD:
1. grep the code-pattern rows above as candidates across the source files AND inspect every non-Rust artifact relevant to this module. Open the files; a path appearing in the inventory is not evidence that it was reviewed.
2. For deps/macros, always inspect manifests, lockfiles, toolchains, Cargo/security policy configs, CI, and build/release scripts. For testing, inspect CI/config/scripts. For unsafe/FFI, inspect build scripts, headers/bindgen/linker config, and relevant manifests. Other modules inspect any artifact that changes their behavior.
3. Read the surrounding context of each hit.
4. Check it against the BANNED/REQUIRED text VERBATIM from the module — match the module's exact wording, not your prior.
5. Honor every "don't flag X" / calibration note in the module.
6. Return in sourceFilesReviewed the exact source paths you actually opened, in artifactsReviewed the exact non-Rust artifact paths you actually opened, and in docsReviewed the exact documentation paths you actually opened. Do not list inventory-only paths.
7. Do NOT invent findings — a short, honest report beats a synthetic one.

Return FINDINGS_SCHEMA. redInventory MUST list EVERY occurrence of this module's 🔴 items (file:line + one-line status), INCLUDING justified ones — these feed the Post-flight summary.`
}

phase('Prepare')
const prep = (await parallel([
  () => agent(slicerPrompt(), { label: 'slicer', phase: 'Prepare', schema: SLICER_SCHEMA }),
  () => agent(scoperPrompt(), { label: 'scoper', phase: 'Prepare', schema: SCOPER_SCHEMA }),
])).filter(Boolean)

const slicerResult = prep.find((p) => Array.isArray(p.modules)) || null
const scoperResult = prep.find((p) => Array.isArray(p.files)) || null
if (!slicerResult) log('WARNING: slicer agent returned null — audit agents will have no SKILL.md slices')
if (!scoperResult) log('WARNING: scoper agent returned null — audit agents will have no version/file scope')

const sliceFor = (moduleFile) => {
  if (!slicerResult) return null
  return (slicerResult.modules || []).find((m) => m.module === moduleFile) || null
}

phase('Audit')
const auditResults = (await parallel(
  AUDIT_UNITS.map((unit) => () =>
    agent(auditPrompt(unit, sliceFor(unit.module), scoperResult), {
      label: `audit:${unit.label}`,
      phase: 'Audit',
      schema: FINDINGS_SCHEMA,
    })
  )
)).filter(Boolean)

const dropped = AUDIT_UNITS.length - auditResults.length
if (dropped > 0) log(`WARNING: ${dropped} audit agent(s) returned null — those briefs were dropped`)
const artifactGroups = ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts', 'ffi']
const missingScopeFields = !scoperResult
  ? ['scoper result']
  : [
      ...['versions', 'files', 'artifactFiles', 'docsFiles', 'docsDigest'].filter((field) => scoperResult[field] === undefined),
      ...(!scoperResult.artifactFiles ? [] : artifactGroups.filter((field) => !Array.isArray(scoperResult.artifactFiles[field])).map((field) => `artifactFiles.${field}`)),
    ]
const missingSlices = !slicerResult
  ? ['slicer result']
  : MODULES.filter((module) => !(slicerResult.modules || []).some((slice) => slice.module === module.file)).map((module) => module.file)
const expectedArtifacts = scoperResult && scoperResult.artifactFiles
  ? [...new Set(artifactGroups.flatMap((group) => scoperResult.artifactFiles[group] || []))]
  : []
const reviewedArtifacts = new Set(auditResults.flatMap((result) => result.artifactsReviewed || []))
const missingArtifacts = expectedArtifacts.filter((artifact) => !reviewedArtifacts.has(artifact))
const reviewedSourceFiles = new Set(auditResults.flatMap((result) => result.sourceFilesReviewed || []))
const missingSourceFiles = scoperResult && Array.isArray(scoperResult.files)
  ? scoperResult.files.filter((file) => !reviewedSourceFiles.has(file))
  : []
const reviewedDocs = new Set(auditResults.flatMap((result) => result.docsReviewed || []))
const missingDocs = scoperResult && Array.isArray(scoperResult.docsFiles)
  ? scoperResult.docsFiles.filter((file) => !reviewedDocs.has(file))
  : []
const resultsByLabel = new Map(auditResults.map((result) => [result.label, result]))
const missingUnitInputs = {}
for (const unit of AUDIT_UNITS) {
  const result = resultsByLabel.get(unit.label)
  const missing = []
  if (!result) missing.push('agent result')
  const requiredGroups = unit.requiredArtifactGroups || []
  for (const group of requiredGroups) {
    const expected = scoperResult && scoperResult.artifactFiles ? (scoperResult.artifactFiles[group] || []) : []
    const reviewed = new Set(result ? (result.artifactsReviewed || []) : [])
    for (const artifact of expected) if (!reviewed.has(artifact)) missing.push(artifact)
  }
  if (unit.requiresDocs) {
    const reviewed = new Set(result ? (result.docsReviewed || []) : [])
    for (const doc of (scoperResult && scoperResult.docsFiles) || []) if (!reviewed.has(doc)) missing.push(doc)
  }
  if (missing.length) missingUnitInputs[unit.label] = missing
}
const coverageStatus = {
  complete: missingScopeFields.length === 0 && missingSlices.length === 0 && missingArtifacts.length === 0 && missingSourceFiles.length === 0 && missingDocs.length === 0 && Object.keys(missingUnitInputs).length === 0 && dropped === 0,
  missingScopeFields,
  missingSlices,
  missingArtifacts,
  missingSourceFiles,
  missingDocs,
  missingUnitInputs,
  droppedAgents: dropped,
}

phase('Synthesize')
const synthesis = await agent(
  `You are merging the results of a fan-out Rust audit into a single report. Below is JSON containing scope, slices, expected audit units, and an array of per-unit audit results (module, findings[], redInventory[], summary).

MERGE + DEDUP:
- Same file:line flagged by two agents -> keep ONE entry, prefer the more specific category, and note "also flagged by <other category>".
- Group by severity: critical -> high -> medium -> info. Within a severity, order by tier letter (A -> B -> C -> D -> E -> F).
- Do NOT invent findings not present in the input.
- Coverage is COMPLETE only when coverageStatus.complete is true. Report every missingUnitInputs, missingSourceFiles, missingDocs, missingArtifacts, missing scope/slice, or dropped agent as INCOMPLETE; never infer coverage from another unit's evidence.

Format the report EXACTLY like this:

# rust-cc-audit report

**Scope:** ${args.target}
**Pinned versions:** <from scoper / the versions seen in input>
**Coverage:** <COMPLETE or INCOMPLETE — explain missing scope/slices/agents and never imply complete coverage when any required input is absent>
**Found:** N critical, M high, K medium, L info

---

## CRITICAL
### [§XX] file:line — title
<citation, why, fix>

## HIGH
...

## MEDIUM
...

## INFO
...

---

## Post-flight summary
<aggregate ALL redInventory entries across every agent — list all 🔴 items, with their occurrences (file:line + status); write "none" for any 🔴 item with no occurrences>

JSON input:
${JSON.stringify({
    scope: scoperResult,
    slices: slicerResult,
    expectedUnits: AUDIT_UNITS.map((u) => ({ module: u.module, label: u.label })),
    results: auditResults,
    coverageStatus,
  })}`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { report: synthesis }
