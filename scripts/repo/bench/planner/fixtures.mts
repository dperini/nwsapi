import type { Features } from './model.mts'

export interface Fixture {
  id: string
  family: string
  split: 'train' | 'holdout'
  html: string
  selector: string
  tags: string[]
  plannerFeatures?: Features
  skipProbe?: boolean
}

// Families are assigned before timing. Runtime features never include labels.
const families = [
  'flat',
  'nested',
  'alternating',
  'cards',
  'clustered',
  'ragged',
]
const names = ['article', 'aside', 'section', 'nav', 'header', 'footer']

export function fixtures(): Fixture[] {
  return families.flatMap((family, familyIndex) =>
    [128, 1024].flatMap(size =>
      [2, 6].flatMap(arity =>
        [0.02, 0.15, 0.4, 0.8].map(density => {
          const tags = names.slice(0, arity)
          const count = Math.max(arity, Math.floor(size * density))
          const nodes = Array.from({ length: size }, (_, i) => {
            const position = family === 'clustered' ? i : (i * 73) % size
            const tag = position < count ? tags[position % arity]! : 'div'
            const cls = i % 3 ? 'hit' : 'miss'
            return `<${tag} class="${cls}"></${tag}>`
          })
          return {
            id: `${family}-${size}-${arity}-${density}`,
            family,
            split: familyIndex < 3 ? 'train' : 'holdout',
            html: '<!doctype html><body>' + layout(family, nodes) + '</body>',
            selector: `:is(${tags.join(',')})`,
            tags,
          }
        }),
      ),
    ),
  )
}

function layout(family: string, nodes: string[]) {
  if (family === 'flat' || family === 'clustered') {
    return nodes.join('')
  }
  const width = family === 'cards' ? 8 : 16
  const groups = []
  for (let i = 0; i < nodes.length; i += width) {
    const content = nodes.slice(i, i + width).join('')
    const depth = family === 'ragged' ? 1 + ((i / width) % 7) : 2
    groups.push('<div>'.repeat(depth) + content + '</div>'.repeat(depth))
  }
  return family === 'alternating'
    ? groups.toReversed().join('')
    : groups.join('')
}
