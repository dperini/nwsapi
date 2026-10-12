import { expect, test, vi } from 'vitest'
import { main } from '../../../../scripts/repo/setup/run.mts'
import type { VoiceOverOptions } from '../../../../scripts/repo/setup/voiceover/run.mts'

test('full setup offers optional VoiceOver after core phases finish', async () => {
  const order: string[] = []
  const setup = vi.fn(() => {
    order.push('core')
  })
  const optional = vi.fn(async (options?: VoiceOverOptions) => {
    const choice = options?.choice ?? 'ask'
    order.push(`voiceover:${choice}`)
    return { status: 0, signal: null }
  })
  const result = await main(['--voiceover'], setup, optional, vi.fn())
  expect(result.status).toBe(0)
  expect(order).toEqual(['core', 'voiceover:yes'])
})

test('full setup failure skips VoiceOver and conflicting flags reject before setup', async () => {
  const setup = vi.fn(() => {
    throw new Error('fixture failure')
  })
  const optional = vi.fn()
  const log = vi.fn()
  expect((await main([], setup, optional, log)).status).toBe(1)
  expect(optional).not.toHaveBeenCalled()
  setup.mockClear()
  expect(
    (await main(['--voiceover', '--no-voiceover'], setup, optional, log))
      .status,
  ).toBe(2)
  expect(setup).not.toHaveBeenCalled()
})

test('full setup help does not run phases or the optional setup', async () => {
  const setup = vi.fn()
  const optional = vi.fn()
  expect((await main(['--help'], setup, optional, vi.fn())).status).toBe(0)
  expect(setup).not.toHaveBeenCalled()
  expect(optional).not.toHaveBeenCalled()
})
