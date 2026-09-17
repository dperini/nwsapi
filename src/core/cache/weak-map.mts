import type { EngineState } from '../state/types.mts'
export function createWeakMap<Key extends WeakKey, Value>(
  engine: EngineState,
): WeakMap<Key, Value> | undefined {
  var Constructor = engine.primordials.WeakMapCtor!
  engine.createWeakMap = function () {
    return new Constructor()
  }
  return engine.createWeakMap<Key, Value>()
}
