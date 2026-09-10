import type { EngineState } from './state.d.ts'
export function isPickerTransition(
  previous: string,
  engine: EngineState,
  name: string,
) {
  return previous == 'picker' && engine.treePseudo(name)
}
