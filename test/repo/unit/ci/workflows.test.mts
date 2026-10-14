import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

interface Workflow {
  jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}

test('CI provisions full tools in the job that smoke-tests mold', () => {
  const workflow = parse(
    readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'),
  ) as Workflow
  const jobs = Object.values(workflow.jobs)
  const moldJob = jobs.find(job =>
    job.steps?.some(step => step.name === 'Verify the pinned Mold linker'),
  )

  expect(moldJob).toBeDefined()
  expect(
    moldJob?.steps?.find(step =>
      step.run?.includes('scripts/repo/setup/tools.mts'),
    )?.run,
  ).toContain('--full')
})
