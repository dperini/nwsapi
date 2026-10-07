import { expect, test } from 'vitest'
import { invoke, state } from './fixture.mts'
test.each([true, false])(
  'first timing records checked identity and runtime metadata cpu=%s',
  async cpu => {
    state.cpu = cpu
    await invoke('timing', ['/baseline.cjs', '/reports/result.json'])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(report.rows).toHaveLength(14)
    expect(report.metadata.consumed).toBeGreaterThan(0)
    expect(state.closed).toBe(1)
  },
)
test.each([{ args: [] }, { args: ['/baseline.cjs'] }])(
  'missing timing arguments reject %#',
  async ({ args }) => {
    await expect(invoke('timing', args)).rejects.toThrow()
  },
)
test('identity mismatches close the timing document without a report', async () => {
  state.failure = 'identity'
  await expect(
    invoke('timing', ['/baseline.cjs', '/result.json']),
  ).rejects.toThrow()
  expect(state.closed).toBe(1)
  expect(state.write).not.toHaveBeenCalled()
})
