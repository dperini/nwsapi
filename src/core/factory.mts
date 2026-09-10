import { createState } from './create-state.mts'
import { initializeMatching } from './initialize-matching.mts'
import { initializeApi } from './initialize-api.mts'
import { initializeRuntime } from './initialize-runtime.mts'
import type { EngineState } from './state.d.ts'
import type { EngineGlobal } from './types.mts'
export function createEngine(
  global: EngineGlobal,
  Factory: EngineState['Factory'],
) {
  const engine = createState(global, Factory)
  initializeRuntime(engine)
  initializeMatching(engine)
  initializeApi(engine)
  engine.initialize(engine.doc)
  return engine.Dom
}
