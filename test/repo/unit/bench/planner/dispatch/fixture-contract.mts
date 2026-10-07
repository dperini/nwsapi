import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import type { Fixture } from '../../../../../../scripts/repo/bench/planner/fixtures.mts'

export function checkFixtures(entries: Fixture[]) {
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
  const families = new Map<string, Fixture[]>()
  entries.forEach(entry => {
    const group = families.get(entry.family) ?? []
    group.push(entry)
    families.set(entry.family, group)
  })
  const selected = [...families.values()].flatMap(group => [
    group[0]!,
    group.at(-1)!,
  ])
  for (let index = 0, length = selected.length; index < length; index += 1) {
    const fixture = selected[index]!
    const features = fixture.plannerFeatures!
    const dom = new JSDOM(fixture.html)
    try {
      assert.equal(
        dom.window.document.querySelectorAll('.card').length,
        features[0],
      )
      assert.equal(
        dom.window.document.querySelectorAll('.witness').length,
        features[1],
      )
      assert.ok(
        dom.window.document.querySelectorAll(fixture.selector).length <=
          features[0],
      )
    } finally {
      dom.window.close()
    }
  }
}
