import { compilePseudoClass } from './class.mts'
import { compilePseudoModern } from './modern.mts'
import type { CompileState } from '../state.mts'
export function compilePseudo(state: CompileState): string | false | undefined {
  if (
    (state.selector.charAt(1) == ':' ||
      state.engine.Patterns['pseudo_sng']!.test(state.selector)) &&
    !state.engine.isPseudoExtension(state.selector)
  ) {
    if (!state.engine.validPseudoTail(state.selector)) {
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return ''
    }
    // DOM queries never return pseudo-elements. Preserve the compiler's
    // synthetic { element, type } candidates for existing consumers.
    state.source =
      'if(!e.nodeType&&e.element&&e.type&&e.type.toLowerCase()==' +
      JSON.stringify(
        state.selector.charAt(1) == ':'
          ? state.selector.toLowerCase()
          : ':' + state.selector.toLowerCase(),
      ) +
      '){e=e.element;' +
      state.source +
      '}'
    state.match = [state.selector, '']
    return undefined
  }
  state.pseudo = state.engine.readPseudo(state.selector)
  if (
    state.pseudo &&
    /^(?:lang|host|host-context|has-slotted|state|active-view-transition-type|active-view-transition|user-valid|user-invalid|xr-overlay|interest-source|interest-target|target-current|target-before|target-after)$/.test(
      state.pseudo.name,
    )
  ) {
    return compilePseudoModern(state)
  }
  return compilePseudoClass(state)
}
