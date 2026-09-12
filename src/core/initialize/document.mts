import type { EngineState } from '../state/engine.d.ts'
export function initialize(engine: EngineState, doc: Document) {
  engine.setIdentifierSyntax()
  engine.lastContext = engine.switchContext(doc, true)
}
