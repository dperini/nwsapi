import type { CompileState } from './state.mts'

export function compileClass(state: CompileState): string | false | undefined {
  var nested: RegExpMatchArray | null | false,
    scan: boolean,
    raw: string

  state.match = state.selector.match(state.engine.Patterns['className']!)
  state.classTests = []
  // Standards-mode class matching is a plain token scan, which agrees
  // with how hosts tokenize the class attribute and skips the regex
  // execution a per-element test would pay. Quirks mode keeps the
  // case-insensitive regex, and compiles without per-query var slots
  // keep the inline regex source.
  scan =
    state.mode === true &&
    !state.engine.QUIRKS_MODE &&
    !!state.ancestry.classes
  do {
    raw = state.engine.unescapeIdentifier(state.match![1]!)
    // The regex form re-escapes the identifier as written in the
    // selector; only the scan form needs the unescaped name.
    state.expr = /[\t\n\f\r ]/.test(raw)
      ? '(?!)'
      : state.engine
          .escapeIdentifier(state.match![1]!)
          .replace(state.engine.REX.RegExpChar, '\\$&')
    // An identifier holding whitespace can never match a class token,
    // so the scan form records a constant false instead of a name.
    state.classTests.push(
      scan
        ? /[\t\n\f\r ]/.test(raw)
          ? 'false'
          : JSON.stringify(raw)
        : '/(^|\\s)' +
          state.expr +
          '(\\s|$)/' +
          (state.engine.QUIRKS_MODE ? 'i' : ''),
    )
    if (state.ancestry.classes && !scan) {
      // These expressions have no stateful flags. Create them once
      // per query instead of once for every candidate or ancestor.
      state.classIndex = state.ancestry.classes.indexOf(
        state.classTests[state.classTests.length - 1]!,
      )
      if (state.classIndex < 0) {
        state.classIndex = state.ancestry.classes.length
        state.ancestry.classes.push(
          state.classTests[state.classTests.length - 1]!,
        )
      }
      state.classTests[state.classTests.length - 1] = '_c' + state.classIndex
    }
    state.argument = state.match![state.match!.length - 1]!
    nested =
      state.argument.charAt(0) == '.' &&
      state.argument.match(state.engine.Patterns['className']!)
    if (nested) {
      state.match = nested
    }
  } while (nested)
  state.compat = ''
  for (
    state.classIndex = state.classTests.length - 1;
    state.classIndex >= 0;
    --state.classIndex
  ) {
    state.compat +=
      (state.compat ? '&&' : '') +
      (scan
        ? scanExpression(state, state.classIndex == state.classTests.length - 1)
        : state.classTests[state.classIndex] +
          '.test(' +
          (state.classIndex == state.classTests.length - 1
            ? (state.classTests.length > 1 ? 'n=' : '') + state.read.cls('e')
            : 'n') +
          ')')
  }
  state.source = 'if(' + state.compat + '){' + state.source + '}'
  return undefined

  function scanExpression(state: CompileState, first: boolean) {
    var entry = state.classTests[state.classIndex]!,
      ref = first ? '(n=' + state.read.cls('e') + ')' : 'n'
    if (entry == 'false') {
      return 'false'
    }
    // The name arrives as a string literal, so equal class tests in a
    // selector list repeat a constant the engine can fold.
    return 's.hasClass(' + ref + ',' + entry + ')'
  }
}
