import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  createPreferenceSnapshot,
  loadPreferenceSnapshot,
  preferencePaths,
  restorePreferenceSnapshot,
} from '../../../../../scripts/repo/test/voiceover/snapshot.mts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(root => rm(root, { recursive: true, force: true })),
  )
})

test('snapshots and restores five file, link, and absent preference nodes', async () => {
  const { home, backupRoot, paths } = await fixture()
  await mkdir(path.dirname(paths[0]!), { recursive: true })
  await writeFile(paths[0]!, 'local', { mode: 0o640 })
  await writeFile(paths[1]!, 'portable')
  await symlink('portable-target', paths[2]!)
  const snapshot = await createPreferenceSnapshot({
    home,
    release: '24.0.0',
    backupRoot,
    id: 'session-a',
  })
  await writeFile(paths[0]!, 'changed')
  await rm(paths[1]!)
  await rm(paths[2]!)
  await writeFile(paths[3]!, 'new')
  const identity = { home, release: '24.0.0' }
  await restorePreferenceSnapshot(
    await loadPreferenceSnapshot(snapshot.root, identity),
    identity,
  )
  expect(await readFile(paths[0]!, 'utf8')).toBe('local')
  expect((await stat(paths[0]!)).mode & 0o777).toBe(0o640)
  expect(await readFile(paths[1]!, 'utf8')).toBe('portable')
  expect(
    await import('node:fs/promises').then(fs => fs.readlink(paths[2]!)),
  ).toBe('portable-target')
  await expect(readFile(paths[3]!)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(paths[4]!)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('restores an initially absent local preference file', async () => {
  const { home, backupRoot, paths } = await fixture('23.6.0')
  await mkdir(path.dirname(paths[0]!), { recursive: true })
  const snapshot = await createPreferenceSnapshot({
    home,
    release: '23.6.0',
    backupRoot,
    id: 'session-b',
  })
  await writeFile(paths[0]!, 'created during start')
  await restorePreferenceSnapshot(snapshot, { home, release: '23.6.0' })
  await expect(readFile(paths[0]!)).rejects.toMatchObject({ code: 'ENOENT' })
})

test.each(['symlink', 'directory'] as const)(
  'rejects an unsafe local plist represented by a %s',
  async kind => {
    const { home, backupRoot, paths } = await fixture()
    await mkdir(path.dirname(paths[0]!), { recursive: true })
    if (kind === 'symlink') {
      await symlink('target', paths[0]!)
    } else {
      await mkdir(paths[0]!)
    }
    await expect(
      createPreferenceSnapshot({
        home,
        release: '24.1.0',
        backupRoot,
        id: `unsafe-${kind}`,
      }),
    ).rejects.toThrow()
  },
)

test('rejects a corrupt or path-tampered recovery manifest', async () => {
  const { home, backupRoot } = await fixture()
  const snapshot = await createPreferenceSnapshot({
    home,
    release: '24.1.0',
    backupRoot,
    id: 'session-c',
  })
  const manifest = path.join(snapshot.root, 'snapshot.json')
  const value = JSON.parse(await readFile(manifest, 'utf8')) as {
    nodes: Array<{ path: string }>
  }
  value.nodes[0]!.path = path.join(home, '..', 'outside')
  await writeFile(manifest, JSON.stringify(value))
  await expect(
    loadPreferenceSnapshot(snapshot.root, { home, release: '24.1.0' }),
  ).rejects.toThrow('paths are invalid')
  await expect(
    loadPreferenceSnapshot(path.join(backupRoot, 'missing'), {
      home,
      release: '24.0.0',
    }),
  ).rejects.toThrow()
})

async function fixture(release = '24.0.0') {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-voiceover-snapshot-'),
  )
  temporaryRoots.push(root)
  const home = path.join(root, 'home')
  const backupRoot = path.join(root, 'backup')
  const paths = preferencePaths(home, release)
  await mkdir(backupRoot)
  return { home, backupRoot, paths }
}
