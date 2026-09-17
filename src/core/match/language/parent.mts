import type { EngineState } from '../../state/types.mts'
export function languageParent(engine: EngineState, current: Element) {
  return (
    engine.upOf(current) ||
    (current.parentNode && (current.parentNode as ShadowRoot).host) ||
    null
  )
}
