#!/usr/bin/env node
// Fixture-level regression probes for the calibration seed in examples/fixtures/.
// Zero dependencies; run with Node >= 16.7.0 (uses fs.cpSync).
//
// Scope, stated honestly: forty-one hand-written controls (README count wrong-value + two coexistence
// variants, a temp-path junction/symlink alias, the two anchored trigger-table conventions,
// bounded code-pattern duplicate/signature probes, explicit unsupported-style controls, project
// fence-state probes, and table-boundary integrity/stress probes), thirteen rule-text presence controls (see ruleTextControls below), and two
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

function runValidateAgainstMutatedFiles(relativePaths, mutate, spawnOptions = {}) {
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
      timeout: spawnOptions.timeoutMs,
      env: { ...process.env, RUST_INTEL_SKIP_NESTED_FIXTURES: '1' },
    });
    return { skipped: false, status: run.status, signal: run.signal, timedOut: run.error?.code === 'ETIMEDOUT', output: `${run.stdout || ''}${run.stderr || ''}` };
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

// Cycle-5 anchored table contract controls.
const fixtureTick = String.fromCharCode(96);
function splitFixtureLines(source) {
  return source.replace(/\r\n?/g, '\n').split('\n');
}
function anchoredTableLine(source, table, kind) {
  const lines = splitFixtureLines(source);
  const header = table === 'phrase'
    ? '| User request contains... | Activates category | Specific risk |'
    : '| Code pattern in user input | Activates |';
  const headerIndex = lines.findIndex((line) => line === header);
  if (headerIndex < 0) return null;
  const delimiterIndex = lines.findIndex((line, index) => index > headerIndex && /^\|[-:| ]+\|$/.test(line));
  if (delimiterIndex < 0) return null;
  const target = kind === 'header' ? headerIndex : kind === 'delimiter' ? delimiterIndex : delimiterIndex + 1;
  if (!lines[target] || !lines[target].startsWith('|')) return null;
  return { lines, target, lineNumber: target + 1 };
}
function mutateAnchoredLine(source, table, kind, mutate) {
  const hit = anchoredTableLine(source, table, kind);
  if (!hit) return null;
  hit.lines[hit.target] = mutate(hit.lines[hit.target]);
  return hit.lines.join('\n');
}
function insertCodeRows(source, rows) {
  const hit = anchoredTableLine(source, 'code', 'delimiter');
  if (!hit) return null;
  hit.lines.splice(hit.target + 1, 0, ...rows);
  return hit.lines.join('\n');
}
function appendProbe(source, lines) {
  return source.replace(/\r\n?/g, '\n').replace(/\n?$/, '\n') + lines.join('\n') + '\n';
}
function expectFixture(result, name, status, needles = []) {
  if (result.skipped) failures.push(name + ': required trigger-table anchor was not found');
  else if (result.status !== status || needles.some((needle) => !result.output.includes(needle))) {
    failures.push(name + ': expected status ' + status + ', got: ' + result.output.trim());
  }
}
function expectUnsupported(result, name) {
  if (result.skipped) failures.push(name + ': required trigger-table anchor was not found');
  else if (result.status === 0 || !/unsupported/i.test(result.output)) failures.push(name + ': expected explicit unsupported-style diagnostic, got: ' + result.output.trim());
}

// Controls 5-10: header, delimiter, and body rows of BOTH anchored tables retain raw column one.
for (const [table, label] of [['phrase', 'phrase'], ['code', 'code-pattern']]) {
  for (const kind of ['header', 'delimiter', 'body']) {
    const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
    const hit = anchoredTableLine(original, table, kind);
    const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
      mutateAnchoredLine(source, table, kind, (line) => line.slice(1)));
    const needles = ['missing its leading ' + fixtureTick + '|' + fixtureTick];
    if (hit) needles.push('skill/SKILL.md:' + hit.lineNumber + ':');
    expectFixture(result, 'anchored ' + label + ' ' + kind + ' leading-pipe', 1, needles);
  }
}

