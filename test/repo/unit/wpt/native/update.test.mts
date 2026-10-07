import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  nativeRefreshArgs,
  updateNative,
} from '../../../../../scripts/repo/wpt/native/update.mts'

const state = vi.hoisted(() => ({
  main: false,
  cached: false,
  validate: vi.fn(),
  run: vi.fn(),
  pins: { browser: 'Chrome 154', revision: 'a'.repeat(40) },
}))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/wpt/native/update.mts'),
  runNode: state.run,
}))
vi.mock('../../../../../scripts/repo/wpt/native/contract/check.mts', () => ({
  checkNativeContract: state.validate,
  nativeCachePath: '/fixture/native-cache.json',
}))
vi.mock('../../../../../scripts/repo/check/wpt/native/pool.mts', () => ({
  nativePins: () => state.pins,
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.cached,
  readFileSync: () =>
    JSON.stringify({ ...state.pins, directory: '/fixture/saved' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.cached = false
  state.validate.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

test('native refresh resumes only a report matching both pinned identities', () => {
  const cached = { ...state.pins, directory: '/fixture/saved' }
  expect(nativeRefreshArgs(state.pins, cached, () => true)).toEqual([
    '--resume',
    '--directory',
    cached.directory,
  ])
  expect(nativeRefreshArgs(state.pins, undefined)).toEqual([])
  expect(
    nativeRefreshArgs(state.pins, { ...cached, browser: 'Other' }, () => true),
  ).toEqual([])
  expect(
    nativeRefreshArgs(state.pins, { ...cached, revision: 'other' }, () => true),
  ).toEqual([])
  expect(nativeRefreshArgs(state.pins, cached, () => false)).toEqual([])
})

test('a valid contract and a stale preview do not start native browser work', () => {
  updateNative(false)
  expect(state.run).not.toHaveBeenCalled()
  state.validate.mockImplementationOnce(() => {
    throw new Error('fixture')
  })
  updateNative(true)
  expect(state.run).not.toHaveBeenCalled()
})

test('stale native contracts launch a fresh run or resume recorded results then validate again', () => {
  const inputs = [false, true]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    state.cached = inputs[i]!
    state.validate.mockImplementationOnce(() => {
      throw new Error('fixture')
    })
    updateNative(false)
  }
  expect(state.run.mock.calls.map(call => call[1])).toEqual([
    [],
    ['--resume', '--directory', '/fixture/saved'],
  ])
  expect(state.validate).toHaveBeenCalledTimes(4)
})

test('the native update command validates arguments before checking its contract', async () => {
  state.main = true
  const inputs = [[], ['--check'], ['--invalid']]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    vi.resetModules()
    vi.stubGlobal(
      'process',
      new Proxy(process, {
        get(target, property) {
          return property === 'argv'
            ? ['node', 'update.mts', ...inputs[i]!]
            : Reflect.get(target, property)
        },
      }),
    )
    const loading = import('../../../../../scripts/repo/wpt/native/update.mts')
    if (i === 2) {
      await expect(loading).rejects.toBeInstanceOf(Error)
    } else {
      await loading
    }
  }
  expect(state.validate).toHaveBeenCalledTimes(2)
})
