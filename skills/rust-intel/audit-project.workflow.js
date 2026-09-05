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

const deepFreezeRecords = (records) => {
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) Object.freeze(value)
    }
    Object.freeze(record)
  }
  return Object.freeze(records)
};

// Module -> category-ids it owns. Mirrors the category->module map in SKILL.md.
const MODULES = deepFreezeRecords([
  { file: 'async.md', categories: ['B2','B3','B3a','B8','B11','B15','B15a','B15b','B15c','B15d','B15e','B21','B22','B23','C3','C9','E1'] },
  { file: 'concurrency-and-state.md', categories: ['A2','B9','B10','B13','B14','B17','B19','C8','E4'] },
  { file: 'data-and-types.md', categories: ['B6','B16','B20','B26','B27','B28','B29','C4','E2','E3'] },
  { file: 'security.md', categories: ['B12','B24','C2'] },
  { file: 'unsafe-and-ffi.md', categories: ['B5','B7','B18','B18a','B25','B25a'] },
  { file: 'drop-and-raii.md', categories: ['B4','B4a'] },
  { file: 'deps-macros-ergonomics.md', categories: ['A1','C5','C6','C7','C10','C11','C12','C12a','E5'] },
  { file: 'lifetimes-and-api.md', categories: ['B1','B1a','B1b','C1','C1a','A3'] },
  { file: 'testing.md', categories: ['D1','D1a','D2','D3','D4','D5','E6'] },
  { file: 'semantics-and-conformance.md', categories: ['F1','F2','F3','F4'] },
]);

