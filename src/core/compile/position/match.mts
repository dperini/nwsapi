import type { CompileState } from '../state.mts'
export function compilePositionMatch(state: CompileState) {
  if (state.expr) {
    state.flag = '_t' + state.engine.notFlag++
    state.engine.S_VARS.push(state.flag, state.flag + 's')
    state.source =
      state.flag +
      '=e.localName;' +
      state.flag +
      's=e.namespaceURI;n=1;o=e;' +
      'while((o=o.' +
      (state.type ? 'next' : 'previous') +
      'ElementSibling)){' +
      'if(o.localName===' +
      state.flag +
      '&&o.namespaceURI===' +
      state.flag +
      's){++n;' +
      // The index only grows, so a constant equality is decided once
      // the count passes it; the answer cannot come back.
      (/^n==(\d+)$/.test(state.test as string)
        ? 'if(n>' + (state.test as string).slice(3) + ')break;'
        : '') +
      '}}' +
      'if((' +
      (state.test as string) +
      ')){' +
      state.source +
      '}'
    return
  }
  state.source =
    'n=1;o=e;while((o=o.' +
    (state.type ? 'next' : 'previous') +
    'ElementSibling))++n;if((' +
    (state.test as string) +
    ')){' +
    state.source +
    '}'
  return
}
