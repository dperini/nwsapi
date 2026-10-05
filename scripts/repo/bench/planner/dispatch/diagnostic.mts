import type { Fixture } from '../fixtures.mts'

// These cases diagnose frozen policies. They do not train model weights.
export function diagnosticFixtures(): Fixture[] {
  const entries: Fixture[] = []
  for (const depth of [2, 7, 15]) {
    for (const fraction of [0.2, 0.8]) {
      for (const anchors of [48, 144]) {
        for (const ratio of [3, 5]) {
          for (const mask of [0, 1, 2, 3]) {
            entries.push(makeFixture(depth, fraction, anchors, ratio, mask))
          }
        }
      }
    }
  }
  return entries
}

function makeFixture(
  depth: number,
  fraction: number,
  anchors: number,
  ratio: number,
  mask: number,
): Fixture {
  const witnesses = anchors * ratio
  const outside = Math.floor(witnesses * fraction)
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
    id: `diagnostic-${depth}-${fraction}-${anchors}-${ratio}-${mask}`,
    family: `dispatch-diagnostic-${depth}-${fraction}`,
    split: 'holdout',
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
