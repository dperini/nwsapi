import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const DEVELOPER_STATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface DeveloperState {
  schemaVersion: 1
  checkout: string
  revision: string
  taskId: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  exitCode: number | null
  signal: string | null
  updatedAt: string
}

export interface DeveloperStateIdentity {
  checkout: string
  revision: string
}

const STATE_NAME = 'developer-state.json'
const ALLOWED_KEYS = new Set([
  'schemaVersion',
  'checkout',
  'revision',
  'taskId',
  'status',
  'exitCode',
  'signal',
  'updatedAt',
])

export function readDeveloperState(
  root: string,
  identity: DeveloperStateIdentity,
  taskIds: readonly string[],
  now = Date.now(),
): DeveloperState | undefined {
  try {
    const file = path.join(root, '.cache', STATE_NAME)
    const stats = lstatSync(file)
    if (!stats.isFile() || stats.size > 4096) {
      return undefined
    }
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!validState(value, taskIds) || value.checkout !== identity.checkout) {
      return undefined
    }
    const updatedAt = Date.parse(value.updatedAt)
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt > now + 5 * 60 * 1000 ||
      now - updatedAt > DEVELOPER_STATE_MAX_AGE_MS
    ) {
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}

export function writeDeveloperState(
  root: string,
  identity: DeveloperStateIdentity,
  value: Omit<DeveloperState, 'schemaVersion' | 'checkout' | 'revision'>,
) {
  const cache = path.join(root, '.cache')
  mkdirSync(cache, { recursive: true, mode: 0o700 })
  const realRoot = realpathSync(root)
  const realCache = realpathSync(cache)
  const relative = path.relative(realRoot, realCache)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Developer state cache must stay inside the checkout.')
  }
  const state: DeveloperState = {
    schemaVersion: 1,
    checkout: identity.checkout,
    revision: identity.revision,
    ...value,
  }
  const target = path.join(cache, STATE_NAME)
  const temporary = path.join(cache, `${STATE_NAME}.${randomUUID()}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  try {
    renameSync(temporary, target)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // The randomized temporary file is owned by this write operation.
    }
    throw error
  }
  return state
}

function validState(
  value: unknown,
  taskIds: readonly string[],
): value is DeveloperState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !ALLOWED_KEYS.has(key))) {
    return false
  }
  return (
    record['schemaVersion'] === 1 &&
    typeof record['checkout'] === 'string' &&
    typeof record['revision'] === 'string' &&
    typeof record['taskId'] === 'string' &&
    taskIds.includes(record['taskId']) &&
    ['running', 'completed', 'failed', 'stopped'].includes(
      record['status'] as string,
    ) &&
    (record['exitCode'] === null || Number.isInteger(record['exitCode'])) &&
    (record['signal'] === null || typeof record['signal'] === 'string') &&
    typeof record['updatedAt'] === 'string'
  )
}
