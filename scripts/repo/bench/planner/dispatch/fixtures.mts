import { fixtures as previousFixtures } from '../has/fixtures.mts'
import type { Fixture } from '../fixtures.mts'

export function fixtures(): Fixture[] {
  const entries = previousFixtures()
  for (let template = 0; template < 10; ++template) {
    for (const anchors of [48, 256]) {
      for (const ratio of [0.125, 4]) {
        for (const filtered of [false, true]) {
          entries.push(makeFixture(template, anchors, ratio, filtered))
        }
      }
    }
  }
  return entries
}

function makeFixture(
  template: number,
  anchors: number,
  ratio: number,
  filtered: boolean,
): Fixture {
  const count = anchors * ratio
  const outside = template % 3 === 0 ? count : Math.floor(count / 4)
  const inside = count - outside
  const suffix = filtered ? '[data-ok="1"]' : ''
  const cards = Array.from({ length: anchors }, (_, index) => {
    const children = Array.from({ length: 8 }, (_value, child) => {
      const position = index * 8 + child
      const shuffled = (position * 73) % (anchors * 8)
      const hit = (template % 2 ? position : shuffled) < inside
      return `<i class="${hit ? 'witness' : 'leaf'}" data-ok="${position % 3 ? 1 : 0}"></i>`
    }).join('')
    return `<section class="card" data-ok="${index % 3 ? 1 : 0}">${children}`
  })
  const depth = [1, 3, 8, 2, 6, 12, 4, 9, 5, 16][template]!
  const groups: string[] = []
  for (let start = 0; start < anchors; start += depth) {
    const group = cards.slice(start, start + depth)
    groups.push(
      `<main><div>${group.join('')}${'</section>'.repeat(group.length)}</div></main>`,
    )
  }
  return {
    id: `dispatch-${template}-${anchors}-${ratio}-${filtered ? 'filtered' : 'plain'}`,
    family: `dispatch-template-${template}`,
    split: template < 6 ? 'train' : 'holdout',
    html:
      '<!doctype html><body>' +
      groups.join('') +
      '<aside>' +
      '<i class="witness" data-ok="1"></i>'.repeat(outside) +
      '</aside></body>',
    selector: `.card${suffix}:has(.witness${suffix})`,
    tags: [],
    plannerFeatures: [anchors, count, filtered ? 3 : 0, ratio],
  }
}

export function split(family: string) {
  const expanded = /^dispatch-(?:expanded|crossed)-(\d+)$/.exec(family)
  if (expanded) {
    const index = Number(expanded[1])
    return index < 4 ? 'train' : index < 6 ? 'validation' : 'evaluation'
  }
  const match = /^dispatch-template-(\d+)$/.exec(family)
  if (!match) {
    return 'development'
  }
  const index = Number(match[1])
  return index < 6 ? 'train' : index < 8 ? 'validation' : 'evaluation'
}
