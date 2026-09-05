#!/usr/bin/env node
// Repository-level regression checks. Zero dependencies; run with Node >= 16.7.0 (dev/validate-fixtures.mjs uses fs.cpSync).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isValidSemver } from './semver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'skill/SKILL.md',
  'skill/audit-project.workflow.js',
  'skill/references/sources.md',
  'skills/rust-intel/SKILL.md',
  '.codex-plugin/plugin.json',
  'bin/install-codex.js',
  'dev/set-release-version.mjs',
  'dev/check-release-version.mjs',
  'dev/semver.mjs',
  'dev/validate-fixtures.mjs',
  'examples/fixtures/cases.json',
];
const errors = [];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) errors.push(`missing required file: ${rel}`);

// Normalize line endings and mask supported standalone fenced blocks before any line-oriented
// extraction.  All downstream contracts use this same view so examples cannot impersonate live
// category headings, trigger rows, or scaffold anchors.
function splitGfmLines(source) {
  return source.replace(/\r\n?/g, '\n').split('\n');
}
function projectFenceOpener(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0], length: match[1].length };
}
function projectFenceCloser(line, fence) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return match !== null && match[1][0] === fence.marker && match[1].length >= fence.length;
}
const skillSource = splitGfmLines(fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8'));
function buildFenceMask(lines) {
  const mask = [];
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      mask[i] = true;
      if (projectFenceCloser(line, fence)) fence = null;
      continue;
    }
    const opener = projectFenceOpener(line);
    if (opener) {
      mask[i] = true;
      fence = opener;
    } else mask[i] = false;
  }
  return mask;
}
const tableFenceMask = buildFenceMask(skillSource);

function markdownUnder(dir) {
  const markdownFiles = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(full);
    }
  }
  walk(dir);
  return markdownFiles;
}

function validateLinks(skillRoot, label) {
  const markdownFiles = markdownUnder(skillRoot);
  for (const file of markdownFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of source.matchAll(linkRe)) {
      const target = match[1].trim().split('#', 1)[0].split('?', 1)[0];
      if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) continue;
      const resolved = path.resolve(path.dirname(file), target);
      const relative = path.relative(skillRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) errors.push(`${label} link escapes the installable skill: ${path.relative(root, file)} -> ${target}`);
      else if (!fs.existsSync(resolved)) errors.push(`broken ${label} link: ${path.relative(root, file)} -> ${target}`);
    }
  }
  return markdownFiles;
}

const canonicalSkill = path.join(root, 'skill');
const codexSkill = path.join(root, 'skills/rust-intel');
const markdownFiles = validateLinks(canonicalSkill, 'canonical');
validateLinks(codexSkill, 'Codex mirror');

function relativeFiles(dir) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) files.push(path.relative(dir, full));
    }
  }
  walk(dir);
  return files.sort();
}

const workflow = fs.readFileSync(path.join(root, 'skill/audit-project.workflow.js'), 'utf8');

// Remove JavaScript comments without touching quoted strings or template literals.  Replacing
// comment bytes with spaces preserves offsets and leaves a bounded, linear source view for the
// MODULES literal parser below.  The workflow's module list is data, so regex/comment syntax
// outside that literal does not need to be interpreted as executable JavaScript.
function stripJsComments(source) {
  let output = '';
  let state = 'code';
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    const next = source[i + 1];
    if (state === 'line-comment') {
      output += character === '\n' || character === '\r' ? character : ' ';
      if (character === '\n' || character === '\r') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      output += character === '\n' || character === '\r' ? character : ' ';
      if (character === '*' && next === '/') {
        output += ' ';
        i += 1;
        state = 'code';
      }
      continue;
    }
    if (state === 'single' || state === 'double') {
      output += character;
      if (character === '\\' && i + 1 < source.length) {
        output += source[i + 1];
        i += 1;
      } else if ((state === 'single' && character === "'") || (state === 'double' && character === '"')) {
        state = 'code';
      }
      continue;
    }
    if (state === 'template') {
      output += character;
      if (character === '\\' && i + 1 < source.length) {
        output += source[i + 1];
        i += 1;
      } else if (character === '`') {
        state = 'code';
      }
      continue;
    }
    if (character === '/' && next === '/') {
      output += '  ';
      i += 1;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  ';
      i += 1;
      state = 'block-comment';
    } else {
      output += character;
      if (character === "'") state = 'single';
      else if (character === '"') state = 'double';
      else if (character === '`') state = 'template';
    }
  }
  return output;
}

function findMatchingBracket(source, openingIndex) {
  let depth = 0;
  let state = 'code';
  for (let i = openingIndex; i < source.length; i += 1) {
    const character = source[i];
    if (state === 'single' || state === 'double' || state === 'template') {
      if (character === '\\') i += 1;
      else if ((state === 'single' && character === "'") || (state === 'double' && character === '"') || (state === 'template' && character === '`')) state = 'code';
      continue;
    }
    if (character === "'") { state = 'single'; continue; }
    if (character === '"') { state = 'double'; continue; }
    if (character === '`') { state = 'template'; continue; }
    if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return i;
  }
  return -1;
}

const workflowWithoutComments = stripJsComments(workflow);
const modulesAssignment = workflowWithoutComments.match(/\bconst\s+MODULES\s*=\s*\[/);
const modulesStart = modulesAssignment ? modulesAssignment.index + modulesAssignment[0].lastIndexOf('[') : -1;
const modulesEnd = modulesStart >= 0 ? findMatchingBracket(workflowWithoutComments, modulesStart) : -1;
const modulesLiteral = modulesStart >= 0 && modulesEnd > modulesStart
  ? workflowWithoutComments.slice(modulesStart + 1, modulesEnd)
  : '';
const workflowModuleCategories = new Map();
for (const entry of modulesLiteral.matchAll(/\{\s*file:\s*'([^']+)',\s*categories:\s*\[([^\]]*)\]\s*\}/g)) {
  const [, file, list] = entry;
  if (workflowModuleCategories.has(file)) {
    errors.push(`workflow MODULES contains duplicate executable entry for ${file}`);
    continue;
  }
  workflowModuleCategories.set(file, new Set(list.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)));
}
for (const module of ['async.md', 'concurrency-and-state.md', 'data-and-types.md', 'security.md', 'unsafe-and-ffi.md', 'drop-and-raii.md', 'deps-macros-ergonomics.md', 'lifetimes-and-api.md', 'testing.md', 'semantics-and-conformance.md']) {
  if (!workflowModuleCategories.has(module)) errors.push(`workflow missing module: ${module}`);
}

