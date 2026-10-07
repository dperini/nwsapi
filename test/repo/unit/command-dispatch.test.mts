import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import path from 'node:path'
import {
  REPO_ROOT,
  TSRS_CLI_PATH,
  TYPECHECK_CONFIG_PATH,
} from '../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  main: true,
  entry: '',
  run: vi.fn(),
  argv: ['node', 'fixture.mts'],
}))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && new URL(url).pathname.endsWith(state.entry),
  runNode: state.run,
}))

const routes = [
  ['api', 'gen/api/markdown.mts', ['--check']],
  ['format', 'format.mts', ['--check']],
  ['lint', 'lint.mts', []],
  ['memory', 'gen/memory-performance.mts', ['--check']],
  ['soak', 'soak.mts', ['--check']],
  ['wpt/candidates', 'check/wpt/candidates.mts', []],
  ['wpt/inventory', 'check/wpt/inventory.mts', []],
  ['wpt/native/contract', 'check/wpt/native/contract.mts', ['--check']],
  ['wpt/scope', 'check/wpt/scope.mts', []],
] as const

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.main = true
  state.argv = ['node', 'fixture.mts']
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv' ? state.argv : Reflect.get(target, property)
      },
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

for (let i = 0, length = routes.length; i < length; i += 1) {
  const [name, target, args] = routes[i]!
  test(`${name} delegates to its validator in check mode`, async () => {
    const entry = `../../../scripts/repo/${name}/check.mts`
    state.entry = `/scripts/repo/${name}/check.mts`
    await import(entry)
    expect(state.run).toHaveBeenCalledExactlyOnceWith(
      path.join(REPO_ROOT, 'scripts/repo', target),
      args,
    )
  })
  test(`${name} help and library imports never start a validator`, async () => {
    process.argv.push('--help')
    const entry = `../../../scripts/repo/${name}/check.mts`
    state.entry = `/scripts/repo/${name}/check.mts`
    await import(entry)
    expect(state.run).not.toHaveBeenCalled()
    vi.resetModules()
    state.main = false
    await import(entry)
    expect(state.run).not.toHaveBeenCalled()
  })
}

test('type checking uses the pinned compiler and repository config', async () => {
  state.entry = '/scripts/repo/type/check.mts'
  await import('../../../scripts/repo/type/check.mts')
  expect(state.run).toHaveBeenCalledExactlyOnceWith(TSRS_CLI_PATH, [
    '--noEmit',
    '-p',
    TYPECHECK_CONFIG_PATH,
  ])
  vi.resetModules()
  process.argv.push('--help')
  await import('../../../scripts/repo/type/check.mts')
  expect(state.run).toHaveBeenCalledOnce()
})
