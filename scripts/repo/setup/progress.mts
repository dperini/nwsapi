import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

export type Progress = {
  phase: string
  state: 'running' | 'complete' | 'paused'
  updated: string
  elapsedMs?: number
}
const progressPath = path.join(REPO_ROOT, '.cache/setup-progress.json')

export function recordSetupProgress(
  phase: string,
  state: Progress['state'],
  elapsedMs?: number,
) {
  try {
    mkdirSync(path.dirname(progressPath), { recursive: true })
    writeFileSync(
      progressPath,
      JSON.stringify({
        phase,
        state,
        updated: new Date().toISOString(),
        ...(elapsedMs === undefined ? {} : { elapsedMs }),
      }) + '\n',
    )
  } catch {
    // A missing progress file must not prevent setup or its recovery message.
  }
}

export function setupProgress(): Progress | undefined {
  try {
    const progress = JSON.parse(readFileSync(progressPath, 'utf8')) as Progress
    if (
      typeof progress.phase === 'string' &&
      ['running', 'complete', 'paused'].includes(progress.state)
    ) {
      return progress
    }
  } catch {
    // Setup can start without a previous progress record.
  }
  return undefined
}
