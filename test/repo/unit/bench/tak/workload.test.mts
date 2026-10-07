import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

test.each(['simple', 'descendant', 'has'])(
  'Tak workload %s executes identity-checked public queries',
  async name => {
    const original = process.argv
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.resetModules()
    process.argv = [original[0]!, 'tak/workload.mts', name]
    try {
      await import('../../../../../scripts/repo/bench/tak/workload.mts')
      assert.equal(log.mock.calls.length, 1)
    } finally {
      process.argv = original
    }
  },
)

test('Tak workload rejects unknown workloads before starting queries', async () => {
  const original = process.argv
  vi.resetModules()
  process.argv = [original[0]!, 'tak/workload.mts', 'unknown']
  try {
    await assert.rejects(
      import('../../../../../scripts/repo/bench/tak/workload.mts'),
    )
  } finally {
    process.argv = original
  }
})
