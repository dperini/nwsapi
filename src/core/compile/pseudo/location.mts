import type { CompileState } from '../state.mts'

export function compilePseudoLocation(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'any-link':
      state.source = 'if((s.isLink(e)||e.visited)){' + state.source + '}'
      break
    case 'link':
      state.source = 'if(s.isLink(e)){' + state.source + '}'
      break
    case 'visited':
      state.source = 'if((s.isLink(e)&&e.visited)){' + state.source + '}'
      break
    case 'target':
      state.source =
        'if(((s.doc.compareDocumentPosition(e)&16)&&s.doc.location.hash&&e.id==s.doc.location.hash.slice(1))){' +
        state.source +
        '}'
      break
    case 'defined':
      state.source = 'if(s.isDefined(e)){' + state.source + '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
