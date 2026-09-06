#!/usr/bin/env node
// Fixture-level regression probes for the calibration seed in examples/fixtures/.
// Zero dependencies; run with Node >= 16.7.0 (uses fs.cpSync).
//
// Scope, stated honestly: three hundred forty-three hand-written controls (README count wrong-value + two coexistence
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
    const script = spawnOptions.script || 'dev/validate.mjs';
    const run = spawnSync(process.execPath, [path.join(tmpRoot, ...script.split('/'))], {
      encoding: 'utf8',
      timeout: spawnOptions.timeoutMs ?? 30_000,
      env: {
        ...process.env,
        RUST_INTEL_SKIP_NESTED_FIXTURES: '1',
        ...(spawnOptions.env || {}),
      },
    });
    const error = run.error || null;
    return {
      skipped: false,
      status: run.status,
      signal: run.signal,
      timedOut: error?.code === 'ETIMEDOUT',
      error: error ? `${error.code || error.name || 'spawn error'}: ${error.message}` : null,
      executionFailure: Boolean(error || run.signal || run.status === null),
      output: `${run.stdout || ''}${run.stderr || ''}`,
    };
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
  else if (result.executionFailure) failures.push(`README.md negative control: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`README.md coexistence control: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`README.md underscore-coexistence control: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`${name}: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
  else if (result.status !== status || needles.some((needle) => !result.output.includes(needle))) {
    failures.push(name + ': expected status ' + status + ', got: ' + result.output.trim());
  }
}
function expectUnsupported(result, name) {
  if (result.skipped) failures.push(name + ': required trigger-table anchor was not found');
  else if (result.executionFailure) failures.push(`${name}: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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

// Controls 14-15: odd/even escaped-pipe parity is applied before cell extraction. This is the
// repository's raw-pipe convention, not a claim that GFM's table parser exposes this exact API.
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
  else if (result.executionFailure) failures.push(`${name}: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`duplicate ${label} anchor: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`duplicate code-pattern end marker: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
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
  else if (result.executionFailure) failures.push(`missing end-marker blank: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
  else if (result.status === 0 || !/blank|end marker|table/i.test(result.output)) failures.push('missing end-marker blank: expected required-blank structural diagnostic, got: ' + result.output.trim());
}

// Control 41: a parser-termination smoke probe over many unmatched, constant-size double-backtick
// runs. Each raw run is escaped at its first tick, which exposes a synthetic one-tick opener, but
// the input has no raw one-tick run that could close it. The validator's deterministic
// linear-operation budget is the primary oracle (a budget diagnostic is a failure); the generous
// timeout is only a last-resort safety watchdog against nontermination. Keeping every candidate
// the same size makes this an O(k)-byte adversarial shape rather than a growing-run benchmark.
{
  const runs = Array.from({ length: 96 }, () => '\\' + fixtureTick.repeat(2) + 'synthetic').join(' token ');
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, ['| ' + runs + ' | termination smoke |']), { timeoutMs: 30_000 });
  if (result.skipped || result.executionFailure || result.status !== 0 || /linear operation budget/i.test(result.output)) {
    const detail = result.error || result.output?.trim() || (result.skipped ? 'mutation was skipped' : 'unknown failure');
    failures.push('unmatched-backtick termination smoke control: validator failed its deterministic operation-budget oracle: ' + detail);
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
function expectAnchorScaffold(result, name, required = [], forbidden = []) {
  if (result.skipped) failures.push(name + ': required table scaffold was not found');
  else if (result.executionFailure) failures.push(`${name}: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
  else if (result.status === 0 || required.some((needle) => !result.output.includes(needle)) || forbidden.some((needle) => result.output.includes(needle))) {
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
    const lines = splitFixtureLines(source);
    const header = lines.findIndex((line) => line === '| Code pattern in user input | Activates |');
    const delimiter = header < 0 ? -1 : header + 1;
    const marker = lines.findIndex((line, index) => index > delimiter && line.startsWith('When two or more triggers fire in one request'));
    if (header < 0 || marker < 0 || !/^\|[-:| ]+\|$/.test(lines[delimiter])) return null;
    // Keep one shared line array: mutating two independently split arrays used to leave the
    // closing fence out, accidentally turning this into an unclosed-fence probe.
    lines.splice(marker + 1, 0, fence);
    lines.splice(header, 0, fence + 'md');
    return lines.join('\n');
  });
  expectAnchorScaffold(result, 'fenced required code-pattern table', ['missing', 'code-pattern'], ['unclosed project fence']);
}

// Control 46: a zero-body table with its required blank separator is still malformed.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const header = lines.findIndex((line) => line === '| Code pattern in user input | Activates |');
    const delimiter = header < 0 ? -1 : header + 1;
    const marker = lines.findIndex((line, index) => index > delimiter && line.startsWith('When two or more triggers fire in one request'));
    if (header < 0 || marker < 0 || !/^\|[-:| ]+\|$/.test(lines[delimiter])) return null;
    lines.splice(delimiter + 1, marker - delimiter - 1, '');
    return lines.join('\n');
  });
  expectStructural(result, 'zero-body code-pattern table', ['body', 'row']);
}

// Control 47: an end marker after one valid row cannot hide the remaining rows. The marker is
// moved before the untouched remainder, so the surrounding post-marker scaffold is otherwise the
// canonical one and the failure is attributable to the early boundary itself.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const header = lines.findIndex((line) => line === '| Code pattern in user input | Activates |');
    const delimiter = header < 0 ? -1 : header + 1;
    const marker = lines.findIndex((line, index) => index > delimiter && line.startsWith('When two or more triggers fire in one request'));
    if (header < 0 || marker < 0 || !/^\|[-:| ]+\|$/.test(lines[delimiter])) return null;
    const firstBody = lines[delimiter + 1];
    if (!firstBody?.startsWith('|')) return null;
    const markerLine = lines.splice(marker, 1)[0];
    lines.splice(delimiter + 2, 0, markerLine);
    return lines.join('\n');
  });
  expectStructural(result, 'early code-pattern end marker after one body row', ['end marker', 'blank']);
}

// Control 48: moving the sole code anchor before the prompt anchor is an order violation, not a
// duplicate-anchor case. This mutates one shared array and preserves both table scaffolds.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    (() => {
      const lines = splitFixtureLines(source);
      const prompt = lines.findIndex((line) => line === '| User request contains... | Activates category | Specific risk |');
      const code = lines.findIndex((line) => line === '| Code pattern in user input | Activates |');
      const end = lines.findIndex((line, index) => index > code && line.startsWith('When two or more triggers fire in one request'));
      if (prompt < 0 || code < 0 || end < 0 || code < prompt) return null;
      const block = lines.splice(code, end - code + 1);
      const newPrompt = lines.findIndex((line) => line === '| User request contains... | Activates category | Specific risk |');
      if (newPrompt < 0) return null;
      lines.splice(newPrompt, 0, ...block);
      return lines.join('\n');
    })());
  expectAnchorScaffold(result, 'code anchor before prompt anchor', ['out of order']);
}

// Controls 49-53: nested/mixed container-prefixed fences and HTML are unsupported styles. Each
// probe is a single container-prefixed line so an unprefixed closing line cannot mask the trigger.
for (const [name, lines] of [
  ['nested list-quote fence', ['- > ' + fixtureTick.repeat(3) + 'md']],
  ['nested quote-list fence', ['> - ' + fixtureTick.repeat(3) + 'md']],
  ['nested mixed fence', ['>  - ' + fixtureTick.repeat(3) + 'md']],
  ['list-prefixed HTML', ['- <div>']],
  ['blockquote-prefixed HTML', ['>  <div>']],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => appendProbe(source, ['', ...lines, '']));
  expectUnsupported(result, name + ' unsupported-style control');
}

// Control 54: a generic closing raw tag is unsupported even when it is not a block tag.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', '</custom-tag>', '']));
  expectUnsupported(result, 'generic closing raw tag unsupported-style control');
}

// Controls 55-60: extended autolinks outside code spans are unsupported. These are bare URI and
// email-like forms: angle-bracket rejection would be the wrong diagnostic and would miss the
// actual CommonMark extended-autolink grammar.
const extendedAutolinkProbeLine = (() => {
  const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const hit = anchoredTableLine(original, 'code', 'delimiter');
  return hit ? hit.lineNumber + 1 : null;
})();
function expectExactUnsupported(result, name, needles) {
  expectUnsupported(result, name);
  if (!result.skipped && !result.executionFailure && (result.status === 0 || needles.some((needle) => !result.output.includes(needle)))) {
    failures.push(name + ': expected exact unsupported-style diagnostic and location, got: ' + result.output.trim());
  }
}
for (const [name, row] of [
  ['https autolink', '| https://example.test | body |'],
  ['http autolink', '| http://example.test | body |'],
  ['www autolink', '| www.example.test | body |'],
  ['email-like autolink', '| user@example.test | body |'],
  ['mailto autolink', '| mailto:user@example.test | body |'],
  ['xmpp autolink', '| xmpp:user@example.test | body |'],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row]));
  const lineNeedle = extendedAutolinkProbeLine === null ? 'skill/SKILL.md:' : `skill/SKILL.md:${extendedAutolinkProbeLine}:`;
  expectExactUnsupported(result, name + ' unsupported-style control', [lineNeedle, 'unsupported URI/email-like token syntax']);
}

// Control 61: opening-only raw HTML is rejected at its own line.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', '<div>', '']));
  expectExactUnsupported(result, 'raw HTML opening-only unsupported-style control', ['skill/SKILL.md:', 'unsupported angle-bracket-leading/raw-HTML-style line']);
}

// Control 62: closing-only raw HTML is independently rejected at its own line.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', '</div>', '']));
  expectExactUnsupported(result, 'raw HTML closing-only unsupported-style control', ['skill/SKILL.md:', 'unsupported angle-bracket-leading/raw-HTML-style line']);
}

// Control 63: a valid tilde fence suppresses its internal escape, then the post-closer escape
// is independently diagnosed.
{
  const t = fixtureTick;
  const fence = '~'.repeat(3);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', fence + 'md', 'let inside = "x \\" y";', fence, 'let outside = "x \\" y";', '']));
  expectFixture(result, 'tilde fence and post-closer escape', 1, ['literal \\" escape outside a fenced code block']);
}

// Control 64: a fully valid tilde fence is a positive case and must not be reported as unclosed.
{
  const t = fixtureTick;
  const fence = '~'.repeat(3);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', fence + 'md', 'let inside = "x \\" y";', fence, '']));
  expectFixture(result, 'positive tilde fence', 0);
}

// Control 65: when a multi-backtick run has an escaped first tick, its remaining suffix is still
// a real one-tick opener. Two equal rows must therefore expose the suffix-derived signature.
{
  const t = fixtureTick;
  const slash = '\\';
  const row = '| ' + slash + t + t + 'suffix-opener' + t + ' | body |';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row, row]));
  expectFixture(result, 'escaped multi-backtick suffix opener', 1, ['[suffix-opener]']);
}

// Controls 66-67: this repository's code-span scanner uses slash parity for delimiter escaping.
// One slash escapes the opener; two slashes escape the slash and leave an active opener. This is
// a validator convention, not a claim about GFM table-cell parsing.
{
  const t = fixtureTick;
  const oddRow = '| \\' + t + 'odd-slash' + t + ' | body |';
  const evenRow = '| \\\\' + t + 'even-slash' + t + ' | body |';
  const odd = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [oddRow, oddRow]));
  expectFixture(odd, 'odd backslash code-span opener', 0);
  const even = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [evenRow, evenRow]));
  expectFixture(even, 'even backslash code-span opener', 1, ['[even-slash]']);
}

// Control 68: an escaped/false opener must not swallow a raw-markup diagnostic later in the
// same cell; the angle-leading construct remains outside any accepted code span.
{
  const t = fixtureTick;
  const row = '| \\' + t + ' false-span <custom-tag | body |';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [row]));
  expectUnsupported(result, 'escaped false-span outside angle markup control');
}

// Control 69: a complete Category map-looking table inside a supported fence is a decoy. It
// must not become the map of record or add a made-up category to the live parity graph.
{
  const t = fixtureTick;
  const mapAnchor = '# Category map \u2014 which module holds each \u00a7';
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const live = lines.findIndex((line) => line === mapAnchor);
    const neutral = lines.findIndex((line) => line === '# Self-monitoring: prompt triggers that activate failure modes');
    if (live < 0 || neutral < 0 || neutral > live) return null;
    lines.splice(neutral, 0,
      t.repeat(3) + 'md',
      mapAnchor,
      '| Category | Module |',
      '|---|---|',
      '| \u00a7Z99 | ' + t + 'async.md' + t + ' |',
      t.repeat(3),
      '');
    return lines.join('\n');
  });
  expectFixture(result, 'fenced Category map decoy is ignored', 0);
}

// Control 70: a fenced category heading is not a live module heading and must not inflate the
// derived numbered-category count. The unknown id makes accidental fence inclusion observable.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/async.md', 'skills/rust-intel/async.md'], (source) => {
    const lines = splitFixtureLines(source);
    const live = lines.findIndex((line) => line.startsWith('## \u00a7B2.'));
    if (live < 0) return null;
    lines.splice(live, 0, t.repeat(3) + 'md', '## \u00a7Z99. fenced decoy', t.repeat(3));
    return lines.join('\n');
  });
  expectFixture(result, 'fenced category heading does not inflate count', 0);
}

