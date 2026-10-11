import { existsSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { parseArgs } from 'node:util'
import { toolVersions } from '../external-tools.mts'
import { isMainModule } from '../lib/run-node.mts'
import {
  executableOwner,
  managedEntry,
  managedReady,
  managedVersions,
  meetsMinimum,
  realExecutable,
  resolveExecutable,
  toolVersion,
  verifiedWrapper,
} from './diagnostics.mts'
import { setupProgress } from './progress.mts'

const minimums = { node: '22.18.0', npm: '12.2.0', pnpm: '12.12.0' }

export function toolReports() {
  const versions = managedVersions()
  const ready = managedReady(versions)
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
      minimum: minimums[name],
      meetsMinimum: meetsMinimum(version, minimums[name]),
      pin: pins[name],
      managedVersion: versions[name],
      managedReady: ready,
      wrapper:
        name === 'node'
          ? 'not applicable'
          : verifiedWrapper(name)
            ? 'checkout wrapper verified'
            : 'checkout wrapper missing or changed',
    }
  })
}

function toolDetails(report: ReturnType<typeof toolReports>[number]) {
  return [
    `  executable: ${report.executable ?? 'not found'}`,
    `  resolved: ${report.resolved ?? 'not found'}`,
    `  owner (inferred): ${report.owner}`,
    `  PATH entry: ${report.pathEntry ?? 'none'}`,
    `  version minimum: >=${report.minimum}`,
    `  project pin: ${report.pin}`,
    `  checkout version: ${report.managedVersion ?? 'unavailable'}`,
    `  Firewall: ${report.wrapper}`,
  ]
}

export function formatToolReports(reports = toolReports(), details = false) {
  const ready = reports.every(report => report.managedReady)
  const lines = [
    ready
      ? 'Toolchain ready. Repository commands can use the pinned checkout tools.'
      : 'Toolchain setup needed. Run pnpm run setup to prepare this checkout.',
  ]
  for (const report of reports) {
    const status = report.meetsMinimum
      ? 'meets version minimum'
      : ready
        ? 'checkout tools cover repository commands'
        : 'setup will provide the project version'
    lines.push(`${report.name}: ${report.version ?? 'unavailable'} — ${status}`)
    if (details) {
      lines.push(...toolDetails(report))
    }
  }
  lines.push(
    'Version minimums describe external tools. Repository tasks use the pinned runtime and managers together.',
    'External tools and shell defaults stay under their current manager.',
    ready && existsSync(path.join(REPO_ROOT, 'node_modules/.modules.yaml'))
      ? 'Next: pnpm run dev to choose documentation or review.'
      : 'Next: pnpm run setup',
  )
  const progress = setupProgress()
  if (progress) {
    lines.push(`Last recorded setup: ${progress.phase} — ${progress.state}`)
  }
  if (!details) {
    lines.push('Details: pnpm run setup:check --details')
  } else {
    lines.push(
      'Resolution uses PATH. Shell aliases, functions, and external wrapper contents are not inspected.',
    )
  }
  return lines.join('\n')
}

export function main(args = process.argv.slice(2), log = console.log) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      details: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    log(
      'Usage: pnpm run setup:check [--details]\nReports toolchain readiness without changing tools or shell settings.',
    )
    return 0
  }
  const reports = toolReports()
  log(formatToolReports(reports, values.details))
  return reports.every(report => report.managedReady) ? 0 : 1
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
