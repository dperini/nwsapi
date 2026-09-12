import { compilePositionFormula } from './formula.mts'
import type { CompileState } from '../state.mts'
export function compilePositionTest(state: CompileState) {
  if (
    state.match![2] == 'even' ||
    state.match![2] == '2n0' ||
    state.match![2] == '2n+0' ||
    state.match![2] == '2n'
  ) {
    state.test = 'n%2==0'
  } else if (
    state.match![2] == 'odd' ||
    state.match![2] == '2n1' ||
    state.match![2] == '2n+1'
  ) {
    state.test = 'n%2==1'
  } else {
    compilePositionFormula(state)
  }
}
