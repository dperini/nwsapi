import { expect, test, vi } from 'vitest'
import { main } from '../../../../scripts/repo/setup/node-preflight.mts'

test('the install preflight rejects unpatched Node and permits fixed releases', () => {
  const log = vi.fn()
  expect(main('22.23.3', log)).toBe(1)
  expect(log).toHaveBeenCalledWith(expect.stringContaining('22.23.4'))
  expect(main('24.22.1', log)).toBe(0)
  expect(main('26.12.1', log)).toBe(0)
})
