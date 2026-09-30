import type { CompileState } from '../state.mts'

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
  // HTML elements, and ignore ARIA role/level overrides. The local
  // name is read once and compared against compile-time names, which
  // keeps the namespace read off every candidate that is not a
  // heading; the regex form tested both per element.
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
    : 'if((n=' +
      state.read.tag('e') +
      ')==' +
      state
        .test!.split('')
        .map(function (level: string) {
          return '"h' + level + '"'
        })
        .join('||n==') +
      '){if(e.namespaceURI=="http://www.w3.org/1999/xhtml"){' +
      state.source +
      '}}'
  return undefined
}
