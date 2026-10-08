import type * as Fs from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ write: vi.fn() }))
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/survey/compiler.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/survey/compiler.mts')
  } finally {
    process.argv = argv
  }
}
test.each([{ args: [] }, { args: ['--help'] }])(
  'compiler survey help avoids output $args',
  async ({ args }) => {
    await invoke(args)
    expect(state.write).not.toHaveBeenCalled()
  },
)
test('compiler survey records live host reads and correct sibling identities', async () => {
  await invoke(['/report.json'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.attributes).toHaveLength(3)
  expect(
    report.attributes.every(
      (row: { attributeReads: number }) => row.attributeReads > 0,
    ),
  ).toBe(true)
  expect(report.siblingReads).toHaveLength(5)
  expect(
    report.siblingReads.every(
      (row: { matches: number; siblings: number }) =>
        row.matches === row.siblings / 2,
    ),
  ).toBe(true)
})
