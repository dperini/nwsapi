import path from 'node:path'
import { expect, test, vi } from 'vitest'
import manifest from '../../../../../.config/external-tools.json' with { type: 'json' }
import {
  onboardingInvocation,
  runOnboardingPhase,
} from '../../../../../scripts/repo/test/onboarding/ci.mts'

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
    expect.arrayContaining(['pnpm@12.12.0']),
  )
})

test('rejects an unknown entry package manager', () => {
  expect(() => onboardingInvocation('journey', 'yarn')).toThrow(
    'Set ENTRY_MANAGER to npm or pnpm.',
  )
})
