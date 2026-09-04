#!/usr/bin/env node
// Fixture-level regression probes for the calibration seed in examples/fixtures/.
// Zero dependencies; run with Node >= 16.7.0 (uses fs.cpSync).
//
// Scope, stated honestly: twenty hand-written controls (README count wrong-value + two coexistence
// variants, a temp-path junction/symlink alias, the leading-pipe table convention across
// body/header/delimiter rows in three GFM-legal width variants, block-level quiet/flag probes
// after a table — including empty heading/list and tab-expanded-indent boundaries — and
// escape-guard fence-state probes), thirteen rule-text presence controls (see ruleTextControls below), and two
// crude source probes (B5/B26). They verify that the seed still discriminates
// positive from negative and that the categories it cites still exist and are still routed —
// nothing more. They are NOT a recall measurement of the audit, and the rule-text controls pin
// greppable API/type signatures, not whole paragraphs: pinning prose in CI turns every legitimate
// rewrite into a red build and freezes whichever phrasing shipped first.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(root, 'examples', 'fixtures');
const cases = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'cases.json'), 'utf8'));
const skillText = fs.readFileSync(path.join(root, 'skill', 'SKILL.md'), 'utf8');
const moduleFor = {
  B5: 'unsafe-and-ffi.md',
  B26: 'data-and-types.md',
  C12: 'deps-macros-ergonomics.md',
  C12a: 'deps-macros-ergonomics.md',
};

function detectUnionValidity(source) {
  const invalidFields = new Set();
  for (const union of source.matchAll(/union\s+\w+\s*\{([\s\S]*?)\}/g)) {
    for (const field of union[1].matchAll(/\b(\w+)\s*:\s*([^,\n]+)/g)) {
      const type = field[2].trim();
      if (/^(bool|char|&|NonZero|NonNull|fn\b)/.test(type)) invalidFields.add(field[1]);
    }
  }
  return [...invalidFields].some((field) => new RegExp(`unsafe\\s*\\{[^}]*\\.${field}\\b`, 's').test(source));
}

// Crude textual probe, not a const-vs-runtime analysis: flags any `<<`/`>>` whose right-hand side
// is an identifier. It cannot tell a `const`/literal count from a runtime one — SCREAMING_CASE is
// a naming convention, not proof of constness, and a lowercase `const` would evade a name-based
// filter — so it does not try to distinguish them. `.checked_shl(count)` and friends are method
// calls and never emit a `<<`/`>>` token, so they are unaffected either way.
function detectRuntimeShift(source) {
  return /\b[A-Za-z_]\w*\s*(?:<<|>>)\s*[A-Za-z_]\w*/.test(source);
}

const detectors = new Map([
  ['B5', detectUnionValidity],
  ['B26', detectRuntimeShift],
]);
const failures = [];

// Structural contract: a fixture may not cite a category that has been renamed away or that no
// longer appears in SKILL.md's routing tables. This catches the real drift (a category id going
// stale under the fixtures) without touching rule text.
for (const [category, moduleFile] of Object.entries(moduleFor)) {
  const body = fs.readFileSync(path.join(root, 'skill', moduleFile), 'utf8');
  if (!new RegExp(`^## §${category}\\.`, 'm').test(body)) failures.push(`${category}: no "## §${category}." section header in skill/${moduleFile}`);
  if (!new RegExp(`§${category}\\b`).test(skillText)) failures.push(`${category}: cited by a fixture but not routed from SKILL.md`);
}

