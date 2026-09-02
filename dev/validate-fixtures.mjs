#!/usr/bin/env node
// Fixture-level regression probes for the calibration seed in examples/fixtures/.
//
// Scope, stated honestly: these are two hand-written controls and two crude source probes. They
// verify that the seed still discriminates positive from negative and that the categories it
// cites still exist and are still routed — nothing more. They are NOT a recall measurement of
// the audit, and they deliberately do not assert the wording of any rule: pinning prose in CI
// turns every legitimate rewrite into a red build and freezes whichever phrasing shipped first.

import fs from 'node:fs';
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

// Negative control for dev/validate.mjs's README.md category-count check (the README.md entry in
// categoryCountMentions): proves the check actually catches a wrong count, not just that it finds
// the correct one. Mutates README.md's banner sentence to one less than the real count, re-runs
// validate.mjs as a subprocess against that mutated state, and asserts the run now fails and its
// output names README.md — then restores the original content in `finally` regardless of outcome,
// so a failed assertion here can never leave the repo mutated. RUST_INTEL_SKIP_NESTED_FIXTURES on
// the child stops validate.mjs from spawning this very script again as part of its own checks,
// which would otherwise re-enter this same negative control and spawn validate.mjs without end.
const readmePath = path.join(root, 'README.md');
const originalReadme = fs.readFileSync(readmePath, 'utf8');
const readmeBannerMatch = originalReadme.match(/Numbered categories now \*\*(\d+)\*\*/);
if (!readmeBannerMatch) {
  failures.push('README.md negative control: could not find the "Numbered categories now **N**" banner sentence to mutate');
} else {
  const wrongCount = Number.parseInt(readmeBannerMatch[1], 10) - 1;
  const mutatedReadme = originalReadme.replace(readmeBannerMatch[0], `Numbered categories now **${wrongCount}**`);
  try {
    fs.writeFileSync(readmePath, mutatedReadme);
    const run = spawnSync(process.execPath, [path.join(root, 'dev', 'validate.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, RUST_INTEL_SKIP_NESTED_FIXTURES: '1' },
    });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    if (run.status === 0) failures.push("README.md negative control: dev/validate.mjs still passed after README.md's stated category count was mutated to a wrong number");
    else if (!output.includes('README.md')) failures.push(`README.md negative control: dev/validate.mjs failed but its output did not mention README.md — got: ${output.trim()}`);
  } finally {
    fs.writeFileSync(readmePath, originalReadme);
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
