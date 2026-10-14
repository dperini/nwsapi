export type ColorEnvironment = {
  isTTY: boolean
  env: NodeJS.ProcessEnv
  json?: boolean
}

export function shouldUseColor({ isTTY, env, json = false }: ColorEnvironment) {
  return (
    isTTY && !json && env['NO_COLOR'] === undefined && env['TERM'] !== 'dumb'
  )
}

export function formatCliOutput(output: string, color: boolean, error = false) {
  if (!color) {
    return output
  }
  if (error) {
    return `\u001b[31m${output}\u001b[39m`
  }
  if (output === 'nwsapi / Command menu') {
    return `\u001b[1;36m${output}\u001b[0m`
  }
  if (!output.startsWith('Usage: nwsapi')) {
    return output
  }
  return output
    .replace(/^(Usage:.*)$/m, '\u001b[1;36m$1\u001b[0m')
    .replace(/^(Commands:|Options:)$/m, '\u001b[1;33m$1\u001b[0m')
}

export function isCompatibleNodeVersion(version: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) {
    return false
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 26 || (major === 26 && minor >= 4)
}

export function supportsTuiPlatform(
  platform: string,
  arch: string,
  libc: string | undefined,
) {
  if (!['darwin', 'linux', 'win32'].includes(platform)) {
    return false
  }
  if (!['x64', 'arm64'].includes(arch)) {
    return false
  }
  return platform !== 'linux' || libc === 'glibc' || libc === 'musl'
}

export function jsonArguments(argv: readonly string[]) {
  return argv.includes('--json') || argv.includes('-j')
}
