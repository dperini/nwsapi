import { beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  toolOptions: {} as { env?: NodeJS.ProcessEnv },
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
const { execute } = state
vi.mock('../../../../scripts/repo/lib/tool-process.mts', () => ({
  toolProcess: (args: string[]) => ({
    command: process.execPath,
    args,
    options: state.toolOptions,
    dispose() {},
  }),
}))
import {
  isMainModule,
  runNode,
} from '../../../../scripts/repo/lib/run-node.mts'

beforeEach(() => {
  vi.clearAllMocks()
  state.toolOptions = {}
})
test('Node commands run in the checkout and inherit terminal streams', () => {
  runNode('/fixture/run.mts', ['--check'])
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    process.execPath,
    ['/fixture/run.mts', '--check'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
})
test('omitting arguments runs only the entrypoint', () => {
  runNode('/fixture/run.mts')
  expect(execute.mock.calls[0]![1]).toEqual(['/fixture/run.mts'])
})
test('ordinary child commands preserve the active hook index environment', () => {
  const priorIndex = process.env['GIT_INDEX_FILE']
  process.env['GIT_INDEX_FILE'] = '/worktree/.git/index'
  try {
    runNode('/fixture/run.mts')
    expect(process.env['GIT_INDEX_FILE']).toBe('/worktree/.git/index')
    expect(execute.mock.calls[0]![2]).not.toHaveProperty('env')
  } finally {
    if (priorIndex === undefined) {
      delete process.env['GIT_INDEX_FILE']
    } else {
      process.env['GIT_INDEX_FILE'] = priorIndex
    }
  }
})
test('external git mode strips repository context but preserves tool and auth settings', () => {
  const priorEnvironment = { ...process.env }
  state.toolOptions = {
    env: {
      ...process.env,
      NWSAPI_TOOL_NODE: '/tools/node',
      NWSAPI_TOOL_WORKER: '/tools/worker.mts',
      GIT_INDEX_FILE: '/worktree/.git/index',
      GIT_DIR: '/worktree/.git',
      GITHUB_TOKEN: 'fixture-token',
    },
  }
  try {
    runNode('/fixture/run.mts', [], { externalGit: true })
    const childEnvironment = execute.mock.calls[0]![2].env
    expect(childEnvironment).toMatchObject({
      NWSAPI_TOOL_NODE: '/tools/node',
      NWSAPI_TOOL_WORKER: '/tools/worker.mts',
      GITHUB_TOKEN: 'fixture-token',
    })
    expect(childEnvironment).not.toHaveProperty('GIT_INDEX_FILE')
    expect(childEnvironment).not.toHaveProperty('GIT_DIR')
    expect(process.env['GIT_INDEX_FILE']).toBe(
      priorEnvironment['GIT_INDEX_FILE'],
    )
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in priorEnvironment)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, priorEnvironment)
  }
})
test('main detection compares file URLs to the invoked script', () => {
  expect(isMainModule(pathToFileURL(process.argv[1]!).href)).toBe(true)
  expect(
    isMainModule(pathToFileURL(path.resolve('/fixture/other.mts')).href),
  ).toBe(false)
})
test('main-module detection resolves filesystem path aliases', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-entry-test-'))
  const alias = path.join(directory, 'run-node.test.mts')
  try {
    symlinkSync(fileURLToPath(import.meta.url), alias)
    expect(isMainModule(import.meta.url, alias)).toBe(true)
    expect(
      isMainModule(import.meta.url, path.join(directory, 'other.mts')),
    ).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
