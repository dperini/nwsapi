import { existsSync, readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import {
  ALL_TASKS,
  REVIEW_TASKS,
  TASKS,
  menuTasks,
  taskDisplayCommand,
} from '../../../../scripts/repo/develop/actions.mts'
import { taskCommand } from '../../../../scripts/repo/develop/execute.mts'
import { choosePlain } from '../../../../scripts/repo/develop/plain.mts'
import { menuNavigation } from '../../../../scripts/repo/develop/run.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const manifest = JSON.parse(
  readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> }

test('package-script chains reference existing commands after consolidation', () => {
  for (const command of Object.values(manifest.scripts)) {
    for (const match of command.matchAll(
      /\b(?:pnpm|npm)(?: --silent)? run ([\w:-]+)/g,
    )) {
      expect(manifest.scripts[match[1]!], command).toBeTypeOf('string')
    }
  }
})

test('every wizard task is discoverable and has a runnable command', () => {
  expect(new Set(ALL_TASKS.map(task => task.script)).size).toBe(
    ALL_TASKS.length,
  )
  expect(menuTasks({ selected: 0, result: '' })).toBe(TASKS)
  expect(menuTasks({ selected: 0, result: '', group: 'review' })).toBe(
    REVIEW_TASKS,
  )
  for (const task of ALL_TASKS) {
    const words = taskDisplayCommand(task).split(' ')
    expect(manifest.scripts[words[2]!]).toBeTypeOf('string')
    if (task.viaWizard) {
      expect(words.slice(3)).toEqual(['--task', task.script])
    }
  }
})

test.each(REVIEW_TASKS.filter(task => task.viaWizard))(
  '$name retains its full argument list',
  async task => {
    const request = await taskCommand(task)
    expect(request.command).toBe(process.execPath)
    expect(request.args.slice(1)).toEqual(task.command!.slice(2))
    expect(existsSync(`${REPO_ROOT}/${request.args.at(-1)}`)).toBe(true)
    expect(request.args).toContain('--config')
  },
)

test('plain menu opens more checks and can return without execution', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(await choosePlain({ selected: 2, result: '' }, async () => 'm')).toBe(
    'review-checks',
  )
  expect(
    await choosePlain(
      { selected: 0, result: '', group: 'review' },
      async () => 'b',
    ),
  ).toBe('back')
  expect(
    await choosePlain(
      { selected: 0, result: '', group: 'review' },
      async () => 'q',
    ),
  ).toBeUndefined()
})

test('returning from more checks preserves the last outcome and parent selection', () => {
  const root = { selected: 2, result: '' }
  const child = menuNavigation('review-checks', root, root)
  expect(child).toMatchObject({ group: 'review', selected: 0 })
  child.result = 'Checks passed.'
  child.resultKind = 'success'
  expect(menuNavigation('back', child, root)).toMatchObject({
    selected: 2,
    result: 'Checks passed.',
    resultKind: 'success',
  })
})
