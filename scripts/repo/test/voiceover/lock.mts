import { randomUUID } from 'node:crypto'
import { open, readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface SessionLock {
  path: string
  token: string
  release(): Promise<void>
}

export async function acquireSessionLock(
  uid = process.getuid?.(),
  temporaryDirectory = os.tmpdir(),
): Promise<SessionLock> {
  if (uid === undefined) {
    throw new Error('Cannot identify this user for the VoiceOver session lock.')
  }
  const file = path.join(temporaryDirectory, `nwsapi-voiceover-${uid}.lock`)
  const token = randomUUID()
  const handle = await open(file, 'wx', 0o600).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `A VoiceOver narration session or recovery is already recorded at ${file}. Review it before retrying.`,
      )
    }
    throw error
  })
  try {
    await handle.writeFile(
      JSON.stringify({
        schemaVersion: 1,
        token,
        pid: process.pid,
        hostname: os.hostname(),
        createdAt: new Date().toISOString(),
      }),
    )
    await handle.sync()
  } finally {
    await handle.close()
  }
  return {
    path: file,
    token,
    async release() {
      const current = JSON.parse(await readFile(file, 'utf8')) as {
        token?: string
      }
      if (current.token !== token) {
        throw new Error('VoiceOver session lock ownership changed.')
      }
      await unlink(file)
    },
  }
}
