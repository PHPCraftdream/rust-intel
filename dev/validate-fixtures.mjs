#!/usr/bin/env node
// Fixture-level regression probes for the calibration seed in examples/fixtures/.
//
// Scope, stated honestly: these are two hand-written controls and two crude source probes. They
// verify that the seed still discriminates positive from negative and that the categories it
// cites still exist and are still routed — nothing more. They are NOT a recall measurement of
// the audit, and they deliberately do not assert the wording of any rule: pinning prose in CI
// turns every legitimate rewrite into a red build and freezes whichever phrasing shipped first.

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
function runValidateAgainstMutatedCopy(mutateReadme) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-intel-validate-'));
  try {
    fs.cpSync(root, tmpRoot, {
      recursive: true,
      filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) && !/[\\/]\.claude[\\/]worktrees([\\/]|$)/.test(src) && !/[\\/]node_modules([\\/]|$)/.test(src),
    });
    const tmpReadmePath = path.join(tmpRoot, 'README.md');
    const original = fs.readFileSync(tmpReadmePath, 'utf8');
    const mutated = mutateReadme(original);
    if (mutated === null) return { skipped: true };
    fs.writeFileSync(tmpReadmePath, mutated);
    const run = spawnSync(process.execPath, [path.join(tmpRoot, 'dev', 'validate.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, RUST_INTEL_SKIP_NESTED_FIXTURES: '1' },
    });
    return { skipped: false, status: run.status, output: `${run.stdout || ''}${run.stderr || ''}` };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
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
