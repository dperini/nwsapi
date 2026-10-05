import type { EngineState, PlanCache } from '../state/types.mts'

export interface CacheBudget<Value> {
  bytes: number
  weight: (value: Value) => number
}

interface Entry<Value> {
  value: Value
  bytes: number
}

export function createWeightedCache<Value>(
  engine: EngineState,
  limit: number,
  budget: CacheBudget<Value>,
): PlanCache<Value> {
  let young: Map<string, Entry<Value>> | undefined
  let old: Map<string, Entry<Value>> | undefined
  let youngBytes = 0
  let oldBytes = 0
  const half = Math.max(1, limit >> 1)
  const halfBytes = budget.bytes / 2

  function insert(key: string, entry: Entry<Value>) {
    if (!young || young.size >= half || youngBytes + entry.bytes > halfBytes) {
      old = young
      oldBytes = youngBytes
      young = new engine.primordials.MapCtor!<string, Entry<Value>>()
      youngBytes = 0
    }
    young.set(key, entry)
    youngBytes += entry.bytes
  }

  function remove(key: string) {
    const recent = young?.get(key)
    const previous = old?.get(key)
    if (recent) {
      young!.delete(key)
      youngBytes -= recent.bytes
    }
    if (previous) {
      old!.delete(key)
      oldBytes -= previous.bytes
    }
  }

  return {
    clear() {
      young = old = undefined
      youngBytes = oldBytes = 0
    },
    get(key) {
      const recent = young?.get(key)
      if (recent) {
        return recent.value
      }
      const previous = old?.get(key)
      if (previous) {
        old!.delete(key)
        oldBytes -= previous.bytes
        insert(key, previous)
      }
      return previous?.value
    },
    set(key, value) {
      if (typeof key !== 'string') {
        return value
      }
      const bytes = key.length * 2 + budget.weight(value) + 64
      remove(key)
      // Oversized entries must not displace the useful working set.
      if (bytes <= halfBytes) {
        insert(key, { value, bytes })
      }
      return value
    },
    size() {
      return (young?.size || 0) + (old?.size || 0)
    },
    bytes() {
      return youngBytes + oldBytes
    },
  }
}
