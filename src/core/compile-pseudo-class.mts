import { compilePseudoAction } from './compile-pseudo-action.mts'
import { compilePseudoDisplay } from './compile-pseudo-display.mts'
import { compilePseudoExtension } from './compile-pseudo-extension.mts'
import { compilePseudoHeading } from './compile-pseudo-heading.mts'
import { compilePseudoInput } from './compile-pseudo-input.mts'
import { compilePseudoInputValue } from './compile-pseudo-inputvalue.mts'
import { compilePseudoLinguistic } from './compile-pseudo-linguistic.mts'
import { compilePseudoLocation } from './compile-pseudo-location.mts'
import { compilePseudoLogical } from './compile-pseudo-logical.mts'
import { compilePseudoPosition } from './compile-pseudo-position.mts'
import { compilePseudoResource } from './compile-pseudo-resource.mts'
import { compilePseudoStructural } from './compile-pseudo-structural.mts'
import { compilePseudoTime } from './compile-pseudo-time.mts'
import type { CompileState } from './compile-state.d.ts'
export function compilePseudoClass(
  state: CompileState,
): string | false | undefined {
  if (
    (state.match = /^:heading(?:\(([^)]*)(?:\)|$))?(?![-\w])(.*)/i.exec(
      state.selector,
    ))
  ) {
    return compilePseudoHeading(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['structural']!))
  ) {
    return compilePseudoStructural(state)
  } else if ((state.match = state.engine.matchNth(state.selector))) {
    return compilePseudoPosition(state)
  } else if ((state.match = state.engine.matchLogical(state.selector))) {
    return compilePseudoLogical(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['linguistic']!))
  ) {
    return compilePseudoLinguistic(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['locationpc']!))
  ) {
    return compilePseudoLocation(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['useraction']!))
  ) {
    return compilePseudoAction(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['inputstate']!))
  ) {
    return compilePseudoInput(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['inputvalue']!))
  ) {
    return compilePseudoInputValue(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['rsrc_state']!))
  ) {
    return compilePseudoResource(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['disp_state']!))
  ) {
    return compilePseudoDisplay(state)
  } else if (
    (state.match = state.selector.match(state.engine.Patterns['time_state']!))
  ) {
    return compilePseudoTime(state)
  } else {
    return compilePseudoExtension(state)
  }
}
