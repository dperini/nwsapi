import { expect, test } from 'vitest'
import { invoke, state } from './fixture.mts'
test.each([true, false])(
  'cache timing accepts explicit output=%s',
  async explicit => {
    state.cpu = explicit
    await invoke('cache', [
      '/original.cjs',
      '/fixed.cjs',
      ...(explicit ? ['/report.json'] : []),
    ])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(report.rows).toHaveLength(5)
    expect(report.metadata.consumed).toBeGreaterThan(0)
    expect(state.closed).toBe(3)
  },
)
test.each([{ args: [] }, { args: ['/original.cjs'] }])(
  'missing builds reject %#',
  async ({ args }) => {
    await expect(invoke('cache', args)).rejects.toThrow()
  },
)
test('identity mismatch closes all engine documents', async () => {
  state.failure = 'identity'
  await expect(
    invoke('cache', ['/original.cjs', '/fixed.cjs']),
  ).rejects.toThrow()
  expect(state.closed).toBe(3)
  expect(state.write).not.toHaveBeenCalled()
})
