import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('node:fs', () => ({ readFileSync: state.read }))
import {
  probeSource,
  variants,
} from '../../../../../scripts/repo/bench/planner/variants.mts'
const marker =
  "count > 0 && count * 3 > context.getElementsByTagName('*').length"
const source = `module.exports=function(count,total,arity){const context={getElementsByTagName:()=>({length:total})},collections=Array(arity);return ${marker};}`
function engine(code: string) {
  const module = { exports: undefined as unknown }
  new vm.Script(code).runInNewContext({ module })
  return module.exports as ((
    count: number,
    total: number,
    arity: number,
  ) => boolean) & { probes: () => number }
}

test('planner variants compare forced routes, guarded learned decisions and counted baseline probes', () => {
  state.read.mockReturnValue(source)
  const original = variants()
  assert.equal(original.length, 3)
  assert.equal(engine(original[0]!)(4, 100, 2), false)
  assert.equal(engine(original[1]!)(100, 100, 2), false)
  assert.equal(engine(original[2]!)(4, 100, 2), true)
  const learned = variants({
    model: { broad: true },
    domain: { min: [0, 1, 1, 0], max: [128, 1024, 3, 1], arities: [1, 2, 3] },
  })
  assert.equal(learned.length, 2)
  assert.equal(engine(learned[1]!)(4, 100, 2), true)
  assert.equal(engine(learned[1]!)(4, 100, 4), false)
  const probe = engine(probeSource())
  assert.equal(probe(4, 100, 2), false)
  assert.equal(probe(100, 100, 2), true)
  assert.equal(probe.probes(), 2)
  state.read.mockReturnValue('module.exports=1')
  assert.throws(() => variants())
  state.read.mockReturnValue(source + source)
  assert.throws(() => variants())
})
