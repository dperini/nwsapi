import { consoleMessage } from './console-symbols.mts'
import type { MenuState, Task } from './actions.mts'
import type { TaskResult } from './execute.mts'

export function printTaskMessage(state: MenuState) {
  console.log(`\n${consoleMessage(state.resultKind ?? 'info', state.result)}`)
}

export function outcomeMessageKind(status: TaskResult['status']) {
  return ({ completed: 'success', failed: 'error', stopped: 'info' } as const)[
    status
  ]
}

export function taskOutcome(task: Task, outcome: TaskResult) {
  if (task.persistent && outcome.signal === 'SIGINT') {
    return 'Docs server stopped. When your change is ready, choose Review.'
  }
  return outcome.status === 'completed' ? `Done. ${task.next}` : outcome.message
}
