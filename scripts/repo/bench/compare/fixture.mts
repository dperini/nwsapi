export type Scenario = 'grouped' | 'ancestor' | 'has' | 'sibling'

export type Layout = 'adjacent' | 'separated' | 'nested'

export function fixture(
  matches: number,
  groups: number,
  layout: Layout,
  scenario: Scenario = 'grouped',
) {
  if (scenario === 'has' || scenario === 'sibling') {
    return (
      '<!doctype html><body>' +
      Array.from({ length: 256 }, (_, i) => {
        const target =
          '<div class=target><p' +
          (i < matches ? ' data-hit' : '') +
          '></p><p></p><p></p><p></p></div>'
        return (
          '<section><article class=card>' +
          target +
          '</article>' +
          target +
          (scenario === 'sibling' ? '<span></span>'.repeat(16) : '') +
          '</section>'
        )
      }).join('')
    )
  }
  if (scenario === 'ancestor') {
    const depth = layout === 'nested' ? 8 : 0
    return (
      '<!doctype html><body><main class=ancestor>' +
      '<div>'.repeat(depth) +
      '<section class=branch>' +
      Array.from(
        { length: 256 },
        (_, i) => '<p class="' + (i < matches ? 'hit' : '') + '"></p>',
      ).join('') +
      '</section>' +
      '</div>'.repeat(depth) +
      '</main>'
    )
  }
  return (
    '<!doctype html><body>' +
    Array.from({ length: 256 }, (_, i) => {
      const element =
        '<p class="' + (i < matches ? 'hit g' + (i % groups) : '') + '"></p>'
      return layout === 'nested'
        ? '<section>' + element + '</section>'
        : element + (layout === 'separated' ? ' gap <!-- gap -->' : '')
    }).join('')
  )
}

export function selectors(groups: number, scenario: Scenario = 'grouped') {
  if (scenario === 'ancestor') {
    return [
      '.ancestor .branch > p.hit',
      '.ancestor:nth-child(1) .branch > p.hit',
    ]
  }
  if (scenario === 'sibling') {
    return ['.card:has(+ div [data-hit])', '.card:has(~ div [data-hit])']
  }
  if (scenario === 'has') {
    return [
      '.card:has([data-hit])',
      '.card:has(> .target [data-hit])',
      '.card:has(+ .target [data-hit])',
      '.card:has(~ .target [data-hit])',
    ]
  }
  return ['.hit', Array.from({ length: groups }, (_, i) => '.g' + i).join(',')]
}

export function checkResults(actual: ArrayLike<Element>, expected: Element[]) {
  if (
    actual.length !== expected.length ||
    expected.some((node, i) => node !== actual[i])
  ) {
    throw new Error(
      'Comparison returned incorrect identities, order, or duplicates',
    )
  }
}
