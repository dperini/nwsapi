import path from 'node:path'
import { expect, test, vi } from 'vitest'
import manifest from '../../../../../.config/external-tools.json' with { type: 'json' }
import {
  describeOnboarding,
  onboardingPhasePlan,
  onboardingInvocation,
  runOnboardingPhase,
  executeCommand,
  parseEntryManager,
} from '../../../../../scripts/repo/test/onboarding/ci.mts'

test.each(['npm', 'pnpm'] as const)('accepts the %s entry manager', manager => {
  expect(parseEntryManager(manager)).toBe(manager)
})

test.each([undefined, '', 'yarn', 'PNPM'])(
  'rejects an invalid entry manager %s',
  manager => {
    expect(() => parseEntryManager(manager)).toThrow()
  },
)

test.each(['linux', 'win32'] as const)(
  'Node onboarding keeps argument boundaries on %s',
  platform => {
    const run = vi.fn(() => ({
      status: 0,
      pid: 1,
      signal: null,
      output: [],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
    }))
    expect(
      executeCommand(
        '/node with spaces/node.exe',
        ['path with spaces', '--flag'],
        platform,
        run,
      ),
    ).toBe(0)
    expect(run).toHaveBeenCalledWith(
      '/node with spaces/node.exe',
      ['path with spaces', '--flag'],
      expect.objectContaining({ shell: false }),
    )
    executeCommand('npm', ['install'], platform, run)
    expect(run).toHaveBeenLastCalledWith(
      'npm',
      ['install'],
      expect.objectContaining({ shell: platform === 'win32' }),
    )
  },
)

test('bootstraps using the selected minimum Node executable', () => {
  const invocation = onboardingInvocation(
    'bootstrap',
    undefined,
    '/tools/node',
    '/tmp',
    '/checkout',
  )

  expect(invocation).toEqual({
    command: '/tools/node',
    args: [
      path.join('/checkout', 'scripts/repo/test/onboarding/run.mts'),
      '--scenario',
      'bootstrap',
      '--node',
      '/tools/node',
    ],
  })
})

test.each([
  ['npm', 'bin/npm-cli.js'],
  ['pnpm', 'bin/pnpm.mjs'],
] as const)(
  'provisions the pinned %s manager and passes its installed entry to the journey',
  (manager, entry) => {
    const version = manifest.tools[manager].version
    const install = onboardingInvocation(
      'install-manager',
      manager,
      '/tools/node',
      '/tmp/onboarding',
      '/checkout',
    )
    expect(install).toEqual({
      command: 'npm',
      args: [
        'install',
        '--prefix',
        path.join('/tmp/onboarding', 'onboarding-manager'),
        '--no-save',
        `${manager}@${version}`,
      ],
    })

    const journey = onboardingInvocation(
      'journey',
      manager,
      '/tools/node',
      '/tmp/onboarding',
      '/checkout',
    )
    expect(journey).toEqual({
      command: '/tools/node',
      args: [
        path.join('/checkout', 'scripts/repo/test/onboarding/run.mts'),
        '--scenario',
        manager,
        '--node',
        '/tools/node',
        `--${manager}`,
        path.join(
          '/tmp/onboarding',
          'onboarding-manager/node_modules',
          manager,
          entry,
        ),
      ],
    })
  },
)

test('runs package manager provisioning through the injected process runner', () => {
  const execute = vi.fn(() => 0)

  runOnboardingPhase('install-manager', { ENTRY_MANAGER: 'pnpm' }, execute)

  expect(execute).toHaveBeenCalledWith(
    'npm',
    expect.arrayContaining(['pnpm@12.14.0']),
  )
})

test('journey dry-run lists isolated paths and invokes no external command', () => {
  const plan = onboardingPhasePlan(
    'journey',
    { ENTRY_MANAGER: 'pnpm', RUNNER_TEMP: '/tmp/onboarding' },
    '/tools/node',
    '/tmp/onboarding',
    '/checkout',
  )
  expect(plan.invocation.command).toBe('/tools/node')
  expect(plan.targets).toEqual([
    '/tmp/onboarding/onboarding-manager',
    '/tmp/onboarding/nwsapi-onboarding-*',
    '/checkout/.cache/onboarding',
  ])
  expect(describeOnboarding().options).toContain('--dry-run')
})

test('rejects an unknown entry package manager', () => {
  expect(() => onboardingInvocation('journey', 'yarn')).toThrow(
    'Set ENTRY_MANAGER to npm or pnpm.',
  )
})