// Negative controls for dev/validate.mjs's README.md category-count check (the README.md entry in
// categoryCountMentions): prove the check actually catches a wrong/stale count, not just that it
// finds the correct one. Both controls run validate.mjs against a TEMPORARY COPY of the repo, never
// against the caller's real working tree — an earlier version of this fixture mutated the real
// README.md in place and relied on a `finally` block to restore it, which does not run on process
// kill, machine loss, or a crash between the write and the restore (reproduced: an interrupted run
// left `README.md` modified and `git status` dirty). A stray temp directory left behind by an
// interruption here is harmless OS clutter, never a dirty tracked file.
// `os.tmpdir()` can itself resolve to a path inside the repo (a project-local TEMP/TMP override —
// a supported, real dev/CI configuration, reproduced: with both set to `$repo/.round8-tmp`,
// `fs.cpSync(root, tmpRoot)` throws ERR_FS_CP_EINVAL because it refuses to copy a directory into
// its own subdirectory). Detect that case and fall back to a sibling of the repo root instead,
// which cannot be nested inside it.
//
// The containment check itself must compare PHYSICAL paths, not lexical ones: a `TEMP`/`TMP` that
// points at a junction (Windows) or symlink whose real target sits inside the repo passes a bare
// `path.resolve()` prefix check (the alias path string doesn't textually start with the repo path)
// while `fs.cpSync` still walks the same physical directory tree `fs.cpSync` is about to copy from
// — reproduced: aliasing `TEMP` to a junction pointing at a directory inside the repo recursively
// self-copies under the lexical-only check. `fs.realpathSync.native` resolves the actual
// filesystem target (following symlinks/junctions) before the containment comparison runs.
function resolvePhysical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function isInside(candidate, ancestor) {
  const withSep = (p) => (p.endsWith(path.sep) ? p : p + path.sep);
  // Windows paths are case-insensitive; realpathSync.native does not normalize case for us.
  const norm = (p) => (process.platform === 'win32' ? withSep(p).toLowerCase() : withSep(p));
  return norm(candidate).startsWith(norm(ancestor));
}

function makeTempRootOutside(sourceRoot) {
  const sourcePhysical = resolvePhysical(sourceRoot);
  const osTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-validate-'));
  const osTempPhysical = resolvePhysical(osTemp);
  if (!isInside(osTempPhysical, sourcePhysical) && !isInside(sourcePhysical, osTempPhysical)) return osTemp;
  fs.rmSync(osTemp, { recursive: true, force: true });
  const sibling = fs.mkdtempSync(path.join(path.dirname(sourceRoot), '.rust-intel-validate-'));
  const siblingPhysical = resolvePhysical(sibling);
  if (!isInside(siblingPhysical, sourcePhysical) && !isInside(sourcePhysical, siblingPhysical)) return sibling;
  fs.rmSync(sibling, { recursive: true, force: true });
  throw new Error(`could not find a temp root physically outside ${sourcePhysical} — both os.tmpdir() and the sibling-of-repo fallback resolve inside it`);
}

// Explicit allowlist of what dev/validate.mjs reads or spawns (verified against its source):
// link/header scans over skill/ and skills/, count mentions in README.md/package.json/
// .claude-plugin/, the plugin manifests, commands/rust-intel-cc/audit.md, the spawned
// installer + fixture script, and the `required` existence list. Copying only these — not the
// whole tree — means an unrelated locked/generated/untracked worktree directory can never
// break or slow the run; the growing exclusion list this replaces was that failure class
// repeating.
const validateInputs = [
  'skill',
  'skills',
  'README.md',
  'package.json',
  '.claude-plugin',
  '.codex-plugin',
  'bin',
  'commands',
  'dev/validate.mjs',
  'dev/semver.mjs',
  'dev/set-release-version.mjs',
  'dev/check-release-version.mjs',
  'dev/validate-fixtures.mjs',
  'examples/fixtures/cases.json',
];

// Optional validator inputs: dev/validate.mjs only checks the EXISTENCE of .app.json/.mcp.json
// when plugin.json declares apps/mcpServers (it never reads them) — copy them only when present
// or a mutated copy could pass/fail the existence check differently from the real repo.
const optionalValidateInputs = ['.app.json', '.mcp.json'];

