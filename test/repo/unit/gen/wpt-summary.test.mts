import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  values: {
    input: 'report.json' as string | undefined,
    output: 'summary.json',
  },
}))
vi.mock('node:fs', () => ({
  readFileSync: mocks.read,
  writeFileSync: mocks.write,
}))
vi.mock('node:util', () => ({ parseArgs: () => ({ values: mocks.values }) }))
vi.mock('../../e2e/upstream/manifest.mts', () => ({
  manifest: [{ path: '/b' }, { path: '/a' }],
}))
function page(path: string, adaptation: string | null = null) {
  return {
    path,
    adaptation,
    origin: 'upstream',
    engineSha256: 'hash',
    wptRevision: 'revision',
    browser: 'Chromium',
    total: 2,
    counts: {
      pass: 1,
      fail: 0,
      expectedFail: 1,
      unexpectedPass: 0,
      filtered: 0,
    },
    harness: { status: 0 },
    knownFailures: [{ name: 'unsupported', status: 'FAIL', reason: 'known' }],
  }
}
function attachment(value: unknown) {
  return {
    name: 'wpt-subtests',
    body: Buffer.from(JSON.stringify(value)).toString('base64'),
  }
}
function report(pages: unknown[], status = 'expected') {
  return {
    stats: { startTime: '2026-10-07' },
    suites: [
      {
        suites: [
          {
            specs: [
              {
                tests: pages.map(value => ({
                  status,
                  results: [
                    { attachments: [{ name: 'ignored' }, attachment(value)] },
                  ],
                })),
              },
            ],
          },
        ],
      },
    ],
  }
}
async function run(value: unknown) {
  mocks.read.mockReturnValue(JSON.stringify(value))
  await import('../../../../scripts/repo/gen/wpt-summary.mts')
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.values.input = 'report.json'
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
test('aggregates complete reports, distinguishes known failures and orders pages', async () => {
  await run(report([page('/b'), page('/a', 'adapted')]))
  const result = JSON.parse(mocks.write.mock.calls[0]![1])
  expect(result.pages.map((entry: { path: string }) => entry.path)).toEqual([
    '/a',
    '/b',
  ])
  expect(result.groups).toEqual({
    upstream: { pages: 1, subtests: 2, passed: 1, knownFailures: 1 },
    adapted: { pages: 1, subtests: 2, passed: 1, knownFailures: 1 },
  })
  expect(result.pages[0].knownFailures).toEqual(['unsupported'])
})
test.each(['unexpected', 'skipped', 'flaky'])(
  'rejects %s test statuses',
  async status => {
    await expect(
      run(report([page('/b'), page('/a')], status)),
    ).rejects.toThrow()
    expect(mocks.write).not.toHaveBeenCalled()
  },
)
test('requires an input report', async () => {
  mocks.values.input = undefined
  await expect(run({})).rejects.toThrow()
})
test.each([
  [page('/a')],
  [page('/a'), page('/a')],
  [page('/a'), page('/unknown')],
])('requires every manifest entry exactly once %j', async (...pages) => {
  await expect(run(report(pages))).rejects.toThrow()
})
test.each([
  { engineSha256: '' },
  { wptRevision: '' },
  { browser: '' },
  { engineSha256: 'other' },
  { wptRevision: 'other' },
  { browser: 'other' },
  { harness: { status: 1 } },
  { counts: { pass: 1, expectedFail: 1, fail: 1 } },
  { counts: { pass: 1, expectedFail: 1, unexpectedPass: 1 } },
  { counts: { pass: 1, expectedFail: 1, filtered: 1 } },
  { total: 3 },
  { knownFailures: [] },
])('rejects inconsistent page data %j', async changes => {
  await expect(
    run(report([page('/b'), { ...page('/a'), ...changes }])),
  ).rejects.toThrow()
  expect(mocks.write).not.toHaveBeenCalled()
})
