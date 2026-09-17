import { execFileSync } from 'node:child_process'
import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import manifest from '../../.config/node-interop.json' with { type: 'json' }
import { REPO_ROOT } from './lib/paths.mts'
import { toolExecutable } from './external-tools.mts'
import { isMainModule } from './lib/run-node.mts'

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
  execFileSync(toolExecutable('nub'), ['node', 'install', ...versions], {
    cwd: REPO_ROOT,
    env: nodeInteropEnvironment(),
    stdio: 'inherit',
  })
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
      ['node', 'which'],
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
  installNodeVersions()
}