// Control 71: moving the only live B2 heading into a fence must not replace the real module
// heading. This is deliberately a failure: the map still routes B2, but the body no longer does.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/async.md', 'skills/rust-intel/async.md'], (source) => {
    const lines = splitFixtureLines(source);
    const live = lines.findIndex((line) => line.startsWith('## \u00a7B2.'));
    if (live < 0) return null;
    const heading = lines[live];
    lines.splice(live, 1, t.repeat(3) + 'md', heading, t.repeat(3));
    return lines.join('\n');
  });
  expectFixture(result, 'fenced heading cannot replace live category heading', 1, ['B2']);
}

// Controls 72-74: the Category map scaffold is load-bearing. Deleting its prose, header, or
// delimiter must fail even when all of the category rows remain present and parity is otherwise
// recoverable.
for (const [name, mutate] of [
  ['Category map prose deletion', (lines) => {
    const at = lines.findIndex((line) => line.startsWith('The category bodies live in sibling modules'));
    if (at < 0) return false;
    lines.splice(at, 1);
    return true;
  }],
  ['Category map header deletion', (lines) => {
    const at = lines.findIndex((line) => line === '| Category | Module |');
    if (at < 0) return false;
    lines.splice(at, 1);
    return true;
  }],
  ['Category map delimiter corruption', (lines) => {
    const at = lines.findIndex((line) => line === '|---|---|');
    if (at < 0) return false;
    lines[at] = '|---|';
    return true;
  }],
]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    return mutate(lines) ? lines.join('\n') : null;
  });
  expectFixture(result, name, 1);
}

// Control 75: commenting out a workflow MODULES entry must not make the parity check silently
// accept a missing route. The textual module-presence loop still sees the filename in the comment,
// so this specifically exercises the structured MODULES parser.
{
  const result = runValidateAgainstMutatedFiles([
    'skill/audit-project.workflow.js',
    'skills/rust-intel/audit-project.workflow.js',
  ], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes("{ file: 'async.md', categories:"));
    if (at < 0) return null;
    lines[at] = '//' + lines[at];
    return lines.join('\n');
  });
  expectFixture(result, 'commented workflow MODULES entry fails parity', 1, ['async.md']);
}

// Control 76: force the deterministic code-span budget path directly. This keeps the guard pinned
// even on a fast machine where the wall-time termination smoke test would not distinguish a missing
// charge from a correctly bounded scanner.
{
  const result = runValidateAgainstMutatedFiles([
    'dev/validate.mjs',
    'skill/SKILL.md',
    'skills/rust-intel/SKILL.md',
  ], (source) => {
    if (source.includes('const operationLimit = 128 + text.length * 64;')) {
      return source.replace('const operationLimit = 128 + text.length * 64;', 'const operationLimit = 1;');
    }
    return insertCodeRows(source, ['| ' + fixtureTick + 'budget-probe' + fixtureTick + ' | body |']);
  });
  expectFixture(result, 'forced code-span operation budget', 1, ['codeSpanTokens exceeded its linear operation budget']);
}

// Control 77: the map prose and the cross-reference note are separated by exactly one blank
// line. Removing that final blank must fail the Category map scaffold check.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const marker = lines.findIndex((line) => line.startsWith('**Cross-reference note:**'));
    if (marker <= 0 || !/^[ \t]*$/.test(lines[marker - 1])) return null;
    lines.splice(marker - 1, 1);
    return lines.join('\n');
  });
  expectFixture(result, 'Category map final blank before cross-reference', 1);
}

// Control 78: a second executable MODULES object for the same file is an integrity error, even
// though the last parsed entry would otherwise overwrite the first and leave parity apparently
// correct.
{
  const result = runValidateAgainstMutatedFiles(['skill/audit-project.workflow.js'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes("{ file: 'async.md', categories:"));
    if (at < 0) return null;
    lines.splice(at + 1, 0, lines[at]);
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate executable workflow MODULES entry', 1, ['async.md']);
}

// Control 79: quoted string and template-literal decoys containing a complete canonical-looking
// MODULES assignment must not become the parser's source of truth. Commenting out the live async
// entry must still fail parity even when both decoys appear before the real declaration.
{
  const result = runValidateAgainstMutatedFiles([
    'skill/audit-project.workflow.js',
    'skills/rust-intel/audit-project.workflow.js',
  ], (source) => {
    const assignment = source.match(/const MODULES\s*=\s*(?:deepFreezeRecords\(\s*)?\[[\s\S]*?\n\]\);/)?.[0];
    if (!assignment) return null;
    const lines = splitFixtureLines(source);
    const live = lines.findIndex((line) => line.includes('const MODULES =') && line.includes('['));
    const decoyString = `const MODULES_DECOY_STRING = ${JSON.stringify(assignment)};`;
    const decoyTemplate = `const MODULES_DECOY_TEMPLATE = \`${assignment}\`;`;
    if (live < 0) return null;
    lines.splice(live, 0, decoyString, decoyTemplate);
    const asyncEntry = lines.findIndex((line, index) => index > live + 1 && line.startsWith("  { file: 'async.md', categories:"));
    if (asyncEntry < 0) return null;
    lines[asyncEntry] = '//' + lines[asyncEntry];
    return lines.join('\n');
  });
  expectFixture(result, 'quoted MODULES decoys do not mask live corruption', 1, ['async.md']);
}

// Control 80: an executable MODULES array may not contain an extra unparsed element. A parser
// that extracts only the recognizable object-shaped entries would silently accept this drift.
{
  const result = runValidateAgainstMutatedFiles([
    'skill/audit-project.workflow.js',
    'skills/rust-intel/audit-project.workflow.js',
  ], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('const MODULES =') && line.includes('['));
    if (at < 0) return null;
    lines.splice(at + 1, 0, '  null,');
    return lines.join('\n');
  });
  expectFixture(result, 'unparsed MODULES element is rejected', 1, ['MODULES']);
}

// Control 81: a double-quoted object is not an executable MODULES entry in this workflow's
// documented literal form. Removing the real entry and replacing it with a complete double-
// quoted equivalent must remain a missing-route failure, not a parser false positive.
{
  const result = runValidateAgainstMutatedFiles([
    'skill/audit-project.workflow.js',
    'skills/rust-intel/audit-project.workflow.js',
  ], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes("{ file: 'async.md', categories:"));
    if (at < 0) return null;
    const quoted = lines[at].replaceAll("'", '"');
    lines[at] = '//' + lines[at];
    lines.splice(at + 1, 0, quoted);
    return lines.join('\n');
  });
  expectFixture(result, 'double-quoted MODULES object is rejected', 1, ['async.md']);
}

// Control 82: duplicate category ids within one executable MODULES entry are an integrity error,
// even though Set-based parity would otherwise hide the repeated token.
{
  const result = runValidateAgainstMutatedFiles(['skill/audit-project.workflow.js'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes("{ file: 'async.md', categories:"));
    if (at < 0 || !lines[at].includes("'B2'")) return null;
    lines[at] = lines[at].replace("'B2','B3'", "'B2','B2','B3'");
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate category id within MODULES entry', 1, ['duplicate category', 'async.md']);
}

// Controls 83-85: every Category-map ownership collision is rejected: repeated ids in one row,
// repeated rows, and the same id routed to two different module files.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines[at] = lines[at].replace('| \u00a7B2,', '| \u00a7B2, \u00a7B2,');
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate Category-map id in one row', 1, ['category map contains duplicate', '\u00a7B2']);
}
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, lines[at]);
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate Category-map row', 1, ['category map contains duplicate', '\u00a7B2']);
}
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, '| \u00a7B2 | `concurrency-and-state.md` |');
    return lines.join('\n');
  });
  expectFixture(result, 'cross-owner Category-map duplicate', 1, ['category map contains duplicate', '\u00a7B2']);
}

// Controls 86-87: live category headings are unique both within one module and across modules.
{
  const result = runValidateAgainstMutatedFiles(['skill/async.md', 'skills/rust-intel/async.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.startsWith('## \u00a7B2.'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, lines[at]);
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate live heading within module', 1, ['live module headings contain duplicate', '\u00a7B2']);
}
{
  const result = runValidateAgainstMutatedFiles(['skill/concurrency-and-state.md', 'skills/rust-intel/concurrency-and-state.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.startsWith('## \u00a7A2.'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, '## \u00a7B2. duplicate cross-module heading');
    return lines.join('\n');
  });
  expectFixture(result, 'duplicate live heading across modules', 1, ['live module headings contain duplicate', '\u00a7B2']);
}

// Control 88: a Category-map row whose category cell contains no category id is malformed, even
// if its module filename happens to be valid.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, '| no-category-id | `async.md` |');
    return lines.join('\n');
  });
  expectFixture(result, 'Category-map no-op cell is rejected', 1, ['Category map']);
}

// Control 89: recognized category ids may not be followed by unparsed residue. Otherwise a
// typo in the ownership cell could be silently ignored while parity still appears correct.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines[at] = lines[at].replace('\u00a7B2,', '\u00a7B2, typo-residue,');
    return lines.join('\n');
  });
  expectFixture(result, 'Category-map unparsed residue is rejected', 1, ['category map']);
}

// Control 90: a regex literal containing `[` before MODULES is not executable array syntax and
// must not hide the real top-level assignment from the MODULES parser.
{
  const result = runValidateAgainstMutatedFiles([
    'skill/audit-project.workflow.js',
    'skills/rust-intel/audit-project.workflow.js',
  ], (source) => {
    const lines = splitFixtureLines(source);
    const live = lines.findIndex((line) => line.includes('const MODULES =') && line.includes('['));
    const asyncEntry = lines.findIndex((line, index) => index > live && line.includes("{ file: 'async.md', categories:"));
    if (live < 0 || asyncEntry < 0) return null;
    lines.splice(live, 0, 'const MODULES_REGEX_DECOY = /\\[/;');
    const shiftedAsync = asyncEntry + 1;
    lines[shiftedAsync] = '//' + lines[shiftedAsync];
    return lines.join('\n');
  });
  expectFixture(result, 'regex literal before MODULES does not hide assignment', 1, ['async.md']);
}

// Controls 91-96: live module headings may be indented by 1-3 spaces in Markdown, and duplicate
// detection must still see them both within one module and across module files.
for (const spaces of [' ', '  ', '   ']) {
  const result = runValidateAgainstMutatedFiles(['skill/async.md', 'skills/rust-intel/async.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.startsWith('## \u00a7B2.'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, spaces + lines[at]);
    return lines.join('\n');
  });
  expectFixture(result, `${spaces.length}-space duplicate live heading within module`, 1, ['live module headings contain duplicate', '\u00a7B2']);
  const cross = runValidateAgainstMutatedFiles(['skill/concurrency-and-state.md', 'skills/rust-intel/concurrency-and-state.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.startsWith('## \u00a7A2.'));
    if (at < 0) return null;
    lines.splice(at + 1, 0, spaces + '## \u00a7B2. duplicate cross-module heading');
    return lines.join('\n');
  });
  expectFixture(cross, `${spaces.length}-space duplicate live heading across modules`, 1, ['live module headings contain duplicate', '\u00a7B2']);
}

// Control 97: an escaped angle-leading raw tag in a code-pattern first cell is still raw-markup
// style outside code and must not evade the first-cell contract merely because the first byte is
// a backslash.
{
  const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const hit = anchoredTableLine(original, 'code', 'delimiter');
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, ['| prose \\<custom> | body |']));
  const lineNeedle = hit === null ? 'skill/SKILL.md:' : `skill/SKILL.md:${hit.lineNumber + 1}:`;
  expectExactUnsupported(result, 'escaped raw HTML in code-pattern cell unsupported-style control', [lineNeedle, 'unsupported raw inline HTML/angle-leading construct']);
}

// Control 98: a four-backtick opener is not closed by a shorter three-backtick interior line.
// The escaped quote remains inside the unclosed fence, so only the fence-state diagnostic is
// expected.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', t.repeat(4) + 'md', 'let inside = "x \\" y";', t.repeat(3), '']));
  expectFixture(result, 'short fence line does not close four-backtick opener', 1, ['unclosed project fence']);
  if (!result.skipped && !result.executionFailure && result.output.includes('literal \\" escape outside a fenced code block')) {
    failures.push('short fence line does not close four-backtick opener: interior escape was incorrectly treated as outside the fence');
  }
}

// Control 99: a tab-indented fence-looking closer is not a project-fence closer. The valid opener
// remains active through that fake closer, so the escape after it is still fenced; the later valid
// closer then terminates the fence without producing an unclosed-fence diagnostic.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', fixtureTick.repeat(3) + 'md', 'let inside = "x \\" y";', '\t' + fixtureTick.repeat(3), 'let stillInside = "x \\" y";', fixtureTick.repeat(3), '']));
  expectFixture(result, 'tab-indented fake closer is ignored', 0);
  if (!result.skipped && !result.executionFailure && result.output.includes('literal \\" escape outside a fenced code block')) {
    failures.push('tab-indented fake closer is ignored: escape after fake closer was treated as outside the fence');
  }
}

// Control 100: form-feed is not permitted after a fence marker. It must not close the opener or
// suppress the eventual unclosed-fence diagnostic.
{
  const t = fixtureTick;
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', t.repeat(3) + 'md', 'let inside = "x \\" y";', t.repeat(3) + '\f', '']));
  expectFixture(result, 'form-feed fence suffix is not a closer', 1, ['unclosed project fence']);
  if (!result.skipped && !result.executionFailure && result.output.includes('literal \\" escape outside a fenced code block')) {
    failures.push('form-feed fence suffix is not a closer: interior escape was incorrectly treated as outside the fence');
  }
}

// Control 101: NBSP-only content inside an anchored body is not an ASCII blank separator and must
// be diagnosed as a malformed-width body row.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const hit = anchoredTableLine(source, 'code', 'body');
    if (!hit) return null;
    hit.lines.splice(hit.target, 0, '\u00a0');
    return hit.lines.join('\n');
  });
  expectStructural(result, 'NBSP-only anchored body line is not blank', ['code-pattern table body row has', 'expected 2']);
}