function runValidateAgainstMutatedFiles(relativePaths, mutate) {
  const tmpRoot = makeTempRootOutside(root);
  try {
    for (const rel of validateInputs) {
      fs.cpSync(path.join(root, rel), path.join(tmpRoot, rel), { recursive: true });
    }
    for (const rel of optionalValidateInputs) {
      if (fs.existsSync(path.join(root, rel))) fs.cpSync(path.join(root, rel), path.join(tmpRoot, rel), { recursive: true });
    }
    for (const rel of relativePaths) {
      const filePath = path.join(tmpRoot, ...rel.split('/'));
      const mutated = mutate(fs.readFileSync(filePath, 'utf8'));
      if (mutated === null) return { skipped: true };
      fs.writeFileSync(filePath, mutated);
    }
    const run = spawnSync(process.execPath, [path.join(tmpRoot, 'dev', 'validate.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, RUST_INTEL_SKIP_NESTED_FIXTURES: '1' },
    });
    return { skipped: false, status: run.status, output: `${run.stdout || ''}${run.stderr || ''}` };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function runValidateAgainstMutatedCopy(mutateReadme) {
  return runValidateAgainstMutatedFiles(['README.md'], mutateReadme);
}

// Control 1: mutate the banner's required count to a wrong number outright.
{
  const result = runValidateAgainstMutatedCopy((original) => {
    const m = original.match(/Numbered categories now \*\*(\d+)\*\*/);
    if (!m) return null;
    const wrongCount = Number.parseInt(m[1], 10) - 1;
    return original.replace(m[0], `Numbered categories now **${wrongCount}**`);
  });
  if (result.skipped) failures.push('README.md negative control: could not find the "Numbered categories now **N**" banner sentence to mutate');
  else if (result.status === 0) failures.push("README.md negative control: dev/validate.mjs still passed after README.md's stated category count was mutated to a wrong number");
  else if (!result.output.includes('README.md')) failures.push(`README.md negative control: dev/validate.mjs failed but its output did not mention README.md — got: ${result.output.trim()}`);
}

// Control 2: keep the correct, required `**N**` banner intact, but add a COEXISTING stale
// Markdown-emphasized count elsewhere in the same scanned region. This is the false-negative this
// fixture previously could not have caught: the stale-count scanner's digit pattern requires
// whitespace immediately after the digits, which `**58**` (digit, then `**`, then space) does not
// satisfy, so an emphasized stale mention sitting right next to a correct one used to pass silently.
{
  const result = runValidateAgainstMutatedCopy((original) => {
    const m = original.match(/Numbered categories now \*\*(\d+)\*\*/);
    if (!m) return null;
    const staleCount = Number.parseInt(m[1], 10) - 1;
    return original.replace(m[0], `${m[0]} Temporary probe: **${staleCount}** categories.`);
  });
  if (result.skipped) failures.push('README.md coexistence control: could not find the banner sentence to append a stale mention after');
  else if (result.status === 0) failures.push('README.md coexistence control: dev/validate.mjs still passed with a correct **N** banner alongside a coexisting stale **N-1** categories mention (Markdown-emphasis false negative)');
  else if (!result.output.includes('README.md')) failures.push(`README.md coexistence control: dev/validate.mjs failed but its output did not mention README.md — got: ${result.output.trim()}`);
}

// Control 3: same coexistence shape as Control 2, but with the stale mention wrapped in
// underscore-emphasis (`__58__`) instead of `**58**` — proves the scanner strips more than one
// Markdown wrapper form, not just the one form Control 2 happens to use.
{
  const result = runValidateAgainstMutatedCopy((original) => {
    const m = original.match(/Numbered categories now \*\*(\d+)\*\*/);
    if (!m) return null;
    const staleCount = Number.parseInt(m[1], 10) - 1;
    return original.replace(m[0], `${m[0]} Temporary probe: __${staleCount}__ categories.`);
  });
  if (result.skipped) failures.push('README.md underscore-coexistence control: could not find the banner sentence to append a stale mention after');
  else if (result.status === 0) failures.push('README.md underscore-coexistence control: dev/validate.mjs still passed with a correct **N** banner alongside a coexisting stale __N-1__ categories mention (Markdown-emphasis false negative)');
  else if (!result.output.includes('README.md')) failures.push(`README.md underscore-coexistence control: dev/validate.mjs failed but its output did not mention README.md — got: ${result.output.trim()}`);
}

// Control 4: TEMP/TMP resolves — via a symlink on POSIX, a junction on Windows — to a directory
// whose PHYSICAL target sits inside the repo, even though the alias's own (lexical) path does not.
// This is the exact bypass a `path.resolve()`-only containment check misses: reproduced by pointing
// `TEMP` at a junction whose real target is `root/.rust-intel-validate-junction-target-*`, which
// `makeTempRootOutside`'s physical-path check (via `fs.realpathSync.native`) must route around.
{
  const restoreEnv = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  const aliasPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-validate-alias-'));
  fs.rmSync(aliasPath, { recursive: true, force: true }); // symlinkSync requires the link path to not exist yet
  const physicalTarget = fs.mkdtempSync(path.join(root, '.rust-intel-validate-junction-target-'));
  const prevTemp = process.env.TEMP;
  const prevTmp = process.env.TMP;
  let tmpRootFromAlias = null;
  try {
    let aliasCreated = false;
    try {
      fs.symlinkSync(physicalTarget, aliasPath, 'junction'); // 'junction' type is Windows-only, ignored (plain symlink) elsewhere
      aliasCreated = true;
    } catch (e) {
      // Creating a directory symlink/junction can fail on a locked-down environment (e.g. a
      // Windows account without SeCreateSymbolicLinkPrivilege and no Developer Mode). That is an
      // environment limitation, not evidence the fix works — skip rather than false-pass. Only
      // link creation is skip-worthy; any later exception is a real regression in this control's
      // own logic and must surface as a test failure, not an environmental skip.
      console.log(`(skipped junction/symlink alias control: could not create the alias — ${e.message})`);
    }
    if (aliasCreated) {
      try {
        process.env.TEMP = aliasPath;
        process.env.TMP = aliasPath;
        tmpRootFromAlias = makeTempRootOutside(root);
        const resolvedTmpRoot = resolvePhysical(tmpRootFromAlias);
        const resolvedRoot = resolvePhysical(root);
        if (isInside(resolvedTmpRoot, resolvedRoot)) {
          failures.push(`junction/symlink alias control: makeTempRootOutside returned ${tmpRootFromAlias} (physically ${resolvedTmpRoot}), which is still inside the repo (${resolvedRoot}) despite the alias's own lexical path pointing outside it`);
        }
      } catch (e) {
        failures.push(`junction/symlink alias control: failed after the alias was created — a regression in the containment logic, not an environment limitation: ${e.message}`);
      } finally {
        restoreEnv('TEMP', prevTemp);
        restoreEnv('TMP', prevTmp);
      }
    }
  } finally {
    if (tmpRootFromAlias) fs.rmSync(tmpRootFromAlias, { recursive: true, force: true });
    fs.rmSync(aliasPath, { recursive: true, force: true });
    fs.rmSync(physicalTarget, { recursive: true, force: true });
  }
}

// Control 5: strip the leading `|` from one known trigger-table row of SKILL.md — in BOTH the
// canonical file and its Codex mirror, so the mirror-sync check stays quiet and the missing-
// leading-pipe error is the only failure. The row stays a valid GFM table row (outer pipes are
// optional), so the historical behavior was to silently end the table there and skip the row
// from the duplicate-trigger scan; this proves the validator now fails loudly instead.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1 || original[at - 1] !== '\n') return null;
    return original.slice(0, at) + original.slice(at + 1); // drop exactly the leading `|`
  });
  if (result.skipped) failures.push('SKILL.md leading-pipe control: could not find the `Rc<RefCell<...>>` trigger row at the start of a line to strip');
  else if (result.status === 0) failures.push('SKILL.md leading-pipe control: dev/validate.mjs still passed after a trigger-table row lost its leading `|`');
  else if (!result.output.includes('missing its leading `|`')) failures.push(`SKILL.md leading-pipe control: dev/validate.mjs failed but its output did not name the missing leading \`|\` — got: ${result.output.trim()}`);
}

