import { afterEach, expect, test, vi } from 'vitest'
import { TASKS } from '../../../../scripts/repo/develop/actions.mts'
import {
  parseOptions,
  printJsonTasks,
  runTask,
} from '../../../../scripts/repo/develop/protocol.mts'

const execute = vi.hoisted(() => vi.fn())
vi.mock('../../../../scripts/repo/develop/execute.mts', () => ({
  executeTask: execute,
}))

afterEach(() => {
  process.exitCode = 0
  execute.mockReset()
})

test('discovery is ordered and identifies optional and persistent tasks', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  printJsonTasks()
  const result = JSON.parse(log.mock.calls[0]![0])
  expect(result.schemaVersion).toBe(1)
  expect(result.type).toBe('tasks')
  expect(result.tasks.map((task: { id: string }) => task.id)).toEqual(
    TASKS.map(task => task.script),
  )
  expect(result.tasks.map((task: { order: number }) => task.order)).toEqual([
    1, 2, 3, 4, 5,
  ])
  expect(
    result.tasks.filter((task: { persistent: boolean }) => task.persistent),
  ).toHaveLength(1)
  expect(result.tasks[1].persistent).toBe(true)
  expect(result.tasks[3].optional).toBe(true)
  expect(execute).not.toHaveBeenCalled()
})

test.each([
  ['--task', 'unknown', '--json'],
  ['--task'],
  ['--task', 'setup', '--list'],
  ['--plain', '--json'],
  ['--plain', '--task', 'setup'],
  ['--other'],
  ['setup'],
])('invalid arguments never execute: %j', (...args) => {
  expect(() => parseOptions(args)).toThrow()
  expect(execute).not.toHaveBeenCalled()
})

test.each([
  { status: 'completed', exitCode: 0, signal: null },
  { status: 'failed', exitCode: 7, signal: null },
  { status: 'stopped', exitCode: 143, signal: 'SIGTERM' },
])('execution preserves $status and exit code', async outcome => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  execute.mockResolvedValue({ ...outcome, message: 'Task result' })
  await runTask('setup:check', true)
  expect(execute).toHaveBeenCalledWith(TASKS[3], {
    json: true,
    interactive: false,
  })
  expect(process.exitCode).toBe(outcome.exitCode)
  expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
    schemaVersion: 1,
    type: 'result',
    task: 'setup:check',
    ...outcome,
    next: outcome.status === 'completed' ? TASKS[3]!.next : null,
  })
})

test('launch failures return a structured failure', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  execute.mockRejectedValue(new Error('Executable missing'))
  await runTask('setup:check', true)
  expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
    status: 'failed',
    exitCode: 1,
    signal: null,
    message: 'Executable missing',
  })
  expect(process.exitCode).toBe(1)
})

test('VoiceOver helper is a direct explicit control command', () => {
  const task = TASKS.find(candidate => candidate.script === 'voiceover')!
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  printJsonTasks()
  const result = JSON.parse(log.mock.calls[0]![0])
  expect(task.command).toEqual(['node', 'scripts/repo/develop/voiceover.mts'])
  expect(result.tasks.at(-1).command).toEqual(task.command)
  expect(result.tasks.at(-1).execution).toContain('--task')
})
