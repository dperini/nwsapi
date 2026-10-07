import { beforeEach, expect, test, vi } from 'vitest'
import type * as Fs from 'node:fs'
const mocks = vi.hoisted(() => ({ write: vi.fn(), main: false }))
vi.mock('node:fs', async original => ({
  ...(await original<typeof Fs>()),
  writeFileSync: mocks.write,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => mocks.main,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.main = false
})
test('refreshes documentation from the recorded native summary at the CLI entry point', async () => {
  mocks.main = true
  await import('../../../../scripts/repo/gen/wpt-native-summary.mts')
  expect(mocks.write).toHaveBeenCalledOnce()
  expect(mocks.write.mock.calls[0]![0]).toMatch(
    /docs\/repo\/testing\/wpt-inventory\.md$/,
  )
})
test('requires ordered insertion boundaries and preserves surrounding content', async () => {
  const { nativeSummaryDocumentation } =
    await import('../../../../scripts/repo/gen/wpt-native-summary.mts')
  const summary = {
    durationMs: 61_000,
    planned: 2,
    processes: 1,
    platform: 'linux',
    arch: 'arm64',
    nativePassing: 2,
    selected: 2,
    selectedPages: 1,
    totals: {},
  }
  expect(() => nativeSummaryDocumentation('', summary)).toThrow()
  expect(() =>
    nativeSummaryDocumentation(
      '<!-- native-summary:end --><!-- native-summary:start -->',
      summary,
    ),
  ).toThrow()
  // These delimiters are the generator's document insertion interface.
  const document =
    'prefix<!-- native-summary:start -->old<!-- native-summary:end -->suffix'
  const result = nativeSummaryDocumentation(document, summary)
  expect(result.startsWith('prefix<!-- native-summary:start -->')).toBe(true)
  expect(result.endsWith('<!-- native-summary:end -->suffix')).toBe(true)
  expect(result).not.toBe(document)
})
