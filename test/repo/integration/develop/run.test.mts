import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

function invoke(args: string[]) {
  return spawnSync(
    process.execPath,
    ['scripts/repo/develop/run.mts', ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 5000,
    },
  )
}

test('noninteractive discovery emits one JSON object with no terminal escapes', () => {
  const result = invoke(['--list', '--json'])
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  const data = JSON.parse(result.stdout)
  expect(data.type).toBe('tasks')
  expect(data.tasks.map((task: { id: string }) => task.id)).toEqual([
    'setup',
    'guide',
    'review',
    'setup:check',
  ])
  expect(data.tasks[0].execution).toEqual([
    'node',
    'scripts/repo/develop/run.mts',
    '--task',
    'setup',
    '--json',
  ])
})

test.each([
  ['--task', 'not-a-task', '--json'],
  ['--list', '--task', 'setup', '--json'],
  ['--task', '--json'],
])('invalid invocation returns a machine-readable failure: %j', (...args) => {
  const result = invoke(args)
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout)).toMatchObject({
    schemaVersion: 1,
    type: 'error',
    status: 'failed',
    exitCode: 1,
  })
})
