import type { CompileState } from './state.mts'

export function compileAdjacent(
  state: CompileState,
): string | false | undefined {
  state.firstChildOnly = false
  state.match = state.selector.match(state.engine.Patterns['adjacent']!)
  state.ancestry.pending.length = 0
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
    state.pendingTag = ''
  }
  state.source =
    'var N' +
    state.k +
    '=e;if(e&&(e=' +
    state.read.prev('e') +
    ')){' +
    state.source +
    '}e=N' +
    state.k +
    ';'
  return undefined
}
