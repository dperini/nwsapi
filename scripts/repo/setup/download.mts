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
    throw new Error(
      `Tool integrity mismatch: expected ${integrity}, received ${algorithm}-${actual}`,
    )
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

export async function downloadArchive(
  url: string,
  integrity: string,
  cache: string,
  request: typeof fetch = fetch,
) {
  parseIntegrity(integrity)
  if (new URL(url).protocol !== 'https:') {
    throw new Error('External tool downloads require HTTPS.')
  }
  const identity = createHash('sha256').update(integrity).digest('hex')
  const file = path.join(cache, identity)
  const cached = cachedArchive(file, integrity)
  if (cached) {
    return cached
  }
  const response = await request(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) {
    throw new Error(`Tool download failed: HTTP ${response.status} for ${url}`)
  }
  if (response.url && new URL(response.url).protocol !== 'https:') {
    throw new Error('External tool download redirected away from HTTPS.')
  }
  const bytes = Buffer.from(await response.arrayBuffer())
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
