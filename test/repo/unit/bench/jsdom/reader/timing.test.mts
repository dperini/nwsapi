import { invoke, state } from './fixture.mts'
import { ADAPTER_BUILD_PATH } from '../../../../../../scripts/repo/lib/paths.mts'
import { expect, test } from 'vitest'
test.each([false, true])(
  'reader timing checks real host implementation identities explicitOutput=%s',
  async explicit => {
    await invoke('timing', explicit ? ['/baseline', '/report'] : ['/baseline'])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(12)
    expect(report.variants).toEqual([
      'baseline',
      'attributes',
      'attributes-and-tree',
    ])
    expect(state.compare).toHaveBeenCalledTimes(12)
    expect(state.load).toHaveBeenCalledWith(ADAPTER_BUILD_PATH)
    expect(
      state.options.some(options =>
        Object.hasOwn(options as object, 'domSymbolTree'),
      ),
    ).toBe(true)
    expect(
      state.options.some(
        options => !Object.hasOwn(options as object, 'domSymbolTree'),
      ),
    ).toBe(true)
  },
)
test('reader timing rejects reordered identities', async () => {
  state.mode = 'order'
  await expect(invoke('timing', ['/baseline'])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
test('reader timing errors abort measurements', async () => {
  state.compare.mockRejectedValue(new Error('timing failed'))
  await expect(invoke('timing', ['/baseline'])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