// Control 102: NBSP is not table whitespace. This exact two-column delimiter-looking line must
// not be accepted as the code-pattern delimiter scaffold. The mutation starts from the intact
// canonical scaffold, so a rollback to Unicode-wide trim() turns this control into a baseline
// false pass rather than silently changing what the control exercises.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const header = lines.findIndex((line) => line === '| Code pattern in user input | Activates |');
    if (header < 0 || lines[header + 1] !== '|---|---|') return null;
    lines[header + 1] = '|\u00a0---\u00a0|---|';
    return lines.join('\n');
  });
  expectStructural(result, 'NBSP-wrapped delimiter marker is invalid', ['code-pattern table delimiter row has wrong width or syntax']);
}

// Controls 103-104: line-ending normalization is part of the validator contract. The complete
// canonical and mirror skill trees must validate identically under CRLF and lone-CR input.
for (const [name, ending] of [['CRLF', '\r\n'], ['lone CR', '\r']]) {
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    source.replace(/\r\n?|\n/g, ending));
  expectFixture(result, name + ' skill copies normalize successfully', 0);
}

// Control 105: a backtick-bearing info string is not a valid project fence opener. When inserted
// into the anchored body it must produce the exact body-width diagnostic, without creating an
// unclosed-fence error.
{
  const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const hit = anchoredTableLine(original, 'code', 'delimiter');
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    insertCodeRows(source, [fixtureTick.repeat(3) + 'bad' + fixtureTick]));
  const lineNeedle = hit === null ? 'skill/SKILL.md:' : `skill/SKILL.md:${hit.lineNumber + 1}:`;
  expectStructural(result, 'invalid backtick info string is a body row', [lineNeedle, 'code-pattern table body row has 1 cells; expected 2']);
  if (!result.skipped && !result.executionFailure && result.output.includes('unclosed project fence')) {
    failures.push('invalid backtick info string is a body row: invalid opener was treated as an open fence');
  }
}

// Controls 106-111: one or three leading ASCII spaces preserve the raw pipe and table cells but
// violate this repository's column-1 contract. The validator must identify the whitespace, not
// report a generic missing anchor or wrong width.
for (const spaces of [' ', '   ']) for (const kind of ['header', 'delimiter', 'body']) {
  const original = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
  const hit = anchoredTableLine(original, 'code', kind);
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    mutateAnchoredLine(source, 'code', kind, (line) => spaces + line));
  const lineNeedle = hit === null ? 'skill/SKILL.md:' : `skill/SKILL.md:${hit.lineNumber}:`;
  expectStructural(result, `${spaces.length}-space leading-whitespace code ${kind} raw-pipe contract`, [lineNeedle, `has ${spaces.length} leading space(s)`]);
}


// Rule-text presence controls for the corrected high-risk rules: a revert of the correction in
// the canonical file must go red. The checks pin greppable API/type signatures and the stated
// invariant token, not whole paragraphs; the Codex mirror needs no separate check —
// dev/validate.mjs enforces byte identity between the two trees.
function sectionOf(text, header) {
  const lines = splitFixtureLines(text);
  const mask = fixtureFenceMask(lines);
  const isRequestedHeading = (line) => {
    const leading = line.match(/^ */)?.[0].length ?? 0;
    const body = line.slice(leading);
    return leading <= 3 && body.startsWith(header) && (body.length === header.length || /\s/.test(body[header.length]));
  };
  const start = lines.findIndex((line, i) => !mask[i] && isRequestedHeading(line));
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!mask[i] && /^ {0,3}## \u00a7[A-Z]\d+[a-z]?\./.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).filter((_, offset) => !mask[start + offset]).join('\n');
}

function triggerTableBodyRanges(text) {
  const lines = splitFixtureLines(text);
  const mask = fixtureFenceMask(lines);
  const tables = [
    ['| User request contains... | Activates category | Specific risk |', '**Triggered by code, not phrase**'],
    ['| Code pattern in user input | Activates |', 'When two or more triggers fire in one request'],
  ];
  const ranges = [];
  for (const [tableHeader, marker] of tables) {
    const headers = lines.flatMap((line, i) => !mask[i] && line === tableHeader ? [i] : []);
    if (headers.length !== 1) continue;
    const headerIndex = headers[0];
    const delimiterIndex = headerIndex + 1;
    if (mask[delimiterIndex] || !/^\|[-:| ]+\|$/.test(lines[delimiterIndex])) continue;
    const end = lines.findIndex((line, i) => i > delimiterIndex && !mask[i] && line.startsWith(marker));
    if (end < 0) continue;
    ranges.push([delimiterIndex + 1, end]);
  }
  return { lines, mask, ranges };
}

function rowOf(text, anchor) {
  const { lines, mask, ranges } = triggerTableBodyRanges(text);
  for (const [start, end] of ranges) {
    const index = lines.findIndex((row, i) => i >= start && i < end && !mask[i] && row.includes(anchor));
    if (index >= 0) return lines[index];
  }
  return '';
}

function headingMatches(line, wanted) {
  const leading = line.match(/^ */)?.[0].length ?? 0;
  const body = line.slice(leading);
  return leading <= 3 && body.startsWith(wanted) && (body.length === wanted.length || /\s/.test(body[wanted.length]));
}

function sectionBounds(lines, mask, wanted) {
  const start = lines.findIndex((line, i) => !mask[i] && headingMatches(line, wanted));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!mask[i] && /^ {0,3}##(?:\s|$)/.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

function moduleTableRowOf(text, anchor, section = '## \u00a7C12.') {
  const lines = splitFixtureLines(text);
  const mask = fixtureFenceMask(lines);
  const bounds = sectionBounds(lines, mask, section);
  if (!bounds) return '';
  // A module catalog row only counts when it is in the canonical four-column
  // catalog (not merely any pipe table) following its exact header and delimiter
  // in the named section. This excludes an unfenced table-shaped decoy inserted
  // before the live catalog.
  const headerText = '| Task | Hand-rolled shape | Input where it is silently wrong | Crate (downloads) |';
  const delimiterText = '|---|---|---|---|';
  const headers = [];
  for (let header = bounds.start; header < bounds.end; header += 1) {
    if (!mask[header] && lines[header] === headerText) headers.push(header);
  }
  if (headers.length !== 1) return '';

  const header = headers[0];
  if (header + 1 >= bounds.end || mask[header + 1] || lines[header + 1] !== delimiterText) return '';

  let target = '';
  let targetCount = 0;
  // GFM table rows are contiguous. A blank line or a non-pipe line ends this table;
  // rows after that belong to later prose/tables and must not satisfy this lookup.
  for (let row = header + 2; row < bounds.end; row += 1) {
    if (mask[row] || lines[row].trim() === '' || !/^\|/.test(lines[row])) break;
    if (lines[row].includes(anchor)) {
      target = lines[row];
      targetCount += 1;
    }
  }
  return targetCount === 1 ? target : '';
}

function numberedItemOf(text, anchor, section = '## Operating mode') {
  const lines = splitFixtureLines(text);
  const mask = fixtureFenceMask(lines);
  const sections = lines.flatMap((line, i) => !mask[i] && headingMatches(line, section) ? [i] : []);
  if (sections.length !== 1) return '';
  const bounds = sectionBounds(lines, mask, section);
  if (!bounds) return '';
  // Keep the lookup inside the named section and its contiguous numbered-list
  // block. A numbered item after an indented level-2 heading is a different list.
  let target = '';
  let targetCount = 0;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    if (mask[i] || !/^\d+\.\s/.test(lines[i])) continue;
    if (lines[i].includes(anchor)) {
      target = lines[i];
      targetCount += 1;
    }
  }
  return targetCount === 1 ? target : '';
}

function fixtureFenceMask(lines) {
  const mask = [];
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      mask[i] = true;
      if (fixtureFenceCloser(line, fence)) fence = null;
      continue;
    }
    const opener = fixtureFenceOpener(line);
    if (opener) {
      mask[i] = true;
      fence = opener;
    } else mask[i] = false;
  }
  return mask;
}
function fixtureFenceOpener(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0], length: match[1].length };
}
function fixtureFenceCloser(line, fence) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return match !== null && match[1][0] === fence.marker && match[1].length >= fence.length;
}
const ruleTextControls = [
  { name: 'B2 map-guard types (skill/async.md §B2)', file: 'skill/async.md', section: '## §B2.', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMulti', 'get_sync`/`get_async` return `Option<OccupiedEntry>`'] },
  { name: 'B2 map-guard phrase-trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'DashMap/concurrent-map lazy init + await', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMulti', 'owns or contains a map guard'] },
  { name: 'B2 map-guard code-pattern trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'a guard of a concurrent map (`DashMap`/`scc::HashMap`) live across a later `.await`', require: ['VacantEntry', 'ReplaceResult', 'mapref::entry', 'mapref::one', 'MappedRef', 'RefMutMulti', 'owns or contains a map guard'] },
  { name: 'B14 JoinSet admission-gated drain (skill/concurrency-and-state.md §B14)', file: 'skill/concurrency-and-state.md', section: '## §B14.', require: ['poll_join_next', 'len() < N'], forbid: ['polling the `JoinSet` as a `Stream`'] },
  { name: 'B14 JoinSet trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'constructed or grown by any operation that adds tasks', require: ['poll_join_next', 'len() < N'], forbid: ['polling the `JoinSet` as a `Stream`'] },
  { name: 'C12 either-defense Markdown row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'Markdown-to-HTML renderer', require: ['Event::Html', 'Event::InlineHtml', 'either one alone satisfies this obligation'] },
  { name: 'C12 either-defense catalog row (skill/deps-macros-ergonomics.md)', file: 'skill/deps-macros-ergonomics.md', section: '## §C12.', moduleRowAnchor: 'Markdown rendering of untrusted content', require: ['either drop', '`Html`/`InlineHtml` events or'] },
  { name: 'F1 decode-observable corpus oracle (skill/semantics-and-conformance.md §F1)', file: 'skill/semantics-and-conformance.md', section: '## §F1.', require: ['finite graph of distinct serialized type/variant definitions', 'two representatives, not every runtime depth', 'decode-observable, not typed-value-level', 'schema-mutation negative control'] },
  { name: 'F1 corpus trigger row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'golden-bytes decode **corpus**', require: ['finite graph of distinct serialized type/variant definitions', 'two representatives, not every runtime depth', 'decode-observable, not typed-value-level', 'schema-mutation negative control'] },
  { name: 'B12 Argon2/OsRng feature obligations (skill/security.md §B12)', file: 'skill/security.md', section: '## §B12.', require: ['State both obligations', 'getrandom` feature for `OsRng` to source entropy'] },
  { name: 'B12 clean-TOML recipe row (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'store a password', require: ['rand_core = { version = "0.6", features = ["getrandom"] }', 'two feature obligations, not one'] },
  { name: 'B1a out-parameter cache witness (skill/SKILL.md)', file: 'skill/SKILL.md', section: '## Operating mode', listItemAnchor: 'Show the caller for the §B1a laundering shape', require: ['fn remember', 'captured into a longer-lived cache/container that outlives the call'] },
  { name: 'B13 pure-reader exemption (skill/SKILL.md)', file: 'skill/SKILL.md', rowAnchor: 'pure reader that makes no check-then-act decision', require: ['need not hold the same guard'] },
];
for (const control of ruleTextControls) {
  const text = fs.readFileSync(path.join(root, control.file), 'utf8');
  const scoped = control.moduleRowAnchor ? moduleTableRowOf(text, control.moduleRowAnchor, control.section)
    : control.listItemAnchor ? numberedItemOf(text, control.listItemAnchor, control.section)
      : control.section ? sectionOf(text, control.section)
        : control.rowAnchor ? rowOf(text, control.rowAnchor) : text;
  for (const token of control.require || []) {
    if (!scoped.includes(token)) failures.push(`${control.name}: required signature "${token}" absent — the correction this control pins looks reverted or reworded past its greppable signature`);
  }
  for (const token of control.forbid || []) {
    if (scoped.includes(token)) failures.push(`${control.name}: forbidden signature "${token}" present — the corrected rule text looks reverted`);
  }
}

// Controls 112-114: the nested-fixture escape hatch is intentionally a strict test-only switch.
// A value of exactly "1" skips the nested suite; "0" runs it and must execute this deliberately
// broken fixture sentinel; any other value is itself an explicit validator error. Mutating the
// child script avoids recursively running this fixture suite from inside its own control.
function breakFixtureScript(source) {
  const marker = 'const failures = [];';
  const replacement = `${marker}\nconsole.error('deliberately broken nested fixture sentinel');\nprocess.exit(23);`;
  return source.includes(marker) ? source.replace(marker, replacement) : null;
}
for (const [value, status, needles, name] of [
  ['1', 0, [], 'skip env exact one skips nested fixtures'],
  ['0', 1, ['deliberately broken nested fixture sentinel'], 'skip env zero runs broken nested fixture'],
  ['yes', 1, ['RUST_INTEL_SKIP_NESTED_FIXTURES'], 'skip env invalid value fails explicitly'],
]) {
  const result = runValidateAgainstMutatedFiles(['dev/validate-fixtures.mjs'], breakFixtureScript, {
    env: { RUST_INTEL_SKIP_NESTED_FIXTURES: value },
    timeoutMs: 300_000,
  });
  expectFixture(result, name, status, needles);
}

// Controls 115-116: rule-text extraction must ignore signatures placed inside supported fenced
// code. Removing the live signature while adding the same text as a fenced decoy must fail both
// section-scoped and row-scoped rule controls.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B14 JoinSet admission-gated drain'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const start = lines.findIndex((line) => line.includes(control.section));
  if (start < 0) {
    failures.push('fenced section rule-text decoy: required section was not found');
  } else {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^## §/.test(lines[i])) { end = i; break; }
    }
    for (let i = start; i < end; i += 1) lines[i] = lines[i].replaceAll('poll_join_next', 'removed_join_next');
    lines.splice(start + 1, 0, fixtureTick.repeat(3) + 'text', 'poll_join_next', fixtureTick.repeat(3));
    const scoped = sectionOf(lines.join('\n'), control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('fenced section rule-text decoy unexpectedly satisfied the live rule');
  }
}
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B13 pure-reader exemption'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const at = lines.findIndex((line) => line.includes(control.rowAnchor));
  if (at < 0) {
    failures.push('fenced row rule-text decoy: required row was not found');
  } else {
    lines[at] = lines[at].replace('need not hold the same guard', 'must hold a guard');
    lines.splice(0, 0, fixtureTick.repeat(3) + 'text', 'pure reader that makes no check-then-act decision — need not hold the same guard', fixtureTick.repeat(3), '');
    const scoped = rowOf(lines.join('\n'), control.rowAnchor);
    if (control.require.every((token) => scoped.includes(token))) failures.push('fenced row rule-text decoy unexpectedly satisfied the live rule');
  }
}

