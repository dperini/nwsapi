import type { CompileState } from './state.mts'

export function compileSibling(
  state: CompileState,
): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['relative']!)
  state.ancestry.pending.length = 0
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
    state.pendingTag = ''
  }
  var memo = ''
  // Selection walks retest every rejected sibling per later candidate,
  // so rejections are recorded once per query. Matched candidates
  // continue the main loop before the record; match mode and the
  // first-child form have no repeated passes to save.
  if (
    state.mode === true &&
    !state.firstChildOnly &&
    !state.engine.Config.LEGACY
  ) {
    state.flag = '_sw' + state.engine.notFlag++
    state.engine.S_VARS.push(state.flag + '=s.createWeakMap()')
    memo = 'if(' + state.flag + '.get(e)!==false){'
  }
  state.source =
    'var N' +
    state.k +
    '=e;' +
    (state.firstChildOnly
      ? 'if(e&&(e=e.parentNode)&&(e=e.firstElementChild)&&e!==N' + state.k + ')'
      : 'while(e&&(e=' + state.read.prev('e') + '))') +
    '{' +
    memo +
    state.source +
    (memo ? state.flag + '.set(e,false);}' : '') +
    '}e=N' +
    state.k +
    ';'
  state.firstChildOnly = false
  return undefined
}
