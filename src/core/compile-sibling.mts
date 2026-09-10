import type { CompileState } from './compile-state.d.ts'

export function compileSibling(
  state: CompileState,
): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['relative']!)
  state.ancestry.pending.length = 0
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
    state.pendingTag = ''
  }
  state.source =
    'var N' +
    state.k +
    '=e;' +
    (state.firstChildOnly
      ? 'if(e&&(e=e.parentNode)&&(e=e.firstElementChild)&&e!==N' + state.k + ')'
      : 'while(e&&(e=' + state.read.prev('e') + '))') +
    '{' +
    state.source +
    '}e=N' +
    state.k +
    ';'
  state.firstChildOnly = false
  return undefined
}
