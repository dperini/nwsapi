import assert from 'node:assert/strict'
import { vi } from 'vitest'
import type * as RunNode from '../../../../scripts/repo/lib/run-node.mts'

export async function missingMainArguments(
  load: () => Promise<unknown>,
  cases: string[][],
) {
  const originalArgs = process.argv
  vi.doMock(
    '../../../../scripts/repo/lib/run-node.mts',
    async importOriginal => ({
      ...(await importOriginal<typeof RunNode>()),
      isMainModule: () => true,
    }),
  )
  try {
    for (let index = 0, length = cases.length; index < length; index += 1) {
      vi.resetModules()
      process.argv = [originalArgs[0]!, 'script.mts', ...cases[index]!]
      await assert.rejects(load())
    }
  } finally {
    process.argv = originalArgs
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.resetModules()
  }
}
