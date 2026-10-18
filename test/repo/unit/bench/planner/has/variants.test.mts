import assert from 'node:assert/strict'
import vm from 'node:vm'
import { ENGINE_BUILD_PATH } from '../../../../../../scripts/repo/lib/paths.mts'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  read: vi.fn(),
}))
vi.mock('node:fs', () => ({ readFileSync: state.read }))
import {
  baselinePath,
  confirmationVariants,
  instrumentedVariants,
  guarded,
  preflightVariants,
  probeSource,
  variants,
} from '../../../../../../scripts/repo/bench/planner/has/variants.mts'
const source = `function shouldDeclineBulkHas(plan, anchors, witnesses) {
  return witnesses > anchors * 2;
}
function selectBulkHas(plan, anchors, witnesses) {
  if (!witnesses.length) return [];
  if (shouldDeclineBulkHas(plan, anchors.length, witnesses.length)) return null;
  return { plannerMask: plan.plannerMask };
}
function runSingle() { return 'resolver'; }
module.exports = function(anchors, witnesses) {
  return selectBulkHas({ plannerMask: 2 }, anchors, witnesses);
};`
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
  ) => { plannerMask?: number; length?: number } | null
}

test('route variants preserve exact checks and force the selected path', () => {
  state.read.mockReturnValue(source)
  vi.stubEnv('NWSAPI_PLANNER_BASELINE', '/fixture/baseline.js')
  assert.equal(baselinePath(), '/fixture/baseline.js')
  const originals = variants()
  assert.equal(originals.length, 3)
  assert.equal(evaluate(originals[0]!)([1], [1])!.plannerMask, 2)
  assert.equal(evaluate(originals[1]!)([1], [1]), null)
  assert.equal(evaluate(originals[2]!)([1], [1])!.plannerMask, 2)
  assert.equal(instrumentedVariants().length, 3)
  assert.equal(typeof evaluate(probeSource()), 'function')
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
  assert.equal(baselinePath(), ENGINE_BUILD_PATH)
})

test('route variants reject missing routing functions and calls', () => {
  state.read.mockReturnValue('module.exports = 1')
  assert.throws(() => variants())
  state.read.mockReturnValue(
    source.replace(
      'if (shouldDeclineBulkHas(plan, anchors.length, witnesses.length)) return null;',
      'if (witnesses.length) return null;',
    ),
  )
  assert.throws(() => variants(), /complete has routing condition/)
})
