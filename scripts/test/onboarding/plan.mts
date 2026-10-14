import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { extractBlockByTag } from '../../lib/named-blocks.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/paths.mts'

export interface OnboardingPlan {
  run: boolean
  reason: string
}

export interface OnboardingPlanSources {
  git: (args: string[]) => string
  readReadme: () => string
}

export function onboardingBlock(markdown: string): string | undefined {
  return extractBlockByTag(markdown, 'onboarding')
}

export function onboardingInput(file: string): boolean {
  return (
    [
      '.github/workflows/onboarding-v2.yml',
      '.config/external-tools.json',
      '.npmrc',
      'package.json',
      'package-lock.json',
      'scripts/setup.mjs',
      'scripts/package-manager.mjs',
      'scripts/lib/package-manager.mjs',
      'scripts/lib/external-tools.mjs',
      'scripts/lib/npm.mjs',
      'scripts/lib/paths.mts',
      'scripts/lib/named-blocks.mts',
    ].includes(file) ||
    [
      'scripts/test/onboarding/',
      'scripts/setup/',
      'scripts/lib/tools/',
      'scripts/develop/',
    ].some(prefix => file.startsWith(prefix))
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
