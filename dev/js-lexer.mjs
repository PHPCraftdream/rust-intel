// Small, offset-preserving JavaScript lexical helpers shared by the repository validator and
// fixture runner. This is intentionally not a parser: it only masks non-code regions well enough
// for bounded source-contract checks.

export function isJsLineTerminator(character) {
  return character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029';
}

// A slash after an expression is division; after an assignment/operator or at the start of a
// statement it starts a regexp literal. Distinguish postfix ++/-- from unary/binary operators,
// and recognize regexp expression statements after do/else.
export function isRegexLiteralStart(source, index) {
  let i = index - 1;
  while (i >= 0 && /\s/u.test(source[i])) i -= 1;
  if (i < 0) return true;
  const previous = source[i];
  if ((previous === '+' || previous === '-') && source[i - 1] === previous) return false;
  if ('=([{,:;!&|?+-*%^~<>'.includes(previous)) return true;
  // A regexp may begin in statement position immediately after a control-header `)`:
  // `if (ready) /[/]/.test(value)`. A call followed by division (`factory() / 2`) is division.
  if (previous === ')') {
    let lineStart = index - 1;
    while (lineStart >= 0 && !isJsLineTerminator(source[lineStart])) lineStart -= 1;
    const prefix = source.slice(lineStart + 1, index);
    if (/\b(?:if|while|for|with|switch|catch)\s*\([^\r\u2028\u2029]*\)\s*$/u.test(prefix)) return true;
  }
  const word = source.slice(Math.max(0, i - 12), i + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/u)?.[0];
  return ['return', 'case', 'throw', 'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'yield', 'await', 'do', 'else'].includes(word);
}

export function maskJsNonCode(source, { preserveLineComments = false } = {}) {
  // Keep UTF-16 code-unit offsets identical to `source`: Array.from() would collapse astral
  // characters and shift every later structural index.
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
      } else if (character === quote) return index + 1;
      else index += 1;
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
        if (!preserveLineComments) blankRange(index, index + 2);
        index += 2;
        while (index < source.length && !isJsLineTerminator(source[index])) {
          if (!preserveLineComments) blank(index);
          index += 1;
        }
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

function findMatchingParen(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

function splitArguments(source, start, end) {
  const ranges = [];
  let argumentStart = start;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;
    else if (character === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      ranges.push([argumentStart, index]);
      argumentStart = index + 1;
    }
  }
  ranges.push([argumentStart, end]);
  return ranges;
}

function stripBalancedParens(source, start, end) {
  while (true) {
    while (start < end && /\s/u.test(source[start])) start += 1;
    while (end > start && /\s/u.test(source[end - 1])) end -= 1;
    if (source[start] !== '(' || findMatchingParen(source, start) !== end - 1) return source.slice(start, end).trim();
    start += 1;
    end -= 1;
  }
}

export function literalTrueCompletionViolations(source) {
  const executable = maskJsNonCode(source);
  const violations = [];
  for (const match of executable.matchAll(/\bcompleteCurrentControlScope\s*\(/gu)) {
    const openIndex = executable.indexOf('(', match.index);
    const closeIndex = findMatchingParen(executable, openIndex);
    if (closeIndex < 0) continue;
    const argumentsRanges = splitArguments(executable, openIndex + 1, closeIndex);
    if (argumentsRanges.length < 2) continue;
    const [, second] = argumentsRanges;
    if (/^true$/u.test(stripBalancedParens(executable, second[0], second[1]))) {
      const id = Number.parseInt(executable.slice(argumentsRanges[0][0], argumentsRanges[0][1]).trim(), 10);
      if (Number.isSafeInteger(id)) violations.push(id);
    }
  }
  return violations;
}
