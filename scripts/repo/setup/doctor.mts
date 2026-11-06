import { REPO_ROOT, DEVELOPER_MENU_COMMAND } from '../lib/paths.mts'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { optional, withDefault } from '@optique/core/modifiers'
import { flag, option } from '@optique/core/primitives'
import { string } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { toolVersions } from '../external-tools.mts'
import { isMainModule } from '../lib/run-node.mts'
import {
  executableOwner,
  cachedToolchainMatches,
  managedEntry,
  managedReady,
  managedVersionProbes,
  meetsMinimum,
  realExecutable,
  resolveExecutable,
  toolVersion,
  wrapperStatus,
} from './diagnostics.mts'
import { setupProgress } from './progress.mts'
import { checkoutReadiness, readinessForTask } from './readiness.mts'
import { preflightVoiceOver } from './voiceover/preflight.mts'
import { nodeMeetsSecurityFloor, nodeSecurityMinimum } from './node-version.mts'

const minimums = { node: '22.23.4', npm: '12.2.0', pnpm: '12.14.0' }

export function toolReports() {
  const probes = managedVersionProbes()
  const versions = {
    node: probes.node.version,
    npm: probes.npm.version,
    pnpm: probes.pnpm.version,
  }
  const ready = managedReady(versions)
  const cachedStateMatches = cachedToolchainMatches()
  const pins = toolVersions()
  return (['node', 'npm', 'pnpm'] as const).map(name => {
    const resolution = resolveExecutable(name)
    const executable = resolution?.executable
    const local = executable === managedEntry(name)
    const version = local
      ? versions[name]
      : executable
        ? toolVersion(executable)
        : undefined
    return {
      name,
      executable,
      resolved: executable ? realExecutable(executable) : undefined,
      pathEntry: resolution ? resolution.index + 1 : undefined,
      version,
      owner: executableOwner(executable),
      minimum: name === 'node' ? nodeSecurityMinimum(version) : minimums[name],
      meetsMinimum:
        name === 'node'
          ? nodeMeetsSecurityFloor(version)
          : meetsMinimum(version, minimums[name]),
      pin: pins[name],
      managedVersion: versions[name],
      probe: probes[name],
      managedReady: ready,
      wrapper: name === 'node' ? 'not applicable' : wrapperStatus(name),
      cachedStateMatches,
    }
  })
}

export function toolDetails(report: ReturnType<typeof toolReports>[number]) {
  return [
    `  executable: ${report.executable ?? 'not found'}`,
    `  resolved: ${report.resolved ?? 'not found'}`,
    `  owner (inferred): ${report.owner}`,
    `  PATH entry: ${report.pathEntry ?? 'none'}`,
    `  version minimum: >=${report.minimum}`,
    `  project pin: ${report.pin}`,
    `  checkout version: ${report.managedVersion ?? 'unavailable'}`,
    `  version probe: exit=${report.probe.status ?? 'null'} signal=${report.probe.signal ?? 'none'} error=${report.probe.errorCode ?? 'none'} output-lines=${report.probe.outputLines} version-format=${report.probe.outputMatchesVersion ? 'matched' : 'unmatched'}`,
    `  cached toolchain state: ${report.cachedStateMatches ? 'matches pins' : 'missing or differs from pins'}`,
    `  Firewall: ${report.wrapper}`,
  ]
}

export function toolStatus(
  report: ReturnType<typeof toolReports>[number],
  ready: boolean,
) {
  const version = report.version ?? 'not found'
  const pin = report.managedVersion ?? report.pin
  if (report.executable === managedEntry(report.name)) {
    return `checkout pin ${pin} active`
  }
  if (ready) {
    return `PATH ${version} (${report.owner}); checkout pin ${pin} ready`
  }
  if (report.executable && !report.meetsMinimum) {
    return `PATH ${version} (${report.owner}) below >=${report.minimum}; setup will install ${pin}`
  }
  return `PATH ${version} (${report.owner}); setup will install ${pin}`
}

