import { expect, test, vi } from 'vitest'
import {
  describeToolSetup,
  main,
  toolSetupPlan,
} from '../../../../scripts/repo/setup/tools.mts'

test('tool setup preview lists pinned versions and checkout destinations', () => {
  const plan = toolSetupPlan()
  expect(plan.tools.map(tool => tool.name)).toEqual([
    'nub',
    'pnpm',
    'npm',
    'sfw',
    'mise',
  ])
  expect(plan.targets).toContain('.cache/bin/toolchain.json')
  expect(plan.targets).toContain('.cache/external-tools')
})

test('tool setup dry-run does not call the installer', async () => {
  const setup = vi.fn(async () => '/checkout/.cache/bin')
  const log = vi.fn()
  await main(['--dry-run', '--json'], setup, log)
  expect(setup).not.toHaveBeenCalled()
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/tools',
  })
  expect(describeToolSetup().options).toContain('--dry-run')
})
