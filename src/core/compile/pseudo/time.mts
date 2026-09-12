import type { CompileState } from '../state.d.ts'

export function compilePseudoTime(
  state: CompileState,
): string | false | undefined {
  state.expr = ':' + state.match![1]!.toLowerCase()
  if (
    state.expr === ':current' &&
    state.match![2]!.charCodeAt(0) === 40 /* '(' */
  ) {
    state.match = state.engine.matchLogical(state.selector, /^:(current)\(/i)
    if (
      !state.match ||
      !state.match![2]! ||
      !state.engine
        .splitList(state.match![2]!)
        .every(item => state.engine.isCompound(item)) ||
      !state.engine.validateLogical(state.match![2]!, false)
    ) {
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return undefined
    }
    state.expr += '(' + state.match![2]! + ')'
  }
  state.source =
    'if(s.matchesNative(e,' +
    JSON.stringify(state.expr) +
    ')){' +
    state.source +
    '}'
  return undefined
}
