import type { EngineState } from '../../state/engine.d.ts'
export function languageParent(engine: EngineState, current: Element) {
  return (
    engine.upOf(current) ||
    (current.parentNode && (current.parentNode as ShadowRoot).host) ||
    null
  )
}
