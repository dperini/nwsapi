import { expect, test, vi } from 'vitest'
import { fullSetupPlan, main } from '../../../../scripts/repo/setup/run.mts'
import type { VoiceOverOptions } from '../../../../scripts/repo/setup/voiceover/run.mts'

test('full setup offers optional VoiceOver after core phases finish', async () => {
  const order: string[] = []
  const setup = vi.fn<() => void>(() => {
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

test('full setup failure skips VoiceOver and default setup asks about it', async () => {
  const setup = vi.fn<() => void>(() => {
    throw new Error('fixture failure')
  })
  const optional = vi.fn(async () => ({ status: 0, signal: null }))
  const log = vi.fn()
  expect((await main([], setup, optional, log)).status).toBe(1)
  expect(optional).not.toHaveBeenCalled()
  setup.mockClear()
  setup.mockImplementation(() => {})
  expect((await main([], setup, optional, log)).status).toBe(0)
  expect(optional).toHaveBeenCalledWith({ choice: 'ask' })
})

test('full setup help does not run phases or the optional setup', async () => {
  const setup = vi.fn()
  const optional = vi.fn()
  expect((await main(['--help'], setup, optional, vi.fn())).status).toBe(0)
  expect(setup).not.toHaveBeenCalled()
  expect(optional).not.toHaveBeenCalled()
})

test('full setup describes VoiceOver as opt-in without a redundant opt-out', async () => {
  const setup = vi.fn()
  const optional = vi.fn()
  const log = vi.fn()
  await main(['--describe', '--json'], setup, optional, log)
  const description = JSON.parse(log.mock.calls[0]![0] as string)
  expect(description.options).toContain('--voiceover')
  expect(description.options).not.toContain('--no-voiceover')
})

test('full setup dry run lists setup stages and paths without side effects', async () => {
  const setup = vi.fn()
  const optional = vi.fn()
  const log = vi.fn()
  const result = await main(['--dry-run', '--json'], setup, optional, log)
  expect(result.status).toBe(0)
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/full',
    steps: expect.arrayContaining([
      'Prepare the upstream WPT checkout and candidate inventory.',
    ]),
  })
  expect(fullSetupPlan('/checkout').targets).toContain(
    '/checkout/.cache/security',
  )
  expect(setup).not.toHaveBeenCalled()
  expect(optional).not.toHaveBeenCalled()
})