// Controls 6-7 (sibling width variants of Control 5): a pipe-less body row is GFM-legal at any
// width — fewer cells are padded with empties, excess cells ignored — so the historical
// exact-cell-count match flagged only the equal-width case. Strip the leading `|` AND make the
// row one cell narrower / one cell wider than its neighbor; both must be flagged like Control 5.
for (const [name, mutateRow] of [
  ['fewer-cell', (row) => row.slice(1, row.lastIndexOf('|', row.length - 2))],
  ['excess-cell', (row) => `${row.slice(1)}extra cell |`],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1 || original[at - 1] !== '\n') return null;
    const lineEnd = original.indexOf('\n', at);
    return original.slice(0, at) + mutateRow(original.slice(at, lineEnd)) + original.slice(lineEnd);
  });
  if (result.skipped) failures.push(`SKILL.md ${name} leading-pipe control: could not find the \`Rc<RefCell<...>>\` trigger row at the start of a line to strip`);
  else if (result.status === 0) failures.push(`SKILL.md ${name} leading-pipe control: dev/validate.mjs still passed after a trigger-table row lost its leading \`|\` (GFM-valid different-width row)`);
  else if (!result.output.includes('missing its leading `|`')) failures.push(`SKILL.md ${name} leading-pipe control: dev/validate.mjs failed but its output did not name the missing leading \`|\` — got: ${result.output.trim()}`);
}

