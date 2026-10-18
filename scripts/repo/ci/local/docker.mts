import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { isMainModule } from '../../lib/run-node.mts'

type Platform = NodeJS.Platform
type Run = (
  command: string,
  args: string[],
  stdio?: 'inherit' | 'ignore',
) => number | null
type Spawn = (
  command: string,
  args: string[],
  options: { stdio: 'inherit' | 'ignore' },
) => { status: number | null; error?: Error }
type AppExists = (name: 'OrbStack' | 'Docker') => boolean

export function runLocalCiCommand(
  command: string,
  args: string[],
  stdio: 'inherit' | 'ignore' = 'inherit',
  spawn: Spawn = spawnSync,
) {
  const result = spawn(command, args, { stdio })
  return result.error ? null : result.status
}

const run: Run = runLocalCiCommand

function appExists(name: 'OrbStack' | 'Docker') {
  const app = `${name}.app`
  return [
    path.join('/Applications', app),
    path.join(homedir(), 'Applications', app),
  ].some(existsSync)
}

function dockerWorks(execute: Run) {
  return execute('docker', ['info'], 'ignore') === 0
}

function installMacRuntime(execute: Run, hasApp: AppExists) {
  if (hasApp('OrbStack')) {
    console.log('OrbStack is installed. Starting it…')
  } else if (hasApp('Docker')) {
    console.log('Docker Desktop is installed. Starting it…')
    return execute('open', ['-a', 'Docker'])
  } else {
    console.log('Installing OrbStack with Homebrew…')
    if (execute('brew', ['install', '--cask', 'orbstack']) !== 0) {
      throw new Error(
        'OrbStack installation failed. Retry with: brew install --cask orbstack',
      )
    }
  }
  return execute('open', ['-a', 'OrbStack'])
}

function installLinuxRuntime(execute: Run) {
  console.log('Installing Docker Engine with Docker’s official installer…')
  if (execute('sh', ['-c', 'curl -fsSL https://get.docker.com | sh']) !== 0) {
    throw new Error(
      'Docker Engine installation failed. Install Docker from https://docs.docker.com/engine/install/, then rerun pnpm run ci:local.',
    )
  }
}

function installWindowsRuntime(execute: Run) {
  console.log('Installing Docker Desktop with winget…')
  const status = execute('winget', [
    'install',
    '--id',
    'Docker.DockerDesktop',
    '--exact',
    '--accept-source-agreements',
    '--accept-package-agreements',
  ])
  if (status !== 0) {
    throw new Error(
      'Docker Desktop installation failed. Install it with winget, then rerun pnpm run ci:local.',
    )
  }
  if (
    execute('powershell', [
      '-NoProfile',
      '-Command',
      'Start-Process "$Env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe"',
    ]) !== 0
  ) {
    throw new Error('Docker Desktop installed but could not be started.')
  }
}

export async function ensureLocalCiDockerAvailable(
  platform: Platform = process.platform,
  execute: Run = run,
  wait: (milliseconds: number) => Promise<void> = delay,
  hasApp: AppExists = appExists,
) {
  if (dockerWorks(execute)) {
    console.log('Docker is already available.')
    return
  }
  if (platform === 'darwin') {
    if (installMacRuntime(execute, hasApp) !== 0) {
      throw new Error('Could not start OrbStack or Docker Desktop on macOS.')
    }
  } else if (platform === 'win32') {
    installWindowsRuntime(execute)
  } else if (platform === 'linux') {
    installLinuxRuntime(execute)
  } else {
    throw new Error(`Local CI Docker setup is unsupported on ${platform}.`)
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(2000)
    if (dockerWorks(execute)) {
      console.log('Docker is ready.')
      return
    }
  }
  throw new Error(
    'Docker was installed or started, but it is not ready yet. Finish any setup prompt, start Docker, and rerun pnpm run ci:local.',
  )
}

function delay(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}

if (isMainModule(import.meta.url)) {
  await ensureLocalCiDockerAvailable()
}
