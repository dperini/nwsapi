import { expect, test } from 'vitest'
import { state, invoke } from '../fixture.mts'
test('retention protocol measures weak references after explicit collection', async () => {
  await invoke('identity/browser-retention', ['/baseline.js'])
  const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
  expect(report.rows).toHaveLength(6)
  expect(
    report.rows.every(
      (row: { observedNodes: number; survivingNodes: number }) =>
        row.observedNodes === 80 && row.survivingNodes === 0,
    ),
  ).toBe(true)
  expect(state.send).toHaveBeenCalledTimes(24)
  expect(state.detach).toHaveBeenCalledTimes(6)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['initial', 'mutation', 'survival'])(
  'failed %s retention checks close browser resources',
  async mode => {
    state.mode = mode
    await expect(
      invoke('identity/browser-retention', ['/baseline.js']),
    ).rejects.toThrow()
    expect(state.pageClose).toHaveBeenCalledOnce()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.detach).toHaveBeenCalledTimes(mode === 'survival' ? 1 : 0)
  },
)
