import { invoke, state } from './sampling.mts'
import { expect, test, vi } from 'vitest'
test.each(['normal', 'missing', 'empty'])(
  'cold first profile records real first results with %s samples',
  async profile => {
    state.profile = profile
    const log = vi.spyOn(console, 'log')
    await invoke('cold-first-profile', [])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.consumed).toBe(40)
    expect(report.top).toHaveLength(3)
    expect(report.top[0].samples).toBe(profile === 'normal' ? 2 : 0)
    expect(state.write.mock.calls[0]![0]).toBe('/profile/cold-first.cpuprofile')
    expect(state.disconnect).toHaveBeenCalledOnce()
  },
)
test('profiler errors disconnect the inspector session', async () => {
  state.post.mockRejectedValue(new Error('profiler failed'))
  await expect(invoke('cold-first-profile', [])).rejects.toThrow()
  expect(state.disconnect).toHaveBeenCalledOnce()
})
