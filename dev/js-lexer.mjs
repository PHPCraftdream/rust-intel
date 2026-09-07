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
  let previousWasProperty = false;
  // A class/function body closes with a different slash role depending on whether its value is
  // a declaration statement or an expression.  Keep that role attached to the construct rather
  // than inferring it from the `)`/identifier immediately before the body: both forms have the
  // same surface tokens, but `function () {} / value` is division while `function f() {} /re/` is
  // a regexp statement.  Class bodies are keyed by the delimiter depth at which their complete
  // header started.  This matters for `class extends mixin({}) {}` and
  // `class extends (class {}) {}`: braces in the heritage expression belong to nested delimiter
  // frames and must not consume the outer class's pending body role.
  // One short stack per delimiter depth keeps lookup and removal O(1) even for adversarial
  // source containing many unfinished class keywords; do not scan all pending constructs here.
  const pendingClassConstructs = new Map();
  let pendingFunctionBodyRole = null;
  let previousWordBeforeToken = '';
  let previousTokenBeforeWord = '';
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
  const declarationOrExpression = (token, word, tokenBeforeWord, wordBeforeWord, enclosingBlock = false) => {
    if (word === 'export' || (word === 'default' && wordBeforeWord === 'export')) return 'declaration';
    if (word === 'async') {
      if (wordBeforeWord === 'export' || wordBeforeWord === 'default') return 'declaration';
      return declarationOrExpression(tokenBeforeWord, wordBeforeWord, '', '', enclosingBlock);
    }
    if (token === '' || token === ';' || token === '}' || (token === '{' && enclosingBlock)) return 'declaration';
    return 'expression';
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
    previousWasProperty = false;
  };
  const leaveTemplate = () => {
    mode = modeStack.pop() || 'code';
    canStartRegex = false;
    previousWord = '';
    previousWasDot = false;
    previousWasProperty = false;
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
      skipQuoted(character); canStartRegex = false; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = 'literal'; continue;
    }
    if (character === '`') { blank(index); index += 1; enterTemplate(); previousToken = 'literal'; continue; }

    if (isJsLineTerminator(character) || /\s/u.test(character)) { index += 1; continue; }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierContinue(source[index])) { index += 1; step(); }
      const word = source.slice(start, index);
      const propertyName = previousWasDot;
      const tokenBeforeWord = previousToken;
      const wordBeforeWord = previousWord;
      const tokenBeforePreviousWord = previousTokenBeforeWord;
      const wordBeforePreviousWord = previousWordBeforeToken;
      previousWasDot = false;
      previousWasProperty = propertyName;
      previousTokenBeforeWord = tokenBeforeWord;
      previousWordBeforeToken = wordBeforeWord;
      previousWord = word;
      if (word === 'class' && !propertyName) {
        const constructs = pendingClassConstructs.get(stack.length) || [];
        constructs.push({
          bodyRole: declarationOrExpression(
            tokenBeforeWord,
            wordBeforeWord,
            tokenBeforePreviousWord,
            wordBeforePreviousWord,
            stack.at(-1)?.type === 'brace' && stack.at(-1).block,
          ),
        });
        pendingClassConstructs.set(stack.length, constructs);
      }
      if (word === 'function' && !propertyName) {
        pendingFunctionBodyRole = declarationOrExpression(
          tokenBeforeWord,
          wordBeforeWord,
          tokenBeforePreviousWord,
          wordBeforePreviousWord,
          stack.at(-1)?.type === 'brace' && stack.at(-1).block,
        );
      }
      canStartRegex = !propertyName && isExpressionPrefixKeyword(word);
      previousToken = 'word';
      continue;
    }
    // A private name is an IdentifierName token, even when its spelling is a reserved word.
    // Carry that property role through the call so `this.#if() / value` cannot be mistaken for
    // a control-header close followed by a regexp.  Keep the hash and name visible to preserve
    // offsets; only the token-role state changes.
    if (character === '#' && isIdentifierStart(next)) {
      index += 1;
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierContinue(source[index])) { index += 1; step(); }
      previousWord = source.slice(start, index);
      previousWasDot = false;
      previousWasProperty = true;
      canStartRegex = false;
      previousToken = 'word';
      continue;
    }
    if (/[0-9]/u.test(character) || (character === '.' && /[0-9]/u.test(next))) {
      index += 1;
      while (index < source.length && /[A-Za-z0-9._]/u.test(source[index])) { index += 1; step(); }
      canStartRegex = false; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = 'number'; continue;
    }

    if (character === '/' && canStartRegex) {
      regexStarts[index] = 1;
      blank(index);
      index += 1;
      skipRegex();
      continue;
    }

    if (character === '(') {
      push({
        type: 'paren',
        control: !previousWasProperty && isControlKeyword(previousWord),
        functionRole: !previousWasProperty && pendingFunctionBodyRole,
      });
      pendingFunctionBodyRole = null;
      canStartRegex = true; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = '('; index += 1; continue;
    }
    if (character === '[') {
      push({ type: 'bracket' }); canStartRegex = true; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = '['; index += 1; continue;
    }
    if (character === '{') {
      // Only a class construct at the current delimiter depth can own this brace.  A brace in
      // `extends mixin({})`, an object literal, or a nested class is therefore left on its own
      // frame; the outer class role is consumed by the later body brace.
      const constructs = pendingClassConstructs.get(stack.length);
      const classConstruct = constructs?.at(-1) || null;
      const bodyRole = classConstruct?.bodyRole || pendingFunctionBodyRole;
      const block = previousWord === 'else' || previousWord === 'do' || previousWord === 'try'
        || previousWord === 'catch' || previousWord === 'finally' || bodyRole !== null || previousToken === ')'
        || previousToken === '}' || previousToken === ';' || previousToken === ':' || previousToken === '=>'
        || (previousToken === '' && stack.length === 0);
      push({
        type: 'brace',
        block,
        closeCanStartRegex: bodyRole === 'expression' ? false : block,
      });
      if (classConstruct) {
        constructs.pop();
        if (constructs.length === 0) pendingClassConstructs.delete(stack.length);
      }
      pendingFunctionBodyRole = null;
      canStartRegex = true; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = '{'; index += 1; continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      const expected = character === ')' ? 'paren' : character === ']' ? 'bracket' : 'brace';
      // Valid JavaScript closes the innermost delimiter.  Searching past a mismatched top entry
      // leaves it on the stack and lets repeated bad closers rescan the same prefix quadratically.
      // Reject malformed nesting immediately; callers already treat a lexical failure as a
      // fail-closed result, and every inspected stack entry is now constant work.
      const entry = stack.at(-1);
      if (!entry || (entry.type !== expected && !(character === '}' && entry.type === 'template'))) {
        throw new Error('JavaScript lexical delimiter mismatch');
      }
      stack.pop();
      if (entry?.type === 'template') { mode = entry.returnMode; canStartRegex = false; }
      else if (character === ')') {
        canStartRegex = Boolean(entry?.control);
        pendingFunctionBodyRole = entry?.functionRole || null;
      }
      else if (character === '}') canStartRegex = entry?.closeCanStartRegex ?? Boolean(entry?.block);
      else canStartRegex = false;
      previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = character; index += 1; continue;
    }

    const two = source.slice(index, index + 2);
    if (two === '++' || two === '--') { index += 2; canStartRegex = false; previousWord = ''; previousWasDot = false; previousWasProperty = false; previousToken = two; continue; }
    if (two === '?.') { index += 2; canStartRegex = false; previousWasDot = true; previousWasProperty = false; previousToken = two; continue; }
    if (character === '.') { index += 1; canStartRegex = false; previousWord = ''; previousWasDot = true; previousWasProperty = false; previousToken = '.'; continue; }
    // Operators and statement separators permit an expression next. Keeping this decision here
    // means `/` after division is recognized as a regexp without inspecting an ever-growing prefix.
    canStartRegex = true;
    previousWord = '';
    previousWasDot = false;
    previousWasProperty = false;
    previousToken = character === ';' || character === ':' ? character : two;
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

