// Small, offset-preserving JavaScript lexical helpers shared by the repository validator and
// fixture runner. This is not a parser. It tracks enough token context for source-contract checks,
// in one iterative pass, with bounded work and nesting. Every returned string keeps UTF-16 offsets.

export function isJsLineTerminator(character) {
  return character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029';
}

const lexicalCache = new Map();
const MAX_LEXICAL_OPERATIONS = 2_000_000;
const MAX_LEXICAL_DEPTH = 100_000;

function isIdentifierStart(character) {
  return character !== undefined && /[A-Za-z_$\p{ID_Start}]/u.test(character);
}

function isIdentifierContinue(character) {
  return character !== undefined && /[A-Za-z0-9_$\u200C\u200D\p{ID_Continue}]/u.test(character);
}

function isControlKeyword(word) {
  return word === 'if' || word === 'while' || word === 'for' || word === 'with'
    || word === 'switch' || word === 'catch';
}

function isExpressionPrefixKeyword(word) {
  return word === 'return' || word === 'throw' || word === 'case' || word === 'delete'
    || word === 'typeof' || word === 'void' || word === 'new' || word === 'in'
    || word === 'instanceof' || word === 'yield' || word === 'await' || word === 'do'
    || word === 'else' || word === 'break' || word === 'continue';
}

function scanLexical(source) {
  const cached = lexicalCache.get(source);
  if (cached) return cached;
  const regexStarts = new Uint8Array(source.length);
  const masked = source.split('');
  const blank = (position) => {
    if (!isJsLineTerminator(source[position])) masked[position] = ' ';
  };
  const blankRange = (start, end) => {
    for (let position = start; position < end; position += 1) blank(position);
  };
  const stack = [];
  const modeStack = [];
  const lineCommentRanges = [];
  let mode = 'code';
  let canStartRegex = true;
  let previousWord = '';
  let previousWasDot = false;
  let previousToken = '';
  let operations = 0;
  let index = 0;
  const step = () => {
    operations += 1;
    if (operations > MAX_LEXICAL_OPERATIONS) throw new Error('JavaScript lexical scan exceeded its deterministic budget');
  };
  const push = (entry) => {
    if (stack.length >= MAX_LEXICAL_DEPTH) throw new Error('JavaScript lexical nesting exceeded its deterministic budget');
    stack.push(entry);
  };
  const skipQuoted = (quote) => {
    while (index < source.length) {
      step();
      const character = source[index];
      blank(index);
      if (character === '\\' && index + 1 < source.length) { blank(index + 1); index += 2; continue; }
      index += 1;
      if (character === quote) return;
    }
  };
  const skipRegex = () => {
    let inClass = false;
    while (index < source.length) {
      step();
      const character = source[index];
      blank(index);
      if (character === '\\' && index + 1 < source.length) { blank(index + 1); index += 2; continue; }
      if (character === '[') inClass = true;
      else if (character === ']' && inClass) inClass = false;
      else if (character === '/' && !inClass) {
        index += 1;
        while (index < source.length && /[A-Za-z]/u.test(source[index])) { blank(index); index += 1; step(); }
        canStartRegex = false;
        previousWord = '';
        previousWasDot = false;
        return;
      }
      index += 1;
    }
  };
  const enterTemplate = () => {
    modeStack.push(mode);
    mode = 'template';
    canStartRegex = false;
    previousWord = '';
    previousWasDot = false;
  };
  const leaveTemplate = () => {
    mode = modeStack.pop() || 'code';
    canStartRegex = false;
    previousWord = '';
    previousWasDot = false;
  };

  while (index < source.length) {
    step();
    const character = source[index];
    const next = source[index + 1];
    if (mode === 'template') {
      if (character === '\\' && index + 1 < source.length) { blankRange(index, index + 2); index += 2; continue; }
      if (character === '`') { blank(index); index += 1; leaveTemplate(); continue; }
      if (character === '$' && next === '{') {
        // Keep interpolation braces so balanced-argument scans distinguish commas inside `${...}`.
        blank(index);
        index += 2;
        push({ type: 'template', returnMode: 'template' });
        mode = 'code';
        canStartRegex = true;
        previousWord = '';
        previousWasDot = false;
        continue;
      }
      blank(index);
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      const commentStart = index;
      blankRange(index, index + 2); index += 2;
      while (index < source.length && !isJsLineTerminator(source[index])) { blank(index); index += 1; step(); }
      lineCommentRanges.push([commentStart, index]);
      continue;
    }
    if (character === '/' && next === '*') {
      blankRange(index, index + 2); index += 2;
      while (index < source.length) {
        step();
        if (source[index] === '*' && source[index + 1] === '/') { blankRange(index, index + 2); index += 2; break; }
        blank(index); index += 1;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      blank(index);
      index += 1;
      skipQuoted(character); canStartRegex = false; previousWord = ''; previousWasDot = false; previousToken = 'literal'; continue;
    }
    if (character === '`') { blank(index); index += 1; enterTemplate(); previousToken = 'literal'; continue; }

    if (isJsLineTerminator(character) || /\s/u.test(character)) { index += 1; continue; }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierContinue(source[index])) { index += 1; step(); }
      const word = source.slice(start, index);
      const propertyName = previousWasDot;
      previousWasDot = false;
      previousWord = word;
      canStartRegex = !propertyName && isExpressionPrefixKeyword(word);
      previousToken = 'word';
      continue;
    }
    if (/[0-9]/u.test(character) || (character === '.' && /[0-9]/u.test(next))) {
      index += 1;
      while (index < source.length && /[A-Za-z0-9._]/u.test(source[index])) { index += 1; step(); }
      canStartRegex = false; previousWord = ''; previousWasDot = false; previousToken = 'number'; continue;
    }

    if (character === '/' && canStartRegex) {
      regexStarts[index] = 1;
      blank(index);
      index += 1;
      skipRegex();
      continue;
    }

    if (character === '(') {
      push({ type: 'paren', control: !previousWasDot && isControlKeyword(previousWord) });
      canStartRegex = true; previousWord = ''; previousWasDot = false; previousToken = '('; index += 1; continue;
    }
    if (character === '[') {
      push({ type: 'bracket' }); canStartRegex = true; previousWord = ''; previousWasDot = false; previousToken = '['; index += 1; continue;
    }
    if (character === '{') {
      const block = previousWord === 'else' || previousWord === 'do' || previousWord === 'try'
        || previousWord === 'finally' || previousWord === 'class' || previousToken === ')'
        || previousToken === '}' || previousToken === ';' || previousToken === '=>'
        || (previousToken === '' && stack.length === 0);
      push({ type: 'brace', block }); canStartRegex = true; previousWord = ''; previousWasDot = false; previousToken = '{'; index += 1; continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      const expected = character === ')' ? 'paren' : character === ']' ? 'bracket' : 'brace';
      let entry = null;
      for (let cursor = stack.length - 1; cursor >= 0; cursor -= 1) {
        if (stack[cursor].type === expected || (character === '}' && stack[cursor].type === 'template')) {
          entry = stack.splice(cursor, 1)[0]; break;
        }
      }
      if (entry?.type === 'template') { mode = entry.returnMode; canStartRegex = false; }
      else if (character === ')') canStartRegex = Boolean(entry?.control);
      else if (character === '}') canStartRegex = Boolean(entry?.block);
      else canStartRegex = false;
      previousWord = ''; previousWasDot = false; previousToken = character; index += 1; continue;
    }

    const two = source.slice(index, index + 2);
    if (two === '++' || two === '--') { index += 2; canStartRegex = false; previousWord = ''; previousWasDot = false; previousToken = two; continue; }
    if (character === '.') { index += 1; canStartRegex = false; previousWord = ''; previousWasDot = true; previousToken = '.'; continue; }
    // Operators and statement separators permit an expression next. Keeping this decision here
    // means `/` after division is recognized as a regexp without inspecting an ever-growing prefix.
    canStartRegex = true;
    previousWord = '';
    previousWasDot = false;
    previousToken = two;
    index += ['=>', '&&', '||', '??', '**', '==', '!=', '<=', '>=', '<<', '>>', '?.'].includes(two) ? 2 : 1;
  }
  const result = { regexStarts, masked: masked.join(''), lineCommentRanges };
  lexicalCache.set(source, result);
  return result;
}

