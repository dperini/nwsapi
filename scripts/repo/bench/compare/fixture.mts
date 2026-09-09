export type Layout = 'adjacent' | 'separated' | 'nested'

export function fixture(matches: number, groups: number, layout: Layout) {
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

export function selectors(groups: number) {
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
