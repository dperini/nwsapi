export interface ScanCase {
  name: string
  count: number
  passes: number
  shape: 'class' | 'complex' | 'mixed' | 'changed'
}

export const scanCases: ScanCase[] = [
  { name: 'small-warm', count: 32, passes: 2000, shape: 'class' },
  ...[1000, 1001, 2300, 4097].map(count => ({
    name: `class-${count}`,
    count,
    passes: 10,
    shape: 'class' as const,
  })),
  { name: 'complex-2300', count: 2300, passes: 10, shape: 'complex' },
  { name: 'hot-with-one-offs', count: 2300, passes: 10, shape: 'mixed' },
  { name: 'changed-stylesheet', count: 2300, passes: 20, shape: 'changed' },
]

export function selectorsFor(spec: ScanCase, pass: number) {
  const result: string[] = []
  for (let i = 0; i < spec.count; ++i) {
    if (spec.shape === 'complex') {
      result.push(
        `:where(.css-x).ant-btn-${i}:not(:disabled):not(.ant-btn-disabled):hover`,
      )
    } else if (spec.shape === 'mixed' && pass >= 0) {
      result.push(`.c${i % 32}`, `.oneoff-${pass}-${i}`)
    } else {
      const prefix = spec.shape === 'changed' && pass >= 0 ? 'changed' : 'c'
      result.push(`.${prefix}${i}`)
    }
  }
  return result
}
