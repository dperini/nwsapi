import { saveWizardLanguage, translateWizard } from './language/state.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import type { WizardLanguage } from './language/state.mts'
import { consoleMessage } from './console-symbols.mts'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import {
  ALL_TASKS,
  TASKS,
  menuTasks,
  taskInstructions,
  taskDisplayCommand,
  taskStatus,
} from './actions.mts'
import type { MenuState, Task } from './actions.mts'

export async function question(prompt: string) {
  const reader = createInterface({ input: stdin, output: stdout })
  const controller = new AbortController()
  const cancel = () => controller.abort()
  reader.once('SIGINT', cancel)
  reader.once('close', cancel)
  try {
    return await reader.question(prompt, { signal: controller.signal })
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      throw error
    }
    return 'q'
  } finally {
    reader.close()
  }
}

export function printTasks(tasks = ALL_TASKS, language: WizardLanguage = 'en') {
  console.log(translateWizard('nwsapi developer menu\n', language))
  for (const [index, task] of tasks.entries()) {
    console.log(
      translateWizard(
        `${index + 1}. ${task.name}\n  ${task.description}\n  ${taskDisplayCommand(task)}\n`,
        language,
      ),
    )
  }
}

export async function choosePlain(
  state: MenuState,
  ask = question,
  save = (language: WizardLanguage) => saveWizardLanguage(REPO_ROOT, language),
) {
  const tasks = menuTasks(state)
  printTasks([...tasks], state.language)
  if (state.result) {
    console.log(consoleMessage(state.resultKind ?? 'info', state.result))
  }
  while (true) {
    const upper = tasks.length
    const answer = (
      await ask(
        translateWizard(
          `Preview a task: 1–${upper}, ${state.group ? 'b to go back' : 'm for more checks'}, l for language, or q to quit: `,
          state.language,
        ),
      )
    ).trim()
    if (answer.toLowerCase() === 'q') {
      return undefined
    }
    if (answer.toLowerCase() === 'l') {
      await choosePlainLanguage(state, ask, save)
      printTasks([...tasks], state.language)
      continue
    }
    const navigation = plainNavigation(answer, state)
    if (navigation) {
      return navigation
    }
    const index = plainTaskIndex(answer)
    if (!tasks[index]) {
      console.log(`Enter a task number from 1 to ${upper}, or q to quit.`)
      continue
    }
    const status = taskStatus(tasks[index]!, state)
    if (status.kind === 'disabled') {
      console.log(consoleMessage('info', status.message))
      continue
    }
    state.selected = index
    const readiness = state.readiness?.[tasks[index]!.script]
    console.log(
      translateWizard(
        `\n${tasks[index]!.name}\n${taskInstructions(tasks[index]!, readiness)}\n`,
        state.language,
      ),
    )
    const run = await confirmTask(ask, tasks, state.language)
    if (run === 'run') {
      return index
    }
    if (run === 'quit') {
      return undefined
    }
  }
}

export function plainNavigation(answer: string, state: MenuState) {
  if (state.group && answer.toLowerCase() === 'b') {
    return 'back' as const
  }
  if (!state.group && answer.toLowerCase() === 'm') {
    return 'review-checks' as const
  }
  return undefined
}

export async function confirmTask(
  ask: typeof question,
  tasks: readonly Task[] = TASKS,
  language: WizardLanguage = 'en',
) {
  while (true) {
    const answer = (
      await ask(
        translateWizard('Enter to run, b to go back, or q to quit: ', language),
      )
    )
      .trim()
      .toLowerCase()
    if (answer === '') {
      return 'run'
    }
    if (answer === 'b') {
      printTasks([...tasks], language)
      return 'back'
    }
    if (answer === 'q') {
      return 'quit'
    }
    console.log('Press Enter to run this task, b to go back, or q to quit.')
  }
}

export async function returnToMenu(ask = question) {
  while (true) {
    const answer = (await ask('\nEnter to return to the menu, or q to quit: '))
      .trim()
      .toLowerCase()
    if (answer === '' || answer === 'q') {
      return answer === ''
    }
    console.log('Press Enter to return to the menu, or q to quit.')
  }
}

export async function choosePlainLanguage(
  state: MenuState,
  ask: typeof question,
  save: (language: WizardLanguage) => void,
) {
  const answer = (
    await ask('1. English (en) · 2. Italiano (it) · Enter: cancel\n> ')
  )
    .trim()
    .toLowerCase()
  const language = ({ '1': 'en', en: 'en', '2': 'it', it: 'it' } as const)[
    answer as '1'
  ]
  if (language) {
    save(language)
    state.language = language
  }
}

export function plainTaskIndex(answer: string) {
  return /^\d+$/.test(answer) ? Number(answer) - 1 : -1
}