// One audit agent per unit. async.md splits into two (discipline vs machinery, G6).
const AUDIT_UNITS = deepFreezeRecords([
  { module: 'async.md', label: 'async/discipline', onlyCategories: 'B2, B3, B3a, B8, B11, B21, B22, B23', requiredArtifactGroups: [] },
  { module: 'async.md', label: 'async/machinery', onlyCategories: 'B15a–e, C3, C9, E1', requiredArtifactGroups: [] },
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
]);

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
  required: ['module', 'label', 'findings', 'unreachable', 'redInventory', 'artifactsReviewed', 'sourceFilesReviewed', 'docsReviewed', 'summary'],
  properties: {
    module: { type: 'string' },
    label: { type: 'string', description: 'audit unit label; return exactly the label assigned in the prompt' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'tier', 'severity', 'location', 'citation', 'evidence', 'reachedFrom', 'why', 'fix'],
        properties: {
          category: { type: 'string', description: '§id, e.g. §B15a' },
          tier: { type: 'string', description: '🔴 | 🟡 | 🟢' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'info'] },
          location: { type: 'string', description: 'file:line' },
          citation: { type: 'string', description: 'short quoted code or anchor proving the finding' },
          evidence: {
            type: 'string',
            enum: ['pattern', 'traced', 'proven'],
            description: 'HOW this was established, never how confident you feel, and never a sort key. pattern = the BANNED shape is present here and the module\'s calibration does not excuse it, but no caller path was followed (or none exists: for manifest/semver-shape/test-code/documented-guarantee categories this is COMPLETE evidence, not a candidate). traced = followed from a named entry point (public API, handler, accept loop, FFI export, CLI, build script) to this site, or the hazard sits inside that entry point itself. proven = a run demonstrated it (repro/test failing for the PREDICTED reason, miri/loom/sanitizer output) — a failure on compilation, on a setup panic, or on a wrong expectation is not proof. Do NOT claim proven without a run, or traced without naming the entry; a path that dead-ends before an entry point is pattern.',
          },
          reachedFrom: {
            type: 'string',
            description: 'for traced/proven: the entry point and the path to this site. For pattern: empty string — do not invent a path.',
          },
          why: { type: 'string', description: 'one line: why this is a hazard, in the module\'s terms' },
          fix: { type: 'string', description: 'concrete remedy' },
        },
      },
    },
    unreachable: {
      type: 'array',
      description: 'Matched BANNED shapes that NO entry point can reach: production code whose sole live caller is a test, a cfg-disabled branch, a private fn with no live caller. NOT findings and never counted in the severity totals — but not silently dropped either: an unreachable match is a result, and hiding it makes the next audit re-derive it. Requires showing no path exists, not failing to find one — undetermined reachability (dyn dispatch, macro-generated calls) stays a finding labelled pattern. `cargo test` is an entry point, so a Tier D match in test code is never unreachable; in a library crate the pub API is an entry point too. A 🔴 occurrence listed here still appears in redInventory. Empty array is normal.',
      items: {
        type: 'object',
        required: ['category', 'location', 'whyUnreachable'],
        properties: {
          category: { type: 'string', description: '§id' },
          location: { type: 'string', description: 'file:line' },
          whyUnreachable: { type: 'string', description: 'what you checked to conclude no entry point reaches it' },
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
8. §B9 exception to the sampling norm: a crate-GLOBAL lock-acquisition-order graph CANNOT be validated by sampling — one missed acquisition or call edge anywhere hides a real ABBA inversion. A §B9 disposition requires EITHER a full inventory of every lock acquisition in the crate and the call edges between them (across every in-scope source file), OR the explicit disposition "§B9 unverified — grep-sampled only, not a completeness claim" — never a §B9-complete/cleared result from grep-sampled evidence.

EVIDENCE (how each finding was established — a grep hit is a candidate, not yet a finding):
- Label every finding \`pattern\`, \`traced\`, or \`proven\`, and never label up. \`traced\` requires naming the entry point in reachedFrom (a public API, request handler, accept loop, FFI export, CLI arg, build script — something outside this crate's own code drives it); a hazard sitting *inside* an entry point (an \`extern "C"\` body, \`main\`, a handler body) is \`traced\` with that entry named. A path you followed but that dead-ended without reaching an entry point is \`pattern\`, not \`traced\`. \`proven\` requires an actual run whose failure matches the prediction: reading the code more carefully is not a run, and a failure on compilation, on a panic in setup, or on a wrong expectation in the repro is not proof either.
- \`pattern\` is a normal, respectable result — mislabelling it \`traced\` is the one thing that makes this field worthless. **For ARTIFACT/API-SHAPE categories — where the occurrence is true of the artifact itself regardless of who calls anything (manifests/lockfiles/toolchains/CI: §A1; the manifest-side rows of §C5–§C11 such as a missing \`[features]\` declaration, an undeclared build-script cfg, or a hand-rolled-variant catalog hit; public-API and semver shape: §B1/§B1a/§B1b, §C1/§C1a; test code: Tier D; documented guarantees: §F2) — \`pattern\` is COMPLETE evidence, not a candidate:** the artifact itself establishes the finding, and there is no path to follow. This caller-free exception does NOT cover §C5–§C11 source occurrences whose verdict depends on how the code is actually called (a hot-path \`.clone()\`, a \`Deref\` impl exercised through method resolution): those follow the same reachability analysis as every other category — \`pattern\` until traced from a named entry point, and showably-unreachable ones go to \`unreachable\`. Do not apologise for a \`pattern\` result and do not invent a path to upgrade it.
- A candidate you can show NO entry point reaches goes in \`unreachable\` with what you checked — NOT in findings. Unreachability is a result, not a failure: report it rather than dropping it silently, so the next audit does not re-derive it. Three limits on this bucket:
  - **\`cargo test\` is an entry point.** For Tier D categories the test code *is* the audit surface, so a match inside a test is never \`unreachable\`. "Test-only path" means **production** code whose sole live caller is a test.
  - **In a library crate the public API is an entry point.** An item reachable from the crate root via \`pub\`/\`pub use\` is never \`unreachable\`, however few in-crate callers it has — the caller is a downstream user you cannot see.
  - **\`unreachable\` requires showing no path exists, not failing to find one.** If reachability is undetermined (dyn dispatch, macro-generated calls, a plugin/registry lookup), it stays a finding labelled \`pattern\`.
  - A 🔴 occurrence that is unreachable still goes in redInventory with that status — the unreachable bucket never removes an occurrence from the 🔴 inventory.
- Severity ranks the hazard if it fires; evidence records what you established. They are independent axes and neither is a sort key for the other: a \`critical\`/\`pattern\` finding is legitimate and common. Do not deflate severity because evidence is \`pattern\`, and do not inflate evidence because severity is high.
- Never weaken a check, widen a category, or stretch a calibration note to make something reportable. Finding less than you expected is an outcome; manufacturing a finding is a defect in the audit itself.

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
// Units grep for candidates rather than reading every file, so unreviewed source files are the
// NORMAL case — they describe sampling depth, not a broken run, and must not gate `complete`.
// See sourceSampling below; the gating signals are the required inputs each unit was handed.
const knownLabels = new Set(AUDIT_UNITS.map((unit) => unit.label))
const strayLabels = [...new Set(auditResults.map((result) => result.label).filter((label) => !knownLabels.has(label)))]
if (strayLabels.length) log(`WARNING: audit unit(s) returned unrecognized label(s): ${strayLabels.join(', ')}`)
const resultsByLabel = new Map(auditResults.filter((result) => knownLabels.has(result.label)).map((result) => [result.label, result]))
const auditResultModuleMatches = (result, unit) => result.module === unit.module;
const missingUnitInputs = {}
for (const unit of AUDIT_UNITS) {
  const result = resultsByLabel.get(unit.label)
  const missing = []
  if (!result) missing.push('agent result')
  else if (!auditResultModuleMatches(result, unit)) missing.push(`module-mismatch: expected ${unit.module}, got ${result.module || '(missing)'}`)
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
// Two DIFFERENT questions, kept as two DIFFERENT signals so neither can hide behind the other:
//   1. Orchestration: did every unit run, under its own label, with the scope/slice/required
//      artifacts+docs it was owed? This is what "the run completed" means.
//   2. Audit depth: did units that had candidates to look at actually open source files? A unit
//      returning a well-formed empty result satisfies (1) while reviewing nothing — that is NOT
//      coverage, and orchestration success must never be reported as if it were.
const orchestrationComplete =
  missingScopeFields.length === 0 &&
  missingSlices.length === 0 &&
  Object.keys(missingUnitInputs).length === 0 &&
  strayLabels.length === 0 &&
  dropped === 0
const totalSourceFiles = scoperResult && Array.isArray(scoperResult.files) ? scoperResult.files.length : 0
const sourceSampling = {
  total: totalSourceFiles,
  reviewed: totalSourceFiles - missingSourceFiles.length,
  unreviewed: missingSourceFiles,
  note: 'Units grep for candidate patterns; some unreviewed files are expected and describe sampling depth, not by themselves a failed run. Exception: §B9 (lock-acquisition-order graph) cannot be validated by sampling — see the §B9 rule in the audit prompt: full inventory, or an explicit "unverified — grep-sampled only, not a completeness claim" disposition.',
}
// Floor: a unit whose module had non-empty grep-candidate rows AND whose scope had at least one
// source file to look at, but whose sourceFilesReviewed contains zero paths that are actually IN
// scoperResult.files, produced no source evidence at all — distinct from "there was nothing
// relevant to find". Checking raw length alone lets a unit dodge the floor with a stray README.md,
// a typo'd path, or a hallucinated file that was never in scope, so every path is intersected
// against the scoped set first; anything outside it is reported separately as invalid, not
// silently counted as evidence.
const scopedFileSet = scoperResult && Array.isArray(scoperResult.files) ? new Set(scoperResult.files) : new Set()
const invalidSourceEvidence = {}
const noSourceEvidence = AUDIT_UNITS.filter((unit) => {
  const result = resultsByLabel.get(unit.label)
  if (!result) return false
  const slice = sliceFor(unit.module)
  const hadCandidates = slice && ((slice.codePatternRows || '').trim().length > 0 || (slice.phraseRows || '').trim().length > 0)
  const hadFiles = totalSourceFiles > 0
  const reviewed = result.sourceFilesReviewed || []
  const inScopeCount = reviewed.filter((file) => scopedFileSet.has(file)).length
  const outOfScope = reviewed.filter((file) => !scopedFileSet.has(file))
  if (outOfScope.length) invalidSourceEvidence[unit.label] = outOfScope
  return hadCandidates && hadFiles && inScopeCount === 0
}).map((unit) => unit.label)
const coverageStatus = {
  orchestrationComplete,
  missingScopeFields,
  missingSlices,
  missingUnitInputs,
  strayLabels,
  droppedAgents: dropped,
  // Audit-depth signals — these describe HOW MUCH was reviewed, and noSourceEvidence is itself a
  // failure (a unit with candidates and files to check that opened none), even though it does
  // not gate orchestrationComplete.
  noSourceEvidence,
  invalidSourceEvidence,
  sourceSampling,
  missingArtifacts,
  missingDocs,
}

phase('Synthesize')
const synthesis = await agent(
  `You are merging the results of a fan-out Rust audit into a single report. Below is JSON containing scope, slices, expected audit units, and an array of per-unit audit results (module, findings[], unreachable[], redInventory[], summary).

MERGE + DEDUP:
- Same file:line flagged by two agents -> keep ONE entry, prefer the more specific category, and note "also flagged by <other category>".
- Group by severity: critical -> high -> medium -> info. Within a severity, order by tier letter (A -> B -> C -> D -> E -> F). **Evidence is NOT a sort key** — it labels how a finding was established, not how much it matters, and many categories (manifests, semver shape, test code, documented guarantees) are fully established at \`pattern\` because no caller path exists to follow. Sorting by it would rank those below a traced guess.
- Do NOT invent findings not present in the input.
- **Carry each finding's \`evidence\` label through verbatim — never upgrade it.** Merging must not turn two \`pattern\` reports into a \`traced\` one: agreement between graders is not a caller path. When two units report the same site, the surviving entry keeps **the evidence and \`reachedFrom\` of the report whose category survived** — never the stronger label from the report you discarded, because that label was earned for a different category and proves nothing about this one. Note the other unit's category and label in the "also flagged by" line.
- **Aggregate every unit's \`unreachable\` entries into the dedicated section** — they are not findings and must never be counted in the **Found:** line, but they are also not dropped. A 🔴 occurrence that is unreachable still appears in the Post-flight 🔴 inventory with that status; the unreachable bucket never removes an occurrence from the 🔴 inventory.
- Report TWO SEPARATE coverage lines — do not merge them, and do not let one look like the other:
  - **Orchestration** is COMPLETE only when coverageStatus.orchestrationComplete is true — i.e. every unit reported back under its own label with the scope, slice, and required artifacts/docs it was owed. If false, write INCOMPLETE and name exactly what is missing (missingUnitInputs, missingScopeFields, missingSlices, strayLabels, droppedAgents).
  - **Audit depth** is a separate line, always present: report coverageStatus.sourceSampling as "reviewed R of T source files (grep-candidate sampling)"; if coverageStatus.noSourceEvidence is non-empty, name those units explicitly as having returned NO in-scope source evidence (a unit with candidates and files to check that reported zero paths actually present in the scoped file list — a stray README, a typo, or a hallucinated path does not count) — this is a real gap even when orchestration is COMPLETE. If coverageStatus.invalidSourceEvidence is non-empty, name those units and flag that they reported out-of-scope paths as evidence (do not treat those paths as reviewed source). Do not list individual unreviewed file paths. Never infer one unit's coverage from another unit's evidence, and never let "Orchestration: COMPLETE" imply the audit reviewed all or most of the source. A §B9 (lock-order) result backed only by grep-sampled coverage must be reported as "§B9 unverified — grep-sampled only, not a completeness claim" — never as a §B9-complete/cleared result; sampling cannot establish crate-global lock-order coverage.

Format the report EXACTLY like this:

# rust-cc-audit report

**Scope:** ${args.target}
**Pinned versions:** <from scoper / the versions seen in input>
**Orchestration:** <COMPLETE or INCOMPLETE per coverageStatus.orchestrationComplete — when INCOMPLETE, name the missing units/inputs>
**Audit depth:** <"reviewed R of T source files (grep-candidate sampling)"; if coverageStatus.noSourceEvidence is non-empty, append "— NO in-scope source evidence from: <labels>"; if coverageStatus.invalidSourceEvidence is non-empty, append "— out-of-scope evidence reported by: <labels>">
**Found:** N critical, M high, K medium, L info  (evidence: P proven, T traced, C pattern — P+T+C must equal N+M+K+L)

---

## CRITICAL
### [§XX] file:line — title  ·  evidence: <the label the unit supplied>
<for traced/proven: "Reached from: <entry point → path>" — omit the line entirely for pattern, do not write "unknown">
<citation, why, fix>

## HIGH
...

## MEDIUM
...

## INFO
...

---

## Unreachable matches (not findings)

<aggregate every unit's `unreachable` entries: §id, file:line, and what was checked to conclude no entry point reaches it. These are recorded so the next audit does not re-derive them; they are NOT counted in **Found:**. Write "none" if every unit returned an empty list.>

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
