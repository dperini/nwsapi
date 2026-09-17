import { afterEach, expect, test } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  downloadRelease,
  downloadStage,
  integrity,
  packRelease,
  reserveGithubRelease,
  verifyReleaseBytes,
  verifyStage,
} from '../../../../scripts/repo/release/artifact.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'
import {
  BYTES,
  COMMIT,
  RECEIPT,
  STAGE,
  VERSION,
  gitRunner,
  releaseFixture,
} from '../../util/release-fixture.mts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

async function pack(directory: string) {
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, RECEIPT.filename), BYTES)
  return {}
}

const artifactRunner: CommandRunner = (command, args, options) => {
  if (command === 'gh' && args[1] === 'download') {
    const directory = args[args.indexOf('--dir') + 1]!
    writeFileSync(path.join(directory, 'release.json'), JSON.stringify(RECEIPT))
    writeFileSync(path.join(directory, RECEIPT.filename), BYTES)
  }
  if (args.includes('view')) {
    return {
      status: 0,
      stdout: JSON.stringify({
        id: STAGE,
        packageName: 'nwsapi',
        version: VERSION,
        tag: 'next',
      }),
      stderr: '',
    }
  }
  if (args.includes('download') && command !== 'gh') {
    writeFileSync(path.join(options.cwd, 'stage.tgz'), BYTES)
  }
  return gitRunner(command, args, options)
}

test('reserved, staged and rebuilt tarballs must have identical actual bytes', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  expect(integrity(BYTES)).toBe(RECEIPT.integrity)
  expect(() => verifyReleaseBytes(RECEIPT, Buffer.from('altered'))).toThrow(
    'integrity',
  )
  const artifact = await packRelease(
    VERSION,
    COMMIT,
    fixture.root,
    artifactRunner,
    pack,
  )
  expect(artifact.receipt).toEqual(RECEIPT)
  reserveGithubRelease(
    artifact.directory,
    RECEIPT,
    fixture.root,
    artifactRunner,
  )
  expect(readFileSync(artifact.tarball)).toEqual(BYTES)
  expect(
    downloadRelease(VERSION, artifact.directory, fixture.root, artifactRunner),
  ).toEqual(RECEIPT)
  downloadStage(STAGE, artifact.directory, RECEIPT, artifactRunner)
  expect(
    await verifyStage(VERSION, STAGE, fixture.root, artifactRunner, pack),
  ).toEqual(RECEIPT)
})

test('a changed stage fails before rebuilt content can be approved', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  const altered: CommandRunner = (command, args, options) => {
    const result = artifactRunner(command, args, options)
    if (args.includes('download') && command !== 'gh') {
      writeFileSync(path.join(options.cwd, 'stage.tgz'), 'altered')
    }
    return result
  }
  await expect(
    verifyStage(VERSION, STAGE, fixture.root, altered, pack),
  ).rejects.toThrow('integrity')
})
