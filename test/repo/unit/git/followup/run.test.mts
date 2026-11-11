import { expect, test, vi } from 'vitest'
import { main } from '../../../../../scripts/repo/git/followup/run.mts'

test('help exits without scheduling work', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await main(['--help'])
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('commit:followup')
  } finally {
    log.mockRestore()
  }
})

test('invalid arguments cannot accidentally schedule work', async () => {
  await expect(main(['unknown'])).rejects.toThrow('Expected no arguments')
})
