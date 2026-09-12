import type { EngineState } from '../state/engine.d.ts'
import type { EngineElement } from '../state/types.mts'
export function isLink(engine: EngineState, node: EngineElement) {
  return (
    engine.reLinkName.test(engine.tagOf(node)) && engine.hasAttrOf(node, 'href')
  )
}
