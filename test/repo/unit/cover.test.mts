import { beforeEach, afterEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  entries: [{ source: 'var count = 1', functions: [] }] as Array<{
    source: string
    functions: unknown[]
  }>,
  execute: vi.fn(),
  convert: vi.fn(async () => ({})),
  context: vi.fn(() => ({})),
  report: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  check: vi.fn(),
  checkTypes: vi.fn(),
  types: { pct: 99, typed: 99, total: 100 },
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  mkdtempSync: () => '/fixture/coverage-run',
  readFileSync: (file: string) =>
    file.endsWith('coverage-final.json') ? '{}' : JSON.stringify(state.entries),
  writeFileSync: state.write,
  rmSync: state.remove,
}))
vi.mock('ast-v8-to-istanbul', () => ({ convert: state.convert }))
vi.mock('istanbul-lib-report', () => ({
  default: { createContext: state.context },
}))
vi.mock('istanbul-reports', () => ({
  default: {
    create: (name: string) => ({
      execute: (context: unknown) => state.report(name, context),
    }),
  },
}))
vi.mock('../../../test/repo/e2e/upstream/manifest.mts', () => ({
  manifest: [{ path: '/fixture.html' }],
}))
vi.mock('../../../scripts/repo/lib/coverage/report.mts', () => ({
  combineCoverage: () => ({
    getCoverageSummary: () => ({
      lines: { pct: 100 },
      toJSON: () => ({ lines: { pct: 100 } }),
    }),
  }),
  coverageReporters: () => ['json', 'html'],
  checkCoverageThresholds: state.check,
}))
vi.mock('../../../scripts/repo/lib/type-coverage.mts', () => ({
  runTypeCoverage: () => state.types,
  writeTypeCoverage: vi.fn(),
  checkTypeCoverage: state.checkTypes,
  accumulatedCoverage: (execution: unknown, types: unknown) => ({
    execution,
    types,
  }),
}))

const originalArgs = process.argv
function args(values: string[]) {
  process.argv = ['node', 'cover.mts', ...values]
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.entries = [{ source: 'var count = 1', functions: [] }]
  state.execute.mockReset()
  state.check.mockReset()
  state.checkTypes.mockReset()
  args([])
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = originalArgs
})

test('coverage combines both browser modes and Node tiers before enforcing gates and generating a badge', async () => {
  await import('../../../scripts/repo/cover.mts')
  expect(state.execute.mock.calls.map(call => call[1])).toEqual([
    ['scripts/repo/test.mts', 'all', '--coverage'],
    ['scripts/repo/test.mts', 'upstream'],
    ['scripts/repo/test.mts', 'upstream'],
    ['scripts/repo/gen/coverage-badge.mts'],
  ])
  expect(
    state.execute.mock.calls.slice(1, 3).map(call => call[2].env.NWSAPI_LEGACY),
  ).toEqual(['0', '1'])
  expect(state.convert).toHaveBeenCalledTimes(2)
  expect(state.convert.mock.calls[0]).toEqual([
    expect.objectContaining({
      ast: expect.objectContaining({ type: 'Program' }),
      wrapperLength: 0,
    }),
  ])
  expect(state.report.mock.calls.map(call => call[0])).toEqual(['json', 'html'])
  expect(JSON.parse(state.write.mock.calls[0]![1])).toEqual({
    execution: { lines: { pct: 100 } },
    types: state.types,
  })
  expect(state.check).toHaveBeenCalledOnce()
  expect(state.remove).toHaveBeenCalledWith('/fixture/coverage-run', {
    recursive: true,
    force: true,
  })
})

test('a worker override is forwarded only after positive integer validation', async () => {
  args(['--workers', '4'])
  await import('../../../scripts/repo/cover.mts')
  expect(state.execute.mock.calls[0]![1]).toEqual([
    'scripts/repo/test.mts',
    'all',
    '--coverage',
    '--maxWorkers',
    '4',
  ])
  const invalid = ['0', '-1', 'one']
  for (let i = 0, length = invalid.length; i < length; i += 1) {
    vi.resetModules()
    args(['--workers', invalid[i]!])
    await expect(
      import('../../../scripts/repo/cover.mts'),
    ).rejects.toBeInstanceOf(Error)
  }
  vi.resetModules()
  args(['--unknown'])
  await expect(import('../../../scripts/repo/cover.mts')).rejects.toMatchObject(
    { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' },
  )
})

test('missing browser execution removes temporary reports and rejects the coverage run', async () => {
  state.entries = []
  await expect(
    import('../../../scripts/repo/cover.mts'),
  ).rejects.toBeInstanceOf(Error)
  expect(state.remove).toHaveBeenCalledOnce()
  expect(state.check).not.toHaveBeenCalled()
})

test('subprocess and coverage gate failures still remove their temporary artifacts', async () => {
  const failures = [state.execute, state.checkTypes, state.check]
  for (let i = 0, length = failures.length; i < length; i += 1) {
    vi.resetModules()
    state.remove.mockClear()
    failures[i]!.mockImplementationOnce(() => {
      throw Object.assign(new Error('fixture'), {
        code: 'ERR_COVERAGE_FIXTURE',
      })
    })
    await expect(
      import('../../../scripts/repo/cover.mts'),
    ).rejects.toMatchObject({ code: 'ERR_COVERAGE_FIXTURE' })
    expect(state.remove).toHaveBeenCalledOnce()
  }
})
