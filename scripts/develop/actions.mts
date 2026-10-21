export interface Task {
  script: string
  name: string
  description: string
  detail: string
  next: string
  manual?: boolean
  optional?: boolean
}

export const TASKS: readonly Task[] = [
  {
    script: 'setup',
    name: '1. Set up this checkout',
    description: 'Prepare the pinned tools, dependencies, and test fixtures.',
    detail:
      'Downloads pinned tools, installs dependencies, prepares WPT, and installs Chromium. Needs network access on first use. If setup fails, choose Troubleshoot setup for recovery guidance.',
    next: 'Next: read the contributor guide and choose a change.',
  },
  {
    script: 'docs',
    name: '2. Read the contributor guide',
    description: 'Open the v2 guide for editing and review steps.',
    detail:
      'Prints the path to docs/repo/development/first-change.md. Open it in your editor while you work.',
    next: 'After editing: choose Review my changes.',
    manual: true,
  },
  {
    script: 'review',
    name: '3. Review my changes',
    description: 'Run the repository test suite.',
    detail:
      'Runs npm test only. It does not run WPT, change files, or publish.',
    next: 'Next: inspect git diff. For selector or browser behavior changes, run npm run wpt:setup, then npm run wpt:test.',
  },
  {
    script: 'setup:check',
    name: '4. Troubleshoot setup (optional)',
    description: 'Check pinned tools and installed dependencies.',
    detail: 'Read-only. Reports the setup state and suggests the next command.',
    next: 'Follow the report. For details: npm run setup:check -- --details.',
    optional: true,
  },
]

export interface MenuState {
  selected: number
  result: string
}

export function taskInstructions(task: Task) {
  const command = task.manual
    ? 'Action: show the contributor guide path'
    : `Command: npm run ${task.script}`
  return `${task.description}\n\n${task.detail}\n\n${command}`
}
