import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  write: vi.fn(),
  heap: 0,
}))
vi.mock('../../../../../scripts/repo/bench/compare/options.mts', () => ({
  options: () => state.config,
  metadata: () => ({ fixture: true }),
  writeReport: state.write,
}))
vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }))
vi.mock('node:v8', () => ({
  getHeapStatistics: () => ({ used_heap_size: ++state.heap }),
}))

test('retention runner alternates fresh engines and verifies detached nodes before cache clearing', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-retention-'))
  const engine = path.join(directory, 'engine.cjs')
  writeFileSync(
    engine,
    'module.exports=()=>({select:(s,d)=>Array.from(d.querySelectorAll(s)),Snapshot:{has:s=>s==="[data-hit]"},configure:()=>{}})',
  )
  state.config = {
    paths: [engine, engine],
    settings: { rounds: 2 },
    output: '/fixture/retention.json',
  }
  const load = async () => {
    vi.resetModules()
    await import('../../../../../scripts/repo/bench/compare/retention.mts')
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    vi.stubGlobal('gc', undefined)
    await assert.rejects(load())
    const gc = vi.fn()
    vi.stubGlobal('gc', gc)
    vi.stubGlobal(
      'WeakRef',
      class {
        deref() {
          return undefined
        }
      },
    )
    await load()
    const report = state.write.mock.calls[0]![1]
    assert.equal(report.mode, 'retention')
    assert.equal(report.fixture, true)
    assert.equal(report.samples.length, 4)
    assert.deepEqual(
      report.samples.map((sample: { engine: number }) => sample.engine),
      [0, 1, 1, 0],
    )
    assert.deepEqual(
      [
        report.samples[0].initial,
        report.samples[0].populated,
        report.samples[0].saturated,
        report.samples[0].churned,
        report.samples[0].detached,
        report.samples[0].cleared,
      ],
      [1, 2, 3, 4, 5, 6],
    )
    assert.equal(report.samples[0].survivingNodes, 0)
    assert.equal(gc.mock.calls.length, 96)
    vi.stubGlobal(
      'WeakRef',
      class {
        deref() {
          return {}
        }
      },
    )
    await assert.rejects(load(), { code: 'ERR_ASSERTION' })
    assert.equal(state.write.mock.calls.length, 1)
  } finally {
    vi.unstubAllGlobals()
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
