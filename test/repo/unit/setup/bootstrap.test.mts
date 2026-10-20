import { expect, test, vi } from 'vitest'
import {
  bootstrapPlan,
  describeBootstrap,
  main,
} from '../../../../scripts/repo/setup/bootstrap.mts'

test('bootstrap dry-run lists tool, install, preparation, and output paths', () => {
  const result = bootstrapPlan()
  expect(result.steps).toHaveLength(3)
  expect(result.targets).toContain('.cache/bin/toolchain.json')
  expect(result.targets).toContain('node_modules')
  expect(result.targets).toContain('dist/nwsapi.js')
})

test('tools-only preview excludes dependency and build targets', () => {
  const result = bootstrapPlan(true)
  expect(result.steps).toHaveLength(1)
  expect(result.targets).not.toContain('node_modules')
  expect(result.targets).not.toContain('dist/nwsapi.js')
})

test('bootstrap describes flags and previews without invoking setup', async () => {
  const log = vi.fn()
  const setup = vi.fn(async () => ({ status: 0, signal: null }))
  await main(['--dry-run'], setup, log)
  expect(setup).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Would prepare'))
  expect(describeBootstrap().options).toContain('--dry-run')
})
