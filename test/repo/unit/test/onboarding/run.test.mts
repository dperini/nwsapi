import { expect, test, vi } from 'vitest'
import {
  describeOnboardingRun,
  formatOnboardingPlan,
  onboardingRunPlan,
  parseOnboardingArguments,
  parseOnboardingControls,
  parseOnboardingOptions,
  presentOnboardingRequest,
} from '../../../../../scripts/repo/test/onboarding/contract.mts'

test('onboarding control flags leave scenario arguments intact', () => {
  expect(
    parseOnboardingControls([
      '--scenario',
      'pnpm',
      '--node',
      '/tools/node',
      '--pnpm',
      '/tools/pnpm.mjs',
      '--dry-run',
      '--json',
    ]),
  ).toEqual({
    args: [
      '--scenario',
      'pnpm',
      '--node',
      '/tools/node',
      '--pnpm',
      '/tools/pnpm.mjs',
    ],
    json: true,
    describe: false,
    dryRun: true,
  })
  expect(() => parseOnboardingControls(['--describe', '--dry-run'])).toThrow(
    'Choose --describe or --dry-run.',
  )
})

test('onboarding journey plan names operations and isolated output paths', () => {
  const plan = onboardingRunPlan(
    { scenario: 'journey', node: '/tools/node' },
    '/checkout',
    '/tmp',
  )
  expect(plan.command).toBe('onboarding/journey')
  expect(plan.steps).toHaveLength(3)
  expect(plan.targets).toEqual([
    '/tmp/nwsapi-onboarding-*',
    '/checkout/.cache/onboarding',
  ])
  expect(plan.keepSandbox).toBe(false)
  expect(describeOnboardingRun().options).toContain('--dry-run')
  expect(formatOnboardingPlan(plan)).toContain('Would run onboarding/journey:')
})

test('onboarding argument parser validates absolute tool entry points', () => {
  expect(
    parseOnboardingArguments([
      '--scenario',
      'pnpm',
      '--node',
      '/tools/node',
      '--pnpm',
      '/tools/pnpm.mjs',
      '--keep',
    ]),
  ).toEqual({
    scenario: 'pnpm',
    node: '/tools/node',
    pnpm: '/tools/pnpm.mjs',
    keep: true,
  })
  expect(() => parseOnboardingOptions(new Map())).toThrow('--scenario')
  expect(() =>
    parseOnboardingArguments(['--scenario', 'journey', '--node', 'node']),
  ).toThrow('absolute entry runtime path')
})

test('onboarding protocol renders descriptions and previews without running', () => {
  const log = vi.fn()
  const options = { scenario: 'journey' as const, node: '/tools/node' }
  expect(
    presentOnboardingRequest(
      parseOnboardingControls(['--describe', '--json']),
      options,
      '/checkout',
      '/tmp',
      log,
    ),
  ).toBe(true)
  expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
    type: 'command',
    name: 'onboarding/run',
  })
  expect(
    presentOnboardingRequest(
      parseOnboardingControls(['--dry-run']),
      options,
      '/checkout',
      '/tmp',
      log,
    ),
  ).toBe(true)
  expect(log.mock.calls[1]![0]).toContain('Would run onboarding/journey:')
})
