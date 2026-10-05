import type { CompileState } from '../state.mts'
export function compilePositionSimple(
  state: CompileState,
  nthFilter: string | undefined,
) {
  if (state.match![2] == 'n' && nthFilter === undefined) {
    state.source = 'if(true){' + state.source + '}'
    return true
  } else if (state.match![2] == '1' && nthFilter === undefined) {
    state.test = state.type ? 'next' : 'previous'
    if (state.engine.S_VARS.indexOf('_u') < 0) {
      state.engine.S_VARS.push('_u')
    }
    state.source = state.expr
      ? 'n=e;o=e.localName;_u=e.namespaceURI;' +
        'while((n=n.' +
        (state.test as string) +
        'ElementSibling)&&(n.localName!=o||n.namespaceURI!=_u));if(!n){' +
        state.source +
        '}'
      : 'if(!e.' + state.test + 'ElementSibling){' + state.source + '}'
    return true
  }

  return false
}
