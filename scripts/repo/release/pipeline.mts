import { appendFileSync } from 'node:fs'
import { REPO_ROOT } from '../lib/paths.mts'
import { execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import {
  RELEASE,
  assertTrustedEnvironment,
  readRequest,
  releaseTag,
  validateStageId,
} from './config.mts'
import { assertReserved, git, localTag, remoteRef } from './git.mts'
import { packRelease, reserveGithubRelease, verifyStage } from './artifact.mts'
import {
  npmCommand,
  npmRead,
  parseStage,
  publishedVersion,
  uploadStage,
} from './registry.mts'
import { setupEnvironment } from './trust.mts'

export const STAGE_OPERATIONS = {
  packRelease,
  reserveGithubRelease,
  publishedVersion,
  uploadStage,
  setupEnvironment,
}

export async function stageRelease(
  root = REPO_ROOT,
  run: CommandRunner = execute,
  env = process.env,
  operations = STAGE_OPERATIONS,
) {
  assertTrustedEnvironment(env)
  const environment = operations.setupEnvironment(false, root, run)
  if (environment.create || environment.addBranch) {
    throw new Error(
      'Configure the restricted publishing environment with release trust --apply first.',
    )
  }
  const request = readRequest(root)
  if (!request.version) {
    throw new Error('No release was requested.')
  }
  const version = request.version
  const commit = assertReserved(version, root, run)
  if (await operations.publishedVersion(version)) {
    throw new Error(`${version} is already public.`)
  }
  const artifact = await operations.packRelease(version, commit, root, run)
  operations.reserveGithubRelease(
    artifact.directory,
    artifact.receipt,
    root,
    run,
  )
  try {
    const id = operations.uploadStage(artifact.tarball, { run, env })
    if (env['GITHUB_STEP_SUMMARY']) {
      appendFileSync(
        env['GITHUB_STEP_SUMMARY'],
        `Staged \`nwsapi@${version}\` as \`${id}\`.\n\nVerify: \`pnpm run release -- verify ${version} --stage ${id}\`\n\nApprove separately: \`pnpm run release -- approve ${version} --stage ${id} --apply\`\n`,
      )
    }
    return { ...artifact.receipt, stageId: id }
  } catch (cause) {
    throw new Error(
      `${version} remains consumed after a failed stage. Do not retry its upload. Use release burn and prepare a new version.`,
      { cause },
    )
  }
}

export async function approveRelease(
  version: string,
  id: string,
  apply: boolean,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  verify = verifyStage,
  request: typeof fetch = fetch,
) {
  if (process.env['CI'] || process.env['GITHUB_ACTIONS']) {
    throw new Error(
      'Approval must run in the maintainer session with npm proof of presence.',
    )
  }
  const receipt = await verify(version, id, root, run)
  if (!apply) {
    return { ...receipt, approvalRequired: true }
  }
  npmCommand(['stage', 'approve', validateStageId(id)], {
    run,
    interactive: true,
  })
  const published = await publishedVersion(version, request)
  if (
    published?.name !== RELEASE.package ||
    published.version !== version ||
    published.dist?.integrity !== receipt.integrity
  ) {
    throw new Error(
      'Approval returned, but the public registry has not verified the expected bytes. Inspect registry state before another action.',
    )
  }
  return { ...receipt, published: true }
}

export async function burnRelease(
  version: string,
  id: string | undefined,
  apply: boolean,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  request: typeof fetch = fetch,
) {
  const commit = assertReserved(version, root, run, true)
  if (await publishedVersion(version, request)) {
    throw new Error(
      'Public releases cannot be burned or replaced. Prepare a fix with a new version.',
    )
  }
  if (id) {
    parseStage(
      JSON.parse(
        npmRead(['stage', 'view', validateStageId(id), '--json'], { run }),
      ),
      version,
      id,
    )
  }
  const tag = `burned/${releaseTag(version)}`
  if (apply) {
    // Burn first so a failed rejection can never make the version reusable.
    reserveBurn(tag, commit, version, root, run)
    if (id) {
      npmCommand(['stage', 'reject', id], { run, interactive: true })
    }
  }
  return { version, commit, burned: apply, stageId: id }
}

export function reserveBurn(
  tag: string,
  commit: string,
  version: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  if (remoteRef(`refs/tags/${tag}`, root, run)) {
    if (remoteRef(`refs/tags/${tag}^{}`, root, run) !== commit) {
      throw new Error('The existing burn tag references a different commit.')
    }
    return
  }
  if (localTag(tag, root, run)) {
    if (git(['rev-parse', `${tag}^{commit}`], root, run) !== commit) {
      throw new Error('The local burn tag references a different commit.')
    }
    git(['verify-tag', tag], root, run)
  } else {
    git(
      [
        'tag',
        '-s',
        tag,
        commit,
        '-m',
        `Burn nwsapi ${version}. Never reuse this version.`,
      ],
      root,
      run,
    )
  }
  git(['push', 'origin', `refs/tags/${tag}`], root, run)
}
