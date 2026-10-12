import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parse } from 'yaml'
import { checkInlineWorkflows } from '../../../../scripts/repo/check/workflows.mts'

function workflow() {
  return parse(
    readFileSync(
      new URL('../../../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
  )
}

test('the required Node gate includes runtime and every unit shard', () => {
  const { jobs } = workflow()
  expect(jobs.node.needs).toEqual(['runtime', 'unit'])
  expect(jobs.node.if).toBe(
    "always() && (github.event_name == 'push' || github.event_name == 'pull_request')",
  )
  const gate = jobs.node.steps.at(-1)
  expect(gate.if).toBe('always()')
  expect(gate.env).toEqual({
    RUNTIME_RESULT: '${{ needs.runtime.result }}',
    UNIT_RESULT: '${{ needs.unit.result }}',
    FULL_NODE: '${{ needs.runtime.outputs.fullNode }}',
  })
  expect(jobs.unit.needs).toBe('runtime')
  expect(jobs.unit.if).toBe(
    "${{ !cancelled() && needs.runtime.outputs.fullNode == 'true' }}",
  )
  expect(jobs.unit.strategy['fail-fast']).toBe(false)
  expect(jobs.unit.strategy.matrix.shard).toBe(
    '${{ fromJSON(needs.runtime.outputs.unitShards) }}',
  )
})

test('same-run shard artifacts keep fork permissions read-only', () => {
  const config = workflow()
  expect(config.permissions).toEqual({ contents: 'read' })
  expect(config.jobs.node.permissions).toEqual({
    contents: 'read',
    actions: 'read',
  })
  expect(config.on.pull_request).toBeDefined()
  expect(config.on.pull_request_target).toBeUndefined()
  const upload = config.jobs.unit.steps.find(
    (step: { uses?: string }) =>
      step.uses === './.github/actions/repo/upload-artifact',
  )
  expect(upload.if).toBe('always()')
  expect(upload.with.name).toBe(
    'unit-shard-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.shard }}',
  )
  expect(upload.with['if-no-files-found']).toBe('error')
  expect(() => checkInlineWorkflows()).not.toThrow()
})

test('publishing keeps qualification before staging with independent audits in parallel', () => {
  const config = parse(
    readFileSync(
      new URL('../../../../.github/workflows/publish-npm.yml', import.meta.url),
      'utf8',
    ),
  )
  const steps = config.jobs.stage.steps
  const audits = steps.findIndex(
    (step: { parallel?: unknown }) => step.parallel,
  )
  expect(
    steps[audits].parallel.map((step: { run: string }) => step.run),
  ).toEqual(['pnpm run check', 'pnpm run security'])
  const qualification = steps.findIndex((step: { run?: string }) =>
    step.run?.includes('pnpm run cover'),
  )
  const stage = steps.findIndex(
    (step: { run?: string }) => step.run === 'pnpm run publish:stage',
  )
  expect(audits).toBeGreaterThan(-1)
  expect(qualification).toBeGreaterThan(audits)
  expect(stage).toBeGreaterThan(qualification)
  expect(config.jobs.stage.environment).toBe('publish-npm')
  expect(config.concurrency['cancel-in-progress']).toBe(false)
})
