import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import { discoverTasks, runTasks } from '../../../../scripts/repo/lib/task.mts'
import { runNode } from '../../../../scripts/repo/lib/run-node.mts'
import type * as RepoPaths from '../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-task-test-' + process.pid,
}))
vi.mock('../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  runNode: vi.fn(),
}))
afterAll(() => rmSync(state.root, { recursive: true, force: true }))

function fixture(scripts: Record<string, string> = {}) {
  rmSync(state.root, { recursive: true, force: true })
  mkdirSync(path.join(state.root, 'scripts/repo/lint'), { recursive: true })
  writeFileSync(
    path.join(state.root, 'package.json'),
    JSON.stringify({ scripts }),
  )
  writeFileSync(path.join(state.root, 'scripts/repo/lint/check.mts'), '')
}

test('task discovery combines package-owned lanes with nested fleet tasks and excludes root delegates', () => {
  fixture({
    'lint:check':
      'node scripts/repo/run.mts scripts/repo/lint/check.mts --strict',
    unrelated: 'ignored',
  })
  writeFileSync(path.join(state.root, 'scripts/repo/check.mts'), '')
  writeFileSync(path.join(state.root, 'scripts/repo/lint/other.mts'), '')
  symlinkSync('lint', path.join(state.root, 'scripts/repo/link'))
  expect(discoverTasks('check')).toEqual([
    {
      name: 'lint:check',
      entry: path.join(state.root, 'scripts/repo/lint/check.mts'),
      args: ['--strict'],
    },
  ])
  mkdirSync(path.join(state.root, 'scripts/fleet/contracts'), {
    recursive: true,
  })
  writeFileSync(path.join(state.root, 'scripts/fleet/contracts/check.mts'), '')
  expect(discoverTasks('check').map(task => task.name)).toEqual([
    'contracts',
    'lint:check',
  ])
})

test('task discovery rejects malformed commands and missing subject entrypoints', () => {
  const commands = [
    'pnpm run lint',
    'node scripts/repo/run.mts ../outside/check.mts',
    'node scripts/repo/run.mts scripts/repo/missing/check.mts',
  ]
  for (let i = 0, length = commands.length; i < length; i += 1) {
    fixture({ 'lint:check': commands[i]! })
    expect(() => discoverTasks('check')).toThrow()
  }
})

test('update tasks run dependency refresh first and native WPT qualification last', () => {
  fixture({
    'wpt-native:update':
      'node scripts/repo/run.mts scripts/repo/wpt/native/update.mts',
    'dependency:update':
      'node scripts/repo/run.mts scripts/repo/dependency/update.mts',
  })
  const files = [
    'scripts/repo/wpt/native/update.mts',
    'scripts/repo/dependency/update.mts',
    'scripts/repo/chrome/update.mts',
  ]
  files.forEach(file => {
    mkdirSync(path.dirname(path.join(state.root, file)), { recursive: true })
    writeFileSync(path.join(state.root, file), '')
  })
  expect(discoverTasks('update').map(task => task.name)).toEqual([
    'dependency:update',
    'chrome',
    'wpt-native:update',
  ])
})

test('check lanes collect failures, update lanes stop immediately and runners receive arguments', () => {
  fixture({
    'lint:check':
      'node scripts/repo/run.mts scripts/repo/lint/check.mts --strict',
  })
  mkdirSync(path.join(state.root, 'scripts/repo/other'), { recursive: true })
  writeFileSync(path.join(state.root, 'scripts/repo/other/check.mts'), '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = vi.fn()
  runTasks('check', ['--all'], run)
  expect(run).toHaveBeenCalledWith(
    path.join(state.root, 'scripts/repo/lint/check.mts'),
    ['--strict', '--all'],
  )
  runTasks('check')
  expect(runNode).toHaveBeenCalled()
  const failure = Object.assign(new Error('Failure'), { code: 'TEST_FAILURE' })
  const failing = vi.fn(() => {
    throw failure
  })
  expect(() => runTasks('check', [], failing)).toThrow(AggregateError)
  expect(failing).toHaveBeenCalledTimes(2)
  writeFileSync(path.join(state.root, 'scripts/repo/lint/update.mts'), '')
  writeFileSync(path.join(state.root, 'scripts/repo/other/update.mts'), '')
  failing.mockClear()
  expect(() => runTasks('update', [], failing)).toThrow(
    expect.objectContaining({ code: 'TEST_FAILURE' }),
  )
  expect(failing).toHaveBeenCalledOnce()
})
