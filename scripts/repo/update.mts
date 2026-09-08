import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { REPO_ROOT, TAZE_CLI_PATH, WORKSPACE_PATH } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'
import { collectPackumentFailures } from './lib/taze-output.mts'
import { checkSoak, refreshSoak, soakPolicy } from './soak.mts'

// Toolchain versions need a separate compatibility review.
const PINNED_TOOLCHAIN = [
  '@oxfmt/*',
  '@oxlint/*',
  '@rolldown/*',
  '@swc/*',
  '@typescript/*',
  'oxfmt',
  'oxlint',
  'oxlint-tsgolint',
  'rolldown',
  'typescript',
  'vite',
]

export function updateArgs(workspace: string, check: boolean) {
  const { days } = soakPolicy(workspace)
  return [
    'latest',
    '--include-locked',
    '--maturity-period',
    String(days),
    '--exclude',
    PINNED_TOOLCHAIN.join(','),
    '--request-timeout',
    '30000',
    '--no-github-actions',
    '--no-node-version',
    ...(check ? [] : ['--write']),
  ]
}

export function updateDependencies(
  check: boolean,
  run = runTaze,
  install = installDependencies,
  prepare = () => (check ? checkSoak() : refreshSoak()),
) {
  if (
    !check &&
    install === installDependencies &&
    !process.env['npm_execpath']
  ) {
    throw new Error('Run this command with pnpm run update.')
  }
  prepare()
  run(TAZE_CLI_PATH, updateArgs(readFileSync(WORKSPACE_PATH, 'utf8'), check))
  if (!check) {
    install()
  }
}

function runTaze(entry: string, args: string[], retry = true): void {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: REPO_ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
  })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `Dependency update failed: ${result.signal || result.status}`,
    )
  }
  const failed = collectPackumentFailures(result.stdout + result.stderr)
  if (failed.length) {
    if (retry) {
      console.error('Retrying failed dependency lookups once.')
      return runTaze(entry, args, false)
    }
    throw new Error(`Dependency lookups failed: ${failed.join(', ')}`)
  }
}

function installDependencies() {
  // Reuse the invoking manager instead of selecting another pnpm from PATH.
  const cli = process.env['npm_execpath']
  if (!cli) {
    throw new Error('Run this command with pnpm run update.')
  }
  const args = ['install', '--no-frozen-lockfile']
  const isScript = /\.[cm]?js$/.test(cli)
  execFileSync(
    isScript ? process.execPath : cli,
    isScript ? [cli, ...args] : args,
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  )
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    throw new Error('Usage: pnpm run update [--check]')
  }
  updateDependencies(process.argv.includes('--check'))
}
