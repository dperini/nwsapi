import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'

import { isMainModule, runNode } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { runBudgeted } from '../lib/test-budget.mts'

export interface CiTestPlan {
  browser: boolean
  fullNode: boolean
  fuzz: boolean
  node: boolean
  package: boolean
  relatedFiles: string[]
  testFiles: string[]
}

const TEST_FILE_RE = /^test\/repo\/(unit|integration)\/.*\.test\.mts$/

export function planCiTests(files: readonly string[]): CiTestPlan {
  const normalized = files.map(file => file.replaceAll('\\', '/'))
  const sourceChanged = normalized.some(file => file.startsWith('src/'))
  const dependencyChanged = normalized.some(file =>
    ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(file),
  )
  const testInfrastructureChanged = normalized.some(
    file =>
      file === 'scripts/repo/test.mts' ||
      file.startsWith('scripts/repo/test/') ||
      file.startsWith('.config/repo/vitest') ||
      file.startsWith('.config/playwright') ||
      file === '.config/state-pseudos.config.mts',
  )
  const fullNode =
    sourceChanged || dependencyChanged || testInfrastructureChanged
  const testFiles = normalized.filter(file => TEST_FILE_RE.test(file))
  const relatedFiles = normalized.filter(
    file =>
      (file.startsWith('scripts/repo/') ||
        file.startsWith('test/repo/unit/') ||
        file.startsWith('test/repo/integration/')) &&
      (file.endsWith('.mts') || file.endsWith('.js')) &&
      !TEST_FILE_RE.test(file),
  )
  const node = fullNode || testFiles.length > 0 || relatedFiles.length > 0
  const browser =
    sourceChanged ||
    dependencyChanged ||
    normalized.some(
      file =>
        file.startsWith('test/repo/e2e/') ||
        file.startsWith('.config/playwright') ||
        file === '.config/state-pseudos.config.mts' ||
        file === 'scripts/repo/browser.mts',
    )
  const packageTest =
    sourceChanged ||
    dependencyChanged ||
    normalized.some(
      file =>
        file.startsWith('scripts/repo/build/') ||
        file === 'test/repo/e2e/jsdom-adapter-package.mts',
    )
  const fuzz =
    sourceChanged ||
    dependencyChanged ||
    normalized.some(
      file =>
        file.startsWith('test/repo/fuzz/') || file === 'scripts/repo/fuzz.mts',
    )
  return {
    browser,
    fullNode,
    fuzz,
    node,
    package: packageTest,
    relatedFiles,
    testFiles,
  }
}

function gitLines(args: string[]): string[] {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
}

function comparisonBase(): string | undefined {
  const baseFlag = process.argv.indexOf('--base')
  if (baseFlag !== -1) {
    return process.argv[baseFlag + 1]
  }
  if (process.env['GITHUB_BASE_REF']) {
    return `origin/${process.env['GITHUB_BASE_REF']}`
  }
  const before = process.env['GITHUB_EVENT_BEFORE']
  if (before && !/^0+$/.test(before)) {
    return before
  }
  return process.env['CI'] ? undefined : 'HEAD^'
}

function changedFiles(): { files: string[]; reliable: boolean } {
  const base = comparisonBase()
  if (!base) {
    return { files: [], reliable: false }
  }
  try {
    const mergeBase = gitLines(['merge-base', base, 'HEAD'])[0]
    if (!mergeBase) {
      return { files: [], reliable: false }
    }
    return {
      files: gitLines([
        'diff',
        '--name-only',
        '--diff-filter=ACMR',
        `${mergeBase}...HEAD`,
      ]),
      reliable: true,
    }
  } catch {
    return { files: [], reliable: false }
  }
}

function completePlan(): CiTestPlan {
  return {
    browser: true,
    fullNode: true,
    fuzz: true,
    node: true,
    package: true,
    relatedFiles: [],
    testFiles: [],
  }
}

function writeGithubPlan(plan: CiTestPlan): void {
  const output = process.env['GITHUB_OUTPUT']
  if (!output) {
    throw new Error('GITHUB_OUTPUT is required with --github-output')
  }
  appendFileSync(
    output,
    `${(['browser', 'fuzz', 'node', 'package'] as const)
      .map(key => `${key}=${String(plan[key])}`)
      .join('\n')}\n`,
  )
}

async function main(): Promise<void> {
  const changed = changedFiles()
  const plan = changed.reliable ? planCiTests(changed.files) : completePlan()
  if (process.argv.includes('--github-output')) {
    writeGithubPlan(plan)
    console.log(`CI test plan: ${JSON.stringify(plan)}`)
    return
  }
  if (!plan.node) {
    console.log('No Node tests are affected by this change.')
    return
  }
  runNode(path.join(REPO_ROOT, 'scripts/repo/build/run.mts'))
  const testScript = path.join(REPO_ROOT, 'scripts/repo/test.mts')
  if (plan.fullNode) {
    runNode(testScript, ['all'])
    return
  }
  const unitFiles = plan.testFiles.filter(file =>
    file.startsWith('test/repo/unit/'),
  )
  const integrationFiles = plan.testFiles.filter(file =>
    file.startsWith('test/repo/integration/'),
  )
  if (unitFiles.length > 0) {
    runNode(testScript, ['unit', ...unitFiles])
  }
  if (integrationFiles.length > 0) {
    runNode(testScript, ['integration', ...integrationFiles])
  }
  if (plan.relatedFiles.length > 0) {
    const code = await runBudgeted(
      [
        'node_modules/vitest/vitest.mjs',
        'related',
        ...plan.relatedFiles,
        '--run',
        '--config',
        '.config/repo/vitest.config.mts',
      ],
      60_000,
      'related',
    )
    if (code !== 0) {
      process.exitCode = code
    }
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