// Category-id parity between SKILL.md's "Category map" table and the workflow's MODULES list.
// The workflow's slicer routes trigger rows and 🔴 items to each audit unit using ONLY the
// category ids listed in MODULES (skill/audit-project.workflow.js) — SKILL.md's table is the
// spec of record, but nothing enforced that a category added there also reached the workflow.
// That is exactly the gap that let §C12/§C12a ship invisible to the fan-out audit in v0.6.0:
// the category existed, its module file was already wired, but its id was absent from the
// module's category list, so the slicer never extracted its trigger rows or 🔴 items for it.
function expandCategoryCell(cellText) {
  // Two DIFFERENT notations for a lettered sub-section appear in the table, and both must be
  // handled: written out as its own token directly against the digits ("§B3a", no separator —
  // matched by the optional trailing [a-z] below), or compacted into a parenthetical suffix on
  // the base id ("§B4 (a)", "§B1 (a, b)", "§B15 (a–e)" with an en dash range).
  const ids = [];
  const re = /§([A-Z]\d+)([a-z])?(?:\s*\(([^)]+)\))?/g;
  let m;
  while ((m = re.exec(cellText))) {
    const [, base, trailingLetter, parenSuffix] = m;
    if (trailingLetter) { ids.push(base + trailingLetter); continue; }
    ids.push(base);
    if (!parenSuffix) continue;
    for (const rawPart of parenSuffix.split(',')) {
      const part = rawPart.trim();
      const range = part.match(/^([a-z])[–-]([a-z])$/); // – = en dash, as used in "a–e"
      if (range) {
        for (let c = range[1].charCodeAt(0); c <= range[2].charCodeAt(0); c += 1) ids.push(base + String.fromCharCode(c));
      } else if (/^[a-z]$/.test(part)) {
        ids.push(base + part);
      }
    }
  }
  return ids;
}
const categoryMapAnchor = '# Category map \u2014 which module holds each \u00a7';
const categoryMapMatches = skillSource.flatMap((line, i) => !tableFenceMask[i] && line === categoryMapAnchor ? [i] : []);
if (categoryMapMatches.length !== 1) errors.push(`skill/SKILL.md: Category map anchor must occur exactly once outside supported fences (found ${categoryMapMatches.length})`);
const categoryMapIndex = categoryMapMatches[0] ?? -1;
const categoryMapIntro = 'The category bodies live in sibling modules of this skill. When a trigger above fires, open the module named here. Tier (🔴/🟡/🟢; A–F) is a property of each category, preserved in its body.';
const categoryMapHeader = '| Category | Module |';
const categoryMapDelimiter = '|---|---|';
const crossReferenceMatches = skillSource.flatMap((line, i) => !tableFenceMask[i] && line.startsWith('**Cross-reference note:**') ? [i] : []);
if (crossReferenceMatches.length !== 1) errors.push(`skill/SKILL.md: Cross-reference note boundary must occur exactly once outside supported fences (found ${crossReferenceMatches.length})`);
const categoryMapEnd = crossReferenceMatches.find((index) => index > categoryMapIndex) ?? -1;
const categoryMapBodyEnd = categoryMapEnd > categoryMapIndex + 5
  && /^[ \t]*$/.test(skillSource[categoryMapEnd - 1] || '')
  ? categoryMapEnd - 1
  : categoryMapEnd;
if (categoryMapIndex >= 0) {
  const expected = [categoryMapIndex + 1, categoryMapIndex + 2, categoryMapIndex + 3, categoryMapIndex + 4, categoryMapIndex + 5];
  if (!/^[ \t]*$/.test(skillSource[expected[0]] || '') || skillSource[expected[1]] !== categoryMapIntro || !/^[ \t]*$/.test(skillSource[expected[2]] || '') || skillSource[expected[3]] !== categoryMapHeader || skillSource[expected[4]] !== categoryMapDelimiter) {
    errors.push(`skill/SKILL.md:${categoryMapIndex + 1}: Category map requires its exact heading, explanatory paragraph, blank separator, and two-row raw-pipe scaffold`);
  }
  if (categoryMapEnd <= categoryMapIndex + 5) {
    errors.push(`skill/SKILL.md:${categoryMapIndex + 1}: Category map cross-reference note must follow at least one body row`);
  } else {
    if (!/^[ \t]*$/.test(skillSource[categoryMapEnd - 1] || '')) {
      errors.push(`skill/SKILL.md:${categoryMapEnd + 1}: Category map requires exactly one blank separator immediately before the Cross-reference note`);
    } else if (/^[ \t]*$/.test(skillSource[categoryMapEnd - 2] || '')) {
      errors.push(`skill/SKILL.md:${categoryMapEnd + 1}: Category map requires exactly one blank separator immediately before the Cross-reference note`);
    }
  }
}
const specModuleCategories = new Map();
for (const [offset, line] of skillSource.slice(categoryMapIndex + 6, categoryMapBodyEnd).entries()) {
  const lineNumber = categoryMapIndex + 6 + offset;
  if (tableFenceMask[lineNumber]) {
    errors.push(`skill/SKILL.md:${lineNumber + 1}: Category map body row lies inside a supported fence`);
    continue;
  }
  if (!line.startsWith('|')) {
    errors.push(`skill/SKILL.md:${lineNumber + 1}: Category map body row missing its leading pipe`);
    continue;
  }
  const row = line.match(/^\|\s*(§[^|]+?)\s*\|\s*`([^`]+)`\s*\|$/);
  if (!row) {
    errors.push(`skill/SKILL.md:${lineNumber + 1}: Category map body row must have exactly two raw-pipe columns`);
    continue;
  }
  const [, cell, file] = row;
  if (!specModuleCategories.has(file)) specModuleCategories.set(file, new Set());
  for (const id of expandCategoryCell(cell)) specModuleCategories.get(file).add(id);
}
if (specModuleCategories.size === 0) errors.push('category-map parity check found zero rows in SKILL.md — the table anchor text may have moved');
for (const [file, specIds] of specModuleCategories) {
  const workflowIds = workflowModuleCategories.get(file);
  if (!workflowIds) { errors.push(`workflow MODULES has no entry for ${file}, but SKILL.md's category map routes categories to it`); continue; }
  for (const id of specIds) if (!workflowIds.has(id)) errors.push(`workflow MODULES entry for ${file} is missing §${id} (present in SKILL.md's category map)`);
  for (const id of workflowIds) if (!specIds.has(id)) errors.push(`workflow MODULES entry for ${file} lists §${id}, which SKILL.md's category map does not route to it`);
}
for (const file of workflowModuleCategories.keys()) {
  if (!specModuleCategories.has(file)) errors.push(`workflow MODULES has an entry for ${file}, but SKILL.md's category map never routes anything to it`);
}

