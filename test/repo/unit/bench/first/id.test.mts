import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  baselineWrong: false,
  candidateWrong: false,
  write: vi.fn(),
  close: vi.fn(),
}))
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('node:module', () => ({
  createRequire: () => (file: string) => () => ({
    first: (
      selector: string,
      root: { querySelector: (selector: string) => unknown },
    ) => {
      const wrong = file.includes('baseline')
        ? state.baselineWrong
        : state.candidateWrong
      return wrong ? null : root.querySelector(selector)
    },
  }),
}))
vi.mock('../../../../../scripts/repo/bench/timing.mts', () => ({
  median: (values: number[]) =>
    values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)],
}))
vi.mock('jsdom', () => ({
  JSDOM: class {
    static fragment() {
      return { childNodes: [] }
    }
    window: { document: unknown; close: () => void }
    constructor() {
      const target = { id: 'target' }
      const query = (selector: string) =>
        selector.includes('missing') ? null : target
      const shadow = { append: () => {}, querySelector: query }
      const main = {
        append: () => {},
        attachShadow: () => shadow,
        querySelector: query,
      }
      const document = {
        querySelector: (selector: string) =>
          selector === 'main' ? main : query(selector),
      }
      this.window = { document, close: state.close }
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.baselineWrong = false
  state.candidateWrong = false
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/first/id.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/first/id.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'ID timing reports correct candidate results baselineWrong=%s',
  async wrong => {
    state.baselineWrong = wrong
    await invoke(['--baseline', '/baseline.js'])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(report.rows).toHaveLength(18)
    expect(
      report.rows.every((row: { correct: boolean[] }) => row.correct[1]),
    ).toBe(true)
    expect(
      report.rows.some(
        (row: { warm: Array<{ medianMs: number | null }> }) =>
          row.warm[0]?.medianMs === null,
      ),
    ).toBe(wrong)
    expect(state.close).toHaveBeenCalledTimes(3)
  },
)
test('a missing baseline rejects before creating fixtures', async () => {
  await expect(invoke([])).rejects.toThrow()
  expect(state.close).not.toHaveBeenCalled()
})
test('candidate correctness failures close the active fixture without a report', async () => {
  state.candidateWrong = true
  await expect(invoke(['--baseline', '/baseline.js'])).rejects.toThrow()
  expect(state.close).toHaveBeenCalledOnce()
  expect(state.write).not.toHaveBeenCalled()
})
