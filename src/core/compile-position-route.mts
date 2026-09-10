import { compilePositionConstant } from './compile-position-constant.mts'
import { compilePositionDense } from './compile-position-dense.mts'
import { compilePositionMatch } from './compile-position-match.mts'
import { compilePositionOrdered } from './compile-position-ordered.mts'
import { compilePositionShared } from './compile-position-shared.mts'
import type { CompileState } from './compile-state.d.ts'
export function compilePositionRoute(state: CompileState) {
  const stableSelection =
    state.mode === true && !state.callback && !state.engine.Config.LEGACY
  // A constant index needs no index. nth(Element|OfType)
  // builds the sibling list of the parent to number the
  // element within it, which is the right trade for an an+b
  // form that has to know where the element sits, and pure
  // overhead for ':nth-child(3)', which only has to know
  // whether three steps back runs out of siblings.
  //
  // Only for the -child forms: of-type has to compare the
  // name of every sibling it steps over, and reading
  // localName through the host on each one costs more than
  // the list it avoids.
  if (state.test == 'n==' + state.a && state.a! >= 1 && !state.expr) {
    if (stableSelection) {
      compilePositionDense(state)
      return undefined
    }
    compilePositionConstant(state)
    return undefined
  }
  if (state.mode === false && !state.engine.Config.LEGACY) {
    compilePositionMatch(state)
    return undefined
  }
  if (stableSelection && !state.expr && !state.type) {
    compilePositionOrdered(state)
    return undefined
  }
  compilePositionShared(state)
  return undefined
}