// Third leg: the category-map table itself, checked against the actual "## §<id>." / "### §<id>."
// headers in each module file. The table<->MODULES check above only catches drift BETWEEN those
// two — it cannot see a category whose body exists (a real heading, real BANNED/REQUIRED text) but
// was never added to the table OR to MODULES, which is the same incident one level further back:
// a category can go live in the file system while staying invisible to both routing paths. This
// closes headers -> table -> MODULES as one loop instead of one checked link.
const moduleHeaderCategories = new Map();
for (const file of relativeFiles(canonicalSkill).filter((f) => f.endsWith('.md') && f !== 'SKILL.md' && !f.startsWith('references' + path.sep))) {
  const body = fs.readFileSync(path.join(canonicalSkill, file), 'utf8');
  const lines = splitGfmLines(body);
  const fenceMask = buildFenceMask(lines);
  const ids = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!fenceMask[i]) {
      const match = lines[i].match(/^#{2,3} §([A-Z]\d+[a-z]*)\.\s/);
      if (match) ids.add(match[1]);
    }
  }
  if (ids.size) moduleHeaderCategories.set(file, ids);
}
for (const [file, headerIds] of moduleHeaderCategories) {
  const specIds = specModuleCategories.get(file);
  if (!specIds) { errors.push(`${file} has § category headings but SKILL.md's category map never routes anything to it`); continue; }
  for (const id of headerIds) if (!specIds.has(id)) errors.push(`${file} has a "§${id}." heading, but SKILL.md's category map does not route §${id} to this file`);
}
for (const [file, specIds] of specModuleCategories) {
  const headerIds = moduleHeaderCategories.get(file) || new Set();
  for (const id of specIds) if (!headerIds.has(id)) errors.push(`SKILL.md's category map routes §${id} to ${file}, but no "§${id}." heading exists there`);
}

