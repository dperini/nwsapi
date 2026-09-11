import type { CompileState } from './compile-state.d.ts'

export function compilePseudoHeading(
  state: CompileState,
): string | false | undefined {
  if (
    state.match![1]! !== undefined &&
    !/^[\t\n\f\r ]*[-+]?\d+[\t\n\f\r ]*(?:,[\t\n\f\r ]*[-+]?\d+[\t\n\f\r ]*)*$/.test(
      state.match![1]!,
    )
  ) {
    state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
    return ''
  }
  // HTML heading semantics use the local name, including prefixed
  // HTML elements, and ignore ARIA role/level overrides.
  state.test =
    state.match![1] === undefined
      ? '123456'
      : state
          .match![1]!.split(',')
          .map(function (level) {
            var n = +level
            return n >= 1 && n <= 6 ? n : ''
          })
          .join('')
  state.source = !state.test
    ? 'if(false){' + state.source + '}'
    : 'if(e.namespaceURI=="http://www.w3.org/1999/xhtml"&&/^h[' +
      (state.test || '1-6') +
      ']$/.test(' +
      state.read.tag('e') +
      ')){' +
      state.source +
      '}'
  return undefined
}
