import { nextCompileIdentifier } from '../state.mts'
import type { CompileState } from '../state.mts'
export function compilePositionMatch(state: CompileState) {
  if (state.expr) {
    state.flag = nextCompileIdentifier(state, '_t')
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
  var count =
    'n=1;o=e;while((o=o.' +
    (state.type ? 'next' : 'previous') +
    'ElementSibling))++n;'
  if (!state.type && !state.callback && canSharePosition(state)) {
    state.ancestry.position = true
    count = 'if(p){n=s.firstPosition(e,p);}else{' + count + '}'
  }
  state.source =
    count + 'if((' + (state.test as string) + ')){' + state.source + '}'
  return
}

function canSharePosition(state: CompileState) {
  for (var name in state.engine.Selectors) {
    if (state.engine.Selectors[name]) {
      return false
    }
  }
  for (name in state.engine.Combinators) {
    if (state.engine.Combinators[name]) {
      return false
    }
  }
  return true
}
