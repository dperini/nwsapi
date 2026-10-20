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
  TOOLCHAIN_STATE,
  toolDirectory,
  toolchainState,
  managedNodeEntry,
  toolPlan,
  toolPlatform,
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
import { checkPrerequisites } from './prerequisites.mts'
import { registerNub } from './mise.mts'

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

export async function installSpecialTools(versions = toolVersions()) {
  const moldPlatform = toolPlatform()
  if (moldPlatform === 'linux-x64' || moldPlatform === 'linux-arm64') {
    const mold = await installTool(toolPlan('mold', moldPlatform))
    const actual = execFileSync(mold, ['--version'], {
      cwd: REPO_ROOT,
      env: nodeInteropEnvironment(),
      encoding: 'utf8',
    }).trim()
    if (!actual.includes(`mold ${versions['mold']}`)) {
      throw new Error(`Expected mold ${versions['mold']}, received ${actual}`)
    }
    activateTool('mold', mold)
  }
}

export async function setupTools({ full = false } = {}) {
  checkExternalTools()
  checkPrerequisites()
  rmSync(TOOLCHAIN_STATE, { force: true })
  writeFirewallShim('npm')
  writeFirewallShim('pnpm')
  const versions = toolVersions()
  const executables = Object.create(null) as Record<
    'nub' | 'pnpm' | 'npm' | 'sfw' | 'mise',
    string
  >
  const names = ['nub', 'pnpm', 'npm', 'sfw', 'mise'] as const
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]!
    executables[name] = await installTool(toolPlan(name))
  }
  registerNub()
  installNodeVersions([
    ...new Set([versions['node']!, ...(full ? NODE_INTEROP_VERSIONS : [])]),
  ])
  const node = realpathSync(resolveNodeRuntime(versions['node']!))
  if (full) {
    await installSpecialTools(versions)
  }
  const env = nodeInteropEnvironment()
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]!
    const command = name === 'npm' ? node : executables[name]
    const args = name === 'npm' ? [executables.npm, '--version'] : ['--version']
    const actual = execFileSync(command, args, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
    }).trim()
    const version =
      name === 'sfw' || name === 'mise'
        ? actual.match(/\b\d+\.\d+\.\d+\b/)?.[0]
        : actual.replace(/^v/, '')
    if (version !== versions[name]) {
      throw new Error(`Expected ${name} ${versions[name]}, received ${actual}`)
    }
  }
  activateTool('node', node)
  const managedNode = realpathSync(managedNodeEntry())
  activateTool('nub', executables.nub)
  activateTool('mise', executables.mise)
  activateTool('sfw', executables.sfw)
  writeFirewallShim('pnpm', executables.sfw, { executable: executables.pnpm })
  writeFirewallShim('npm', executables.sfw, {
    executable: managedNode,
    args: [executables.npm],
  })
  writeFileSync(TOOLCHAIN_STATE, toolchainState())
  return TOOL_BIN
}

export function toolSetupPlan(root = REPO_ROOT, platform = process.platform) {
  const names = ['nub', 'pnpm', 'npm', 'sfw', 'mise'] as const
  const platformName = toolPlatform(platform)
  const bin = path.join(root, '.cache/bin')
  const cache = path.join(root, '.cache/external-tools')
  const state = path.join(bin, 'toolchain.json')
  const tools = names.map(name => {
    const plan = toolPlan(name, platformName)
    return {
      name,
      version: plan.version,
      asset: plan.asset,
      cache: path.relative(root, toolDirectory(plan, cache)),
    }
  })
  const suffix = platform === 'win32' ? '.cmd' : ''
  return {
    schemaVersion: 1,
    type: 'preview',
    command: 'setup/tools',
    root,
    tools,
    targets: [
      ...names.map(name =>
        path.relative(root, path.join(bin, `${name}${suffix}`)),
      ),
      path.relative(root, managedNodeEntry(bin, platform)),
      path.relative(root, state),
      path.relative(root, cache),
    ].filter((target, index, list) => list.indexOf(target) === index),
  }
}

export function describeToolSetup() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'setup/tools',
    description: 'Install and activate pinned tools in the checkout cache.',
    options: ['--json', '--describe', '--dry-run', '--full', '--github-path'],
    mutates: true,
  }
}

export async function main(
  args = process.argv.slice(2),
  setup = setupTools,
  log = console.log,
  env = process.env,
) {
  const { values } = parseArgs({
    args,
    options: {
      'github-path': { type: 'boolean' },
      full: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
      describe: { type: 'boolean' },
    },
  })
  if (values.describe) {
    const description = describeToolSetup()
    log(
      values.json
        ? JSON.stringify(description)
        : `${description.name}: ${description.description}\nUse --dry-run to list cache and activation paths.`,
    )
    return TOOL_BIN
  }
  if (values['dry-run']) {
    const plan = toolSetupPlan()
    log(values.json ? JSON.stringify(plan) : formatToolSetupPlan(plan))
    return TOOL_BIN
  }
  if (values['github-path'] && !env['GITHUB_PATH']) {
    throw new Error('GITHUB_PATH is required with --github-path.')
  }
  const bin = values.full ? await setup({ full: true }) : await setup()
  if (values['github-path']) {
    appendFileSync(env['GITHUB_PATH']!, bin + '\n')
  }
  log(
    values.json
      ? JSON.stringify({
          schemaVersion: 1,
          type: 'result',
          command: 'setup/tools',
          status: 'completed',
          bin,
          githubPath: values['github-path'] ? env['GITHUB_PATH'] : undefined,
        })
      : 'Toolchain ready for repository commands. Global defaults are unchanged.',
  )
  return bin
}

if (isMainModule(import.meta.url)) {
  await main()
}

export function formatToolSetupPlan(plan: ReturnType<typeof toolSetupPlan>) {
  return [
    `Would prepare ${plan.command} in ${plan.root}:`,
    ...plan.tools.map(tool => `  ${tool.name} ${tool.version} → ${tool.cache}`),
    'Activation paths:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}
