import { expect, test } from 'vitest'
import { createWeakMap } from '../../../src/core/cache/weak-map.mts'
import type { EngineState } from '../../../src/core/state/types.mts'

test('the weak-map allocator captures its constructor once', () => {
  let reads = 0
  class FixtureWeakMap<Key extends WeakKey, Value> extends WeakMap<
    Key,
    Value
  > {}
  const engine = {
    primordials: {
      get WeakMapCtor() {
        reads += 1
        return FixtureWeakMap
      },
    },
  } as unknown as EngineState

  const first = createWeakMap<object, number>(engine)
  expect(first).toBeInstanceOf(FixtureWeakMap)
  first!.set({}, 42)
  expect(reads).toBe(1)

  for (let index = 0; index < 50; index += 1) {
    const next = engine.createWeakMap<object, number>()
    expect(next).toBeInstanceOf(FixtureWeakMap)
    expect(next).not.toBe(first)
  }
  expect(reads).toBe(1)
})
