import type { EngineState } from './state.d.ts'
export function isParsedPseudoElement(
  pseudo: any,
  engine: EngineState,
  text: string,
  i: number,
) {
  return (
    (pseudo.double && !engine.isPseudoExtension(text.slice(i))) ||
    /^(?:before|after|first-line|first-letter)$/.test(pseudo.name)
  )
}
