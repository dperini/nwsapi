export type ToyNode = {
  id: string
  label: string
  parent: string | undefined
  card: number | undefined
  kind: 'root' | 'card' | 'element' | 'warning'
}
export type SearchStep = {
  current: string
  description: string
  visit: number
  ascent: number
  mark: number | undefined
  match: number | undefined
}
export type SearchRoute = 'forward' | 'inverse'
export const names = ['A', 'B', 'C', 'D']

export function toyNodes(counts: number[], outside: boolean): ToyNode[] {
  const nodes: ToyNode[] = [
    {
      id: 'document',
      label: 'document',
      parent: undefined,
      card: undefined,
      kind: 'root',
    },
  ]
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]!
    const card = `card-${name}`
    const body = `body-${name}`
    nodes.push(
      {
        id: card,
        label: `Card ${name} · .card`,
        parent: 'document',
        card: i,
        kind: 'card',
      },
      {
        id: body,
        label: '<section> · card body',
        parent: card,
        card: i,
        kind: 'element',
      },
      {
        id: `text-${name}`,
        label: '<p> · ordinary text',
        parent: body,
        card: i,
        kind: 'element',
      },
    )
    for (let j = 0, count = counts[i]!; j < count; j += 1) {
      nodes.push({
        id: `warning-${name}-${j}`,
        label: `<span class="warning"> · warning ${j + 1}`,
        parent: body,
        card: i,
        kind: 'warning',
      })
    }
    nodes.push({
      id: `footer-${name}`,
      label: '<footer> · ordinary text',
      parent: card,
      card: i,
      kind: 'element',
    })
  }
  if (outside) {
    nodes.push({
      id: 'outside',
      label: '.warning · outside every card',
      parent: 'document',
      card: undefined,
      kind: 'warning',
    })
  }
  return nodes
}

function event(
  node: ToyNode,
  description: string,
  changes: Partial<SearchStep> = {},
): SearchStep {
  return {
    current: node.id,
    description,
    visit: 0,
    ascent: 0,
    mark: undefined,
    match: undefined,
    ...changes,
  }
}

function forwardTrace(nodes: ToyNode[]): SearchStep[] {
  const steps: SearchStep[] = []
  const cards = nodes.filter(node => node.kind === 'card')
  for (let i = 0, length = cards.length; i < length; i += 1) {
    const card = cards[i]!
    const descendants = nodes.filter(
      node => node.card === card.card && node.kind !== 'card',
    )
    steps.push(
      event(
        card,
        `Start at card ${names[i]}. Does anything inside it match .warning?`,
        { visit: 1 },
      ),
    )
    let found = false
    for (let j = 0, count = descendants.length; j < count; j += 1) {
      const node = descendants[j]!
      const warning = node.kind === 'warning'
      steps.push(
        event(
          node,
          warning
            ? `Found a warning. Keep card ${names[i]} and stop searching inside it. Its remaining descendants are skipped.`
            : `Visit ${node.label}. It is not a warning, so continue.`,
          { visit: 1, match: warning ? i : undefined },
        ),
      )
      if (warning) {
        found = true
        break
      }
    }
    if (!found) {
      steps.push(
        event(
          card,
          `All descendants checked. Card ${names[i]} has no warning, so skip it.`,
        ),
      )
    }
  }
  return steps
}

function inverseTrace(nodes: ToyNode[]): SearchStep[] {
  const steps: SearchStep[] = []
  const marked = new Set<number>()
  const byId = new Map(nodes.map(node => [node.id, node]))
  const warnings = nodes.filter(node => node.kind === 'warning')
  for (let i = 0, length = warnings.length; i < length; i += 1) {
    const warning = warnings[i]!
    steps.push(
      event(warning, `Start at ${warning.label}. Walk up its ancestor chain.`, {
        visit: 1,
      }),
    )
    let ancestor = byId.get(warning.parent!)
    while (ancestor) {
      const card = ancestor.kind === 'card' ? ancestor.card : undefined
      const duplicate = card !== undefined && marked.has(card)
      steps.push(
        event(
          ancestor,
          card === undefined
            ? `Walk upward to ${ancestor.label}. This is not a card candidate.`
            : duplicate
              ? `Card ${names[card]} is already marked. Another warning does not add another result.`
              : `Mark card ${names[card]} as an ancestor of a warning. It will be checked in document order later.`,
          { ascent: 1, mark: card },
        ),
      )
      if (card !== undefined) {
        marked.add(card)
      }
      ancestor = byId.get(ancestor.parent!)
    }
  }
  const cards = nodes.filter(node => node.kind === 'card')
  for (let i = 0, length = cards.length; i < length; i += 1) {
    const card = cards[i]!
    const keep = marked.has(i)
    steps.push(
      event(
        card,
        `Now check card ${names[i]} in document order. ${keep ? 'It is marked, so keep it.' : 'It is not marked, so skip it.'}`,
        { visit: 1, match: keep ? i : undefined },
      ),
    )
  }
  return steps
}

export function searchTrace(
  nodes: ToyNode[],
  route: SearchRoute,
): SearchStep[] {
  return route === 'forward' ? forwardTrace(nodes) : inverseTrace(nodes)
}

export function searchProgress(steps: SearchStep[], position: number) {
  const visited = steps.slice(0, position)
  return {
    current: visited.at(-1),
    matches: visited.flatMap(item =>
      item.match === undefined ? [] : [item.match],
    ),
    marked: new Set(
      visited.flatMap(item => (item.mark === undefined ? [] : [item.mark])),
    ),
    visits: visited.reduce((sum, item) => sum + item.visit, 0),
    ascents: visited.reduce((sum, item) => sum + item.ascent, 0),
  }
}

export function resultNames(matches: number[]) {
  return matches.length
    ? matches.map(index => `Card ${names[index]}`).join(' · ')
    : 'No cards yet'
}