// Controls 8-12: a table's HEADER row and DELIMITER row can lose their leading pipe too — both
// were invisible to the old two-variable state machine — while lines that immediately follow a
// table split two ways: a GFM block-level start (HTML block, ≥4-space indented code block) is
// NOT a row and must stay quiet, but a link reference definition is NOT a block start (a
// pipe-less '[x]:' line is a one-cell row) and must be flagged like any pipe-less row.
for (const [name, marker] of [
  ['header-row', '| Code pattern in user input | Activates |'],
  ['delimiter-row', '|---|---|'],
]) {
  const before = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const markerAt = before.indexOf(marker);
  const expectedLine = markerAt === -1 ? -1 : before.slice(0, markerAt).split('\n').length;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const at = original.indexOf(marker);
    if (at === -1 || original[at - 1] !== '\n') return null;
    return original.slice(0, at) + original.slice(at + 1); // drop exactly the leading `|`
  });
  if (result.skipped) failures.push(`SKILL.md ${name} leading-pipe control: could not find the ${name} row at the start of a line to strip`);
  else if (result.status === 0) failures.push(`SKILL.md ${name} leading-pipe control: dev/validate.mjs still passed after the ${name} of a trigger table lost its leading \`|\``);
  else if (!result.output.includes('missing its leading `|`')) failures.push(`SKILL.md ${name} leading-pipe control: dev/validate.mjs failed but its output did not name the missing leading \`|\` — got: ${result.output.trim()}`);
  // The header case is the regression-prone one: a header confirmed by a LATER delimiter row must
  // be cited by its OWN line, not the delimiter's — catches exactly the bug this control's first
  // version (round-14 pre-fix) missed by only checking for the substring, not the line number.
  else if (expectedLine !== -1 && !result.output.includes(`skill/SKILL.md:${expectedLine}:`)) failures.push(`SKILL.md ${name} leading-pipe control: dev/validate.mjs cited the wrong line for the ${name} — expected skill/SKILL.md:${expectedLine}, got: ${result.output.trim()}`);
}

for (const [name, inserted, mustPass] of [
  ['HTML-block-start', '<div>probe</div>', true],
  ['indented-code-start', '    indented code probe', true],
  ['link-reference-definition', '[x]: https://example.invalid/x', false],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1) return null;
    const lineEnd = original.indexOf('\n', at);
    return original.slice(0, lineEnd + 1) + inserted + original.slice(lineEnd);
  });
  if (result.skipped) failures.push(`SKILL.md ${name} control: could not find the \`Rc<RefCell<...>>\` trigger row to insert the probe line after`);
  else if (mustPass && result.status !== 0) failures.push(`SKILL.md ${name} control: dev/validate.mjs flagged a GFM block-level start (${name}) immediately after a table as a pipe-less table row — got: ${result.output.trim()}`);
  else if (!mustPass && (result.status === 0 || !result.output.includes('missing its leading `|`'))) failures.push(`SKILL.md ${name} control: dev/validate.mjs did not flag a pipe-less ${name} row directly after a table as a missing-leading-pipe row (a link reference definition is not a GFM block start) — got: ${result.output.trim()}`);
}

