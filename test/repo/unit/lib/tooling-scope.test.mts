import { expect, test, vi } from 'vitest'
const glob = vi.hoisted(() => vi.fn(() => ['z.mts', 'a.mts']))
vi.mock('node:fs', async original => ({
  ...(await original<object>()),
  globSync: glob,
}))
import { toolingFiles } from '../../../../scripts/repo/lib/tooling-scope.mts'
test('tooling scope uses a repository anchored sorted inventory', () => {
  expect(toolingFiles()).toEqual(['a.mts', 'z.mts'])
  expect(glob).toHaveBeenCalledWith(
    expect.arrayContaining(['scripts/repo/**/*.mts', 'test/repo/**/*.mts']),
    { cwd: expect.any(String) },
  )
})
