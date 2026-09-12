import type { CompileState } from '../state.d.ts'
export function compilePositionOrdered(state: CompileState) {
  // Ordered, nearby candidates can carry their sibling
  // position forward. Sparse runs switch to the shared index.
  state.flag = '_i' + state.engine.notFlag++
  state.engine.S_VARS.push(
    state.flag,
    state.flag + 'n',
    state.flag + 's',
    state.flag + 't',
  )
  state.source =
    'if(' +
    state.flag +
    's){n=s.nthElement(e,false);}else{' +
    'n=1;o=' +
    state.flag +
    't?e.previousElementSibling:e.previousSibling;' +
    'if((!' +
    state.flag +
    '||o!==' +
    state.flag +
    ')&&!' +
    state.flag +
    't&&o!==(o=e.previousElementSibling))' +
    state.flag +
    't=true;' +
    'while(o&&o!==' +
    state.flag +
    '&&n<8){++n;o=o.previousElementSibling;}' +
    'if(o===' +
    state.flag +
    '&&' +
    state.flag +
    '){n+=' +
    state.flag +
    'n;}' +
    'else if(o){n=s.nthElement(e,false);' +
    state.flag +
    's=true;}' +
    state.flag +
    '=e;' +
    state.flag +
    'n=n;}if((' +
    (state.test as string) +
    ')){' +
    state.source +
    '}'
}
