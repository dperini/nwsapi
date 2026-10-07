import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
import type * as Fixture from '../../../../../scripts/repo/bench/compare/fixture.mts'
const state = vi.hoisted(() => ({
  badFixture: false,
  config: {} as Record<string, unknown>,
  write: vi.fn(),
  memory: vi.fn(async (query: (index: number) => unknown) => {
    query(0)
    query(1)
    return ['heap']
  }),
  timing: vi.fn(
    async (
      queries: Array<() => unknown>,
      _settings: unknown,
      heap?: { gc: () => void; read: () => number },
    ) => {
      queries.map(query => query())
      if (heap) {
        heap.gc()
        heap.read()
      }
      return ['timing']
    },
  ),
}))
vi.mock(
  '../../../../../scripts/repo/bench/compare/fixture.mts',
  async importOriginal => {
    const actual = await importOriginal<typeof Fixture>()
    return {
      ...actual,
      fixture: (...args: Parameters<typeof actual.fixture>) =>
        state.badFixture ? '<main></main>' : actual.fixture(...args),
    }
  },
)
vi.mock('../../../../../scripts/repo/bench/compare/options.mts', () => ({
  options: () => state.config,
  metadata: () => ({ fixture: true }),
  writeReport: state.write,
}))
vi.mock('../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.timing,
}))
vi.mock('../../../../../scripts/repo/bench/ancestor/memory.mts', () => ({
  profileAncestorMemory: state.memory,
}))

test('Node comparison checks native result identities and keeps memory work separate from query timings', async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-node-comparison-'),
  )
  const engine = path.join(directory, 'engine.cjs')
  writeFileSync(
    engine,
    'module.exports=()=>({select:(selector,document)=>Array.from(document.querySelectorAll(selector))})',
  )
  state.config = {
    paths: [engine, engine],
    counts: [0, 1],
    groups: 2,
    layout: 'adjacent',
    scenario: 'grouped',
    settings: { rounds: 1, milliseconds: 1, batch: 1 },
    mode: 'timing',
    output: '/fixture/report.json',
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = async () => {
    vi.resetModules()
    await import('../../../../../scripts/repo/bench/compare/node.mts')
  }
  try {
    await load()
    const timing = state.write.mock.calls[0]![1]
    assert.equal(timing.heapProvider, null)
    assert.equal(timing.fixture, true)
    assert.equal(state.memory.mock.calls.length, 0)
    assert.ok(timing.rows.length >= 2)
    assert.equal(timing.rows[0].matches, 0)
    state.config['mode'] = 'memory'
    vi.stubGlobal('gc', undefined)
    await assert.rejects(load())
    const gc = vi.fn()
    vi.stubGlobal('gc', gc)
    await load()
    const memory = state.write.mock.calls[1]![1]
    assert.equal(memory.heapProvider, 'v8.getHeapStatistics().used_heap_size')
    assert.equal(gc.mock.calls.length, memory.rows.length)
    assert.deepEqual(memory.rows[0].memory, ['heap'])
    state.badFixture = true
    state.config['counts'] = [1]
    await assert.rejects(load())
  } finally {
    vi.unstubAllGlobals()
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
