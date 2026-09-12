import type { EngineState } from '../state/engine.d.ts'
export function createWeakMap<Key extends WeakKey, Value>(
  engine: EngineState,
): WeakMap<Key, Value> | undefined {
  var Constructor = engine.primordials.WeakMapCtor!
  engine.createWeakMap = function () {
    return new Constructor()
  }
  return engine.createWeakMap<Key, Value>()
}
