import type { CompileState } from '../state.d.ts'
export function compilePositionConstant(state: CompileState) {
  state.test = state.type ? 'next' : 'previous'
  state.source =
    'n=1,o=e;' +
    'while(n<=' +
    state.a +
    '&&(o=o.' +
    (state.test as string) +
    'ElementSibling))++n;' +
    'if(n==' +
    state.a +
    '){' +
    state.source +
    '}'
}
