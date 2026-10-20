import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { TASKS, taskInstructions } from './actions.mts'
import type { MenuState } from './actions.mts'

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

export function printTasks() {
  console.log('nwsapi developer menu\n')
  for (const [index, task] of TASKS.entries()) {
    console.log(
      `${index + 1}. ${task.name}\n  ${task.description}\n  ${task.command?.join(' ') ?? `pnpm run ${task.script}`}\n`,
    )
  }
}

export async function choosePlain(state: MenuState, ask = question) {
  printTasks()
  console.log(state.result)
  while (true) {
    const upper = TASKS.length
    const answer = (
      await ask(`Preview a task: 1–${upper}, or q to quit: `)
    ).trim()
    if (answer.toLowerCase() === 'q') {
      return undefined
    }
    const index = /^\d+$/.test(answer) ? Number(answer) - 1 : -1
    if (!TASKS[index]) {
      console.log(`Enter a task number from 1 to ${upper}, or q to quit.`)
      continue
    }
    state.selected = index
    const readiness = state.readiness?.[TASKS[index]!.script]
    console.log(
      `\n${TASKS[index]!.name}\n${taskInstructions(TASKS[index]!, readiness)}\n`,
    )
    const run = await confirmTask(ask)
    if (run === 'run') {
      return index
    }
    if (run === 'quit') {
      return undefined
    }
  }
}

export async function confirmTask(ask: typeof question) {
  while (true) {
    const answer = (await ask('Enter to run, b to go back, or q to quit: '))
      .trim()
      .toLowerCase()
    if (answer === '') {
      return 'run'
    }
    if (answer === 'b') {
      printTasks()
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
