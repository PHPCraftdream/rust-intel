#!/usr/bin/env node
// Repository-level regression checks. Zero dependencies; run with Node >= 16.7.0 (dev/validate-fixtures.mjs uses fs.cpSync).

import fs from 'node:fs';
import { createHash } from 'node:crypto';
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

// ECMAScript recognizes four line terminators. Keep this predicate shared by every small source
// lexer below so comments, ASI probes, and offset-preserving masks agree on where a line ends.
function isJsLineTerminator(character) {
  return character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029';
}

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
      output += isJsLineTerminator(character) ? character : ' ';
      if (isJsLineTerminator(character)) state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      output += isJsLineTerminator(character) ? character : ' ';
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
    if (state === 'regex') {
      output += character;
      if (character === '\\' && i + 1 < source.length) {
        output += source[i + 1];
        i += 1;
      } else if (character === '[') {
        state = 'regex-class';
      } else if (character === '/') {
        state = 'code';
      }
      continue;
    }
    if (state === 'regex-class') {
      output += character;
      if (character === '\\' && i + 1 < source.length) {
        output += source[i + 1];
        i += 1;
      } else if (character === ']') {
        state = 'regex';
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
    } else if (character === '/' && isRegexLiteralStart(source, i)) {
      output += character;
      state = 'regex';
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
    const next = source[i + 1];
    if (state === 'single' || state === 'double' || state === 'template') {
      if (character === '\\') i += 1;
      else if ((state === 'single' && character === "'") || (state === 'double' && character === '"') || (state === 'template' && character === '`')) state = 'code';
      continue;
    }
    if (state === 'regex') {
      if (character === '\\') i += 1;
      else if (character === '[') state = 'regex-class';
      else if (character === '/') state = 'code';
      continue;
    }
    if (state === 'regex-class') {
      if (character === '\\') i += 1;
      else if (character === ']') state = 'regex';
      continue;
    }
    if (character === '/' && next === '/') { i += 1; state = 'line-comment'; continue; }
    if (character === '/' && next === '*') { i += 1; state = 'block-comment'; continue; }
    if (state === 'line-comment') {
      if (isJsLineTerminator(character)) state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') { i += 1; state = 'code'; }
      continue;
    }
    if (character === "'") { state = 'single'; continue; }
    if (character === '"') { state = 'double'; continue; }
    if (character === '`') { state = 'template'; continue; }
    if (character === '/' && isRegexLiteralStart(source, i)) { state = 'regex'; continue; }
    if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return i;
  }
  return -1;
}

// A slash after an expression is division; after an assignment/operator or at the start of a
// statement it starts a regexp literal.  This intentionally small token-context test is enough
// for the declaration locator, while the regexp states above protect brackets in /.../[...]/.
function isRegexLiteralStart(source, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return true;
  const previous = source[i];
  if ('=([{,:;!&|?+-*%^~<>'.includes(previous)) return true;
  // A regexp may begin in statement position immediately after a control-header `)`:
  // `if (ready) /[/]/.test(value)`.  A call followed by division (`factory() / 2`) is
  // intentionally left as division.  Keep this check line-bounded so a comment/string
  // elsewhere cannot manufacture a fake statement prefix.
  if (previous === ')') {
    let lineStart = index - 1;
    while (lineStart >= 0 && !isJsLineTerminator(source[lineStart])) lineStart -= 1;
    lineStart += 1;
    const prefix = source.slice(lineStart, index);
    if (/\b(?:if|while|for|with|switch|catch)\s*\([^\r\u2028\u2029]*\)\s*$/u.test(prefix)) return true;
  }
  const word = source.slice(Math.max(0, i - 12), i + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/)?.[0];
  return ['return', 'case', 'throw', 'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'yield', 'await'].includes(word);
}

// Keep only executable JavaScript while preserving offsets/newlines.  This is deliberately a
// separate view from stripJsComments(): the semantic workflow checks below must not be satisfied
// by a quoted example, a comment, or a regexp body containing the same spelling.
function maskJsNonCode(source) {
  // Keep UTF-16 code-unit offsets identical to `source`: Array.from() would collapse astral
  // characters (the workflow prompt contains emoji) and shift every later structural index.
  const output = source.split('');
  const blank = (index) => {
    if (!isJsLineTerminator(source[index])) output[index] = ' ';
  };
  const blankRange = (start, end) => {
    for (let index = start; index < end; index += 1) blank(index);
  };
  const maskQuoted = (start, quote) => {
    let index = start;
    while (index < source.length) {
      const character = source[index];
      blank(index);
      if (character === '\\' && index + 1 < source.length) {
        blank(index + 1);
        index += 2;
      } else if (character === quote) {
        return index + 1;
      } else index += 1;
    }
    return index;
  };
  const maskRegex = (start) => {
    let index = start;
    let inClass = false;
    while (index < source.length) {
      const character = source[index];
      blank(index);
      if (character === '\\' && index + 1 < source.length) {
        blank(index + 1);
        index += 2;
      } else if (character === '[') {
        inClass = true;
        index += 1;
      } else if (character === ']' && inClass) {
        inClass = false;
        index += 1;
      } else if (character === '/' && !inClass) {
        return index + 1;
      } else index += 1;
    }
    return index;
  };
  let maskCode;
  const maskTemplate = (start) => {
    let index = start;
    while (index < source.length) {
      const character = source[index];
      if (character === '\\' && index + 1 < source.length) {
        blankRange(index, index + 2);
        index += 2;
      } else if (character === '`') {
        blank(index);
        return index + 1;
      } else if (character === '$' && source[index + 1] === '{') {
        blankRange(index, index + 2);
        index = maskCode(index + 2, true);
      } else {
        blank(index);
        index += 1;
      }
    }
    return index;
  };
  maskCode = (start, interpolation) => {
    let index = start;
    let braceDepth = 0;
    while (index < source.length) {
      const character = source[index];
      const next = source[index + 1];
      if (character === '/' && next === '/') {
        blankRange(index, index + 2);
        index += 2;
        while (index < source.length && !isJsLineTerminator(source[index])) { blank(index); index += 1; }
        continue;
      }
      if (character === '/' && next === '*') {
        blankRange(index, index + 2);
        index += 2;
        while (index < source.length) {
          if (source[index] === '*' && source[index + 1] === '/') {
            blankRange(index, index + 2);
            index += 2;
            break;
          }
          blank(index);
          index += 1;
        }
        continue;
      }
      if (character === "'") { blank(index); index = maskQuoted(index + 1, "'"); continue; }
      if (character === '"') { blank(index); index = maskQuoted(index + 1, '"'); continue; }
      if (character === '`') { blank(index); index = maskTemplate(index + 1); continue; }
      if (character === '/' && isRegexLiteralStart(source, index)) { blank(index); index = maskRegex(index + 1); continue; }
      if (character === '{') { braceDepth += 1; index += 1; continue; }
      if (character === '}' && interpolation) {
        if (braceDepth === 0) {
          blank(index);
          return index + 1;
        }
        braceDepth -= 1;
        index += 1;
        continue;
      }
      index += 1;
    }
    return index;
  };
  maskCode(0, false);
  return output.join('');
}

// Find the real workflow declaration in JavaScript code.  A regex over a comment-masked
// source is not enough: quoted strings and template literals retain their bytes so that
// offsets stay stable, and a decoy `const MODULES = [` in either one would otherwise win.
// Depth is tracked for all JavaScript grouping constructs so nested declarations are ignored.
function findTopLevelArrayStart(source, name) {
  let state = 'code';
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    const next = source[i + 1];
    if (state === 'line-comment') {
      if (isJsLineTerminator(character)) state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') { i += 1; state = 'code'; }
      continue;
    }
    if (state === 'single' || state === 'double') {
      if (character === '\\') i += 1;
      else if ((state === 'single' && character === "'") || (state === 'double' && character === '"')) state = 'code';
      continue;
    }
    if (state === 'template') {
      if (character === '\\') i += 1;
      else if (character === '`') state = 'code';
      continue;
    }
    if (state === 'regex') {
      if (character === '\\') i += 1;
      else if (character === '[') state = 'regex-class';
      else if (character === '/') state = 'code';
      continue;
    }
    if (state === 'regex-class') {
      if (character === '\\') i += 1;
      else if (character === ']') state = 'regex';
      continue;
    }
    if (character === '/' && next === '/') { i += 1; state = 'line-comment'; continue; }
    if (character === '/' && next === '*') { i += 1; state = 'block-comment'; continue; }
    if (character === "'") { state = 'single'; continue; }
    if (character === '"') { state = 'double'; continue; }
    if (character === '`') { state = 'template'; continue; }
    if (character === '/' && isRegexLiteralStart(source, i)) { state = 'regex'; continue; }
    if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0
      && source.startsWith('const', i)
      && (i === 0 || !/[A-Za-z0-9_$]/.test(source[i - 1] || ''))
      && !/[A-Za-z0-9_$]/.test(source[i + 5] || '')) {
      const assignment = source.slice(i).match(new RegExp(`^const\\s+${name}\\s*=\\s*deepFreezeRecords\\s*\\(\\s*\\[`));
      if (assignment) return i + assignment[0].lastIndexOf('[');
    }
    if (character === '{') braceDepth += 1;
    else if (character === '}' && braceDepth > 0) braceDepth -= 1;
    else if (character === '(') parenDepth += 1;
    else if (character === ')' && parenDepth > 0) parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']' && bracketDepth > 0) bracketDepth -= 1;
  }
  return -1;
}

