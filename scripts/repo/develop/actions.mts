export interface Task {
  script: string
  name: string
  description: string
  detail: string
  next: string
  persistent?: boolean
  optional?: boolean
}

export const TASKS: readonly Task[] = [
  {
    script: 'setup',
    name: '1. Set up this checkout',
    description: 'Prepare tools, dependencies, and build outputs.',
    detail:
      'Downloads missing tools and dependencies, then builds the project.\nNeeds network access on first use. Existing downloads are reused.',
    next: 'Next: open the documentation and choose a change.',
  },
  {
    script: 'guide',
    name: '2. Open documentation',
    description: 'Browse the docs while you edit.',
    detail:
      'Starts a docs server and opens your browser.\nRuns until you stop it.',
    next: 'After editing: review your changes.',
    persistent: true,
  },
  {
    script: 'review',
    name: '3. Review my changes',
    description: 'Check lint, formatting, types, and unit tests.',
    detail:
      'Run after editing. Checks run in order and stop at the first failure.\nThis does not automatically fix, commit, or publish files.',
    next: 'Next: inspect git diff and choose any additional checks for your change.',
  },
  {
    script: 'setup:check',
    name: '4. Troubleshoot setup (optional)',
    description: 'Check missing tools or incompatible versions.',
    detail:
      'Checks tools and suggests the next command.\nRead-only. Use this whenever setup needs attention.',
    next: 'Follow the report. For executable paths: pnpm run setup:check --details.',
    optional: true,
  },
]

export interface MenuState {
  selected: number
  result: string
}

export function taskInstructions(task: Task) {
  const stop = task.persistent
    ? '\nCtrl+C stops the server and returns here.'
    : ''
  return `${task.description}\n\n${task.detail}${stop}\n\nCommand: pnpm run ${task.script}`
}