export function isRegexLiteralStart(source, index) {
  return Boolean(scanLexical(source).regexStarts[index]);
}

export function maskJsNonCode(source, { preserveLineComments = false } = {}) {
  const result = scanLexical(source);
  if (!preserveLineComments) return result.masked;
  const output = result.masked.split('');
  for (const [start, end] of result.lineCommentRanges) {
    for (let index = start; index < end; index += 1) output[index] = source[index];
  }
  return output.join('');
}

function matchingParentheses(masked) {
  const openings = [];
  const matching = new Map();
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === '(') openings.push(index);
    else if (masked[index] === ')' && openings.length) {
      const opening = openings.pop();
      matching.set(opening, index);
    }
  }
  return matching;
}

function splitArguments(masked, start, end) {
  const ranges = [];
  let argumentStart = start;
  let parenDepth = 0; let bracketDepth = 0; let braceDepth = 0;
  for (let index = start; index < end; index += 1) {
    const character = masked[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;
    else if (character === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      ranges.push([argumentStart, index]); argumentStart = index + 1;
    }
  }
  ranges.push([argumentStart, end]);
  return ranges;
}

function stripBalancedParens(masked, start, end, matching) {
  while (true) {
    while (start < end && /\s/u.test(masked[start])) start += 1;
    while (end > start && /\s/u.test(masked[end - 1])) end -= 1;
    if (masked[start] !== '(' || matching.get(start) !== end - 1) return masked.slice(start, end).trim();
    start += 1; end -= 1;
  }
}

function completionDiagnostics(source) {
  const executable = maskJsNonCode(source);
  const matching = matchingParentheses(executable);
  const diagnostics = [];
  const candidate = /(?:\(\s*)*(?:completeCurrentControlScope|completeCurrentControlSc\\u(?:\{0*6[fF]\}|0*6[fF])pe)\s*(?:\)\s*)*(?:\?\.\s*)?\(/gu;
  for (const match of executable.matchAll(candidate)) {
    const start = match.index;
    if (executable[start - 1] === '.' || /[A-Za-z0-9_$]/u.test(executable[start - 1] || '')) continue;
    const openIndex = executable.indexOf('(', start + match[0].length - 1);
    const closeIndex = matching.get(openIndex) ?? -1;
    if (closeIndex < 0) continue;
    const ranges = splitArguments(executable, openIndex + 1, closeIndex);
    if (ranges.length < 2 || stripBalancedParens(executable, ranges[1][0], ranges[1][1], matching) !== 'true') continue;
    const first = stripBalancedParens(executable, ranges[0][0], ranges[0][1], matching);
    const idMatch = /^(?:0|[1-9][0-9]*)$/u.exec(first);
    diagnostics.push({ index: start, id: idMatch && Number.isSafeInteger(Number(idMatch[0])) ? Number(idMatch[0]) : null });
  }
  return diagnostics;
}

export function literalTrueCompletionDiagnostics(source) {
  return completionDiagnostics(source);
}

export function literalTrueCompletionViolations(source) {
  return completionDiagnostics(source).map(({ id }) => id).filter((id) => id !== null);
}
