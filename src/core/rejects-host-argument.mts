import type { CompileState } from './compile-state.d.ts'
export function rejectsHostArgument(state: CompileState) {
  return state.argument === null
    ? state.name != 'host'
    : (state.argument = state.engine.prepareCompound(state.argument)) ===
        null ||
        state.engine.hasPseudoElement(state.argument) ||
        !state.engine.validateLogical(state.argument, false)
}
