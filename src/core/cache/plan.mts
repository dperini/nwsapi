import type { EngineState, PlanCache } from '../state/types.mts'
import { createWeightedCache } from './weighted.mts'
import type { CacheBudget } from './weighted.mts'

export function createCache<Value>(
  engine: EngineState,
  limit?: number,
  budget?: CacheBudget<Value>,
): PlanCache<Value> {
  if (budget || !engine.primordials.MapCtor) {
    return createWeightedCache(engine, limit, budget)
  }
  var young: Map<string, Value> | undefined,
    old: Map<string, Value> | undefined,
    capacity = limit === undefined ? engine.Config.CACHE_LIMIT : limit,
    half = Math.max(1, Math.floor(capacity / 2))

  return {
    clear: function () {
      young = undefined
      old = undefined
      capacity = limit === undefined ? engine.Config.CACHE_LIMIT : limit
      half = Math.max(1, Math.floor(capacity / 2))
    },
    get: function (key: string) {
      if (!young) {
        return undefined
      }
      var value = young.get(key)
      if (value !== undefined) {
        return value
      }
      if (!old) {
        return undefined
      }
      value = old.get(key)
      if (value !== undefined) {
        // second chance: carry it across before the old generation goes
        old.delete(key)
        if (young.size >= half) {
          old = capacity > 1 ? young : undefined
          young = new engine.primordials.MapCtor!<string, Value>()
        }
        young.set(key, value)
      }
      return value
    },
    set: function (key: string, value: Value) {
      if (capacity === 0) {
        return value
      }
      if (!young || young.size >= half) {
        old = capacity > 1 ? young : undefined
        young = new engine.primordials.MapCtor!<string, Value>()
      }
      young.set(key, value)
      return value
    },
    size: function () {
      return (young ? young.size : 0) + (old ? old.size : 0)
    },
  }
}
