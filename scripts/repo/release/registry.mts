import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toolExecutable } from '../external-tools.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import { RELEASE, validateVersion, validateStageId } from './config.mts'

export interface NpmOptions {
  run?: CommandRunner
  cwd?: string
  interactive?: boolean
  trusted?: boolean
  env?: NodeJS.ProcessEnv
}

export function npmCommand(args: string[], options: NpmOptions = {}) {
  const directory =
    options.cwd ?? mkdtempSync(path.join(os.tmpdir(), 'nwsapi-npm-'))
  const env = { ...(options.env ?? process.env) }
  try {
    if (options.trusted) {
      for (const name of Object.keys(env)) {
        if (/^npm_config_/i.test(name)) {
          delete env[name]
        }
      }
      const config = path.join(directory, 'empty.npmrc')
      writeFileSync(config, '')
      env['NPM_CONFIG_USERCONFIG'] = config
      env['NPM_CONFIG_GLOBALCONFIG'] = path.join(
        directory,
        'empty-global.npmrc',
      )
      writeFileSync(env['NPM_CONFIG_GLOBALCONFIG'], '')
    }
    return checked(
      process.execPath,
      [toolExecutable('npm'), ...args, '--registry', RELEASE.registry],
      {
        cwd: directory,
        env,
        interactive: options.interactive ?? false,
      },
      options.run ?? execute,
    )
  } finally {
    if (!options.cwd) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

export async function publishedVersion(
  version: string,
  request: typeof fetch = fetch,
) {
  validateVersion(version)
  const response = await request(
    `${RELEASE.registry}${RELEASE.package}/${version}`,
    { signal: AbortSignal.timeout(30_000) },
  )
  if (response.status === 404) {
    return undefined
  }
  if (!response.ok) {
    throw new Error(`Registry lookup failed: HTTP ${response.status}`)
  }
  return (await response.json()) as {
    name?: string
    version?: string
    dist?: { integrity?: string }
  }
}

export function parseStage(value: unknown, version: string, id?: string) {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing npm stage details.')
  }
  const stage = value as {
    id?: string
    stageId?: string
    packageName?: string
    version?: string
    tag?: string
  }
  const stageId = validateStageId(stage.id ?? stage.stageId ?? '')
  if (
    stage.packageName !== RELEASE.package ||
    stage.version !== version ||
    stage.tag !== RELEASE.distTag ||
    (id && stageId !== id)
  ) {
    throw new Error(
      'npm stage does not match the requested package, version, tag, or UUID.',
    )
  }
  return { ...stage, id: stageId }
}

export function uploadStage(tarball: string, options: NpmOptions = {}) {
  const output = npmCommand(
    [
      'stage',
      'publish',
      tarball,
      '--tag',
      RELEASE.distTag,
      '--access',
      'public',
      '--provenance',
      '--ignore-scripts',
      '--json',
    ],
    { ...options, trusted: true },
  )
  const data = JSON.parse(output) as Record<string, { stageId?: string }>
  return validateStageId(data[RELEASE.package]?.stageId ?? '')
}

export function npmRead(args: string[], options: NpmOptions = {}) {
  try {
    return npmCommand(args, options)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/\bEOTP\b|one-time pass/i.test(error.message)
    ) {
      throw error
    }
    // Authenticate the read in the terminal, then reuse npm's proof-of-presence window.
    npmCommand(args, { ...options, interactive: true })
    return npmCommand(args, options)
  }
}
