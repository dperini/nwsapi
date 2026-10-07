import { beforeEach, expect, test, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const execute = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: execute }))
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
