export interface Task {
  script: string
  name: string
  description: string
  detail: string
  next: string
  manual?: boolean
  optional?: boolean
}

export function managedNpmWrapper() {
  return process.platform === 'win32'
    ? '.cache\\bin\\npm.cmd'
    : '.cache/bin/npm'
}

export function taskCommandArgs(task: Task) {
  if (task.script === 'setup') {
    return ['node', 'scripts/setup.mjs']
  }
  if (task.script === 'setup:check') {
    return ['node', 'scripts/develop/doctor.mts']
  }
  if (task.script === 'docs') {
    return ['node', 'scripts/develop/docs.mts']
  }
  return [managedNpmWrapper(), 'run', task.script]
}

export const TASKS: readonly Task[] = [
  {
    script: 'setup',
    name: '1. Set up this checkout',
    description: 'Prepare the pinned tools, and locked dependencies.',
    detail:
      'Verifies pinned tools and installs locked dependencies. Browser fixtures are optional: node scripts/setup.mjs --full. Needs network access on first use. If setup fails, choose Troubleshoot setup for recovery guidance.',
    next: 'Next: node scripts/develop/run.mts',
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
      'Runs the pinned npm test script only. It does not run WPT, change files, or publish.',
    next: `Next: inspect git diff. For selector or browser behavior changes, run ${managedNpmWrapper()} run setup:full, then ${managedNpmWrapper()} run wpt:test.`,
  },
  {
    script: 'setup:check',
    name: '4. Troubleshoot setup (optional)',
    description: 'Check pinned tools and installed dependencies.',
    detail: 'Read-only. Reports the setup state and suggests the next command.',
    next: 'Follow the report. For details: node scripts/develop/doctor.mts --details.',
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
    : `Command: ${taskCommandArgs(task).join(' ')}`
  return `${task.description}\n\n${task.detail}\n\n${command}`
}
