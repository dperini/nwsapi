import type { CompileState } from '../state.mts'

export function compilePseudoDisplay(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'open':
      state.source = 'if(s.isOpen(e)){' + state.source + '}'
      break
    case 'closed':
      state.source = 'if(s.isClosed(e)){' + state.source + '}'
      break
    case 'modal':
      state.source = 'if(s.isModal(e)){' + state.source + '}'
      break
    case 'fullscreen':
      state.source = 'if(s.isFullscreen(e)){' + state.source + '}'
      break
    case 'picture-in-picture':
      state.source = 'if(s.isPictureInPicture(e)){' + state.source + '}'
      break
    case 'popover':
    case 'popover-open':
      state.source = 'if(s.isPopoverOpen(e)){' + state.source + '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
