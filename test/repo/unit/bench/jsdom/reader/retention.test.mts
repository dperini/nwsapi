import { invoke, state } from './fixture.mts'
import { expect, test, vi } from 'vitest'
function collection() {
  vi.stubGlobal('gc', vi.fn())
  vi.stubGlobal(
    'WeakRef',
    class {
      value: object
      constructor(value: object) {
        this.value = value
      }
      deref() {
        return state.mode === 'survival' ? this.value : undefined
      }
    },
  )
}
test('reader retention verifies attribute mutations across rotating live adapters', async () => {
  collection()
  await invoke('retention', ['/baseline'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows.map((row: { variant: number }) => row.variant)).toEqual([
    0, 1, 1, 0, 0, 1,
  ])
  expect(
    report.rows.every(
      (row: { observedNodes: number; survivingNodes: number }) =>
        row.observedNodes === 80 && row.survivingNodes === 0,
    ),
  ).toBe(true)
})
test.each(['initial', 'mutation', 'survival'])(
  'reader retention rejects %s failures',
  async mode => {
    collection()
    state.mode = mode
    await expect(invoke('retention', ['/baseline'])).rejects.toMatchObject({
      code: 'ERR_ASSERTION',
    })
    expect(state.domClose).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
test('reader retention requires explicit collection', async () => {
  vi.stubGlobal('gc', undefined)
  await expect(invoke('retention', ['/baseline'])).rejects.toThrow()
  expect(state.load).not.toHaveBeenCalled()
})
