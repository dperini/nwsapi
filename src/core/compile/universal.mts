import type { CompileState } from './state.mts'

export function compileUniversal(
  state: CompileState,
): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['universal']!)
  return undefined
}
