import { afterEach, expect, test, vi } from 'vitest'
import { ensureLocalCiDockerAvailable } from '../../../../../scripts/repo/ci/local/docker.mts'
import { localCiInvocation } from '../../../../../scripts/repo/ci/local/run.mts'

afterEach(() => vi.restoreAllMocks())

test('selects the repository CI workflow for local runs', () => {
  expect(localCiInvocation()).toEqual({
    command: 'node scripts/repo/ci/local/run.mts',
    args: [
      'scripts/repo/run.mts',
      'node_modules/run-local-ci/dist/native-launcher.js',
      'run',
      '--workflow',
      '.github/workflows/ci.yml',
      '--quiet',
      '--pause-on-failure',
      '--github-token',
    ],
  })
})

test('uses an already running Docker engine without installing anything', async () => {
  const execute = vi.fn(() => 0)

  await ensureLocalCiDockerAvailable('darwin', execute, async () => {})

  expect(execute).toHaveBeenCalledExactlyOnceWith('docker', ['info'], 'ignore')
})

test('starts installed OrbStack before attempting a macOS install', async () => {
  let running = false
  const calls: string[] = []
  const execute = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'docker') {
      return running ? 0 : 1
    }
    if (command === 'open') {
      running = true
    }
    return 0
  }

  await ensureLocalCiDockerAvailable(
    'darwin',
    execute,
    async () => {},
    name => name === 'OrbStack',
  )

  expect(calls).toContain('open -a OrbStack')
  expect(calls).not.toContain('brew install --cask orbstack')
})

test('starts installed Docker Desktop when OrbStack is not installed', async () => {
  let running = false
  const calls: string[] = []
  const execute = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'docker') {
      return running ? 0 : 1
    }
    if (command === 'open') {
      running = true
    }
    return 0
  }

  await ensureLocalCiDockerAvailable(
    'darwin',
    execute,
    async () => {},
    name => name === 'Docker',
  )

  expect(calls).toContain('open -a Docker')
  expect(calls).not.toContain('brew install --cask orbstack')
})

test('installs OrbStack with Homebrew when macOS has no runtime app', async () => {
  let running = false
  const calls: string[] = []
  const execute = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'docker') {
      return running ? 0 : 1
    }
    if (command === 'open') {
      running = true
    }
    return 0
  }

  await ensureLocalCiDockerAvailable(
    'darwin',
    execute,
    async () => {},
    () => false,
  )

  expect(calls).toContain('brew install --cask orbstack')
  expect(calls).toContain('open -a OrbStack')
})

test('installs and starts Docker Desktop on Windows', async () => {
  let running = false
  const calls: string[] = []
  const execute = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'docker') {
      return running ? 0 : 1
    }
    if (command === 'powershell') {
      running = true
    }
    return 0
  }

  await ensureLocalCiDockerAvailable('win32', execute, async () => {})

  expect(calls[0]).toBe('docker info')
  expect(calls.some(call => call.startsWith('winget install'))).toBe(true)
  expect(calls.some(call => call.startsWith('powershell '))).toBe(true)
})

test('installs Docker Engine on Linux when no engine is available', async () => {
  let running = false
  const calls: string[] = []
  const execute = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'docker') {
      return running ? 0 : 1
    }
    if (command === 'sh') {
      running = true
    }
    return 0
  }

  await ensureLocalCiDockerAvailable('linux', execute, async () => {})

  expect(calls).toContain('sh -c curl -fsSL https://get.docker.com | sh')
})

test('reports unsupported platforms without running an installer', async () => {
  const execute = vi.fn(() => 1)

  await expect(
    ensureLocalCiDockerAvailable(
      'freebsd' as NodeJS.Platform,
      execute,
      async () => {},
    ),
  ).rejects.toThrow('Local CI Docker setup is unsupported on freebsd.')
  expect(execute).toHaveBeenCalledExactlyOnceWith('docker', ['info'], 'ignore')
})
