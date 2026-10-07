import { invoke, state } from './fixture.mts'
import { expect, test } from 'vitest'
test('browser port comparison records ordered selection and boolean matches', async () => {
  await invoke('browser', ['/baseline.cjs', '/candidate.cjs', '/out.json'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows).toHaveLength(4)
  expect(
    report.rows.every((row: { samples: number[][] }) =>
      row.samples.every(samples => samples.length === 7),
    ),
  ).toBe(true)
  expect(report.files).toHaveLength(2)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['boolean', 'length', 'order', 'wrong'])(
  'incorrect %s results close the browser without output',
  async mode => {
    state.mode = mode
    await expect(
      invoke('browser', ['/baseline', '/candidate', '/out']),
    ).rejects.toThrow()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
test('browser comparison requires all input paths', async () => {
  await expect(invoke('browser', [])).rejects.toThrow()
  expect(state.close).not.toHaveBeenCalled()
})
