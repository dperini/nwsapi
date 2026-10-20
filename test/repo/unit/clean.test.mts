import { expect, test, vi } from 'vitest'
import { cleanPlan, describeClean, main } from '../../../scripts/repo/clean.mts'

test('clean plans name affected paths for each scope', () => {
  expect(cleanPlan('dependencies', '/checkout').changes).toEqual([
    '/checkout/node_modules',
  ])
  expect(cleanPlan('tools', '/checkout').changes).toContain(
    '/checkout/.cache/bin',
  )
})

test('dry-run returns a plan without deleting files', async () => {
  const log = vi.fn()
  await main(
    ['--scope', 'dependencies', '--dry-run', '--json'],
    log,
    '/checkout',
  )
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    scope: 'dependencies',
    changes: ['/checkout/node_modules'],
  })
})

test('description declares standard flags and supported scopes', () => {
  expect(describeClean().options).toContain('--json')
  expect(describeClean().options).toContain('--describe')
  expect(describeClean().options).toContain('--dry-run')
})
