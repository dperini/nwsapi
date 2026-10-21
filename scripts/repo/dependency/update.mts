import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT, TAZE_CLI_PATH, WORKSPACE_PATH } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { collectPackumentFailures } from '../lib/taze-output.mts'
import { checkSoak, refreshSoak, soakPolicy } from '../soak.mts'
import { parse } from 'yaml'
import { managedCommand, managedEnvironment } from '../setup/manager.mts'

// Toolchain versions need a separate compatibility review.
const PINNED_TOOLCHAIN = [
  '@maschwenk/tsrs*',
  '@maschwenk/tsrslint',
  '@maschwenk/oxlint-tsgolint',
  '@oxfmt/*',
  '@oxlint/*',
  '@rolldown/*',
  '@swc/*',
  'gpu-lexer',
  'oxfmt',
  'oxlint',
  'rolldown',
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

export function updateReferences(check: boolean, run = runNode) {
  for (const name of ['wpt', 'chrome']) {
    run(
      path.join(
        REPO_ROOT,
        name === 'wpt'
          ? 'scripts/repo/wpt/update.mts'
          : 'scripts/repo/chrome/update.mts',
      ),
      check ? ['--check'] : [],
    )
  }
}

export function updateDependencies(
  check: boolean,
  run = runTaze,
  install = installDependencies,
  prepare = () => (check ? checkSoak() : refreshSoak()),
  upstream = updateReferences,
  syncManifest = syncPackageManifest,
) {
  prepare()
  run(TAZE_CLI_PATH, updateArgs(readFileSync(WORKSPACE_PATH, 'utf8'), check))
  if (!check) {
    syncManifest()
  }
  upstream(check)
  if (!check) {
    install()
  }
}

export function runTaze(entry: string, args: string[], retry = true): void {
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

export function installDependencies() {
  runManagedManager('pnpm', ['install', '--no-frozen-lockfile'])
  refreshNpmLock()
}

export function refreshNpmLock(root = REPO_ROOT, run = runManagedManager) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-npm-lock-'))
  try {
    copyFileSync(
      path.join(root, 'package.json'),
      path.join(temporary, 'package.json'),
    )
    copyFileSync(path.join(root, '.npmrc'), path.join(temporary, '.npmrc'))
    // Lock generation has no install tree, and must not rerun lifecycle scripts.
    run(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts'],
      temporary,
    )
    copyFileSync(
      path.join(temporary, 'package-lock.json'),
      path.join(root, 'package-lock.json'),
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export function runManagedManager(
  manager: 'pnpm' | 'npm',
  args: string[],
  cwd = REPO_ROOT,
) {
  const request = managedCommand(args, undefined, process.platform, manager)
  execFileSync(request.command, request.args, {
    cwd,
    env: managedEnvironment(),
    stdio: 'inherit',
  })
}

export function syncPackageManifest(root = REPO_ROOT) {
  const workspace = parse(
    readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ) as {
    catalog: Record<string, string>
    allowBuilds?: Record<string, boolean>
    overrides?: Record<string, string>
  }
  const manifestPath = path.join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    devDependencies: Record<string, string>
    allowScripts?: Record<string, boolean>
    overrides?: Record<string, string>
  }
  pkg.devDependencies = Object.fromEntries(
    Object.entries(workspace.catalog).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  pkg.allowScripts = { ...(workspace.allowBuilds ?? {}) }
  pkg.overrides = { ...(workspace.overrides ?? {}) }
  writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    throw new Error('Usage: pnpm run update [--check]')
  }
  const check = process.argv.includes('--check')
  updateDependencies(check, undefined, undefined, undefined, () => {})
}
