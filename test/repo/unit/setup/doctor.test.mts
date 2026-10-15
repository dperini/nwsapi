import { expect, test, vi } from 'vitest'
import { main } from '../../../../scripts/repo/setup/doctor.mts'
import type * as ReadinessModule from '../../../../scripts/repo/setup/readiness.mts'

const state = vi.hoisted(() => ({
  tools: true,
  dependencies: true,
  externalPnpm: false,
}))
vi.mock('../../../../scripts/repo/setup/diagnostics.mts', () => ({
  cachedToolchainMatches: () => state.tools,
  executableOwner: (file?: string) =>
    file?.includes('/opt/homebrew/') ? 'Homebrew' : 'checkout',
  managedEntry: (name: string) => `/tools/${name}`,
  managedReady: () => state.tools,
  managedVersionProbes: () => ({
    node: {
      version: '26.11.0',
      status: 0,
      signal: null,
      errorCode: undefined,
      outputLines: 1,
      outputMatchesVersion: true,
    },
    npm: {
      version: '12.2.0',
      status: 0,
      signal: null,
      errorCode: undefined,
      outputLines: 1,
      outputMatchesVersion: true,
    },
    pnpm: {
      version: '12.12.0',
      status: 0,
      signal: null,
      errorCode: undefined,
      outputLines: 1,
      outputMatchesVersion: true,
    },
  }),
  managedVersions: () => ({ node: '26.11.0', npm: '12.2.0', pnpm: '12.12.0' }),
  meetsMinimum: () => true,
  realExecutable: (value: string) => value,
  resolveExecutable: (name: string) => ({
    executable:
      name === 'pnpm' && state.externalPnpm
        ? '/opt/homebrew/bin/pnpm'
        : `/tools/${name}`,
    index: 0,
  }),
  toolVersion: (file: string) =>
    file.includes('/opt/homebrew/') ? '12.11.2' : 'unused',
  wrapperStatus: () => 'verified',
}))
vi.mock('../../../../scripts/repo/setup/progress.mts', () => ({
  setupProgress: () => undefined,
}))
vi.mock(
  '../../../../scripts/repo/setup/readiness.mts',
  async importOriginal => {
    const original = await importOriginal<typeof ReadinessModule>()
    return {
      ...original,
      checkoutReadiness: async () => ({
        tools: { ready: state.tools, detail: '' },
        dependencies: {
          ready: state.dependencies,
          issues: state.dependencies ? [] : ['Missing dependency.'],
        },
        build: { ready: false, issues: ['Missing dist output.'] },
      }),
    }
  },
)

test('doctor checks task prerequisites without requiring outputs review builds', async () => {
  const log = vi.fn()
  expect(await main(['--task', 'review'], log)).toBe(0)
  expect(log.mock.calls.flat().join('\n')).toContain(
    'Review builds them automatically.',
  )
  expect(log.mock.calls.flat().join('\n')).toContain(
    'Requested task review: ready.',
  )
})

test('doctor returns failure and setup guidance for missing tools or dependencies', async () => {
  try {
    for (const layer of ['tools', 'dependencies'] as const) {
      state[layer] = false
      const log = vi.fn()
      expect(await main([], log)).toBe(1)
      expect(log.mock.calls.flat().join('\n')).toContain(
        'Next: node scripts/repo/setup/bootstrap.mts',
      )
      state[layer] = true
    }
  } finally {
    state.tools = state.dependencies = true
  }
})

test('details report optional VoiceOver uncertainty without changing readiness status', async () => {
  const log = vi.fn()
  const voiceOverProbe = vi.fn(() => ({
    platform: 'darwin' as const,
    supported: true,
    machineSetup: 'unknown' as const,
    assets: 'missing' as const,
    permissions: 'unverified' as const,
    localPreferences: 'unknown' as const,
  }))
  expect(await main(['--details'], log, voiceOverProbe)).toBe(0)
  expect(voiceOverProbe).toHaveBeenCalledOnce()
  expect(log.mock.calls.flat().join('\n')).toContain(
    'Optional VoiceOver: machine setup could not be verified; assets not installed; local preferences could not be verified; macOS permissions unverified.',
  )
})

test('details expose bounded managed probe and cache results for diagnosis', async () => {
  const log = vi.fn()
  expect(await main(['--details'], log)).toBe(0)
  const output = log.mock.calls.flat().join('\n')
  expect(output).toContain('version probe: exit=0 signal=none')
  expect(output).toContain('cached toolchain state: matches pins')
  expect(output).toContain('Firewall: verified')
})

test('doctor distinguishes an external Homebrew pnpm from the ready checkout pin', async () => {
  state.externalPnpm = true
  try {
    const log = vi.fn()
    expect(await main([], log)).toBe(0)
    expect(log.mock.calls.flat().join('\n')).toContain(
      'pnpm: PATH 12.11.2 (Homebrew); checkout pin 12.12.0 ready',
    )
  } finally {
    state.externalPnpm = false
  }
})