// Controls 11-12: one-column and arbitrary tables outside anchors are ignored.
for (const [name, rows] of [
  ['outside-anchor one-column', ['| outside-one-column |', '|---|', '| ' + fixtureTick + 'outside-one-column' + fixtureTick + ' |', '| ' + fixtureTick + 'outside-one-column' + fixtureTick + ' |']],
  ['outside-anchor arbitrary', ['| outside-arbitrary | other |', '|---|---|', '| ' + fixtureTick + 'outside-arbitrary' + fixtureTick + ' | body |', '| ' + fixtureTick + 'outside-arbitrary' + fixtureTick + ' | body |']],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, ['', ...rows, '']));
  expectFixture(result, name, 0);
}

// Control 13: duplicate detection is bounded to the anchored code-pattern body; the structural
// header is not itself an occurrence, and equal body rows remain an observable positive.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [
      '| ' + t + 'body-only-signature' + t + ' | first body |',
      '| ' + t + 'body-only-signature' + t + ' | second body |',
    ]));
  expectFixture(result, 'body-vs-header duplicate exclusion', 1, ['[body-only-signature]']);
}

// Controls 14-15: odd/even escaped-pipe parity is applied before cell extraction.
for (const [name, row, token] of [
  ['odd escaped-pipe parity', '| ' + fixtureTick + 'odd-parity' + fixtureTick + ' \\| second cell | body |', '[odd-parity]'],
  ['even escaped-pipe parity', '| ' + fixtureTick + 'even-parity' + fixtureTick + ' \\\\| body |', '[even-parity]'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row, row]));
  expectFixture(result, name, 1, [token]);
}

// Control 16: maximal delimiters and preserved interior whitespace remain in the allowed subset.
{
  const t = fixtureTick;
  const row = '| ' + t + t + t + t + 'multi  backtick' + t + t + t + t + ' | body |';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row, row]));
  expectFixture(result, 'maximal multi-backtick duplicate', 1, ['[multi  backtick]']);
}

// Control 17: edge-space normalization makes these two spans equal.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, ['| ' + t + ' edge ' + t + ' | body |', '| ' + t + 'edge' + t + ' | body |']));
  expectFixture(result, 'CommonMark code-span edge normalization', 1, ['[edge]']);
}

// Control 18: the signature map key is injective ([a,b] differs from [a + b]).
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, ['| ' + t + 'a' + t + ' ' + t + 'b' + t + ' | body |', '| ' + t + 'a + b' + t + ' | body |']));
  expectFixture(result, 'injective signature key', 0);
}


// Controls 19-22: unsupported complex inline constructs in a code-pattern first cell are
// rejected explicitly rather than silently hiding backticks or becoming duplicate rows.
for (const [name, row] of [
  ['inline link', '| [link](https://example.test/' + fixtureTick + 'destination' + fixtureTick + ') | body |'],
  ['inline image', '| ![image](https://example.test/' + fixtureTick + 'destination' + fixtureTick + ') | body |'],
  ['reference link', '| [reference][id] | body |'],
  ['raw inline markup', '| <span data-code="' + fixtureTick + 'attribute' + fixtureTick + '"> | body |'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row, row]));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Controls 23-25: raw HTML blocks and list/blockquote-prefixed fences are unsupported styles
// for the explicit top-level contract and must produce a named diagnostic.
for (const [name, rows] of [
  ['raw HTML block', ['<div>', '| ' + fixtureTick + 'html-unsupported' + fixtureTick + ' | body |', '|---|---|', '| ' + fixtureTick + 'html-unsupported' + fixtureTick + ' | body |', '</div>']],
  ['list-prefixed fence', ['- ' + fixtureTick + fixtureTick + fixtureTick + 'md', '| ' + fixtureTick + 'list-fence-unsupported' + fixtureTick + ' | body |', fixtureTick + fixtureTick + fixtureTick]],
  ['blockquote-prefixed fence', ['> ' + fixtureTick + fixtureTick + fixtureTick + 'md', '| ' + fixtureTick + 'quote-fence-unsupported' + fixtureTick + ' | body |', fixtureTick + fixtureTick + fixtureTick]],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, ['', ...rows, '']));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Controls 26-29: actual project fences with each legal root indentation (0-3 spaces) keep
