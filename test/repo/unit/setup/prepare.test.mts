import { expect, test, vi } from 'vitest'
import {
  main,
  prepareCheckout,
  preparePlan,
} from '../../../../scripts/repo/setup/prepare.mts'

test('prepare verifies tools before source preparation and a repeatable build', async () => {
  const ensure = vi.fn(async () => '/checkout-tools')
  const run = vi.fn(
    (_command: string, _args: string[], _env: NodeJS.ProcessEnv) => ({
      status: 0,
      signal: null,
    }),
  )
  await prepareCheckout(ensure, run)
  expect(ensure).toHaveBeenCalledOnce()
  expect(run.mock.calls.map(call => call[1][0])).toEqual([
    'scripts/repo/setup/agents.mts',
    'scripts/repo/setup/editor.mts',
    'scripts/repo/setup/hooks.mts',
    'scripts/repo/video/prepare.mts',
    'scripts/repo/build/run.mts',
  ])
  expect(run.mock.calls.every(call => /node(?:\.exe)?$/.test(call[0]))).toBe(
    true,
  )
  expect(run.mock.calls[0]?.[2]?.['PATH']).toContain('/checkout-tools')
  expect(run.mock.calls[0]?.[2]?.['NODE_OPTIONS']).toBeUndefined()
})

test('prepare stops at the first failed phase and prints a direct retry', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const run = vi.fn(() => ({ status: 1, signal: null }))
  const original = process.exitCode
  try {
    await prepareCheckout(async () => '/checkout-tools', run)
    expect(run).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(
      'Retry: node scripts/repo/setup/prepare.mts',
    )
    expect(process.exitCode).toBe(1)
  } finally {
    process.exitCode = original
    log.mockRestore()
  }
})

test('prepare dry run lists setup and build paths without provisioning tools', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await main(['--dry-run', '--json'])
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/prepare',
    targets: expect.arrayContaining([
      expect.stringContaining('hooks'),
      expect.stringContaining('dist/'),
      expect.stringContaining('.vscode/settings.json'),
      expect.stringContaining('.zed/settings.json'),
    ]),
  })
  expect(preparePlan('/checkout').targets).toEqual(
    expect.arrayContaining([expect.stringContaining('hooks')]),
  )
})
