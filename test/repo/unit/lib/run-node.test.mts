import { beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const execute = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: execute }))
vi.mock('../../../../scripts/repo/lib/tool-process.mts', () => ({
  toolProcess: (args: string[]) => ({
    command: process.execPath,
    args,
    options: {},
    dispose() {},
  }),
}))
import {
  isMainModule,
  runNode,
} from '../../../../scripts/repo/lib/run-node.mts'

beforeEach(() => vi.clearAllMocks())
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
test('main detection compares file URLs to the invoked script', () => {
  expect(isMainModule(pathToFileURL(process.argv[1]!).href)).toBe(true)
  expect(isMainModule('file:///fixture/other.mts')).toBe(false)
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
