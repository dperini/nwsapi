import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'

const state = vi.hoisted(() => ({
  write: vi.fn(),
  factory: vi.fn(),
  transform: vi.fn(),
  disconnect: vi.fn(),
  empty: false,
  mismatch: '',
}))
vi.mock('node:fs', async original => ({
  ...(await original<typeof NodeFs>()),
  readFileSync: () => 'candidate',
  mkdtempSync: () => '/fixture/profile',
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: () => 'baseline' }))
vi.mock('rolldown/utils', () => ({ transform: state.transform }))
vi.mock('node:vm', () => ({
  default: {
    runInNewContext: (
      _code: string,
      context: { module: { exports: unknown } },
      options: { filename: string },
    ) => {
      context.module.exports = () => state.factory(options.filename)
    },
  },
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect() {}
    disconnect() {
      state.disconnect()
    }
    async post(command: string) {
      return command === 'Profiler.stop'
        ? {
            profile: {
              nodes: [
                { id: 1, callFrame: { functionName: 'select' } },
                { id: 2, callFrame: { functionName: 'other' } },
              ],
              ...(state.empty ? {} : { samples: [1, 1] }),
            },
          }
        : {}
    }
  },
}))
vi.mock('../../../../scripts/repo/bench/timing.mts', () => ({
  sample: async (callback: () => void) => {
    callback()
    return { milliseconds: 2, samples: [2] }
  },
  median: (values: number[]) => values[0],
}))
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.empty = false
  state.mismatch = ''
  state.write.mockClear()
  state.disconnect.mockClear()
  state.transform.mockReset().mockResolvedValue({ code: '', errors: [] })
  const nodes = [{ id: 'first' }, { id: 'second' }]
  state.factory.mockReset().mockImplementation((filename: string) => ({
    Version: 'fixture',
    select: () =>
      filename === 'candidate.js' && state.mismatch
        ? state.mismatch === 'length'
          ? []
          : [nodes[1], nodes[0]]
        : nodes,
    first: () => nodes[0],
  }))
  process.argv = [argv[0]!, 'filtered-positions.mts', '--baseline', 'fixture']
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
})
async function run() {
  await import('../../../../scripts/repo/bench/filtered-positions.mts')
}
test.each([false, true])(
  'records alternating phases and profile sample availability %s',
  async empty => {
    state.empty = empty
    await run()
    const call = state.write.mock.calls.find(([file]) =>
      String(file).endsWith('filtered-positions.json'),
    )!
    const report = JSON.parse(String(call[1]))
    expect(report.rows).toHaveLength(13)
    expect(report.filtered).toHaveLength(6)
    expect(
      report.rows.every((row: { samples: number[][] }) =>
        row.samples.every(values => values.length === 7),
      ),
    ).toBe(true)
    expect(report.profile.samples).toBe(empty ? 0 : 2)
    expect(
      report.profile.top.map((row: { samples: number }) => row.samples),
    ).toEqual(empty ? [0, 0] : [2, 0])
    expect(report.consumed).toBeGreaterThan(0)
    expect(state.disconnect).toHaveBeenCalledOnce()
  },
)
test.each(['length', 'identity'])(
  'rejects candidate result %s mismatch',
  async mismatch => {
    state.mismatch = mismatch
    await expect(run()).rejects.toBeInstanceOf(Error)
    expect(state.write).not.toHaveBeenCalled()
  },
)
test.each([1, 2])('rejects transform errors in source %i', async count => {
  if (count === 2) {
    state.transform.mockResolvedValueOnce({ code: '', errors: [] })
  }
  state.transform.mockResolvedValueOnce({ code: '', errors: [{}] })
  await expect(run()).rejects.toBeInstanceOf(Error)
})
test('requires a baseline revision', async () => {
  process.argv = argv.slice(0, 1).concat('filtered-positions.mts')
  await expect(run()).rejects.toBeInstanceOf(Error)
  expect(state.transform).not.toHaveBeenCalled()
})
