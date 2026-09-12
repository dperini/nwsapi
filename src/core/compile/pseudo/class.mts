import { compilePseudoAction } from './action.mts'
import { compilePseudoDisplay } from './display.mts'
import { compilePseudoExtension } from './extension.mts'
import { compilePseudoHeading } from './heading.mts'
import { compilePseudoInput } from './input/state.mts'
import { compilePseudoInputValue } from './input/value.mts'
import { compilePseudoLinguistic } from './linguistic.mts'
import { compilePseudoLocation } from './location.mts'
import { compilePseudoLogical } from './logical.mts'
import { compilePseudoPosition } from './position.mts'
import { compilePseudoResource } from './resource.mts'
import { compilePseudoStructural } from './structural.mts'
import { compilePseudoTime } from './time.mts'
import type { CompileState } from '../state.mts'
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