// Numbered-category count, derived rather than hand-maintained. A category is "numbered" per the
// spec's own counting rule (SKILL.md: lettered sub-sections count under their parent, not
// separately) — its body opens with a level-2 "## §<LETTER><DIGITS>." heading with NO trailing
// lowercase letter directly on the digits (a lettered sub-section's heading, wherever it is a
// level-2 heading rather than nested under its parent as level-3, carries that trailing letter and
// is correctly excluded here). v0.6.0 added §C12 and updated SKILL.md's own count in one place
// but left four other live mentions on the old number — this check computes the number once and
// requires every stated occurrence to agree with it, rather than trusting five hand edits to stay
// in sync on every future release.
const numberedCategoryIds = new Set();
for (const file of relativeFiles(canonicalSkill).filter((f) => f.endsWith('.md') && f !== 'SKILL.md' && !f.startsWith('references' + path.sep))) {
  const body = fs.readFileSync(path.join(canonicalSkill, file), 'utf8');
  const lines = splitGfmLines(body);
  const fenceMask = buildFenceMask(lines);
  for (let i = 0; i < lines.length; i += 1) {
    if (!fenceMask[i]) {
      const match = lines[i].match(/^## §([A-Z]\d+)\.\s/);
      if (match) numberedCategoryIds.add(match[1]);
    }
  }
}
const numberedCategoryCount = numberedCategoryIds.size;
const NUMBER_WORDS_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const NUMBER_WORDS_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberToWords(n) {
  if (n < 20) return NUMBER_WORDS_ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? NUMBER_WORDS_TENS[tens] : `${NUMBER_WORDS_TENS[tens]}-${NUMBER_WORDS_ONES[ones]}`;
}
if (numberedCategoryCount === 0) errors.push('numbered-category count came out as 0 — the "## §<id>." heading pattern may have changed');
const categoryCountWord = numberToWords(numberedCategoryCount);
const categoryCountMentions = [
  { file: 'package.json', pattern: new RegExp(`\\b${numberedCategoryCount} categories\\b`) },
  { file: '.claude-plugin/plugin.json', pattern: new RegExp(`\\b${numberedCategoryCount} categories\\b`) },
  { file: '.claude-plugin/marketplace.json', pattern: new RegExp(`\\b${numberedCategoryCount} categories\\b`) },
  { file: 'skill/SKILL.md', pattern: new RegExp(`\\b${categoryCountWord} categories\\b`, 'i') },
  { file: 'skill/SKILL.md', pattern: new RegExp(`~${numberedCategoryCount} categories\\b`) },
  { file: 'skill/SKILL.md', pattern: new RegExp(`\\ball ${numberedCategoryCount} categories\\b`) },
  { file: 'README.md', pattern: new RegExp(`Numbered categories now \\*\\*${numberedCategoryCount}\\*\\*`) },
];
for (const mention of categoryCountMentions) {
  const text = fs.readFileSync(path.join(root, mention.file), 'utf8');
  if (!mention.pattern.test(text)) errors.push(`${mention.file}: does not state the current numbered-category count (${numberedCategoryCount}, "${categoryCountWord}") where expected (pattern: ${mention.pattern}) — count is derived from "## §<id>." headers across skill/*.md, not hand-maintained`);
}

// The expected-phrase loop above only proves the CURRENT count is stated where required — it is
// blind to an ADDITIONAL stale mention coexisting in the same file: "contains 58 categories" can
// sit right next to correct "59 categories" phrases and stay green. Scan those same files for
// every "<number> categories" mention and reject any whose number is not the current derived
// count — digits generically, plus English-word forms ("fifty-nine categories", the style
// SKILL.md spells its count in), matched from the same word tables and decoded with wordsToNumber.
// The word form exempts "…categories below": it scopes the number to the subset enumerated after
// it (tier sections state counts like "twenty-nine categories below"), never to the spec's total.
function wordsToNumber(words) {
  const [tens, ones] = words.toLowerCase().split('-');
  if (ones === undefined) {
    const tensIndex = NUMBER_WORDS_TENS.indexOf(tens);
    return tensIndex >= 0 ? tensIndex * 10 : NUMBER_WORDS_ONES.indexOf(tens);
  }
  return NUMBER_WORDS_TENS.indexOf(tens) * 10 + NUMBER_WORDS_ONES.indexOf(ones);
}
const numberWordAlternation = [...NUMBER_WORDS_TENS.filter(Boolean), ...NUMBER_WORDS_ONES].join('|');
const staleCategoryCountPatterns = [
  { pattern: /\b(\d+)\s+categories\b/gi, stated: (m) => Number.parseInt(m[1], 10) },
  { pattern: new RegExp(`\\b((?:${numberWordAlternation})(?:-(?:${numberWordAlternation}))?)\\s+categories\\b(?!\\s+below\\b)`, 'gi'), stated: (m) => wordsToNumber(m[1]) },
];
const categoryCountFileTexts = new Map();
for (const file of new Set(categoryCountMentions.map((mention) => mention.file))) {
  const fileText = fs.readFileSync(path.join(root, file), 'utf8');
  // README.md is not a current-state-only file like the others here: its "## Status" section is
  // a running changelog that legitimately restates each PAST release's own category count at the
  // time it shipped ("56 categories", "58 categories", ...), and its intro prose cites an
  // unrelated "two categories" classification from a third-party benchmark (Rust-SWE-Bench) that
  // has nothing to do with this spec's numbered-category count. Neither is staleness. Cap the
  // scan to the top banner paragraph — the one place README.md asserts the CURRENT count — so
  // accurate history and unrelated prose can't be mistaken for a stale mention.
  const bannerText = file === 'README.md' ? (fileText.split('# rust-intel')[1] || '').split('## What this is')[0] : fileText;
  // Strip Markdown emphasis/code delimiters before matching: "**58**"/"__58__"/"*58*"/"_58_"/
  // "`58`" categories all have wrapper characters sitting between the digit and the required
  // whitespace, which the `\d+\s+categories` pattern below cannot cross — an emphasized or
  // code-formatted stale count would otherwise slip past silently. None of `*`, `_`, or `` ` ``
  // carries meaning for this check either way, so stripping them never hides a genuine mismatch.
  const scanText = bannerText.replace(/[*_`]/g, '');
  categoryCountFileTexts.set(file, scanText);
}
for (const [file, text] of categoryCountFileTexts) {
  for (const { pattern, stated } of staleCategoryCountPatterns) {
    for (const m of text.matchAll(pattern)) {
      const statedCount = stated(m);
      if (statedCount !== numberedCategoryCount) errors.push(`${file}: states numbered-category count ${statedCount} ("${m[0]}") alongside the current count (${numberedCategoryCount}, "${categoryCountWord}") — count is derived from "## §<id>." headers across skill/*.md, not hand-maintained`);
    }
  }
}

// The repository owns exactly two top-level trigger tables. This is deliberately a small
// contract: it requires the canonical anchors and raw-column-1 pipes, rather than pretending
// to be a complete GFM table parser.  A missing first pipe is still located and diagnosed.
function trimGfmTableSpace(text) {
  return text.replace(/^[ \t\v\f]+|[ \t\v\f]+$/g, '');
}
function isAsciiPunctuation(character) {
  return character.length === 1 && /[!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~]/.test(character);
}
function isEscapedChar(text, index) {
  if (!isAsciiPunctuation(text[index])) return false;
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}
function splitTableCells(text) {
  const cells = [];
  let cell = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '|' && isEscapedChar(text, i)) {
      if (cell.endsWith('\\')) cell = cell.slice(0, -1);
      cell += '|';
    } else if (text[i] === '|') {
      cells.push(trimGfmTableSpace(cell));
      cell = '';
    } else cell += text[i];
  }
  if (trimGfmTableSpace(cell) !== '') cells.push(trimGfmTableSpace(cell));
  return cells;
}
function contractRow(line) {
  const rawLeadingPipe = line.startsWith('|');
  return { rawLeadingPipe, cells: splitTableCells(rawLeadingPipe ? line.slice(1) : line) };
}
function isDelimiterCells(cells, width) {
  return cells.length === width && cells.every((cell) => /^:?-+:?$/.test(cell));
}
function codeSpanTokens(text, onOutside, onSpan) {
  // Pair raw maximal runs once. Backslash escaping only suppresses an opener outside a span;
  // an escaped first tick also exposes the remaining suffix as an opener candidate. A closer
  // inside an accepted span is always the full raw run, even when preceded by a backslash.
  // Every loop charges a bounded budget: if this scanner is accidentally changed to rescan
  // already-consumed input, validation fails loudly instead of becoming a quadratic hang.
  const operationLimit = 128 + text.length * 64;
  let operations = 0;
  const charge = () => {
    operations += 1;
    if (operations > operationLimit) throw new Error('codeSpanTokens exceeded its linear operation budget');
  };
  const runs = [];
  for (let i = 0; i < text.length;) {
    charge();
    if (text[i] !== '`') { i += 1; continue; }
    const start = i;
    while (text[i] === '`') { charge(); i += 1; }
    const length = i - start;
    const escapedFirst = isEscapedChar(text, start);
    runs.push({ start, length, openerAllowed: !escapedFirst, closerAllowed: true });
    if (escapedFirst && length > 1) {
      runs.push({ start: start + 1, length: length - 1, openerAllowed: true, closerAllowed: false });
    }
  }
  // Find the next equal *raw* run for every opener candidate, including a synthetic suffix
  // after an escaped first tick. A candidate's closer lookup is independent of whether the
  // candidate itself may register as a future closer; only closerAllowed controls registration.
  const nextByLength = new Map();
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    charge();
    runs[i].nextCloser = nextByLength.get(runs[i].length) ?? -1;
    if (runs[i].closerAllowed) nextByLength.set(runs[i].length, i);
  }
  const tokens = [];
  let runIndex = 0;
  for (let i = 0; i < text.length;) {
    charge();
    if (text[i] === '\\' && i + 1 < text.length && isAsciiPunctuation(text[i + 1])) {
      i += 2;
      continue;
    }
    while (runIndex < runs.length && runs[runIndex].start < i) { charge(); runIndex += 1; }
    if (runIndex < runs.length && runs[runIndex].start === i) {
      const opener = runs[runIndex];
      const closerIndex = opener.nextCloser;
      if (opener.openerAllowed && closerIndex >= 0) {
        const closer = runs[closerIndex];
        let content = text.slice(i + opener.length, closer.start).replace(/\r\n?|\n/g, ' ');
        if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && /[^ ]/.test(content)) content = content.slice(1, -1);
        tokens.push(content);
        if (onSpan) onSpan(i, closer.start + closer.length);
        i = closer.start + closer.length;
        while (runIndex < runs.length && runs[runIndex].start < i) { charge(); runIndex += 1; }
        continue;
      }
      i += opener.length;
      continue;
    }
    if (text[i] !== '`') {
      charge();
      if (onOutside) onOutside(text[i], i, text);
      i += 1;
      continue;
    }
    i += 1;
  }
  return tokens;
}
function codeSpanSignatures(cells) {
  const tokens = codeSpanTokens(cells[0] || '');
  const unique = [...new Set(tokens)].sort();
  return { tokens: unique, key: JSON.stringify(unique), display: unique.join(' + ') };
}
function unsupportedFirstCellSyntax(text) {
  // Pattern cells intentionally accept plain text and inline code only; GFM link/autolink
  // grammar is rejected (rather than partially emulated) outside accepted code spans.
  let reason = null;
  const outside = Array(text.length).fill('\0');
  codeSpanTokens(text, (character, index, full) => {
    outside[index] = character;
    if (reason) return;
    if (character === '<') reason = 'raw inline HTML/angle-leading construct';
    else if (character === '[' || (character === '!' && full[index + 1] === '[')) reason = 'link/image/reference';
  });
  if (!reason) {
    const plain = outside.join('');
    if (/(?:^|\0|[^\w])(?:https?:\/\/|mailto:|xmpp:)[^\s<>\0]+/i.test(plain)
      || /(?:^|\0|[^\w])www\.[^\s<>\0]+/i.test(plain)
      || /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+\b/.test(plain)) reason = 'URI/email-like token';
  }
  return reason;
}
const tableContracts = [
  { name: 'prompt-trigger', anchor: ['User request contains...', 'Activates category', 'Specific risk'], width: 3, endMarker: '**Triggered by code, not phrase**' },
  { name: 'code-pattern', anchor: ['Code pattern in user input', 'Activates'], width: 2, endMarker: 'When two or more triggers fire in one request' },
];
const contractRanges = [];
let searchFrom = 0;
for (const contract of tableContracts) {
  const headerMatches = [];
  for (let i = 0; i < skillSource.length; i += 1) {
    if (tableFenceMask[i]) continue;
    const row = contractRow(skillSource[i]);
    if (row.cells.length === contract.width && row.cells.every((cell, n) => cell === contract.anchor[n])) {
      headerMatches.push(i);
    }
  }
  const headerIndex = headerMatches[0] ?? -1;
  if (headerMatches.length !== 1) errors.push(`skill/SKILL.md: ${contract.name} table header anchor must occur exactly once outside supported fences (found ${headerMatches.length})`);
  if (headerIndex >= 0 && headerIndex < searchFrom) errors.push(`skill/SKILL.md:${headerIndex + 1}: ${contract.name} table header is out of order`);
  if (headerIndex < 0) {
    errors.push(`skill/SKILL.md: missing ${contract.name} table header anchor`);
    continue;
  }
  const header = contractRow(skillSource[headerIndex]);
  if (!header.rawLeadingPipe) errors.push(`skill/SKILL.md:${headerIndex + 1}: table header row missing its leading \`|\` — repository trigger tables require raw column-1 pipes`);
  const delimiterIndex = headerIndex + 1;
  const delimiter = delimiterIndex < skillSource.length ? contractRow(skillSource[delimiterIndex]) : null;
  if (tableFenceMask[headerIndex] || tableFenceMask[delimiterIndex]) errors.push(`skill/SKILL.md:${delimiterIndex + 1}: ${contract.name} table scaffold must remain outside supported fences`);
  if (!delimiter || !isDelimiterCells(delimiter.cells, contract.width)) {
    errors.push(`skill/SKILL.md:${delimiterIndex + 1}: ${contract.name} table delimiter row has wrong width or syntax`);
  } else if (!delimiter.rawLeadingPipe) {
    errors.push(`skill/SKILL.md:${delimiterIndex + 1}: table delimiter row missing its leading \`|\` — repository trigger tables require raw column-1 pipes`);
  }
  const endMatches = skillSource.flatMap((line, i) => !tableFenceMask[i] && line.startsWith(contract.endMarker) ? [i] : []);
  if (endMatches.length !== 1) errors.push(`skill/SKILL.md: ${contract.name} table end marker must occur exactly once (found ${endMatches.length})`);
  if (endMatches.length === 1 && endMatches[0] <= delimiterIndex) errors.push(`skill/SKILL.md:${endMatches[0] + 1}: ${contract.name} table end marker must follow its delimiter and body`);
  const end = endMatches.find((index) => index > delimiterIndex) ?? skillSource.length;
  if (end < skillSource.length) {
    if (end === delimiterIndex + 1 || !/^[ \t]*$/.test(skillSource[end - 1])) errors.push(`skill/SKILL.md:${end + 1}: ${contract.name} table requires one blank separator immediately before its end marker`);
    else if (end > delimiterIndex + 2 && /^[ \t]*$/.test(skillSource[end - 2])) errors.push(`skill/SKILL.md:${end + 1}: ${contract.name} table requires exactly one blank separator immediately before its end marker`);
  }
  // Exclude the one required separator from the body span; earlier blanks remain body errors.
  const bodyEnd = end < skillSource.length && /^[ \t]*$/.test(skillSource[end - 1]) ? end - 1 : end;
  if (bodyEnd <= delimiterIndex + 1) errors.push(`skill/SKILL.md:${end + 1}: ${contract.name} table must contain at least one body row after its delimiter`);
  contractRanges.push({ contract, headerIndex, delimiterIndex, end, bodyEnd });
  searchFrom = end < skillSource.length ? end + 1 : skillSource.length;
}
const promptRange = contractRanges.find(({ contract }) => contract.name === 'prompt-trigger');
const codeRange = contractRanges.find(({ contract }) => contract.name === 'code-pattern');
if (promptRange && codeRange) {
  const promptAfter = promptRange.end + 1;
  if (!/^[ \t]*$/.test(skillSource[promptAfter] || '') || codeRange.headerIndex !== promptAfter + 1) {
    errors.push(`skill/SKILL.md:${promptRange.end + 1}: prompt end marker must be followed by exactly one blank line and the canonical code-pattern header`);
  }
}
if (codeRange) {
  const codeAfter = codeRange.end + 1;
  if (!/^[ \t]*$/.test(skillSource[codeAfter] || '')
    || skillSource[codeAfter + 1] !== '---'
    || !/^[ \t]*$/.test(skillSource[codeAfter + 2] || '')
    || categoryMapIndex !== codeAfter + 3) {
    errors.push(`skill/SKILL.md:${codeRange.end + 1}: code-pattern end marker must be followed by exactly one blank line, ---, one blank line, and the unique Category map anchor`);
  }
}
for (const range of contractRanges) {
  const { contract, delimiterIndex, bodyEnd } = range;
  const seen = new Map();
  for (let i = delimiterIndex + 1; i < bodyEnd; i += 1) {
    const line = skillSource[i];
    if (tableFenceMask[i]) {
      errors.push(`skill/SKILL.md:${i + 1}: ${contract.name} table scaffold row lies inside a supported fence`);
      continue;
    }
    if (/^[ \t]*$/.test(line)) {
      errors.push(`skill/SKILL.md:${i + 1}: unexpected blank line inside ${contract.name} table body; only the end-marker separator may be blank`);
      continue;
    }
    const row = contractRow(line);
    // In a known table span, every nonblank line is a body row. This catches a row that lost
    // even its last pipe instead of silently treating it as section prose.
    if (row.cells.length !== contract.width) {
      errors.push(`skill/SKILL.md:${i + 1}: ${contract.name} table body row has ${row.cells.length} cells; expected ${contract.width}`);
      continue;
    }
    if (!row.rawLeadingPipe) {
      errors.push(`skill/SKILL.md:${i + 1}: table row missing its leading \`|\` — repository trigger tables require raw column-1 pipes`);
      continue;
    }
    if (contract.name !== 'code-pattern') continue;
    const unsupported = unsupportedFirstCellSyntax(row.cells[0]);
    if (unsupported) errors.push(`skill/SKILL.md:${i + 1}: unsupported ${unsupported} syntax in code-pattern table first cell; use plain text or inline code`);
    const signature = codeSpanSignatures(row.cells);
    if (signature.key === '[]') continue;
    if (!seen.has(signature.key)) seen.set(signature.key, { display: signature.display, lines: [] });
    seen.get(signature.key).lines.push(i + 1);
  }
  for (const entry of seen.values()) if (entry.lines.length > 1) errors.push(`skill/SKILL.md: duplicate code-pattern trigger rows for [${entry.display}] at lines ${entry.lines.join(', ')}`);
}

// Regression cases for the SemVer check itself — a loose regex here would silently let a
// malformed release tag through the gate that is supposed to catch it.
const semverGood = ['0.5.0', '1.2.3', '1.2.3-alpha', '1.2.3-alpha.1', '1.2.3-0.3.7', '1.2.3+build.1', '1.2.3-beta+exp.sha.5114f85'];
const semverBad = ['01.2.3', '1.02.3', '1.2.3-alpha.01', '1.2.3-alpha..1', '1.2.3-', '1.2', 'v1.2.3', '1.2.3.4'];
for (const v of semverGood) if (!isValidSemver(v)) errors.push(`semver self-check: "${v}" should be valid but isValidSemver rejected it`);
for (const v of semverBad) if (isValidSemver(v)) errors.push(`semver self-check: "${v}" should be invalid but isValidSemver accepted it`);

const plugin = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const claudePlugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const allowedPluginFields = new Set(['id', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'skills', 'apps', 'mcpServers', 'hooks', 'interface']);
for (const field of Object.keys(plugin)) if (!allowedPluginFields.has(field)) errors.push(`unsupported Codex plugin field: ${field}`);
for (const field of ['name', 'version', 'description']) if (typeof plugin[field] !== 'string' || !plugin[field].trim()) errors.push(`Codex plugin field ${field} must be a non-empty string`);
if (!isValidSemver(plugin.version || '')) errors.push('Codex plugin version must be strict semver');
if (!plugin.author || typeof plugin.author.name !== 'string' || !plugin.author.name.trim()) errors.push('Codex plugin author.name is required');
if (plugin.author && Object.keys(plugin.author).some((field) => !['name', 'email', 'url'].includes(field))) errors.push('Codex plugin author contains unsupported fields');
if (plugin.skills !== './skills/') errors.push('Codex manifest must point skills at ./skills/');
for (const field of ['skills', 'mcpServers', 'apps', 'hooks']) if (plugin[field] !== undefined && (typeof plugin[field] !== 'string' || !plugin[field].startsWith('./') || plugin[field].includes('..'))) errors.push(`Codex plugin ${field} must be a relative ./ path without parent traversal`);
const requiredInterfaceStrings = ['displayName', 'shortDescription', 'longDescription', 'developerName'];
const allowedInterfaceFields = new Set([...requiredInterfaceStrings, 'category', 'capabilities', 'websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL', 'brandColor', 'brandColorDark', 'composerIcon', 'logo', 'logoDark', 'screenshots', 'defaultPrompt', 'default_prompt']);
const interfaceLimits = { displayName: 80, shortDescription: 240, longDescription: 4000, developerName: 120 };
const categories = new Set(['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations', 'Data & Analytics', 'Communication', 'Education & Research', 'Security', 'Finance', 'Healthcare', 'Travel', 'Entertainment', 'Other']);
if (!plugin.interface || typeof plugin.interface !== 'object' || Array.isArray(plugin.interface)) errors.push('Codex plugin interface must be an object');
if (plugin.interface) for (const field of Object.keys(plugin.interface)) if (!allowedInterfaceFields.has(field)) errors.push(`unsupported Codex plugin interface field: ${field}`);
for (const field of requiredInterfaceStrings) if (!plugin.interface || typeof plugin.interface[field] !== 'string' || !plugin.interface[field].trim()) errors.push(`Codex plugin interface.${field} is required`);
for (const [field, limit] of Object.entries(interfaceLimits)) if (typeof plugin.interface?.[field] === 'string' && plugin.interface[field].length > limit) errors.push(`Codex plugin interface.${field} exceeds ${limit} characters`);
if (plugin.interface?.shortDescription?.includes('\n')) errors.push('Codex plugin interface.shortDescription must fit on one line');
if (plugin.interface?.category && !categories.has(plugin.interface.category)) errors.push('Codex plugin interface.category is not a supported category');
if (plugin.interface?.capabilities !== undefined && (!Array.isArray(plugin.interface.capabilities) || plugin.interface.capabilities.length > 20 || !plugin.interface.capabilities.every((item) => typeof item === 'string' && item.trim() && item.length <= 120))) errors.push('Codex plugin interface.capabilities must contain at most 20 non-empty strings of at most 120 characters');
const defaultPromptValue = plugin.interface && (plugin.interface.defaultPrompt || plugin.interface.default_prompt);
const defaultPrompts = typeof defaultPromptValue === 'string' ? [defaultPromptValue] : defaultPromptValue;
if (defaultPromptValue !== undefined && (!Array.isArray(defaultPrompts) || defaultPrompts.length < 1 || defaultPrompts.length > 3 || !defaultPrompts.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 512 && !item.includes('\n')))) errors.push('Codex plugin interface.defaultPrompt must be a string or contain at most 3 one-line strings of at most 512 characters');
for (const field of ['brandColor', 'brandColorDark']) if (plugin.interface?.[field] !== undefined && (typeof plugin.interface[field] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(plugin.interface[field]))) errors.push(`Codex plugin interface.${field} must be a six-digit hex color`);
for (const [holder, fields] of [[plugin, ['homepage', 'repository']], [plugin.author || {}, ['url']], [plugin.interface || {}, ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']]]) {
  for (const field of fields) if (holder[field] !== undefined && (typeof holder[field] !== 'string' || !holder[field].startsWith('https://') || holder[field].length > 2048)) errors.push(`Codex plugin ${field} must be an absolute HTTPS URL of at most 2048 characters`);
}
if (plugin.keywords !== undefined && (!Array.isArray(plugin.keywords) || !plugin.keywords.every((item) => typeof item === 'string' && item.trim()))) errors.push('Codex plugin keywords must be an array of non-empty strings');
if (plugin.apps !== undefined && !fs.existsSync(path.join(root, '.app.json'))) errors.push('Codex plugin declares apps without .app.json');
if (typeof plugin.mcpServers === 'string' && !fs.existsSync(path.join(root, '.mcp.json'))) errors.push('Codex plugin declares mcpServers without .mcp.json');
if (plugin.version !== packageJson.version || plugin.version !== claudePlugin.version) errors.push(`version mismatch: Codex=${plugin.version}, npm=${packageJson.version}, Claude=${claudePlugin.version}`);

// Pin the whole `required: [...]` literals, not just the property names: the realistic regression
// is a field quietly dropping out of `required` (which makes it optional for the structured-output
// agent, so the axis vanishes from real reports) while every property definition stays in place.
for (const token of [
  'artifactsReviewed', 'sourceFilesReviewed', 'docsReviewed',
  'missingArtifacts', 'missingUnitInputs', 'noSourceEvidence', 'invalidSourceEvidence', 'orchestrationComplete',
  'reachedFrom', 'whyUnreachable',
  "enum: ['pattern', 'traced', 'proven']",
  "required: ['category', 'tier', 'severity', 'location', 'citation', 'evidence', 'reachedFrom', 'why', 'fix']",
  "required: ['module', 'label', 'findings', 'unreachable', 'redInventory', 'artifactsReviewed', 'sourceFilesReviewed', 'docsReviewed', 'summary']",
  "required: ['category', 'location', 'whyUnreachable']",
  "required: ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts', 'ffi']",
]) {
  if (!workflow.includes(token)) errors.push(`workflow coverage contract is missing ${token}`);
}

// The serial /rust-cc-audit command is a second, independent path with the same vocabulary and no
// mirror check of its own. Pin the shared terms so the two paths cannot drift apart on wording.
const auditCommand = fs.readFileSync(path.join(root, 'commands/rust-intel-cc/audit.md'), 'utf8');
for (const token of ['`pattern`', '`traced`', '`proven`', 'Unreachable matches', 'Reached from']) {
  if (!auditCommand.includes(token)) errors.push(`commands/rust-intel-cc/audit.md is missing the evidence-axis term ${token}`);
}

const canonicalFiles = relativeFiles(canonicalSkill);
const codexFiles = relativeFiles(codexSkill);
if (JSON.stringify(canonicalFiles) !== JSON.stringify(codexFiles)) errors.push('Codex skill mirror file list is out of sync with skill/');
for (const rel of canonicalFiles) {
  if (fs.readFileSync(path.join(canonicalSkill, rel), 'utf8') !== fs.readFileSync(path.join(codexSkill, rel), 'utf8')) errors.push(`Codex skill mirror is out of sync: ${rel}`);
}

// Project markdown permits only standalone fences with 0–3 literal leading spaces. Container
// syntax is intentionally unsupported here: repeated/mixed simple list and blockquote prefixes
// are stripped lexically only to diagnose a fence or angle-leading remainder, never parsed.
function stripSimpleContainerChain(line) {
  let text = line;
  let hadContainer = false;
  while (true) {
    const quote = text.match(/^ {0,3}>[ \t]{0,3}/);
    if (quote) {
      text = text.slice(quote[0].length);
      hadContainer = true;
      continue;
    }
    const list = text.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/);
    if (!list) break;
    const padding = text.slice(list[0].length).match(/^[ \t]*/)[0];
    text = text.slice(list[0].length + padding.length);
    hadContainer = true;
  }
  return { text, hadContainer };
}
function unsupportedContainerFence(line) {
  const remainder = stripSimpleContainerChain(line);
  return remainder.hadContainer && projectFenceOpener(remainder.text) !== null;
}
function angleLeadingStyle(line) {
  const remainder = stripSimpleContainerChain(line);
  return /^ {0,3}</.test(line) || (remainder.hadContainer && /^</.test(remainder.text));
}
for (const file of markdownFiles) {
  const source = fs.readFileSync(file, 'utf8');
  let fence = null;
  splitGfmLines(source).forEach((line, i) => {
    if (fence) {
      if (projectFenceCloser(line, fence)) fence = null;
      return;
    }
    if (unsupportedContainerFence(line)) {
      errors.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}: unsupported container-prefixed fence; use a standalone fence with 0–3 leading spaces`);
    } else if (angleLeadingStyle(line)) {
      errors.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}: unsupported angle-bracket-leading/raw-HTML-style line in tracked skill markdown`);
    } else {
      const opener = projectFenceOpener(line);
      if (opener) {
        opener.openedAt = i + 1;
        fence = opener;
        return;
      }
      if (line.includes('\\"')) errors.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}: literal \\" escape outside a fenced code block — JSON-style escape leaked into rule text`);
    }
  });
  if (fence) errors.push(`${path.relative(root, file).split(path.sep).join('/')}:${fence.openedAt}: unclosed project fence at end of file`);
}

