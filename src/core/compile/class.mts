import type { CompileState } from './state.d.ts'

export function compileClass(state: CompileState): string | false | undefined {
  var nested: RegExpMatchArray | null | false
  state.match = state.selector.match(state.engine.Patterns['className']!)
  state.classTests = []
  do {
    state.expr = /[\t\n\f\r ]/.test(
      state.engine.unescapeIdentifier(state.match![1]!),
    )
      ? '(?!)'
      : state.engine
          .escapeIdentifier(state.match![1]!)
          .replace(state.engine.REX.RegExpChar, '\\$&')
    state.classTests.push(
      '/(^|\\s)' +
        state.expr +
        '(\\s|$)/' +
        (state.engine.QUIRKS_MODE ? 'i' : ''),
    )
    if (state.ancestry.classes) {
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
      state.classTests[state.classIndex] +
      '.test(' +
      (state.classIndex == state.classTests.length - 1
        ? (state.classTests.length > 1 ? 'n=' : '') + state.read.cls('e')
        : 'n') +
      ')'
  }
  state.source = 'if(' + state.compat + '){' + state.source + '}'
  return undefined
}
