import type { CompileState } from './compile-state.d.ts'
export function compilePositionShared(state: CompileState) {
  state.expr = state.expr ? 'OfType' : 'Element'
  state.type = state.type ? 'true' : 'false'
  state.source =
    'n=s.nth' +
    state.expr +
    '(e,' +
    state.type +
    (state.expr == 'OfType' && !state.engine.Config.LEGACY ? ',!f' : '') +
    ');if((' +
    (state.test as string) +
    ')){' +
    state.source +
    '}'
}
