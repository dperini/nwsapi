import type { CompileState } from './state.d.ts'

export function compileUnknown(
  state: CompileState,
): string | false | undefined {
  state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
  return false
}
