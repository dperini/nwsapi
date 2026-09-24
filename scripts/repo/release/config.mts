import { readFileSync } from 'node:fs'
import path from 'node:path'
import { valid, major } from 'semver'
import { REPO_ROOT } from '../lib/paths.mts'
import { validate as validateRequest } from '../../../.config/generated/release-request.mts'
import { validate as validateReceipt } from '../../../.config/generated/release-receipt.mts'

export const RELEASE = Object.freeze({
  package: 'nwsapi',
  repository: 'dperini/nwsapi',
  branch: 'prerelease/3.0.0',
  workflow: 'publish-npm.yml',
  environment: 'publish-npm',
  registry: 'https://registry.npmjs.org/',
  distTag: 'next',
})

export interface ReleaseRequest {
  version: string | null
  distTag: string
}

export interface ReleaseReceipt {
  version: string
  name: string
  commit: string
  integrity: string
  distTag: string
  filename: string
}

export function validateVersion(version: string) {
  if (
    valid(version) !== version ||
    major(version) !== 3 ||
    version.includes('+')
  ) {
    throw new Error(
      'Use an exact version in the 3.x line without build metadata.',
    )
  }
  return version
}

export function validateStageId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new Error('Use the exact npm stage UUID.')
  }
  return id
}

export function releaseTag(version: string) {
  return `v${validateVersion(version)}`
}

export function readRequest(root = REPO_ROOT): ReleaseRequest {
  const value: unknown = JSON.parse(
    readFileSync(path.join(root, '.config/release-request.json'), 'utf8'),
  )
  if (!validateRequest(value).valid) {
    throw new Error(
      'Invalid release request. The v3 release line must use next.',
    )
  }
  const request = value as ReleaseRequest
  if (request.version !== null) {
    validateVersion(request.version)
  }
  return request
}

export function parseReceipt(value: unknown): ReleaseReceipt {
  if (!validateReceipt(value).valid) {
    throw new Error('Missing release receipt.')
  }
  const receipt = value as ReleaseReceipt
  validateVersion(receipt.version)
  if (
    receipt.name !== RELEASE.package ||
    receipt.distTag !== RELEASE.distTag ||
    !/^[a-f0-9]{40}$/.test(receipt.commit) ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(receipt.integrity) ||
    receipt.filename !== `nwsapi-${receipt.version}.tgz`
  ) {
    throw new Error('Invalid release receipt identity or integrity.')
  }
  return receipt
}

export function assertTrustedEnvironment(env = process.env) {
  const expectedRef = `refs/heads/${RELEASE.branch}`
  if (
    env['GITHUB_ACTIONS'] !== 'true' ||
    env['GITHUB_REPOSITORY'] !== RELEASE.repository ||
    env['GITHUB_REF'] !== expectedRef ||
    env['GITHUB_WORKFLOW_REF'] !==
      `${RELEASE.repository}/.github/workflows/${RELEASE.workflow}@${expectedRef}` ||
    !env['ACTIONS_ID_TOKEN_REQUEST_URL'] ||
    !env['ACTIONS_ID_TOKEN_REQUEST_TOKEN']
  ) {
    throw new Error(
      'Staging requires the prerelease publish workflow and GitHub OIDC.',
    )
  }
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      (/^(NODE_AUTH_TOKEN|NPM_TOKEN)$/i.test(name) ||
        /^npm_config_.*(?:auth|token|password)/i.test(name))
    ) {
      throw new Error(
        'Remove npm tokens and authentication overrides before OIDC staging.',
      )
    }
  }
}