// Return only top-level `const name = ...` declarations.  The executable mask has already removed
// strings, comments, templates, and regexp bodies, while retaining grouping bytes; depth therefore
// excludes decoys hidden in dead blocks and quoted examples.
function findTopLevelConstDeclarations(source, name) {
  const declarations = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  const declaration = new RegExp(`^const\\s+${name}\\s*=`);
  for (let i = 0; i < source.length; i += 1) {
    if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0
      && (i === 0 || !/[A-Za-z0-9_$]/.test(source[i - 1] || ''))
      && !/[A-Za-z0-9_$]/.test(source[i + 5] || '')) {
      const match = source.slice(i).match(declaration);
      if (match) {
        declarations.push(i);
        i += match[0].length - 1;
        continue;
      }
    }
    const character = source[i];
    if (character === '{') braceDepth += 1;
    else if (character === '}' && braceDepth > 0) braceDepth -= 1;
    else if (character === '(') parenDepth += 1;
    else if (character === ')' && parenDepth > 0) parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']' && bracketDepth > 0) bracketDepth -= 1;
  }
  return declarations;
}

function findTopLevelForLoop(source, start, pattern) {
  const anchoredPattern = new RegExp(`^(?:${pattern.source})`, pattern.flags.replace('g', ''));
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (i >= start && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && source.slice(i).match(anchoredPattern)) return i;
    const character = source[i];
    if (character === '{') braceDepth += 1;
    else if (character === '}' && braceDepth > 0) braceDepth -= 1;
    else if (character === '(') parenDepth += 1;
    else if (character === ')' && parenDepth > 0) parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']' && bracketDepth > 0) bracketDepth -= 1;
  }
  return -1;
}

function findMatchingDelimiter(source, openingIndex, opener, closer) {
  let depth = 0;
  for (let i = openingIndex; i < source.length; i += 1) {
    if (source[i] === opener) depth += 1;
    else if (source[i] === closer && --depth === 0) return i;
  }
  return -1;
}

const executableWorkflowCode = maskJsNonCode(workflow);
const deepFreezeDeclarations = findTopLevelConstDeclarations(executableWorkflowCode, 'deepFreezeRecords');
const deepFreezeHelper = /^const\s+deepFreezeRecords\s*=\s*\(\s*records\s*\)\s*=>\s*\{\s*for\s*\(\s*const\s+record\s+of\s+records\s*\)\s*\{\s*for\s*\(\s*const\s+value\s+of\s+Object\.values\(\s*record\s*\)\s*\)\s*\{\s*if\s*\(\s*Array\.isArray\(\s*value\s*\)\s*\)\s*Object\.freeze\(\s*value\s*\)\s*\}\s*Object\.freeze\(\s*record\s*\)\s*\}\s*return\s+Object\.freeze\(\s*records\s*\)\s*\};/;
if (deepFreezeDeclarations.length !== 1 || !deepFreezeHelper.test(executableWorkflowCode.slice(deepFreezeDeclarations[0] ?? 0))) {
  errors.push('workflow must contain exactly one canonical deepFreezeRecords helper that freezes nested arrays, records, and the outer array');
}
const deepFreezeCalls = executableWorkflowCode.match(/\bdeepFreezeRecords\s*\(/g) || [];
if (deepFreezeCalls.length !== 2) {
  errors.push('workflow must call deepFreezeRecords exactly for MODULES and AUDIT_UNITS');
}
const moduleFreezeArrayStart = findTopLevelArrayStart(executableWorkflowCode, 'MODULES');
const moduleFreezeCallIndex = moduleFreezeArrayStart >= 0
  ? executableWorkflowCode.lastIndexOf('deepFreezeRecords', moduleFreezeArrayStart)
  : -1;
if (deepFreezeDeclarations.length !== 1 || moduleFreezeCallIndex < 0 || deepFreezeDeclarations[0] >= moduleFreezeCallIndex) {
  errors.push('workflow deepFreezeRecords helper must be declared before the first MODULES freeze call');
}
const moduleMatchDeclarations = findTopLevelConstDeclarations(executableWorkflowCode, 'auditResultModuleMatches');
const moduleMatchHelper = /^const\s+auditResultModuleMatches\s*=\s*\(\s*result\s*,\s*unit\s*\)\s*=>\s*result\.module\s*===\s*unit\.module\s*;/;
if (moduleMatchDeclarations.length !== 1 || !moduleMatchHelper.test(executableWorkflowCode.slice(moduleMatchDeclarations[0] ?? 0))) {
  errors.push('workflow must contain exactly one canonical auditResultModuleMatches helper');
}
const missingDeclarations = findTopLevelConstDeclarations(executableWorkflowCode, 'missingUnitInputs');
const missingDeclaration = /^const\s+missingUnitInputs\s*=\s*\{\s*\}/;
const missingDeclarationIndex = missingDeclarations.find((index) => missingDeclaration.test(executableWorkflowCode.slice(index))) ?? -1;
if (missingDeclarations.length !== 1 || missingDeclarationIndex < 0) {
  errors.push('workflow must contain exactly one top-level const missingUnitInputs = {} declaration');
}
const missingLoopStart = findTopLevelForLoop(executableWorkflowCode, missingDeclarationIndex, /for\s*\(\s*const\s+unit\s+of\s+AUDIT_UNITS\s*\)\s*\{/);
const orchestrationDeclarations = findTopLevelConstDeclarations(executableWorkflowCode, 'orchestrationComplete');
const orchestrationExpression = /^const\s+orchestrationComplete\s*=\s*missingScopeFields\.length\s*===\s*0\s*&&\s*missingSlices\.length\s*===\s*0\s*&&\s*Object\.keys\(\s*missingUnitInputs\s*\)\.length\s*===\s*0\s*&&\s*strayLabels\.length\s*===\s*0\s*&&\s*dropped\s*===\s*0\s*;[ \t\r]*(?:\n|$)/;
if (orchestrationDeclarations.length !== 1 || !orchestrationExpression.test(executableWorkflowCode.slice(orchestrationDeclarations[0] ?? 0))) {
  errors.push('workflow orchestrationComplete must be one top-level const with all five coverage conjuncts');
}
if (moduleMatchDeclarations.length !== 1 || missingLoopStart < 0 || moduleMatchDeclarations[0] >= missingLoopStart) {
  errors.push('workflow auditResultModuleMatches helper must be declared before the live missingUnitInputs loop');
}

// Pin the complete reachable coverage-production block, from the dropped-agent producer through
// the semicolon terminating orchestrationComplete.  The hash is over LF-normalized source bytes;
// unlike a check of just missingUnitInputs, this covers every producer and their final conjunction.
const coverageStartDeclarations = findTopLevelConstDeclarations(executableWorkflowCode, 'dropped');
const coverageStart = coverageStartDeclarations.length === 1 ? coverageStartDeclarations[0] : -1;
const orchestrationStart = orchestrationDeclarations.length === 1 ? orchestrationDeclarations[0] : -1;
const orchestrationEnd = orchestrationStart >= 0 ? executableWorkflowCode.indexOf(';', orchestrationStart) : -1;
const coverageBlock = coverageStart >= 0 && orchestrationEnd > coverageStart
  ? workflow.slice(coverageStart, orchestrationEnd + 1).replace(/\r\n?/g, '\n')
  : '';
// SHA-256 of the canonical coverage-production block in skill/audit-project.workflow.js.
const canonicalCoverageProductionSha256 = '2d635a082a92d0364c86726e038daf90c02d1bce0a4f684c7c0c20994e2dd331';
if (coverageStartDeclarations.length !== 1 || orchestrationDeclarations.length !== 1 || !coverageBlock
  || createHash('sha256').update(coverageBlock, 'utf8').digest('hex') !== canonicalCoverageProductionSha256) {
  errors.push('workflow coverage-production block must match the canonical reachable implementation from dropped through orchestrationComplete');
}

const workflowWithoutComments = stripJsComments(workflow);
// `modulesStart` deliberately comes from the original source: stripJsComments preserves byte
// offsets, while the lexer above ignores comments/strings/templates before accepting a match.
const modulesStart = findTopLevelArrayStart(workflow, 'MODULES');
const modulesEnd = modulesStart >= 0 ? findMatchingBracket(workflowWithoutComments, modulesStart) : -1;
const modulesLiteral = modulesStart >= 0 && modulesEnd > modulesStart
  ? workflowWithoutComments.slice(modulesStart + 1, modulesEnd)
  : '';
function requirePureArrayInitializer(name, openingIndex, closingIndex) {
  if (openingIndex < 0 || closingIndex <= openingIndex) return;
  let lineEnd = closingIndex + 1;
  while (lineEnd < workflow.length && !isJsLineTerminator(workflow[lineEnd])) lineEnd += 1;
  const suffix = workflow.slice(closingIndex + 1, lineEnd < 0 ? workflow.length : lineEnd);
  if (!/^[ \t\r]*\);[ \t\r]*$/.test(suffix)) {
    errors.push(`workflow ${name} initializer must end with a standalone ); after its closing ]`);
  }
}
requirePureArrayInitializer('MODULES', modulesStart, modulesEnd);

// Split a literal array into its complete top-level elements.  Regex extraction is unsafe here:
// it silently drops malformed/alternate elements and accepts a valid-looking object after them.
function topLevelArrayElements(source) {
  const elements = [];
  let start = 0;
  let state = 'code';
  let brace = 0; let paren = 0; let bracket = 0;
  const push = (end) => {
    const text = source.slice(start, end).trim();
    if (!text) elements.push(null);
    else elements.push(text);
    start = end + 1;
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]; const n = source[i + 1];
    if (state === 'line-comment') { if (isJsLineTerminator(c)) state = 'code'; continue; }
    if (state === 'block-comment') { if (c === '*' && n === '/') { i += 1; state = 'code'; } continue; }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (c === '\\') i += 1;
      else if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code';
      continue;
    }
    if (state === 'regex') { if (c === '\\') i += 1; else if (c === '[') state = 'regex-class'; else if (c === '/') state = 'code'; continue; }
    if (state === 'regex-class') { if (c === '\\') i += 1; else if (c === ']') state = 'regex'; continue; }
    if (c === '/' && n === '/') { i += 1; state = 'line-comment'; continue; }
    if (c === '/' && n === '*') { i += 1; state = 'block-comment'; continue; }
    if (c === "'") { state = 'single'; continue; }
    if (c === '"') { state = 'double'; continue; }
    if (c === '`') { state = 'template'; continue; }
    if (c === '/' && isRegexLiteralStart(source, i)) { state = 'regex'; continue; }
    if (c === '{') brace += 1;
    else if (c === '}') brace -= 1;
    else if (c === '(') paren += 1;
    else if (c === ')') paren -= 1;
    else if (c === '[') bracket += 1;
    else if (c === ']') bracket -= 1;
    else if (c === ',' && brace === 0 && paren === 0 && bracket === 0) push(i);
  }
  const tail = source.slice(start).trim();
  if (tail) elements.push(tail);
  if (state !== 'code' || brace !== 0 || paren !== 0 || bracket !== 0) elements.push(null);
  return elements;
}

