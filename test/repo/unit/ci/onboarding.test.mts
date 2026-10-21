import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { ONBOARDING_INPUT_PATHS } from '../../../../scripts/repo/test/onboarding/plan.mts'

interface Workflow {
  on: Record<string, { paths?: string[] }>
  jobs: Record<
    string,
    {
      needs?: string | string[]
      if?: string
      uses?: string
      steps?: Array<{ run?: string; with?: Record<string, string> }>
    }
  >
}

function workflow(name: string): Workflow {
  return parse(
    readFileSync(path.join(REPO_ROOT, '.github/workflows', name), 'utf8'),
  ) as Workflow
}

test('onboarding is reusable and centralizes its change filter in the planner', () => {
  const config = workflow('onboarding.yml')
  expect(Object.keys(config.on)).toEqual(['workflow_call'])
  expect(config).not.toHaveProperty('concurrency')
  expect(ONBOARDING_INPUT_PATHS).toContain('.github/workflows/ci.yml')
  expect(new Set(ONBOARDING_INPUT_PATHS).size).toBe(
    ONBOARDING_INPUT_PATHS.length,
  )
})

test('the main workflow gates onboarding on its completed Node summary', () => {
  const jobs = workflow('ci.yml').jobs
  expect(jobs['onboarding']).toMatchObject({
    needs: 'node',
    if: "needs.node.result == 'success'",
  })
  expect(jobs['onboarding']?.uses).toBe('./.github/workflows/onboarding.yml')
})

test('minimum Node bootstrap and manager journeys run independently', () => {
  const jobs = workflow('onboarding.yml').jobs
  expect(Object.keys(jobs).toSorted()).toEqual(['bootstrap', 'journey', 'plan'])
  expect(jobs['bootstrap']?.needs).toBe('plan')
  expect(jobs['journey']?.needs).toBe('plan')
  const bootstrap = jobs['bootstrap']!.steps!
  const journey = jobs['journey']!.steps!
  expect(
    bootstrap.filter(step => step.run?.endsWith('ci.mts bootstrap')),
  ).toHaveLength(1)
  expect(journey.some(step => step.run?.endsWith('ci.mts bootstrap'))).toBe(
    false,
  )
  expect(
    bootstrap.find(step => step.with?.['node-version'])?.with?.['node-version'],
  ).toBe('22.23.4')
  expect(
    journey.find(step => step.with?.['node-version'])?.with?.['node-version'],
  ).toBe('26.12.1')
  expect(journey.some(step => step.run?.endsWith('ci.mts journey'))).toBe(true)
})
