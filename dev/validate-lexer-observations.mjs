// Pure semantic observations shared by the focused lexer child and its parent oracle.
// Zero dependencies beyond the repository lexer; run with Node >= 24.0.0.

import { literalTrueCompletionDiagnostics } from './js-lexer.mjs';

export function observeLiteralTrueCompletion(source) {
  const diagnostics = literalTrueCompletionDiagnostics(source);
  return {
    kind: 'diagnostics',
    inputLength: source.length,
    ids: diagnostics.map(({ id }) => id),
    indexes: diagnostics.map(({ index }) => index),
  };
}
