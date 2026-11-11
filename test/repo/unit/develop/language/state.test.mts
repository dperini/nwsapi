import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  ALL_TASKS,
  taskDisplayCommand,
} from '../../../../../scripts/repo/develop/actions.mts'
import {
  localizedTask,
  readWizardLanguage,
  saveWizardLanguage,
  translateWizard,
} from '../../../../../scripts/repo/develop/language/state.mts'

test('language preferences survive reopening and tolerate malformed files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wizard-language-'))
  try {
    expect(readWizardLanguage(root)).toBe('en')
    saveWizardLanguage(root, 'it')
    expect(readWizardLanguage(root)).toBe('it')
    saveWizardLanguage(root, 'en')
    expect(readWizardLanguage(root)).toBe('en')
    writeFileSync(path.join(root, '.cache/developer-language.json'), '{')
    expect(readWizardLanguage(root)).toBe('en')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test.each(ALL_TASKS)(
  '$script translates its preview without changing execution',
  task => {
    const translated = localizedTask(task, 'it')
    expect(translated.name).not.toBe(task.name)
    expect(translateWizard(task.description, 'it')).not.toBe(task.description)
    expect(translateWizard(task.detail, 'it')).not.toBe(task.detail)
    expect(translated.command).toEqual(task.command)
    expect(taskDisplayCommand(translated)).toBe(taskDisplayCommand(task))
    expect(translateWizard(taskDisplayCommand(task), 'it')).toBe(
      taskDisplayCommand(task),
    )
  },
)

test('English and unknown tool output remain unchanged', () => {
  expect(translateWizard('Ready')).toBe('Ready')
  expect(translateWizard('external tool diagnostic 123', 'it')).toBe(
    'external tool diagnostic 123',
  )
})

test('plain picker saves only an explicit language choice', async () => {
  const { choosePlainLanguage } =
    await import('../../../../../scripts/repo/develop/plain.mts')
  const state = { selected: 2, result: '', language: 'en' as const }
  const saved: string[] = []
  await choosePlainLanguage(
    state,
    async () => '',
    language => saved.push(language),
  )
  expect(saved).toEqual([])
  await choosePlainLanguage(
    state,
    async () => 'IT',
    language => saved.push(language),
  )
  expect(saved).toEqual(['it'])
  expect(state.selected).toBe(2)
})

test('command help descriptions and flag explanations have Italian copy', async () => {
  const { COMMAND_HELP } =
    await import('../../../../../scripts/repo/develop/help.mts')
  for (const help of Object.values(COMMAND_HELP)) {
    expect(translateWizard(help.description, 'it'), help.command).not.toBe(
      help.description,
    )
    for (const [flag, description] of help.options) {
      expect(translateWizard(description, 'it'), flag).not.toBe(description)
    }
  }
})
