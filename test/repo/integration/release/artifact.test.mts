import { expect, test } from 'vitest'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  packRelease,
  integrity,
} from '../../../../scripts/repo/release/artifact.mts'
import { packageFiles } from '../../../../.config/build.config.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { COMMIT, VERSION } from '../../util/release-fixture.mts'

test('real staged package tarballs reproduce the exact bytes used by release verification', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-release-pack-'))
  try {
    for (const file of [
      ...packageFiles.map(entry => entry.output),
      'LICENSE',
      'README.md',
    ]) {
      const target = path.join(root, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(path.join(REPO_ROOT, file), target)
    }
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    )
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ ...pkg, version: VERSION }),
    )
    // The suite already built dist. Keep this fixture focused on real packaging.
    const run = () => ({ status: 0, stdout: '', stderr: '' })
    const first = await packRelease(VERSION, COMMIT, root, run)
    const bytes = readFileSync(first.tarball)
    rmSync(first.directory, { recursive: true })
    const second = await packRelease(VERSION, COMMIT, root, run)
    expect(second.receipt).toEqual(first.receipt)
    expect(readFileSync(second.tarball)).toEqual(bytes)
    expect(second.receipt.integrity).toBe(integrity(bytes))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
