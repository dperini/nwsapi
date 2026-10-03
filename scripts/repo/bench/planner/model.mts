export type Features = [
  count: number,
  total: number,
  arity: number,
  density: number,
]
export interface Observation {
  features: Features
  costs: [merge: number, broad: number]
}
export interface Domain {
  min: Features
  max: Features
  arities: number[]
}
export type Tree =
  | { broad: boolean }
  | { feature: number; threshold: number; left: Tree; right: Tree }

function leaf(rows: Observation[]) {
  const costs: [number, number] = [0, 0]
  for (const row of rows) {
    const best = Math.min(...row.costs)
    costs[0] += row.costs[0] / best
    costs[1] += row.costs[1] / best
  }
  return { tree: { broad: costs[1]! < costs[0]! }, loss: Math.min(...costs) }
}

// Minimize normalized execution cost, so expensive mistakes matter more.
export function train(rows: Observation[], depth = 3): Tree {
  const base = leaf(rows)
  if (!depth || rows.length < 12) {
    return base.tree
  }
  let best: { feature: number; threshold: number; loss: number } | undefined
  for (let feature = 0; feature < 4; ++feature) {
    const values = [
      ...new Set(rows.map(row => row.features[feature]!)),
    ].toSorted((a, b) => a - b)
    for (let i = 1; i < values.length; ++i) {
      const threshold = (values[i - 1]! + values[i]!) / 2
      const left = rows.filter(row => row.features[feature]! <= threshold)
      const right = rows.filter(row => row.features[feature]! > threshold)
      if (left.length < 6 || right.length < 6) {
        continue
      }
      const loss = leaf(left).loss + leaf(right).loss
      if (loss < (best?.loss ?? base.loss - 0.02 * rows.length)) {
        best = { feature, threshold, loss }
      }
    }
  }
  if (!best) {
    return base.tree
  }
  const { feature, threshold } = best
  return {
    feature,
    threshold,
    left: train(
      rows.filter(row => row.features[feature]! <= threshold),
      depth - 1,
    ),
    right: train(
      rows.filter(row => row.features[feature]! > threshold),
      depth - 1,
    ),
  }
}

export function expression(
  tree: Tree,
  names = ['count', 'total', 'arity', '(count / total)'],
): string {
  if ('broad' in tree) {
    return String(tree.broad)
  }
  const name = names[tree.feature]!
  return `(${name} <= ${tree.threshold} ? ${expression(tree.left, names)} : ${expression(tree.right, names)})`
}

export function decide(tree: Tree, features: Features): boolean {
  if ('broad' in tree) {
    return tree.broad
  }
  return decide(
    features[tree.feature]! <= tree.threshold ? tree.left : tree.right,
    features,
  )
}

export function guardedExpression(tree: Tree, domain: Domain) {
  const names = ['count', 'total', 'arity', '(count / total)']
  const guards = [1, 0, 3].flatMap(index => [
    `${names[index]} >= ${domain.min[index]}`,
    `${names[index]} <= ${domain.max[index]}`,
  ])
  guards.unshift(
    '(' + domain.arities.map(arity => `arity === ${arity}`).join(' || ') + ')',
  )
  return `(${guards.join(' && ')}) ? ${expression(tree)} : (count > 0 && count * 3 > total)`
}
