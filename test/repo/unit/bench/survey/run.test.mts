import type * as Shared from '../../../../../scripts/repo/bench/footprint/shared.mts'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  exists: false,
  errors: false,
  write: vi.fn(),
  mkdir: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  timing: vi.fn(),
  resolve: vi.fn(),
  read: vi.fn(),
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: state.mkdir,
  readFileSync: state.read,
  writeFileSync: state.write,
}))
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(() => ({ version: 'fixture' }), { resolve: state.resolve }),
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({ version: () => 'fixture', close: state.close }),
  },
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    components: { html: () => '<main/>' },
    documentation: { html: () => '<article/>' },
    atomic: { html: () => '<aside/>' },
  },
}))
vi.mock('../../../../../scripts/repo/bench/native/host.mts', () => ({
  nativeSources: async () => ({ competitorBundleSha256: 'bundle' }),
  nativePage: async () => ({ close: state.pageClose }),
}))
vi.mock('../../../../../scripts/repo/bench/native/timing.mts', () => ({
  nativeTiming: state.timing,
}))
vi.mock('../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => ({ source: 'fixture' }),
}))
vi.mock('../../../../../scripts/repo/bench/footprint/shared.mts', async () => ({
  ...(await vi.importActual<typeof Shared>(
    '../../../../../scripts/repo/bench/footprint/shared.mts',
  )),
  provenance: () => ({
    candidateVersion: '3',
    jsdom: 'fixture',
    lockfileSha256: 'lock',
  }),
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.exists = false
  state.errors = false
  state.resolve.mockReturnValue('/competitor.mjs')
  state.read.mockReturnValue(Buffer.from('fixture'))
  state.timing.mockImplementation(async () => ({
    rows: [{ errors: state.errors ? ['incorrect'] : [], selector: '.fixture' }],
    consumed: 5,
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/survey/run.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/survey/run.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'survey preserves fixture and dependency provenance expanded=%s',
  async expanded => {
    await invoke(
      expanded
        ? [
            '--expanded',
            '--dependencies',
            '/deps',
            '--rounds',
            '3',
            '--output',
            '/survey.json',
          ]
        : [],
    )
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(3)
    expect(report.metadata.expanded).toBe(expanded)
    expect(report.metadata.rounds).toBe(expanded ? 3 : 9)
    expect(report.metadata.fixtures).toHaveLength(3)
    expect(report.metadata.dependencyLockSha256).toBe(
      expanded ? report.metadata.competitorEntrySha256 : 'lock',
    )
    expect(state.pageClose).toHaveBeenCalledTimes(3)
    expect(state.close).toHaveBeenCalledOnce()
    const settings = state.timing.mock.calls[0]![1] as {
      selectors: Array<{ category: string }>
    }
    expect(settings.selectors.length).toBeGreaterThan(0)
    expect(
      settings.selectors.some(entry => entry.category === 'form coverage'),
    ).toBe(expanded)
  },
)
test('failed selector comparisons are recorded before reporting failure', async () => {
  state.errors = true
  await expect(invoke([])).rejects.toThrow()
  expect(state.write).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
})
test('timing failure closes active page and browser', async () => {
  state.timing.mockRejectedValue(new Error('timing failed'))
  await expect(invoke([])).rejects.toThrow()
  expect(state.pageClose).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
})
test('existing output is protected before browser launch', async () => {
  state.exists = true
  await expect(invoke([])).rejects.toThrow()
  expect(state.close).not.toHaveBeenCalled()
  expect(state.write).not.toHaveBeenCalled()
})
test('help avoids measurements', async () => {
  await invoke(['--help'])
  expect(state.timing).not.toHaveBeenCalled()
})
