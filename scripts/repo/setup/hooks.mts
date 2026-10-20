import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../lib/run-node.mts'

export interface HookFileSystem {
  mkdirSync: typeof mkdirSync
  lstatSync: typeof lstatSync
  readFileSync: typeof readFileSync
  openSync: typeof openSync
  writeFileSync: typeof writeFileSync
  closeSync: typeof closeSync
}

export interface HookSetupDependencies {
  runGit(args: string[]): { status: number; stdout: string }
  files: HookFileSystem
  platform: NodeJS.Platform
  pathOps?: Pick<typeof path, 'resolve' | 'join'>
  log(message: string): void
}

export type HookSetupResult =
  | { status: 'installed'; directory: string; hooks: string[] }
  | { status: 'preview'; directory: string; hooks: string[] }
  | { status: 'skipped'; reason: string }

const hookNames = ['pre-commit', 'pre-push'] as const

export function hookBody(platform: NodeJS.Platform) {
  const nodeName = platform === 'win32' ? 'node.exe' : 'node'
  return `#!/bin/sh\nset -eu\nroot=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0\nrunner="$root/scripts/repo/git/hooks/run.mts"\nif ! git -C "$root" cat-file -e HEAD:scripts/repo/git/hooks/run.mts 2>/dev/null; then\n  printf '%s\\n' '[hooks] Skipping: this commit does not contain the hook runner.' >&2\n  exit 0\nfi\nif [ ! -f "$runner" ]; then\n  printf '%s\\n' '[hooks] Hook runner is missing from this checkout.' >&2\n  exit 1\nfi\nnode="$root/.cache/bin/${nodeName}"\nif [ ! -x "$node" ]; then\n  printf '%s\\n' '[hooks] Managed Node is missing. Run node scripts/repo/setup/tools.mts, then retry.' >&2\n  exit 1\nfi\nexec "$node" "$runner" \${0##*/} "$@"\n`
}

