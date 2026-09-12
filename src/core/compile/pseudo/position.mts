import { compilePositionRoute } from '../position/route.mts'
import { compilePositionSimple } from '../position/simple.mts'
import { compilePositionTest } from '../position/condition.mts'
import type { CompileState } from '../state.mts'

export function compilePseudoPosition(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'nth-child':
    case 'nth-of-type':
    case 'nth-last-child':
    case 'nth-last-of-type':
      state.expr = /-of-type/i.test(state.match![1]!)
      var nthFilter = state.match![3]
      if (
        nthFilter !== undefined &&
        (state.expr || !state.engine.validateLogical(nthFilter, false))
      ) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        return ''
      }
      if (state.match![1]! && state.match![2]!) {
        state.type = /last/i.test(state.match![1]!)
        if (compilePositionSimple(state, nthFilter)) {
          return undefined
        }
        compilePositionTest(state)
        if (nthFilter !== undefined) {
          state.flag = '_f' + state.engine.notFlag++
          state.engine.S_VARS.push(state.flag)
          state.source =
            'n=s.nthFiltered(e,' +
            JSON.stringify(nthFilter) +
            ',' +
            !!state.type +
            ',f?null:(' +
            state.flag +
            '||(' +
            state.flag +
            '=v?(v.' +
            state.flag +
            '||(v.' +
            state.flag +
            '={})):{})));if(n>0&&(' +
            (state.test as string) +
            ')){' +
            state.source +
            '}'
          return undefined
        }
        compilePositionRoute(state)
      } else {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      }
      return undefined
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return undefined
  }
}
