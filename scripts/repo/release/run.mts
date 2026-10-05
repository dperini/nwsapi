import { parseArgs } from 'node:util'
import { isMainModule } from '../lib/run-node.mts'
import { RELEASE, readRequest, validateVersion } from './config.mts'
import { prepareRelease } from './git.mts'
import { verifyStage } from './artifact.mts'
import { approveRelease, burnRelease, stageRelease } from './pipeline.mts'
import { npmCommand, npmRead } from './registry.mts'
import { configureTrust } from './trust.mts'

export const HELP = `Usage: pnpm run release -- <command> [version] [--stage UUID] [--apply]

Package aliases: npm:publish VERSION, npm:staged, npm:verify VERSION --stage UUID,
npm:approve VERSION --stage UUID, npm:trust, and npm:login.

prepare VERSION   Plan a new v3 candidate. --apply commits, signs, reserves and pushes it.
status            Read the release request and npm stages.
stage             CI-only OIDC upload after qualification. Never approves a stage.
verify VERSION    Compare the npm stage, GitHub release and rebuilt source bytes.
approve VERSION   Verify first. --apply requests npm proof of presence and publishes.
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
  const versioned = ['prepare', 'verify', 'approve', 'burn'].includes(command)
  if (values.help) {
    return { command, version, ...values }
  }
  if (versioned) {
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
  if (['verify', 'approve'].includes(command) && !values.stage) {
    throw new Error('Verification and approval require --stage UUID.')
  }
  return { command, version, ...values }
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
    case 'approve':
      result = await approveRelease(
        options.version!,
        options.stage!,
        options.apply,
      )
      break
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
