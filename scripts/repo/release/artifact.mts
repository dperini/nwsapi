import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { packPackage } from '../build/package.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import {
  RELEASE,
  parseReceipt,
  releaseTag,
  validateStageId,
} from './config.mts'
import type { ReleaseReceipt } from './config.mts'
import { assertReserved } from './git.mts'
import { npmCommand, npmRead, parseStage } from './registry.mts'

export function integrity(bytes: Uint8Array) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export function verifyReleaseBytes(receipt: ReleaseReceipt, bytes: Uint8Array) {
  if (integrity(bytes) !== receipt.integrity) {
    throw new Error(
      'Release tarball integrity mismatch. Burn this version and start a new release.',
    )
  }
}

export async function packRelease(
  version: string,
  commit: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  pack = packPackage,
) {
  const directory = path.join(root, '.cache/release', releaseTag(version))
  mkdirSync(directory, { recursive: true })
  checked(
    process.execPath,
    [path.join(root, 'scripts/repo/build/run.mts')],
    { cwd: root, interactive: true },
    run,
  )
  await pack(directory, root)
  const filename = `nwsapi-${version}.tgz`
  const bytes = readFileSync(path.join(directory, filename))
  const receipt = parseReceipt({
    name: RELEASE.package,
    version,
    commit,
    filename,
    integrity: integrity(bytes),
    distTag: RELEASE.distTag,
  })
  writeFileSync(
    path.join(directory, 'release.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  )
  return { directory, tarball: path.join(directory, filename), receipt }
}

export function reserveGithubRelease(
  directory: string,
  receipt: ReleaseReceipt,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  const tag = releaseTag(receipt.version)
  const notes = path.join(directory, 'notes.md')
  writeFileSync(
    notes,
    `Staged npm candidate for nwsapi ${receipt.version}.\n\nSource: ${receipt.commit}\nIntegrity: ${receipt.integrity}\n\nThis version is reserved. An npm stage requires separate verified approval. Failed or rejected candidates remain consumed.\n`,
  )
  checked(
    'gh',
    [
      'release',
      'create',
      tag,
      path.join(directory, receipt.filename),
      path.join(directory, 'release.json'),
      '--repo',
      RELEASE.repository,
      '--verify-tag',
      '--prerelease',
      '--latest=false',
      '--title',
      `nwsapi ${receipt.version} candidate`,
      '--notes-file',
      notes,
    ],
    { cwd: root },
    run,
  )
}

export function downloadRelease(
  version: string,
  directory: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  checked(
    'gh',
    [
      'release',
      'download',
      releaseTag(version),
      '--repo',
      RELEASE.repository,
      '--dir',
      directory,
      '--pattern',
      'release.json',
      '--pattern',
      `nwsapi-${version}.tgz`,
    ],
    { cwd: root },
    run,
  )
  const receipt = parseReceipt(
    JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8')),
  )
  if (receipt.version !== version) {
    throw new Error('GitHub release receipt has the wrong version.')
  }
  verifyReleaseBytes(
    receipt,
    readFileSync(path.join(directory, receipt.filename)),
  )
  return receipt
}

export function downloadStage(
  id: string,
  directory: string,
  receipt: ReleaseReceipt,
  run: CommandRunner = execute,
) {
  validateStageId(id)
  const before = new Set(readdirSync(directory))
  npmCommand(['stage', 'download', id, '--json'], { cwd: directory, run })
  const files = readdirSync(directory).filter(
    file => !before.has(file) && file.endsWith('.tgz'),
  )
  if (files.length !== 1) {
    throw new Error('npm stage download did not produce one tarball.')
  }
  verifyReleaseBytes(receipt, readFileSync(path.join(directory, files[0]!)))
}

export async function verifyStage(
  version: string,
  id: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  pack = packPackage,
) {
  validateStageId(id)
  const commit = assertReserved(version, root, run)
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-release-verify-'),
  )
  try {
    const receipt = downloadRelease(version, directory, root, run)
    if (receipt.commit !== commit) {
      throw new Error('Release receipt and signed source commit disagree.')
    }
    parseStage(
      JSON.parse(npmRead(['stage', 'view', id, '--json'], { run })),
      version,
      id,
    )
    downloadStage(id, directory, receipt, run)
    const rebuilt = await packRelease(version, commit, root, run, pack)
    verifyReleaseBytes(receipt, readFileSync(rebuilt.tarball))
    return receipt
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
