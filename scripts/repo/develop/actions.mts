import { consoleMessage } from './console-symbols.mts'
export interface Task {
  script: string
  name: string
  description: string
  detail: string
  next: string
  persistent?: boolean
  optional?: boolean
  command?: string[]
  viaWizard?: boolean
}

export const TASKS: readonly Task[] = [
  {
    script: 'setup',
    name: 'Set up this checkout',
    description:
      'Prepare tools, dependencies, editor setup, and build outputs.',
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
    name: 'Run GitHub Actions locally',
    description: 'Run the CI workflow in the local Actions runner.',
    detail:
      'Uses the pinned run-local-ci tool with .github/workflows/ci.yml. Checks for a working runtime first. Installs OrbStack on macOS or Docker on other platforms if needed. Workflow secrets come from .env.local-ci or the environment.',
    next: 'Next: review any failed job in the local runner output.',
    optional: true,
  },
  {
    script: 'setup:check',
    name: 'Troubleshoot setup',
    description: 'Check missing tools or incompatible versions.',
    detail:
      'Checks tools and suggests the next command.\nRead-only. Use this whenever setup needs attention.',
    next: 'Follow the report. For executable paths: pnpm run setup:check --details.',
    optional: true,
  },
  {
    script: 'voiceover',
    name: 'VoiceOver controls',
    description: 'Explicitly start or stop macOS VoiceOver.',
    detail:
      'Shows the current state before offering a Start or Stop action. It never toggles implicitly. Command-F5 is the macOS emergency toggle.',
    next: 'VoiceOver control finished. You can return to this action to stop it.',
    optional: true,
    command: ['node', 'scripts/repo/develop/voiceover.mts'],
  },
]

export const REVIEW_TASKS: readonly Task[] = [
  { ...TASKS[2]!, name: 'Run full review' },
  {
    script: 'test:unit',
    name: 'Run unit tests',
    description: 'Check individual behaviors without browser setup.',
    detail:
      'Use while changing implementation or tests. For the complete pre-commit checks, choose Run full review.',
    next: 'Fix failures, then run full review.',
  },
  {
    script: 'test:integration',
    name: 'Run integration tests',
    description: 'Check how repository tools and components work together.',
    detail: 'Use after changing setup, process execution, or integrations.',
    next: 'Inspect failures, then rerun this check.',
  },
  {
    script: 'test:browser',
    name: 'Run browser tests',
    description: 'Check behavior in a real browser.',
    detail:
      'May install the pinned browser on first use. Requires network access for missing downloads.',
    next: 'Inspect the browser report.',
  },
  ...[
    {
      script: 'check:nested-selectors',
      name: 'Check nested selectors',
      description: 'Check nested CSS selectors and parser initialization.',
      detail:
        'Use after changing selector parsing or optimization. Includes cached selection checks.',
      file: 'optimizer-nesting.test.mts',
    },
    {
      script: 'check:attributes',
      name: 'Check attribute parsing',
      description: 'Check attribute-selector parsing and invalid input.',
      detail:
        'Use after changing attribute selectors or syntax-error handling.',
      file: 'attribute-parse-error.test.mts',
    },
    {
      script: 'check:legacy-dom',
      name: 'Check legacy DOM support',
      description: 'Check compatibility with older DOM implementations.',
      detail: 'Use after changing DOM compatibility paths.',
      file: 'legacy-dom.test.mts',
    },
  ].map(({ file, ...task }) => ({
    ...task,
    viaWizard: true,
    next: 'Run full review before submitting changes.',
    command: [
      'node',
      'scripts/repo/run.mts',
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      '.config/repo/vitest.config.mts',
      `test/repo/unit/${file}`,
    ],
  })),
  {
    script: 'snapshot:update',
    name: 'Update terminal snapshots',
    description: 'Replace the saved wizard images and gallery.',
    detail:
      'Use only after an intentional UI change. Review the SVG diff and gallery before committing.',
    next: 'Review the gallery and run tests without -u.',
  },
]

export const ALL_TASKS = [
  ...TASKS,
  ...REVIEW_TASKS.filter(
    task => !TASKS.some(root => root.script === task.script),
  ),
]
export function menuTasks(state: MenuState) {
  return state.group === 'review' ? REVIEW_TASKS : TASKS
}

export type MenuChoice = number | 'review-checks' | 'back' | undefined

export interface MenuState {
  language?: import('./language.mts').WizardLanguage
  languageOpen?: boolean
  selected: number
  group?: 'review'
  helpCommand?: string
  result: string
  resultKind?: 'success' | 'warning' | 'error' | 'info'
  disabled?: Record<string, string>
  failures?: Record<string, string>
  readiness?: Record<string, { ready: boolean; message: string }>
}

export function taskInstructions(
  task: Task,
  readiness?: { ready: boolean; message: string },
) {
  const command = taskDisplayCommand(task)
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
      ? `\n${consoleMessage('success', `Status: ready in this checkout.${readiness.message ? ` ${readiness.message}` : ''}`)}`
      : `\n${consoleMessage('warning', `Status: needs setup. ${readiness.message}`)}`
    : ''
  return `${task.optional ? 'Optional. ' : ''}${task.description}\n\n${task.detail}${stop}${status}`
}

export function taskDisplayCommand(task: Task) {
  return task.viaWizard
    ? `pnpm run dev --task ${task.script}`
    : `pnpm run ${task.script === 'setup' ? 'go' : task.script}`
}

export function taskDisabledReason(task: Task, platform = process.platform) {
  return task.script === 'voiceover' && platform !== 'darwin'
    ? 'macOS only'
    : undefined
}

export function taskStatus(task: Task, state: MenuState) {
  const disabled = state.disabled?.[task.script]
  if (disabled) {
    return { kind: 'disabled', label: 'Disabled', message: disabled } as const
  }
  const failure = state.failures?.[task.script]
  if (failure) {
    return { kind: 'error', label: 'Needs fixing', message: failure } as const
  }
  const readiness = state.readiness?.[task.script]
  if (readiness && !readiness.ready) {
    return {
      kind: 'warning',
      label: 'Needs attention',
      message: readiness.message,
    } as const
  }
  if (readiness?.ready) {
    return {
      kind: 'success',
      label: 'Ready',
      message: readiness.message,
    } as const
  }
  return { kind: 'info', label: 'Available', message: '' } as const
}