function runNodeProbe(args, timeoutMs) {
  try {
    const result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    });
    const normalize = (value) => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
    const stdout = normalize(result.stdout);
    const stderr = normalize(result.stderr);
    return {
      error: result.error || null,
      signal: result.signal || null,
      status: Number.isInteger(result.status) ? result.status : null,
      stdout,
      stderr,
      output: [stderr, stdout].filter(Boolean).join('\n'),
    };
  } catch (error) {
    return { error, signal: null, status: null, stdout: '', stderr: '', output: '' };
  }
}

function probeDiagnostic(probe) {
  const details = [];
  if (probe.error) details.push(`error=${probe.error.message}`);
  if (probe.signal) details.push(`signal=${probe.signal}`);
  if (probe.status === null) details.push('status=null');
  else details.push(`status=${probe.status}`);
  if (probe.output) details.push(`output=${probe.output}`);
  return details.join('; ');
}

function assertProbeCompleted(label, probe) {
  if (probe.error) {
    errors.push(`${label} failed to start or timed out: ${probeDiagnostic(probe)}`);
    return false;
  }
  if (probe.signal) {
    errors.push(`${label} was terminated by a signal: ${probeDiagnostic(probe)}`);
    return false;
  }
  if (probe.status === null) {
    errors.push(`${label} returned no exit status: ${probeDiagnostic(probe)}`);
    return false;
  }
  return true;
}

