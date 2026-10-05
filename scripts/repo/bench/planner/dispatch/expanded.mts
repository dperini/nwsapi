import type { Fixture } from '../fixtures.mts'
import { fixtures as controlFixtures } from '../has/fixtures.mts'

// Whole layouts stay together so a model cannot learn the evaluation layout.
export function expandedFixtures(): Fixture[] {
  const entries = controlFixtures()
  for (let layout = 0; layout < 8; ++layout) {
    for (const [countIndex, anchors] of [64, 128, 192, 256].entries()) {
      for (const [ratioIndex, ratio] of [0.25, 2.5, 4, 8].entries()) {
        const mask = (countIndex + ratioIndex + layout) % 4
        entries.push(makeFixture(layout, anchors, ratio, mask))
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
  const outside = Math.floor(witnesses * [0, 0.25, 0.5, 0.75][layout % 4]!)
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
  const depth = [1, 4, 8, 2, 6, 12, 3, 10][layout]!
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
    id: `expanded-${layout}-${anchors}-${ratio}-${mask}`,
    family: `dispatch-expanded-${layout}`,
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
