import { invoke, state } from './fixture.mts'
import { expect, test, vi } from 'vitest'
test.each(['darwin', 'linux'])(
  'port timing isolates compilation and ordered public calls on %s',
  async platform => {
    vi.stubGlobal(
      'process',
      new Proxy(process, {
        get: (target, key) =>
          key === 'platform' ? platform : Reflect.get(target, key),
      }),
    )
    await invoke('run', ['/baseline', '/candidate', '/out'])
    const report = state.report.mock.calls[0]![1]
    expect(report.rows).toHaveLength(4)
    expect(report.cold.every((samples: number[]) => samples.length === 7)).toBe(
      true,
    )
    expect(state.compile).toHaveBeenCalledTimes(7000)
    expect(report.power).toBe(
      platform === 'darwin' ? state.exec.mock.results[0]!.value : null,
    )
  },
)
test('incorrect results close fixture windows before failing', async () => {
  state.mode = 'length'
  await expect(
    invoke('run', ['/baseline', '/candidate', '/out']),
  ).rejects.toThrow()
  expect(state.domClose).toHaveBeenCalledTimes(2)
  expect(state.report).not.toHaveBeenCalled()
})
test('node comparison requires all input paths', async () => {
  await expect(invoke('run', [])).rejects.toThrow()
})
