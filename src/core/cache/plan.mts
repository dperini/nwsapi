import type { EngineState, PlanCache } from '../state/types.mts'
import { createWeightedCache } from './weighted.mts'
import type { CacheBudget } from './weighted.mts'

export function createCache<Value>(
  engine: EngineState,
  limit?: number,
  budget?: CacheBudget<Value>,
): PlanCache<Value> {
  if (budget) {
    return createWeightedCache(engine, limit || engine.CACHE_LIMIT, budget)
  }
  var young: Map<string, Value> | undefined,
    old: Map<string, Value> | undefined,
    half: number

  limit || (limit = engine.CACHE_LIMIT)
  half = limit > 1 ? limit >> 1 : 1

  return {
    clear: function () {
      young = undefined
      old = undefined
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
          old = young
          young = new engine.primordials.MapCtor!<string, Value>()
        }
        young.set(key, value)
      }
      return value
    },
    set: function (key: string, value: Value) {
      if (!young || young.size >= half) {
        old = young
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
