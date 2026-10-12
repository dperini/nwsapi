import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { setTimeout as timerDelay } from 'node:timers/promises'

class IntegrityError extends Error {}

export function parseIntegrity(integrity: string) {
  const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(integrity)
  if (!match) {
    throw new Error('Expected a pinned SHA-256 or SHA-512 SRI digest.')
  }
  const algorithm = match[1]!
  const expected = match[2]!
  const bytes = Buffer.from(expected, 'base64')
  if (
    bytes.length !== (algorithm === 'sha256' ? 32 : 64) ||
    bytes.toString('base64') !== expected
  ) {
    throw new Error('Invalid external tool integrity digest.')
  }
  return { algorithm, expected }
}

export function verifyIntegrity(bytes: Uint8Array, integrity: string) {
  const { algorithm, expected } = parseIntegrity(integrity)
  const actual = createHash(algorithm).update(bytes).digest('base64')
  if (actual !== expected) {
    throw new IntegrityError(
      `Tool integrity mismatch: expected ${integrity}, received ${algorithm}-${actual}`,
    )
  }
}

function safeDownloadLocation(value: string) {
  const target = new URL(value)
  return `${target.origin}${target.pathname}`
}

function errorLabel(value: unknown) {
  if (!(value instanceof Error)) {
    return typeof value
  }
  const code =
    'code' in value && typeof value.code === 'string' ? ` (${value.code})` : ''
  return `${value.name}${code}`
}

function downloadFailure(value: unknown) {
  if (value instanceof Error && value.cause !== undefined) {
    return `${errorLabel(value)}; cause ${errorLabel(value.cause)}`
  }
  return errorLabel(value)
}

function transportResetCode(value: unknown) {
  const visited = new Set<unknown>()
  let current = value
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current)
    if (
      'code' in current &&
      (current.code === 'ECONNRESET' || current.code === 'UND_ERR_SOCKET')
    ) {
      return current.code
    }
    current = current.cause
  }
  return undefined
}

export type DownloadDelay = (
  milliseconds: number,
  signal: AbortSignal,
) => Promise<void>

function waitForRetry(milliseconds: number, signal: AbortSignal) {
  return timerDelay(milliseconds, undefined, { signal }).then(() => undefined)
}

function canRetry(error: unknown, attempt: number, signal: AbortSignal) {
  return (
    attempt < 3 && !signal.aborted && transportResetCode(error) !== undefined
  )
}

async function retryDownload(
  error: unknown,
  stage: 'headers' | 'body',
  attempt: number,
  location: string,
  signal: AbortSignal,
  delay: DownloadDelay,
  report: (message: string) => void,
) {
  if (!canRetry(error, attempt, signal)) {
    return false
  }
  const wait = attempt === 1 ? 250 : 750
  report(
    `Retrying tool download (${attempt + 1}/3) after ${transportResetCode(error)} during ${stage} for ${location}.`,
  )
  await delay(wait, signal)
  return !signal.aborted
}

function requestFailure(location: string, error: unknown, stage: string) {
  return new Error(
    `Tool download ${stage} failed for ${location}: ${downloadFailure(error)}.`,
  )
}

async function fetchAttempt(
  url: string,
  location: string,
  signal: AbortSignal,
  request: typeof fetch,
  attempt: number,
  delay: DownloadDelay,
  report: (message: string) => void,
) {
  let response: Response
  try {
    response = await request(url, {
      // Synchronous extraction can leave an idle socket closed before fetch notices.
      // Each pinned archive gets a fresh connection, including redirect hops.
      headers: { Connection: 'close' },
      signal,
    })
  } catch (error) {
    if (
      await retryDownload(
        error,
        'headers',
        attempt,
        location,
        signal,
        delay,
        report,
      )
    ) {
      return undefined
    }
    throw requestFailure(location, error, 'request')
  }
  if (!response.ok) {
    throw new Error(
      `Tool download failed: HTTP ${response.status} for ${location}`,
    )
  }
  if (response.url && new URL(response.url).protocol !== 'https:') {
    throw new Error('External tool download redirected away from HTTPS.')
  }
  try {
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (
      await retryDownload(
        error,
        'body',
        attempt,
        location,
        signal,
        delay,
        report,
      )
    ) {
      return undefined
    }
    throw requestFailure(location, error, 'body')
  }
}

export function cachedArchive(file: string, integrity: string) {
  try {
    if (!lstatSync(file).isFile()) {
      throw new Error(`Tool archive cache is not a regular file: ${file}`)
    }
    const bytes = readFileSync(file)
    verifyIntegrity(bytes, integrity)
    return bytes
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    return undefined
  }
}

function reusableArchive(file: string, integrity: string) {
  try {
    return cachedArchive(file, integrity)
  } catch (error) {
    if (!(error instanceof IntegrityError)) {
      throw error
    }
    rmSync(file, { force: true })
    return undefined
  }
}

export async function downloadArchive(
  url: string,
  integrity: string,
  cache: string,
  request: typeof fetch = fetch,
  delay: DownloadDelay = waitForRetry,
  report: (message: string) => void = message => console.error(message),
) {
  parseIntegrity(integrity)
  if (new URL(url).protocol !== 'https:') {
    throw new Error('External tool downloads require HTTPS.')
  }
  const identity = createHash('sha256').update(integrity).digest('hex')
  const file = path.join(cache, identity)
  const cached = reusableArchive(file, integrity)
  if (cached) {
    return cached
  }
  const location = safeDownloadLocation(url)
  const signal = AbortSignal.timeout(120_000)
  let bytes: Buffer | undefined
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal.aborted) {
      throw requestFailure(location, signal.reason, 'request')
    }
    bytes = await fetchAttempt(
      url,
      location,
      signal,
      request,
      attempt,
      delay,
      report,
    )
    if (bytes) {
      break
    }
  }
  if (!bytes) {
    throw new Error(`Tool download produced no bytes for ${location}.`)
  }
  verifyIntegrity(bytes, integrity)
  mkdirSync(cache, { recursive: true })
  const staging = mkdtempSync(path.join(cache, '.download-'))
  try {
    const staged = path.join(staging, 'archive')
    writeFileSync(staged, bytes, { mode: 0o600, flag: 'wx' })
    renameSync(staged, file)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return bytes
}
