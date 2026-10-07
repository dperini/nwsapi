import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TOOL_BIN,
  TOOLCHAIN_STATE,
  REPO_ROOT,
  toolExecutable,
  toolPlan,
  toolVersion,
  toolchainState,
} from '../external-tools.mjs'
import { installTool } from './install.mjs'
import { registerNub, nubRequest, miseEnvironment, MISE_ROOT } from './mise.mjs'

export function managedEnvironment(env = process.env) {
  const result = { ...env }
  const names = [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_EXECUTABLE',
    'npm_execpath',
    'npm_node_execpath',
    'npm_config_user_agent',
    'npm_lifecycle_event',
    'npm_lifecycle_script',
    'npm_command',
  ]
  for (let i = 0, length = names.length; i < length; i += 1) {
    delete result[names[i]]
  }
  result.PATH = TOOL_BIN + path.delimiter + (env.PATH ?? '')
  return result
}

export function resolveNode(version, nub = toolExecutable('nub')) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-node-'))
  const options = {
    cwd: directory,
    env: managedEnvironment(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }
  try {
    writeFileSync(path.join(directory, 'package.json'), '{"private":true}\n')
    writeFileSync(path.join(directory, '.node-version'), version + '\n')
    const executable = execFileSync(nub, ['node', 'which'], options).trim()
    const actual = execFileSync(executable, ['--version'], options).trim()
    if (actual !== `v${version}`) {
      throw Object.assign(
        new Error(`Expected Node ${version}, received ${actual}`),
        { code: 'ERR_TOOL_VERSION' },
      )
    }
    return realpathSync(executable)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function activateTool(name, executable, directory = TOOL_BIN) {
  mkdirSync(directory, { recursive: true })
  executable = realpathSync(executable)
  if (process.platform === 'win32' && name === 'node') {
    copyFileSync(executable, path.join(directory, 'node.exe'))
  } else if (process.platform === 'win32') {
    writeFileSync(
      path.join(directory, `${name}.cmd`),
      `@echo off\r\n"${executable.replaceAll('%', '%%')}" %*\r\n`,
    )
  } else {
    const target = path.join(directory, name)
    rmSync(target, { force: true })
    symlinkSync(executable, target)
  }
}

export async function setupTools() {
  rmSync(TOOLCHAIN_STATE, { force: true })
  const executables = Object.create(null)
  const names = ['nub', 'npm', 'pnpm', 'mise']
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]
    executables[name] = await installTool(toolPlan(name))
  }
  const version = toolVersion('node')
  registerNub()
  const request = nubRequest(['node', 'install', version])
  execFileSync(request.command, request.args, {
    cwd: MISE_ROOT,
    env: miseEnvironment(managedEnvironment()),
    stdio: 'inherit',
  })
  const node = resolveNode(version, executables.nub)
  const options = {
    cwd: REPO_ROOT,
    env: managedEnvironment(),
    encoding: 'utf8',
  }
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]
    const actual = execFileSync(
      name === 'npm' ? node : executables[name],
      name === 'npm' ? [executables.npm, '--version'] : ['--version'],
      options,
    ).trim()
    const token = actual.split(' ')[0]
    const reported = token.startsWith('v') ? token.slice(1) : token
    if (reported !== toolVersion(name)) {
      throw Object.assign(new Error(`Unexpected ${name} version: ${actual}`), {
        code: 'ERR_TOOL_VERSION',
      })
    }
  }
  activateTool('node', node)
  activateTool('nub', executables.nub)
  activateTool('mise', executables.mise)
  activateTool('pnpm', executables.pnpm)
  const launcher = path.join(
    TOOL_BIN,
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
  )
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
  rmSync(launcher, { force: true })
  writeFileSync(
    launcher,
    process.platform === 'win32'
      ? `@echo off\r\n"${node.replaceAll('%', '%%')}" "${executables.npm.replaceAll('%', '%%')}" %*\r\n`
      : `#!/bin/sh\nexec ${quote(node)} ${quote(executables.npm)} "$@"\n`,
    { mode: 0o755 },
  )
  writeFileSync(TOOLCHAIN_STATE, toolchainState(names))
  return { node, npm: executables.npm, pnpm: executables.pnpm }
}