// a JSON-style escaped quote literal, so it is not reported.
for (const spaces of ['', ' ', '  ', '   ']) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const opener = lines.findIndex((line) => /^(?:[\x60]{3,}|~{3,})[^\r\n]*$/.test(line));
    if (opener < 0) return null;
    const marker = lines[opener].match(/^(?:[\x60]{3,}|~{3,})/)[0];
    lines[opener] = spaces + lines[opener].slice(lines[opener].indexOf(marker));
    lines.splice(opener + 1, 0, 'let escaped = "x \\" y";');
    return lines.join('\n');
  });
  expectFixture(result, 'real ' + spaces.length + '-space project fence escape guard', 0);
}

// Controls 30-32: false closers/info strings remain observable. Valid closers keep the first
// two quiet; an invalid info string exposes the escape diagnostic.
for (const [name, rows, status, needle] of [
  ['trailing-text false closer', [fixtureTick + fixtureTick + fixtureTick + 'md', fixtureTick + fixtureTick + fixtureTick + ' trailing', 'let escaped = "x \\" y";', fixtureTick + fixtureTick + fixtureTick], 0, null],
  ['wrong-marker false closer', [fixtureTick + fixtureTick + fixtureTick + 'md', '~~~', 'let escaped = "x \\" y";', fixtureTick + fixtureTick + fixtureTick], 0, null],
  ['backtick-info-string false opener', [fixtureTick + fixtureTick + fixtureTick + 'bad' + fixtureTick + 'info', 'let escaped = "x \\" y";', ''], 1, 'literal \\" escape outside a fenced code block'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, ['', ...rows, '']));
  expectFixture(result, name, status, needle ? [needle] : []);
}


function anchoredTableEnd(source, table) {
  const hit = anchoredTableLine(source, table, 'body');
  if (!hit) return null;
  const markerText = table === 'phrase'
    ? '**Triggered by code, not phrase**'
    : 'When two or more triggers fire in one request';
  const marker = hit.lines.findIndex((line, index) => index > hit.target && line.startsWith(markerText));
  if (marker < 0) return null;
  return { lines: hit.lines, marker, lineNumber: marker + 1 };
}
function expectStructural(result, name, needles = []) {
  if (result.skipped) failures.push(name + ': required table boundary was not found');
  else if (result.status === 0 || needles.some((needle) => !result.output.includes(needle))) {
    failures.push(name + ': expected structural table diagnostic, got: ' + result.output.trim());
  }
}

// Controls 33-34: a blank in the middle of either anchored table is not a valid early
// truncation. The validator must report the broken table structure.
for (const [table, label] of [['phrase', 'phrase'], ['code', 'code-pattern']]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const hit = anchoredTableLine(source, table, 'body');
    if (!hit) return null;
    hit.lines.splice(hit.target + 1, 0, '');
    return hit.lines.join('\n');
  });
  expectStructural(result, 'mid-table blank ' + label, ['unexpected blank', 'table']);
}

// Controls 35-36: removing every pipe from a known body row must produce the exact
// wrong-width diagnostic at that row, not a silent end-of-table.
for (const [table, label, width] of [['phrase', 'phrase', 3], ['code', 'code-pattern', 2]]) {
  const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const hit = anchoredTableLine(original, table, 'body');
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    mutateAnchoredLine(source, table, 'body', (line) => line.replace(/\|/g, '')));
  const needles = ['skill/SKILL.md:' + (hit ? hit.lineNumber : -1) + ':', 'table body row has', 'expected ' + width];
  expectStructural(result, 'all-pipes-removed body ' + label, needles);
}

// Controls 37-38: each canonical header anchor is unique. A duplicate must be diagnosed as
// an anchor-integrity error, rather than allowing the duplicate to redefine the scan range.
for (const [table, label] of [['phrase', 'phrase'], ['code', 'code-pattern']]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const hit = anchoredTableLine(source, table, 'header');
    if (!hit) return null;
    hit.lines.splice(hit.target + 1, 0, hit.lines[hit.target]);
    return hit.lines.join('\n');
  });
  if (result.skipped) failures.push('duplicate ' + label + ' anchor: required table anchor was not found');
  else if (result.status === 0 || !/duplicate|unique|exactly/i.test(result.output)) failures.push('duplicate ' + label + ' anchor: expected anchor uniqueness diagnostic, got: ' + result.output.trim());
}

