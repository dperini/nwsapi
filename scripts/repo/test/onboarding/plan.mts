import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { extractBlockByTag } from '../../lib/named-blocks.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'

export interface OnboardingPlan {
  run: boolean
  reason: string
}

export interface OnboardingPlanSources {
  git: (args: string[]) => string
  readReadme: () => string
}

export const ONBOARDING_INPUT_PATHS = [
  '.github/workflows/ci.yml',
  '.github/workflows/onboarding.yml',
  'scripts/repo/test/onboarding/**',
  'scripts/repo/setup/**',
  'scripts/repo/develop/**',
  '.config/external-tools.json',
  '.config/generated/external-tools.mts',
  '.config/node-interop.json',
  '.config/build.config.mts',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'README.md',
  'scripts/repo/node.mts',
  'scripts/repo/external-tools.mts',
  'scripts/repo/lib/paths.mts',
  'scripts/repo/lib/run-node.mts',
  'scripts/repo/lib/named-blocks.mts',
  'scripts/repo/lib/platform.mts',
  'scripts/repo/lib/package-manager.mts',
] as const

export function matchesOnboardingInput(file: string, input: string) {
  return input.endsWith('/**')
    ? file.startsWith(input.slice(0, -2))
    : file === input
}

export function onboardingBlock(markdown: string): string | undefined {
  return extractBlockByTag(markdown, 'onboarding')
}

export function onboardingInput(file: string): boolean {
  return (
    file !== 'README.md' &&
    ONBOARDING_INPUT_PATHS.some(input => matchesOnboardingInput(file, input))
  )
}

export function planOnboarding(
  files: readonly string[],
  previousReadme: string,
  currentReadme: string,
): OnboardingPlan {
  if (files.some(onboardingInput)) {
    return {
      run: true,
      reason: 'Onboarding implementation or install inputs changed.',
    }
  }
  if (!files.includes('README.md')) {
    return { run: false, reason: 'No onboarding inputs changed.' }
  }
  const before = onboardingBlock(previousReadme)
  const after = onboardingBlock(currentReadme)
  if (before === undefined || after === undefined) {
    return {
      run: true,
      reason: 'README onboarding markers are missing or malformed.',
    }
  }
  return {
    run: before !== after,
    reason:
      before === after
        ? 'README changes are outside onboarding.'
        : 'README onboarding section changed.',
  }
}

export function discoverOnboardingPlan(
  env = process.env,
  sources: OnboardingPlanSources = {
    git: args =>
      execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }),
    readReadme: () => readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8'),
  },
): OnboardingPlan {
  if (env['GITHUB_EVENT_NAME'] === 'workflow_dispatch') {
    return { run: true, reason: 'Manual onboarding run requested.' }
  }
  const base = env['ONBOARDING_BASE_SHA'] ?? ''
  if (!/^[a-f\d]{40}$/.test(base) || /^0+$/.test(base)) {
    return {
      run: true,
      reason: 'Comparison revision unavailable. Validate onboarding.',
    }
  }
  try {
    const files = sources
      .git(['diff', '--name-only', '-z', base, 'HEAD'])
      .split('\0')
      .filter(Boolean)
    if (!files.includes('README.md') || files.some(onboardingInput)) {
      return planOnboarding(files, '', '')
    }
    return planOnboarding(
      files,
      sources.git(['show', `${base}:README.md`]),
      sources.readReadme(),
    )
  } catch {
    return { run: true, reason: 'Comparison failed. Validate onboarding.' }
  }
}

export function writeOnboardingPlan(plan: OnboardingPlan, output: string) {
  appendFileSync(output, `run=${plan.run}\n`)
}

if (isMainModule(import.meta.url)) {
  const plan = discoverOnboardingPlan()
  console.log(JSON.stringify(plan))
  if (process.env['GITHUB_OUTPUT']) {
    writeOnboardingPlan(plan, process.env['GITHUB_OUTPUT'])
  }
}
