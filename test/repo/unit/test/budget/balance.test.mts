import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ main: false, read: vi.fn() }))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal()),
  readFileSync: state.read,
}))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
import {
  main,
  runBalance,
} from '../../../../../scripts/fleet/test/budget/balance.mts'

const originalArgs = process.argv
const originalExitCode = process.exitCode
const args = [
  '--report',
  '/fixture/results.json',
  '--budget',
  '1s',
  '--elapsed',
  '500ms',
]
beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.read.mockReturnValue(
    JSON.stringify({
      success: true,
      numTotalTests: 2,
      numPassedTests: 2,
      testResults: [
        {
          name: 'a',
          status: 'passed',
          startTime: 0,
          endTime: 20,
          assertionResults: [{ status: 'passed' }],
        },
        {
          name: 'b',
          status: 'passed',
          startTime: 0,
          endTime: 10,
          assertionResults: [{ status: 'passed' }],
        },
      ],
    }),
  )
  process.argv = ['node', 'balance.mts', ...args]
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = originalArgs
  process.exitCode = originalExitCode
})
test('JSON report records actual timing and preserves complete test inventory', () => {
  expect(runBalance([...args, '--json'])).toBe(0)
  const report = JSON.parse(vi.mocked(console.log).mock.calls[0]![0])
  expect(report).toMatchObject({
    status: 'within-budget-sample',
    gateEvidence: false,
    fileCount: 2,
    testCount: 2,
    budgetMs: 1000,
    elapsedMs: 500,
    overrunMs: 0,
  })
  expect(
    report.slowestFiles.map((file: { name: string }) => file.name),
  ).toEqual(['a', 'b'])
  expect(
    report.shards
      .flatMap((shard: { files: Array<{ name: string }> }) => shard.files)
      .map((file: { name: string }) => file.name)
      .toSorted(),
  ).toEqual(['a', 'b'])
})
test('over-budget text reports return failure and respect requested shard count', () => {
  expect(
    runBalance([
      '--report',
      '/fixture/report.json',
      '--budget',
      '1ms',
      '--elapsed',
      '2ms',
      '--shards',
      '1',
    ]),
  ).toBe(1)
  expect(console.log).toHaveBeenCalledOnce()
})
test.each([new Error('fixture'), 'fixture'])(
  'main converts read failures to an input-error status',
  error => {
    state.read.mockImplementationOnce(() => {
      throw error
    })
    expect(main()).toBe(2)
    expect(console.error).toHaveBeenCalledOnce()
  },
)
test('main returns successful timing status', () => {
  expect(main()).toBe(0)
})
test.each(['--help', '-h'])(
  'CLI help %s skips reading measurements',
  async flag => {
    vi.resetModules()
    state.main = true
    process.argv = ['node', 'balance.mts', flag]
    await import('../../../../../scripts/fleet/test/budget/balance.mts')
    expect(state.read).not.toHaveBeenCalled()
  },
)
test('CLI assigns the measured exit status', async () => {
  vi.resetModules()
  state.main = true
  await import('../../../../../scripts/fleet/test/budget/balance.mts')
  expect(process.exitCode).toBe(0)
})
