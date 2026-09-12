import type { CompileState } from './state.d.ts'

export function compileChild(state: CompileState): string | false | undefined {
  state.firstChildOnly = false
  state.match = state.selector.match(state.engine.Patterns['children']!)
  state.ancestry.required.push.apply(
    state.ancestry.required,
    state.ancestry.pending,
  )
  state.ancestry.pending.length = 0
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
    state.pendingTag = ''
  }
  state.source =
    'var N' +
    state.k +
    '=e;if(e&&(e=' +
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
