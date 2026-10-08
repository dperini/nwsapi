import { invoke, state } from './sampling.mts'
import { expect, test } from 'vitest'
test('compiler comparison consumes unique compiled source from both engines', async () => {
  await invoke('compiler', ['dist/nwsapi.js', 'dist/nwsapi.js', '/report'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows).toHaveLength(9)
  expect(
    report.rows.every((row: { samples: number[][] }) =>
      row.samples.every(samples => samples.length === 9),
    ),
  ).toBe(true)
  expect(report.consumed).toBeGreaterThan(0)
  expect(state.sample).toHaveBeenCalledTimes(162)
  expect(state.sample.mock.calls.every(call => call[1] === 500)).toBe(true)
})
test('compiler comparison requires all input paths', async () => {
  await expect(invoke('compiler', [])).rejects.toThrow()
  expect(state.sample).not.toHaveBeenCalled()
})
