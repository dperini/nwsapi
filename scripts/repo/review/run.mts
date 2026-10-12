import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

const steps = [
  { label: 'Lint', entry: 'lint.mts', command: 'pnpm run lint', args: [] },
  {
    label: 'Formatting',
    entry: 'format/check.mts',
    command: 'pnpm run format:check',
    args: [],
  },
  {
    label: 'Types',
    entry: 'type/check.mts',
    command: 'pnpm run type:check',
    args: [],
  },
  {
    label: 'Unit tests',
    entry: 'review/unit.mts',
    command: 'pnpm run test:unit',
    args: [],
  },
]

export function review(run = runNode, log = console.log) {
  for (const [index, step] of steps.entries()) {
    log(`${index + 1} of ${steps.length}: ${step.label}`)
    try {
      run(path.join(REPO_ROOT, 'scripts/repo', step.entry), step.args)
    } catch {
      if (step.label === 'Unit tests') {
        log(
          'Review stopped at Unit tests. Resolve the reported issue, then run pnpm run test:unit.',
        )
        log(
          'Rerun the unit step with pnpm run test:unit. Focused suite commands, when shown, are diagnostic only and do not verify the full inventory.',
        )
        log('After resolving the failure, rerun pnpm run review.')
      } else {
        log(
          `Review stopped at ${step.label}. Resolve the reported issue, then run ${step.command}.`,
        )
        log('Next: pnpm run review to repeat the complete review.')
      }
      return 1
    }
  }
  log(
    'Review complete. Next: inspect git diff and choose any additional checks for your change.',
  )
  return 0
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(
      'Usage: pnpm run review\nRuns lint, formatting checks, types, and unit tests. Stops at the first failure. Does not apply fixes.',
    )
  } else {
    process.exitCode = review()
  }
}
