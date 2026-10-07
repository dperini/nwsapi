import { expect, test } from 'vitest'
test('direct build staging is rejected', async () => {
  await expect(
    import('../../../../scripts/repo/build/require-staging.mts'),
  ).rejects.toThrow()
})
