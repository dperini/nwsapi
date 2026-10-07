import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import { install } from '@puppeteer/browsers'
import {
  analyzeNative,
  candidateRunPlan,
  missingNativeCandidates,
  readNativeRuns,
  runNative,
} from '../../../../../../scripts/repo/check/wpt/native/run.mts'
import { writeNativeContract } from '../../../../../../scripts/repo/check/wpt/native/contract.mts'
import type * as BrowserTools from '@puppeteer/browsers'
import type * as NativePool from '../../../../../../scripts/repo/check/wpt/native/pool.mts'
import type * as NodeRunner from '../../../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  candidates: ['/case.html'],
  listed: '/case.html',
}))
const cli = vi.hoisted(() => ({ active: false }))
vi.mock(
  '../../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) =>
      cli.active && url.endsWith('/native/run.mts'),
  }),
)
vi.mock(
  '../../../../../../scripts/repo/check/wpt/native/pool.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NativePool>()),
    nativePins: () => ({ browser: 'browser', revision: 'revision' }),
  }),
)
vi.mock(
  '../../../../../../scripts/repo/check/wpt/native/discovery.mts',
  () => ({
    discoverNative: () => ({
      revision: 'revision',
      scanned: state.candidates.length,
      filesRead: state.candidates.length,
      candidates: state.candidates.map(testPath => ({
        test: testPath,
        file: testPath.slice(1),
        reasons: ['Selector API.'],
      })),
    }),
  }),
)
vi.mock('../../../../../../scripts/repo/check/wpt/native/contract.mts', () => ({
  writeNativeContract: vi.fn(),
}))
vi.mock('../../../../../../scripts/repo/check/wpt/native/scope.mts', () => ({
  classifyPool: (pool: ReturnType<typeof NativePool.passingUniverse>) => ({
    selected: {
      ...pool,
      nativePassing: pool.cases.length,
      scope: 'native-passing-selectors',
    },
    totals: { 'selector-matching': pool.cases.length },
    finalized: true,
    pages: [],
  }),
}))
vi.mock('../../../../../../scripts/repo/browser.mts', () => ({
  browserInstallOptions: {},
  browserLaunchOptions: () => ({ executablePath: '/chrome' }),
  CHROME_VERSION: 'browser',
}))
vi.mock('@puppeteer/browsers', async importOriginal => ({
  ...(await importOriginal<typeof BrowserTools>()),
  install: vi.fn(async () => ({ executablePath: '/driver' })),
}))
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_command: string, args: string[]) =>
    args.includes('--list-tests-json')
      ? 'log before JSON\n' +
        JSON.stringify({
          '': { testharness: { [state.listed]: { disabled: false } } },
        })
      : '',
  ),
  spawnSync: vi.fn((_command: string, args: string[]) => {
    const report = args[args.indexOf('--log-wptreport') + 1]!
    writeFileSync(
      report,
      JSON.stringify({
        run_info: {
          browser_version: 'browser',
          revision: 'revision',
          product: 'chrome',
        },
        time_start: 0,
        time_end: 10,
        results: [
          {
            test: state.listed,
            status: 'OK',
            subtests: [{ name: 'matches', status: 'PASS' }],
          },
        ],
      }),
    )
    return { status: 0 }
  }),
}))

test('native run records plans and resumes additions while retaining prior report inputs', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-run-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.candidates = ['/case.html']
  state.listed = '/case.html'
  await runNative(directory)
  expect(readNativeRuns(directory)).toHaveLength(1)
  expect(writeNativeContract).toHaveBeenCalled()
  await expect(runNative(directory)).rejects.toThrow()
  mkdirSync(path.join(directory, 'wpt'))
  const downloads = vi.mocked(install).mock.calls.length
  await runNative(directory, true)
  expect(vi.mocked(install).mock.calls).toHaveLength(downloads)
  state.candidates = ['/case.html', '/new.html']
  state.listed = '/new.html'
  await runNative(directory, true)
  expect(readNativeRuns(directory)).toHaveLength(2)
  expect(
    JSON.parse(readFileSync(path.join(directory, 'native-pool.json'), 'utf8'))
      .cases,
  ).toHaveLength(2)
  expect(
    JSON.parse(readFileSync(path.join(directory, 'plan-2.json'), 'utf8'))
      .tests[0].test,
  ).toBe('/new.html')
  state.candidates = ['/unrecorded.html']
  expect(() => analyzeNative(directory)).toThrow()
})

test('plan construction preserves disabled entries and missing candidates ignore recorded variants', () => {
  const plan = candidateRunPlan(
    {
      suite: {
        testharness: { '/a': { disabled: true }, '/b': { disabled: false } },
      },
    },
    { browser: 'browser', revision: 'revision' },
  )
  expect(plan.tests).toEqual([
    { test: '/a', subsuite: 'suite', type: 'testharness', disabled: true },
    { test: '/b', subsuite: 'suite', type: 'testharness', disabled: false },
  ])
  expect(
    missingNativeCandidates([{ test: '/a' }, { test: '/c' }], [plan]),
  ).toEqual([{ test: '/c' }])
})

test('missing plans, incomplete reports and subprocess startup failures remain failures', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-run-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(() => readNativeRuns(directory)).toThrow()
  writeFileSync(path.join(directory, 'planner.json'), '{}')
  expect(() => readNativeRuns(directory)).toThrow()
  state.candidates = ['/case.html']
  state.listed = '/case.html'
  const failure = Object.assign(new Error('Spawn failure'), { code: 'ENOENT' })
  vi.mocked(spawnSync).mockReturnValueOnce({
    error: failure,
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    status: null,
    signal: null,
  })
  await expect(runNative(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  writeFileSync(path.join(directory, 'report.json'), '')
  expect(() => readNativeRuns(directory)).toThrow(SyntaxError)
})

test('native runner CLI enforces replay arguments and routes ordinary and saved runs', async () => {
  const argv = process.argv
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-cli-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  cli.active = true
  state.candidates = ['/case.html']
  state.listed = '/case.html'
  try {
    for (let i = 0, length = 2; i < length; i += 1) {
      process.argv = ['node', 'run.mts', i ? '--resume' : '--analyze']
      vi.resetModules()
      await expect(
        import('../../../../../../scripts/repo/check/wpt/native/run.mts'),
      ).rejects.toThrow()
    }
    process.argv = [
      'node',
      'run.mts',
      '--analyze',
      '--resume',
      '--directory',
      directory,
    ]
    vi.resetModules()
    await expect(
      import('../../../../../../scripts/repo/check/wpt/native/run.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'run.mts', '--directory', directory]
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/run.mts')
    process.argv = ['node', 'run.mts', '--analyze', '--directory', directory]
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/run.mts')
    expect(writeNativeContract).toHaveBeenCalled()
    process.argv = ['node', 'run.mts']
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/run.mts')
    const temporary = vi.mocked(writeNativeContract).mock.lastCall![0]
    expect(readNativeRuns(temporary)).toHaveLength(1)
    rmSync(temporary, { recursive: true, force: true })
  } finally {
    process.argv = argv
    cli.active = false
    rmSync(directory, { recursive: true, force: true })
  }
})
