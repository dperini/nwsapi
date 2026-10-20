import { execFileSync } from 'node:child_process'
import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import manifest from '../../.config/node-interop.json' with { type: 'json' }
import { toolExecutable } from './external-tools.mts'
import { isMainModule } from './lib/run-node.mts'
import { miseEnvironment, nubRequest, MISE_ROOT } from './setup/mise.mts'

export function nodeInteropVersions(versions = manifest.versions) {
  if (
    !versions.length ||
    versions.some(version => !/^\d+\.\d+\.\d+$/.test(version)) ||
    new Set(versions).size !== versions.length
  ) {
    throw new Error('Node interoperability requires unique, exact versions.')
  }
  return versions
}

export const NODE_INTEROP_VERSIONS = nodeInteropVersions()

export function nodeInteropEnvironment(env = process.env) {
  const result = { ...env }
  // Shell overrides and loaders must not change the runtime being tested.
  delete result['NODE_EXECUTABLE']
  delete result['NODE_OPTIONS']
  delete result['NODE_PATH']
  return result
}

export function installNodeVersions(versions = NODE_INTEROP_VERSIONS) {
  const request = nubRequest(['node', 'install', ...versions])
  execFileSync(request.command, request.args, {
    cwd: MISE_ROOT,
    env: miseEnvironment(),
    stdio: 'inherit',
  })
}

export function nodeSetupPlan(versions = NODE_INTEROP_VERSIONS) {
  const selected = nodeInteropVersions(versions)
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/node',
    versions: selected,
    targets: selected.map(version =>
      path.join(MISE_ROOT, 'installs/node', version),
    ),
  }
}

export function describeNodeSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/node',
    description:
      'Install the exact Node versions used by interoperability tests.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log('Usage: pnpm run setup:node [--dry-run]')
    return
  }
  if (values.describe) {
    const description = describeNodeSetup()
    console.log(
      values.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (values['dry-run']) {
    const plan = nodeSetupPlan()
    console.log(
      values.json
        ? JSON.stringify(plan)
        : `Would install Node ${plan.versions.join(', ')} into:\n${plan.targets.map(target => `  ${target}`).join('\n')}`,
    )
    return
  }
  installNodeVersions()
}

export function resolveNodeRuntime(version: string) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-node-'))
  const options: ExecFileSyncOptionsWithStringEncoding = {
    cwd: directory,
    encoding: 'utf8',
    env: nodeInteropEnvironment(),
    stdio: ['ignore', 'pipe', 'inherit'],
  }
  try {
    writeFileSync(path.join(directory, 'package.json'), '{"private":true}\n')
    writeFileSync(path.join(directory, '.node-version'), version + '\n')
    const executable = execFileSync(
      toolExecutable('nub'),
      ['--no-env-file', '-p', 'process.execPath'],
      options,
    ).trim()
    const actual = execFileSync(executable, ['--version'], options).trim()
    if (actual !== `v${version}`) {
      throw new Error(`Expected Node ${version}, received ${actual}`)
    }
    return executable
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (isMainModule(import.meta.url)) {
  main()
}
