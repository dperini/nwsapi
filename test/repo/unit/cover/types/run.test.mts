import { expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  persist: vi.fn(),
  check: vi.fn(),
  metric: {
    covered: 3,
    total: 4,
    pct: 75,
    files: 2,
    strict: false,
    engine: 'tsrs',
  },
}))
vi.mock('node:fs', () => ({ writeFileSync: state.write }))
vi.mock('../../../../../scripts/repo/lib/paths.mts', () => ({
  REPO_ROOT: '/repo',
}))
vi.mock('../../../../../scripts/repo/lib/type-coverage.mts', () => ({
  runTypeCoverage: (_root: string, measure: (config: string) => unknown) =>
    measure('/repo/config.json'),
  writeTypeCoverage: state.persist,
  checkTypeCoverage: state.check,
}))
vi.mock('../../../../../scripts/repo/cover/types/analysis.mts', () => ({
  measureNativeTypeCoverage: (
    _config: string,
    report?:
      | ((
          file: string,
          identifiers: Array<{ name: string; offset: number }>,
        ) => void)
      | undefined,
  ) => {
    report?.('/repo/one.mts', [{ name: 'a', offset: 1 }])
    report?.('/repo/two.mts', [
      { name: 'b', offset: 2 },
      { name: 'c', offset: 3 },
    ])
    return state.metric
  },
}))
test.each([false, true])(
  'type coverage details=%s persist the correct report',
  async details => {
    const args = process.argv
    process.argv = [
      args[0]!,
      '/cover/types/run.mts',
      ...(details ? ['--details'] : []),
    ]
    state.write.mockClear()
    state.persist.mockClear()
    state.check.mockClear()
    vi.resetModules()
    try {
      await import('../../../../../scripts/repo/cover/types/run.mts')
      expect(state.persist).toHaveBeenCalledWith('/repo', state.metric)
      expect(state.check).toHaveBeenCalledWith(state.metric)
      expect(state.write).toHaveBeenCalledTimes(details ? 1 : 0)
      if (details) {
        const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
        expect(report.map((entry: { file: string }) => entry.file)).toEqual([
          'two.mts',
          'one.mts',
        ])
      }
    } finally {
      process.argv = args
    }
  },
)
