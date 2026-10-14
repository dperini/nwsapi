import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

export interface SetupProgress {
  phase: string
  status: 'running' | 'completed' | 'failed'
  message?: string
}

export function writeSetupProgress(progress: SetupProgress, root = REPO_ROOT) {
  const directory = path.join(root, '.cache')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'setup-progress.json'),
    JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }) + '\n',
    { mode: 0o600 },
  )
}

export async function setupPhase<T>(
  label: string,
  action: () => T | Promise<T>,
  log: (message: string) => void = console.log,
  save: (progress: SetupProgress) => void = writeSetupProgress,
  retry = 'node scripts/setup.mjs',
) {
  log('[setup] ' + label)
  save({ phase: label, status: 'running' })
  try {
    const result = await action()
    const outcome = result as
      | { status?: number | null; signal?: string | null }
      | undefined
    const stopped =
      outcome &&
      'status' in outcome &&
      (outcome.status !== 0 || Boolean(outcome.signal))
    save({ phase: label, status: stopped ? 'failed' : 'completed' })
    if (stopped) {
      log('[setup] Stopped: ' + label + '. Retry: ' + retry)
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    save({ phase: label, status: 'failed', message })
    log('[setup] Failed: ' + label + '. ' + message)
    log('[setup] Retry: ' + retry)
    throw error
  }
}
