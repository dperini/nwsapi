import type { CompileState } from '../state.mts'

export function compilePseudoAction(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'hover':
      state.engine.trackHover()
      state.source =
        'if(e===s.HOVER||s.matchesNative(e,":hover")){' + state.source + '}'
      break
    case 'active':
      state.source = 'if(e===s.doc.activeElement){' + state.source + '}'
      break
    case 'focus':
      // A positive isFocusable verdict requires the element to be the
      // focused one, so the identity test runs first and keeps the
      // native probe off every unfocused candidate.
      state.source =
        'if(e===s.doc.activeElement&&s.isFocusable(e)){' + state.source + '}'
      break
    case 'focus-visible':
      // The v2.x branch has no reliable keyboard-modality state.
      // An element with observable input focus is the conservative
      // behavior shared by focus and focus-visible in this line.
      state.source =
        'if(e===s.doc.activeElement&&s.isFocusable(e)){' + state.source + '}'
      break
    case 'focus-within':
      // Containment decides the pseudo either way: a host matcher can
      // only agree with it, so it runs first and keeps the native
      // probe off elements with no focused descendant.
      state.source =
        'if(e.contains(s.doc.activeElement)&&s.matchesNative(e,":focus-within",!!s.doc.hasFocus&&s.doc.hasFocus())){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