const workflowFiles = ['skill/audit-project.workflow.js', 'skills/rust-intel/audit-project.workflow.js'];
function mutateWorkflowLines(source, mutate) {
  const lines = splitFixtureLines(source);
  return mutate(lines) ? lines.join('\n') : null;
}
function workflowArrayEnd(lines, name) {
  const start = lines.findIndex((line) => line.includes(`const ${name} =`) && line.includes('['));
  if (start < 0) return -1;
  // The workflow's declarative arrays close as `]);`; do not drift into a later
  // standalone bracket belonging to an unrelated call when locating the target.
  const end = lines.findIndex((line, index) => index > start && /^\s*\]\);?\s*$/.test(line));
  return end;
}

// Control 117: a tab-indented fence-looking line is not a standalone project fence opener. The
// escape on the following line is therefore outside a fence and must remain observable.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) =>
    appendProbe(source, ['', '\t' + fixtureTick.repeat(3) + 'md', 'let escaped = "x \\" y";', '']));
  expectFixture(result, 'tab-indented fake fence opener is not active', 1, ['literal \\" escape outside a fenced code block']);
}

// Control 118: a malformed Category-map cell with a category-shaped prefix must not be silently
// treated as a no-op row. The whole cell is validated, not just successfully extracted ids.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.includes('| \u00a7B2,'));
    if (at < 0) return null;
    lines[at] = lines[at].replace('\u00a7B2,', '\u00a7not-an-id,');
    return lines.join('\n');
  });
  expectFixture(result, 'malformed Category-map id cell is rejected', 1, ['Category map']);
}

// Control 119: regexp literals, including character classes and a regexp in statement position,
// are decoys. They must neither become the MODULES declaration nor confuse its bracket matcher.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
    const at = lines.findIndex((line) => line.includes('const MODULES =') && line.includes('['));
      if (at < 0) return false;
      lines.splice(at, 0,
        'const MODULES_REGEX_DECOY_CLASS = /[/*]/;',
        'if(flag) /\\[/;',
        'const MODULES_REGEX_DECOY_CLASS_2 = /[/*]/;');
      return true;
    }));
  expectFixture(result, 'regexp decoys before MODULES are ignored', 0);
}

// Control 120: a trailing comma in an otherwise intact Category-map category cell is not a
// valid category list. Keep every live id in the cell; the comma is the sole mutation.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line === '| \u00a7B2, \u00a7B3, \u00a7B3a, \u00a7B8, \u00a7B11, \u00a7B15 (a\u2013e), \u00a7B21, \u00a7B22, \u00a7B23 | `async.md` |');
    if (at < 0) return null;
    const intactCellEnd = '\u00a7B23 | `async.md` |';
    if (!lines[at].includes(intactCellEnd)) return null;
    // Append the comma immediately before the final column separator; every live id stays
    // intact, so this is a pure trailing-residue mutation rather than an accidental omission.
    lines[at] = lines[at].replace(intactCellEnd, '\u00a7B23, | `async.md` |');
    return lines.join('\n');
  });
  expectFixture(result, 'trailing Category-map category comma is rejected', 1, ['Category map']);
}

// Controls 121-131: AUDIT_UNITS is a complete, statically validated partition of the workflow.
// Each mutation targets one invariant while leaving the mirror tree byte-identical.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'AUDIT_UNITS');
      if (end < 0) return false;
      lines.splice(end, 0, '  null,');
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS extra null is rejected', 1, ['AUDIT_UNITS']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("module: 'testing.md'"));
      if (at < 0) return false;
      lines[at] = '//' + lines[at];
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS missing testing unit is rejected', 1, ['testing.md']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("onlyCategories: 'B2, B3, B3a"));
      if (at < 0) return false;
      lines[at] = lines[at].replace('B3a, ', '');
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS async category omission is rejected', 1, ['omit']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("onlyCategories: 'B15a–e"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("E1'", "E1, B2'");
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS async category overlap is rejected', 1, ['overlap']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("requiredArtifactGroups: ['manifests', 'configs']"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("'configs']", "'unknown']");
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS unknown artifact group is rejected', 1, ['AUDIT_UNITS']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("requiredArtifactGroups: ['manifests', 'configs']"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("'configs']", "'configs', 'configs']");
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS duplicate artifact group is rejected', 1, ['artifact group']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("module: 'security.md'"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("requiredArtifactGroups: ['manifests', 'configs']", 'requiredArtifactGroups: []');
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS altered security artifact groups are rejected', 1, ['wrong required artifact groups']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("module: 'deps-macros-ergonomics.md'"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("'ci', 'scripts']", "'ci']");
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS altered dependency artifact groups are rejected', 1, ['wrong required artifact groups']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("module: 'semantics-and-conformance.md'"));
      if (at < 0) return false;
      lines[at] = lines[at].replace(', requiresDocs: true', '');
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS semantics docs obligation is required', 1, ['requiresDocs']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'AUDIT_UNITS');
      if (end < 0) return false;
      lines[end] = '].filter(Boolean)';
      return true;
    }));
  expectFixture(result, 'AUDIT_UNITS chained filter suffix is rejected', 1, ['AUDIT_UNITS']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const withoutFreeze = source.replace('return Object.freeze(records)', 'return records');
    if (withoutFreeze === source) return null;
    return mutateWorkflowLines(withoutFreeze, (lines) => {
      const end = workflowArrayEnd(lines, 'AUDIT_UNITS');
      if (end < 0) return false;
      lines.splice(end + 1, 0, 'AUDIT_UNITS.pop();');
      return true;
    });
  });
  expectFixture(result, 'later AUDIT_UNITS pop mutation after freeze removal is rejected', 1, ['deepFreeze']);
}

// Control 132: the runtime merger must reject an audit result whose module disagrees with the
// assigned unit, even when its label is valid. This is a source-presence contract: changing the
// module comparison to another field must make the validator fail the workflow check.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    if (!source.includes('result.module')) return null;
    return source.replaceAll('result.module', 'result.label');
  });
  if (result.skipped) failures.push('runtime result.module mismatch control: workflow source has no module identity check');
  else if (result.executionFailure) failures.push(`runtime result.module mismatch control: validator child failed to execute (${result.error || result.signal || 'unknown execution failure'})`);
  else if (result.status === 0 || !/module|result/i.test(result.output)) failures.push('runtime result.module mismatch control: replacing result.module checks did not fail the workflow contract: ' + result.output.trim());
}

// Control 133: a category-map boundary indented by one space is not the live scaffold marker.
// It must be diagnosed as a malformed boundary, not accepted as a second live table.
{
  const result = runValidateAgainstMutatedFiles(['skill/SKILL.md', 'skills/rust-intel/SKILL.md'], (source) => {
    const lines = splitFixtureLines(source);
    const at = lines.findIndex((line) => line.startsWith('# Category map'));
    if (at < 0) return null;
    lines[at] = ' ' + lines[at];
    return lines.join('\n');
  });
  expectFixture(result, 'indented Category-map boundary is rejected', 1, ['Category map']);
}

// Control 134: a fenced prose decoy containing a required row must not satisfy the rule-text
// oracle when the live row is reverted. The same text outside a fence is only a decoy if it is
// outside both anchored trigger-table body ranges.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B13 pure-reader exemption'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const at = lines.findIndex((line) => line.startsWith('|') && line.includes(control.rowAnchor));
  if (at < 0) {
    failures.push('unfenced rule-text prose decoy: required live row was not found');
  } else {
    lines[at] = lines[at].replace('need not hold the same guard', 'must hold a guard');
    lines.push('', 'prose decoy: pure reader that makes no check-then-act decision — need not hold the same guard');
    const scoped = rowOf(lines.join('\n'), control.rowAnchor);
    if (control.require.every((token) => scoped.includes(token))) failures.push('unfenced prose row decoy unexpectedly satisfied the live rule');
  }
}

// Control 135: JavaScript array elision is distinct from a Category-map trailing comma. Keep
// the parser regression for the executable MODULES literal as a separate, accurately named case.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("categories: ['B2','B3'"));
      if (at < 0) return false;
      lines[at] = lines[at].replace("categories: ['B2','B3'", "categories: ['B2',,'B3'");
      return true;
    }));
  expectFixture(result, 'JavaScript MODULES array elision is rejected', 1, ['workflow MODULES']);
}

// Control 136: a trailing comma in a real JavaScript categories array is valid syntax. This is
// deliberately positive: it prevents the executable-array parser from confusing a legal final
// comma with an interior elision (Control 135).
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("categories: ['B2','B3'"));
      if (at < 0) return false;
      const original = lines[at];
      const mutated = original.replace(/(categories:\s*\[[^\]]+)\](\s*}\s*,?\s*)$/, '$1,]$2');
      if (mutated === original) return false;
      lines[at] = mutated;
      return true;
    }));
  expectFixture(result, 'JavaScript MODULES categories trailing comma is accepted', 0);
}

// Controls 137-140: MODULES/AUDIT_UNITS are declarative data, so each deep-freeze layer is a
// contract, not a best-effort runtime convention. Each mutant removes exactly one freeze layer
// or adds a multiline chain after the initializer and must be rejected by the validator.
for (const [name, mutate] of [
  ['MODULES deepFreezeRecords invocation', (source) => source.replace('const MODULES = deepFreezeRecords([', 'const MODULES = [')],
  ['nested-array Object.freeze(value) call', (source) => source.replace('if (Array.isArray(value)) Object.freeze(value)', 'if (Array.isArray(value)) { /* nested freeze removed */ }')],
  ['record Object.freeze(record) call', (source) => source.replace('Object.freeze(record)', 'void record /* record freeze removed */')],
  ['outer-array Object.freeze(records) call', (source) => source.replace('return Object.freeze(records)', 'return records')],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const mutated = mutate(source);
    return mutated === source ? null : mutated;
  });
  expectFixture(result, name + ' is rejected', 1);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'AUDIT_UNITS');
      if (end < 0) return false;
      lines[end] = ']).';
      lines.splice(end + 1, 0, '  filter(Boolean);');
      return true;
    }));
  expectFixture(result, 'multiline AUDIT_UNITS filter chain is rejected', 1);
}

// Control 141: the multiline filter-chain mutation above is a separately numbered control.
// It must be rejected even though `]).filter(Boolean)` is valid JavaScript.

// Control 142: a source that removes the outer freeze and then mutates an alias must still fail
// the declarative-data contract. The alias is intentionally not a separate static-mutation rule:
// the pinned deep-freeze scaffold is the safety boundary for nested references.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const withoutFreeze = source.replace('return Object.freeze(records)', 'return records');
    if (withoutFreeze === source) return null;
    const marker = 'const AUDIT_UNITS = deepFreezeRecords([';
    if (!withoutFreeze.includes(marker)) return null;
    return withoutFreeze.replace(marker, "const moduleCategoriesAlias = MODULES[0].categories;\nmoduleCategoriesAlias.push('Z99');\n\n" + marker);
  });
  expectFixture(result, 'unfrozen nested alias mutation is rejected', 1);
}

// Controls 143-145: mutation through a let alias, an alias of an alias, or a nested-array alias
// must be rejected after the immutable workflow declarations. These are separate controls so a
// validator change that spots only one syntactic mutation shape cannot silently reopen the others.
for (const [name, mutation] of [
  ['let MODULES alias mutation', "let modulesAlias = MODULES;\nmodulesAlias.push({ file: 'decoy.md', categories: [] });"],
  ['alias-of-alias MODULES mutation', "const modulesAlias = MODULES;\nconst secondAlias = modulesAlias;\nsecondAlias.push({ file: 'decoy.md', categories: [] });"],
  ['nested-array alias mutation', "const categoriesAlias = MODULES[0].categories;\ncategoriesAlias.push('Z99');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const lines = splitFixtureLines(source);
    const end = workflowArrayEnd(lines, 'MODULES');
    if (end < 0) return null;
    lines.splice(end + 1, 0, mutation);
    return lines.join('\n');
  });
  expectFixture(result, name + ' is rejected', 1, ['workflow']);
}