// Controls 13-15: valid GFM block starts the old allowlist missed — an empty ATX heading
// (marker with nothing after it), an empty list item (marker then end-of-line), and
// indentation reaching column 4 through tab expansion (GFM §2.2) — all terminate an open
// table and must stay quiet, not be flagged as pipe-less rows.
for (const [name, inserted] of [
  ['empty-ATX-heading', '#'],
  ['empty-list-item', '-'],
  ['tab-expanded-indented-code', '  \tindented probe'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1) return null;
    const lineEnd = original.indexOf('\n', at);
    return original.slice(0, lineEnd + 1) + inserted + original.slice(lineEnd);
  });
  if (result.skipped) failures.push(`SKILL.md ${name} control: could not find the \`Rc<RefCell<...>>\` trigger row to insert the probe line after`);
  else if (result.status !== 0) failures.push(`SKILL.md ${name} control: dev/validate.mjs flagged a GFM block-level start (${name}) immediately after a table as a pipe-less table row — got: ${result.output.trim()}`);
}

// Controls 16-20: the `\"` guard's fence state must track the opener's marker + length
// (GFM §4.5), not toggle on any fence-looking line — a 3-backtick line inside a 4-backtick
// fence, a ~~~ line inside a backtick fence, a would-be closer carrying trailing non-space
// text (only spaces/tabs may follow a closer), a would-be closer suffixed with a form feed
// (cmark-gfm's closer scanner allows only ASCII space/tab after the delimiter, so any other
// whitespace character leaves the fence open), and a tab-indented ``` (a tab indent is not
// 0-3 spaces, so the fence stays open) are all content, so an `\"` after them is still
// inside code and must stay unflagged.
for (const [name, fenceLines] of [
  ['4-backtick-fence-3-backtick-content', ['````md', 'let recipe = "a";', '```', 'let escaped = "x \\" y";', '````']],
  ['backtick-fence-tilde-content', ['```md', '~~~', 'let escaped = "x \\" y";', '```']],
  ['closer-trailing-text-fence-still-open', ['```md', 'let recipe = "a";', '``` trailing', 'let escaped = "x \\" y";', '```']],
  ['closer-form-feed-suffix-fence-still-open', ['```md', 'let recipe = "a";', '``` \f', 'let escaped = "x \\" y";', '```']],
  ['tab-indented-fake-closer', ['```md', '\t```', 'let escaped = "x \\" y";', '```']],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1) return null;
    const lineEnd = original.indexOf('\n', at);
    return original.slice(0, lineEnd + 1) + fenceLines.join('\n') + original.slice(lineEnd);
  });
  if (result.skipped) failures.push(`escape-guard ${name} control: could not find the \`Rc<RefCell<...>>\` trigger row to insert the probe lines after`);
  else if (result.status !== 0) failures.push(`escape-guard ${name} control: dev/validate.mjs rejected an \\" escape sitting inside a still-open fence (${name}) — got: ${result.output.trim()}`);
}

// Controls 21-22: GFM §4.5 restricts openers themselves — a tab-indented ``` is indented
// code (only 0-3 spaces indent a fence) and a backtick fence whose info string holds a
// backtick is not an opener — so neither opens a fence and an `\"` after either must be
// flagged, not suppressed.
for (const [name, openerLines] of [
  ['tab-indented-fake-opener', ['\t```', 'let escaped = "x \\" y";']],
  ['backtick-in-info-string-opener', ['```lang`invalid', 'let escaped = "x \\" y";']],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (original) => {
    const marker = '| `Rc<RefCell<...>>` crossing `.await` or sent across threads |';
    const at = original.indexOf(marker);
    if (at === -1) return null;
    const lineEnd = original.indexOf('\n', at);
    return original.slice(0, lineEnd + 1) + openerLines.join('\n') + original.slice(lineEnd);
  });
  if (result.skipped) failures.push(`escape-guard ${name} control: could not find the \`Rc<RefCell<...>>\` trigger row to insert the probe lines after`);
  else if (result.status === 0 || !result.output.includes('literal \\" escape outside a fenced code block')) failures.push(`escape-guard ${name} control: dev/validate.mjs did not flag an \\" escape after an invalid fence opener (${name}) — got: ${result.output.trim()}`);
}

