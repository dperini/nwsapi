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
    const anchor = cacheLimitLiteral(node)
    if (anchor) {
      anchors.push(anchor)
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
    source.slice(0, anchors[0]!.start) + limit + source.slice(anchors[0]!.end)
  )
}

function cacheLimitLiteral(node: Record<string, unknown>) {
  const property = node['type'] === 'Property'
  const id = (property ? node['key'] : node['id']) as
    | { name?: string; value?: string }
    | undefined
  const init = (property ? node['value'] : node['init']) as
    | { type?: string; value?: unknown; start: number; end: number }
    | undefined
  if (
    (property || node['type'] === 'VariableDeclarator') &&
    (id?.name === 'CACHE_LIMIT' || id?.value === 'CACHE_LIMIT') &&
    init?.type === 'Literal' &&
    typeof init.value === 'number'
  ) {
    return init
  }
  return undefined
}