// Control 146: a top-level loop decoy must not satisfy the runtime module-identity helper
// contract when the live helper is changed to compare a different field.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const live = 'const auditResultModuleMatches = (result, unit) => result.module === unit.module;';
    if (!source.includes(live)) return source;
    const altered = source.replace(live, 'const auditResultModuleMatches = (result, unit) => result.label === unit.module;');
    return altered.replace('const resultsByLabel =', 'for (;;) { const auditResultModuleMatches = (result, unit) => result.module === unit.module; break; }\nconst resultsByLabel =');
  });
  expectFixture(result, 'top-level loop runtime helper decoy does not mask altered helper', 1, ['workflow']);
}

// Controls 147-151: every independent input to orchestrationComplete is part of the gate.
// Replace exactly one comparison with a literal while preserving the expression syntax; the
// validator must reject each weakened gate with its structural workflow diagnostic.
for (const [name, expression] of [
  ['missing scope gate', 'missingScopeFields.length === 0'],
  ['missing slices gate', 'missingSlices.length === 0'],
  ['missing unit inputs gate', 'Object.keys(missingUnitInputs).length === 0'],
  ['stray labels gate', 'strayLabels.length === 0'],
  ['dropped agents gate', 'dropped === 0'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    if (!source.includes(expression)) return null;
    return source.replace(expression, 'true');
  });
  expectFixture(result, 'orchestrationComplete ' + name + ' is required', 1, ['orchestrationComplete']);
}

// Control 152: an incorrect live runtime helper plus a dead canonical helper decoy must fail;
// the decoy is deliberately a complete function so a broad text search cannot satisfy the
// contract by finding the right expression in unreachable code.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const live = 'const auditResultModuleMatches = (result, unit) => result.module === unit.module;';
    if (!source.includes(live)) return source;
    const altered = source.replace(live, 'const auditResultModuleMatches = (result, unit) => result.label === unit.module;');
    return altered.replace('const resultsByLabel =', 'if (false) { const auditResultModuleMatches = (result, unit) => result.module === unit.module; }\nconst resultsByLabel =');
  });
  expectFixture(result, 'dead runtime module comparison does not mask altered helper', 1, ['workflow']);
}

// Control 153: a complete earlier table-shaped decoy is not the named C12 catalog. Reverting
// the live row while cloning it under a wrong-header/wrong-width table must fail the scoped
// rule-text oracle; a first-arbitrary-table lookup would incorrectly pass.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('C12 either-defense catalog row'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## §C12.'));
  const live = lines.findIndex((line, index) => index > section && line.startsWith('| Markdown rendering of untrusted content'));
  const header = lines.findIndex((line, index) => index > section && line.startsWith('| Task | Hand-rolled shape |'));
  if (section < 0 || live < 0 || header < 0) {
    failures.push('earlier unfenced module-table decoy: required C12 table was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('either drop', 'drop one');
    lines.splice(header, 0, '| Task | Decoy |', '|---|---|', decoy);
    const scoped = moduleTableRowOf(lines.join('\n'), control.moduleRowAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('earlier unfenced module-table decoy unexpectedly satisfied the live rule');
  }
}

// Control 154: an earlier unfenced numbered item is outside the named Operating mode list.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B1a out-parameter cache witness'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## Operating mode'));
  const live = lines.findIndex((line, index) => index > section && /^\d+\.\s/.test(line) && line.includes('Show the caller for the §B1a laundering shape'));
  if (section < 0 || live < 0) {
    failures.push('earlier unfenced numbered-list decoy: required Operating mode list was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('fn remember', 'fn preserve');
    lines.splice(section, 0, decoy);
    const scoped = numberedItemOf(lines.join('\n'), control.listItemAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('earlier unfenced numbered-list decoy unexpectedly satisfied the live rule');
  }
}

// Control 155: a numbered item after an indented level-2 heading belongs to the following
// section, not to Operating mode. This protects the section boundary from first-match drift.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B1a out-parameter cache witness'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## Operating mode'));
  const live = lines.findIndex((line, index) => index > section && /^\d+\.\s/.test(line) && line.includes('Show the caller for the §B1a laundering shape'));
  if (section < 0 || live < 0) {
    failures.push('indented following heading boundary: required Operating mode list was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('fn remember', 'fn preserve');
    lines.splice(live + 1, 0, '  ## Following section boundary', decoy);
    const scoped = numberedItemOf(lines.join('\n'), control.listItemAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('indented following heading decoy unexpectedly satisfied the live rule');
  }
}

// Control 156: a true trailing array elision (`[...,,]`) is not the same thing as one legal
// trailing separator comma. Keep all
// category ids and add the second comma at the end of the executable literal.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const at = lines.findIndex((line) => line.includes("categories: ['B2','B3'"));
      if (at < 0) return false;
      const original = lines[at];
      const mutated = original.replace(/(categories:\s*\[[^\]]+)\]/u, '$1,,]');
      if (mutated === original) return false;
      lines[at] = mutated;
      return true;
    }));
  expectFixture(result, 'true trailing MODULES array elision is rejected', 1, ['workflow MODULES']);
}

// Controls 157-159: the per-unit coverage gate must retain both required-input loops and the
// final assignment that records missing inputs. Deleting any one of these leaves the source
// executable but turns an incomplete orchestration into a false complete result.
for (const [name, fragment] of [
  ['artifact coverage loop deletion', 'for (const artifact of expected) if (!reviewed.has(artifact)) missing.push(artifact)'],
  ['docs coverage loop deletion', 'for (const doc of (scoperResult && scoperResult.docsFiles) || []) if (!reviewed.has(doc)) missing.push(doc)'],
  ['missingUnitInputs final assignment deletion', 'if (missing.length) missingUnitInputs[unit.label] = missing'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    if (!source.includes(fragment)) return null;
    return source.replace(fragment, '');
  });
  expectFixture(result, name, 1, ['workflow']);
}

// Control 160: the live deep-freeze helper must be canonical. A later helper-shaped declaration
// in dead code cannot repair a weakened live helper or satisfy a broad text search.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const weakened = source.replace('return Object.freeze(records)', 'return records');
    if (weakened === source) return null;
    const decoy = `if (false) {
  const deepFreezeRecords = (records) => {
    for (const record of records) {
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) Object.freeze(value)
      }
      Object.freeze(record)
    }
    return Object.freeze(records)
  };
}
`;
    return weakened.replace('const MODULES = deepFreezeRecords([', decoy + 'const MODULES = deepFreezeRecords([');
  });
  expectFixture(result, 'dead deepFreezeRecords decoy does not mask weakened live helper', 1, ['deepFreeze']);
}

// Control 161: the live missingUnitInputs declaration is unique and top-level. A dead canonical
// declaration inserted after it must not mask changing the live object into another value.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const weakened = source.replace('const missingUnitInputs = {}', 'const missingUnitInputs = []');
    if (weakened === source) return null;
    const decoy = 'if (false) { const missingUnitInputs = {}; }\n';
    return weakened.replace('const orchestrationComplete =', decoy + 'const orchestrationComplete =');
  });
  expectFixture(result, 'dead missingUnitInputs declaration decoy does not mask weakened live declaration', 1, ['missingUnitInputs']);
}

// Control 162: the live missing-input loop must be unique and top-level. A dead canonical loop
// after the live one must not mask deleting its unit iteration.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const live = 'for (const unit of AUDIT_UNITS) {';
    if (!source.includes(live)) return null;
    const weakened = source.replace(live, 'for (const currentUnit of AUDIT_UNITS) {');
    const decoy = `if (false) {
  for (const unit of AUDIT_UNITS) {
    const result = resultsByLabel.get(unit.label)
    const missing = []
    if (!result) missing.push('agent result')
    else if (!auditResultModuleMatches(result, unit)) missing.push('module-mismatch')
  }
}
`;
    return weakened.replace('const orchestrationComplete =', decoy + 'const orchestrationComplete =');
  });
  expectFixture(result, 'dead missingUnitInputs loop decoy does not mask deleted live loop', 1, ['coverage-production']);
}

// Control 163: orchestrationComplete is a unique top-level gate. A dead copy containing all
// five conjuncts must not make a weakened live expression acceptable.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const weakened = source.replace('missingScopeFields.length === 0', 'true');
    if (weakened === source) return null;
    const decoy = `if (false) {
  const orchestrationComplete = missingScopeFields.length === 0 && missingSlices.length === 0 && Object.keys(missingUnitInputs).length === 0 && strayLabels.length === 0 && dropped === 0;
}
`;
    return weakened.replace('const totalSourceFiles =', decoy + 'const totalSourceFiles =');
  });
  expectFixture(result, 'dead orchestrationComplete decoy does not mask weakened live gate', 1, ['orchestrationComplete']);
}

// Control 164: two canonical catalog tables in the same module section, with the live row
// reverted and the earlier table still complete, must not satisfy moduleTableRowOf.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('C12 either-defense catalog row'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## \u00a7C12.'));
  const live = lines.findIndex((line, index) => index > section && line.startsWith('| Markdown rendering of untrusted content'));
  const header = lines.findIndex((line, index) => index > section && line === '| Task | Hand-rolled shape | Input where it is silently wrong | Crate (downloads) |');
  if (section < 0 || live < 0 || header < 0) {
    failures.push('duplicate canonical module-table decoy: required C12 table was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('either drop', 'drop one');
    lines.splice(header, 0,
      '| Task | Hand-rolled shape | Input where it is silently wrong | Crate (downloads) |',
      '|---|---|---|---|', decoy);
    const scoped = moduleTableRowOf(lines.join('\n'), control.moduleRowAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('duplicate canonical module-table decoy unexpectedly satisfied the live rule');
  }
}

// Control 165: two target rows in one canonical catalog are ambiguous and must not be accepted
// by a first-match lookup.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('C12 either-defense catalog row'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## \u00a7C12.'));
  const live = lines.findIndex((line, index) => index > section && line.startsWith('| Markdown rendering of untrusted content'));
  if (section < 0 || live < 0) {
    failures.push('duplicate target module-table row: required C12 row was not found');
  } else {
    lines.splice(live + 1, 0, lines[live]);
    const scoped = moduleTableRowOf(lines.join('\n'), control.moduleRowAnchor, control.section);
    if (scoped) failures.push('duplicate target module-table row unexpectedly returned a row');
  }
}

// Control 166: two target numbered items in the named section, with the original reverted, must
// not satisfy numberedItemOf through the first matching item.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B1a out-parameter cache witness'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## Operating mode'));
  const live = lines.findIndex((line, index) => index > section && /^\d+\.\s/.test(line) && line.includes('Show the caller for the \u00a7B1a laundering shape'));
  if (section < 0 || live < 0) {
    failures.push('duplicate target numbered item: required Operating mode item was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('fn remember', 'fn preserve');
    lines.splice(live + 1, 0, decoy);
    const scoped = numberedItemOf(lines.join('\n'), control.listItemAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('duplicate target numbered item unexpectedly satisfied the live rule');
  }
}

// Controls 167-170: the per-unit coverage proof must be semantic, not a text-shaped ornament.
// Each mutant preserves a plausible JavaScript program while removing one live coverage edge:
// erasing the expected artifact set, comparing against that expected set instead of the agent's
// report, disabling the artifact loop in a dead branch, or skipping the documentation loop.
for (const [name, mutate] of [
  ['artifact expected set erased', (source) => source.replace(
    'const expected = scoperResult && scoperResult.artifactFiles ? (scoperResult.artifactFiles[group] || []) : []',
    'const expected = []',
  )],
  ['artifact reviewed set aliases expected set', (source) => source.replace(
    'const reviewed = new Set(result ? (result.artifactsReviewed || []) : [])',
    'const reviewed = new Set(expected)',
  )],
  ['artifact coverage loop hidden in if-false', (source) => source.replace(
    'for (const artifact of expected) if (!reviewed.has(artifact)) missing.push(artifact)',
    'if (false) { for (const artifact of expected) if (!reviewed.has(artifact)) missing.push(artifact) }',
  )],
  ['documentation coverage loop after continue', (source) => source.replace(
    'for (const doc of (scoperResult && scoperResult.docsFiles) || []) if (!reviewed.has(doc)) missing.push(doc)',
    'continue; for (const doc of (scoperResult && scoperResult.docsFiles) || []) if (!reviewed.has(doc)) missing.push(doc)',
  )],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const mutated = mutate(source);
    return mutated === source ? null : mutated;
  });
  expectFixture(result, name + ' is rejected', 1, ['workflow']);
}

// Controls 171-172: mutation calls inside template-literal interpolation are executable code,
// not inert documentation. The second probe also passes through an alias so masking the whole
// template while scanning JavaScript cannot hide the root's mutation provenance.
for (const [name, mutation] of [
  ['template interpolation MODULES mutation', "const templateProbe = `${MODULES.push({ file: 'template.md', categories: [] })}`;"],
  ['template interpolation alias mutation', "const templateAlias = MODULES;\nconst templateProbe = `${templateAlias.push({ file: 'template-alias.md', categories: [] })}`;"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'MODULES');
      if (end < 0) return false;
      lines.splice(end + 1, 0, mutation);
      return true;
    }));
  expectFixture(result, name + ' is rejected', 1, ['workflow']);
}

// Controls 173-176: direct root, nested-array, delete, and Reflect.set mutations are all
// forbidden. These isolated forms complement the alias-chain controls above and pin the exact
// syntax families the mutation scanner promises to reject.
for (const [name, mutation] of [
  ['isolated direct MODULES.push mutation', "MODULES.push({ file: 'direct.md', categories: [] });"],
  ['isolated direct nested categories.push mutation', "MODULES[0].categories.push('Z99');"],
  ['isolated delete MODULES element mutation', 'delete MODULES[0];'],
  ['isolated Reflect.set AUDIT_UNITS mutation', "Reflect.set(AUDIT_UNITS, 0, { module: 'decoy.md', label: 'decoy', requiredArtifactGroups: [] });"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'MODULES');
      if (end < 0) return false;
      lines.splice(end + 1, 0, mutation);
      return true;
    }));
  expectFixture(result, name + ' is rejected', 1, ['workflow']);
}

