import { runBudgeted } from '../lib/test-budget.mts'

const CLEAN_CHECKOUT_TEST = 'test/repo/integration/typecheck-clean.test.mts'

export interface TestPhase {
  args: string[]
  label: string
}

export function runnerArguments(args: readonly string[]) {
  return args[0] === '--' ? args.slice(1) : [...args]
}

export function usesLocalUnitShards(
  lane: string,
  runnerArgs: readonly string[],
  coverage: boolean,
) {
  return lane === 'unit' && runnerArgs.length === 0 && !coverage
}

interface PhaseRunnerOptions {
  phases: readonly TestPhase[]
  runner: string[]
  budgetMs: number
  env: NodeJS.ProcessEnv
  run?: typeof runBudgeted
  now?: () => number
}

export function testPhases(
  lane: string,
  args: string[],
  isolateCleanCheckout: boolean,
): TestPhase[] {
  if (lane !== 'integration' || !isolateCleanCheckout) {
    return [{ args, label: lane }]
  }
  return [
    {
      args: [...args, CLEAN_CHECKOUT_TEST],
      label: 'integration clean-checkout',
    },
    {
      args: [...args, `--exclude=${CLEAN_CHECKOUT_TEST}`],
      label: 'integration suite',
    },
  ]
}

export async function runTestPhases({
  phases,
  runner,
  budgetMs,
  env,
  run = runBudgeted,
  now = () => performance.now(),
}: PhaseRunnerOptions): Promise<number> {
  const startedAt = now()
  for (const phase of phases) {
    const remaining = Math.floor(budgetMs - (now() - startedAt))
    if (remaining <= 0) {
      console.error(`[test] test phases exceeded their ${budgetMs} ms budget`)
      return 1
    }
    const code = await run(
      [...runner, ...phase.args],
      remaining,
      phase.label,
      env,
    )
    if (code !== 0) {
      return code
    }
  }
  return 0
}
