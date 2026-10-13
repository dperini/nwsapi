export interface Task {
  script: string
  name: string
  description: string
  detail: string
  next: string
  persistent?: boolean
  optional?: boolean
  command?: string[]
}

export const TASKS: readonly Task[] = [
  {
    script: 'setup',
    command: ['node', 'scripts/repo/setup/bootstrap.mts'],
    name: 'Set up this checkout',
    description: 'Prepare tools, dependencies, and build outputs.',
    detail:
      'Downloads missing tools and dependencies, then builds the project.\nNeeds network access on first use. Existing downloads are reused.',
    next: 'Next: open the documentation and choose a change.',
  },
  {
    script: 'guide',
    name: 'Open documentation',
    description: 'Browse the docs while you edit.',
    detail:
      'Starts a docs server and opens your browser. Set NWSAPI_GUIDE_NO_OPEN=1 to skip opening it.\nRuns until you stop it.',
    next: 'After editing: review your changes.',
    persistent: true,
  },
  {
    script: 'review',
    name: 'Review my changes',
    description: 'Check lint, formatting, types, and unit tests.',
    detail:
      'Run after editing. Checks run in order and stop at the first failure.\nThis does not automatically fix, commit, or publish files.',
    next: 'Next: inspect git diff and choose any additional checks for your change.',
  },
  {
    script: 'ci:local',
    name: 'Run GitHub Actions locally (optional)',
    description: 'Run the CI workflow in the local Actions runner.',
    detail:
      'Uses the pinned run-local-ci tool with .github/workflows/ci.yml. Checks for a working runtime first. Installs OrbStack on macOS or Docker on other platforms if needed. Workflow secrets come from .env.local-ci or the environment.',
    next: 'Next: review any failed job in the local runner output.',
    optional: true,
  },
  {
    script: 'setup:check',
    command: ['node', 'scripts/repo/setup/doctor.mts'],
    name: 'Troubleshoot setup (optional)',
    description: 'Check missing tools or incompatible versions.',
    detail:
      'Checks tools and suggests the next command.\nRead-only. Use this whenever setup needs attention.',
    next: 'Follow the report. For executable paths: pnpm run setup:check --details.',
    optional: true,
  },
  {
    script: 'voiceover',
    name: 'VoiceOver controls (optional)',
    description: 'Explicitly start or stop macOS VoiceOver.',
    detail:
      'Shows the current state before offering a Start or Stop action. It never toggles implicitly. Command-F5 is the macOS emergency toggle.',
    next: 'VoiceOver control finished. You can return to this action to stop it.',
    optional: true,
    command: ['node', 'scripts/repo/develop/voiceover.mts'],
  },
]

export interface MenuState {
  selected: number
  result: string
  readiness?: Record<string, { ready: boolean; message: string }>
}

export function taskInstructions(
  task: Task,
  readiness?: { ready: boolean; message: string },
) {
  const command = task.command?.join(' ') ?? `pnpm run ${task.script}`
  return `${taskDetails(task, readiness)}\n\nCommand: ${command}`
}

export function taskDetails(
  task: Task,
  readiness?: { ready: boolean; message: string },
) {
  const stop = task.persistent
    ? '\nCtrl+C stops the server and returns here.'
    : ''
  const status = readiness
    ? readiness.ready
      ? `\nStatus: ready in this checkout.${readiness.message ? ` ${readiness.message}` : ''}`
      : `\nStatus: needs setup. ${readiness.message}`
    : ''
  return `${task.description}\n\n${task.detail}${stop}${status}`
}
