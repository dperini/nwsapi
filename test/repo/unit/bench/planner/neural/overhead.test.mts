import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test, vi } from 'vitest'
import { invokeMainModule } from '../../main-module.mts'

const state = vi.hoisted(() => ({
  launch: vi.fn(),
  compare: vi.fn(),
  power: vi.fn(() => 'AC'),
  close: vi.fn(),
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
vi.mock('../../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/fixture/chrome' }),
}))
vi.mock('../../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: state.power,
}))
import { measureOverhead } from '../../../../../../scripts/repo/bench/planner/neural/overhead.mts'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('neural overhead measures rotating node/browser inputs and closes isolated browser resources', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-overhead-'))
  const names = ['reference', 'scalar', 'folded']
  for (let index = 0, length = names.length; index < length; index += 1) {
    writeFileSync(
      path.join(directory, `${names[index]}.mjs`),
      'export function chooseRoute(a, w) { return w <= a * 2 }',
    )
  }
  let clock = 0
  vi.stubGlobal('performance', {
    now: () => {
      clock += 10
      return clock
    },
  })
  vi.stubGlobal('crossOriginIsolated', true)
  const fulfill = vi.fn()
  const page = {
    route: vi.fn(async (_pattern, callback) => callback({ fulfill })),
    goto: vi.fn(),
    evaluate: async <Input, Output>(
      callback: (value: Input) => Output,
      value: Input,
    ) => callback(value),
  }
  state.launch.mockResolvedValue({
    newPage: async () => page,
    close: state.close,
    version: () => 'test',
  })
  state.compare.mockImplementation(async (runners: Array<() => unknown>) =>
    runners.map(runner => {
      runner()
      runner()
      return [{ p50Ns: 1 }, { p50Ns: 2 }, { p50Ns: 3 }]
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const result = await measureOverhead(directory)
    assert.equal(result.inputs, 256)
    assert.deepEqual(Object.keys(result.node), [
      'baseline',
      'reference',
      'scalar',
      'folded',
    ])
    assert.equal(result.node['baseline']!.medianNs, 2)
    assert.equal(result.browser.results['baseline']!.rounds.length, 11)
    assert.ok(result.browser.checksum > 0)
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(directory, 'overhead.json'), 'utf8')),
      result,
    )
    assert.equal(
      fulfill.mock.calls[0]![0].headers['Cross-Origin-Embedder-Policy'],
      'require-corp',
    )
    assert.equal(state.close.mock.calls.length, 1)
    vi.stubGlobal('crossOriginIsolated', false)
    await assert.rejects(measureOverhead(directory))
    assert.equal(state.close.mock.calls.length, 2)
    await invokeMainModule(
      () =>
        import('../../../../../../scripts/repo/bench/planner/neural/overhead.mts'),
      ['--help'],
      '/planner/neural/overhead.mts',
    )
    await assert.rejects(
      invokeMainModule(
        () =>
          import('../../../../../../scripts/repo/bench/planner/neural/overhead.mts'),
        [],
        '/planner/neural/overhead.mts',
      ),
    )
    vi.stubGlobal('crossOriginIsolated', true)
    await invokeMainModule(
      () =>
        import('../../../../../../scripts/repo/bench/planner/neural/overhead.mts'),
      [directory],
      '/planner/neural/overhead.mts',
    )
    assert.equal(state.close.mock.calls.length, 3)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
