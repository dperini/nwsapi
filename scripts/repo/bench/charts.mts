import { optimiseSvg } from '../gen/svg-optimize.mts'

export interface Measurement {
  category: string
  selector: string
  milliseconds: Array<number | null>
  errors: Array<string | null>
  samples?: number[][]
  sampleIterations?: number[][]
}

export function escapeText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function splitCharts(rows: Measurement[]) {
  const groups = new Map<string, Measurement[]>()
  for (const row of rows) {
    const group = groups.get(row.category) ?? []
    group.push(row)
    groups.set(row.category, group)
  }
  return Array.from(groups, ([category, group]) => {
    const charts: Array<{ name: string; rows: Measurement[] }> = []
    for (let offset = 0; offset < group.length; offset += 4) {
      charts.push({
        name: `${category}-${offset / 4 + 1}`,
        rows: group.slice(offset, offset + 4),
      })
    }
    return charts
  }).flat()
}

// Linear bars start at zero. Incorrect or unsupported results never earn a bar.
export function chart(
  title: string,
  names: string[],
  rows: Measurement[],
  provenance: string,
) {
  if (!rows.length || rows.length > 4 || !names.length) {
    throw new RangeError(
      'A chart needs one to four selectors and at least one engine.',
    )
  }
  for (const row of rows) {
    if (
      row.milliseconds.length !== names.length ||
      row.errors.length !== names.length ||
      row.milliseconds.some(
        (value, index) => row.errors[index] !== null && value !== null,
      ) ||
      row.milliseconds.some(
        value => value !== null && (!Number.isFinite(value) || value <= 0),
      )
    ) {
      throw new TypeError('Invalid benchmark measurements.')
    }
  }
  const colors = ['#7154d9', '#cb3989', '#217dcc', '#19826a', '#b16415']
  const maximum = Math.max(
    0.001,
    ...rows.flatMap(row => row.milliseconds.filter(value => value !== null)),
  )
  const groupHeight = 40 + names.length * 25
  const height = 120 + groupHeight * rows.length
  const body = rows
    .map((row, index) => {
      const top = 80 + index * groupHeight
      const fastest = Math.min(
        ...row.milliseconds.filter(value => value !== null),
      )
      return (
        `<text x="20" y="${top}" class="selector">${escapeText(row.selector)}</text>` +
        names
          .map((name, series) => {
            const value = row.milliseconds[series]
            const y = top + 12 + series * 25
            const status =
              row.errors[series] ??
              (value === null ? 'not measured' : `${value.toFixed(2)} ms`)
            const width = value === null ? 0 : (value / maximum) * 380
            const weight = value === fastest ? ' style="font-weight:700"' : ''
            return `<text x="20" y="${y + 14}"${weight}>${escapeText(name)}</text><rect class="bar" x="300" y="${y}" width="${width.toFixed(2)}" height="18" fill="${colors[series % colors.length]}"/><text x="${310 + width}" y="${y + 14}"${weight}>${escapeText(status)}</text>`
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" role="img"><title>${escapeText(title)}</title><desc>${escapeText(provenance)}. Median milliseconds per query; lower is better. Failed correctness checks have no timing.</desc><style>text{font:14px system-ui,sans-serif;fill:#24292f}.selector{font:16px monospace;font-weight:600}.background{fill:#fff}.bar{transform-box:fill-box;transform-origin:left center;animation:fill 800ms ease-out both}@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media(prefers-reduced-motion:reduce){.bar{animation:none}}@media(prefers-color-scheme:dark){text{fill:#e6edf3}.background{fill:#0d1117}}</style><rect class="background" width="1000" height="${height}"/><text x="20" y="28" class="selector">${escapeText(title)}</text><text x="20" y="50">Warm queries on one jsdom document. Median ms/query; lower is better.</text>${body}<text x="20" y="${height - 20}">${escapeText(provenance)}</text></svg>`,
    ) + '\n'
  )
}

export function agrees(
  actual: ArrayLike<Element>,
  expected: ArrayLike<Element>,
) {
  return (
    actual.length === expected.length &&
    Array.from(actual).every((node, index) => node === expected[index])
  )
}
