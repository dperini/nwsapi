import { parse } from 'acorn'

export function replaceCacheLimit(source: string, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Cache limit must be a positive integer.')
  }
  const pending: unknown[] = [parse(source, { ecmaVersion: 'latest' })]
  const anchors: Array<{ start: number; end: number }> = []
  while (pending.length) {
    const node = pending.pop() as Record<string, unknown>
    if (!node || typeof node !== 'object') {
      continue
    }
    const id = node.id as { name?: string } | undefined
    const init = node.init as
      | { type?: string; value?: unknown; start: number; end: number }
      | undefined
    if (
      node.type === 'VariableDeclarator' &&
      id?.name === 'CACHE_LIMIT' &&
      init?.type === 'Literal' &&
      typeof init.value === 'number'
    ) {
      anchors.push(init)
    }
    pending.push(
      ...Object.values(node)
        .filter(value => value && typeof value === 'object')
        .flat(),
    )
  }
  if (anchors.length !== 1) {
    throw new Error('Expected exactly one CACHE_LIMIT assignment.')
  }
  return (
    source.slice(0, anchors[0].start) + limit + source.slice(anchors[0].end)
  )
}
