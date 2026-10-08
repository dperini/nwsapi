import type { EngineState, PlanCache } from '../state/types.mts'

export interface CacheBudget<Value> {
  bytes?: number
  weight: (value: Value) => number
}

interface Entry<Value> {
  key: string
  value: Value
  bytes: number
  previous: Entry<Value> | undefined
  next: Entry<Value> | undefined
}

export function createWeightedCache<Value>(
  engine: EngineState,
  limit?: number,
  budget?: CacheBudget<Value>,
): PlanCache<Value> {
  let map: Map<string, Entry<Value>> | undefined
  let fallback: Record<string, Entry<Value> | undefined> = {}
  let head: Entry<Value> | undefined
  let tail: Entry<Value> | undefined
  let size = 0
  let bytes = 0
  let capacity = limit === undefined ? engine.Config.CACHE_LIMIT : limit
  let byteLimit = budget
    ? (budget.bytes ?? engine.Config.CACHE_BYTES)
    : Infinity
  let initialized = false
  let admission = 0x9e3779b9

  function clear() {
    map = undefined
    initialized = false
    fallback = {}
    head = tail = undefined
    size = bytes = 0
    capacity = limit === undefined ? engine.Config.CACHE_LIMIT : limit
    byteLimit = budget ? (budget.bytes ?? engine.Config.CACHE_BYTES) : Infinity
    admission = 0x9e3779b9
  }

  function lookup(key: string) {
    return map ? map.get(key) : fallback['\x01' + key]
  }

  function unlink(entry: Entry<Value>) {
    if (entry.previous) {
      entry.previous.next = entry.next
    } else {
      head = entry.next
    }
    if (entry.next) {
      entry.next.previous = entry.previous
    } else {
      tail = entry.previous
    }
  }

  function append(entry: Entry<Value>) {
    entry.previous = tail
    entry.next = undefined
    if (tail) {
      tail.next = entry
    } else {
      head = entry
    }
    tail = entry
  }

  function remove(entry: Entry<Value>) {
    unlink(entry)
    if (map) {
      map.delete(entry.key)
    } else {
      delete fallback['\x01' + entry.key]
    }
    --size
    bytes -= entry.bytes
  }

  function admit() {
    // Sample overflow admissions to preserve residents during cyclic scans.
    // A local sequence avoids fixed strides that align with stylesheet order.
    admission ^= admission << 13
    admission ^= admission >>> 17
    admission ^= admission << 5
    return (admission & 7) === 0
  }

  function set(key: string, value: Value) {
    const weight = budget ? key.length * 2 + budget.weight(value) + 96 : 0
    const previous = lookup(key)
    if (weight > byteLimit || byteLimit === 0) {
      if (previous) {
        remove(previous)
      }
      return value
    }
    const overflow = size >= capacity || bytes + weight > byteLimit
    if (!previous && overflow && !admit()) {
      return value
    }
    if (previous) {
      remove(previous)
    }
    while (head && (size >= capacity || bytes + weight > byteLimit)) {
      remove(head)
    }
    const entry = {
      key,
      value,
      bytes: weight,
      previous: undefined,
      next: undefined,
    }
    if (map) {
      map.set(key, entry)
    } else {
      fallback['\x01' + key] = entry
    }
    append(entry)
    ++size
    bytes += weight
    return value
  }

  // Keep caches lazy because most instances use only a few query paths.
  function initialize() {
    if (!initialized) {
      map = engine.primordials.MapCtor
        ? new engine.primordials.MapCtor<string, Entry<Value>>()
        : undefined
      initialized = true
    }
  }

  return {
    clear,
    has(key) {
      return lookup(key) !== undefined
    },
    get(key) {
      const entry = lookup(key)
      if (entry && entry !== tail) {
        unlink(entry)
        append(entry)
      }
      return entry?.value
    },
    set(key, value) {
      if (typeof key !== 'string' || capacity === 0) {
        return value
      }
      initialize()
      return set(key, value)
    },
    size() {
      return size
    },
    bytes() {
      return bytes
    },
  }
}
