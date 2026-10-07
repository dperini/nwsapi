import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

vi.mock('../../../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    documentation: { html: () => '<main></main>' },
    components: { html: () => '<main></main>' },
    atomic: { html: () => '<main></main>' },
  },
}))

test('workload fixtures with no eligible anchors retain a finite ratio and skip route probes', async () => {
  const { fixtures } =
    await import('../../../../../../scripts/repo/bench/planner/has/fixtures.mts')
  const pages = fixtures().filter(entry => entry.family.startsWith('page-'))
  assert.equal(pages.length, 12)
  for (let index = 0, length = pages.length; index < length; index += 1) {
    assert.deepEqual(pages[index]!.plannerFeatures, [0, 0, 0, 0])
    assert.equal(pages[index]!.skipProbe, true)
  }
})
