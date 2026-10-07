import { expect, test, vi } from 'vitest'
import { invoke, state } from './fixture.mts'
test.each([true, false])(
  'cold and warm measurements preserve identity cpu=%s',
  async cpu => {
    state.cpu = cpu
    await invoke('state', ['--rounds', '2', '--iterations', '1'])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(
      report.rows.map((row: { selector: string }) => row.selector),
    ).toEqual(['.card', 'button'])
    expect(report.metadata.consumed).toBe(16)
  },
)
test.each([
  { args: ['--rounds', '0'] },
  { args: ['--rounds', 'NaN'] },
  { args: ['--iterations', '0'] },
  { args: ['--iterations', 'NaN'] },
])('invalid state timing limits reject %#', async ({ args }) => {
  await expect(invoke('state', args)).rejects.toThrow(RangeError)
})
test.each(['cold', 'warm'])(
  'incorrect %s results close measurement contexts',
  async failure => {
    state.failure = failure
    await expect(
      invoke('state', ['--rounds', '1', '--iterations', '1']),
    ).rejects.toThrow()
    expect(state.closed).toBeGreaterThan(1)
    expect(state.write).not.toHaveBeenCalled()
  },
)
test('an empty oracle query rejects before timing', async () => {
  vi.doMock('node:fs', async original => ({
    ...(await original<object>()),
    readFileSync: () =>
      JSON.stringify({ rows: [{ selector: '.not-present' }] }),
  }))
  vi.resetModules()
  try {
    await expect(invoke('state', [])).rejects.toThrow()
  } finally {
    vi.doUnmock('node:fs')
  }
})
