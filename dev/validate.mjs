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
for (const module of ['async.md', 'concurrency-and-state.md', 'data-and-types.md', 'security.md', 'unsafe-and-ffi.md', 'drop-and-raii.md', 'deps-macros-ergonomics.md', 'lifetimes-and-api.md', 'testing.md', 'semantics-and-conformance.md']) {
  if (!workflow.includes(`file: '${module}'`)) errors.push(`workflow missing module: ${module}`);
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
const skillMdText = fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8');
const categoryMapSection = skillMdText.split('# Category map — which module holds each §')[1];
const categoryMapTable = categoryMapSection ? categoryMapSection.split('**Cross-reference note:**')[0] : '';
const specModuleCategories = new Map();
for (const row of categoryMapTable.matchAll(/^\|\s*(§[^|]+?)\s*\|\s*`([^`]+)`\s*\|$/gm)) {
  const [, cell, file] = row;
  if (!specModuleCategories.has(file)) specModuleCategories.set(file, new Set());
  for (const id of expandCategoryCell(cell)) specModuleCategories.get(file).add(id);
}
if (specModuleCategories.size === 0) errors.push('category-map parity check found zero rows in SKILL.md — the table anchor text may have moved');
const workflowModuleCategories = new Map();
for (const entry of workflow.matchAll(/\{\s*file:\s*'([^']+)',\s*categories:\s*\[([^\]]*)\]\s*\}/g)) {
  const [, file, list] = entry;
  workflowModuleCategories.set(file, new Set(list.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)));
}
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
  const ids = new Set();
  for (const m of body.matchAll(/^#{2,3} §([A-Z]\d+[a-z]*)\.\s/gm)) ids.add(m[1]);
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
  for (const m of body.matchAll(/^## §([A-Z]\d+)\.\s/gm)) numberedCategoryIds.add(m[1]);
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

// Duplicate trigger rows. Two rows in the same table that key off the SAME set of inline-code
// tokens are the same rule stated twice — the drift that creeps in when independently-written
// releases each add a row for a pattern the other already covered. Compared per contiguous table
// block so the phrase table and the code-pattern table never collide with each other.
//
// Markdown table cells escape a literal pipe as `\|` — including inside inline code, since
// backticks do NOT protect table-cell delimiters in GFM. A naive `split('|')` truncates a cell
// like `` `std::thread::scope(\|s\| ...)` `` at the first escaped pipe. Split respecting the
// escape instead, then unescape `\|` back to `|` before extracting inline-code spans.
// cmark-gfm's table scanner calls only ASCII space, tab, vertical tab, and form feed
// spacechar. Keep this separate from String.prototype.trim(), whose Unicode-wide behavior
// would incorrectly discard content such as a non-breaking space around a delimiter marker.
function trimGfmTableSpace(text) {
  return text.replace(/^[ \t\v\f]+|[ \t\v\f]+$/g, '');
}
function splitGfmLines(source) {
  // Markdown parsers normalize CRLF and lone CR before block scanning.  Do the same here so
  // line-oriented predicates (especially fence closers) do not depend on the checkout's EOL.
  return source.replace(/\r\n?/g, '\n').split('\n');
}
function isAsciiPunctuation(character) {
  return character.length === 1 && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(character);
}
function isEscapedChar(text, index) {
  if (!isAsciiPunctuation(text[index])) return false;
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}
function splitTableCells(text) {
  const cells = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '|' && isEscapedChar(text, i)) {
      // A backslash escapes one ASCII punctuation character.  Remove that escape slash while
      // retaining any preceding slashes: `\|` is content, `\\|` is a delimiter, and the same
      // odd/even rule applies to longer runs.
      if (current.endsWith('\\')) current = current.slice(0, -1);
      current += '|';
    } else if (text[i] === '|') {
      cells.push(current);
      current = '';
    } else {
      current += text[i];
    }
  }
  if (trimGfmTableSpace(current) !== '') cells.push(current);
  return cells;
}
function tableRowView(line, paragraphContinuation = false) {
  // A paragraph's first line permits only three spaces of indentation. Once a paragraph is
  // already open, cmark strips the full leading space/tab prefix from continuation lines (an
  // indented-code-looking line cannot interrupt that paragraph). Keep those two parser views
  // distinct; the raw first column is still used for this project's leading-pipe convention.
  const indent = (paragraphContinuation ? line.match(/^[ \t]*/) : line.match(/^ {0,3}/))[0].length;
  const parserLeadingPipe = line[indent] === '|';
  const text = line.slice(indent + (parserLeadingPipe ? 1 : 0));
  const cells = splitTableCells(text).map(trimGfmTableSpace);
  return {
    cells,
    parserLeadingPipe,
    // GFM permits 0–3 spaces before the optional outer pipe.  The project's convention is
    // intentionally stricter: it checks the raw first column, hence `   | a | b |` is diagnosed.
    rawLeadingPipe: line.startsWith('|'),
  };
}
const skillSource = splitGfmLines(fs.readFileSync(path.join(root, 'skill/SKILL.md'), 'utf8'));
let tableBlock = new Map();
// Four-state table machine: 'none' -> 'header' (a row that could be a table header is pending,
// waiting for the delimiter row that confirms a real table) -> 'body'. The old two-variable
// state (inTable/tableColumns) was set only once a pipe-prefixed row existed, so a pipe-less
// header row (inTable still false) and a pipe-less delimiter row (tableColumns still 0) both
// escaped detection; the delimiter row must also match the header's cell count or GFM
// recognizes no table at all — that fact needs an explicit pending-header state.
// 'rejected' is the TABLE_VISITED state: a width-mismatched paragraph cannot promote a later
// delimiter until a real paragraph boundary.
let tableState = 'none';
let headerHadPipe = false;
let headerCells = 0;
let headerLine = 0; // 1-based line of the pending header candidate — errors about IT must cite this, not the confirming delimiter's line
function flushTableBlock() {
  for (const entry of tableBlock.values()) {
    if (entry.lines.length > 1) errors.push(`skill/SKILL.md: duplicate code-pattern trigger rows for [${entry.display}] at lines ${entry.lines.join(', ')}`);
  }
  tableBlock = new Map();
  tableState = 'none';
  headerHadPipe = false;
  headerCells = 0;
  headerLine = 0;
}
function inlineMarkupEnd(text, start) {
  const rest = text.slice(start);
  for (const [open, close] of [['<!--', '-->'], ['<?', '?>'], ['<![CDATA[', ']]>']]) {
    if (rest.startsWith(open)) {
      const end = rest.indexOf(close, open.length);
      return end < 0 ? null : start + end + close.length;
    }
  }
  if (/^<![A-Z]/.test(rest)) {
    const end = rest.indexOf('>');
    return end < 0 ? null : start + end + 1;
  }
  const close = rest.match(htmlCloseTag);
  if (close) return start + close[0].length;
  const open = rest.match(htmlOpenTag);
  if (open) {
    // `<T as Trait>` / `<T where U>` are Rust generic prose, not inline HTML tags. Keep this
    // narrow guard so
    // valid lowercase HTML attributes/tags still take precedence.
    const tagName = open[0].match(/^<([A-Za-z][A-Za-z0-9-]*)/)[1];
    if (!(tagName.length === 1 && /\b(?:as|where)\b/.test(open[0]))) return start + open[0].length;
  }
  const uri = rest.match(/^<([A-Za-z][A-Za-z0-9+.-]{1,31}):[^ <>]*>/);
  if (uri) return start + uri[0].length;
  const email = rest.match(/^<[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*>/);
  return email ? start + email[0].length : null;
}
function codeSpanSignatures(cells) {
  const text = cells[0] || '';
  const signatures = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && i + 1 < text.length && isAsciiPunctuation(text[i + 1])) {
      i += 2;
      continue;
    }
    if (text[i] === '<') {
      const markupEnd = inlineMarkupEnd(text, i);
      if (markupEnd !== null) {
        i = markupEnd;
        continue;
      }
    }
    if (text[i] !== '`') {
      i += 1;
      continue;
    }
    let runLength = 1;
    while (text[i + runLength] === '`') runLength += 1;
    let cursor = i + runLength;
    let content = null;
    let spanEnd = i + runLength;
    while (cursor < text.length) {
      if (text[cursor] !== '`') {
        cursor += 1;
        continue;
      }
      let closeLength = 1;
      while (text[cursor + closeLength] === '`') closeLength += 1;
      if (closeLength === runLength) {
        // CommonMark normalizes only line endings here; interior spaces (and tabs) are
        // significant in a code span.  The one-space edge trim below is the separate
        // code-span rule and must not collapse runs of spaces.
        content = text.slice(i + runLength, cursor).replace(/\r\n?|\n/g, ' ');
        if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && /[^ ]/.test(content)) content = content.slice(1, -1);
        spanEnd = cursor + closeLength;
        break;
      }
      cursor += closeLength;
    }
    if (content !== null) {
      if (!signatures.includes(content)) signatures.push(content);
      // The closing run is consumed as part of this span.  Starting the outer scan at its
      // first backtick would otherwise rediscover the same delimiter as a new opener.
      i = spanEnd;
    } else {
      i += runLength;
    }
  }
  signatures.sort();
  return { key: JSON.stringify(signatures), display: signatures.join(' + ') };
}
function rememberSignature(signature, line) {
  if (!signature || signature.key === '[]') return;
  // The display string is intentionally human-readable, but it is not injective (`a + b`
  // could be one token or two). JSON encoding the sorted token array is the actual map key.
  if (!tableBlock.has(signature.key)) tableBlock.set(signature.key, { display: signature.display, lines: [] });
  tableBlock.get(signature.key).lines.push(line);
}
function setPendingHeader(row, line) {
  tableState = 'header';
  headerHadPipe = row.rawLeadingPipe;
  headerCells = row.cells.length;
  headerLine = line;
}
function rejectPendingParagraph() {
  tableBlock = new Map();
  tableState = 'rejected';
  headerHadPipe = false;
  headerCells = 0;
  headerLine = 0;
}
// GFM §4.10: a pipe-less row stays a row of the open table (outer pipes are optional) — the
// risk this check guards is the row escaping THIS project's leading-pipe convention and the
// duplicate-trigger scan built on it, not GFM misparsing. A blank line, or a line starting a
// heading, fence, blockquote, list, thematic break, indented code block (indent reaching
// column 4 under GFM §2.2 tab expansion: cmark-gfm opens one when the container is not a
// paragraph, finalizing the table), or HTML
// block, breaks the table instead of joining it as a row. Link reference definitions are
// deliberately absent — cmark-gfm has no such block start (definitions are pulled from
// paragraph content at finalize time; the table stays open for any line that parses as a row
// with n_columns ≥ 1), so a pipe-less '[label]:' line is a one-cell row and MUST be flagged.
// HTML starts are classified by the seven CommonMark scanners below; generic type-7 tags only
// interrupt an already-open paragraph when they are not paragraph continuations.
// Indented code: compare by effective column, not raw prefix shape — GFM §2.2 expands a tab
// to the next 4-column stop, so '  \tcode' reaches column 4 with no 4-space literal prefix.
function reachesIndentedCodeColumn(line) {
  let column = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === ' ') column += 1;
    else if (line[i] === '\t') column += 4 - (column % 4);
    else return column >= 4;
  }
  return false;
}
// Empty ATX headings ('#' through '######'), empty list items ('-', '*', '+', '1.', '1)') are
// valid block starts too: the marker may be followed by end-of-line, not only whitespace.
// A fence opener is a GFM block start only when its marker has 0-3 spaces of indentation;
// tabs are not indentation here, and a backtick fence's info string may not contain a backtick.
// Return the opener details so the escape scanner and table boundary classifier share exactly
// the same recognition predicate.
function stripBlockquotePrefixes(line) {
  let offset = 0;
  let depth = 0;
  while (true) {
    const prefix = line.slice(offset).match(/^ {0,3}>[ \t]?/);
    if (!prefix) break;
    offset += prefix[0].length;
    depth += 1;
  }
  return { text: line.slice(offset), depth };
}
function stripContainerPrefixes(line) {
  let offset = 0;
  let quoteDepth = 0;
  let listDepth = 0;
  let quoteConsumed = 0;
  let listIndent = 0;
  const listMarkers = [];
  while (true) {
    const quote = line.slice(offset).match(/^ {0,3}>[ \t]?/);
    if (quote) {
      offset += quote[0].length;
      quoteConsumed += quote[0].length;
      quoteDepth += 1;
      continue;
    }
    const list = line.slice(offset).match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/);
    if (!list) break;
    offset += list[0].length;
    offset += line.slice(offset).match(/^[ \t]*/)[0].length;
    listDepth += 1;
    listMarkers.push(list[0].trim());
    listIndent = offset - quoteConsumed;
  }
  return { text: line.slice(offset), blockquoteDepth: quoteDepth, listDepth, listIndent, listMarkers };
}
function containerViewForState(line, container) {
  // At the document root, markers such as `> ...` and `- ...` are ordinary fenced content;
  // never strip them while looking for a closer.
  if (container.blockquoteDepth === 0 && container.listDepth === 0) return { inside: true, text: line, listDepth: 0 };
  const view = stripContainerPrefixes(line);
  if (view.blockquoteDepth !== container.blockquoteDepth) return { inside: false, text: view.text };
  if (container.listDepth === 0) return { inside: true, text: view.text, listDepth: view.listDepth };
  const quote = stripBlockquotePrefixes(line);
  const leading = quote.text.match(/^[ \t]*/)[0];
  if (view.listDepth === container.listDepth && leading.length >= container.listIndent && leading.length > 0) {
    const remainder = quote.text.slice(container.listIndent);
    const nested = remainder.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/);
    if (nested) {
      const nestedText = remainder.slice(nested[0].length).replace(/^[ \t]*/, '');
      return { inside: true, text: nestedText, listDepth: container.listDepth + 1 };
    }
  }
  if (view.listDepth >= container.listDepth) {
    if (container.listMarkers.some((marker, index) => view.listMarkers[index] !== marker)) return { inside: false, text: view.text, listDepth: view.listDepth };
    return { inside: true, text: view.text, listDepth: view.listDepth };
  }
  if (quote.depth !== container.blockquoteDepth) return { inside: false, text: view.text, listDepth: view.listDepth };
  if (leading.length < container.listIndent) return { inside: false, text: quote.text, listDepth: view.listDepth };
  const remainder = quote.text.slice(container.listIndent);
  const nested = remainder.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/);
  if (nested) {
    const nestedText = remainder.slice(nested[0].length).replace(/^[ \t]*/, '');
      return { inside: true, text: nestedText, listDepth: container.listDepth + 1 };
  }
  return { inside: true, text: remainder, listDepth: container.listDepth };
}
function isFenceOpener(line) {
  const view = stripContainerPrefixes(line);
  const { text } = view;
  const run = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!run || (run[1][0] === '`' && run[2].includes('`'))) return null;
  return {
    marker: run[1][0],
    length: run[1].length,
    blockquoteDepth: view.blockquoteDepth,
    container: { blockquoteDepth: view.blockquoteDepth, listDepth: view.listDepth, listIndent: view.listIndent, listMarkers: view.listMarkers },
  };
}
function htmlLineText(line) {
  return stripContainerPrefixes(line).text;
}
const blockStartRe = /^ {0,3}(#{1,6}(?:[ \t]|$)|>|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|((-[ \t]*){3,}|(\*[ \t]*){3,}|(_[ \t]*){3,})$)/;
const blockTagNames = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const htmlOpenTag = new RegExp('^<[A-Za-z][A-Za-z0-9-]*(?:[ \\t\\v\\f]+[A-Za-z_:][A-Za-z0-9:._-]*(?:[ \\t\\v\\f]*=[ \\t\\v\\f]*(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|[^ \\t\\v\\f"\'=<>`]+))?)*[ \\t\\v\\f]*/?>');
const htmlCloseTag = /^<\/[A-Za-z][A-Za-z0-9-]*[ \t\v\f]*>/;
function htmlBlockStartType(line) {
  const text = htmlLineText(line);
  if (/^<(?:script|pre|textarea|style)(?=[ \t\v\f>]|$)/i.test(text)) return 1;
  if (text.startsWith('<!--')) return 2;
  if (text.startsWith('<?')) return 3;
  if (text.startsWith('<![CDATA[')) return 5;
  if (/^<![A-Z]/.test(text)) return 4;
  if (new RegExp(`^</?(?:${blockTagNames})(?=[ \\t\\v\\f]|/?[>]|$)`, 'i').test(text)) return 6;
  const open = text.match(htmlOpenTag) || text.match(htmlCloseTag);
  if (open && /^[ \t\f]*$/.test(text.slice(open[0].length))) return 7;
  return 0;
}
function htmlBlockEnd(line, block, content = htmlLineText(line)) {
  if (block.type === 1) {
    // cmark-gfm's type-1 end scanner accepts any of the four exact close tags; unlike the
    // opener, the closing tag is not paired to one particular element and cannot contain space.
    return /<\/(?:script|pre|style|textarea)>/i.test(content);
  }
  if (block.type === 2) return content.includes('-->');
  if (block.type === 3) return content.includes('?>');
  if (block.type === 4) return content.includes('>');
  if (block.type === 5) return content.includes(']]>');
  return /^[ \t]*$/.test(content);
}
// Delimiter row: one or more cells, each only hyphens with an optional leading/trailing colon
// (GFM §4.10). A lone '---' is a thematic break (or setext underline), never a delimiter.
function isDelimiterRow(cells) {
  return cells.length >= 1 && cells.every((cell) => /^:?-+:?$/.test(cell));
}
function orderedListStart(line) {
  const match = line.match(/^ {0,3}(\d{1,9})[.)](?:[ \t]|$)/);
  return match ? Number.parseInt(match[1], 10) : null;
}
function isBlankListItem(line) {
  return /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]*$/.test(line);
}
function isSetextUnderline(line) {
  return /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
}
function isBlockStart(line) {
  return reachesIndentedCodeColumn(line) || isFenceOpener(line) || blockStartRe.test(line) || htmlBlockStartType(line) !== 0;
}
function interruptsPendingParagraph(line) {
  // CommonMark/GFM block interruption: indented code cannot interrupt a paragraph; an ordered
  // list may do so only when it starts at 1; and an empty list item cannot interrupt one.
  if (reachesIndentedCodeColumn(line) || isBlankListItem(line)) return false;
  const start = orderedListStart(line);
  if (start !== null) return start === 1;
  return htmlBlockStartType(line) !== 7;
}
let tableFence = null;
let htmlBlock = null;
skillSource.forEach((line, index) => {
  if (tableFence) {
    const view = containerViewForState(line, tableFence.container);
    if (fenceCloser(line, tableFence)) {
      tableFence = null;
      return;
    }
    if (view.inside) return;
    // The containing list/blockquote ended. Rescan this line at the outer depth so a literal
    // escaped quote (or a new outer fence) is not swallowed as fenced content.
    tableFence = null;
  }
  if (htmlBlock) {
    const view = containerViewForState(line, htmlBlock.container);
    if (view.inside) {
      if (htmlBlockEnd(line, htmlBlock, view.text)) htmlBlock = null;
      return;
    }
    // As with fences, the line which exits the containing list/blockquote belongs to the
    // outer document and must be processed again below.
    htmlBlock = null;
  }
  const opener = isFenceOpener(line);
  if (opener) {
    flushTableBlock();
    tableFence = opener;
    return;
  }
  const htmlType = htmlBlockStartType(line);
  // Type-7 HTML starts a block only when it can interrupt the current paragraph.  A
  // rejected width-mismatch candidate is still inside that paragraph, just like a pending
  // header, so it must remain suppressed until a real paragraph boundary.
  if (htmlType && !(htmlType === 7 && (tableState === 'header' || tableState === 'rejected'))) {
    flushTableBlock();
    const context = stripContainerPrefixes(line);
    const candidate = { type: htmlType, container: { blockquoteDepth: context.blockquoteDepth, listDepth: context.listDepth, listIndent: context.listIndent, listMarkers: context.listMarkers } };
    // Types 1–5 may be complete on their opening line; only retain continuation state when
    // their exact end marker was not already present.
    htmlBlock = htmlBlockEnd(line, candidate) ? null : candidate;
    return;
  }
  const row = tableRowView(line);
  if (row.parserLeadingPipe) {
    const { cells } = row;
    let confirmedDelimiter = false;
    if (tableState === 'rejected') return;
    if (tableState === 'header' && isDelimiterRow(cells) && headerCells !== cells.length) return rejectPendingParagraph();
    if (isDelimiterRow(cells)) {
      if (tableState === 'header' && headerCells === cells.length) {
        confirmedDelimiter = true;
        if (!headerHadPipe) errors.push(`skill/SKILL.md:${headerLine}: table header row missing its leading \`|\` — project convention: every trigger-table row is written with a leading pipe (this header is confirmed by the delimiter row directly below it)`);
        tableState = 'body';
      }
      else if (tableState !== 'body') { // count mismatch with the pending piped row: that row was a paragraph, and cmark-gfm takes a table's header from the paragraph's last line — which can be this delimiter-shaped line itself, so promote it
        setPendingHeader(row, index + 1);
      }
    } else if (tableState !== 'body') {
    // A pending candidate is provisional and never enters the duplicate scan until a delimiter
    // confirms the table.
      setPendingHeader(row, index + 1);
    } else {
      rememberSignature(codeSpanSignatures(cells), index + 1);
    }
    if (!row.rawLeadingPipe && tableState === 'body') {
      if (confirmedDelimiter) errors.push(`skill/SKILL.md:${index + 1}: table delimiter row missing its leading \`|\` — project convention: the delimiter row is written with a leading pipe like every other trigger-table row`);
      else errors.push(`skill/SKILL.md:${index + 1}: table row missing its leading \`|\` — project convention: every trigger-table row is written with a leading pipe (GFM outer pipes are optional, so a pipe-less line still parses as a row of the open table; the risk is that it escapes this project's leading-pipe convention and the duplicate-trigger scan built on it)`);
      flushTableBlock();
    }
    return;
  }
  const blankLine = /^[ \t]*$/.test(line);
  // Setext underlines close a pending paragraph (including TABLE_VISITED), but are deliberately
  // not added to the generic block-start predicate for an already-confirmed table body.
  const setextBoundary = (tableState === 'header' || tableState === 'rejected') && isSetextUnderline(line);
  if (blankLine || isBlockStart(line) || setextBoundary) {
    // A block start always ends an already-open table body. In contrast, indented code and an
    // ordered list not starting at 1 (including an empty list item) cannot interrupt a pending
    // paragraph, so they replace its provisional header with the paragraph's latest line.
    if (tableState === 'rejected') {
      if (blankLine || setextBoundary || interruptsPendingParagraph(line)) flushTableBlock();
    } else if (tableState === 'body' || tableState === 'none' || blankLine || setextBoundary || interruptsPendingParagraph(line)) {
      flushTableBlock();
    } else {
      setPendingHeader(tableRowView(line, true), index + 1);
    }
    return;
  }
  if (tableState === 'body') {
    errors.push(`skill/SKILL.md:${index + 1}: table row missing its leading \`|\` — project convention: every trigger-table row is written with a leading pipe (GFM outer pipes are optional, so a pipe-less line still parses as a row of the open table; the risk is that it escapes this project's leading-pipe convention and the duplicate-trigger scan built on it)`);
    return flushTableBlock();
  }
  if (tableState === 'rejected') return;
  const continuation = tableState === 'header';
  const continuationRow = tableRowView(line, continuation);
  const cells = continuationRow.cells;
  if (tableState === 'header' && isDelimiterRow(cells) && headerCells !== cells.length) return rejectPendingParagraph();
  if (tableState === 'header' && isDelimiterRow(cells)) {
    if (headerCells === cells.length) {
      // The delimiter confirms the pending header — which lost its pipe if it was a pipe-less
      // candidate; the delimiter losing its own pipe is the same convention break one row down.
      if (!headerHadPipe) errors.push(`skill/SKILL.md:${headerLine}: table header row missing its leading \`|\` — project convention: every trigger-table row is written with a leading pipe (this header is confirmed by the delimiter row directly below it)`);
      errors.push(`skill/SKILL.md:${index + 1}: table delimiter row missing its leading \`|\` — project convention: the delimiter row is written with a leading pipe like every other trigger-table row`);
      tableState = 'body';
      headerCells = cells.length;
      return;
    }
    return rejectPendingParagraph();
  }
  if (tableState === 'header') {
    // A pipe-less non-delimiter line directly under a pending row becomes the latest paragraph
    // line; cmark-gfm takes a table's header from that last line.
    setPendingHeader(continuationRow, index + 1);
    return;
  }
  if (tableState === 'none') {
    // Every ordinary paragraph line is a possible one-column header. cmark-gfm uses the last
    // line of the paragraph as the header, so replacing this candidate is intentional.
    setPendingHeader(row, index + 1);
  }
});
flushTableBlock();

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

