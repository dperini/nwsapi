import { expect, test, vi } from 'vitest'
import path from 'node:path'
import {
  hookBody,
  installGitHooks,
  type HookSetupDependencies,
} from '../../../../scripts/repo/setup/hooks.mts'

type FileEntry = { body: string; symlink: boolean; regular: boolean }

function hookPath(name: string, platform: NodeJS.Platform) {
  const paths = platform === 'win32' ? path.win32 : path
  const root = platform === 'win32' ? 'C:\\checkout' : '/checkout'
  return paths.resolve(root, '.git', 'hooks', name)
}

function setupHarness(
  options: {
    customPath?: string
    existing?: Map<string, FileEntry>
    repo?: boolean
    platform?: NodeJS.Platform
  } = {},
) {
  const platform = options.platform ?? 'linux'
  const paths = platform === 'win32' ? path.win32 : path
  const checkout = platform === 'win32' ? 'C:\\checkout' : '/checkout'
  const files = options.existing ?? new Map<string, FileEntry>()
  const calls: string[][] = []
  const logs: string[] = []
  const dependencies: HookSetupDependencies = {
    platform: options.platform ?? 'linux',
    log: message => logs.push(message),
    runGit(args) {
      calls.push(args)
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return options.repo === false
          ? { status: 128, stdout: '' }
          : { status: 0, stdout: `${checkout}\n` }
      }
      if (args[0] === 'config') {
        return options.customPath === undefined
          ? { status: 1, stdout: '' }
          : { status: 0, stdout: `${options.customPath}\n` }
      }
      return { status: 0, stdout: '.git/hooks\n' }
    },
    files: {
      mkdirSync: vi.fn(),
      lstatSync: vi.fn(filePath => {
        const entry = files.get(String(filePath))
        if (!entry) {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        }
        return {
          isFile: () => entry.regular,
          isSymbolicLink: () => entry.symlink,
          mode: platform === 'win32' ? 0o644 : 0o755,
        } as never
      }),
      readFileSync: vi.fn(
        filePath => files.get(String(filePath))?.body ?? '',
      ) as never,
      openSync: vi.fn((filePath, _flags, _mode) => {
        const key = String(filePath)
        if (files.has(key)) {
          throw Object.assign(new Error('exists'), { code: 'EEXIST' })
        }
        files.set(key, { body: '', regular: true, symlink: false })
        return key as never
      }),
      writeFileSync: vi.fn((descriptor, body) => {
        const entry = files.get(String(descriptor))
        if (entry) {
          entry.body = String(body)
        }
      }),
      closeSync: vi.fn(),
    },
    pathOps: paths,
  }
  return { dependencies, files, calls, logs }
}

test('installs immutable hooks and leaves exact managed shims unchanged on repeat', () => {
  const harness = setupHarness()
  const first = installGitHooks(harness.dependencies)
  const written = new Map(harness.files)
  const second = installGitHooks(harness.dependencies)
  expect(first).toMatchObject({
    status: 'installed',
    hooks: ['pre-commit', 'pre-push'],
  })
  expect(second).toMatchObject({
    status: 'installed',
    hooks: ['pre-commit', 'pre-push'],
  })
  expect([...written.values()].map(entry => entry.body)).toEqual([
    hookBody('linux'),
    hookBody('linux'),
  ])
  expect(harness.dependencies.files.openSync).toHaveBeenCalledTimes(2)
})

test('accepts exact managed shims on Windows without POSIX execute bits', () => {
  const existing = new Map<string, FileEntry>([
    [
      hookPath('pre-commit', 'win32'),
      {
        body: hookBody('win32'),
        regular: true,
        symlink: false,
      },
    ],
    [
      hookPath('pre-push', 'win32'),
      {
        body: hookBody('win32'),
        regular: true,
        symlink: false,
      },
    ],
  ])
  const harness = setupHarness({ existing, platform: 'win32' })
  expect(installGitHooks(harness.dependencies).status).toBe('installed')
  expect(harness.dependencies.files.openSync).not.toHaveBeenCalled()
})

test('skips outside Git and when any effective hooks path is configured', () => {
  const outside = setupHarness({ repo: false })
  expect(installGitHooks(outside.dependencies).status).toBe('skipped')

  const configured = setupHarness({ customPath: '/shared/hooks' })
  expect(installGitHooks(configured.dependencies)).toMatchObject({
    status: 'skipped',
    reason: expect.stringContaining('core.hooksPath'),
  })
  expect(configured.dependencies.files.openSync).not.toHaveBeenCalled()
})

test.each(['linux', 'win32'] as const)(
  'preserves custom files and symlinks on %s without replacing them',
  platform => {
    const existing = new Map<string, FileEntry>([
      [
        hookPath('pre-commit', platform),
        {
          body: 'custom hook\n',
          regular: true,
          symlink: false,
        },
      ],
      [
        hookPath('pre-push', platform),
        {
          body: hookBody(platform),
          regular: false,
          symlink: true,
        },
      ],
    ])
    const harness = setupHarness({ existing, platform })
    const result = installGitHooks(harness.dependencies)
    expect(result).toMatchObject({ status: 'skipped' })
    expect(existing.get(hookPath('pre-commit', platform))?.body).toBe(
      'custom hook\n',
    )
    expect(existing.get(hookPath('pre-push', platform))?.symlink).toBe(true)
    expect(harness.dependencies.files.openSync).not.toHaveBeenCalled()
  },
)