export function defaultDependencies(): HookSetupDependencies {
  return {
    runGit(args) {
      try {
        return {
          status: 0,
          stdout: execFileSync('git', args, {
            cwd: process.cwd(),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
        }
      } catch (error) {
        const result = error as { status?: number; stdout?: Buffer | string }
        return {
          status: result.status ?? 1,
          stdout: String(result.stdout ?? ''),
        }
      }
    },
    files: {
      mkdirSync,
      lstatSync,
      readFileSync,
      openSync,
      writeFileSync,
      closeSync,
    },
    platform: process.platform,
    log: message => console.log(message),
  }
}

export function installGitHooks(
  dependencies = defaultDependencies(),
  dryRun = false,
): HookSetupResult {
  const resolved = resolveHooksDirectory(dependencies)
  if (typeof resolved !== 'string') {
    return resolved
  }
  const directory = resolved
  const paths = dependencies.pathOps ?? path
  const body = hookBody(dependencies.platform)
  const states = hookNames.map(name => ({
    name,
    destination: paths.join(directory, name),
    state: inspectHook(
      paths.join(directory, name),
      body,
      dependencies.files,
      dependencies.platform,
    ),
  }))
  const conflicts = states.filter(item => item.state === 'conflict')
  if (conflicts.length > 0) {
    const filenames = conflicts.map(item => item.destination)
    const reason = `Existing hook paths were preserved: ${filenames.join(', ')}`
    dependencies.log(`[hooks] Skipping: ${reason}`)
    return { status: 'skipped', reason }
  }

  const missing = states.filter(entry => entry.state === 'missing')
  if (dryRun) {
    return previewHooks(dependencies, directory, missing)
  }

  dependencies.files.mkdirSync(directory, { recursive: true })
  const installed: string[] = []
  const raced: string[] = []
  for (const item of missing) {
    const result = writeHook(item.destination, body, dependencies.files)
    if (result === 'installed') {
      installed.push(item.name)
    } else {
      raced.push(item.destination)
    }
  }
  if (raced.length > 0) {
    const reason = `A hook path appeared during installation and was preserved: ${raced.join(', ')}`
    dependencies.log(`[hooks] Skipping: ${reason}`)
    return { status: 'skipped', reason }
  }
  dependencies.log(
    installed.length > 0
      ? `[hooks] Installed ${installed.join(' and ')} in ${directory}.`
      : `[hooks] Git hooks are already installed in ${directory}.`,
  )
  return { status: 'installed', directory, hooks: [...hookNames] }
}

export function resolveHooksDirectory(
  dependencies: HookSetupDependencies,
): string | Extract<HookSetupResult, { status: 'skipped' }> {
  const paths = dependencies.pathOps ?? path
  const rootResult = dependencies.runGit(['rev-parse', '--show-toplevel'])
  if (rootResult.status !== 0 || !rootResult.stdout.trim()) {
    return skipHooks(
      dependencies,
      'Not inside a Git checkout; no hooks were installed.',
    )
  }
  const root = paths.resolve(rootResult.stdout.trim())
  const customPath = dependencies.runGit([
    'config',
    '--path',
    '--get',
    'core.hooksPath',
  ])
  if (customPath.status === 0) {
    const value = customPath.stdout.trim()
    const detail = value ? ` (${value})` : ''
    return skipHooks(
      dependencies,
      `core.hooksPath is configured${detail}; preserving it.`,
    )
  }
  const hooksResult = dependencies.runGit(['rev-parse', '--git-path', 'hooks'])
  if (hooksResult.status !== 0 || !hooksResult.stdout.trim()) {
    return skipHooks(dependencies, 'Git could not resolve its hooks directory.')
  }
  return paths.resolve(root, hooksResult.stdout.trim())
}

export function skipHooks(
  dependencies: HookSetupDependencies,
  reason: string,
): Extract<HookSetupResult, { status: 'skipped' }> {
  dependencies.log(`[hooks] Skipping: ${reason}`)
  return { status: 'skipped', reason }
}

export function previewHooks(
  dependencies: HookSetupDependencies,
  directory: string,
  missing: Array<{ name: string }>,
): HookSetupResult {
  const hooks = missing.map(item => item.name)
  const message = hooks.length
    ? `[hooks] Would install ${hooks.join(' and ')} in ${directory}.`
    : `[hooks] Git hooks are already installed in ${directory}.`
  dependencies.log(message)
  return { status: 'preview', directory, hooks }
}

export function describeGitHooks() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/hooks',
    description: 'Install the repository pre-commit and pre-push hooks.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export function main(
  args = process.argv.slice(2),
  dependencies = defaultDependencies(),
) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.describe) {
    const description = describeGitHooks()
    dependencies.log(
      values.json
        ? JSON.stringify(description)
        : `${description.name}: ${description.description}\nUse --dry-run to preview hook paths.`,
    )
    return
  }
  const operationDependencies = values.json
    ? { ...dependencies, log: () => {} }
    : dependencies
  const result = installGitHooks(operationDependencies, values['dry-run'])
  if (values.json) {
    dependencies.log(
      JSON.stringify({ schemaVersion: 1, type: 'result', ...result }),
    )
  }
}

export function inspectHook(
  destination: string,
  body: string,
  files: HookFileSystem,
  platform: NodeJS.Platform,
): 'missing' | 'current' | 'conflict' {
  try {
    const metadata = files.lstatSync(destination)
    return metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (platform === 'win32' || (metadata.mode & 0o111) !== 0) &&
      files.readFileSync(destination, 'utf8') === body
      ? 'current'
      : 'conflict'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing'
    }
    return 'conflict'
  }
}

export function writeHook(
  destination: string,
  body: string,
  files: HookFileSystem,
): 'installed' | 'conflict' {
  try {
    const descriptor = files.openSync(destination, 'wx', 0o755)
    try {
      files.writeFileSync(descriptor, body)
    } finally {
      files.closeSync(descriptor)
    }
    return 'installed'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return 'conflict'
    }
    throw error
  }
}

if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(
      `[hooks] Installation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}