// Controls 177-178: ordinary bookkeeping that merely reads immutable declarations is allowed.
// Length is a primitive, including through quoted bracket notation, so changing the local
// counter cannot mutate the frozen MODULES graph.
for (const [name, mutation] of [
  ['MODULES length read and counter mutation', 'let count = MODULES.length; count += 1;'],
  ['MODULES bracket-length read and counter mutation', 'let bracketCount = MODULES[\'length\']; bracketCount += 1;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    mutateWorkflowLines(source, (lines) => {
      const end = workflowArrayEnd(lines, 'MODULES');
      if (end < 0) return false;
      lines.splice(end + 1, 0, mutation);
      return true;
    }));
  expectFixture(result, name + ' remains accepted', 0);
}

// Control 179: numberedItemOf requires one unambiguous live Operating mode section. Revert the
// real item and place a complete decoy in a second same-named section; a global first-match scan
// would incorrectly satisfy the rule-text oracle.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B1a out-parameter cache witness'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## Operating mode'));
  const live = lines.findIndex((line, index) => index > section && /^\d+\.\s/.test(line) && line.includes('Show the caller for the \u00a7B1a laundering shape'));
  if (section < 0 || live < 0) {
    failures.push('duplicate Operating mode section control: required live item was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('fn remember', 'fn preserve');
    lines.splice(section, 0, '## Operating mode', decoy, '');
    const scoped = numberedItemOf(lines.join('\n'), control.listItemAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('duplicate Operating mode section unexpectedly satisfied the live rule');
  }
}

// Control 180: a good numbered-item decoy immediately before the reverted live item is still an
// ambiguity. Exactly-one matching-item semantics must reject it rather than accepting the first.
{
  const control = ruleTextControls.find(({ name }) => name.startsWith('B1a out-parameter cache witness'));
  const original = fs.readFileSync(path.join(root, control.file), 'utf8');
  const lines = splitFixtureLines(original);
  const section = lines.findIndex((line) => headingMatches(line, '## Operating mode'));
  const live = lines.findIndex((line, index) => index > section && /^\d+\.\s/.test(line) && line.includes('Show the caller for the \u00a7B1a laundering shape'));
  if (section < 0 || live < 0) {
    failures.push('duplicate target-before-live numbered item control: required live item was not found');
  } else {
    const decoy = lines[live];
    lines[live] = lines[live].replace('fn remember', 'fn preserve');
    lines.splice(live, 0, decoy);
    const scoped = numberedItemOf(lines.join('\n'), control.listItemAnchor, control.section);
    if (control.require.every((token) => scoped.includes(token))) failures.push('duplicate target-before-live numbered item unexpectedly satisfied the live rule');
  }
}

// Control 181: a truthy disjunction on a new line is still an unconditional bypass of the
// orchestration gate. The source checker must validate the complete expression, not just the
// first line or the presence of the five conjunct names.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const marker = '  dropped === 0;\n';
    if (!source.includes(marker)) return null;
    return source.replace(marker, '  dropped === 0 || true;\n');
  });
  expectFixture(result, 'multiline orchestrationComplete disjunction bypass is rejected', 1, ['orchestrationComplete']);
}

// Controls 182-185: each coverage signal must be produced by its live, reachable computation.
// Replacing a producer with an empty/zero literal leaves the five-way gate text intact, but makes
// the run report COMPLETE for missing scope, slices, labels, or dropped agents. The validator pins
// this whole reachable producer block separately from the final orchestration expression.
for (const [name, mutate] of [
  ['dropped producer erased', (source) => source.replace(
    'const dropped = AUDIT_UNITS.length - auditResults.length',
    'const dropped = 0',
  )],
  ['missingScopeFields producer erased', (source) => {
    const start = source.indexOf('const missingScopeFields =');
    const end = source.indexOf('const missingSlices =', start);
    return start < 0 || end < 0 ? source : source.slice(0, start) + 'const missingScopeFields = []\n' + source.slice(end);
  }],
  ['missingSlices producer erased', (source) => {
    const start = source.indexOf('const missingSlices =');
    const end = source.indexOf('const expectedArtifacts =', start);
    return start < 0 || end < 0 ? source : source.slice(0, start) + 'const missingSlices = []\n' + source.slice(end);
  }],
  ['strayLabels producer erased', (source) => {
    const start = source.indexOf('const strayLabels =');
    const end = source.indexOf('const resultsByLabel =', start);
    return start < 0 || end < 0 ? source : source.slice(0, start) + 'const strayLabels = []\n' + source.slice(end);
  }],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const mutated = mutate(source);
    return mutated === source ? null : mutated;
  });
  expectFixture(result, name + ' is rejected by the coverage producer block', 1, ['workflow coverage']);
}

// Controls 186-187: declaration order is part of the reachable workflow contract. Both helpers
// are moved below their first use while preserving valid JavaScript, so a source-text search that
// ignores execution order cannot silently accept a temporal-dead-zone failure.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const helperStart = source.indexOf('const deepFreezeRecords =');
    const moduleStart = source.indexOf('const MODULES = deepFreezeRecords([', helperStart);
    const auditStart = source.indexOf('const AUDIT_UNITS = deepFreezeRecords([');
    if (helperStart < 0 || moduleStart < 0 || auditStart < 0) return null;
    const helper = source.slice(helperStart, moduleStart);
    const without = source.slice(0, helperStart) + source.slice(moduleStart);
    return without.replace('const AUDIT_UNITS = deepFreezeRecords([', helper + 'const AUDIT_UNITS = deepFreezeRecords([');
  });
  expectFixture(result, 'deepFreezeRecords declaration below first call is rejected', 1, ['workflow']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const helper = 'const auditResultModuleMatches = (result, unit) => result.module === unit.module;\n';
    if (!source.includes(helper)) return null;
    const without = source.replace(helper, '');
    return without.replace('const orchestrationComplete =', helper + 'const orchestrationComplete =');
  });
  expectFixture(result, 'auditResultModuleMatches declaration below first use is rejected', 1, ['workflow']);
}

// Control 188: a dead canonical helper placed AFTER the weakened live helper must not repair it.
// This complements the pre-live decoy in Control 152 and pins declaration uniqueness/order in
// both directions.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const live = 'const auditResultModuleMatches = (result, unit) => result.module === unit.module;';
    if (!source.includes(live)) return null;
    const weakened = source.replace(live, 'const auditResultModuleMatches = (result, unit) => result.label === unit.module;');
    const decoy = `if (false) {\n  const auditResultModuleMatches = (result, unit) => result.module === unit.module;\n}\n`;
    return weakened.replace('const missingUnitInputs = {}', decoy + 'const missingUnitInputs = {}');
  });
  expectFixture(result, 'after-live dead runtime module helper does not mask weakened helper', 1, ['workflow']);
}

function insertWorkflowMutation(source, name, mutation) {
  return mutateWorkflowLines(source, (lines) => {
    const end = workflowArrayEnd(lines, name);
    if (end < 0) return false;
    lines.splice(end + 1, 0, ...mutation.split('\n'));
    return true;
  });
}

