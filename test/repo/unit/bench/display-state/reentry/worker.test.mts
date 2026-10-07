import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('node:fs', () => ({ readFileSync: state.read }))

test('reentry worker forwards matches through the engine and bounds recursive delegation', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = async (source: string, limit: number) => {
    vi.resetModules()
    state.read.mockReturnValue(JSON.stringify({ source, limit }))
    await import('../../../../../../scripts/repo/bench/display-state/reentry/worker.mts')
  }
  const source =
    'module.exports=window=>({match:(selector,element)=>selector===":modal"?element.matches(".control"):true})'
  await load(source, 10)
  const report = JSON.parse(log.mock.calls[0]![0] as string)
  assert.equal(report.initializationCalls, 0)
  assert.equal(report.calls, 1)
  assert.equal(report.result, true)
  assert.ok(report.queryMs >= 0)
  await load(source, 0)
  const recursive =
    'module.exports=()=>({match:(selector,element)=>element.matches(selector)})'
  await assert.rejects(load(recursive, 1))
})
