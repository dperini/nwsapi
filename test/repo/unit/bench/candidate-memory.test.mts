import { invoke, state } from './sampling.mts'
import { expect, test } from 'vitest'
test.each([false, true])(
  'candidate memory validates ordered routes explicitEngine=%s',
  async explicit => {
    await invoke(
      'candidate-memory',
      explicit ? ['/report', 'dist/nwsapi.js'] : ['/report'],
    )
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(2)
    expect(
      report.rows.every(
        (row: { candidates: number; matches: number }) =>
          row.candidates === 256 && row.matches === 256,
      ),
    ).toBe(true)
    expect(state.memory).toHaveBeenCalledTimes(2)
    expect(state.memory.mock.calls[0]![1]).toEqual([
      'compiled',
      'select',
      'lookup',
    ])
    expect(report.engineSha256).toHaveLength(64)
  },
)
test('candidate memory requires an output path', async () => {
  await expect(invoke('candidate-memory', [])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
