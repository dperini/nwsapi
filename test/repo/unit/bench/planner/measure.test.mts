import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { compileFunction } from 'node:vm'
import type { Fixture } from '../../../../../scripts/repo/bench/planner/fixtures.mts'
const state = vi.hoisted(() => ({
  close: vi.fn(),
  isolated: true,
  skipFactories: false,
  sources: [] as string[],
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: async (queries: Array<() => unknown>) =>
    queries.map(query => {
      query()
      return [{ p50Ns: 10, calls: 1 }]
    }),
}))
vi.mock('../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  median: (values: number[]) => values[0],
  sha256: () => 'hash',
}))
vi.mock('../../../../../scripts/repo/bench/planner/variants.mts', () => ({
  probeSource: () =>
    'module.exports=()=>({select:()=>[]});module.exports.probes=()=>0',
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      close: state.close,
      version: () => 'fixture',
      newPage: async () => ({
        route: async (_url: string, callback: (route: unknown) => unknown) =>
          callback({ fulfill: vi.fn() }),
        goto: async () => undefined,
        addScriptTag: async ({ content }: { content: string }) => {
          if (!state.skipFactories) {
            compileFunction(content)()
          }
        },
        evaluate: async (callback: (arg: unknown) => unknown, arg: unknown) =>
          callback(arg),
      }),
    }),
  },
}))
let dom: JSDOM
function source(mode = 'valid') {
  return `module.exports=function(){let calls=0;return {select:function(selector,doc){calls+=1;const nodes=Array.from(doc.querySelectorAll(selector));return ${mode === 'length' ? '[]' : mode === 'identity' ? 'nodes.map(()=>doc.body)' : mode === 'post' ? 'calls>129?[]:nodes' : 'nodes'}}}}`
}
function fixture(extra: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture',
    family: 'class',
    split: 'train',
    html: '<p></p><p></p>',
    selector: 'p',
    tags: ['p'],
    ...extra,
  } as Fixture
}
beforeEach(() => {
  vi.resetModules()
  state.close.mockClear()
  state.skipFactories = false
  dom = new JSDOM('<body></body>')
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('crossOriginIsolated', true)
  vi.stubGlobal('plannerFactories', [])
  let time = 0
  vi.stubGlobal('performance', {
    now: () => {
      time += 1
      return time
    },
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  dom.window.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function module() {
  const result =
    await import('../../../../../scripts/repo/bench/planner/measure.mts')
  result.settings.rounds = 2
  result.settings.milliseconds = 1
  result.settings.batch = 2
  return result
}
test('checks probe preflight and observed planner features', async () => {
  const owner = await module()
  owner.assertRoutes([
    fixture({ skipProbe: true }),
    fixture({ plannerFeatures: [1, 0, 1, 1] }),
  ])
  const probe =
    'let n=0;module.exports=()=>({select:()=>{n+=1;return []}});module.exports.probes=()=>n;module.exports.features=()=>[1,2,1,0.5]'
  owner.assertRoutes(
    [fixture({ plannerFeatures: [1, 2, 1, 0.5] }), fixture()],
    probe,
  )
  expect(() =>
    owner.assertRoutes(
      [fixture()],
      'module.exports=()=>({select:()=>[]});module.exports.probes=()=>0',
    ),
  ).toThrow(expect.objectContaining({ code: 'ERR_ASSERTION' }))
})
test('measures jsdom with derived and frozen features', async () => {
  const rows = await (
    await module()
  ).measureJsdom(
    [fixture(), fixture({ plannerFeatures: [2, 5, 1, 0.4] })],
    [source(), source()],
  )
  expect(rows.map(row => row.features)).toEqual([
    [2, 5, 1, 0.4],
    [2, 5, 1, 0.4],
  ])
  expect(rows[0]!.costs).toEqual([10, 10])
  expect(rows[0]!.calls).toEqual([[1], [1]])
})
test('rejects jsdom identity mismatches', async () => {
  await expect(
    (await module()).measureJsdom([fixture()], [source('identity'), source()]),
  ).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
})
test('executes isolated native iframe samples and removes frames', async () => {
  const result = await (
    await module()
  ).measureBrowser(
    [fixture(), fixture({ plannerFeatures: [2, 5, 1, 0.4] })],
    [source(), source()],
  )
  expect(result.rows).toHaveLength(2)
  expect(result.rows[0]!.samples.map(values => values.length)).toEqual([2, 2])
  expect(result.rows[0]!.features).toEqual([2, 5, 1, 0.4])
  expect(dom.window.document.querySelectorAll('iframe')).toHaveLength(0)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['isolation', 'factories', 'length', 'identity', 'post'])(
  'cleans native comparison after %s failure',
  async mode => {
    if (mode === 'isolation') {
      vi.stubGlobal('crossOriginIsolated', false)
    }
    state.skipFactories = mode === 'factories'
    await expect(
      (await module()).measureBrowser([fixture()], [source(mode), source()]),
    ).rejects.toBeInstanceOf(Error)
    expect(dom.window.document.querySelectorAll('iframe')).toHaveLength(0)
    expect(state.close).toHaveBeenCalledOnce()
  },
)
