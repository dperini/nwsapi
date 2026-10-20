import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { ConfigPlan } from './shared.mts'
import { installProject } from './manager.mts'
import type {
  FileChange,
  PackageInstaller,
  PackageInstallRequest,
} from './types.mts'

export type TransactionOptions = {
  dryRun: boolean
  json?: boolean
  action?: 'add' | 'remove'
  projectRoot?: string
  installRequest: PackageInstallRequest
  install?: PackageInstaller
}

export function executePlan(
  plan: ConfigPlan,
  options: TransactionOptions,
): string {
  const projectRoot = options.projectRoot ?? options.installRequest.cwd
  const changes = summarizeChanges(plan.changes, projectRoot)
  const install = plan.hasProvenance
    ? {
        manager: options.installRequest.manager,
        cwd: options.installRequest.cwd,
        args:
          options.installRequest.manager === 'pnpm'
            ? ['install', '--no-frozen-lockfile']
            : ['install'],
      }
    : undefined
  const result = {
    schemaVersion: 1,
    type: 'result',
    command: `jsdom ${options.action ?? 'unknown'}`,
    status: resultStatus(options.dryRun, plan.hasProvenance),
    projectRoot,
    messages: plan.messages,
    changes,
    ...(install ? { install } : {}),
  }
  const json = () => JSON.stringify(result)
  if (options.dryRun || !plan.hasProvenance) {
    return options.json
      ? json()
      : formatPreview(plan, options, projectRoot, install?.args ?? [])
  }
  applyChanges(plan.changes, projectRoot)
  try {
    ;(options.install ?? installProject)(options.installRequest)
  } catch (error) {
    const recovery = rollbackChanges(plan.changes, projectRoot)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Package installation failed: ${detail}. ${recovery} The lockfile or node_modules may need repair.`,
    )
  }
  const messages = [
    ...plan.messages,
    ...plan.changes.map(
      change => `Updated ${relativePath(change, projectRoot)}.`,
    ),
    `Updated the dependency graph with ${options.installRequest.manager}.`,
  ]
  return options.json
    ? JSON.stringify({ ...result, messages })
    : messages.join('\n')
}

export function summarizeChanges(changes: FileChange[], root: string) {
  return changes.map(change => ({
    path: relativePath(change, root),
    operation: changeOperation(change),
  }))
}

export function changeOperation(change: FileChange) {
  if (change.updated === undefined) {
    return 'delete'
  }
  return change.original === undefined ? 'create' : 'update'
}

export function resultStatus(dryRun: boolean, hasProvenance: boolean) {
  if (dryRun) {
    return 'preview'
  }
  return hasProvenance ? 'completed' : 'unchanged'
}

export function formatPreview(
  plan: ConfigPlan,
  options: TransactionOptions,
  root: string,
  installArgs: string[],
) {
  const lines = [
    ...plan.messages,
    ...plan.changes.map(
      change => `Would ${changeVerb(change)} ${relativePath(change, root)}.`,
    ),
  ]
  if (options.dryRun && plan.hasProvenance) {
    lines.push(
      `Would run ${options.installRequest.manager} ${installArgs.join(' ')} in ${options.installRequest.cwd}.`,
    )
  }
  return lines.join('\n')
}

export function changeVerb(change: FileChange): string {
  if (change.updated === undefined) {
    return 'remove'
  }
  return change.original === undefined ? 'create' : 'update'
}

export function applyChanges(changes: FileChange[], projectRoot: string): void {
  for (const change of changes) {
    const current = existsSync(change.path)
      ? readFileSync(change.path, 'utf8')
      : undefined
    if (current !== change.original) {
      throw new Error(
        `${relativePath(change, projectRoot)} changed after planning. No files were changed.`,
      )
    }
  }
  const written: FileChange[] = []
  try {
    for (const change of changes) {
      if (change.updated === undefined) {
        unlinkSync(change.path)
      } else {
        writeAtomic(change.path, change.updated)
      }
      written.push(change)
    }
  } catch (error) {
    const recovery = rollbackChanges(written, projectRoot)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not update project configuration: ${detail}. ${recovery}`,
    )
  }
}

export function rollbackChanges(
  changes: FileChange[],
  projectRoot: string,
): string {
  const skipped: string[] = []
  for (const change of changes.toReversed()) {
    let current: string | undefined
    try {
      if (!existsSync(change.path)) {
        current = undefined
      } else {
        current = readFileSync(change.path, 'utf8')
      }
    } catch {
      skipped.push(relativePath(change, projectRoot))
      continue
    }
    if (current !== change.updated) {
      skipped.push(relativePath(change, projectRoot))
      continue
    }
    try {
      if (change.original === undefined) {
        if (existsSync(change.path)) {
          unlinkSync(change.path)
        }
      } else {
        writeAtomic(change.path, change.original)
      }
    } catch {
      skipped.push(relativePath(change, projectRoot))
    }
  }
  return skipped.length
    ? `Could not restore concurrently changed files: ${skipped.join(', ')}.`
    : 'Restored the configuration files written by this command.'
}

export function writeAtomic(filename: string, contents: string): void {
  const directory = path.dirname(filename)
  const temporary = path.join(directory, `.nwsapi-jsdom-${randomUUID()}.tmp`)
  const mode = existsSync(filename) ? statSync(filename).mode : 0o666
  try {
    writeFileSync(temporary, contents, { mode })
    chmodSync(temporary, mode)
    renameSync(temporary, filename)
  } finally {
    try {
      unlinkSync(temporary)
    } catch {
      // The temporary file is already gone after a successful rename.
    }
  }
}

export function relativePath(change: FileChange, projectRoot: string): string {
  return (
    path.relative(projectRoot, change.path).split(path.sep).join('/') ||
    path.basename(change.path)
  )
}
