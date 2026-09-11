import type { CompileState } from './compile-state.d.ts'

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
      state.source = 'if(s.isFocusable(e)){' + state.source + '}'
      break
    case 'focus-visible':
      // The v2.x branch has no reliable keyboard-modality state.
      // An element with observable input focus is the conservative
      // behavior shared by focus and focus-visible in this line.
      state.source = 'if(s.isFocusable(e)){' + state.source + '}'
      break
    case 'focus-within':
      state.source =
        'if(s.matchesNative(e,":focus-within",!!s.doc.hasFocus&&s.doc.hasFocus()&&e.contains(s.doc.activeElement))){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
