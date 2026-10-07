import assert from 'node:assert/strict'
import vm from 'node:vm'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  bundle: vi.fn((source: string) => source),
}))
vi.mock('node:fs', () => ({ readFileSync: state.read }))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/instrument.mts',
  () => ({ routeBundle: state.bundle }),
)
import {
  baselinePath,
  confirmationVariants,
  instrumentedVariants,
  guarded,
  preflightVariants,
  probeSource,
  variants,
} from '../../../../../../scripts/repo/bench/planner/has/variants.mts'
const source =
  'module.exports = function(anchors,witnesses){const anchor=null;const parts=["","",""];const plan={anchor: anchor,};if (witnesses.length > anchors.length * 2) return null;return plan}'
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

function evaluate(code: string) {
  const module = { exports: undefined as unknown }
  vm.runInNewContext(code, { module })
  return module.exports as (
    anchors: unknown[],
    witnesses: unknown[],
  ) => { attributeMask?: number; length?: number } | null
}

test('route variant builders annotate attribute masks and request explicit instrumented route choices', () => {
  state.read.mockReturnValue(source)
  vi.stubEnv('NWSAPI_PLANNER_BASELINE', '/fixture/baseline.js')
  assert.equal(baselinePath(), '/fixture/baseline.js')
  const originals = variants()
  assert.equal(originals.length, 3)
  assert.equal(evaluate(originals[0]!)([1], [1])!.attributeMask, undefined)
  assert.equal(evaluate(originals[1]!)([1], [1])!.attributeMask, 0)
  assert.deepEqual(
    state.bundle.mock.calls.map(call => call.slice(1)),
    [['forward'], ['inverse']],
  )
  state.bundle.mockClear()
  assert.equal(instrumentedVariants().length, 3)
  assert.deepEqual(
    state.bundle.mock.calls.map(call => call.slice(1)),
    [
      ['baseline', true],
      ['forward', true],
      ['inverse', true],
    ],
  )
  state.bundle.mockClear()
  probeSource()
  assert.deepEqual(state.bundle.mock.calls[0]!.slice(1), ['baseline', true])
  assert.equal(confirmationVariants().length, 2)
  const fitted = {
    model: { broad: true },
    min: [32, 0, 0, 0],
    max: [192, 768, 3, 4],
    baseline: { candidateSha256: 'fixture' },
  } as const
  const model = {
    ...fitted,
    min: [...fitted.min] as [number, number, number, number],
    max: [...fitted.max] as [number, number, number, number],
  }
  assert.equal(variants(model).length, 2)
  const guard = new vm.Script(guarded(model))
  assert.equal(
    guard.runInNewContext({ anchors: 32, witnesses: 768, attributes: 0 }),
    false,
  )
  assert.equal(
    guard.runInNewContext({ anchors: 8, witnesses: 8, attributes: 1 }),
    true,
  )
  const optimized = preflightVariants()
  assert.equal(evaluate(optimized[1]!)([1], [])!.length, 0)
  assert.equal(evaluate(optimized[1]!)([1], [1, 2, 3]), null)
  vi.stubEnv('NWSAPI_PLANNER_BASELINE', '')
  assert.ok(baselinePath().endsWith('/dist/nwsapi.js'))
})

test('route variants reject ambiguous planner anchors and missing preflight gates', () => {
  state.read.mockReturnValue('module.exports = 1')
  assert.throws(() => variants())
  state.read.mockReturnValue(
    source.replace('anchor: anchor,', 'missing: null,'),
  )
  assert.throws(() => variants())
  state.read.mockReturnValue(
    source.replace(
      'if (witnesses.length > anchors.length * 2) return null',
      'const missing = witnesses.length > anchors.length * 2',
    ),
  )
  assert.throws(() => preflightVariants())
})