export function formatToolReports(
  reports = toolReports(),
  details = false,
  readiness?: Awaited<ReturnType<typeof checkoutReadiness>>,
) {
  const ready = reports.every(report => report.managedReady)
  const lines = [
    ready
      ? 'Toolchain ready. Repository commands can use the pinned checkout tools.'
      : 'Toolchain setup needed. Run node scripts/repo/setup/bootstrap.mts to prepare this checkout.',
  ]
  for (const report of reports) {
    lines.push(`${report.name}: ${toolStatus(report, ready)}`)
    if (details) {
      lines.push(...toolDetails(report))
    }
  }
  lines.push(
    'Version minimums describe external tools. Repository tasks use the pinned runtime and managers together.',
    'External tools and shell defaults stay under their current manager.',
    ready && readiness?.dependencies.ready
      ? `Next: ${DEVELOPER_MENU_COMMAND.join(' ')}`
      : 'Next: node scripts/repo/setup/bootstrap.mts',
  )
  const progress = setupProgress()
  if (progress) {
    lines.push(`Last recorded setup: ${progress.phase} — ${progress.state}`)
  }
  if (!details) {
    lines.push('Details: node scripts/repo/setup/doctor.mts --details')
  } else {
    lines.push(
      'Resolution uses PATH. Shell aliases, functions, and external wrapper contents are not inspected.',
    )
  }
  return lines.join('\n')
}

export async function main(
  args = process.argv.slice(2),
  log = console.log,
  voiceOverProbe = preflightVoiceOver,
) {
  const values = parseDoctorArgs(args)
  if (values === HELP_SHOWN) {
    return 0
  }
  const taskId = values.task
  if (taskId && taskId !== 'guide' && taskId !== 'review') {
    throw new Error('--task must be guide or review.')
  }
  const requestedTask =
    taskId === 'guide' || taskId === 'review' ? taskId : undefined
  return reportReadiness(requestedTask, values.details, log, voiceOverProbe)
}

export function parseDoctorArgs(args: string[]) {
  return runCli(
    object({
      details: withDefault(flag('--details'), false),
      task: optional(option('--task', string())),
    }),
    'setup:check',
    args[0] === '--' ? args.slice(1) : args,
    {
      brief: message`Report setup readiness without changing tools or shell settings.`,
    },
  )
}

export async function reportReadiness(
  taskId: 'guide' | 'review' | undefined,
  details: boolean | undefined,
  log: (message: string) => void,
  voiceOverProbe: typeof preflightVoiceOver,
) {
  const reports = toolReports()
  const toolsReady = reports.every(report => report.managedReady)
  const readiness = await checkoutReadiness(REPO_ROOT, toolsReady)
  const task = taskId ? readinessForTask(readiness, taskId) : undefined
  const dependencyStatus = readiness.dependencies.ready
    ? 'Dependencies ready.'
    : `Dependencies need setup: ${readiness.dependencies.issues.join(' ')}`
  const buildStatus = readiness.build.ready
    ? 'Build outputs ready.'
    : 'Build outputs are incomplete. Review builds them automatically.'
  const taskStatus = task
    ? `Requested task ${taskId}: ${task.ready ? 'ready.' : task.message}`
    : ''
  const voiceOverStatus = details ? formatVoiceOverStatus(voiceOverProbe()) : ''
  log(
    [
      formatToolReports(reports, details, readiness),
      voiceOverStatus,
      dependencyStatus,
      buildStatus,
      taskStatus,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  if (task) {
    return task.ready ? 0 : 1
  }
  return toolsReady && readiness.dependencies.ready ? 0 : 1
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main()
}

export function formatVoiceOverStatus(
  status: ReturnType<typeof preflightVoiceOver>,
) {
  if (!status.supported) {
    return `Optional VoiceOver: unsupported on ${status.platform}.`
  }
  const machine =
    status.machineSetup === 'ready'
      ? 'machine setup detected'
      : status.machineSetup === 'needed'
        ? 'machine setup needed'
        : 'machine setup could not be verified'
  const assets =
    status.assets === 'present'
      ? 'assets available'
      : status.assets === 'missing'
        ? 'assets not installed'
        : 'assets could not be verified'
  const preferences =
    status.localPreferences === 'present'
      ? 'local preferences readable'
      : status.localPreferences === 'missing'
        ? 'local preferences missing'
        : 'local preferences could not be verified'
  return `Optional VoiceOver: ${machine}; ${assets}; ${preferences}; macOS permissions unverified.`
}
