import type * as Fs from 'node:fs'
import type * as Prefix from '../../../../../scripts/repo/bench/ancestor/prefix.mts'
import { beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  write: vi.fn(),
  memory: vi.fn(),
  inlineCompatible: false,
  shared: vi.fn(),
}))
vi.mock('../../../../../scripts/repo/bench/ancestor/prefix.mts', async () => {
  const actual = await vi.importActual<typeof Prefix>(
    '../../../../../scripts/repo/bench/ancestor/prefix.mts',
  )
  return {
    ...actual,
    createSharedPrefixVariants: (
      ...args: Parameters<typeof actual.createSharedPrefixVariants>
    ) => {
      state.shared(...args)
      return actual.createSharedPrefixVariants(
        args[0],
        args[1],
        args[2],
        args[3],
        state.inlineCompatible ? undefined : args[4],
      )
    },
  }
})
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/bench/ancestor/memory.mts', () => ({
  profileAncestorMemory: state.memory,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.inlineCompatible = false
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.memory.mockResolvedValue({ variants: [] })
})

async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [
    argv[0]!,
    '/ancestor/reads.mts',
    '--iterations',
    '1',
    '--warmups',
    '1',
    ...args,
  ]
  try {
    await import('../../../../../scripts/repo/bench/ancestor/reads.mts')
  } finally {
    process.argv = argv
  }
}

test.each([
  { flags: [], count: 3 },
  { flags: ['--classes', '--single', '--memory'], count: 3 },
  { flags: ['--prefix'], count: 3 },
  { flags: ['--shared'], count: 3 },
  { flags: ['--baseline', 'dist/nwsapi.js'], count: 2 },
  { flags: ['--baseline', 'dist/nwsapi.js', '--attribute-classes'], count: 2 },
])(
  'ancestor reads validates mutations and order for $flags',
  async ({ flags, count }) => {
    await invoke(flags)
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(10)
    expect(
      report.rows.every(
        (row: {
          variants: unknown[]
          mutationCorrect: boolean
          reversedOrderCorrect: boolean
        }) =>
          row.variants.length === count &&
          row.mutationCorrect &&
          row.reversedOrderCorrect,
      ),
    ).toBe(true)
    expect(state.memory).toHaveBeenCalledTimes(
      flags.includes('--memory') ? 10 : 0,
    )
  },
)

test('attribute reader comparison requires a control engine', async () => {
  await expect(invoke(['--attribute-classes'])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})

test('inline experiments reject an already optimized resolver shape', async () => {
  await expect(invoke(['--inline'])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})

test('inline mode forwards the compiled resolver to the experimental helper', async () => {
  state.inlineCompatible = true
  await invoke(['--inline'])
  expect(state.shared).toHaveBeenCalledTimes(10)
  expect(
    state.shared.mock.calls.every(call => typeof call[4] === 'string'),
  ).toBe(true)
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows).toHaveLength(10)
})
