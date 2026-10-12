import { expect, test, vi } from 'vitest'
import { main } from '../../../../scripts/repo/setup/doctor.mts'
import type * as ReadinessModule from '../../../../scripts/repo/setup/readiness.mts'

const state = vi.hoisted(() => ({ tools: true, dependencies: true }))
vi.mock('../../../../scripts/repo/setup/diagnostics.mts', () => ({
  executableOwner: () => 'checkout',
  managedEntry: (name: string) => `/tools/${name}`,
  managedReady: () => state.tools,
  managedVersions: () => ({ node: '26.11.0', npm: '12.2.0', pnpm: '12.12.0' }),
  meetsMinimum: () => true,
  realExecutable: (value: string) => value,
  resolveExecutable: (name: string) => ({
    executable: `/tools/${name}`,
    index: 0,
  }),
  toolVersion: () => 'unused',
  verifiedWrapper: () => true,
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