function parseSingleQuoted(value) {
  const match = value.match(/^'([^'\\]*)'$/s);
  return match ? match[1] : null;
}
function parseStringArray(value) {
  const text = value.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  const inner = text.slice(1, -1);
  // JavaScript permits one trailing comma in an array literal; topLevelArrayElements accepts
  // that final comma while retaining null elements for leading, repeated, or interior elisions.
  if (!inner.trim()) return [];
  const parts = topLevelArrayElements(inner);
  if (parts.some((part) => part === null)) return null;
  const values = parts.map(parseSingleQuoted);
  return values.some((part) => part === null) ? null : values;
}

function parseObjectFields(element) {
  const text = element.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const fields = topLevelArrayElements(text.slice(1, -1));
  if (fields.some((field) => field === null)) return null;
  const result = new Map();
  for (const field of fields) {
    const match = field.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([\s\S]+)$/);
    if (!match || result.has(match[1])) return null;
    result.set(match[1], match[2].trim());
  }
  return result;
}

function parseModulesLiteral(literal) {
  if (!literal) return null;
  const elements = topLevelArrayElements(literal);
  if (elements.some((element) => element === null)) return null;
  const parsed = [];
  for (const element of elements) {
    const fields = parseObjectFields(element);
    if (!fields || fields.size !== 2 || !fields.has('file') || !fields.has('categories')) return null;
    const file = parseSingleQuoted(fields.get('file'));
    const categories = parseStringArray(fields.get('categories'));
    if (!file || !categories || categories.some((id) => !/^[A-Z]\d+[a-z]?$/.test(id))) return null;
    parsed.push({ file, categories });
  }
  return parsed;
}
const workflowModuleCategories = new Map();
const parsedModules = parseModulesLiteral(modulesLiteral);
if (!parsedModules) errors.push('workflow MODULES contains a null, unparsed, or unsupported top-level element');
for (const entry of parsedModules || []) {
  const { file, categories } = entry;
  if (workflowModuleCategories.has(file)) {
    errors.push(`workflow MODULES contains duplicate executable entry for ${file}`);
    continue;
  }
  const seenIds = new Set();
  for (const id of categories) {
    if (seenIds.has(id)) errors.push(`workflow MODULES entry for ${file} contains duplicate category §${id}`);
    seenIds.add(id);
  }
  workflowModuleCategories.set(file, seenIds);
}
for (const module of ['async.md', 'concurrency-and-state.md', 'data-and-types.md', 'security.md', 'unsafe-and-ffi.md', 'drop-and-raii.md', 'deps-macros-ergonomics.md', 'lifetimes-and-api.md', 'testing.md', 'semantics-and-conformance.md']) {
  if (!workflowModuleCategories.has(module)) errors.push(`workflow missing module: ${module}`);
}

// AUDIT_UNITS is executable orchestration data too. Parse every top-level element and validate
// the partition, so an inserted null/alternate object cannot quietly remove a module from the fanout.
const auditUnitsStart = findTopLevelArrayStart(workflow, 'AUDIT_UNITS');
const auditUnitsEnd = auditUnitsStart >= 0 ? findMatchingBracket(workflowWithoutComments, auditUnitsStart) : -1;
const auditUnitsLiteral = auditUnitsStart >= 0 && auditUnitsEnd > auditUnitsStart
  ? workflowWithoutComments.slice(auditUnitsStart + 1, auditUnitsEnd) : '';
requirePureArrayInitializer('AUDIT_UNITS', auditUnitsStart, auditUnitsEnd);
function parseAuditUnit(element) {
  const fields = parseObjectFields(element);
  if (!fields || !fields.has('module') || !fields.has('label')) return null;
  const allowed = new Set(['module', 'label', 'onlyCategories', 'requiredArtifactGroups', 'requiresDocs']);
  for (const key of fields.keys()) if (!allowed.has(key)) return null;
  const module = parseSingleQuoted(fields.get('module'));
  const label = parseSingleQuoted(fields.get('label'));
  if (!module || !label) return null;
  const onlyCategories = fields.has('onlyCategories') ? parseSingleQuoted(fields.get('onlyCategories')) : undefined;
  if (fields.has('onlyCategories') && onlyCategories === null) return null;
  if (!fields.has('requiredArtifactGroups')) return null;
  const requiredArtifactGroups = parseStringArray(fields.get('requiredArtifactGroups'));
  if (!requiredArtifactGroups || requiredArtifactGroups.some((group) => !/^[a-z]+$/.test(group))) return null;
  const requiresDocs = fields.has('requiresDocs') ? fields.get('requiresDocs') : 'false';
  if (requiresDocs !== 'true' && requiresDocs !== 'false') return null;
  return { module, label, onlyCategories, requiredArtifactGroups, requiresDocs: requiresDocs === 'true' };
}
const auditUnitElements = auditUnitsLiteral ? topLevelArrayElements(auditUnitsLiteral) : [];
const parsedAuditUnits = auditUnitsStart >= 0 && auditUnitsEnd > auditUnitsStart && auditUnitElements.every(Boolean)
  ? auditUnitElements.map(parseAuditUnit) : null;
if (!parsedAuditUnits || parsedAuditUnits.some((unit) => unit === null)) {
  errors.push('workflow AUDIT_UNITS contains a null, unparsed, or unsupported top-level element');
}
const auditUnits = (parsedAuditUnits || []).filter(Boolean);

