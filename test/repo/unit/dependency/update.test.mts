import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import path from 'node:path'
import {
  REPO_ROOT,
  TAZE_CLI_PATH,
} from '../../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  main: false,
  spawn: vi.fn(),
  execute: vi.fn(),
  check: vi.fn(),
  refresh: vi.fn(),
  failures: vi.fn(),
  runNode: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  spawnSync: state.spawn,
  execFileSync: state.execute,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/dependency/update.mts'),
  runNode: state.runNode,
}))
vi.mock('../../../../scripts/repo/lib/taze-output.mts', () => ({
  collectPackumentFailures: state.failures,
}))
vi.mock('../../../../scripts/repo/soak.mts', async importOriginal => ({
  ...(await importOriginal()),
  checkSoak: state.check,
  refreshSoak: state.refresh,
}))
import {
  updateArgs,
  updateDependencies,
  updateReferences,
} from '../../../../scripts/repo/dependency/update.mts'

beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.spawn.mockReturnValue({ status: 0, stdout: '', stderr: '' })
  state.failures.mockReturnValue([])
  vi.stubEnv('npm_execpath', '/fixture/pnpm')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

test('dependency updates honor maturity and exclude the reviewed toolchain', () => {
  const args = updateArgs('minimumReleaseAge: 1441', false)
  expect(args).toContain('--write')
  expect(args[args.indexOf('--maturity-period') + 1]).toBe('2')
  const exclusions = args[args.indexOf('--exclude') + 1]!.split(',')
  expect(exclusions).toEqual(
    expect.arrayContaining(['rolldown', '@rolldown/*', '@maschwenk/tsrs*']),
  )
  expect(updateArgs('minimumReleaseAge: 0', true)).not.toContain('--write')
})
test('reference check mode reaches both pinned upstream tools', () => {
  updateReferences(true)
  expect(state.runNode.mock.calls).toEqual([
    [path.join(REPO_ROOT, 'scripts/repo/wpt/update.mts'), ['--check']],
    [path.join(REPO_ROOT, 'scripts/repo/chrome/update.mts'), ['--check']],
  ])
  state.runNode.mockClear()
  updateReferences(false)
  expect(state.runNode.mock.calls.map(call => call[1])).toEqual([[], []])
})
test('check mode never installs dependencies and validates the soak policy first', () => {
  updateDependencies(true)
  expect(state.check).toHaveBeenCalledOnce()
  expect(state.refresh).not.toHaveBeenCalled()
  expect(state.execute).not.toHaveBeenCalled()
  expect(state.spawn.mock.calls[0]![1][0]).toBe(TAZE_CLI_PATH)
})
test.each(['/fixture/pnpm', '/fixture/pnpm.cjs'])(
  'install reuses the invoking manager %s',
  cli => {
    vi.stubEnv('npm_execpath', cli)
    updateDependencies(false)
    expect(state.refresh).toHaveBeenCalledOnce()
    const script = cli.endsWith('.cjs')
    expect(state.execute).toHaveBeenCalledExactlyOnceWith(
      script ? process.execPath : cli,
      script
        ? [cli, 'install', '--no-frozen-lockfile']
        : ['install', '--no-frozen-lockfile'],
      { cwd: REPO_ROOT, stdio: 'inherit' },
    )
  },
)
test('updates outside a package manager fail before modifying policy', () => {
  vi.stubEnv('npm_execpath', '')
  expect(() => updateDependencies(false)).toThrow(Error)
  expect(state.refresh).not.toHaveBeenCalled()
})
test('spawn errors propagate before references or installation', () => {
  const error = Object.assign(new Error('fixture'), {
    code: 'ERR_SPAWN_FIXTURE',
  })
  state.spawn.mockReturnValue({ error })
  expect(() => updateDependencies(true)).toThrow(
    expect.objectContaining({ code: 'ERR_SPAWN_FIXTURE' }),
  )
  expect(state.runNode).not.toHaveBeenCalled()
})
test.each([
  { status: 2, signal: null },
  { status: null, signal: 'SIGTERM' },
])('failed updater stops with %j', result => {
  state.spawn.mockReturnValue({ ...result, stdout: '', stderr: '' })
  expect(() => updateDependencies(true)).toThrow(Error)
  expect(state.runNode).not.toHaveBeenCalled()
})
test('transient lookup failures retry once before continuing', () => {
  state.failures.mockReturnValueOnce(['fixture']).mockReturnValueOnce([])
  updateDependencies(true)
  expect(state.spawn).toHaveBeenCalledTimes(2)
  expect(state.runNode).toHaveBeenCalledTimes(2)
})
test('repeated lookup failures stop before reference updates', () => {
  state.failures.mockReturnValue(['fixture'])
  expect(() => updateDependencies(true)).toThrow(Error)
  expect(state.spawn).toHaveBeenCalledTimes(2)
  expect(state.runNode).not.toHaveBeenCalled()
})
test('losing manager information during updates prevents an accidental install', () => {
  expect(() =>
    updateDependencies(false, undefined, undefined, () => {
      delete process.env['npm_execpath']
    }),
  ).toThrow(Error)
  expect(state.execute).not.toHaveBeenCalled()
})

test('CLI check updates dependencies without re-running upstream tasks', async () => {
  vi.resetModules()
  state.main = true
  const original = process.argv
  process.argv = ['node', 'update.mts', '--check']
  try {
    await import('../../../../scripts/repo/dependency/update.mts')
    expect(state.spawn).toHaveBeenCalledOnce()
    expect(state.runNode).not.toHaveBeenCalled()
  } finally {
    process.argv = original
  }
})

test('CLI rejects unsupported flags before policy preparation', async () => {
  vi.resetModules()
  state.main = true
  const original = process.argv
  process.argv = ['node', 'update.mts', '--unknown']
  try {
    await expect(
      import('../../../../scripts/repo/dependency/update.mts'),
    ).rejects.toBeInstanceOf(Error)
    expect(state.check).not.toHaveBeenCalled()
  } finally {
    process.argv = original
  }
})
