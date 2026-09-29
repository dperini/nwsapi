import { parseArgs } from 'node:util'
import { npm, validateStageId, validateVersion } from './lib.mjs'
import { approveRelease, dispatchRelease, finalizeRelease, npmRead, rejectRelease, stageRelease, verifyRelease } from './pipeline.mjs'
import { setupRelease } from './setup.mjs'

const help = `Usage: pnpm run release -- <command> [options]

  dry-run [--release-as patch|minor|2.x.y] [--tag latest|v2]
      Pack and test locally without reserving or uploading a version.
  dispatch [--release-as patch|minor|2.x.y] [--tag latest|v2] [--dry-run]
      Start the workflow on master; --dry-run qualifies without uploading.
  stage [--release-as patch|minor|2.x.y] [--tag latest|v2] [--dry-run]
      CI-only: reserve a version, save its artifacts, and stage through OIDC.
  verify <2.x.y> --stage <UUID>
      Check the reserved source, npm stage, tarball bytes, and regressions.
  approve <2.x.y> --stage <UUID> [--dry-run]
      Verify, approve with npm proof of presence, and publish the GitHub release.
  finalize <2.x.y>
      Finish the GitHub release after verifying the public npm bytes.
  reject <2.x.y> --stage <UUID>
      Reject an exact stage while keeping its version reserved.
  staged
      List pending nwsapi stages. Requires npm authentication.
  login
      Sign in using the pinned npm CLI and its normal browser/2FA flow.
`

try {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, strict: true,
    options: {
      'release-as': { type: 'string' }, tag: { type: 'string' },
      stage: { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  const [command, version] = positionals
  if (values.help || !command) {
    console.log(help)
  } else {
    const versionCommand = ['verify', 'approve', 'finalize', 'reject'].includes(command)
    if (positionals.length !== (versionCommand ? 2 : 1)) throw new Error(help)
    if (versionCommand) validateVersion(version)
    if (['verify', 'approve', 'reject'].includes(command)) validateStageId(values.stage)
    if ((values['release-as'] || values.tag) && !['dry-run', 'dispatch', 'stage'].includes(command)) throw new Error('Release target options only apply to dry-run, dispatch, and stage.')
    if (values.stage && !['verify', 'approve', 'reject'].includes(command)) throw new Error('--stage only applies to verify, approve, and reject.')
    if (values['dry-run'] && !['dry-run', 'dispatch', 'stage', 'approve'].includes(command)) throw new Error('--dry-run is not supported for this command.')
    const options = { releaseAs: values['release-as'] || 'patch', tag: values.tag || 'latest', dryRun: values['dry-run'] }
    setupRelease()
    switch (command) {
      case 'dry-run': await stageRelease({ ...options, dryRun: true }); break
      case 'dispatch': dispatchRelease(options); break
      case 'stage': await stageRelease(options); break
      case 'verify': await verifyRelease(version, values.stage); break
      case 'approve': await approveRelease(version, values.stage, values['dry-run']); break
      case 'finalize': await finalizeRelease(version); break
      case 'reject': await rejectRelease(version, values.stage); break
      case 'login': npm(['login'], { interactive: true }); break
      case 'staged':
        npmRead(['whoami'])
        console.log(npmRead(['stage', 'list', 'nwsapi', '--json']))
        break
      default: throw new Error(help)
    }
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
