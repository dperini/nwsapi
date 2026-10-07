import { expect, test } from 'vitest'
import { state, invoke } from '../fixture.mts'
test.each([false, true])(
  'attribute identity timing records both scopes explicitOutput=%s',
  async explicit => {
    await invoke('identity/timing', [
      '/baseline',
      ...(explicit ? ['/output.json'] : []),
    ])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(report.rows).toHaveLength(18)
    expect(state.compare).toHaveBeenCalledTimes(18)
  },
)
test('baseline is required before creating timing worlds', async () => {
  await expect(invoke('identity/timing', [])).rejects.toThrow()
  expect(state.compare).not.toHaveBeenCalled()
})
test.each(['length', 'order'])(
  'identity %s mismatch stops timing',
  async mode => {
    state.mode = mode
    await expect(invoke('identity/timing', ['/baseline'])).rejects.toThrow()
    expect(state.compare).not.toHaveBeenCalled()
    expect(state.write).not.toHaveBeenCalled()
  },
)
