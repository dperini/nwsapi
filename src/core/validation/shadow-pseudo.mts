import type { EngineState } from '../state/engine.d.ts'
export function validShadowPseudo(
  engine: EngineState,
  name: string,
  argument: string | null,
) {
  if (name == 'part') {
    return (
      argument !== null &&
      !!argument &&
      argument.split(/[\t\n\f\r ]+/).every(function (part) {
        return engine.isIdent(part)
      })
    )
  }
  if (name == 'slotted') {
    return (
      argument !== null &&
      engine.isCompound(argument) &&
      !engine.hasPseudoElement(argument) &&
      engine.validateLogical(argument, false)
    )
  }

  return false
}
