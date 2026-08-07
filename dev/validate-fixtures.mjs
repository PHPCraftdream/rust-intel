#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(root, 'examples', 'fixtures');
const cases = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'cases.json'), 'utf8'));
const ruleText = {
  B5: `${fs.readFileSync(path.join(root, 'skill', 'SKILL.md'), 'utf8')}\n${fs.readFileSync(path.join(root, 'skill', 'unsafe-and-ffi.md'), 'utf8')}`,
  B26: `${fs.readFileSync(path.join(root, 'skill', 'SKILL.md'), 'utf8')}\n${fs.readFileSync(path.join(root, 'skill', 'data-and-types.md'), 'utf8')}`,
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

function detectRuntimeShift(source) {
  return /\b[A-Za-z_]\w*\s*(?:<<|>>)\s*[A-Za-z_]\w*/.test(source);
}

const detectors = new Map([
  ['B5', detectUnionValidity],
  ['B26', detectRuntimeShift],
]);
const failures = [];
const ruleContracts = new Map([
  ['B5', [/local validity proof/i, /not a universal requirement/i]],
  ['B26', [/checked_shl.*checked_shr/is, /runtime shift count.*checked\/wrapping policy/i]],
]);

for (const [category, patterns] of ruleContracts) {
  for (const pattern of patterns) if (!pattern.test(ruleText[category])) failures.push(`${category}: rule contract is missing ${pattern}`);
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
