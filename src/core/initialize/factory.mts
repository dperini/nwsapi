import { createState } from '../state/create.mts'
import { initializeMatching } from './matching.mts'
import { initializeApi } from './api.mts'
import { initializeRuntime } from './runtime.mts'
import type { EngineState } from '../state/engine.d.ts'
import type { EngineGlobal } from '../state/types.mts'
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
