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
  installRequest: PackageInstallRequest
  install?: PackageInstaller
}

export function executePlan(
  plan: ConfigPlan,
  options: TransactionOptions,
): string {
  const preview = [
    ...plan.messages,
    ...plan.changes.map(change => `Would update ${relativePath(change)}.`),
  ]
  if (options.dryRun) {
    if (plan.hasProvenance) {
      preview.push(
        `Would run ${options.installRequest.manager} install in ${options.installRequest.cwd}.`,
      )
    }
    return preview.join('\n')
  }
  if (!plan.hasProvenance) {
    return preview.join('\n')
  }
  applyChanges(plan.changes)
  try {
    ;(options.install ?? installProject)(options.installRequest)
  } catch (error) {
    const recovery = rollbackChanges(plan.changes)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Package installation failed: ${detail}. ${recovery} The lockfile or node_modules may need repair.`,
    )
  }
  return [
    ...plan.messages,
    ...plan.changes.map(change => `Updated ${relativePath(change)}.`),
    `Updated the dependency graph with ${options.installRequest.manager}.`,
  ].join('\n')
}

function applyChanges(changes: FileChange[]): void {
  for (const change of changes) {
    const current = existsSync(change.path)
      ? readFileSync(change.path, 'utf8')
      : undefined
    if (current !== change.original) {
      throw new Error(
        `${relativePath(change)} changed after planning. No files were changed.`,
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
    const recovery = rollbackChanges(written)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not update project configuration: ${detail}. ${recovery}`,
    )
  }
}

function rollbackChanges(changes: FileChange[]): string {
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
      skipped.push(relativePath(change))
      continue
    }
    if (current !== change.updated) {
      skipped.push(relativePath(change))
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
      skipped.push(relativePath(change))
    }
  }
  return skipped.length
    ? `Could not restore concurrently changed files: ${skipped.join(', ')}.`
    : 'Restored the configuration files written by this command.'
}

function writeAtomic(filename: string, contents: string): void {
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

function relativePath(change: FileChange): string {
  return path.basename(change.path)
}
