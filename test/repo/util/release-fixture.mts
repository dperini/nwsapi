import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RELEASE } from '../../../scripts/repo/release/config.mts'
import { integrity } from '../../../scripts/repo/release/artifact.mts'
import type { CommandRunner } from '../../../scripts/repo/lib/command.mts'

export const VERSION = '3.0.0-beta.1'
export const COMMIT = 'a'.repeat(40)
export const STAGE = '12345678-1234-1234-1234-123456789abc'
export const BYTES = Buffer.from('packed release fixture')
export const RECEIPT = {
  name: 'nwsapi',
  version: VERSION,
  commit: COMMIT,
  distTag: 'next',
  filename: `nwsapi-${VERSION}.tgz`,
  integrity: integrity(BYTES),
}
export const TRUSTED_ENV = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: RELEASE.repository,
  GITHUB_REF: `refs/heads/${RELEASE.branch}`,
  GITHUB_WORKFLOW_REF: `${RELEASE.repository}/.github/workflows/${RELEASE.workflow}@refs/heads/${RELEASE.branch}`,
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-token',
}

export function releaseFixture(version: string | null = VERSION) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-release-test-'))
  mkdirSync(path.join(root, '.config'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'nwsapi', version: version ?? '2.3.0-prerelease' }),
  )
  writeFileSync(
    path.join(root, '.config/release-request.json'),
    JSON.stringify({ version, distTag: 'next' }),
  )
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

export const gitRunner: CommandRunner = (command, args) => {
  let stdout =
    command === 'gh'
      ? JSON.stringify({
          workflow_runs: [
            { head_sha: COMMIT, status: 'completed', conclusion: 'success' },
          ],
        })
      : ''
  if (command === 'git') {
    if (args[0] === 'rev-parse') {
      stdout = COMMIT
    } else if (args[0] === 'ls-remote') {
      stdout = args[2]?.includes('burned/') ? '' : `${COMMIT}\t${args[2]}`
    } else if (args[0] === 'branch') {
      stdout = RELEASE.branch
    }
  }
  return { status: 0, stdout, stderr: '' }
}

export function registryResponse(status = 404, body: unknown = {}) {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch
}
