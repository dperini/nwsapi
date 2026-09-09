import { expect, test } from 'vitest'
import { cases } from '../../../scripts/repo/bench/cases.mts'
import { DOCUMENTS } from '../../../scripts/repo/bench/documents.mts'
import { world } from '../../../scripts/repo/bench/world.mts'

test('practical query groups exercise nonempty results in their own fixtures', () => {
  for (const fixture of ['components', 'documentation', 'atomic'] as const) {
    const subject = world(DOCUMENTS[fixture].html())
    try {
      expect(cases[fixture]![fixture]).toHaveLength(4)
      for (const selector of cases[fixture]![fixture]!) {
        const expected = Array.from(subject.document.querySelectorAll(selector))
        expect(expected.length, selector).toBeGreaterThan(0)
        expect(
          subject.engines.nwsapi.select(selector, subject.document),
          selector,
        ).toEqual(expected)
      }
    } finally {
      subject.dom.window.close()
    }
  }
})
