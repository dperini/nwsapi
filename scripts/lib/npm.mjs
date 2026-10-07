import { existsSync } from 'node:fs'
import path from 'node:path'
import { TOOL_BIN, toolExecutable } from './external-tools.mjs'

export function npmInvocation(
  args,
  platform = process.platform,
  directory = TOOL_BIN,
) {
  const node = path.join(directory, platform === 'win32' ? 'node.exe' : 'node')
  const npm = toolExecutable('npm')
  if (existsSync(node) && existsSync(npm)) {
    return { command: node, args: [npm, ...args], shell: false }
  }
  return {
    command: platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    shell: platform === 'win32',
  }
}