function decodeIdentifier(raw) {
  let decoded = '';
  for (let index = 0; index < raw.length;) {
    if (raw[index] !== '\\') { decoded += raw[index]; index += 1; continue; }
    if (raw[index + 1] !== 'u') return null;
    let end = index + 2;
    let digits = '';
    if (raw[end] === '{') {
      end += 1;
      const start = end;
      while (end < raw.length && /[0-9A-Fa-f]/u.test(raw[end])) end += 1;
      if (end === start || raw[end] !== '}') return null;
      digits = raw.slice(start, end); end += 1;
    } else {
      digits = raw.slice(end, end + 4);
      if (digits.length !== 4 || !/^[0-9A-Fa-f]{4}$/u.test(digits)) return null;
      end += 4;
    }
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
    decoded += String.fromCodePoint(codePoint);
    index = end;
  }
  return decoded;
}

const COMPLETION_NAME = 'completeCurrentControlScope';
const COMPLETION_PREFIX_WORDS = new Set([
  'return', 'throw', 'case', 'delete', 'typeof', 'void', 'new', 'in', 'instanceof',
  'yield', 'await', 'else', 'do', 'break', 'continue',
]);
function completionName(raw) {
  return decodeIdentifier(raw) === COMPLETION_NAME;
}

function completionDiagnostics(source) {
  const executable = maskJsNonCode(source);
  // This is deliberately one forward pass.  Delimiter matching, argument splitting, candidate
  // discovery, and candidate inspection all charge the same budget; an adversarial run of
  // unmatched delimiters therefore fails closed instead of retrying a growing prefix.
  const operationLimit = 256 + source.length * 64;
  let operations = 0;
  const step = (count = 1) => {
    operations += count;
    if (operations > operationLimit) throw new Error('completion lexical scan exceeded its deterministic budget');
  };
  const stack = [];
  const significant = [];
  // Keep the first canonical helper reference that introduced an alias.  A later alias call
  // reports against that same source offset, so assignment + invocation is one violation rather
  // than two copies of the same non-canonical reference.
  const aliases = new Map();
  const diagnostics = [];
  const diagnosticByIndex = new Map();
  const report = (index, id = null) => {
    const existing = diagnosticByIndex.get(index);
    if (existing) {
      if (existing.id === null && id !== null) existing.id = id;
      return;
    }
    const entry = { index, id };
    diagnosticByIndex.set(index, entry);
    diagnostics.push(entry);
  };
  const previous = () => significant[significant.length - 1];
  const isWord = (character) => character !== undefined && /[A-Za-z_$\p{ID_Start}]/u.test(character);
  const isWordContinue = (character) => character !== undefined
    && /[A-Za-z0-9_$\u200C\u200D\p{ID_Continue}]/u.test(character);
  const isEscapeStart = (index) => executable[index] === '\\' && executable[index + 1] === 'u';
  const readWord = (start) => {
    let index = start;
    while (index < executable.length) {
      if (isWordContinue(executable[index])) { index += 1; continue; }
      if (!isEscapeStart(index)) break;
      if (executable[index + 2] === '{') {
        let close = index + 3;
        while (close < executable.length && /[0-9A-Fa-f]/u.test(executable[close])) { step(); close += 1; }
        if (close === index + 3 || executable[close] !== '}') break;
        index = close + 1;
      } else if (/^[0-9A-Fa-f]{4}$/u.test(executable.slice(index + 2, index + 6))) index += 6;
      else break;
    }
    return index;
  };
  const addAtom = (atom) => {
    const frame = stack.at(-1);
    if (frame) frame.args[frame.argument].push(atom);
  };
  const summary = (atoms) => {
    if (atoms.length !== 1) return { kind: 'other' };
    const atom = atoms[0];
    if (atom.kind === 'word' && atom.value === 'true') return { kind: 'true' };
    if (atom.kind === 'number') return { kind: 'number', value: atom.value };
    if (atom.kind === 'group') return atom.summary;
    if (atom.kind === 'array') return atom;
    return { kind: 'other' };
  };
  const callInfo = () => {
    const last = previous();
    const beforeLast = significant[significant.length - 2];
    const beforeBeforeLast = significant[significant.length - 3];
    const beforeBeforeBeforeLast = significant[significant.length - 4];
    if (last?.kind === 'word' && (completionName(last.value) || aliases.has(last.value))) {
      const aliasReference = aliases.has(last.value) && !completionName(last.value);
      if (beforeLast?.value === '.' || beforeLast?.value === '?.') return null;
      if (beforeLast?.kind === 'number') return null;
      // A canonical name or alias immediately after a call/array close is not a call.  A block
      // close, however, is a valid statement boundary for an alias reference; retaining that
      // case is what keeps an out-of-scope alias banned by the canonical-only policy.
      if (beforeLast?.kind === 'close'
        && (!aliasReference || beforeLast.value !== '}')) return null;
      if (beforeLast?.kind === 'word' && !COMPLETION_PREFIX_WORDS.has(beforeLast.value)) return null;
      return {
        outcome: 1,
        id: 0,
        index: aliasReference ? aliases.get(last.value).index : last.start,
        canonical: last.value === COMPLETION_NAME,
      };
    }
    if (last?.kind === 'close' && last.groupName && completionName(last.groupName)) {
      return { outcome: 1, id: 0, index: last.groupIndex, canonical: false };
    }
    const calleeToken = beforeBeforeLast?.kind === 'word' && completionName(beforeBeforeLast.value)
      ? beforeBeforeLast : beforeBeforeLast?.kind === 'close' && beforeBeforeLast.groupName
        && completionName(beforeBeforeLast.groupName) ? beforeBeforeLast : null;
    if (last?.kind === 'word' && (last.value === 'call' || last.value === 'apply')
      && beforeLast?.value === '.' && calleeToken
      && (!beforeBeforeBeforeLast || !['word', 'number', 'close'].includes(beforeBeforeBeforeLast.kind))) {
      return { outcome: last.value === 'call' ? 2 : 1, id: last.value === 'call' ? 1 : 1, apply: last.value === 'apply', index: calleeToken.start, canonical: false };
    }
    if (last?.kind === 'punct' && last.value === '?.'
      && ((beforeLast?.kind === 'word' && completionName(beforeLast.value))
        || (beforeLast?.kind === 'close' && completionName(beforeLast.groupName)))) {
      return { outcome: 1, id: 0, index: beforeLast.start, canonical: false };
    }
    return null;
  };
  const isUnconditional = (value, info) => {
    if (value.kind === 'true') return true;
    if (info.apply && value.kind === 'array') return value.values?.[1]?.kind === 'true';
    return false;
  };
  const closeFrame = (frame) => {
    const value = frame.kind === 'array'
      ? { kind: 'array', values: frame.args.map(summary) }
      : frame.kind === 'paren' && frame.call
        ? { kind: 'other' }
        : summary(frame.args[0]);
    if (frame.call && (!frame.call.canonical || isUnconditional(summary(frame.args[frame.call.outcome] || []), frame.call))) {
      let idSummary = summary(frame.args[frame.call.id ?? 0] || []);
      if (frame.call.apply && idSummary.kind === 'array') idSummary = idSummary.values?.[0] || { kind: 'other' };
      const id = idSummary.kind === 'number' && /^(?:0|[1-9][0-9]*)$/u.test(idSummary.value)
        && Number.isSafeInteger(Number(idSummary.value)) ? Number(idSummary.value) : null;
      report(frame.call.index, id);
    }
    if (frame.kind === 'paren' && !frame.call) {
      const atoms = frame.args[0] || [];
      const groupName = atoms.length === 1
        && ((atoms[0].kind === 'word' && completionName(atoms[0].value)) ? atoms[0].value : atoms[0].groupName);
      const groupIndex = groupName
        ? (atoms[0].kind === 'word' ? atoms[0].start : atoms[0].groupIndex)
        : undefined;
      return groupName
        ? { kind: 'group', summary: { kind: 'other' }, groupName, groupIndex }
        : { kind: 'group', summary: value };
    }
    return frame.kind === 'array' ? value : { kind: 'group', summary: value };
  };
  const emit = (token) => {
    addAtom(token);
    significant.push(token);
  };
  const rememberAssignedAlias = (equalsIndex, referenceName, referenceIndex) => {
    if (!referenceName || significant[equalsIndex]?.value !== '=') return;
    const target = significant[equalsIndex - 1];
    if (target?.kind === 'word' && target.value !== COMPLETION_NAME) {
      aliases.set(target.value, { index: referenceIndex ?? target.start });
    }
  };
  const nextCodeIndex = (start) => {
    let index = start;
    while (index < executable.length && /\s/u.test(executable[index])) index += 1;
    return index;
  };
  let importDeclaration = false;
  let exportSpecifierPending = false;
  let exportSpecifierDepth = 0;
  for (let index = 0; index < executable.length;) {
    step();
    const character = executable[index];
    if (/\s/u.test(character)) { index += 1; continue; }
    if (isWord(character) || isEscapeStart(index)) {
      const end = readWord(index);
      step(end - index);
      const value = executable.slice(index, end);
      const prior = significant.at(-1);
      const nextIndex = nextCodeIndex(end);
      const propertyReference = prior?.value === '.' || prior?.value === '?.';
      const declarationReference = prior?.value === 'function' || prior?.value === 'class'
        || prior?.value === 'const' || prior?.value === 'let' || prior?.value === 'var';
      const propertyKey = executable[nextIndex] === ':';
      const canonicalDirectCallee = value === COMPLETION_NAME && executable[nextIndex] === '('
        && !propertyReference && !declarationReference
        && !importDeclaration && exportSpecifierDepth === 0;
      const completionReference = completionName(value)
        && !propertyReference && !declarationReference && !propertyKey
        && !importDeclaration && exportSpecifierDepth === 0;
      const token = {
        kind: 'word',
        value,
        start: index,
        completionReference,
        canonicalDirectCallee,
      };
      const priorPrior = significant.at(-2);
      if (prior?.value === '=' && priorPrior?.kind === 'word' && completionName(value)
        && executable[nextIndex] !== '(') rememberAssignedAlias(significant.length - 1, value, index);
      if (value === 'import') {
        importDeclaration = executable[nextIndex] !== '(' && executable[nextIndex] !== '.';
      } else if (value === 'from' && importDeclaration) {
        importDeclaration = false;
      } else if (value === 'export' && executable[nextIndex] === '{') {
        exportSpecifierPending = true;
      }
      if (completionReference && !canonicalDirectCallee) report(index);
      emit(token); index = end; continue;
    }
    if (/[0-9]/u.test(character)) {
      let end = index + 1;
      while (end < executable.length && /[A-Za-z0-9._]/u.test(executable[end])) end += 1;
      step(end - index); emit({ kind: 'number', value: executable.slice(index, end), start: index }); index = end; continue;
    }
    if (character === '(') {
      const call = callInfo();
      const frame = { kind: 'paren', argument: 0, args: [[]], call, openSignificantIndex: significant.length };
      stack.push(frame); significant.push({ kind: 'open', frame, start: index }); index += 1; continue;
    }
    if (character === '[' || character === '{') {
      const frame = { kind: character === '[' ? 'array' : 'object', argument: 0, args: [[]], openSignificantIndex: significant.length };
      stack.push(frame); significant.push({ kind: 'open', frame, start: index });
      if (character === '{' && exportSpecifierPending) {
        exportSpecifierDepth = 1;
        exportSpecifierPending = false;
      } else if (character === '{' && exportSpecifierDepth > 0) {
        exportSpecifierDepth += 1;
      }
      index += 1; continue;
    }
    if (character === ',') {
      const frame = stack.at(-1);
      if (frame?.kind === 'paren' || frame?.kind === 'array') { frame.argument += 1; frame.args.push([]); }
      else emit({ kind: 'punct', value: ',', start: index });
      index += 1; continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      const expected = character === ')' ? 'paren' : character === ']' ? 'array' : 'object';
      let frame = stack.pop();
      while (frame && frame.kind !== expected) frame = stack.pop();
      if (!frame) { emit({ kind: 'punct', value: character, start: index }); index += 1; continue; }
      const group = closeFrame(frame);
      const close = {
        kind: 'close',
        value: character,
        frame,
        groupName: group.groupName,
        groupIndex: group.groupIndex,
        start: index,
      };
      if (group.groupName) rememberAssignedAlias(frame.openSignificantIndex - 1, group.groupName, group.groupIndex);
      significant.push(close);
      addAtom(group);
      if (character === '}' && exportSpecifierDepth > 0) exportSpecifierDepth -= 1;
      index += 1; continue;
    }
    if (character === '.' && executable[index + 1] === '?') {
      emit({ kind: 'punct', value: '?.', start: index }); index += 2; continue;
    }
    if (character === '?' && executable[index + 1] === '.') {
      emit({ kind: 'punct', value: '?.', start: index }); index += 2; continue;
    }
    emit({ kind: 'punct', value: character, start: index });
    if (character === ';') importDeclaration = false;
    index += 1;
  }
  return diagnostics;
}

export function literalTrueCompletionDiagnostics(source) {
  return completionDiagnostics(source);
}

export function literalTrueCompletionViolations(source) {
  return completionDiagnostics(source).map(({ id }) => id);
}