// Rule-text presence controls for the corrected high-risk rules: a revert of the correction in
// the canonical file must go red. The checks pin greppable API/type signatures and the stated
// invariant token, not whole paragraphs; the Codex mirror needs no separate check —
// dev/validate.mjs enforces byte identity between the two trees.
function sectionOf(text, header) {
  const start = text.indexOf(header);
  if (start === -1) return '';
  const next = text.indexOf('\n## §', start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

function rowOf(text, anchor) {
  const line = text.split('\n').find((row) => row.includes(anchor));
  return line === undefined ? '' : line;
}
const ruleTextControls = [
  { name: 'B2 map-guard types (skill/async.md §B2)', file: 'skill/async.md', section: '## §B2.', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMulti', 'get_sync`/`get_async` return `Option<OccupiedEntry>`'] },
  { name: 'B2 map-guard phrase-trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'DashMap/concurrent-map lazy init + await', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMulti', 'owns or contains a map guard'] },
  { name: 'B2 map-guard code-pattern trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'a guard of a concurrent map (`DashMap`/`scc::HashMap`) live across a later `.await`', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMutMulti', 'owns or contains a map guard'] },
  { name: 'B14 JoinSet admission-gated drain (skill/concurrency-and-state.md §B14)', file: 'skill/concurrency-and-state.md', section: '## §B14.', require: ['poll_join_next', 'len() < N'], forbid: ['polling the `JoinSet` as a `Stream`'] },
  { name: 'B14 JoinSet trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'constructed or grown by any operation that adds tasks', require: ['poll_join_next', 'len() < N'], forbid: ['polling the `JoinSet` as a `Stream`'] },
  { name: 'C12 either-defense Markdown row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'Markdown-to-HTML renderer', require: ['Event::Html', 'Event::InlineHtml', 'either one alone satisfies this obligation'] },
  { name: 'C12 either-defense catalog row (skill/deps-macros-ergonomics.md)', file: 'skill/deps-macros-ergonomics.md', rowAnchor: 'Markdown rendering of untrusted content', require: ['either drop', '`Html`/`InlineHtml` events or'] },
  { name: 'F1 decode-observable corpus oracle (skill/semantics-and-conformance.md §F1)', file: 'skill/semantics-and-conformance.md', section: '## §F1.', require: ['finite graph of distinct serialized type/variant definitions', 'two representatives, not every runtime depth', 'decode-observable, not typed-value-level', 'schema-mutation negative control'] },
  { name: 'F1 corpus trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'golden-bytes decode **corpus**', require: ['finite graph of distinct serialized type/variant definitions', 'two representatives, not every runtime depth', 'decode-observable, not typed-value-level', 'schema-mutation negative control'] },
  { name: 'B12 Argon2/OsRng feature obligations (skill/security.md §B12)', file: 'skill/security.md', section: '## §B12.', require: ['State both obligations', 'getrandom` feature for `OsRng` to source entropy'] },
  { name: 'B12 clean-TOML recipe row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'store a password', require: ['rand_core = { version = "0.6", features = ["getrandom"] }', 'two feature obligations, not one'] },
  { name: 'B1a out-parameter cache witness (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'Show the caller for the §B1a laundering shape', require: ['fn remember', 'captured into a longer-lived cache/container that outlives the call'] },
  { name: 'B13 pure-reader exemption (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'pure reader that makes no check-then-act decision', require: ['need not hold the same guard'] },
];
for (const control of ruleTextControls) {
  const text = fs.readFileSync(path.join(root, control.file), 'utf8');
  const scoped = control.section ? sectionOf(text, control.section) : control.rowAnchor ? rowOf(text, control.rowAnchor) : text;
  for (const token of control.require || []) {
    if (!scoped.includes(token)) failures.push(`${control.name}: required signature "${token}" absent — the correction this control pins looks reverted or reworded past its greppable signature`);
  }
  for (const token of control.forbid || []) {
    if (scoped.includes(token)) failures.push(`${control.name}: forbidden signature "${token}" present — the corrected rule text looks reverted`);
  }
}

for (const fixture of cases) {
  const source = fs.readFileSync(path.join(fixtureRoot, fixture.file), 'utf8');
  const actual = [...detectors].filter(([, detect]) => detect(source)).map(([category]) => category).sort();
  const expected = [...fixture.expectedFindings].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${fixture.file}: expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `ERROR: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`fixture validation passed (${cases.length} cases)`);
