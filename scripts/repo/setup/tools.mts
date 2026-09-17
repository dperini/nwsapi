import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  checkExternalTools,
  TOOL_BIN,
  toolPlan,
  toolVersions,
} from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import {
  installNodeVersions,
  NODE_INTEROP_VERSIONS,
  nodeInteropEnvironment,
  resolveNodeRuntime,
} from '../node.mts'
import { installTool } from './install.mts'
import { writeFirewallShim } from './firewall.mts'

export function activateTool(
  name: string,
  executable: string,
  directory = TOOL_BIN,
) {
  executable = realpathSync(executable)
  mkdirSync(directory, { recursive: true })
  if (process.platform === 'win32' && name !== 'node') {
    writeFileSync(
      path.join(directory, `${name}.cmd`),
      `@echo off\r\n"${executable.replaceAll('%', '%%')}" %*\r\n`,
    )
  } else if (process.platform === 'win32') {
    const target = path.join(directory, `${name}.exe`)
    if (
      !existsSync(target) ||
      !readFileSync(target).equals(readFileSync(executable))
    ) {
      copyFileSync(executable, target)
    }
  } else {
    const link = path.join(directory, name)
    rmSync(link, { force: true })
    symlinkSync(executable, link)
  }
}

export async function setupTools() {
  writeFirewallShim('npm')
  writeFirewallShim('pnpm')
  checkExternalTools()
  const versions = toolVersions()
  const executables = Object.create(null) as Record<
    'nub' | 'pnpm' | 'npm' | 'sfw',
    string
  >
  for (const name of ['nub', 'pnpm', 'npm', 'sfw'] as const) {
    executables[name] = await installTool(toolPlan(name))
  }
  installNodeVersions([
    ...new Set([versions['node']!, ...NODE_INTEROP_VERSIONS]),
  ])
  const node = realpathSync(resolveNodeRuntime(versions['node']!))
  const env = nodeInteropEnvironment()
  for (const name of ['nub', 'pnpm', 'npm', 'sfw'] as const) {
    const command = name === 'npm' ? node : executables[name]
    const args = name === 'npm' ? [executables.npm, '--version'] : ['--version']
    const actual = execFileSync(command, args, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
    }).trim()
    const version =
      name === 'sfw'
        ? actual.match(/\b\d+\.\d+\.\d+\b/)?.[0]
        : actual.replace(/^v/, '')
    if (version !== versions[name]) {
      throw new Error(`Expected ${name} ${versions[name]}, received ${actual}`)
    }
  }
  activateTool('node', node)
  activateTool('nub', executables.nub)
  activateTool('sfw', executables.sfw)
  writeFirewallShim('pnpm', executables.sfw, { executable: executables.pnpm })
  writeFirewallShim('npm', executables.sfw, {
    executable: node,
    args: [executables.npm],
  })
  return TOOL_BIN
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: { 'github-path': { type: 'boolean' } },
  })
  if (values['github-path'] && !process.env['GITHUB_PATH']) {
    throw new Error('GITHUB_PATH is required with --github-path.')
  }
  const bin = await setupTools()
  if (values['github-path']) {
    appendFileSync(process.env['GITHUB_PATH']!, bin + '\n')
  }
  console.log(`Toolchain ready. Prepend ${bin} to PATH.`)
}
