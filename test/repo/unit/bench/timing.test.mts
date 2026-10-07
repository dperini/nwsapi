import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ measure: vi.fn(), consume: vi.fn() }))
vi.mock('mitata', () => ({
  measure: state.measure,
  do_not_optimize: state.consume,
}))
import {
  compare,
  iterationsFor,
  measure,
  median,
  sample,
  sampleFresh,
  timeOnce,
} from '../../../../scripts/repo/bench/timing.mts'

beforeEach(() => {
  vi.clearAllMocks()
  state.measure.mockImplementation(async (callback: () => unknown) => {
    const value = callback()
    if (value && typeof value === 'object' && 'next' in value) {
      const iteration = (
        value as Generator<{
          0: () => unknown
          bench: (value: unknown) => unknown
        }>
      ).next().value!
      iteration.bench(iteration[0]())
    }
    return { p50: 2_000_000, samples: [1_000_000, 2_000_000, 3_000_000] }
  })
})

test('benchmark timing normalizes batch samples and counts every consumed invocation', async () => {
  const query = vi.fn(() => 42)
  assert.deepEqual(await sample(query, 2, 20), {
    milliseconds: 1,
    samples: [0.5, 1, 1.5],
    calls: 6,
  })
  assert.equal(query.mock.calls.length, 2)
  assert.equal(state.consume.mock.calls[0]![0], 42)
  assert.equal(state.measure.mock.calls[0]![1].min_cpu_time, 20_000_000)
  assert.equal(await timeOnce(query, 2), 1)
  const invalid = [
    [0, 0],
    [1.5, 0],
    [1, -1],
    [1, Infinity],
  ]
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    await assert.rejects(
      sample(query, invalid[index]![0]!, invalid[index]![1]!),
      RangeError,
    )
  }
  assert.equal(median([5, 1, 9, 3]), 3)
  assert.throws(() => median([]), RangeError)
})

test('fresh-state timing passes setup through computed arguments outside query execution', async () => {
  const value = { visits: 0 }
  const setup = vi.fn(() => value)
  const query = vi.fn((argument: typeof value) => {
    argument.visits += 1
  })
  assert.equal(await sampleFresh(setup, query), 2)
  assert.equal(setup.mock.calls.length, 1)
  assert.equal(query.mock.calls[0]![0], value)
  assert.equal(value.visits, 1)
  assert.deepEqual(state.measure.mock.calls[0]![1], {
    gc: false,
    batch_threshold: 0,
    min_samples: 1,
    samples_threshold: Infinity,
    min_cpu_time: 0,
    max_samples: 1,
    warmup_samples: 0,
  })
})

test('timing comparisons rotate order and choose adaptive iteration budgets', async () => {
  const order: string[] = []
  const runners = [
    () => {
      order.push('a')
    },
    () => {
      order.push('b')
    },
  ]
  assert.deepEqual(await measure(runners, 2, 1), [2, 2])
  assert.deepEqual(order, ['a', 'b', 'b', 'a'])
  assert.equal(iterationsFor(2), 20)
  assert.equal(iterationsFor(0.5), 100)
  assert.equal(iterationsFor(0.1), 500)
  await assert.rejects(compare({}), RangeError)
  assert.deepEqual(
    await compare(
      { a: runners[0]!, b: runners[1]! },
      { rounds: 2, iterations: 1 },
    ),
    [
      { label: 'a', ms: 2 },
      { label: 'b', ms: 2 },
    ],
  )
  const automatic = await compare({ a: runners[0]! })
  assert.equal(automatic[0]!.label, 'a')
  assert.ok(automatic[0]!.ms > 0)
})