// Deep-freezing is the primary runtime boundary, but an executable post-initialisation write is
// still a contract violation (and can become observable if the freeze is weakened).  Keep this
// deliberately bounded: reject obvious writes, deletes, Reflect.set calls, mutators, and aliases
// of MODULES/AUDIT_UNITS, while leaving ordinary result bookkeeping such as `missing.push(...)`
// alone.  These are static direct-use and binding-site checks; this validator deliberately does
// not attempt `at`/`find`/loop/callback scope analysis.  Runtime deepFreezeRecords is the explicit
// backstop for indirect references, as documented by the workflow contract.
function workflowMutationCheck(source, names, rawSource = source) {
  const mutators = new Set(['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift']);
  const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootNames = names.map(escaped).join('|');
  // `\\b` is ASCII-word based: it treats `$MODULES` and `éMODULES` as a protected
  // literal even though both are distinct ECMAScript identifiers.  Keep the root literal
  // bounded by the language's identifier-continue set instead.
  const identifierContinueClass = '$_\\u200C\\u200D\\p{ID_Continue}';
  const rootBoundary = `(?<![${identifierContinueClass}])(?:${rootNames})(?![${identifierContinueClass}])`;
  const rootChainRe = `(?:\\(\\s*)*${rootBoundary}(?:\\s*\\)\\s*)*(?:\\s*(?:\\[[^\\]\\r\\n]*\\]|\\.[A-Za-z_$][A-Za-z0-9_$]*))*(?:\\s*\\)\\s*)*`;

  // Return source spans, rather than strings, so every declarator is checked against its own
  // bounded RHS.  A declaration without a semicolon may end at ASI before the next declaration;
  // scanning to EOF would turn an otherwise safe `MODULES.length` into a false alias.
  const splitDeclaration = (text) => {
    const parts = [];
    let start = 0;
    let round = 0;
    let square = 0;
    let curly = 0;
    for (let i = 0; i < text.length; i += 1) {
      const character = text[i];
      if (character === '(') round += 1;
      else if (character === ')' && round > 0) round -= 1;
      else if (character === '[') square += 1;
      else if (character === ']' && square > 0) square -= 1;
      else if (character === '{') curly += 1;
      else if (character === '}' && curly > 0) curly -= 1;
      else if (character === ',' && round === 0 && square === 0 && curly === 0) {
        parts.push({ start, end: i, text: text.slice(start, i) });
        start = i + 1;
      }
    }
    parts.push({ start, end: text.length, text: text.slice(start) });
    return parts;
  };
  const topLevelEquals = (text) => {
    let round = 0;
    let square = 0;
    let curly = 0;
    for (let i = 0; i < text.length; i += 1) {
      const character = text[i];
      if (character === '(') round += 1;
      else if (character === ')' && round > 0) round -= 1;
      else if (character === '[') square += 1;
      else if (character === ']' && square > 0) square -= 1;
      else if (character === '{') curly += 1;
      else if (character === '}' && curly > 0) curly -= 1;
      else if (character === '=' && round === 0 && square === 0 && curly === 0
        && text[i - 1] !== '=' && text[i + 1] !== '=' && text[i + 1] !== '>') return i;
    }
    return -1;
  };

  // Tokenize only the tiny expression language needed by the primitive exemption.  This keeps
  // quoted bracket properties intact while rejecting operators, calls, templates, regexps, and
  // any other expression that merely starts with a declarative root.
  const lengthExpressionTokens = (text) => {
    const tokens = [];
    for (let i = 0; i < text.length;) {
      const character = text[i];
      if (/\s/u.test(character)) { i += 1; continue; }
      if (character === '/' && text[i + 1] === '/') {
        i += 2;
        while (i < text.length && !isJsLineTerminator(text[i])) i += 1;
        continue;
      }
      if (character === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) return null;
        i = end + 2;
        continue;
      }
      if (character === "'" || character === '"') {
        const quote = character;
        const start = i;
        i += 1;
        while (i < text.length) {
          if (text[i] === '\\') i += 2;
          else if (text[i] === quote) { i += 1; break; }
          else i += 1;
        }
        if (text[i - 1] !== quote) return null;
        tokens.push({ kind: 'string', value: text.slice(start, i) });
        continue;
      }
      if (/[A-Za-z_$]/u.test(character)) {
        const start = i;
        i += 1;
        while (i < text.length && /[A-Za-z0-9_$]/u.test(text[i])) i += 1;
        tokens.push({ kind: 'word', value: text.slice(start, i) });
        continue;
      }
      if ('()[].'.includes(character)) tokens.push({ kind: 'punct', value: character });
      else tokens.push({ kind: 'other', value: character });
      i += 1;
    }
    return tokens;
  };
  const isPureLengthExpression = (text) => {
    const tokens = lengthExpressionTokens(text);
    if (!tokens) return false;
    let expression = tokens;
    // Strip only parentheses that enclose the complete expression.  Parentheses around the root
    // are handled separately below, so `(MODULES).length` remains valid.
    while (expression[0]?.value === '(') {
      let depth = 0;
      let closesAt = -1;
      for (let i = 0; i < expression.length; i += 1) {
        if (expression[i].value === '(') depth += 1;
        else if (expression[i].value === ')' && --depth === 0) { closesAt = i; break; }
      }
      if (closesAt !== expression.length - 1) break;
      expression = expression.slice(1, -1);
    }
    let cursor = 0;
    let rootParens = 0;
    while (expression[cursor]?.value === '(') { rootParens += 1; cursor += 1; }
    if (expression[cursor]?.kind !== 'word' || !names.includes(expression[cursor].value)) return false;
    cursor += 1;
    while (rootParens > 0) {
      if (expression[cursor]?.value !== ')') return false;
      rootParens -= 1;
      cursor += 1;
    }
    if (expression[cursor]?.value === '.') {
      if (expression[cursor + 1]?.kind !== 'word' || expression[cursor + 1].value !== 'length') return false;
      cursor += 2;
    } else if (expression[cursor]?.value === '['
      && expression[cursor + 1]?.kind === 'string'
      && /^(['"])length\1$/u.test(expression[cursor + 1].value)
      && expression[cursor + 2]?.value === ']') {
      cursor += 3;
    } else return false;
    return cursor === expression.length;
  };
  const hasOnlyLengthRootReferences = (text) => {
    const tokens = lengthExpressionTokens(text);
    if (!tokens) return false;
    let found = false;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].kind !== 'word' || !names.includes(tokens[i].value)) continue;
      found = true;
      let cursor = i + 1;
      while (tokens[cursor]?.value === ')') cursor += 1;
      const dotLength = tokens[cursor]?.value === '.'
        && tokens[cursor + 1]?.kind === 'word'
        && tokens[cursor + 1].value === 'length';
      const bracketLength = tokens[cursor]?.value === '['
        && tokens[cursor + 1]?.kind === 'string'
        && /^(['"])length\1$/u.test(tokens[cursor + 1].value)
        && tokens[cursor + 2]?.value === ']';
      if (!dotLength && !bracketLength) return false;
    }
    // Expressions such as `MODULES.length - other.length` are scalar reads, not aliases.  The
    // exact expression above is the primitive exemption; this supplemental check only keeps the
    // existing workflow's scalar bookkeeping legal while still rejecting a bare root in a mixed
    // expression (`MODULES.length && MODULES`).
    return found;
  };
  const aliasRhsRe = new RegExp(`^\\s*(?:\\(\\s*)*${rootBoundary}`, 'u');
  const declarationKeywordRe = /\b(?:const|let|var)\b/g;
  for (const declaration of source.matchAll(declarationKeywordRe)) {
    // `source` is the executable, non-string view, so a small delimiter scan can safely span
    // line breaks and destructuring defaults without treating an inner `=` as the declarator's
    // assignment.  Stop at semicolons, block ends, or an ASI line before another statement.
    let declarationEnd = source.length;
    let round = 0;
    let square = 0;
    let curly = 0;
    for (let i = declaration.index + declaration[0].length; i < source.length; i += 1) {
      const character = source[i];
      if (character === '(') round += 1;
      else if (character === ')' && round > 0) round -= 1;
      else if (character === '[') square += 1;
      else if (character === ']' && square > 0) square -= 1;
      else if (character === '{') curly += 1;
      else if (character === '}' && curly > 0) curly -= 1;
      else if (character === ';' && round === 0 && square === 0 && curly === 0) {
        declarationEnd = i;
        break;
      } else if (character === '}' && round === 0 && square === 0 && curly === 0) {
        declarationEnd = i;
        break;
      } else if (isJsLineTerminator(character) && round === 0 && square === 0 && curly === 0) {
        let previous = i - 1;
        while (previous >= declaration.index
          && (source[previous] === ' ' || source[previous] === '\t' || isJsLineTerminator(source[previous]))) previous -= 1;
        let next = i + 1;
        while (next < source.length && /[ \t]/u.test(source[next])) next += 1;
        const previousCanEnd = previous >= 0 && !'=,+-*/%&|^!?<>.:'.includes(source[previous]);
        const nextStartsContinuation = Boolean(next) && ('([.`+-*/%&|^!?<>'.includes(source[next])
          || source.slice(next).match(/^(?:\?|\.|&&|\|\||\?\?)/u));
        if (previousCanEnd && !nextStartsContinuation) {
          declarationEnd = i;
          break;
        }
      }
    }
    const declarationTextStart = declaration.index + declaration[0].length;
    const declarationText = source.slice(declarationTextStart, declarationEnd);
    for (const declarator of splitDeclaration(declarationText)) {
      const equals = topLevelEquals(declarator.text);
      if (equals < 0) continue;
      const rhs = declarator.text.slice(equals + 1);
      const rawRhs = rawSource.slice(declarationTextStart + declarator.start + equals + 1, declarationTextStart + declarator.end);
      if (aliasRhsRe.test(rhs) && !isPureLengthExpression(rawRhs)
        && !hasOnlyLengthRootReferences(rawRhs)) {
        errors.push('workflow declarative arrays may not be aliased');
        break;
      }
    }
  }

  const assignmentRe = /^(?:>>>=|\*\*=|<<=|>>=|&&=|\|\|=|\?\?=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=)(?!=|>)/;
  const updateRe = /^(?:\+\+|--)(?![+\-])/;
  const prefixKeywords = new Set(['case', 'delete', 'new', 'return', 'throw', 'typeof', 'void', 'await', 'yield']);
  const statementGroupKeywords = new Set([...prefixKeywords, 'else', 'do']);
  const skipWhitespace = (index) => {
    let cursor = index;
    while (cursor < source.length && /\s/u.test(source[cursor])) cursor += 1;
    return cursor;
  };
  const previousSignificant = (index) => {
    let cursor = index - 1;
    while (cursor >= 0 && /\s/u.test(source[cursor])) cursor -= 1;
    return cursor;
  };
  // JavaScript's postfix-update and restricted-production rules use a *LineTerminator* test,
  // not a generic whitespace test.  The executable view masks comments with spaces while
  // preserving their newlines, so this also handles a multiline comment between the operands.
  const hasLineTerminator = (start, end) => source.slice(start, end).split('').some(isJsLineTerminator);
  const statementBlockKeywords = new Set(['catch', 'do', 'else', 'finally', 'try']);
  const identifierStartRe = /[$_\p{ID_Start}]/u;
  const identifierContinueRe = /[$_\u200C\u200D\p{ID_Continue}]/u;
  const isHexDigit = (character) => /[0-9A-Fa-f]/u.test(character || '');
  const identifierEscape = (index) => {
    if (source[index] !== '\\' || source[index + 1] !== 'u') return null;
    let length;
    let braced = false;
    let digitsStart;
    let digitsEnd;
    if (source[index + 2] === '{') {
      braced = true;
      digitsStart = index + 3;
      let cursor = index + 3;
      while (cursor < source.length && isHexDigit(source[cursor]) && cursor - (index + 3) < 6) cursor += 1;
      if (cursor <= index + 3 || source[cursor] !== '}') return null;
      digitsEnd = cursor;
      length = cursor - index + 1;
    } else {
      if (!Array.from({ length: 4 }, (_, offset) => source[index + 2 + offset]).every(isHexDigit)) return null;
      digitsStart = index + 2;
      digitsEnd = index + 6;
      length = 6;
    }
    // Do not infer the spelling from its byte length: `\\u{41}` is six code units too,
    // but its braces are part of the syntax and must not enter parseInt().
    const value = Number.parseInt(source.slice(digitsStart, digitsEnd), 16);
    if (!braced && length !== 6) return null;
    if (value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)) return null;
    return { length, character: String.fromCodePoint(value) };
  };
  const codePointAt = (index) => {
    if (index < 0 || index >= source.length) return null;
    const value = source.codePointAt(index);
    return value === undefined ? null : String.fromCodePoint(value);
  };
  const identifierPartAt = (index) => {
    const character = codePointAt(index);
    return character !== null && identifierContinueRe.test(character);
  };
  const identifierPartBefore = (index) => {
    if (index <= 0) return false;
    const previousCodeUnit = source.charCodeAt(index - 1);
    const start = previousCodeUnit >= 0xDC00 && previousCodeUnit <= 0xDFFF ? index - 2 : index - 1;
    return identifierPartAt(start);
  };
  const readIdentifierToken = (start) => {
    let cursor = start;
    const firstEscape = identifierEscape(cursor);
    if (firstEscape) {
      if (!identifierStartRe.test(firstEscape.character)) return null;
      cursor += firstEscape.length;
    }
    else {
      const first = codePointAt(cursor);
      if (first === null || !identifierStartRe.test(first)) return null;
      cursor += first.length;
    }
    while (cursor < source.length) {
      const escape = identifierEscape(cursor);
      if (escape) {
        if (!identifierContinueRe.test(escape.character)) return null;
        cursor += escape.length;
        continue;
      }
      const character = codePointAt(cursor);
      if (character === null || !identifierContinueRe.test(character)) break;
      cursor += character.length;
    }
    return { start, end: cursor };
  };
  const keywordAt = (index, keyword) => source.startsWith(keyword, index)
    && !identifierPartBefore(index)
    && !identifierPartAt(index + keyword.length);
  const classHeaderInfo = (opening) => {
    const headerPrefix = source.slice(0, opening);
    for (let candidate = headerPrefix.lastIndexOf('class'); candidate >= 0;
      candidate = headerPrefix.lastIndexOf('class', candidate - 1)) {
      if (identifierPartBefore(candidate) || identifierPartAt(candidate + 5)) continue;
      const afterClass = candidate + 5;
      if (afterClass < opening && !/\s/u.test(source[afterClass]) && source[afterClass] !== '{') continue;
      let cursor = skipWhitespace(afterClass);
      let hasName = false;
      if (source[cursor] !== '{') {
        const first = readIdentifierToken(cursor);
        if (!first) continue;
        const token = source.slice(first.start, first.end);
        cursor = skipWhitespace(first.end);
        if (token !== 'extends') {
          hasName = true;
          if (source[cursor] !== '{' && !keywordAt(cursor, 'extends')) continue;
        }
        if (token === 'extends' || keywordAt(cursor, 'extends')) {
          if (token === 'extends') cursor = first.end;
          else cursor += 'extends'.length;
          if (source.slice(cursor, opening).trim() === '') continue;
          cursor = opening;
        }
      }
      if (cursor === opening) return { classStart: candidate, hasName };
    }
    return null;
  };
  const isClassDeclarationBody = (opening) => {
    // A class declaration's body is a statement block for ASI purposes, but a class expression
    // is not.  Looking only at the byte before `{` would classify `const C = class C {}` as a
    // statement boundary, so first identify the class header and then require declaration
    // context before the `class` keyword.
    const info = classHeaderInfo(opening);
    if (!info) return false;
    const { classStart, hasName } = info;

    const previousWordAt = (index) => {
      let cursor = previousSignificant(index);
      if (cursor < 0 || !/[A-Za-z0-9_$]/u.test(source[cursor])) return null;
      const end = cursor + 1;
      while (cursor >= 0 && /[A-Za-z0-9_$]/u.test(source[cursor])) cursor -= 1;
      return { value: source.slice(cursor + 1, end), start: cursor + 1 };
    };
    const isSwitchBody = (opening) => {
      let closeParen = previousSignificant(opening);
      if (closeParen < 0 || source[closeParen] !== ')') return false;
      let depth = 0;
      let openParen = -1;
      for (let cursor = closeParen; cursor >= 0; cursor -= 1) {
        if (source[cursor] === ')') depth += 1;
        else if (source[cursor] === '(') {
          depth -= 1;
          if (depth === 0) { openParen = cursor; break; }
        }
      }
      if (openParen < 0) return false;
      let keywordEnd = previousSignificant(openParen);
      if (keywordEnd < 0 || !/[A-Za-z]/u.test(source[keywordEnd])) return false;
      let keywordStart = keywordEnd;
      while (keywordStart > 0 && /[A-Za-z]/u.test(source[keywordStart - 1])) keywordStart -= 1;
      return source.slice(keywordStart, keywordEnd + 1) === 'switch'
        && !identifierPartBefore(keywordStart)
        && !identifierPartAt(keywordEnd + 1);
    };
    const isSwitchLabelColon = (colon) => {
      const braceStack = [];
      for (let cursor = 0; cursor < colon; cursor += 1) {
        if (source[cursor] === '{') braceStack.push(cursor);
        else if (source[cursor] === '}' && braceStack.length) braceStack.pop();
      }
      const opening = braceStack.at(-1);
      if (opening === undefined || !isSwitchBody(opening)) return false;
      // Only a label in the switch statement list qualifies.  In particular, `default:`
      // in an object literal and a ternary colon must not create an ASI boundary.
      // Keep all three expression delimiters on a stack.  A case expression may contain an
      // object literal, class body, arrow body, or parenthesized/bracketed expression; those
      // braces and colons are not part of the switch statement list and must not reset the case
      // token.  `?`/`:` pairs at statement-list depth are tracked separately for a conditional
      // expression such as `case flag ? left : right:`.
      const groupStack = [];
      let labelStart = -1;
      let ternaryDepth = 0;
      for (let cursor = opening + 1; cursor < colon; cursor += 1) {
        const character = source[cursor];
        if (groupStack.length === 0) {
          if (character === ';') {
            labelStart = -1;
            ternaryDepth = 0;
            continue;
          }
          if (character === '?' && source[cursor + 1] !== '.' && source[cursor + 1] !== '?') {
            ternaryDepth += 1;
            continue;
          }
          if (character === ':') {
            if (ternaryDepth > 0) {
              ternaryDepth -= 1;
            } else {
              // A completed label (or any other statement-level colon) ends the candidate
              // segment.  The next case/default token is therefore considered on its own,
              // regardless of whether the previous clause ended with `foo`, `call()`, `[x]`,
              // or a literal and relied on ASI.
              labelStart = -1;
            }
            continue;
          }
          // Case/default is a statement-list label whenever it is at depth zero in the
          // containing switch body.  Do not require a separator before it: JavaScript permits
          // ASI between the previous clause's final expression and the next label.  A member
          // property such as `object.default:` is not a label, even though its token is at the
          // same delimiter depth.
          const beforeKeyword = previousSignificant(cursor);
          const isMemberProperty = beforeKeyword >= 0
            && (source[beforeKeyword] === '.' || source[beforeKeyword] === '#');
          if (!isMemberProperty && (keywordAt(cursor, 'case') || keywordAt(cursor, 'default'))) {
            labelStart = cursor;
            continue;
          }
        }
        if ('([{'.includes(character)) {
          groupStack.push(character);
        } else if (')]}'.includes(character)) {
          const expected = { ')': '(', ']': '[', '}': '{' }[character];
          if (groupStack.at(-1) === expected) groupStack.pop();
        }
      }
      if (labelStart < 0) return false;
      const segment = source.slice(labelStart, colon).trim();
      return /^default$/u.test(segment) || /^case\b[\s\S]*\S/u.test(segment);
    };
    const isCompletedPostfixUpdate = (operatorStart) => {
      const operator = source.slice(operatorStart, operatorStart + 2);
      if (operator !== '++' && operator !== '--') return false;
      const operand = previousSignificant(operatorStart);
      if (operand < 0 || hasLineTerminator(operand + 1, operatorStart)) return false;
      return identifierPartBefore(operand + 1) || ')]}'.includes(source[operand]);
    };
    const statementBoundaryBefore = (index) => {
      const previous = previousSignificant(index);
      if (previous < 0 || ';{}'.includes(source[previous])) return true;
      if (source[previous] === ':') return isSwitchLabelColon(previous);
      if (!hasLineTerminator(previous + 1, index)) return false;
      if ((source[previous] === '+' || source[previous] === '-')
        && isCompletedPostfixUpdate(previous - 1)) return true;
      return !'=,+-*/%&|^!?<>.:([['.includes(source[previous]);
    };
    const beforeClass = previousSignificant(classStart);
    if (beforeClass >= 0 && (source[beforeClass] === '.' || source[beforeClass] === '#')) return false;
    const modifier = previousWordAt(classStart);
    if (modifier?.value === 'export') return statementBoundaryBefore(modifier.start);
    if (modifier?.value === 'default') {
      const exportModifier = previousWordAt(modifier.start);
      if (exportModifier?.value === 'export') return statementBoundaryBefore(exportModifier.start);
    }
    // Anonymous classes are expressions except for the module-only `export default class {}`.
    // Named classes can be declarations at a statement boundary, including Unicode and escaped
    // bindings recognized by classHeaderInfo's bounded identifier scanner.
    return hasName && statementBoundaryBefore(classStart);
  };
  const isStatementBlockClose = (index) => {
    if (source[index] !== '}') return false;
    let depth = 0;
    let opening = -1;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (source[cursor] === '}') depth += 1;
      else if (source[cursor] === '{') {
        depth -= 1;
        if (depth === 0) {
          opening = cursor;
          break;
        }
      }
    }
    if (opening < 0) return false;
    const beforeOpening = previousSignificant(opening);
    // Resolve class bodies before the generic line-break rule below.  A multiline class
    // expression (`const C = class\nC {}`) must remain an expression boundary, while a class
    // declaration can legitimately end a statement on the same line as the next update.
    if (classHeaderInfo(opening)) return isClassDeclarationBody(opening);
    if (beforeOpening < 0 || hasLineTerminator(beforeOpening + 1, opening)) return true;
    if (source[beforeOpening] === ')') return true;
    if (source[beforeOpening] === '}' || source[beforeOpening] === ';') return true;
    if (beforeOpening > 0 && source[beforeOpening - 1] === '=' && source[beforeOpening] === '>') return true;
    if (isClassDeclarationBody(opening)) return true;
    if (!/[A-Za-z0-9_$]/u.test(source[beforeOpening])) return false;
    let tokenStart = beforeOpening;
    while (tokenStart > 0 && /[A-Za-z0-9_$]/u.test(source[tokenStart - 1])) tokenStart -= 1;
    return statementBlockKeywords.has(source.slice(tokenStart, beforeOpening + 1));
  };
  const prefixUpdate = (index) => {
    const operatorEnd = previousSignificant(index) + 1;
    if (operatorEnd < 2 || !updateRe.test(source.slice(operatorEnd - 2, operatorEnd))) return false;
    const operatorStart = operatorEnd - 2;
    const beforeOperator = previousSignificant(operatorStart);
    if (beforeOperator < 0) return true;
    // A line terminator makes this a new expression, even when the preceding expression ended
    // in a call.  This is the important `call()\n++MODULES.length` case; comments containing a
    // line terminator are covered because their bytes remain visible in `source`.
    if (hasLineTerminator(beforeOperator + 1, operatorStart)) return true;
    if (source[beforeOperator] === '}') return isStatementBlockClose(beforeOperator);
    if (source[beforeOperator] === ')' || source[beforeOperator] === ']') {
      return source[beforeOperator] === ')' && isControlHeaderClose(beforeOperator);
    }
    if (/[A-Za-z0-9_$]/u.test(source[beforeOperator])) {
      let tokenStart = beforeOperator;
      while (tokenStart > 0 && /[A-Za-z0-9_$]/u.test(source[tokenStart - 1])) tokenStart -= 1;
      return statementGroupKeywords.has(source.slice(tokenStart, beforeOperator + 1));
    }
    return true;
  };
  const matchingOpeningParen = (closing) => {
    if (source[closing] !== ')') return -1;
    let depth = 0;
    for (let cursor = closing; cursor >= 0; cursor -= 1) {
      if (source[cursor] === ')') depth += 1;
      else if (source[cursor] === '(') {
        depth -= 1;
        if (depth === 0) return cursor;
      }
    }
    return -1;
  };
  const wordBefore = (index) => {
    let cursor = previousSignificant(index);
    if (cursor < 0 || !/[A-Za-z0-9_$]/u.test(source[cursor])) return null;
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_$]/u.test(source[cursor])) cursor -= 1;
    return source.slice(cursor + 1, end);
  };
  const isControlHeaderClose = (index) => {
    const opening = matchingOpeningParen(index);
    if (opening < 0) return false;
    const keyword = wordBefore(opening);
    if (!new Set(['if', 'while', 'for', 'with', 'catch']).has(keyword)) return false;
    // `obj.if(...)` and `obj?.while(...)` are method calls, not control headers.  Require the
    // keyword token to be in standalone statement syntax rather than merely matching its text.
    let cursor = previousSignificant(opening);
    while (cursor >= 0 && /[A-Za-z0-9_$]/u.test(source[cursor])) cursor -= 1;
    const beforeKeyword = previousSignificant(cursor + 1);
    // Property/private names can legally be keywords (`obj.if()`, `obj?.if()`, `this.#if()`).
    // None of these calls is a control header, even though the final word before `(` is `if`.
    return beforeKeyword < 0 || !'.#?'.includes(source[beforeKeyword]);
  };
  const quotedBracketProperty = (opening, closing) => {
    // `source` intentionally masks string literals, so consult the offset-preserving raw source
    // only for the tiny quoted-property form.  A comment or expression inside the brackets is
    // not treated as a statically-known mutator name.
    const content = stripJsComments(rawSource.slice(opening + 1, closing));
    const match = content.match(/^\s*(['"])([A-Za-z_$][A-Za-z0-9_$]*)\1\s*$/u);
    return match ? match[2] : null;
  };
  const parseDirectReference = (index, name) => {
    let cursor = index + name.length;
    let referenceEnd = cursor;
    let outerParens = 0;
    let beforeRoot = previousSignificant(index);
    while (beforeRoot >= 0 && source[beforeRoot] === '(') {
      outerParens += 1;
      beforeRoot = previousSignificant(beforeRoot);
    }
    // A call argument is not a parenthesized direct reference: `factory(MODULES).push()`
    // mutates the factory result, not MODULES.  If the outermost adjacent opening parenthesis is
    // preceded by an ordinary identifier/closing delimiter, reserve it for that call.  Language
    // keywords and operators still permit the normal grouping form `(MODULES).push()`.
    if (outerParens > 0 && beforeRoot >= 0
      && (/[A-Za-z0-9_$]/u.test(source[beforeRoot]) || ')]'.includes(source[beforeRoot]))) {
      let tokenStart = beforeRoot;
      while (tokenStart > 0 && /[A-Za-z0-9_$]/u.test(source[tokenStart - 1])) tokenStart -= 1;
      const token = source.slice(tokenStart, beforeRoot + 1);
      if (!((source[beforeRoot] === ')' && isControlHeaderClose(beforeRoot))
        || statementGroupKeywords.has(token))) outerParens -= 1;
    }
    const properties = [];
    while (true) {
      cursor = skipWhitespace(cursor);
      if (source[cursor] === '[') {
        const closing = findMatchingDelimiter(source, cursor, '[', ']');
        if (closing < 0) return null;
        properties.push(quotedBracketProperty(cursor, closing));
        cursor = closing + 1;
        referenceEnd = cursor;
        continue;
      }
      if (source[cursor] === '.') {
        const propertyStart = skipWhitespace(cursor + 1);
        const property = source.slice(propertyStart).match(/^[A-Za-z_$][A-Za-z0-9_$]*/u);
        if (!property) return null;
        properties.push(property[0]);
        cursor = propertyStart + property[0].length;
        referenceEnd = cursor;
        continue;
      }
      // Parentheses enclosing the complete reference are part of the direct expression, not a
      // scope boundary: `(MODULES[0].categories).push()` and `(... )++` must be checked.  Consume
      // only parentheses that actually opened adjacent to this root; a surrounding call's `)` is
      // not a continuation of the reference.
      cursor = skipWhitespace(cursor);
      while (outerParens > 0 && source[cursor] === ')') {
        outerParens -= 1;
        cursor = skipWhitespace(cursor + 1);
        referenceEnd = cursor;
      }
      if (source[cursor] === '[' || source[cursor] === '.') continue;
      break;
    }
    // Keep the end before trailing trivia.  In particular, a newline (including one inside a
    // masked comment) must remain visible to the postfix-update LineTerminator check below.
    return { end: referenceEnd, properties };
  };
  const declarationRe = () => /\b(?:const|let|var)\s*$/;
  for (const name of names) {
    // Root/property matching is intentionally literal.  This static parser does not decode
    // escaped root or property spellings (`\\u004dODULES`); deepFreezeRecords remains the
    // runtime backstop for aliases or indirect references that static analysis cannot prove.
    for (let index = source.indexOf(name); index >= 0; index = source.indexOf(name, index + name.length)) {
      if (identifierPartBefore(index) || identifierPartAt(index + name.length)) continue;
      const before = source.slice(Math.max(0, index - 40), index);
      let previous = index - 1;
      while (previous >= 0 && /\s/u.test(source[previous])) previous -= 1;
      if (source[previous] === '.') continue;
      if (declarationRe().test(before)) continue;
      const reference = parseDirectReference(index, name);
      if (!reference) continue;
      const remainder = source.slice(reference.end);
      const lastProperty = reference.properties.at(-1);
      const methodCall = /^\s*\(/u.test(remainder) && mutators.has(lastProperty);
      if (methodCall) {
        errors.push(`workflow ${name}.${lastProperty}() mutates declarative audit data`);
        continue;
      }
      if (assignmentRe.test(remainder.replace(/^\s*/u, ''))) {
        errors.push(`workflow ${name} has an executable post-initialization assignment`);
        continue;
      }
      const remainderStart = reference.end + (remainder.match(/^\s*/u)?.[0].length ?? 0);
      if (!hasLineTerminator(reference.end, remainderStart)
        && updateRe.test(source.slice(remainderStart))) {
        errors.push(`workflow ${name} has an executable increment/decrement mutation`);
        continue;
      }
      if (prefixUpdate(index)) {
        errors.push(`workflow ${name} has an executable increment/decrement mutation`);
      }
    }
  }
  const deleteRe = new RegExp(`\\bdelete\\s+${rootChainRe}`, 'u');
  if (deleteRe.test(source)) errors.push('workflow cannot delete from MODULES or AUDIT_UNITS');
  const reflectSetRe = new RegExp(`\\bReflect\\s*\\.\\s*set\\s*\\(\\s*${rootChainRe}\\s*,`, 'u');
  if (reflectSetRe.test(source)) errors.push('workflow cannot use Reflect.set on MODULES or AUDIT_UNITS');
}
workflowMutationCheck(executableWorkflowCode, ['MODULES', 'AUDIT_UNITS'], workflow);

const labels = new Set();
for (const unit of auditUnits) {
  if (labels.has(unit.label)) errors.push(`workflow AUDIT_UNITS contains duplicate label ${unit.label}`);
  labels.add(unit.label);
  if (!workflowModuleCategories.has(unit.module)) errors.push(`workflow AUDIT_UNITS references unknown module ${unit.module}`);
}
// Keep the fan-out policy executable and reviewable: changing a label's module, category slice,
// required artifact set, or documentation obligation must be an intentional validator change,
// not a silent reshuffle of work between agents.
const auditUnitPolicy = new Map([
  ['async/discipline', { module: 'async.md', onlyCategories: 'B2, B3, B3a, B8, B11, B21, B22, B23', groups: [], requiresDocs: false }],
  ['async/machinery', { module: 'async.md', onlyCategories: 'B15a–e, C3, C9, E1', groups: [], requiresDocs: false }],
  ['concurrency', { module: 'concurrency-and-state.md', groups: [], requiresDocs: false }],
  ['data-types', { module: 'data-and-types.md', groups: [], requiresDocs: false }],
  ['security', { module: 'security.md', groups: ['manifests', 'configs'], requiresDocs: false }],
  ['unsafe-ffi', { module: 'unsafe-and-ffi.md', groups: ['manifests', 'configs', 'scripts', 'ffi'], requiresDocs: false }],
  ['drop-raii', { module: 'drop-and-raii.md', groups: [], requiresDocs: false }],
  ['deps-macros', { module: 'deps-macros-ergonomics.md', groups: ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts'], requiresDocs: false }],
  ['lifetimes-api', { module: 'lifetimes-and-api.md', groups: ['manifests', 'toolchains'], requiresDocs: false }],
  ['testing', { module: 'testing.md', groups: ['configs', 'ci', 'scripts'], requiresDocs: false }],
  ['semantics', { module: 'semantics-and-conformance.md', groups: [], requiresDocs: true }],
]);
const allowedArtifactGroups = new Set(['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts', 'ffi']);
if (auditUnits.length !== auditUnitPolicy.size) errors.push('workflow AUDIT_UNITS does not contain exactly the policy-matrix labels');
for (const unit of auditUnits) {
  const expected = auditUnitPolicy.get(unit.label);
  if (!expected) {
    errors.push(`workflow AUDIT_UNITS contains label outside the policy matrix: ${unit.label}`);
    continue;
  }
  if (unit.module !== expected.module) errors.push(`workflow AUDIT_UNITS label ${unit.label} must target ${expected.module}`);
  if ((unit.onlyCategories ?? undefined) !== (expected.onlyCategories ?? undefined)) errors.push(`workflow AUDIT_UNITS label ${unit.label} has an unexpected onlyCategories slice`);
  const groups = unit.requiredArtifactGroups;
  if (groups.some((group) => !allowedArtifactGroups.has(group))) errors.push(`workflow AUDIT_UNITS label ${unit.label} has an unsupported required artifact group`);
  if (new Set(groups).size !== groups.length) errors.push(`workflow AUDIT_UNITS label ${unit.label} repeats a required artifact group`);
  if (groups.length !== expected.groups.length || groups.some((group, index) => group !== expected.groups[index])) {
    errors.push(`workflow AUDIT_UNITS label ${unit.label} has the wrong required artifact groups`);
  }
  if (unit.requiresDocs !== expected.requiresDocs) errors.push(`workflow AUDIT_UNITS label ${unit.label} has the wrong requiresDocs policy`);
}
for (const [label] of auditUnitPolicy) if (!labels.has(label)) errors.push(`workflow AUDIT_UNITS is missing policy-matrix label ${label}`);

function expandOnlyCategories(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const expanded = [];
  for (const raw of text.split(',')) {
    const token = raw.trim();
    const match = token.match(/^([A-Z]\d+)([a-z])?(?:\s*[\u2013-]\s*([a-z]))?$/);
    if (!match || (match[3] && !match[2])) return null;
    const [, base, first, last] = match;
    if (!last) expanded.push(base + (first || ''));
    else {
      // Match the category-map notation (§B15 (a–e)): a family range covers its parent id as
      // well as each lettered subsection.
      expanded.push(base);
      for (let code = first.charCodeAt(0); code <= last.charCodeAt(0); code += 1) expanded.push(base + String.fromCharCode(code));
    }
  }
  return expanded;
}
for (const module of workflowModuleCategories.keys()) {
  const units = auditUnits.filter((unit) => unit.module === module);
  if (!units.length) { errors.push(`workflow AUDIT_UNITS has no unit for ${module}`); continue; }
  if (module !== 'async.md') {
    if (units.length !== 1) errors.push(`workflow module ${module} must have exactly one full audit unit`);
    else if (units[0].onlyCategories !== undefined) errors.push(`workflow module ${module} must not use onlyCategories`);
    continue;
  }
  const partial = units.filter((unit) => unit.onlyCategories !== undefined);
  const full = units.filter((unit) => unit.onlyCategories === undefined);
  if (partial.length && full.length) errors.push('workflow async.md mixes full and partial audit units');
  if (!partial.length && full.length !== 1) errors.push('workflow async.md must have exactly one full unit when unsplit');
  const expected = workflowModuleCategories.get(module);
  const covered = new Set();
  for (const unit of partial) {
    const ids = expandOnlyCategories(unit.onlyCategories);
    if (!ids) { errors.push(`workflow AUDIT_UNITS unit ${unit.label} has invalid onlyCategories`); continue; }
    for (const id of ids) {
      if (covered.has(id)) errors.push(`workflow async.md partial units overlap on category ${id}`);
      covered.add(id);
      if (!expected.has(id)) errors.push(`workflow async.md unit ${unit.label} references category ${id} not owned by MODULES`);
    }
  }
  if (partial.length) for (const id of expected) if (!covered.has(id)) errors.push(`workflow async.md partial units omit category ${id}`);
}

// Category-id parity between SKILL.md's "Category map" table and the workflow's MODULES list.
// The workflow's slicer routes trigger rows and 🔴 items to each audit unit using ONLY the
// category ids listed in MODULES (skill/audit-project.workflow.js) — SKILL.md's table is the
// spec of record, but nothing enforced that a category added there also reached the workflow.
// That is exactly the gap that let §C12/§C12a ship invisible to the fan-out audit in v0.6.0:
// the category existed, its module file was already wired, but its id was absent from the
// module's category list, so the slicer never extracted its trigger rows or 🔴 items for it.
// Parse the category-map cell while exposing any unconsumed bytes, so a malformed cell cannot
// appear to contain a valid subset.
function parseCategoryCell(cellText) {
  const ids = [];
  let cursor = 0;
  const fail = () => ({ ids, residue: cellText.slice(cursor).trim() || 'invalid category cell' });
  while (cursor < cellText.length) {
    while (/\s/.test(cellText[cursor] || '')) cursor += 1;
    if (cellText[cursor] !== '\u00a7') return fail();
    cursor += 1;
    const baseMatch = cellText.slice(cursor).match(/^([A-Z]\d+)([a-z])?/);
    if (!baseMatch) return fail();
    const [, base, trailingLetter] = baseMatch;
    cursor += baseMatch[0].length;
    if (trailingLetter) ids.push(base + trailingLetter);
    else {
      ids.push(base);
      while (/\s/.test(cellText[cursor] || '')) cursor += 1;
      if (cellText[cursor] === '(') {
        const close = cellText.indexOf(')', cursor + 1);
        if (close < 0) return fail();
        const suffix = cellText.slice(cursor + 1, close).trim();
        const parts = suffix.split(',').map((part) => part.trim());
        if (!suffix || parts.some((part) => !/^[a-z](?:[\u2013-][a-z])?$/.test(part))) return fail();
        for (const part of parts) {
          const range = part.match(/^([a-z])[\u2013-]([a-z])$/);
          if (range) {
            if (range[1] > range[2]) return fail();
            for (let c = range[1].charCodeAt(0); c <= range[2].charCodeAt(0); c += 1) ids.push(base + String.fromCharCode(c));
          } else ids.push(base + part);
        }
        cursor = close + 1;
      }
    }
    while (/\s/.test(cellText[cursor] || '')) cursor += 1;
    if (cursor >= cellText.length) break;
    if (cellText[cursor] !== ',') return fail();
    cursor += 1;
    while (/\s/.test(cellText[cursor] || '')) cursor += 1;
    if (cursor >= cellText.length) return fail();
  }
  return { ids, residue: '' };
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
const specCategoryOwners = new Map();
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
  const parsedCell = parseCategoryCell(cell);
  if (parsedCell.residue || parsedCell.ids.length === 0) {
    errors.push(`skill/SKILL.md:${lineNumber + 1}: Category map cell must contain at least one fully parsed category id${parsedCell.residue ? ` (unparsed residue: ${parsedCell.residue})` : ''}`);
    continue;
  }
  const ids = parsedCell.ids;
  if (!specModuleCategories.has(file)) specModuleCategories.set(file, new Set());
  for (const id of ids) {
    const previous = specCategoryOwners.get(id);
    if (previous) {
      errors.push(`SKILL.md category map contains duplicate §${id}: ${previous.file} (line ${previous.line}) and ${file} (line ${lineNumber + 1})`);
    } else {
      specCategoryOwners.set(id, { file, line: lineNumber + 1 });
    }
    specModuleCategories.get(file).add(id);
  }
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
const moduleHeaderOwners = new Map();
for (const file of relativeFiles(canonicalSkill).filter((f) => f.endsWith('.md') && f !== 'SKILL.md' && !f.startsWith('references' + path.sep))) {
  const body = fs.readFileSync(path.join(canonicalSkill, file), 'utf8');
  const lines = splitGfmLines(body);
  const fenceMask = buildFenceMask(lines);
  const ids = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!fenceMask[i]) {
      const match = lines[i].match(/^ {0,3}#{2,3} §([A-Z]\d+[a-z]*)\.\s/);
      if (match) {
        const id = match[1];
        const previous = moduleHeaderOwners.get(id);
        if (previous) {
          errors.push(`live module headings contain duplicate §${id}: ${previous.file} (line ${previous.line}) and ${file} (line ${i + 1})`);
        } else {
          moduleHeaderOwners.set(id, { file, line: i + 1 });
        }
        ids.add(id);
      }
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
      const match = lines[i].match(/^ {0,3}## §([A-Z]\d+)\.\s/);
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
  // Accept up to three literal spaces for recognition only.  The contract remains strict about
  // column one, but recognizing the anchored row lets the diagnostic identify the whitespace
  // violation instead of degrading into a missing-anchor or wrong-width error.
  const indentation = line.match(/^ {1,3}(?=\|)/)?.[0] || '';
  const normalized = indentation ? line.slice(indentation.length) : line;
  const rawLeadingPipe = line.startsWith('|');
  const startsWithPipe = normalized.startsWith('|');
  return {
    rawLeadingPipe,
    leadingWhitespace: indentation,
    cells: splitTableCells(startsWithPipe ? normalized.slice(1) : normalized),
  };
}
function leadingPipeDiagnostic(role, row) {
  return row.leadingWhitespace
    ? `skill/SKILL.md: table ${role} row has ${row.leadingWhitespace.length} leading space(s) before its required column-1 \`|\` — repository trigger tables require raw column-1 pipes`
    : `skill/SKILL.md: table ${role} row missing its leading \`|\` — repository trigger tables require raw column-1 pipes`;
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
  // First collect accepted code-span intervals.  The outside walk intentionally examines raw
  // characters: a backslash can change CommonMark tokenization, but it must not hide a project-
  // banned `<`, `[` or URI/email token (for example `\\<custom>` remains unsupported here).
  const spans = [];
  codeSpanTokens(text, undefined, (start, end) => spans.push([start, end]));
  let reason = null;
  let spanIndex = 0;
  let plain = '';
  for (let i = 0; i < text.length; i += 1) {
    if (spanIndex < spans.length && i === spans[spanIndex][0]) {
      i = spans[spanIndex][1] - 1;
      plain += '\0';
      spanIndex += 1;
      continue;
    }
    const character = text[i];
    plain += character;
    if (reason) continue;
    if (character === '<') reason = 'raw inline HTML/angle-leading construct';
    else if (character === '[' || (character === '!' && text[i + 1] === '[')) reason = 'link/image/reference';
  }
  if (!reason) {
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
  if (!header.rawLeadingPipe) errors.push(`skill/SKILL.md:${headerIndex + 1}: ${leadingPipeDiagnostic('header', header).replace('skill/SKILL.md: ', '')}`);
  const delimiterIndex = headerIndex + 1;
  const delimiter = delimiterIndex < skillSource.length ? contractRow(skillSource[delimiterIndex]) : null;
  if (tableFenceMask[headerIndex] || tableFenceMask[delimiterIndex]) errors.push(`skill/SKILL.md:${delimiterIndex + 1}: ${contract.name} table scaffold must remain outside supported fences`);
  if (!delimiter || !isDelimiterCells(delimiter.cells, contract.width)) {
    errors.push(`skill/SKILL.md:${delimiterIndex + 1}: ${contract.name} table delimiter row has wrong width or syntax`);
  } else if (!delimiter.rawLeadingPipe) {
    errors.push(`skill/SKILL.md:${delimiterIndex + 1}: ${leadingPipeDiagnostic('delimiter', delimiter).replace('skill/SKILL.md: ', '')}`);
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
      errors.push(`skill/SKILL.md:${i + 1}: ${leadingPipeDiagnostic('body', row).replace('skill/SKILL.md: ', '')}`);
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

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    errors.push(`${name} must be a positive integer in milliseconds; using the default watchdog`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    errors.push(`${name} must be a safe positive integer in milliseconds; using the default watchdog`);
    return fallback;
  }
  return value;
}

// RUST_INTEL_SKIP_NESTED_FIXTURES breaks a self-spawn cycle: validate-fixtures.mjs's README.md
// negative control spawns this script against a deliberately mutated repo state to prove the
// category-count check fails — and this script would otherwise spawn validate-fixtures.mjs right
// back, which runs that same negative control again, spawning this script again, without end.
const skipNestedFixtures = process.env.RUST_INTEL_SKIP_NESTED_FIXTURES;
if (skipNestedFixtures !== undefined && skipNestedFixtures !== '' && skipNestedFixtures !== '0' && skipNestedFixtures !== '1') {
  errors.push('RUST_INTEL_SKIP_NESTED_FIXTURES must be exactly 1 to skip nested fixtures, or 0/unset to run them');
}
if (skipNestedFixtures !== '1') {
  const fixtureWatchdogMs = positiveIntegerEnv('RUST_INTEL_FIXTURE_WATCHDOG_MS', 15 * 60 * 1000);
  const fixtureRun = runNodeProbe([path.join(root, 'dev/validate-fixtures.mjs')], fixtureWatchdogMs);
  const fixtureOutput = fixtureRun.output;
  if (fixtureRun.error) {
    errors.push(`fixture validation failed to start or its watchdog expired after ${fixtureWatchdogMs}ms: ${fixtureRun.error.message}${fixtureOutput ? ` (${fixtureOutput})` : ''}`);
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
