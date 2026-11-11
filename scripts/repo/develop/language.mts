import {
  readFileSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  renameSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ITALIAN } from './language-catalog.mts'
import type { Task } from './actions.mts'

export type WizardLanguage = 'en' | 'it'
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
] as const

const phrases = new RegExp(
  Object.keys(ITALIAN)
    .toSorted((a, b) => b.length - a.length)
    .map(text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
)

export function translateWizard(text: string, language: WizardLanguage = 'en') {
  return language === 'it'
    ? text.replace(phrases, match => ITALIAN[match]!)
    : text
}

export function localizedTask(task: Task, language: WizardLanguage) {
  return { ...task, name: translateWizard(task.name, language) }
}

export function readWizardLanguage(root: string): WizardLanguage {
  try {
    const value = JSON.parse(
      readFileSync(path.join(root, '.cache/developer-language.json'), 'utf8'),
    )
    return value.language === 'it' ? 'it' : 'en'
  } catch {
    return 'en'
  }
}

export function saveWizardLanguage(root: string, language: WizardLanguage) {
  const cache = path.join(root, '.cache')
  mkdirSync(cache, { recursive: true, mode: 0o700 })
  const relative = path.relative(realpathSync(root), realpathSync(cache))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Language preferences must stay inside the checkout.')
  }
  const temporary = path.join(cache, `developer-language.${randomUUID()}.tmp`)
  writeFileSync(temporary, JSON.stringify({ language }) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
  renameSync(temporary, path.join(cache, 'developer-language.json'))
}
