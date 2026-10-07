import { expect, test, vi } from 'vitest'
const format = vi.hoisted(() => vi.fn())
vi.mock('oxfmt', () => ({ format }))
import { formatOutput } from '../../../../../scripts/repo/build/post/format.mts'
test('formats output or rejects formatter diagnostics', async () => {
  format.mockResolvedValueOnce({ code: 'formatted', errors: [] })
  expect(await formatOutput('fixture.js', 'input')).toBe('formatted')
  format.mockResolvedValueOnce({
    code: '',
    errors: [{ message: 'invalid syntax' }, { message: 'invalid token' }],
  })
  await expect(formatOutput('fixture.js', 'bad')).rejects.toThrow()
})
