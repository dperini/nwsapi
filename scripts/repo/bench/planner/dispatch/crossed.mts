import type { Fixture } from '../fixtures.mts'
import { fixtures as controlFixtures } from '../has/fixtures.mts'

// Whole layouts stay together so a model cannot learn the evaluation layout.
export function crossedFixtures(): Fixture[] {
  const entries = controlFixtures()
  for (let layout = 0; layout < 8; ++layout) {
    for (const anchors of [32, 96, 192]) {
      for (const ratio of [2.5, 4]) {
        for (const mask of [0, 1, 2, 3]) {
          entries.push(makeFixture(layout, anchors, ratio, mask))
        }
      }
    }
  }
  return entries
}

function makeFixture(
  layout: number,
  anchors: number,
  ratio: number,
  mask: number,
): Fixture {
  const witnesses = anchors * ratio
  const outside = Math.floor(
    witnesses * [0.1, 0.35, 0.6, 0.85, 0.2, 0.45, 0.7, 0.9][layout]!,
  )
  const inside = witnesses - outside
  const capacity = Math.ceil(inside / anchors)
  const cards = Array.from({ length: anchors }, (_card, index) => {
    const children = Array.from(
      { length: Math.max(12, capacity) },
      (_child, child) => {
        const position = index * capacity + child
        const hit = child < capacity && position < inside
        return `<i class="${hit ? 'witness' : 'leaf'}" data-ok="${(index + child) % 3 ? 1 : 0}"></i>`
      },
    ).join('')
    return `<section class="card" data-ok="${index % 3 ? 1 : 0}">${children}`
  })
  const depth = [1, 5, 9, 3, 7, 11, 4, 13][layout]!
  const groups: string[] = []
  for (let start = 0; start < anchors; start += depth) {
    const group = cards.slice(start, start + depth)
    groups.push(
      `<main>${group.join('')}${'</section>'.repeat(group.length)}</main>`,
    )
  }
  const anchor = mask & 2 ? '[data-ok="1"]' : ''
  const witness = mask & 1 ? '[data-ok="1"]' : ''
  return {
    id: `crossed-${layout}-${anchors}-${ratio}-${mask}`,
    family: `dispatch-crossed-${layout}`,
    split: layout < 4 ? 'train' : 'holdout',
    html:
      '<!doctype html><body>' +
      groups.join('') +
      '<aside>' +
      '<i class="witness" data-ok="1"></i>'.repeat(outside) +
      '</aside></body>',
    selector: `.card${anchor}:has(.witness${witness})`,
    tags: [],
    plannerFeatures: [anchors, witnesses, mask, ratio],
  }
}
