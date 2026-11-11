import { executeSelectedTask } from '../../../../scripts/repo/develop/run.mts'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import {
  TASKS,
  taskStatus,
  taskDisplayCommand,
  taskDisabledReason,
  type MenuState,
} from '../../../../scripts/repo/develop/actions.mts'
import { choosePlain } from '../../../../scripts/repo/develop/plain.mts'

const reviewTask = TASKS[2]!
test('status priority preserves disabled, failure, and attention over ready', () => {
  const state: MenuState = { selected: 2, result: '' }
  expect(taskStatus(reviewTask, state).kind).toBe('info')
  state.readiness = { review: { ready: true, message: '' } }
  expect(taskStatus(reviewTask, state).kind).toBe('success')
  state.readiness['review'] = { ready: false, message: 'Run setup.' }
  expect(taskStatus(reviewTask, state).kind).toBe('warning')
  state.failures = { review: 'Failed check.' }
  expect(taskStatus(reviewTask, state).kind).toBe('error')
  state.disabled = { review: 'Unavailable.' }
  expect(taskStatus(reviewTask, state)).toEqual({
    kind: 'disabled',
    label: 'Disabled',
    message: 'Unavailable.',
  })
  delete state.disabled['review']
  delete state.failures['review']
  state.readiness['review'] = { ready: true, message: '' }
  expect(taskStatus(reviewTask, state).kind).toBe('success')
})

test('every displayed command maps to a real pnpm script', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
  )
  for (const task of TASKS) {
    const command = taskDisplayCommand(task)
    expect(command.startsWith('pnpm run ')).toBe(true)
    expect(manifest.scripts[command.slice('pnpm run '.length)]).toBeTypeOf(
      'string',
    )
  }
})

test('VoiceOver is disabled only on unsupported platforms', () => {
  const task = TASKS.find(candidate => candidate.script === 'voiceover')!
  expect(taskDisabledReason(task, 'darwin')).toBeUndefined()
  expect(taskDisabledReason(task, 'linux')).toBe(
    'macOS only',
  )
  expect(taskDisabledReason(TASKS[0]!, 'linux')).toBeUndefined()
})

test('plain preview explains disabled actions without offering to run them', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ask = vi.fn().mockResolvedValueOnce('6').mockResolvedValueOnce('q')
  expect(
    await choosePlain(
      { selected: 0, result: '', disabled: { voiceover: 'Requires macOS.' } },
      ask,
    ),
  ).toBeUndefined()
  expect(ask).toHaveBeenCalledTimes(2)
})

test('unmet prerequisites stay yellow without recording a failed execution', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const state: MenuState = {
    selected: 2,
    result: '',
    readiness: { review: { ready: false, message: 'Run pnpm run go.' } },
  }
  expect(
    await executeSelectedTask(2, state, {
      checkout: '/fixture',
      revision: 'fixture',
    }),
  ).toBe(false)
  expect(state.result).toBe('Run pnpm run go.')
  expect(state.failures).toBeUndefined()
  expect(taskStatus(TASKS[2]!, state).kind).toBe('warning')
})
