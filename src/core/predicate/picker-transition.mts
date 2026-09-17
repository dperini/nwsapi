import type { EngineState } from '../state/types.mts'
export function isPickerTransition(
  previous: string,
  engine: EngineState,
  name: string,
) {
  return previous == 'picker' && engine.treePseudo(name)
}