// A literal `\"` in rule text is a JSON-string escape that leaked through the apply path:
// CommonMark processes no backslash escapes inside code spans, so a shipped manifest recipe
// reads invalid TOML. Zero legitimate occurrences today — reject outside fences. Fence state
// tracks the opener's marker char and length (a closer repeats the same marker at >= the
// opener's length; GFM §4.5's own text allows only trailing spaces, but the cmark-gfm reference
// scanner and CommonMark >= 0.30 also allow trailing tabs, which is the behavior matched here) —
// a blind boolean toggle wrongly "closes" a 4-backtick fence on a 3-backtick line, flagging
// escapes that are still inside code.
// Openers obey GFM §4.5 too: 0-3 spaces of indentation (a tab makes the line indented
// code, not a fence) and a backtick-free info string for backtick fences.
// Fence scanning understands bounded nested list/blockquote container prefixes, so a closer
// must match the opener's container identity. A container-ending line is rescanned outside it.
// splitGfmLines normalizes CRLF and lone CR before this scanner runs, so [ \t]* needs no
// separate \r? guard and a CR checkout cannot leave a fence open past a closer.
function fenceCloser(line, fence) {
  const view = containerViewForState(line, fence.container);
  if (!view.inside) return false;
  const run = view.text.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return run !== null && run[1][0] === fence.marker && run[1].length >= fence.length && view.listDepth === fence.container.listDepth;
}
for (const file of markdownFiles) {
  const source = fs.readFileSync(file, 'utf8');
  let fence = null;
  splitGfmLines(source).forEach((line, i) => {
    const opener = isFenceOpener(line);
    let fenceLineHandled = false;
    if (fence) {
      if (fenceCloser(line, fence)) {
        fence = null;
        fenceLineHandled = true;
      }
      else if (!containerViewForState(line, fence.container).inside) {
        // A fenced block nested in a list/blockquote ends when its containing container ends. The
        // line that exits the container belongs to the outer document and must be rescanned as
        // such; otherwise a literal `\\"` on it would be incorrectly treated as fenced text.
        fence = null;
      } else {
        return;
      }
    }
    if (fenceLineHandled) {
      return;
    }
    if (!fence && opener) {
      fence = opener;
    } else if (line.includes('\\"')) {
      errors.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}: literal \\" escape outside a fenced code block — JSON-style escape leaked into rule text`);
    }
  });
}

