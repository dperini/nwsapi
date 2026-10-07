import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  compile: vi.fn(),
  configure: vi.fn(),
  close: vi.fn(),
  legacy: vi.fn(),
}))
vi.mock('../../../dist/nwsapi.js', () => ({
  default: () => ({ compile: state.compile, configure: state.configure }),
}))
vi.mock('../../../dist/modules/nwsapi-legacy.js', () => ({
  default: state.legacy,
}))
vi.mock('node:module', () => ({
  createRequire: () => () => ({
    JSDOM: class {
      window = { close: state.close }
    },
  }),
}))
import { inspectSelector } from '../../../scripts/repo/compile.mts'
beforeEach(() => {
  state.compile.mockReset()
  state.configure.mockClear()
  state.close.mockClear()
  state.legacy.mockClear()
})
test('default inspection compiles the selection resolver and closes its DOM', async () => {
  const resolver = function () {
    return 1
  }
  state.compile.mockReturnValue(resolver)
  expect(await inspectSelector('.item')).toBe(resolver.toString())
  expect(state.compile).toHaveBeenCalledWith('.item', true)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['match', 'item', 'select'])(
  'structured %s inspection reports helper bindings',
  async mode => {
    state.compile.mockReturnValue({
      toString: () => 's.beta(s.alpha()) + s.beta()',
    })
    const report = JSON.parse(
      await inspectSelector('.item', { mode, json: true, legacy: true }),
    )
    expect(report.helpers).toEqual(['s.alpha', 's.beta'])
    expect(report.sourceBytes).toBe(Buffer.byteLength(report.source))
    expect(state.compile).toHaveBeenCalledWith(
      '.item',
      mode === 'item' ? null : mode === 'select',
    )
    expect(state.legacy).toHaveBeenCalledOnce()
    expect(state.close).toHaveBeenCalledOnce()
  },
)
test('identity selectors return empty metadata and an explanatory text result', async () => {
  state.compile.mockReturnValue(null)
  const report = JSON.parse(await inspectSelector('*', { json: true }))
  expect(report.source).toBeNull()
  expect(report.sourceBytes).toBe(0)
  expect(report.helpers).toEqual([])
  expect(await inspectSelector('*')).toBeTypeOf('string')
  state.compile.mockReturnValue({ toString: () => 'return true' })
  expect(
    JSON.parse(await inspectSelector('*', { json: true })).helpers,
  ).toEqual([])
})
test('compiler failures still close the inspection DOM', async () => {
  state.compile.mockImplementation(() => {
    throw new Error('failed')
  })
  await expect(inspectSelector('.item')).rejects.toThrow()
  expect(state.close).toHaveBeenCalledOnce()
})
