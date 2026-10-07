import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  values: { check: false },
}))
vi.mock('node:fs', () => ({
  readFileSync: mocks.read,
  writeFileSync: mocks.write,
}))
vi.mock('node:util', () => ({ parseArgs: () => ({ values: mocks.values }) }))
const heap = (cached = 50) => ({
  engineSha256: 'hash',
  node: '26',
  count: 2,
  queries: 5,
  measurements: { baseline: 10, instances: 30, cached },
})
const allocation = (bytes = 100) => ({
  engineSha256: 'hash',
  node: '26',
  iterations: 10,
  compilerBytesPerCall: bytes / 10,
  compilerSampledBytes: bytes,
})
const experiment = (before: unknown, after: unknown) => ({
  baselineRevision: 'a',
  candidateRevision: 'b',
  before,
  after,
})
function source(experiments: Record<string, unknown>) {
  return JSON.stringify({
    measuredAt: '2026-10-07',
    platform: 'mac',
    notes: [],
    experiments,
  })
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.values.check = false
})
async function run(experiments: Record<string, unknown>) {
  mocks.read.mockReturnValue(source(experiments))
  await import('../../../../scripts/repo/gen/memory-performance.mts')
  return JSON.parse(mocks.write.mock.calls[0]![1])
}
test('derives heap and allocation medians while keeping incomplete evidence separate', async () => {
  const result = await run({
    heap: experiment(heap(), heap(40)),
    allocation: experiment(
      [allocation(100), allocation(200)],
      [allocation(50), allocation(70)],
    ),
    missing: experiment(undefined, heap()),
    other: experiment({ engineSha256: 'a' }, { engineSha256: 'b' }),
  })
  expect(result.comparisons).toHaveLength(2)
  expect(result.comparisons[0].metrics.addedBytesPerCachedSelector).toEqual({
    before: 2,
    after: 1,
    reductionPercent: 50,
  })
  expect(result.comparisons[1].metrics.sampledCompilerBytesPerCall).toEqual({
    before: 15,
    after: 6,
    reductionPercent: 60,
  })
  expect(result.additionalEvidence).toEqual(['missing', 'other'])
  expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
})
test.each([
  [experiment({ ...heap(), count: 0 }, heap())],
  [experiment({ ...heap(), measurements: { baseline: 10 } }, heap())],
  [experiment(heap(), { ...heap(), queries: 6 })],
  [experiment(allocation(), { ...allocation(), iterations: 0 })],
])(
  'rejects incomplete and incompatible measurement cohorts %j',
  async entries => {
    await expect(run({ invalid: entries })).rejects.toThrow()
    expect(mocks.write).not.toHaveBeenCalled()
  },
)
test('reports null percentage for a zero baseline', async () => {
  const result = await run({
    allocation: experiment(allocation(0), allocation(10)),
  })
  expect(
    result.comparisons[0].metrics.sampledCompilerBytesPerCall.reductionPercent,
  ).toBeNull()
})
test('check compares the entire derived report without writing', async () => {
  const experiments = { heap: experiment(heap(), heap(40)) }
  await run(experiments)
  const expected = mocks.write.mock.calls[0]![1]
  vi.resetModules()
  mocks.write.mockClear()
  mocks.values.check = true
  mocks.read.mockImplementation(url =>
    String(url).endsWith('memory-observations.json')
      ? source(experiments)
      : expected,
  )
  await import('../../../../scripts/repo/gen/memory-performance.mts')
  expect(mocks.write).not.toHaveBeenCalled()
  vi.resetModules()
  mocks.read.mockReturnValue(source(experiments))
  await expect(
    import('../../../../scripts/repo/gen/memory-performance.mts'),
  ).rejects.toThrow()
})

test.each([undefined, 'custom-query'])(
  'supports browser heap measurements with method %s',
  async method => {
    const browserProfile = {
      ...heap(),
      node: undefined,
      browser: 'Chromium',
      method,
    }
    const result = await run({
      browser: experiment(browserProfile, {
        ...browserProfile,
        measurements: { baseline: 10, instances: 20, cached: 30 },
      }),
    })
    expect(result.comparisons[0].baselineRuntime).toBe('Chromium')
    expect(result.comparisons[0].candidateRuntime).toBe('Chromium')
  },
)