// Control 39: the explicit end marker is unique.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const hit = anchoredTableEnd(source, 'code');
    if (!hit) return null;
    hit.lines.splice(hit.marker + 1, 0, hit.lines[hit.marker]);
    return hit.lines.join('\n');
  });
  if (result.skipped) failures.push('duplicate code-pattern end marker: required end marker was not found');
  else if (result.status === 0 || !/duplicate|unique|exactly/i.test(result.output)) failures.push('duplicate code-pattern end marker: expected end-marker uniqueness diagnostic, got: ' + result.output.trim());
}

// Control 40: removing the required blank immediately before the code-table end marker must
// be diagnosed as malformed table structure.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const hit = anchoredTableEnd(source, 'code');
    if (!hit || hit.marker === 0 || !/^[ \t]*$/.test(hit.lines[hit.marker - 1])) return null;
    hit.lines.splice(hit.marker - 1, 1);
    return hit.lines.join('\n');
  });
  if (result.skipped) failures.push('missing end-marker blank: required blank/end marker was not found');
  else if (result.status === 0 || !/blank|end marker|table/i.test(result.output)) failures.push('missing end-marker blank: expected required-blank structural diagnostic, got: ' + result.output.trim());
}

// Control 41: bounded stress over many unmatched, differing backtick runs. Completion is the
// oracle, and a timeout/signal/nonzero status is a failure (there is no weak unsupported escape).
{
  const runs = Array.from({ length: 128 }, (_, index) => fixtureTick.repeat(index + 3)).join(' token ');
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, ['| ' + runs + ' | bounded stress |']), { timeoutMs: 5000 });
  if (result.skipped || result.timedOut || result.signal || result.status !== 0) {
    failures.push('unmatched-backtick stress control: validator timed out, was signalled, or failed: ' + result.output.trim());
  }
}


function insertBeforeText(source, markerText, linesToInsert) {
  const lines = splitFixtureLines(source);
  const at = lines.findIndex((line) => line === markerText);
  if (at < 0) return null;
  lines.splice(at, 0, ...linesToInsert);
  return lines.join('\n');
}
function anchoredEndLine(source, table) {
  const hit = anchoredTableEnd(source, table);
  if (!hit) return null;
  return hit.lines[hit.marker];
}
function expectAnchorScaffold(result, name, required = []) {
  if (result.skipped) failures.push(name + ': required table scaffold was not found');
  else if (result.status === 0 || required.some((needle) => !result.output.includes(needle))) {
    failures.push(name + ': expected scaffold diagnostic, got: ' + result.output.trim());
  }
}

// Control 42: a trailing backslash is content inside a closing code span. Equal body rows
// must still produce one duplicate signature.
{
  const t = fixtureTick;
  const row = '| ' + t + 'trailing\\' + t + ' | body |';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row, row]));
  expectFixture(result, 'trailing-backslash code-span duplicate', 1, ['duplicate code-pattern trigger rows', 'trailing']);
}

// Control 43: an unmatched/false code span must not hide unsupported syntax that follows it.
{
  const t = fixtureTick;
  const row = '| prose ' + t + ' <custom-tag | body |';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row]));
  expectUnsupported(result, 'false code-span outside raw-markup control');
}

// Control 44: exact anchors and end markers written inside a supported fence are literals.
{
  const t = fixtureTick;
  const fence = t.repeat(3);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, [
    '', fence + 'md',
    '| User request contains... | Activates category | Specific risk |',
    '|---|---|---|',
    '| fenced-anchor-literal | body | literal |',
    '**Triggered by code, not phrase**',
    '| Code pattern in user input | Activates |',
    '|---|---|',
    '| ' + t + 'fenced-table-literal' + t + ' | literal |',
    'When two or more triggers fire in one request',
    fence, '',
  ]));
  expectFixture(result, 'fenced anchors and end markers are ignored', 0);
}

