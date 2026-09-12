import type { CompileState } from '../state.d.ts'
export function compilePositionSimple(
  state: CompileState,
  nthFilter: string | undefined,
) {
  if (state.match![2] == 'n' && nthFilter === undefined) {
    state.source = 'if(true){' + state.source + '}'
    return true
  } else if (state.match![2] == '1' && nthFilter === undefined) {
    state.test = state.type ? 'next' : 'previous'
    state.source = state.expr
      ? 'n=e;o=e.localName;' +
        'while((n=n.' +
        (state.test as string) +
        'ElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
        state.source +
        '}'
      : 'if(!e.' + state.test + 'ElementSibling){' + state.source + '}'
    return true
  }

  return false
}
