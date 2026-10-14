import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  discoverOnboardingPlan,
  planOnboarding,
  onboardingInput,
} from '../../../../../scripts/test/onboarding/plan.mts'

const block = '<!-- <onboarding> -->\nsetup\n<!-- </onboarding> -->'

test('README edits outside onboarding do not run the journey', () => {
  assert.equal(
    planOnboarding(['README.md'], 'before\n' + block, 'after\n' + block).run,
    false,
  )
  assert.equal(
    planOnboarding(['README.md'], block, block.replace('setup', 'new setup'))
      .run,
    true,
  )
  assert.equal(
    planOnboarding(['README.md'], block, block.replaceAll('\n', '\r\n')).run,
    false,
  )
  assert.equal(planOnboarding(['README.md'], 'missing', block).run, true)
})

test('only direct onboarding inputs select the journey', () => {
  for (const file of [
    'scripts/setup.mjs',
    'scripts/setup/progress.mts',
    'scripts/lib/tools/install.mjs',
    'scripts/develop/run.mts',
    'package-lock.json',
    '.npmrc',
    '.github/workflows/onboarding-v2.yml',
  ]) {
    assert.equal(onboardingInput(file), true, file)
  }
  for (const file of [
    'src/nwsapi.js',
    'docs/repo/perf/cache.md',
    'test/repo/unit/lib/paths.test.mts',
    'tools/.npmrc',
  ]) {
    assert.equal(onboardingInput(file), false, file)
  }
})

test('manual requests and unavailable comparisons safely select validation', () => {
  const sources = {
    git: () => {
      throw new Error('unavailable')
    },
    readReadme: () => block,
  }
  assert.equal(
    discoverOnboardingPlan({ GITHUB_EVENT_NAME: 'workflow_dispatch' }, sources)
      .run,
    true,
  )
  assert.equal(discoverOnboardingPlan({}, sources).run, true)
  assert.equal(
    discoverOnboardingPlan({ ONBOARDING_BASE_SHA: 'a'.repeat(40) }, sources)
      .run,
    true,
  )
})

test('README comparison reads the requested revision and ignores unrelated changes', () => {
  const calls: string[][] = []
  const plan = discoverOnboardingPlan(
    { ONBOARDING_BASE_SHA: 'a'.repeat(40) },
    {
      git: args => {
        calls.push(args)
        return args[0] === 'diff' ? 'README.md\0' : block
      },
      readReadme: () => 'other text\n' + block,
    },
  )
  assert.equal(plan.run, false)
  assert.deepEqual(calls[1], ['show', 'a'.repeat(40) + ':README.md'])
})
