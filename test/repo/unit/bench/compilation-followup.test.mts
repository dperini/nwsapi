import type * as Fs from 'node:fs'
import factory from '../../../../dist/nwsapi.js'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  compare: vi.fn(),
  cpu: true,
}))
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
vi.mock('node:os', () => ({
  default: { cpus: () => (state.cpu ? [{ model: 'fixture' }] : []) },
}))
vi.mock('../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.cpu = true
  state.compare.mockImplementation(async (queries: Array<() => unknown>) =>
    queries.map(query => {
      query()
      return [{ p50Ns: 100, samplesNs: [100] }]
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/compilation-followup.mts', ...args]
  try {
    return await import('../../../../scripts/repo/bench/compilation-followup.mts')
  } finally {
    process.argv = argv
  }
}
test.each([true, false])(
  'compilation followup validates all public and raw operations cpu=%s',
  async cpu => {
    state.cpu = cpu
    const module = await invoke(['dist/nwsapi.js', 'dist/nwsapi.js', '/out'])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(13)
    expect(
      new Set(report.rows.map((row: { operation: string }) => row.operation)),
    ).toEqual(new Set(['first', 'select', 'raw', 'match']))
    expect(report.cpu).toBe(cpu ? 'fixture' : undefined)
    expect(state.compare).toHaveBeenCalledTimes(13)
    const invalid = module.prepare(
      factory as unknown as Parameters<typeof module.prepare>[0],
      '<div/>',
      {
        name: 'invalid',
        selector: 'div',
        operation: 'invalid',
        size: 1,
        expected: 'all',
      } as unknown as Parameters<typeof module.prepare>[2],
    )
    try {
      expect(() => invalid.run()).toThrow()
    } finally {
      invalid.close()
    }
  },
)
test('timing errors abort output', async () => {
  state.compare.mockRejectedValue(new Error('timing failed'))
  await expect(
    invoke(['dist/nwsapi.js', 'dist/nwsapi.js', '/out']),
  ).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
test('compilation followup requires all paths', async () => {
  await expect(invoke([])).rejects.toThrow()
  expect(state.compare).not.toHaveBeenCalled()
})
