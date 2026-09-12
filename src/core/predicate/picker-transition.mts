import type { EngineState } from '../state/engine.d.ts'
export function isPickerTransition(
  previous: string,
  engine: EngineState,
  name: string,
) {
  return previous == 'picker' && engine.treePseudo(name)
}
