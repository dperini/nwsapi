import type { CompileState } from './compile-state.d.ts'

export function compileUniversal(
  state: CompileState,
): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['universal']!)
  return undefined
}
