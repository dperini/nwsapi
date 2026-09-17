import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { TOOL_BIN, toolVersions } from '../external-tools.mts'

type Manager = 'npm' | 'pnpm'

export interface FirewallCommand {
  executable: string
  args?: string[]
}

export function quotePosix(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function quoteWindows(value: string) {
  return `"${value.replaceAll('%', '%%')}"`
}

export function sentinelFor(name: Manager) {
  return `SOCKET_SHIM_ACTIVE_${name.toUpperCase()}`
}

export function posixPin(command: string) {
  return [
    `version=$(pnpm_config_pm_on_fail=ignore ${command} --version 2>/dev/null) || exit 126`,
    `if [ "$version" != ${quotePosix(toolVersions()['pnpm']!)} ]; then`,
    '  echo "sfw: pnpm version mismatch. Run node scripts/repo/setup/tools.mts" >&2',
    '  exit 126',
    'fi',
  ]
}

export function posixShim(
  name: Manager,
  firewall: string,
  real: FirewallCommand,
) {
  const command = [real.executable, ...(real.args ?? [])]
    .map(quotePosix)
    .join(' ')
  const sentinel = sentinelFor(name)
  return [
    '#!/bin/bash',
    `if [ ! -x ${quotePosix(firewall)} ] || [ ! -x ${quotePosix(real.executable)} ]; then`,
    '  echo "sfw: managed tool missing. Run node scripts/repo/setup/tools.mts" >&2',
    '  exit 127',
    'fi',
    ...(name === 'pnpm' ? posixPin(command) : []),
    `if [ -n "\${${sentinel}:-}" ]; then`,
    `  exec ${command} "$@"`,
    'fi',
    `export ${sentinel}=1`,
    'export SFW_UNKNOWN_HOST_ACTION=ignore',
    'if [ -z "${SFW_CA_CERT_PATH:-}${SFW_CA_KEY_PATH:-}" ] && [ -r "$HOME/.socket/sfw/ca.crt" ] && [ -r "$HOME/.socket/sfw/ca.key" ]; then',
    '  export SFW_CA_CERT_PATH="$HOME/.socket/sfw/ca.crt"',
    '  export SFW_CA_KEY_PATH="$HOME/.socket/sfw/ca.key"',
    'fi',
    'if [ -t 0 ] && [ -t 1 ]; then',
    `  exec ${quotePosix(firewall)} ${command} "$@"`,
    'fi',
    'set -m',
    `${quotePosix(firewall)} ${command} "$@" &`,
    'sfw_pid=$!',
    'trap "kill -TERM -$sfw_pid 2>/dev/null" EXIT',
    'trap "kill -INT -$sfw_pid 2>/dev/null" INT',
    'trap "kill -TERM -$sfw_pid 2>/dev/null" TERM HUP',
    'wait "$sfw_pid"',
    'exit $?',
  ]
}

export function windowsPin(command: string) {
  return [
    'set "SOCKET_PNPM_VERSION="',
    `for /f "delims=" %%v in ('set "pnpm_config_pm_on_fail=ignore" ^& ${command} --version 2^>nul ^|^| echo pnpm-version-failed') do set "SOCKET_PNPM_VERSION=%%v"`,
    `if "%SOCKET_PNPM_VERSION%"=="${toolVersions()['pnpm']}" goto :pin_ok`,
    'echo sfw: pnpm version mismatch. Run node scripts/repo/setup/tools.mts 1>&2',
    'exit /b 126',
    ':pin_ok',
  ]
}

export function windowsShim(
  name: Manager,
  firewall: string,
  real: FirewallCommand,
) {
  const command = [real.executable, ...(real.args ?? [])]
    .map(quoteWindows)
    .join(' ')
  const sentinel = sentinelFor(name)
  return [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    `if not exist ${quoteWindows(firewall)} goto :missing`,
    `if not exist ${quoteWindows(real.executable)} goto :missing`,
    ...(name === 'pnpm' ? windowsPin(command) : []),
    `if defined ${sentinel} goto :real`,
    `set "${sentinel}=1"`,
    'set "SFW_UNKNOWN_HOST_ACTION=ignore"',
    'if defined SFW_CA_CERT_PATH goto :ca_done',
    'if defined SFW_CA_KEY_PATH goto :ca_done',
    'if not exist "%USERPROFILE%\\.socket\\sfw\\ca.crt" goto :ca_done',
    'if not exist "%USERPROFILE%\\.socket\\sfw\\ca.key" goto :ca_done',
    'set "SFW_CA_CERT_PATH=%USERPROFILE%\\.socket\\sfw\\ca.crt"',
    'set "SFW_CA_KEY_PATH=%USERPROFILE%\\.socket\\sfw\\ca.key"',
    ':ca_done',
    `"${firewall.replaceAll('%', '%%')}" ${command} %*`,
    'exit /b %errorlevel%',
    ':real',
    `${command} %*`,
    'exit /b %errorlevel%',
    ':missing',
    'echo sfw: managed tool missing. Run node scripts/repo/setup/tools.mts 1>&2',
    'exit /b 127',
  ]
}

export function stub(name: Manager, windows: boolean) {
  const message = `sfw: ${name} is unavailable until verified tool setup succeeds. Run node scripts/repo/setup/tools.mts`
  return windows
    ? ['@echo off', `echo ${message} 1>&2`, 'exit /b 127']
    : ['#!/bin/bash', `echo ${quotePosix(message)} >&2`, 'exit 127']
}

export function writeFirewallShim(
  name: Manager,
  firewall?: string,
  real?: FirewallCommand,
  directory = TOOL_BIN,
) {
  const windows = process.platform === 'win32'
  const lines =
    firewall && real
      ? windows
        ? windowsShim(name, firewall, real)
        : posixShim(name, firewall, real)
      : stub(name, windows)
  mkdirSync(directory, { recursive: true })
  const staging = mkdtempSync(path.join(directory, '.shim-'))
  const target = path.join(directory, windows ? `${name}.cmd` : name)
  try {
    const temporary = path.join(staging, 'shim')
    writeFileSync(temporary, lines.join(windows ? '\r\n' : '\n') + '\n', {
      mode: 0o755,
    })
    // Replace the launcher atomically so an existing symlink cannot alter its target.
    renameSync(temporary, target)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return target
}
