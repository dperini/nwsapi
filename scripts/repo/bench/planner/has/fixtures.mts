import type { Fixture } from '../fixtures.mts'

const families = ['flat', 'nested', 'external', 'ragged', 'clustered', 'mixed']

export function fixtures(): Fixture[] {
  const result: Fixture[] = []
  for (const [index, family] of families.entries()) {
    for (const anchors of [32, 192]) {
      for (const ratio of [0, 0.125, 1, 4]) {
        for (const predicates of [false, true]) {
          result.push(
            fixture(
              family,
              index < 3 ? 'train' : 'holdout',
              anchors,
              ratio,
              predicates,
            ),
          )
        }
      }
    }
  }
  for (const anchors of [1, 8]) {
    for (const ratio of [0, 4]) {
      result.push(fixture('small', 'holdout', anchors, ratio, false))
    }
  }
  return result
}

function fixture(
  family: string,
  split: 'train' | 'holdout',
  anchors: number,
  ratio: number,
  predicates: boolean,
): Fixture {
  const witnesses = anchors * ratio
  const external =
    family === 'external'
      ? witnesses
      : family === 'mixed'
        ? Math.floor(witnesses / 2)
        : 0
  const inside = witnesses - external
  const cards = Array.from({ length: anchors }, (_, card) => {
    let html = `<section class="card" data-ok="${card % 3 ? 1 : 0}">`
    for (let child = 0; child < 8; ++child) {
      const slot = card * 8 + child
      const position =
        family === 'clustered' ? slot : (slot * 73) % (anchors * 8)
      const cls = position < inside ? 'witness' : 'leaf'
      html += `<i class="${cls}" data-ok="${slot % 3 ? 1 : 0}"></i>`
    }
    return html
  })
  const suffix = predicates ? '[data-ok="1"]' : ''
  return {
    id: `${family}-${anchors}-${ratio}-${predicates ? 'filtered' : 'plain'}`,
    family,
    split,
    html:
      '<!doctype html><body>' +
      layout(family, cards) +
      '<aside>' +
      '<i class="witness" data-ok="1"></i>'.repeat(external) +
      '</aside></body>',
    selector: `.card${suffix}:has(.witness${suffix})`,
    tags: [],
    plannerFeatures: [anchors, witnesses, predicates ? 3 : 0, ratio],
    ...(anchors < 32 ? { skipProbe: true } : {}),
  }
}

function layout(family: string, cards: string[]) {
  let html = ''
  for (let index = 0; index < cards.length;) {
    let depth = 1
    if (family === 'nested') {
      depth = 8
    } else if (family === 'ragged') {
      depth = 1 + (index % 7)
    } else if (family === 'mixed' && index % 8 === 0) {
      depth = 4
    }
    const group = cards.slice(index, index + depth)
    html +=
      '<div><div>' +
      group.join('') +
      '</section>'.repeat(group.length) +
      '</div></div>'
    index += group.length
  }
  return html
}
