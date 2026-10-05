import type { CompileState } from './state.mts'

export function compileClass(state: CompileState): string | false | undefined {
  var nested: RegExpMatchArray | null | false, scan: boolean

  state.match = state.selector.match(state.engine.Patterns['className']!)
  state.classTests = []
  // Standards-mode class matching is a plain token scan, which agrees
  // with how hosts tokenize the class attribute and skips the regex
  // execution a per-element test would pay. Quirks mode keeps the
  // case-insensitive regex, and compiles without per-query var slots
  // keep the inline regex source.
  scan =
    state.mode === true && !state.engine.QUIRKS_MODE && !!state.ancestry.classes
  do {
    nested = addClassTest(state, scan)
  } while (nested)
  state.compat = ''
  buildCompat(state, scan)
  state.source = 'if(' + state.compat + '){' + state.source + '}'
  return undefined

  function addClassTest(
    state: CompileState,
    scan: boolean,
  ): RegExpMatchArray | null | false {
    var raw = state.engine.unescapeIdentifier(state.match![1]!),
      argument: string,
      nested: RegExpMatchArray | null | false
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
    if (state.compiler && !scan) {
      // These expressions have no stateful flags. Create them once
      // per query instead of once for every candidate or ancestor.
      state.classIndex = state.compiler.classes.indexOf(
        state.classTests[state.classTests.length - 1]!,
      )
      if (state.classIndex < 0) {
        state.classIndex = state.compiler.classes.length
        state.compiler.classes.push(
          state.classTests[state.classTests.length - 1]!,
        )
      }
      state.classTests[state.classTests.length - 1] = '_c' + state.classIndex
    }
    argument = state.match![state.match!.length - 1]!
    nested =
      argument.charAt(0) == '.' &&
      argument.match(state.engine.Patterns['className']!)
    if (nested) {
      state.match = nested
    }
    return nested
  }

  function buildCompat(state: CompileState, scan: boolean) {
    for (
      state.classIndex = state.classTests.length - 1;
      state.classIndex >= 0;
      --state.classIndex
    ) {
      state.compat +=
        (state.compat ? '&&' : '') +
        (scan
          ? scanExpression(
              state,
              state.classIndex == state.classTests.length - 1,
            )
          : state.classTests[state.classIndex]! +
            '.test(' +
            (state.classIndex == state.classTests.length - 1
              ? (state.classTests.length > 1 ? 'n=' : '') + state.read.cls('e')
              : 'n') +
            ')')
    }
  }

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
