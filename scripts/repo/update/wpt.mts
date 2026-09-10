import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, UPSTREAM_HELPER_PATH } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

const endpoint = 'https://api.github.com/repos/web-platform-tests/wpt'

export function releaseTag(release: {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
}) {
  if (
    release.draft ||
    release.prerelease ||
    !release.tag_name ||
    !/^[\w./-]+$/.test(release.tag_name)
  ) {
    throw new Error(
      'WPT latest release must have a published, non-prerelease tag.',
    )
  }
  return release.tag_name
}

export function releasePin(
  config: string,
  tag: string,
  sha: string,
  hash: string,
) {
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid WPT commit or tree hash.')
  }
  const header =
    /^# \S+ sha256:[a-f0-9]{64}\n(?=\[submodule "upstream\/wpt"\])/m
  if (!header.test(config)) {
    throw new Error('Missing WPT integrity header in .gitmodules.')
  }
  return config
    .replace(
      header,
      () => `# ${releaseTag({ tag_name: tag })} sha256:${hash}\n`,
    )
    .replace(/^# no-release-tag: web-platform-tests.*\n?/m, '')
}

async function github(resource: string) {
  const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN']
  const response = await fetch(`${endpoint}/${resource}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`WPT release lookup failed: HTTP ${response.status}.`)
  }
  return response.json()
}

export async function updateWpt(check = false) {
  const release = await github('releases/latest')
  const tag = releaseTag(release)
  // Resolve the tag itself. target_commitish may name a moving branch.
  const commit = await github(`commits/${encodeURIComponent(tag)}`)
  const sha: string = commit.sha
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('WPT release did not resolve to a commit SHA.')
  }
  const configPath = path.join(REPO_ROOT, '.gitmodules')
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    })
  const current = git([
    'config',
    '--file',
    configPath,
    '--get',
    'submodule.upstream/wpt.ref',
  ]).trim()
  console.log(
    `WPT release ${tag} (${release.published_at}): ${sha}${sha === current ? ' (current)' : ''}`,
  )
  if (check) {
    return
  }
  runNode(UPSTREAM_HELPER_PATH, ['clone', 'upstream/wpt'])
  runNode(UPSTREAM_HELPER_PATH, ['verify', 'upstream/wpt'])
  if (current !== sha) {
    git([
      '-C',
      'upstream/wpt',
      'fetch',
      '--depth=1',
      '--filter=blob:none',
      'origin',
      sha,
    ])
    const tree = git([
      '-C',
      'upstream/wpt',
      '-c',
      'core.quotePath=false',
      'ls-tree',
      '-r',
      sha,
    ])
    const hash = createHash('sha256').update(tree).digest('hex')
    const config = releasePin(readFileSync(configPath, 'utf8'), tag, sha, hash)
    writeFileSync(configPath, config)
    git(['config', '--file', configPath, 'submodule.upstream/wpt.ref', sha])
    runNode(UPSTREAM_HELPER_PATH, ['clone', 'upstream/wpt'])
    runNode(UPSTREAM_HELPER_PATH, ['verify', 'upstream/wpt'])
  }
  const inventory = path.join(
    REPO_ROOT,
    'test/repo/e2e/upstream/inventory.json',
  )
  if (JSON.parse(readFileSync(inventory, 'utf8')).revision !== sha) {
    runNode(path.join(REPO_ROOT, 'scripts/repo/check/wpt/inventory.mts'), [
      '--fetch',
      '--write',
    ])
  }
  runNode(path.join(REPO_ROOT, 'scripts/repo/check/wpt/candidates.mts'), [
    '--write',
  ])
  runNode(path.join(REPO_ROOT, 'scripts/repo/check/wpt/scope.mts'), [])
  console.log(
    'Review the WPT inventory diff and run modern and legacy tests. Failure expectations were not updated.',
  )
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    throw new Error('Usage: update/wpt.mts [--check]')
  }
  await updateWpt(process.argv.includes('--check'))
}