// RUST_INTEL_SKIP_NESTED_FIXTURES breaks a self-spawn cycle: validate-fixtures.mjs's README.md
// negative control spawns this script against a deliberately mutated repo state to prove the
// category-count check fails — and this script would otherwise spawn validate-fixtures.mjs right
// back, which runs that same negative control again, spawning this script again, without end.
if (!process.env.RUST_INTEL_SKIP_NESTED_FIXTURES) {
  const fixtureRun = spawnSync(process.execPath, [path.join(root, 'dev/validate-fixtures.mjs')], { encoding: 'utf8' });
  if (fixtureRun.status !== 0) errors.push(`fixture validation failed: ${(fixtureRun.stderr || fixtureRun.stdout).trim()}`);
}
const invalidCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--user-dir', '--uninstall'], { encoding: 'utf8' });
if (invalidCli.status === 0 || !invalidCli.stderr.includes('--user-dir requires a path')) errors.push('Codex installer accepted a missing --user-dir value');
const duplicateCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--user-dir', 'one', '--user-dir', 'two'], { encoding: 'utf8' });
if (duplicateCli.status === 0 || !duplicateCli.stderr.includes('--user-dir may be specified only once')) errors.push('Codex installer accepted duplicate --user-dir arguments');
const helpCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--help'], { encoding: 'utf8' });
if (helpCli.status !== 0) errors.push('Codex installer --help failed');

if (errors.length) {
  console.error(errors.map((e) => `ERROR: ${e}`).join('\n'));
  process.exit(1);
}
console.log(`rust-intel validation passed (${markdownFiles.length} skill markdown files checked)`);
