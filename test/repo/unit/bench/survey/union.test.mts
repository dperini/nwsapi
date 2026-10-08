import { gzipSync, gunzipSync } from 'node:zlib'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  exists: false,
  baseline: 'list = engine.sliceCall(collections[i])',
  candidate: 'list = engine.collectionCopy(collections[i], context)',
  write: vi.fn(),
  mkdir: vi.fn(),
  browser: vi.fn(),
  jsdom: vi.fn(),
  main: false,
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: state.mkdir,
  readFileSync: (file: string) =>
    file.endsWith('.gz') ? gzipSync(state.baseline) : state.candidate,
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    components: { html: () => '<main/>' },
    documentation: { html: () => '<article/>' },
    atomic: { html: () => '<aside/>' },
  },
}))
vi.mock('../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => ({ source: 'fixture' }),
}))
vi.mock('../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  settings: { rounds: 0, milliseconds: 0 },
  measureBrowser: state.browser,
  measureJsdom: state.jsdom,
}))
vi.mock('../../../../../scripts/repo/bench/footprint/shared.mts', async () => {
  const { createHash } = await import('node:crypto')
  return {
    provenance: () => ({ jsdom: 'fixture' }),
    sha256: (value: string) => createHash('sha256').update(value).digest('hex'),
  }
})
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.exists = false
  state.main = false
  state.baseline = 'list = engine.sliceCall(collections[i])'
  state.candidate = 'list = engine.collectionCopy(collections[i], context)'
  state.browser.mockResolvedValue({ version: 'fixture-browser', rows: [] })
  state.jsdom.mockResolvedValue([])
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function load(args: string[] = []) {
  const argv = process.argv
  process.argv = [argv[0]!, '/survey/union.mts', ...args]
  try {
    return await import('../../../../../scripts/repo/bench/survey/union.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'union measurements archive four variants and both hosts repeat=%s',
  async repeat => {
    const module = await load()
    const fixtures = module.unionFixtures()
    expect(fixtures.filter(entry => entry.split === 'holdout')).toHaveLength(18)
    expect(fixtures.some(entry => entry.family === 'form coverage')).toBe(true)
    await module.measureUnion('/baseline.gz', '/out', repeat)
    expect(state.mkdir).toHaveBeenCalledWith('/out', { recursive: true })
    const archived = state.write.mock.calls.find(
      call => call[0] === '/out/fixtures.json.gz',
    )![1] as Buffer
    expect(JSON.parse(gunzipSync(archived).toString())[0].id).toBe(
      (repeat ? fixtures.at(-1) : fixtures[0])!.id,
    )
    expect(state.browser).toHaveBeenCalledOnce()
    expect(state.jsdom).toHaveBeenCalledOnce()
    const sources = state.browser.mock.calls[0]![1] as string[]
    expect(sources).toEqual([
      state.baseline,
      state.candidate,
      state.baseline,
      state.candidate,
    ])
    const report = JSON.parse(
      state.write.mock.calls.find(
        call => call[0] === '/out/chromium.json',
      )![1] as string,
    )
    expect(report.metadata.settings).toEqual({
      rounds: repeat ? 9 : 7,
      milliseconds: repeat ? 24 : 15,
    })
  },
)
test.each(['existing', 'baseline', 'candidate'])(
  'invalid union input %s prevents measurements',
  async mode => {
    state.exists = mode === 'existing'
    if (mode === 'baseline') {
      state.baseline = 'missing'
    }
    if (mode === 'candidate') {
      state.candidate = 'missing'
    }
    const module = await load()
    await expect(
      module.measureUnion('/baseline.gz', '/out', false),
    ).rejects.toThrow()
    expect(state.browser).not.toHaveBeenCalled()
  },
)
test.each([
  { args: ['--help'], fails: false },
  { args: [], fails: true },
  { args: ['/baseline.gz', '/out', 'wrong'], fails: true },
  { args: ['/baseline.gz', '/out'], fails: false },
  { args: ['/baseline.gz', '/out', 'repeat'], fails: false },
])('union CLI handles $args', async ({ args, fails }) => {
  state.main = true
  if (fails) {
    await expect(load(args)).rejects.toThrow()
  } else {
    await load(args)
  }
})
