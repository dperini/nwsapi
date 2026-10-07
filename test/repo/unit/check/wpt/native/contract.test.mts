import { createHash } from 'node:crypto'
import type * as FileSystem from 'node:fs'
import type * as NodeRunner from '../../../../../../scripts/repo/lib/run-node.mts'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  assertFinalized,
  checkNativeContract,
  inferenceDependencies,
  INFERENCE_DEPENDENCIES,
  nativeCachePath,
  writeNativeContract,
} from '../../../../../../scripts/repo/check/wpt/native/contract.mts'
import { REPO_ROOT } from '../../../../../../scripts/repo/lib/paths.mts'
import { writeNativeSummaryDocumentation } from '../../../../../../scripts/repo/gen/wpt-native-summary.mts'

const artifacts = vi.hoisted(() => new Map<string, string>())
const cli = vi.hoisted(() => ({ active: false }))

vi.mock(
  '../../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) => cli.active && url.endsWith('/contract.mts'),
  }),
)

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof FileSystem>()
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      const recorded = artifacts.get(String(args[0]))
      if (recorded !== undefined) {
        return args[1] ? recorded : Buffer.from(recorded)
      }
      return actual.readFileSync(...args)
    },
    writeFileSync: (file: string, data: string) => artifacts.set(file, data),
  }
})
vi.mock('../../../../../../scripts/repo/gen/wpt-native-summary.mts', () => ({
  writeNativeSummaryDocumentation: vi.fn(),
}))

test('native support accounting rejects invalid counts and accepts dependency peer fallbacks', () => {
  expect(() => assertFinalized({ 'selector-matching': -1 }, -1, -1)).toThrow()
  expect(() =>
    assertFinalized({ 'selector-matching': 1.5 }, 1.5, 1.5),
  ).toThrow()
  expect(() => assertFinalized({ 'selector-matching': 1 }, 1, 0)).toThrow()
  expect(() => assertFinalized({ 'selector-matching': 1 }, 2, 1)).toThrow()
  expect(() => assertFinalized({ unknown: 1 }, 1, 1)).toThrow()
  expect(() => assertFinalized({ unresolved: 1 }, 1, 1)).toThrow()
  expect(() => assertFinalized({ 'selector-matching': 1 }, 1, 1)).not.toThrow()
  const peers = Object.fromEntries(
    INFERENCE_DEPENDENCIES.map(name => [name, '1.2.3']),
  )
  expect(inferenceDependencies({ catalog: {} }, peers)).toEqual(peers)
  expect(() => inferenceDependencies({ catalog: {} })).toThrow()
})

test('native contract records input digests and validates committed artifact consistency', async () => {
  const directory = '/recorded-native-run'
  const inputs = ['plan.json', 'report.json', 'discovery.json']
  inputs.forEach(file => artifacts.set(path.join(directory, file), '{}\n'))
  const pins = { browser: 'test-browser', revision: 'test-revision' }
  const scoped: Parameters<typeof writeNativeContract>[1] = {
    selected: {
      ...pins,
      scope: 'native-passing-selectors',
      planned: 1,
      observed: 1,
      disabled: 0,
      nativePassing: 1,
      cases: [
        {
          test: '/selector.html',
          subsuite: '',
          subtest: 'matches',
          type: 'testharness',
          kind: 'selector-matching',
          reason: 'Direct matching assertion.',
        },
      ],
    },
    totals: { 'selector-matching': 1 },
    finalized: true,
    pages: [],
  }
  const reports: Parameters<typeof writeNativeContract>[2] = [
    {
      run_info: {
        browser_version: pins.browser,
        revision: pins.revision,
        product: 'chrome',
      },
      time_start: 10,
      time_end: 20,
      results: [],
    },
  ]
  const summary = writeNativeContract(directory, scoped, reports)
  expect(summary).toMatchObject({
    durationMs: 10,
    runs: 1,
    platform: 'unknown',
    arch: 'unknown',
    selected: 1,
    selectedPages: 1,
  })
  expect(summary.inputs).toEqual(
    inputs.map(file => ({
      file,
      sha256: createHash('sha256').update('{}\n').digest('hex'),
    })),
  )
  expect(writeNativeSummaryDocumentation).toHaveBeenCalledWith(summary)
  expect(JSON.parse(artifacts.get(nativeCachePath)!)).toEqual({
    directory,
    ...pins,
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(() => checkNativeContract(pins)).not.toThrow()
  expect(log).toHaveBeenCalledOnce()
  const argv = process.argv
  cli.active = true
  try {
    process.argv = ['node', 'contract.mts']
    vi.resetModules()
    await expect(
      import('../../../../../../scripts/repo/check/wpt/native/contract.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'contract.mts', '--check']
    vi.resetModules()
    await expect(
      import('../../../../../../scripts/repo/check/wpt/native/contract.mts'),
    ).rejects.toThrow()
  } finally {
    process.argv = argv
    cli.active = false
  }
  expect(() => checkNativeContract({ ...pins, browser: 'different' })).toThrow()
  const summaryPath = path.join(
    REPO_ROOT,
    'assets/repo/bench/wpt-native-summary.json',
  )
  artifacts.set(summaryPath, JSON.stringify({ ...summary, finalized: false }))
  expect(() => checkNativeContract(pins)).toThrow()
  artifacts.set(summaryPath, JSON.stringify(summary))
  const supportPath = path.join(
    REPO_ROOT,
    'assets/repo/bench/wpt-native-support.json',
  )
  artifacts.set(supportPath, '{}')
  expect(() => checkNativeContract(pins)).toThrow()
  artifacts.clear()
})
