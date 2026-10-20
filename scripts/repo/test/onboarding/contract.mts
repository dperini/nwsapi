import path from 'node:path'
import type { ScenarioOptions } from './scenario.mts'

export const ONBOARDING_SCENARIOS = [
  'bootstrap',
  'npm',
  'pnpm',
  'journey',
] as const
export type OnboardingScenario = (typeof ONBOARDING_SCENARIOS)[number]
export type OnboardingOptions = ScenarioOptions

export function parseOnboardingArguments(argv: string[]): OnboardingOptions {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    if (key === '--keep') {
      values.set(key, 'true')
      continue
    }
    const value = argv[++index]
    if (!value) {
      throw new Error(`Missing value for ${key}`)
    }
    values.set(key, value)
  }
  return parseOnboardingOptions(values)
}

export function parseOnboardingOptions(
  values: Map<string, string>,
): OnboardingOptions {
  const scenario = values.get('--scenario') as OnboardingScenario | undefined
  const node = values.get('--node')
  if (!scenario || !ONBOARDING_SCENARIOS.includes(scenario)) {
    throw new Error(`Choose --scenario ${ONBOARDING_SCENARIOS.join('|')}.`)
  }
  if (!node || !path.isAbsolute(node)) {
    throw new Error('Pass the absolute entry runtime path with --node.')
  }
  const npm = values.get('--npm')
  const pnpm = values.get('--pnpm')
  if ((npm && !path.isAbsolute(npm)) || (pnpm && !path.isAbsolute(pnpm))) {
    throw new Error('Pass absolute manager entry paths.')
  }
  if ((scenario === 'npm' && !npm) || (scenario === 'pnpm' && !pnpm)) {
    throw new Error(`Pass the pinned external ${scenario} entry point.`)
  }
  return {
    scenario,
    node,
    ...(npm ? { npm } : {}),
    ...(pnpm ? { pnpm } : {}),
    keep: values.has('--keep'),
  }
}

export function parseOnboardingControls(argv: string[]) {
  const args: string[] = []
  let json = false
  let describe = false
  let dryRun = false
  for (const argument of argv) {
    if (argument === '--json') {
      json = true
    } else if (argument === '--describe') {
      describe = true
    } else if (argument === '--dry-run') {
      dryRun = true
    } else {
      args.push(argument)
    }
  }
  if (describe && dryRun) {
    throw new Error('Choose --describe or --dry-run.')
  }
  return { args, json, describe, dryRun }
}

export function describeOnboardingRun() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'onboarding/run',
    description:
      'Run an isolated checkout through bootstrap, install, and contributor setup.',
    options: ['--json', '--describe', '--dry-run', '--keep'],
    scenarios: ONBOARDING_SCENARIOS,
    mutates: true,
  }
}

export function formatOnboardingPlan(
  plan: ReturnType<typeof onboardingRunPlan>,
) {
  return [
    `Would run ${plan.command}:`,
    `  ${plan.invocation.command} ${plan.invocation.args.join(' ')}`,
    ...plan.steps.map(step => `  ${step}`),
    'Temporary and report paths:',
    ...plan.targets.map(target => `  ${target}`),
    `Keep sandbox: ${plan.keepSandbox}`,
  ].join('\n')
}

export function presentOnboardingRequest(
  controls: ReturnType<typeof parseOnboardingControls>,
  options: OnboardingOptions,
  root: string,
  temporary: string,
  log: (message: string) => void,
) {
  if (controls.describe) {
    const description = describeOnboardingRun()
    log(
      controls.json
        ? JSON.stringify(description)
        : `${description.name}: ${description.description}\nScenarios: ${description.scenarios.join(', ')}.`,
    )
    return true
  }
  if (controls.dryRun) {
    const plan = onboardingRunPlan(options, root, temporary)
    log(controls.json ? JSON.stringify(plan) : formatOnboardingPlan(plan))
    return true
  }
  return false
}

export function onboardingRunPlan(
  options: ScenarioOptions,
  root: string,
  temporary: string,
) {
  const manager =
    options.scenario === 'npm' || options.scenario === 'pnpm'
      ? options.scenario
      : undefined
  const steps =
    options.scenario === 'bootstrap'
      ? [
          'Create an isolated checkout at the current commit.',
          'Use the entry Node runtime to bootstrap pinned tools and dependencies.',
          'Run the README install, setup wizard, and readiness checks.',
        ]
      : options.scenario === 'npm' || options.scenario === 'pnpm'
        ? [
            `Use the pinned ${manager} entry point in an isolated checkout.`,
            'Run the literal README install command and developer journey.',
            'Collect review output and verify the checkout is unchanged.',
          ]
        : [
            'Create an isolated checkout at the current commit.',
            'Run the numbered setup wizard, diagnostics, and documentation server.',
            'Run review and verify the checkout is unchanged.',
          ]
  const args = [
    'scripts/repo/test/onboarding/run.mts',
    '--scenario',
    options.scenario,
    '--node',
    options.node,
    ...(options.npm ? ['--npm', options.npm] : []),
    ...(options.pnpm ? ['--pnpm', options.pnpm] : []),
    ...(options.keep ? ['--keep'] : []),
  ]
  return {
    schemaVersion: 1,
    type: 'preview',
    command: `onboarding/${options.scenario}`,
    root,
    invocation: { command: options.node, args },
    steps,
    targets: [
      path.join(temporary, 'nwsapi-onboarding-*'),
      path.join(root, '.cache/onboarding'),
    ],
    keepSandbox: options.keep ?? false,
  }
}
