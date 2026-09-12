import type { CompileState } from './state.mts'

export function compileAncestor(
  state: CompileState,
): string | false | undefined {
  state.firstChildOnly = false
  state.match = state.selector.match(state.engine.Patterns['ancestor']!)
  state.ancestry.required.push.apply(
    state.ancestry.required,
    state.ancestry.pending,
  )
  state.ancestry.pending.length = 0
  state.ancestry.walk = true
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
    state.pendingTag = ''
  }
  if (state.ancestry.reuse) {
    // A successful prefix continues the candidate loop before the
    // final false assignment. Keep positional state in the original
    // query wrapper, and reuse the parent read this walk already needs.
    state.source =
      'var N' +
      state.k +
      '=e;if((e=e&&' +
      state.read.up('e') +
      ')===_pStart){if(_pResult){' +
      state.ancestry.reuse +
      '}}else{_pStart=e;_pResult=true;while(e){' +
      state.source +
      'e=' +
      state.read.up('e') +
      ';}_pResult=false;}e=N' +
      state.k +
      ';'
    return undefined
  }
  state.source =
    'var N' +
    state.k +
    '=e;while(e&&(e=' +
    (state.shadow
      ? 's.shadowParent(e,x||(c.nodeType?c:s.from))'
      : state.read.up('e')) +
    ')){' +
    state.source +
    '}e=N' +
    state.k +
    ';'
  return undefined
}