// Control 45: fencing the entire required code-pattern table hides its scaffold and must fail.
{
  const t = fixtureTick;
  const fence = t.repeat(3);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const header = anchoredTableLine(source, 'code', 'header');
    const end = anchoredTableEnd(source, 'code');
    if (!header || !end) return null;
    end.lines.splice(end.marker + 1, 0, fence);
    header.lines.splice(header.target, 0, fence + 'md');
    return header.lines.join('\n');
  });
  expectAnchorScaffold(result, 'fenced required code-pattern table', ['missing', 'code-pattern']);
}

// Control 46: moving the code end marker immediately after its delimiter cannot hide the body.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const end = anchoredTableEnd(source, 'code');
    if (!end) return null;
    const markerLine = end.lines[end.marker];
    end.lines.splice(end.marker, 1);
    const blank = end.lines.findIndex((line, index) => index > 0 && /^[ \t]*$/.test(line) && end.lines[index + 1] !== undefined);
    if (blank >= 0) end.lines.splice(blank, 1);
    const delimiter = anchoredTableLine(end.lines.join('\n'), 'code', 'delimiter');
    if (!delimiter) return null;
    end.lines.splice(delimiter.target + 1, 0, markerLine);
    return end.lines.join('\n');
  });
  expectAnchorScaffold(result, 'early code-pattern end marker', ['end marker', 'blank']);
}

// Control 47: a duplicate code anchor before the prompt table is still globally invalid.
{
  const t = fixtureTick;
  const fence = t.repeat(3);
  const duplicate = [
    '| Code pattern in user input | Activates |',
    '|---|---|',
    '| ' + t + 'pre-anchor' + t + ' | body |',
    'When two or more triggers fire in one request',
    '',
  ];
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertBeforeText(source, '| User request contains... | Activates category | Specific risk |', duplicate));
  expectAnchorScaffold(result, 'code anchor before prompt anchor', ['code-pattern', 'exactly', 'once']);
}

// Controls 48-51: nested/mixed container-prefixed fences and HTML are unsupported styles.
for (const [name, lines] of [
  ['nested list-quote fence', ['- > ' + fixtureTick.repeat(3) + 'md', 'literal table-like content', '- > ' + fixtureTick.repeat(3)]],
  ['nested quote-list fence', ['> - ' + fixtureTick.repeat(3) + 'md', 'literal table-like content', '> - ' + fixtureTick.repeat(3)]],
  ['list-prefixed HTML', ['- <div>', 'literal HTML content', '</div>']],
  ['blockquote-prefixed HTML', ['> <div>', 'literal HTML content', '</div>']],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, ['', ...lines, '']));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Control 52: a generic closing raw tag is unsupported even when it is not a block tag.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', '</custom-tag>', '']));
  expectUnsupported(result, 'generic closing raw tag unsupported-style control');
}

// Controls 53-58: extended autolinks outside code spans are unsupported, including a benign
// non-autolink boundary spelling.
for (const [name, row] of [
  ['https autolink', '| <https://example.test> | body |'],
  ['www autolink', '| <www.example.test> | body |'],
  ['email autolink', '| <user@example.test> | body |'],
  ['mailto autolink', '| <mailto:user@example.test> | body |'],
  ['xmpp autolink', '| <xmpp:user@example.test> | body |'],
  ['benign angle boundary', '| <not-an-autolink> | body |'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row]));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Controls 59-60: opening-only and closing-only raw HTML are independently rejected.
for (const [name, line] of [
  ['raw HTML opening-only', '<div>'],
  ['raw HTML closing-only', '</div>'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', line, '']));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Control 61: a valid tilde fence suppresses its internal escape, then the post-closer escape
// is independently diagnosed.
{
  const t = fixtureTick;
  const fence = '~'.repeat(3);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', fence + 'md', 'let inside = "x \\" y";', fence, 'let outside = "x \\" y";', '']));
  expectFixture(result, 'tilde fence and post-closer escape', 1, ['literal \\" escape outside a fenced code block']);
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
