import type { CompileState } from '../state.d.ts'
export function compilePositionDense(state: CompileState) {
  // Dense selections usually visit siblings together.
  // Find this parent's one qualifying child once, then
  // compare identities. Locals live for this invocation
  // only, so mutations and reentrant calls cannot reuse
  // an earlier query's position.
  state.flag = '_p' + state.engine.notFlag++
  state.engine.S_VARS.push(state.flag, state.flag + 'v')
  state.source =
    'o=e.parentNode;if(o===' +
    state.flag +
    '){n=e===' +
    state.flag +
    'v;}' +
    'else if(o&&k+1<l&&c[k+1].parentNode===o){' +
    state.flag +
    '=o;' +
    state.flag +
    'v=o.' +
    (state.type ? 'last' : 'first') +
    'ElementChild;' +
    'n=1;while(n<' +
    state.a +
    '&&' +
    state.flag +
    'v){' +
    state.flag +
    'v=' +
    state.flag +
    'v.' +
    (state.type ? 'previous' : 'next') +
    'ElementSibling;++n;}n=e===' +
    state.flag +
    'v;}else{n=1,o=e;while(n<=' +
    state.a +
    '&&(o=o.' +
    (state.type ? 'next' : 'previous') +
    'ElementSibling))++n;n=n==' +
    state.a +
    ';}if(n){' +
    state.source +
    '}'
}
