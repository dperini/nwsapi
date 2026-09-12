import type { EngineState } from '../state/types.mts'
export function initialize(engine: EngineState, doc: Document) {
  engine.setIdentifierSyntax()
  engine.lastContext = engine.switchContext(doc, true)
}
