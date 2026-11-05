export interface CacheCase {
  name: string
  count: number
  passes: number
  shape: 'class' | 'complex' | 'mixed' | 'changed'
  settings?: { CACHE_LIMIT: number; CACHE_BYTES: number }
}

export const cacheCases: CacheCase[] = [
  { name: 'small-warm', count: 32, passes: 2000, shape: 'class' },
  ...[1000, 1001, 2300].map(count => ({
    name: `class-${count}`,
    count,
    passes: 10,
    shape: 'class' as const,
  })),
  {
    name: 'byte-pressure-complex-2300',
    count: 2300,
    passes: 10,
    shape: 'complex',
    settings: { CACHE_LIMIT: 100000, CACHE_BYTES: 2 * 1024 * 1024 },
  },
  { name: 'hot-with-one-offs', count: 2300, passes: 10, shape: 'mixed' },
  { name: 'changed-stylesheet', count: 2300, passes: 20, shape: 'changed' },
]

export function selectorsFor(spec: CacheCase, pass: number): string[] {
  const result: string[] = []
  for (let index = 0; index < spec.count; ++index) {
    if (spec.shape === 'complex') {
      result.push(
        `:where(.css-x).ant-btn-${index}:not(:disabled):not(.ant-btn-disabled):hover`,
      )
    } else if (spec.shape === 'mixed' && pass >= 0) {
      result.push(`.c${index % 32}`, `.oneoff-${pass}-${index}`)
    } else {
      const prefix = spec.shape === 'changed' && pass >= 0 ? 'changed' : 'c'
      result.push(`.${prefix}${index}`)
    }
  }
  return result
}

export function warmupFor(spec: CacheCase): string[] {
  if (spec.shape === 'mixed') {
    return Array.from({ length: 32 }, (_, index) => `.c${index}`)
  }
  return selectorsFor(spec, -1)
}
