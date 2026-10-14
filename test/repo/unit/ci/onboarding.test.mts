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
      steps?: Array<{ run?: string; with?: Record<string, string> }>
    }
  >
}

function workflow(name: string): Workflow {
  return parse(
    readFileSync(path.join(REPO_ROOT, '.github/workflows', name), 'utf8'),
  ) as Workflow
}

test('onboarding has narrow matching push and pull request triggers', () => {
  const config = workflow('onboarding-v3.yml')
  const paths = ONBOARDING_INPUT_PATHS
  expect(config.on['push']?.paths).toEqual(paths)
  expect(config.on['pull_request']?.paths).toEqual(paths)
  expect(config.on).not.toHaveProperty('schedule')
})

test('minimum Node bootstrap and manager journeys run independently', () => {
  const jobs = workflow('onboarding-v3.yml').jobs
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
  ).toBe('22.18.0')
  expect(
    journey.find(step => step.with?.['node-version'])?.with?.['node-version'],
  ).toBe('26.11.0')
  expect(journey.some(step => step.run?.endsWith('ci.mts journey'))).toBe(true)
})
