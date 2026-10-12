import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { acquireSessionLock } from '../../../../../scripts/repo/test/voiceover/lock.mts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(root => rm(root, { recursive: true, force: true })),
  )
})

test('serializes sessions and releases only the matching token', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nwsapi-voiceover-lock-'))
  temporaryRoots.push(root)
  const lock = await acquireSessionLock(501, root)
  await expect(acquireSessionLock(501, root)).rejects.toThrow(
    'already recorded',
  )
  await writeFile(lock.path, JSON.stringify({ token: 'replacement' }))
  await expect(lock.release()).rejects.toThrow('ownership changed')
  expect(JSON.parse(await readFile(lock.path, 'utf8')).token).toBe(
    'replacement',
  )
})

test('does not treat an existing stale lock as free', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nwsapi-voiceover-lock-'))
  temporaryRoots.push(root)
  const lock = path.join(root, 'nwsapi-voiceover-502.lock')
  await writeFile(lock, JSON.stringify({ pid: 1, token: 'stale' }), {
    mode: 0o600,
  })
  await expect(acquireSessionLock(502, root)).rejects.toThrow(
    'already recorded',
  )
  expect(JSON.parse(await readFile(lock, 'utf8')).token).toBe('stale')
})
