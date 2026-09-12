import type { EngineState } from '../../state/engine.d.ts'
export function validControlPseudo(
  engine: EngineState,
  name: string,
  argument: string | null,
) {
  if (name == 'picker') {
    return (
      argument !== null &&
      engine.unescapeIdentifier(argument).toLowerCase() == 'select'
    )
  }
  if (name == 'scroll-button') {
    return (
      argument !== null &&
      /^(?:\*|up|down|left|right|block-start|block-end|inline-start|inline-end)$/.test(
        engine.unescapeIdentifier(argument).toLowerCase(),
      )
    )
  }

  return false
}
