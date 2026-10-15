import { expect, test, vi } from 'vitest'
import {
  onboardingBlock,
  onboardingInput,
  planOnboarding,
  discoverOnboardingPlan,
} from '../../../../../scripts/repo/test/onboarding/plan.mts'

const block = '<!-- <onboarding> -->\nsetup\n<!-- </onboarding> -->'

test('manual and unavailable comparison runs do not touch Git', () => {
  const sources = { git: vi.fn(), readReadme: vi.fn() }
  expect(
    discoverOnboardingPlan({ GITHUB_EVENT_NAME: 'workflow_dispatch' }, sources)
      .run,
  ).toBe(true)
  expect(discoverOnboardingPlan({}, sources).run).toBe(true)
  expect(sources.git).not.toHaveBeenCalled()
})

test('README-only Git changes compare the marked section and failed Git runs validate', () => {
  const base = 'a'.repeat(40)
  const sources = {
    git: vi
      .fn()
      .mockReturnValueOnce('README.md\0src/example.mts\0')
      .mockReturnValueOnce(block),
    readReadme: vi.fn(() => `${block}\noutside change`),
  }
  expect(
    discoverOnboardingPlan({ ONBOARDING_BASE_SHA: base }, sources).run,
  ).toBe(false)
  expect(sources.git.mock.calls).toEqual([
    [['diff', '--name-only', '-z', base, 'HEAD']],
    [['show', `${base}:README.md`]],
  ])
  sources.git.mockImplementation(() => {
    throw new Error('Git unavailable')
  })
  expect(
    discoverOnboardingPlan({ ONBOARDING_BASE_SHA: base }, sources).run,
  ).toBe(true)
})

test('README prose outside onboarding does not schedule the full journey', () => {
  expect(
    planOnboarding(['README.md'], `old\n${block}`, `${block}\nnew`).run,
  ).toBe(false)
  expect(
    planOnboarding(['README.md'], block, block.replaceAll('\n', '\r\n')).run,
  ).toBe(false)
})

test('changes inside onboarding and broken markers schedule validation', () => {
  expect(
    planOnboarding(['README.md'], block, block.replace('setup', 'install')).run,
  ).toBe(true)
  expect(planOnboarding(['README.md'], block, 'no markers').run).toBe(true)
  expect(onboardingBlock(`${block}\n${block}`)).toBeUndefined()
})

test('ordinary source changes are ignored while onboarding runtime inputs run', () => {
  expect(onboardingInput('src/nwsapi.mts')).toBe(false)
  expect(planOnboarding(['src/nwsapi.mts'], '', '').run).toBe(false)
  for (const file of [
    '.github/workflows/ci.yml',
    '.config/node-interop.json',
    '.config/generated/external-tools.mts',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'scripts/repo/node.mts',
    'scripts/repo/external-tools.mts',
    'scripts/repo/lib/paths.mts',
    'scripts/repo/lib/run-node.mts',
    'scripts/repo/lib/external-git-environment.mts',
    'scripts/repo/setup/bootstrap.mts',
    'scripts/repo/develop/run.mts',
    'scripts/repo/test/onboarding/plan.mts',
    'package.json',
  ]) {
    expect(planOnboarding([file, 'README.md'], '', '').run).toBe(true)
  }
})
