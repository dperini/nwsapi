import { expect, test, vi } from 'vitest'
import {
  bootstrapPlan,
  describeBootstrap,
  main,
  runCoreSetup,
} from '../../../../scripts/repo/setup/bootstrap.mts'

test('bootstrap dry-run lists tool, install, preparation, and output paths', () => {
  const result = bootstrapPlan()
  expect(result.steps).toHaveLength(3)
  expect(result.targets).toContain('.cache/bin/toolchain.json')
  expect(result.targets).toContain('node_modules')
  expect(result.targets).toContain('dist/nwsapi.js')
})

test('bootstrap describes flags and previews without invoking setup', async () => {
  const log = vi.fn()
  const setup = vi.fn(async () => ({ status: 0, signal: null }))
  await main(['--dry-run'], setup, log)
  expect(setup).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Would prepare'))
  expect(describeBootstrap().options).toContain('--dry-run')
  expect(describeBootstrap().options).toContain('--voiceover')
  expect(describeBootstrap().options).not.toContain('--tools-only')
  expect(describeBootstrap().options).not.toContain('--no-voiceover')
})

test('bootstrap asks about VoiceOver by default and only opts in when requested', async () => {
  const run = vi.fn(async () => ({ status: 0, signal: null }))
  const optional = vi.fn(async () => ({ status: 0, signal: null }))
  const log = vi.fn()

  expect((await main([], run, log, optional)).status).toBe(0)
  expect(optional).toHaveBeenLastCalledWith({ choice: 'ask' })

  expect((await main(['--voiceover'], run, log, optional)).status).toBe(0)
  expect(optional).toHaveBeenLastCalledWith({ choice: 'yes' })

  optional.mockClear()
  const failedRun = vi.fn(async () => ({ status: 7, signal: null }))
  expect((await main([], failedRun, log, optional)).status).toBe(7)
  expect(optional).not.toHaveBeenCalled()
})

test('bootstrap setup rejects Node versions below the applicable security release', async () => {
  const log = vi.fn()
  const setup = vi.fn(async () => '/tools')
  const run = vi.fn(() => ({ status: 0, signal: null }))
  const result = await runCoreSetup('24.22.0', setup, run, log)
  expect(result.status).toBe(1)
  expect(setup).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith(expect.stringContaining('24.22.1'))
})