// Controls 189-197: direct bindings into the frozen MODULES graph are rejected, including
// parenthesized/const/let/var roots, alias chains, array and object destructuring, and bracket
// nested-array aliases. Derived `.map()` bindings remain rejected because their entries can still
// reference the frozen graph; only primitive length bindings are positive controls.
for (const [number, name, mutation] of [
  [189, 'parenthesized MODULES alias', 'const modulesAlias = (MODULES); modulesAlias.pop();'],
  [190, 'const MODULES alias', 'const modulesConstAlias = MODULES; modulesConstAlias.pop();'],
  [191, 'let MODULES alias', 'let modulesLetAlias = MODULES; modulesLetAlias.pop();'],
  [192, 'var MODULES alias', 'var modulesVarAlias = MODULES; modulesVarAlias.pop();'],
  [193, 'alias-of-alias MODULES binding', 'const modulesAlias = MODULES; const secondAlias = modulesAlias; secondAlias.pop();'],
  [194, 'array-destructured MODULES record binding', "const [moduleRecord] = MODULES; moduleRecord.categories.push('Z99');"],
  [195, 'shorthand object-destructured MODULES binding', "const { categories } = MODULES[0]; categories.push('Z99');"],
  [196, 'renamed object-destructured MODULES binding', "const { categories: renamedCategories } = MODULES[0]; renamedCategories.push('Z99');"],
  [197, 'bracket categories MODULES binding', "const categoriesAlias = MODULES[0]['categories']; categoriesAlias.push('Z99');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'MODULES', mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow', 'alias']);
}

// Controls 198-199: binding a `.map()` result is an alias boundary, not a safe-copy boundary. The
// callback can return source entries, so mutating a descendant through the bound result must be
// rejected just like a direct MODULES alias.
for (const [number, name, mutation] of [
  [198, 'MODULES map binding with descendant mutation', "const moduleEntries = MODULES.map((entry) => entry); moduleEntries[0].categories.push('Z99');"],
  [199, 'parenthesized MODULES map binding with descendant mutation', "const moduleEntries = (MODULES.map((entry) => entry)); moduleEntries[0].categories.push('Z99');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'MODULES', mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow', 'alias']);
}

// Controls 200-203: direct assignments to the root array's length are mutations too. Keep both
// dot and quoted bracket notation pinned for MODULES and AUDIT_UNITS.
for (const [number, name, root, property] of [
  [200, 'direct MODULES length assignment', 'MODULES', '.length'],
  [201, 'bracket MODULES length assignment', 'MODULES', "['length']"],
  [202, 'direct AUDIT_UNITS length assignment', 'AUDIT_UNITS', '.length'],
  [203, 'bracket AUDIT_UNITS length assignment', 'AUDIT_UNITS', '["length"]'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const target = insertWorkflowMutation(source, root, `${root}${property} = 0;`);
    return target;
  });
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 204-212: the same direct-alias contract applies to AUDIT_UNITS, including all
// declaration kinds, alias chains, both destructuring forms, and bracket nested-array access.
for (const [number, name, mutation] of [
  [204, 'parenthesized AUDIT_UNITS alias', 'const auditUnitsAlias = (AUDIT_UNITS); auditUnitsAlias.pop();'],
  [205, 'const AUDIT_UNITS alias', 'const auditUnitsConstAlias = AUDIT_UNITS; auditUnitsConstAlias.pop();'],
  [206, 'let AUDIT_UNITS alias', 'let auditUnitsLetAlias = AUDIT_UNITS; auditUnitsLetAlias.pop();'],
  [207, 'var AUDIT_UNITS alias', 'var auditUnitsVarAlias = AUDIT_UNITS; auditUnitsVarAlias.pop();'],
  [208, 'alias-of-alias AUDIT_UNITS binding', 'const auditUnitsAlias = AUDIT_UNITS; const secondAuditAlias = auditUnitsAlias; secondAuditAlias.pop();'],
  [209, 'array-destructured AUDIT_UNITS record binding', "const [auditRecord] = AUDIT_UNITS; auditRecord.requiredArtifactGroups.push('decoy');"],
  [210, 'shorthand object-destructured AUDIT_UNITS binding', "const { requiredArtifactGroups } = AUDIT_UNITS[0]; requiredArtifactGroups.push('decoy');"],
  [211, 'renamed object-destructured AUDIT_UNITS binding', "const { requiredArtifactGroups: renamedGroups } = AUDIT_UNITS[0]; renamedGroups.push('decoy');"],
  [212, 'bracket required-groups AUDIT_UNITS binding', "const groupsAlias = AUDIT_UNITS[0]['requiredArtifactGroups']; groupsAlias.push('decoy');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => {
    const target = insertWorkflowMutation(source, 'AUDIT_UNITS', mutation);
    return target;
  });
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow', 'alias']);
}

// Controls 213-214: length is a primitive and remains safe through quoted bracket notation, but a
// `.filter()` result is still an alias boundary when it carries source entries to a descendant.
for (const [number, name, mutation] of [
  [213, 'AUDIT_UNITS bracket-length binding', "let auditUnitCount = AUDIT_UNITS['length']; auditUnitCount += 1;"],
  [214, 'AUDIT_UNITS filter binding with descendant mutation', "const auditEntries = AUDIT_UNITS.filter((entry) => entry); auditEntries[0].requiredArtifactGroups.push('decoy');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'AUDIT_UNITS', mutation));
  const expected = number === 213 ? 0 : 1;
  const required = number === 213 ? [] : ['workflow', 'alias'];
  expectFixture(result, `Control ${number}: ${name} ${expected ? 'is rejected' : 'remains accepted'}`, expected, required);
}

// Controls 215-216: inline consumption/iteration is not binding and remains legal. These positive
// controls deliberately consume mapped primitive values and iterate the root directly, so a
// validator that rejects every occurrence of the root identifier would be too broad.
for (const [number, name, root] of [
  [215, 'inline MODULES map consumption and primitive iteration', 'MODULES'],
  [216, 'inline AUDIT_UNITS map consumption and primitive iteration', 'AUDIT_UNITS'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    insertWorkflowMutation(source, root, `{ ${root}.map((entry) => entry.file || entry.label).join(','); for (const entry of ${root}) { void (entry.file || entry.label); } }`));
  expectFixture(result, `Control ${number}: ${name} remain accepted`, 0);
}

// Control 217: an alias-like variable name used only for unrelated local arrays in separate
// scopes is harmless. This catches a global name-set implementation that remembers a spelling
// as an alias even when its RHS never references MODULES/AUDIT_UNITS.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'AUDIT_UNITS', `{
  const modulesAlias = [];
  modulesAlias.push('local-module');
}
{
  const auditUnitsAlias = [];
  auditUnitsAlias.push('local-audit');
}`));
  expectFixture(result, 'Control 217: unrelated local alias names remain accepted', 0);
}

// Control 218: a short-circuit expression that returns the immutable root on its truthy side is
// still an alias. The binding-site check must not be bypassed by the intervening `.length &&`.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    insertWorkflowMutation(source, 'MODULES', 'const conditionalAlias = MODULES.length && MODULES; conditionalAlias.push({ file: \'conditional.md\', categories: [] });'));
  expectFixture(result, 'Control 218: conditional MODULES alias mutation is rejected', 1, ['workflow', 'alias']);
}

// Controls 219-220: parenthesized primitive length reads remain safe. These are deliberately
// full binding expressions so the derived-value exception cannot accidentally depend on the root
// being the first unparenthesized token or on dot notation alone.
for (const [number, name, root, expression] of [
  [219, 'full-parenthesized MODULES length read', 'MODULES', '(MODULES.length)'],
  [220, 'full-parenthesized AUDIT_UNITS bracket-length read', 'AUDIT_UNITS', "(AUDIT_UNITS['length'])"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) =>
    insertWorkflowMutation(source, root, `const safeCount${number} = ${expression}; void safeCount${number};`));
  expectFixture(result, `Control ${number}: ${name} remains accepted`, 0);
}

// Controls 221-224: binding-site diagnostics must fire even when the bound value is never
// mutated. This isolates direct roots, destructuring, and method-result bindings from the later
// mutation scanner and prevents an alias from becoming invisible merely because it is unused.
for (const [number, name, root, mutation] of [
  [221, 'direct MODULES alias binding', 'MODULES', 'const unusedModulesAlias = MODULES; void unusedModulesAlias;'],
  [222, 'destructured MODULES binding', 'MODULES', 'const [unusedModuleRecord] = MODULES; void unusedModuleRecord;'],
  [223, 'bound MODULES map result', 'MODULES', 'const unusedModuleEntries = MODULES.map((entry) => entry); void unusedModuleEntries;'],
  [224, 'bound AUDIT_UNITS filter result', 'AUDIT_UNITS', 'const unusedAuditEntries = AUDIT_UNITS.filter((entry) => entry); void unusedAuditEntries;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected at binding site`, 1, ['workflow', 'alias']);
}

// Controls 225-227: both increment directions are writes, whether applied to a root, a nested
// value, or the length property. Keep these as separate controls so each operator family remains
// visible when a regex branch is changed.
for (const [number, name, root, mutation] of [
  [225, 'prefix root increment', 'MODULES', '++MODULES;'],
  [226, 'postfix nested decrement', 'MODULES', 'MODULES[0].categories[0]--;'],
  [227, 'postfix length increment', 'AUDIT_UNITS', 'AUDIT_UNITS.length++;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 228-234: assignment operators beyond plain/arithmetical/logical assignment must be
// covered on root, nested, and length targets. The list mirrors every extra operator family in
// workflowMutationCheck's write recognizer, including bitwise and all three shifts.
for (const [number, name, root, mutation] of [
  [228, 'exponentiation root assignment', 'MODULES', 'MODULES **= 1;'],
  [229, 'bitwise-and nested assignment', 'MODULES', 'MODULES[0].categories[0] &= 1;'],
  [230, 'bitwise-or length assignment', 'MODULES', 'MODULES.length |= 1;'],
  [231, 'bitwise-xor nested assignment', 'AUDIT_UNITS', 'AUDIT_UNITS[0].requiredArtifactGroups[0] ^= 1;'],
  [232, 'left-shift length assignment', 'AUDIT_UNITS', 'AUDIT_UNITS.length <<= 1;'],
  [233, 'right-shift nested assignment', 'MODULES', 'MODULES[0].categories[0] >>= 1;'],
  [234, 'unsigned-right-shift nested assignment', 'AUDIT_UNITS', 'AUDIT_UNITS[0].requiredArtifactGroups[0] >>>= 1;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 235-238: logical/nullish assignment remains forbidden, while pure comparison and
// arrow-function reads remain legal. Keep reads as expression statements so they cannot be
// confused with a binding whose RHS begins with a declarative root.
for (const [number, name, root, mutation] of [
  [235, 'logical-and root assignment', 'MODULES', 'MODULES &&= [];'],
  [236, 'logical-or nested assignment', 'MODULES', 'MODULES[0].categories ||= [];'],
  [237, 'nullish-coalescing length assignment', 'AUDIT_UNITS', 'AUDIT_UNITS.length ??= 0;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'AUDIT_UNITS', `void (MODULES === AUDIT_UNITS);\nvoid (MODULES.length >= AUDIT_UNITS['length']);\nvoid (() => MODULES[0].file)();`));
  expectFixture(result, 'Control 238: comparison and arrow reads remain accepted', 0);
}

// Controls 239-240: mutator calls remain writes when the method or an intermediate nested
// property uses quoted bracket notation. These are deliberately static probes: the inserted
// expressions need not execute, because workflowMutationCheck is validating the source contract.
for (const [number, name, root, mutation] of [
  [239, 'bracket root mutator call', 'MODULES', "MODULES['push']({ file: 'bracket-root.md', categories: [] });"],
  [240, 'bracket nested mutator call', 'MODULES', "MODULES[0]['categories']['push']('Z99');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 241-243: fully parenthesized root and nested chains must not hide a mutator or a
// postfix update from the write recognizer. Keep the root, nested-chain, and update forms
// separate so each parenthesis boundary remains independently pinned.
for (const [number, name, root, mutation] of [
  [241, 'fully-parenthesized root mutator call', 'MODULES', '(MODULES).pop();'],
  [242, 'fully-parenthesized nested-chain mutator call', 'MODULES', '((MODULES[0].categories)).push(\'Z99\');'],
  [243, 'fully-parenthesized nested postfix update', 'MODULES', '(MODULES[0].categories[0])--;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 244-245: comments between a prefix update operator and its root are non-code and
// must not create a scanner gap. The line-comment case also proves the newline-separated form.
for (const [number, name, root, mutation] of [
  [244, 'block-comment-separated prefix increment', 'MODULES', '/*c*/++MODULES;'],
  [245, 'line-comment-separated prefix decrement', 'AUDIT_UNITS', '//c\n--AUDIT_UNITS;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Control 246: comments surrounding a quoted bracket mutator name are still lexical trivia. The
// property is statically known to be `push`, so the direct call must remain rejected.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    "MODULES[/* before */ 'push' /* after */]({ file: 'comment-bracket.md', categories: [] });",
  ));
  expectFixture(result, 'comments around quoted bracket mutator name', 1, ['workflow']);
}

// Controls 247-248: comments may occur at both property-boundary positions in a direct nested
// chain. They must not hide either the root-to-dot transition or the property after a dot.
for (const [number, name, mutation] of [
  [247, 'comment between root and dot', "MODULES /* root-dot */ .categories.push('Z99');"],
  [248, 'comment after nested dot before property', "MODULES[0]. /* dot-property */ categories.push('Z99');"],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'MODULES', mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 249-253: statement-position mutations remain visible after control-flow headers and
// branch keywords. Grouping after `if` and prefix updates after `while`/`for` are especially easy
// to misclassify as call-argument or postfix contexts when the preceding `)` is inspected.
for (const [number, name, root, mutation] of [
  [249, 'grouped mutator after if header', 'MODULES', 'if (true) (MODULES).pop();'],
  [250, 'prefix increment after while header', 'MODULES', 'while (false) ++MODULES;'],
  [251, 'prefix decrement after for header', 'AUDIT_UNITS', 'for (;;) --AUDIT_UNITS;'],
  [252, 'else-position grouped direct mutator', 'MODULES', 'if (false) {} else (MODULES).pop();'],
  [253, 'do-position length update', 'AUDIT_UNITS', 'do --AUDIT_UNITS.length; while(false);'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}

// Controls 254-255: roots used as call arguments are reads, even when the call result is later
// mutated. Preserve these positive contexts so the direct-reference scanner does not reject every
// occurrence of MODULES/AUDIT_UNITS merely because it is adjacent to parentheses or `.push()`.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    "factory(MODULES).push({ file: 'factory-result.md', categories: [] });",
  ));
  expectFixture(result, 'factory call result mutator remains accepted', 0);
}
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'AUDIT_UNITS',
    'consume(MODULES); invoke(AUDIT_UNITS);',
  ));
  expectFixture(result, 'function call argument contexts remain accepted', 0);
}

// Controls 256-261: ASI separates a completed root property read from the next prefix update,
// while a call followed by a line terminator still leaves the update attached to the new
// statement.  Comments are lexical trivia here, so both comment forms preserve the same ASI
// boundary.  The final two controls pin that `if`/`while` property names are not control-flow
// headers: each call returns a fresh array, and the grouped MODULES argument is never mutated.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    'MODULES.length\n++unrelatedCounter;',
  ));
  expectFixture(result, 'ASI separates root length read from unrelated prefix update', 0);
}
for (const [number, name, mutation] of [
  [257, 'ASI prefix update after a call', 'doSomething()\n++MODULES.length;'],
  [258, 'ASI prefix update after a line comment', 'doSomething() // boundary\n++MODULES.length;'],
  [259, 'ASI prefix update after a multiline block comment', 'doSomething() /* boundary\n*/ ++MODULES.length;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, 'MODULES', mutation));
  expectFixture(result, `Control ${number}: ${name} is rejected`, 1, ['workflow']);
}
for (const [number, name, property] of [
  [260, 'property named if is not a control header', 'if'],
  [261, 'property named while is not a control header', 'while'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    `const propertyFactory${number} = { ${property}: () => () => [] };\npropertyFactory${number}.${property}(true)\n(MODULES).pop();`,
  ));
  expectFixture(result, `Control ${number}: ${name}`, 0);
}

// Controls 262-269: ECMAScript treats U+2028/U+2029 as line terminators.  They must therefore
// terminate a line comment and close a multiline block comment before a prefix update; neither
// Unicode separator may hide a write to either immutable root.  Keep the full 2x2x2 matrix so
// each separator, comment form, and immutable root is independently pinned.  The block-comment
// probes follow a completed call so the update is causally a new expression, not a continuation
// of the preceding bare comment.
for (const [number, name, root, mutation] of [
  [262, 'U+2028 line-comment boundary before MODULES update', 'MODULES', '// boundary\u2028++MODULES.length;'],
  [263, 'U+2028 line-comment boundary before AUDIT_UNITS update', 'AUDIT_UNITS', '// boundary\u2028++AUDIT_UNITS.length;'],
  [264, 'U+2029 line-comment boundary before MODULES update', 'MODULES', '// boundary\u2029++MODULES.length;'],
  [265, 'U+2029 line-comment boundary before AUDIT_UNITS update', 'AUDIT_UNITS', '// boundary\u2029++AUDIT_UNITS.length;'],
  [266, 'U+2028 block-comment terminator before MODULES update', 'MODULES', 'doSomething() /* boundary\u2028 */ ++MODULES.length;'],
  [267, 'U+2028 block-comment terminator before AUDIT_UNITS update', 'AUDIT_UNITS', 'doSomething() /* boundary\u2028 */ ++AUDIT_UNITS.length;'],
  [268, 'U+2029 block-comment terminator before MODULES update', 'MODULES', 'doSomething() /* boundary\u2029 */ ++MODULES.length;'],
  [269, 'U+2029 block-comment terminator before AUDIT_UNITS update', 'AUDIT_UNITS', 'doSomething() /* boundary\u2029 */ ++AUDIT_UNITS.length;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name}`, 1, ['workflow']);
}

// Controls 270-272: a closing brace ends a statement/block context, so a prefix update on the
// same line is still a new write statement.  Cover control-flow, try/finally, and a bare block
// separately; a scanner must not treat a preceding `}` as a continuation that hides the update.
for (const [number, name, root, mutation] of [
  [270, 'prefix update after if block close', 'MODULES', 'if (false) { void 0; } ++MODULES.length;'],
  [271, 'prefix update after try/finally close', 'AUDIT_UNITS', 'try { void 0; } finally { void 0; } ++AUDIT_UNITS.length;'],
  [272, 'prefix update after bare block close', 'MODULES', '{ void 0; } ++MODULES.length;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, mutation));
  expectFixture(result, `Control ${number}: ${name}`, 1, ['workflow']);
}

// Control 273: closing an object-literal/expression is not itself a mutation.  This positive
// case keeps brace-boundary handling from over-reporting a harmless object expression containing
// an immutable-root read.
{
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    'const objectExpression = ({ count: 1 });\nconst objectFactory = () => ({});\nvoid objectExpression;\nvoid objectFactory;\nvoid MODULES.length;',
  ));
  expectFixture(result, 'Control 273: object-literal expression close remains accepted', 0);
}

// Controls 274-275: a class declaration's closing brace also ends the preceding statement or
// declaration on the same line.  Keep both immutable roots covered so a brace-specific context
// heuristic cannot hide a same-line prefix update after a class body.
for (const [number, name, root] of [
  [274, 'prefix update after same-line class close', 'MODULES'],
  [275, 'prefix update after same-line class close', 'AUDIT_UNITS'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `class Example${number} {} ++${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 276-277: private methods whose names are reserved words are still callable
// expressions.  Their call results are immediately invoked with a root expression on the next
// line, so MODULES remains a call argument and must stay accepted rather than being mistaken for
// a statement-position mutator after a keyword-named property.  Keep both #if and #while bounded
// to the same class-method shape.
for (const [number, name, privateName] of [
  [276, 'private #if method call-result context', '#if'],
  [277, 'private #while method call-result context', '#while'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    'MODULES',
    `const PrivateContext${number} = class {\n` +
      `  ${privateName}(value) { return () => []; }\n` +
      `  run() { return this.${privateName}(true)\n` +
      `    (MODULES).pop(); }\n` +
      `};\n` +
      `void PrivateContext${number};`,
  ));
  expectFixture(result, `Control ${number}: ${name} remains accepted`, 0);
}

// Controls 278-281: an export-default class declaration has a statement-level closing brace,
// including both the named and anonymous forms.  Keep both immutable roots covered: a context
// heuristic that only recognizes `class Name {}` or only recognizes declaration names would let
// the same-line prefix update escape.
for (const [number, name, root, declaration] of [
  [278, 'named export-default class declaration', 'MODULES', 'export default class ExportedClass278 {}'],
  [279, 'anonymous export-default class declaration', 'MODULES', 'export default class {}'],
  [280, 'named export-default class declaration', 'AUDIT_UNITS', 'export default class ExportedClass280 {}'],
  [281, 'anonymous export-default class declaration', 'AUDIT_UNITS', 'export default class {}'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `${declaration} ++${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 282-285: ECMAScript class declarations may use Unicode identifier names, including
// Unicode escapes in IdentifierName position.  Both spellings must still classify an
// export-default class body as a statement boundary for the following root update.
for (const [number, name, root, className] of [
  [282, 'Unicode-named export-default class declaration', 'MODULES', 'Δelta282'],
  [283, 'escaped-Unicode export-default class declaration', 'MODULES', '\\u0394elta283'],
  [284, 'Unicode-named export-default class declaration', 'AUDIT_UNITS', 'Δelta284'],
  [285, 'escaped-Unicode export-default class declaration', 'AUDIT_UNITS', '\\u0394elta285'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `export default class ${className} {} ++${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 286-289: Unicode class syntax in expression/object positions is not itself a
// statement boundary.  These are positive reads, one class-expression and one object-literal
// context per immutable root, guarding the declaration fix from becoming an over-broad class
// or brace rejection.
for (const [number, name, root, expression] of [
  [286, 'Unicode class expression read context', 'MODULES',
    `const UnicodeClassExpression286 = class Δelta286 { read() { return ${'MODULES'}.length; } }; void UnicodeClassExpression286;`],
  [287, 'Unicode class in object-literal context', 'MODULES',
    `const UnicodeObjectContext287 = { value: class Δelta287 {}, size: ${'MODULES'}.length }; void UnicodeObjectContext287;`],
  [288, 'Unicode class expression read context', 'AUDIT_UNITS',
    `const UnicodeClassExpression288 = class Δelta288 { read() { return ${'AUDIT_UNITS'}.length; } }; void UnicodeClassExpression288;`],
  [289, 'Unicode class in object-literal context', 'AUDIT_UNITS',
    `const UnicodeObjectContext289 = { value: class Δelta289 {}, size: ${'AUDIT_UNITS'}.length }; void UnicodeObjectContext289;`],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, expression));
  expectFixture(result, `Control ${number}: ${name} (${root}) remains accepted`, 0);
}

// Controls 290-293: valid braced Unicode escapes in class names must not make the following
// update disappear at a class-boundary.  Keep both a dollar-sign escape and a letter escape,
// each with a trailing literal identifier part, in both bare and export-default declarations.
// The trailing part is important: a fallback scanner must not mistake the escaped closing `}`
// for a class block while treating the malformed/partial name as a safe expression.
for (const [number, name, root, declaration] of [
  [290, 'dollar braced Unicode escape in bare class declaration', 'MODULES', 'class \\u{24}Name290 {}'],
  [291, 'letter braced Unicode escape in bare class declaration', 'MODULES', 'class \\u{41}Name291 {}'],
  [292, 'dollar braced Unicode escape in export-default class declaration', 'AUDIT_UNITS', 'export default class \\u{24}Name292 {}'],
  [293, 'letter braced Unicode escape in export-default class declaration', 'AUDIT_UNITS', 'export default class \\u{41}Name293 {}'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `${declaration} ++${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 294-297: class declarations can occur directly in switch case/default clauses.
// The label colon is a statement boundary for the class declaration, so an update after its
// closing brace remains an executable mutation in either direction and for either root.
for (const [number, name, root, label, operator] of [
  [294, 'class declaration after switch case label', 'MODULES', 'case 1:', '++'],
  [295, 'class declaration after switch default label', 'MODULES', 'default:', '--'],
  [296, 'class declaration after switch case label', 'AUDIT_UNITS', 'case 2:', '++'],
  [297, 'class declaration after switch default label', 'AUDIT_UNITS', 'default:', '--'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { ${label} class SwitchClass${number} {} ${operator}${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 298-301: a completed postfix update before a line break does not turn the following
// class declaration into an expression continuation.  Pin both update directions and both roots
// because the previous statement's postfix operator is an easy context leak for boundary scans.
for (const [number, name, root, operator] of [
  [298, 'class after prior postfix update', 'MODULES', '++'],
  [299, 'class after prior postfix update', 'MODULES', '--'],
  [300, 'class after prior postfix update', 'AUDIT_UNITS', '++'],
  [301, 'class after prior postfix update', 'AUDIT_UNITS', '--'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `const value${number} = 0; value${number}++\nclass FollowingClass${number} {} ${operator}${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 302-305: class expressions in object-property and ternary-colon positions are not
// statement declarations.  Their closing braces must not poison the surrounding expression
// context or cause an unrelated primitive read of an immutable root to be reported.
for (const [number, name, root, expression] of [
  [302, 'object-property class expression context', 'MODULES', 'const objectClass302 = { value: class {} }; void MODULES.length;'],
  [303, 'ternary-colon class expression context', 'MODULES', 'const ternaryClass303 = flag ? class {} : class {}; void MODULES.length;'],
  [304, 'object-property class expression context', 'AUDIT_UNITS', 'const objectClass304 = { value: class {} }; void AUDIT_UNITS.length;'],
  [305, 'ternary-colon class expression context', 'AUDIT_UNITS', 'const ternaryClass305 = flag ? class {} : class {}; void AUDIT_UNITS.length;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, expression));
  expectFixture(result, `Control ${number}: ${name} (${root}) remains accepted`, 0);
}

// Controls 306-313: identifiers that merely contain a protected root name are unrelated local
// arrays.  Their own mutators must stay quiet; static rejection of escaped root/property spellings
// is intentionally out of scope and is not asserted here.
for (const [number, name, identifier] of [
  [306, 'dollar-prefixed MODULES identifier', '$MODULES'],
  [307, 'underscore-prefixed MODULES identifier', '_MODULES'],
  [308, 'Unicode-prefixed MODULES identifier', '\u0394MODULES'],
  [309, 'Unicode-suffixed MODULES identifier', 'MODULES\u0394'],
  [310, 'dollar-prefixed AUDIT_UNITS identifier', '$AUDIT_UNITS'],
  [311, 'underscore-prefixed AUDIT_UNITS identifier', '_AUDIT_UNITS'],
  [312, 'Unicode-prefixed AUDIT_UNITS identifier', '\u0394AUDIT_UNITS'],
  [313, 'Unicode-suffixed AUDIT_UNITS identifier', 'AUDIT_UNITS\u0394'],
]) {
  const root = identifier.includes('AUDIT_UNITS') ? 'AUDIT_UNITS' : 'MODULES';
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `const ${identifier} = []; ${identifier}.push(${number});`,
  ));
  expectFixture(result, `Control ${number}: ${name} remains accepted`, 0);
}

// Controls 314-319: a switch case expression may contain an object literal, a class expression,
// or an arrow body before its label colon. None of those colons is a statement boundary, but the
// class declaration after the label is one; the following root update must therefore be rejected.
for (const [number, name, root, caseExpression] of [
  [314, 'object-literal switch case expression', 'MODULES', '({ key: 1 })'],
  [315, 'class-expression switch case expression', 'MODULES', '(class {})'],
  [316, 'arrow-body switch case expression', 'MODULES', '(() => ({ key: 1 }))'],
  [317, 'object-literal switch case expression', 'AUDIT_UNITS', '({ key: 1 })'],
  [318, 'class-expression switch case expression', 'AUDIT_UNITS', '(class {})'],
  [319, 'arrow-body switch case expression', 'AUDIT_UNITS', '(() => ({ key: 1 }))'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { case ${caseExpression}: class SwitchExpressionClass${number} {} ++${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 320-321: an astral IdentifierStart variable can be updated before a line break just
// like an ASCII local. The following class declaration must remain a statement boundary, so the
// root update after it is rejected for both protected roots.
for (const [number, name, root] of [
  [320, 'astral IdentifierStart postfix update', 'MODULES'],
  [321, 'astral IdentifierStart postfix update', 'AUDIT_UNITS'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `const 𐐀 = 0; 𐐀++\nclass FollowingAstralClass${number} {} ++${root}.length;`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 322-325: object-literal and ternary colons outside a switch are expression syntax, not
// labels. Keep these positive reads beside the switch-label negatives so a broad colon heuristic
// cannot turn ordinary object/conditional expressions into false positives.
for (const [number, name, root, expression] of [
  [322, 'object-literal colon outside switch', 'MODULES', 'const objectColon322 = { branch: ({ value: 1 }) }; void MODULES.length;'],
  [323, 'ternary colon outside switch', 'MODULES', 'const ternaryColon323 = flag ? ({ value: 1 }) : ({ value: 2 }); void MODULES.length;'],
  [324, 'object-literal colon outside switch', 'AUDIT_UNITS', 'const objectColon324 = { branch: ({ value: 1 }) }; void AUDIT_UNITS.length;'],
  [325, 'ternary colon outside switch', 'AUDIT_UNITS', 'const ternaryColon325 = flag ? ({ value: 1 }) : ({ value: 2 }); void AUDIT_UNITS.length;'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(source, root, expression));
  expectFixture(result, `Control ${number}: ${name} (${root}) remains accepted`, 0);
}

// Controls 326-329: the colon that terminates a switch case may be preceded by one or more
// conditional-expression colons. These are expression syntax, not statement labels; after the
// case is selected, the class declaration and root update are still reached and must be rejected.
for (const [number, name, root, caseExpression] of [
  [326, 'simple ternary switch case', 'MODULES', 'flag ? one : two'],
  [327, 'simple ternary switch case', 'AUDIT_UNITS', 'flag ? one : two'],
  [328, 'nested ternary switch case', 'MODULES', 'outer ? (inner ? one : two) : three'],
  [329, 'nested ternary switch case', 'AUDIT_UNITS', 'outer ? (inner ? one : two) : three'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { case ${caseExpression}: class SwitchTernaryClass${number} {} ++${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 330-335: each first clause ends at a case label after an automatic-semicolon-insertion
// boundary. The next clause contains a class declaration followed by the protected-root update.
// Cover a call, an array literal, and an object literal for both immutable roots so case-label
// scanning cannot lose the statement boundary at the preceding clause.
for (const [number, name, root, previousClause] of [
  [330, 'call before next case', 'MODULES', 'produceValue()'],
  [331, 'call before next case', 'AUDIT_UNITS', 'produceValue()'],
  [332, 'array literal before next case', 'MODULES', '[one, two]'],
  [333, 'array literal before next case', 'AUDIT_UNITS', '[one, two]'],
  [334, 'object literal before next case', 'MODULES', '({ one: 1 })'],
  [335, 'object literal before next case', 'AUDIT_UNITS', '({ one: 1 })'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { case 1: ${previousClause}\ncase 2: class SwitchAsiClass${number} {} ++${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) is rejected`, 1, ['workflow']);
}

// Controls 336-339: object methods named like switch clauses are ordinary property definitions,
// not case/default labels. Their body reads of each immutable root must remain accepted.
for (const [number, name, root, property] of [
  [336, 'property method named case', 'MODULES', 'case'],
  [337, 'property method named default', 'MODULES', 'default'],
  [338, 'property method named case', 'AUDIT_UNITS', 'case'],
  [339, 'property method named default', 'AUDIT_UNITS', 'default'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `const methodKeyword${number} = { ${property}() { return ${root}.length; } }; void methodKeyword${number}.${property}();`,
  ));
  expectFixture(result, `Control ${number}: ${name} (${root}) remains accepted`, 0);
}

// Controls 340-341: `flag?.5:0` is a decimal/consequent conditional expression, not optional
// chaining.  The decimal immediately after `?.` changes tokenization, so its first colon belongs
// to the ternary and the second colon terminates the switch case.  Keep the class declaration and
// direct root update on the reached case path; a scanner that treats the first colon as the label
// boundary will lose the mutation and incorrectly accept both immutable roots.
for (const [number, root] of [
  [340, 'MODULES'],
  [341, 'AUDIT_UNITS'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { case flag?.5:0: class DecimalConsequentClass${number} {} ++${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: decimal/consequent ternary switch case (${root}) is rejected`, 1, ['workflow']);
}

// Controls 342-343: genuine optional chaining in a switch-case expression is not a ternary and
// must not over-report a harmless root read.  The member property is deliberately followed by
// the case label colon, pinning the distinction from the decimal spelling above for both roots.
for (const [number, root] of [
  [342, 'MODULES'],
  [343, 'AUDIT_UNITS'],
]) {
  const result = runValidateAgainstMutatedFiles(workflowFiles, (source) => insertWorkflowMutation(
    source,
    root,
    `switch (value) { case optionalTarget?.property: void ${root}.length; }`,
  ));
  expectFixture(result, `Control ${number}: genuine optional-chaining switch case read (${root}) remains accepted`, 0);
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
