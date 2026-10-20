import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import {
  RELEASE,
  readRequest,
  validateStageId,
  validateVersion,
} from './config.mts'
import { prepareRelease } from './git.mts'
import { verifyStage } from './artifact.mts'
import { approveRelease, burnRelease, stageRelease } from './pipeline.mts'
import { approvalStage, npmCommand, npmRead } from './registry.mts'
import { configureTrust } from './trust.mts'

export const HELP = `Usage: pnpm run release <command> [version] [--stage UUID] [--apply]

Package aliases: publish:prepare VERSION, publish:status, publish:verify VERSION --stage UUID,
approve [VERSION] [--stage UUID], publish:trust, publish:login, and release:burn.
Use pnpm run approve. Bare pnpm approve manages dependency permissions.

prepare VERSION   Plan a new v3 candidate. --apply commits, signs, reserves and pushes it.
status            Read the release request and npm stages.
stage             CI-only OIDC upload after qualification. Never approves a stage.
verify VERSION    Compare the npm stage, GitHub release and rebuilt source bytes.
approve [VERSION] [--stage UUID]
                  Discover one exact candidate or verify explicit values.
                  --apply requests proof of presence and publishes.
burn VERSION      Keep the version consumed. --apply records a signed burn and rejects --stage.
trust             Plan environment and stage-only OIDC settings. --apply reconciles them.
login             Sign in to npm for trust configuration, inspection and approval.

Staging never moves latest. Failed candidates require a new version.`

export function releaseArguments(args: string[]) {
  return args[0] === '--' ? args.slice(1) : args
}

export function parseReleaseArgs(args: string[]) {
  const { values, positionals } = parseArgs({
    args: releaseArguments(args),
    allowPositionals: true,
    options: {
      apply: { type: 'boolean', default: false },
      stage: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const [command = 'status', version] = positionals
  if (
    positionals.length > 2 ||
    ![
      'prepare',
      'status',
      'stage',
      'verify',
      'approve',
      'burn',
      'trust',
      'login',
    ].includes(command)
  ) {
    throw new Error(HELP)
  }
  if (!values.help) {
    validateCommandOptions(command, version, values)
  }
  return { command, version, ...values }
}

export function validateCommandOptions(
  command: string,
  version: string | undefined,
  values: { apply: boolean; stage?: string | undefined },
) {
  const versioned = ['prepare', 'verify', 'approve', 'burn'].includes(command)
  if (versioned && (command !== 'approve' || version)) {
    validateVersion(version ?? '')
  }
  if (
    (!versioned && version) ||
    (values.apply &&
      !['prepare', 'approve', 'burn', 'trust'].includes(command)) ||
    (values.stage && !['verify', 'approve', 'burn'].includes(command))
  ) {
    throw new Error(HELP)
  }
  if (command === 'verify' && !values.stage) {
    throw new Error('Verification requires --stage UUID.')
  }
  if (values.stage && !['burn'].includes(command)) {
    validateStageId(values.stage)
  }
}

export function resolveApprovalVersion(
  version: string | undefined,
  requestVersion: string | null,
  manifest: { name?: unknown; version?: unknown },
) {
  if (version) {
    return validateVersion(version)
  }
  if (requestVersion) {
    return validateVersion(requestVersion)
  }
  if (
    manifest.name !== RELEASE.package ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('The package manifest does not identify nwsapi.')
  }
  return validateVersion(manifest.version)
}

export function approvalSession(env = process.env) {
  if (env['CI'] || env['GITHUB_ACTIONS']) {
    throw new Error(
      'Approval must run in the maintainer session with npm proof of presence.',
    )
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const options = parseReleaseArgs(args)
  let result: unknown
  switch (options.command) {
    case 'prepare':
      result = await prepareRelease(options.version!, options.apply)
      break
    case 'stage':
      result = await stageRelease()
      break
    case 'verify':
      result = await verifyStage(options.version!, options.stage!)
      break
    case 'approve': {
      approvalSession()
      const request = readRequest()
      const manifest =
        options.version || request.version
          ? {}
          : (JSON.parse(
              readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
            ) as {
              name?: unknown
              version?: unknown
            })
      const version = resolveApprovalVersion(
        options.version,
        request.version,
        manifest,
      )
      const stage = options.stage
        ? options.stage
        : approvalStage(
            JSON.parse(npmRead(['stage', 'list', RELEASE.package, '--json'])),
            version,
          ).id
      result = await approveRelease(version, stage, options.apply)
      break
    }
    case 'burn':
      result = await burnRelease(options.version!, options.stage, options.apply)
      break
    case 'trust':
      result = configureTrust(options.apply)
      break
    case 'login':
      result = npmCommand(['login'], { interactive: true })
      break
    default:
      result = {
        request: readRequest(),
        stages: JSON.parse(
          npmRead(['stage', 'list', RELEASE.package, '--json']),
        ),
      }
  }
  console.log(JSON.stringify(result, null, 2))
}

if (isMainModule(import.meta.url)) {
  await main()
}