// RUST_INTEL_SKIP_NESTED_FIXTURES breaks a self-spawn cycle: validate-fixtures.mjs's README.md
// negative control spawns this script against a deliberately mutated repo state to prove the
// category-count check fails — and this script would otherwise spawn validate-fixtures.mjs right
// back, which runs that same negative control again, spawning this script again, without end.
if (!process.env.RUST_INTEL_SKIP_NESTED_FIXTURES) {
  const fixtureTimeoutMs = 120_000;
  const fixtureRun = runNodeProbe([path.join(root, 'dev/validate-fixtures.mjs')], fixtureTimeoutMs);
  const fixtureOutput = fixtureRun.output;
  if (fixtureRun.error) {
    errors.push(`fixture validation failed to start or timed out after ${fixtureTimeoutMs}ms: ${fixtureRun.error.message}${fixtureOutput ? ` (${fixtureOutput})` : ''}`);
  } else if (fixtureRun.status === null || fixtureRun.status !== 0) {
    const termination = fixtureRun.signal ? ` (terminated by ${fixtureRun.signal})` : '';
    errors.push(`fixture validation failed${termination}: ${fixtureOutput || `exit status ${fixtureRun.status ?? 'unknown'}`}`);
  }
}
const probeTimeoutMs = 120_000;
const invalidCli = runNodeProbe([path.join(root, 'bin/install-codex.js'), '--user-dir', '--uninstall'], probeTimeoutMs);
if (assertProbeCompleted('Codex installer missing --user-dir probe', invalidCli)
  && (invalidCli.status === 0 || !invalidCli.stderr.includes('--user-dir requires a path'))) {
  errors.push(`Codex installer accepted a missing --user-dir value: ${probeDiagnostic(invalidCli)}`);
}
const duplicateCli = runNodeProbe([path.join(root, 'bin/install-codex.js'), '--user-dir', 'one', '--user-dir', 'two'], probeTimeoutMs);
if (assertProbeCompleted('Codex installer duplicate --user-dir probe', duplicateCli)
  && (duplicateCli.status === 0 || !duplicateCli.stderr.includes('--user-dir may be specified only once'))) {
  errors.push(`Codex installer accepted duplicate --user-dir arguments: ${probeDiagnostic(duplicateCli)}`);
}
const helpCli = runNodeProbe([path.join(root, 'bin/install-codex.js'), '--help'], probeTimeoutMs);
if (assertProbeCompleted('Codex installer --help probe', helpCli) && helpCli.status !== 0) {
  errors.push(`Codex installer --help failed: ${probeDiagnostic(helpCli)}`);
}

if (errors.length) {
  console.error(errors.map((e) => `ERROR: ${e}`).join('\n'));
  process.exit(1);
}
console.log(`rust-intel validation passed (${markdownFiles.length} skill markdown files checked)`);
