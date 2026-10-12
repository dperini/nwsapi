import { randomUUID } from 'node:crypto'
import { open, readFile, writeFile, rm, mkdir, rename } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'

export interface WorktreeMetadata {
  schemaVersion: 1
  repository: string
  path: string
  version: 'v2' | 'v3'
  sourceBranch: string
  sourceHead: string
  targetBranch: string
  owner: string
  leaseToken?: string
  releasedToken?: string
  releasedAt?: number
  hostname?: string
}

export async function lockWorktree(parent: string) {
  const file = path.join(parent, '.nwsapi-operation.lock')
  const token = randomUUID()
  let handle
  try {
    handle = await open(file, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `A worktree operation lock already exists at ${file}. Ownership is active or uncertain; inspect the checkout before retrying.`,
      )
    }
    throw error
  }
  try {
    await handle.writeFile(token)
  } finally {
    await handle.close()
  }
  return async () => {
    try {
      if ((await readFile(file, 'utf8')) === token) {
        await rm(file)
      }
    } catch {
      // A replaced or missing lock is never removed by this owner.
    }
  }
}

async function writeMetadata(file: string, value: WorktreeMetadata) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value))
  await rename(temporary, file)
}

export async function claimWorktree(
  metadata: WorktreeMetadata,
  pulsePath = path.join(path.dirname(metadata.path), '.nwsapi-pulse.json'),
  persistMetadata = true,
) {
  const token = randomUUID()
  const ownerHost = hostname()
  const ownedMetadata = { ...metadata, hostname: ownerHost }
  await mkdir(path.dirname(metadata.path), { recursive: true })
  const lockRoot = persistMetadata ? path.dirname(metadata.path) : metadata.path
  const unlock = await lockWorktree(lockRoot)
  const metadataPath = path.join(
    path.dirname(metadata.path),
    '.nwsapi-worktree.json',
  )
  try {
    await mkdir(path.dirname(pulsePath), { recursive: true })
    let pulseFile
    try {
      pulseFile = await open(pulsePath, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(
          `A runner pulse already exists at ${pulsePath}. Another runner may be active, or ownership is uncertain; inspect the checkout before retrying.`,
        )
      }
      throw error
    }
    await pulseFile.writeFile(
      JSON.stringify({
        pid: process.pid,
        token,
        hostname: ownerHost,
        refreshedAt: Date.now(),
      }),
    )
    await pulseFile.close()
    let stored = ownedMetadata
    if (persistMetadata) {
      try {
        stored = JSON.parse(
          await readFile(metadataPath, 'utf8'),
        ) as WorktreeMetadata
        if (
          stored.schemaVersion !== 1 ||
          stored.repository !== metadata.repository ||
          stored.path !== metadata.path ||
          stored.version !== metadata.version ||
          stored.hostname !== ownerHost
        ) {
          throw new Error('Worktree metadata does not match this checkout.')
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          await rm(pulsePath, { force: true })
          throw error
        }
      }
      stored = { ...stored, leaseToken: token }
      delete stored.releasedToken
      delete stored.releasedAt
      await writeMetadata(metadataPath, stored)
    }
    let pending: Promise<void> = Promise.resolve()
    const refresh = async () => {
      const temporary = `${pulsePath}.${token}.tmp`
      await writeFile(
        temporary,
        JSON.stringify({
          pid: process.pid,
          token,
          hostname: ownerHost,
          refreshedAt: Date.now(),
        }),
      )
      const current = JSON.parse(await readFile(pulsePath, 'utf8')) as {
        token?: string
        hostname?: string
      }
      if (current.token !== token || current.hostname !== ownerHost) {
        await rm(temporary, { force: true })
        return
      }
      await rename(temporary, pulsePath)
    }
    await refresh()
    const timer = setInterval(() => {
      pending = pending.then(refresh).catch(() => undefined)
    }, 3000)
    timer.unref()
    await unlock()
    let released = false
    const release = async () => {
      if (released) {
        return
      }
      const releaseLock = await lockWorktree(lockRoot).catch(() => undefined)
      released = true
      clearInterval(timer)
      await pending
      if (!releaseLock) {
        return
      }
      try {
        const pulse = JSON.parse(await readFile(pulsePath, 'utf8')) as {
          token?: string
          hostname?: string
        }
        if (pulse.token === token && pulse.hostname === ownerHost) {
          if (persistMetadata) {
            const current = JSON.parse(
              await readFile(metadataPath, 'utf8'),
            ) as WorktreeMetadata
            if (current.leaseToken === token) {
              current.releasedToken = token
              current.releasedAt = Date.now()
              await writeMetadata(metadataPath, current)
            }
          }
          await rm(pulsePath, { force: true })
        }
      } catch {
        // Uncertain state remains available for a later conservative sweep.
      } finally {
        await releaseLock()
      }
    }
    return { token, release }
  } catch (error) {
    await unlock()
    throw error
  }
}

export async function inspectPulse(metadataPath: string, ttlMs = 10_000) {
  try {
    const pulse = JSON.parse(await readFile(metadataPath, 'utf8')) as {
      pid: number
      token: string
      hostname: string
      refreshedAt: number
    }
    if (
      !Number.isSafeInteger(pulse.pid) ||
      pulse.pid < 1 ||
      !pulse.token ||
      !Number.isFinite(pulse.refreshedAt)
    ) {
      return { active: false, reason: 'invalid' }
    }
    if (!pulse.hostname || pulse.hostname !== hostname()) {
      return { active: false, reason: 'foreign-or-unknown' }
    }
    try {
      process.kill(pulse.pid, 0)
      return {
        active: true,
        expired: Date.now() - pulse.refreshedAt > ttlMs,
        token: pulse.token,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return {
          active: true,
          expired: Date.now() - pulse.refreshedAt > ttlMs,
          token: pulse.token,
        }
      }
      return {
        active: false,
        reason: 'process-dead',
        expired: Date.now() - pulse.refreshedAt > ttlMs,
        token: pulse.token,
      }
    }
  } catch (error) {
    return {
      active: false,
      reason:
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'missing'
          : 'invalid',
    }
  }
}
