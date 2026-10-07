import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'

const state = vi.hoisted(() => ({
  target: '',
  node: vi.fn(),
  tasks: vi.fn(),
  tool: vi.fn(),
  check: vi.fn(),
}))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) => url === state.target,
  runNode: state.node,
}))
vi.mock('../../../scripts/repo/lib/task.mts', () => ({ runTasks: state.tasks }))
vi.mock('../../../scripts/repo/lib/run-tool.mts', () => ({
  runTool: state.tool,
}))
vi.mock('../../../scripts/repo/lib/tooling-scope.mts', () => ({
  toolingFiles: () => ['src/fixture.mts'],
}))
vi.mock('../../../scripts/repo/check/run.mts', () => ({
  checkCode: state.check,
}))
vi.mock('../../../scripts/repo/dependency/update.mts', () => ({
  updateArgs: vi.fn(),
  updateDependencies: vi.fn(),
  updateReferences: vi.fn(),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof NodeFs>()),
  globSync: () => ['.config/fixture.json'],
}))

function argv(args: string[]) {
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'command.mts', ...args]
          : Reflect.get(target, property)
      },
    }),
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.target = ''
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

test('compatibility entrypoints forward arguments only when directly invoked', async () => {
  argv(['--check'])
  await import('../../../scripts/repo/check.mts')
  await import('../../../scripts/repo/update.mts')
  expect(state.node).not.toHaveBeenCalled()
  vi.resetModules()
  state.target = new URL(
    '../../../scripts/repo/check.mts',
    import.meta.url,
  ).href
  await import('../../../scripts/repo/check.mts')
  expect(state.node).toHaveBeenLastCalledWith(
    expect.stringMatching(/check\/run\.mts$/),
    ['--check'],
  )
  vi.resetModules()
  state.target = new URL(
    '../../../scripts/repo/update.mts',
    import.meta.url,
  ).href
  await import('../../../scripts/repo/update.mts')
  expect(state.node).toHaveBeenLastCalledWith(
    expect.stringMatching(/update\/run\.mts$/),
    ['--check'],
  )
})

test('the updater handles ordinary runs, check mode, help, and invalid arguments', async () => {
  await import('../../../scripts/repo/update/run.mts')
  expect(state.tasks).not.toHaveBeenCalled()
  const inputs = [[], ['--check'], ['--help'], ['--invalid']]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    vi.resetModules()
    state.target = new URL(
      '../../../scripts/repo/update/run.mts',
      import.meta.url,
    ).href
    argv(inputs[i]!)
    const loading = import('../../../scripts/repo/update/run.mts')
    if (i === 3) {
      await expect(loading).rejects.toBeInstanceOf(Error)
    } else {
      await loading
    }
  }
  expect(state.tasks.mock.calls).toEqual([
    ['update', []],
    ['update', ['--check']],
  ])
})

test('format forwards discovered inputs and command options to the pinned formatter', async () => {
  argv(['--check'])
  await import('../../../scripts/repo/format.mts')
  expect(state.tool).toHaveBeenCalledWith([
    'node_modules/oxfmt/bin/oxfmt',
    '--config',
    '.config/oxfmt.json',
    'src/fixture.mts',
    '.config/fixture.json',
    '--check',
  ])
})

test('fix runs formatting and final checks even when lint fixes initially report errors', async () => {
  const { fixCode } = await import('../../../scripts/repo/fix.mts')
  const run = vi.fn()
  run.mockImplementationOnce(() => {
    throw new Error('fixture')
  })
  fixCode(run)
  expect(run.mock.calls.map(call => call[1])).toEqual([
    ['--fix'],
    [],
    [],
    ['--fix'],
  ])
  expect(state.check).toHaveBeenCalledWith(run)
  fixCode()
  expect(state.check).toHaveBeenLastCalledWith(state.node)
})

test('fix accepts its compatibility flag and rejects unrelated command options', async () => {
  state.target = new URL('../../../scripts/repo/fix.mts', import.meta.url).href
  argv(['--all'])
  await import('../../../scripts/repo/fix.mts')
  expect(state.check).toHaveBeenCalledOnce()
  vi.resetModules()
  argv(['--invalid'])
  await expect(import('../../../scripts/repo/fix.mts')).rejects.toBeInstanceOf(
    Error,
  )
})
