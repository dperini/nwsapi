import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import {
  checkLifecycleState,
  createLifecycleState,
  lifecycleBrowserSource,
  measureLifecycle,
  measureLifecycleRound,
  runLifecycleQuery,
} from '../../../../../../scripts/repo/bench/survey/lifecycle/measure.mts'
import type { LifecycleWorld } from '../../../../../../scripts/repo/bench/survey/lifecycle/measure.mts'

const timing = {
  rounds: 3,
  milliseconds: 1,
  batch: 2,
  coldCalls: 4,
  warmups: 2,
}

export function fixture() {
  const { window } = new JSDOM(
    '<!doctype html><main class="original"><i></i></main>',
    {
      runScripts: 'outside-only',
    },
  )
  const doc = window.document
  const create = vi.fn(() => ({
    select: (selector: string) => Array.from(doc.querySelectorAll(selector)),
  }))
  const world = { doc, create } as unknown as LifecycleWorld
  return { window, world, create }
}

test('lifecycle mutations alternate without losing original classes or child identity', t => {
  const { window, world } = fixture()
  t.onTestFinished(() => window.close())
  const state = createLifecycleState(world)
  runLifecycleQuery(state, 'i', 'class')
  expect(state.marker.className).toBe('original bench-toggle')
  runLifecycleQuery(state, 'i', 'class')
  expect(state.marker.className).toBe('original')
  runLifecycleQuery(state, 'i', 'attribute')
  expect(state.marker.getAttribute('data-bench')).toBe('true')
  runLifecycleQuery(state, 'i', 'attribute')
  expect(state.marker.getAttribute('data-bench')).toBe('false')
  expect(runLifecycleQuery(state, 'i', 'child')).toHaveLength(2)
  expect(state.child.parentElement).toBe(world.doc.body)
  expect(runLifecycleQuery(state, 'i', 'child')).toHaveLength(1)
  expect(state.child.parentElement).toBeNull()
  expect(runLifecycleQuery(state, 'i', 'warm')).toHaveLength(1)
  state.engine.select = () => [state.marker]
  expect(() => checkLifecycleState(state, 'i', 'warm')).toThrow(/identity/)
})

test('fresh-query timing excludes construction and warm rounds retain calls and consumption', t => {
  const { window, world } = fixture()
  t.onTestFinished(() => window.close())
  let time = 0
  const create = world.create
  world.create = () => {
    time += 1000
    return create()
  }
  const state = createLifecycleState(world)
  const cold = measureLifecycleRound(state, 'i', 'cold', timing, () => ++time)
  expect(cold).toEqual({ nanoseconds: 1e6, calls: 4, consumed: 4 })
  const warm = measureLifecycle(
    [world, world],
    'i',
    'warm',
    timing,
    () => ++time,
  )
  expect(warm.samples).toEqual([
    [500_000, 500_000, 500_000],
    [500_000, 500_000, 500_000],
  ])
  expect(warm.calls).toEqual([
    [2, 2, 2],
    [2, 2, 2],
  ])
  expect(warm.consumed).toBe(16)
})

test('serialized browser helpers execute the same workload without module dependencies', t => {
  const { window, world } = fixture()
  t.onTestFinished(() => window.close())
  window.eval(lifecycleBrowserSource())
  const browser = window as unknown as {
    measureLifecycle: typeof measureLifecycle
  }
  let time = 0
  const result = browser.measureLifecycle(
    [world],
    'i',
    'cold',
    timing,
    () => ++time,
  )
  expect(result.samples).toEqual([[1e6, 1e6, 1e6]])
  expect(result.calls).toEqual([[4, 4, 4]])
  expect(result.consumed).toBe(12)
  world.doc.body.replaceChildren()
  expect(() => createLifecycleState(world)).toThrow(/body element/)
})
