import assert from 'node:assert/strict'
import { vi } from 'vitest'
import type * as RunNode from '../../../../scripts/repo/lib/run-node.mts'

export async function invokeMainModule(
  load: () => Promise<unknown>,
  args: string[],
  subject: string,
) {
  const originalArgs = process.argv
  vi.doMock(
    '../../../../scripts/repo/lib/run-node.mts',
    async importOriginal => ({
      ...(await importOriginal<typeof RunNode>()),
      isMainModule: (url: string) => url.endsWith(subject),
    }),
  )
  try {
    vi.resetModules()
    process.argv = [originalArgs[0]!, 'script.mts', ...args]
    return await load()
  } finally {
    process.argv = originalArgs
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.resetModules()
  }
}

export async function missingMainArguments(
  load: () => Promise<unknown>,
  cases: string[][],
  subject: string,
) {
  for (let index = 0, length = cases.length; index < length; index += 1) {
    await assert.rejects(invokeMainModule(load, cases[index]!, subject))
  }
}
