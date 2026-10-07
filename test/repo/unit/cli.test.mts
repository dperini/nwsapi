import { expect, test, vi } from 'vitest'
const inspect = vi.hoisted(() => vi.fn(async () => 'resolver'))
vi.mock('../../../scripts/repo/compile.mts', () => ({
  inspectSelector: inspect,
}))
import { runCli } from '../../../scripts/repo/cli.mts'
test.each([[], ['--help'], ['-h'], ['compile', '--help']])(
  'help succeeds without compilation %#',
  async (...args) => {
    expect(await runCli(args)).toBeTypeOf('string')
  },
)
test.each([
  ['unknown'],
  ['compile'],
  ['compile', '.a', '.b'],
  ['compile', '--mode', 'invalid', '.a'],
])('invalid CLI inputs reject %#', async (...args) => {
  await expect(runCli(args)).rejects.toThrow()
})
test('compile delegates one selector and parsed options', async () => {
  expect(
    await runCli(['compile', '--json', '--legacy', '--mode', 'match', '.a']),
  ).toBe('resolver')
  expect(inspect).toHaveBeenCalledWith(
    '.a',
    expect.objectContaining({ mode: 'match', legacy: true, json: true }),
  )
})
