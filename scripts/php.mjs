import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: 'ignore', ...options })
}

function available(command, args, options) {
  const result = run(command, args, options)
  return !result.error && result.status === 0
}

export function phpInstallHint() {
  switch (process.platform) {
    case 'darwin': return 'Install it with Homebrew: brew install php'
    case 'linux': return 'Install the PHP CLI with your distribution package manager, for example: sudo apt install php-cli'
    case 'win32': return 'Install PHP with winget, then restart the terminal so php is on PATH.'
    default: return 'Install PHP and make the php command available on PATH.'
  }
}

export function ensurePhp() {
  if (available('php', ['--version'])) return true
  if (process.platform !== 'darwin') return false

  const env = {
    ...process.env,
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_INSTALL_CLEANUP: '1',
    HOMEBREW_NO_INSTALL_UPGRADE: '1',
    HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: '1',
    HOMEBREW_NO_ANALYTICS: '1',
    HOMEBREW_NO_ENV_HINTS: '1',
    NONINTERACTIVE: '1',
    CI: '1',
  }
  if (!available('brew', ['--version'], { env })) installHomebrew(env)

  const updated = run('brew', ['update-if-needed'], { stdio: 'pipe', env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (updated.error || updated.status !== 0) {
    const details = [updated.stderr, updated.stdout].filter(Boolean).map(output => output.toString().trim()).filter(Boolean).join('\n')
    throw new Error(`Automatic Homebrew update failed.${details ? `\n${details}` : ''}`, { cause: updated.error })
  }

  const result = run('brew', ['install', '--quiet', 'php'], { stdio: ['ignore', 'pipe', 'pipe'], env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).map(output => output.toString().trim()).filter(Boolean).join('\n')
    throw new Error(`Automatic PHP installation with Homebrew failed.${details ? `\n${details}` : ''}`, { cause: result.error })
  }
  if (!available('php', ['--version'], { env })) throw new Error('Homebrew installed PHP, but the php command is still unavailable on PATH.')
  return true
}

function installHomebrew(env) {
  if (process.arch !== 'arm64' && process.arch !== 'x64') throw new Error(`Cannot install Homebrew automatically on macOS architecture ${process.arch}.`)

  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-homebrew-'))
  try {
    const installer = path.join(temporary, 'install.sh')
    const download = run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--location', 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh', '--output', installer], {
      env: { ...env, HOMEBREW_NO_AUTO_UPDATE: '1' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    })
    if (download.error || download.status !== 0) {
      const details = [download.stderr, download.stdout].filter(Boolean).map(output => output.toString().trim()).filter(Boolean).join('\n')
      throw new Error(`Could not download the Homebrew installer.${details ? `\n${details}` : ''}`, { cause: download.error })
    }

    const result = run('/bin/bash', [installer], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, NONINTERACTIVE: '1', CI: '1', HOMEBREW_NO_AUTO_UPDATE: '1' },
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    })
    if (result.error || result.status !== 0) {
      const details = [result.stderr, result.stdout].filter(Boolean).map(output => output.toString().trim()).filter(Boolean).join('\n')
      throw new Error(`Automatic Homebrew installation failed. Homebrew may require administrator approval for its install directory.${details ? `\n${details}` : ''}`, { cause: result.error })
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }

  const brewPath = process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin'
  if (!env.PATH.split(path.delimiter).includes(brewPath)) env.PATH = `${brewPath}${path.delimiter}${env.PATH}`
}
