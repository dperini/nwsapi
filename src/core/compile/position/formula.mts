import type { CompileState } from '../state.d.ts'
import { positionalFormula } from './expression.mts'
export function compilePositionFormula(state: CompileState) {
  state.f = /n/i.test(state.match![2]!)
  state.n = state.match![2]!.split('n')
  state.a = parseInt(state.n[0]!, 10) || 0
  state.b = parseInt(state.n[1]!, 10) || 0
  if (state.n[0] == '-') {
    state.a = -1
  }
  if (state.n[0] == '+') {
    state.a = +1
  }
  state.test =
    (state.b
      ? '(n' + (state.b > 0 ? '-' : '+') + Math.abs(state.b) + ')'
      : 'n') +
    '%' +
    state.a +
    '==0'
  state.test = positionalFormula(state)
}
