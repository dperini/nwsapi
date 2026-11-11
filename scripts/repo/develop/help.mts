import { ALL_TASKS, taskDisplayCommand } from './actions.mts'
export interface CommandHelp {
  title: string
  command: string
  description: string
  options: ReadonlyArray<readonly [string, string]>
}

export const COMMAND_HELP: Record<string, CommandHelp> = {
  setup: {
    title: 'Set up this checkout',
    command: 'pnpm run go',
    description: 'Prepare checkout tools, dependencies, and build outputs.',
    options: [
      ['--voiceover', 'Opt in to VoiceOver setup.'],
      ['--dry-run', 'Preview the setup plan.'],
      ['--json', 'Print machine-readable output.'],
      ['--describe', 'Describe setup without running it.'],
      ['-h, --help', 'Show help.'],
    ],
  },
  dev: {
    title: 'Developer wizard',
    command: 'pnpm run dev',
    description: 'Choose a task, preview it, then run it.',
    options: [
      ['--plain', 'Use numbered text prompts.'],
      ['--list', 'List tasks without running them.'],
      ['--task <id>', 'Run one task, then exit.'],
      ['--json', 'Print machine-readable output.'],
      ['--describe', 'Describe the available tasks.'],
      ['--dry-run --task setup', 'Preview checkout setup.'],
      ['--version v2|v3', 'Choose the product checkout.'],
      ['--sweep', 'Preview worktree cleanup.'],
      ['--sweep --apply', 'Apply the proposed cleanup.'],
      ['-h, --help', 'Show help.'],
    ],
  },
  guide: {
    title: 'Open documentation',
    command: 'pnpm run guide',
    description: 'Start the documentation server. Ctrl+C stops it.',
    options: [
      ['--host <host>', 'Choose the server address.'],
      ['--port <port>', 'Choose the listening port.'],
      ['--open [path]', 'Open the browser at a path.'],
      ['--strictPort', 'Fail if the chosen port is occupied.'],
      ['-h, --help', 'Show this project help.'],
    ],
  },
  review: {
    title: 'Review my changes',
    command: 'pnpm run review',
    description:
      'Run lint, formatting, types, and unit tests. Stop at the first failure.',
    options: [['-h, --help', 'Show help without running checks.']],
  },
  'ci:local': {
    title: 'Run GitHub Actions locally',
    command: 'pnpm run ci:local',
    description: 'Run the local workflow. Requires a container runtime.',
    options: [['-h, --help', 'Show help without starting containers.']],
  },
  'setup:check': {
    title: 'Troubleshoot setup',
    command: 'pnpm run setup:check',
    description: 'Inspect checkout readiness without changing it.',
    options: [
      ['--details', 'Show tool paths and detailed diagnostics.'],
      ['--task <id>', 'Check prerequisites for a task.'],
      ['-h, --help', 'Show help.'],
    ],
  },
  voiceover: {
    title: 'VoiceOver controls',
    command: 'pnpm run voiceover',
    description: 'Ask before changing VoiceOver. Requires macOS.',
    options: [
      ['--start', 'Explicitly start VoiceOver.'],
      ['--stop', 'Stop VoiceOver.'],
      ['-h, --help', 'Show help.'],
    ],
  },
}

export function formatCommandOptions(help: CommandHelp) {
  const width = Math.max(...help.options.map(([flag]) => flag.length)) + 3
  return help.options
    .map(([flag, description]) => `  ${flag.padEnd(width)}${description}`)
    .join('\n')
}

export function formatCommandHelp(id: string) {
  const help = COMMAND_HELP[id]!
  return `NWSAPI v3 · ${help.title}\n\nUsage:\n  ${help.command} [options]\n\n${help.description}\n\n${formatCommandOptions(help)}`
}

export function commandHelp(id: string): CommandHelp {
  const known = COMMAND_HELP[id]
  if (known) {
    return known
  }
  const task = ALL_TASKS.find(candidate => candidate.script === id)!
  return {
    title: task.name,
    command: taskDisplayCommand(task),
    description: task.description,
    options: task.viaWizard
      ? [['--json', 'Print the task result as JSON.']]
      : [['-h, --help', 'Show command help.']],
  }
}
