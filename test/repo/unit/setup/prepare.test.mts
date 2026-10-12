import { expect, test, vi } from 'vitest'
import { prepareCheckout } from '../../../../scripts/repo/setup/prepare.mts'

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
    'scripts/repo/video/prepare.mts',
    'scripts/repo/build/run.mts',
  ])
  expect(run.mock.calls.every(call => call[0].endsWith('/node'))).toBe(true)
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
