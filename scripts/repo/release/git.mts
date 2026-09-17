import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import { RELEASE, releaseTag, validateVersion } from './config.mts'
import { publishedVersion } from './registry.mts'

export function git(
  args: string[],
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  return checked('git', args, { cwd: root }, run)
}

export function assertClean(root = REPO_ROOT, run: CommandRunner = execute) {
  if (git(['status', '--porcelain'], root, run)) {
    throw new Error('Release operations require a clean working tree.')
  }
}

export function remoteRef(
  ref: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  const output = git(['ls-remote', 'origin', ref], root, run)
  return output.split(/\s/)[0] || undefined
}

export function assertReserved(
  version: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  allowBurned = false,
) {
  const tag = releaseTag(version)
  assertClean(root, run)
  const head = git(['rev-parse', 'HEAD'], root, run)
  const commit = git(['rev-parse', `${tag}^{commit}`], root, run)
  if (
    head !== commit ||
    remoteRef(`refs/tags/${tag}^{}`, root, run) !== commit
  ) {
    throw new Error(`Check out the exact signed release commit at ${tag}.`)
  }
  const signature = run('git', ['verify-tag', tag], { cwd: root })
  if (signature.status !== 0) {
    const object = git(['rev-parse', tag], root, run)
    const details = JSON.parse(
      checked(
        'gh',
        ['api', `repos/${RELEASE.repository}/git/tags/${object}`],
        { cwd: root },
        run,
      ),
    ) as { verification?: { verified?: boolean }; object?: { sha?: string } }
    if (
      details.verification?.verified !== true ||
      details.object?.sha !== commit
    ) {
      throw new Error(
        'The reserved release tag does not have a verified signature.',
      )
    }
  }
  if (!allowBurned && remoteRef(`refs/tags/burned/${tag}`, root, run)) {
    throw new Error(`${tag} was burned. Start a new version.`)
  }
  const pkg = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { name: string; version: string }
  if (pkg.name !== RELEASE.package || pkg.version !== version) {
    throw new Error('Release tag and package manifest disagree.')
  }
  return commit
}

export function assertQualified(
  commit: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  for (const workflow of ['node.js.yml', 'coverage.yml']) {
    const response = JSON.parse(
      checked(
        'gh',
        [
          'api',
          `repos/${RELEASE.repository}/actions/workflows/${workflow}/runs?head_sha=${commit}&branch=${RELEASE.branch}&event=push&per_page=1`,
        ],
        { cwd: root },
        run,
      ),
    ) as {
      workflow_runs?: Array<{
        head_sha: string
        status: string
        conclusion: string
      }>
    }
    const latest = response.workflow_runs?.[0]
    if (
      latest?.head_sha !== commit ||
      latest.status !== 'completed' ||
      latest.conclusion !== 'success'
    ) {
      throw new Error(
        `Wait for successful ${workflow} checks on ${commit} before reserving a release.`,
      )
    }
  }
}

export function localTag(
  tag: string,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  return git(['tag', '--list', tag], root, run) !== ''
}

export async function prepareRelease(
  version: string,
  apply: boolean,
  root = REPO_ROOT,
  run: CommandRunner = execute,
  request: typeof fetch = fetch,
) {
  validateVersion(version)
  assertClean(root, run)
  if (git(['branch', '--show-current'], root, run) !== RELEASE.branch) {
    throw new Error(`Prepare releases on ${RELEASE.branch}.`)
  }
  const head = git(['rev-parse', 'HEAD'], root, run)
  if (remoteRef(`refs/heads/${RELEASE.branch}`, root, run) !== head) {
    throw new Error('Push and validate the current prerelease commit first.')
  }
  const tag = releaseTag(version)
  if (
    localTag(tag, root, run) ||
    remoteRef(`refs/tags/${tag}`, root, run) ||
    (await publishedVersion(version, request))
  ) {
    throw new Error(`${version} is already consumed. Choose a new version.`)
  }
  assertQualified(head, root, run)
  const plan = {
    version,
    distTag: RELEASE.distTag,
    branch: RELEASE.branch,
    tag,
    source: head,
  }
  if (!apply) {
    return plan
  }
  const file = path.join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  pkg.version = version
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  writeFileSync(
    path.join(root, '.config/release-request.json'),
    JSON.stringify({ version, distTag: RELEASE.distTag }, null, 2) + '\n',
  )
  git(['add', '--', 'package.json', '.config/release-request.json'], root, run)
  git(
    ['commit', '-S', '-m', `release: reserve ${version} for staged approval`],
    root,
    run,
  )
  git(
    [
      'tag',
      '-s',
      tag,
      '-m',
      `Reserve nwsapi ${version}. This version remains consumed if staging fails or is rejected.`,
    ],
    root,
    run,
  )
  git(
    [
      'push',
      '--atomic',
      'origin',
      `HEAD:refs/heads/${RELEASE.branch}`,
      `refs/tags/${tag}`,
    ],
    root,
    run,
  )
  return plan
}
