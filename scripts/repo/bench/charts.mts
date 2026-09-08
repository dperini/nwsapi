import { optimiseSvg } from '../gen/svg-optimize.mts'
import {
  chartBackground,
  chartColors,
  chartFrame,
  chartTextStyles,
  queryStateNote,
} from './chart-theme.mts'

export interface Measurement {
  category: string
  selector: string
  milliseconds: Array<number | null>
  errors: Array<string | null>
  samples?: number[][]
  mitataSamples?: number[][][]
  sampleIterations?: number[][]
}

export function escapeText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function unitText(value: string) {
  return escapeText(value).replace(
    /(\d[\d,.]*)(KiB|MiB|GiB|ms|μs|µs|ns|px|%|×)(?![a-zA-Z])/g,
    '$1<tspan class="unit">$2</tspan>',
  )
}

export function packageText(value: string) {
  return unitText(value).replace(
    /(?<![\w-])(?:NWSAPI|nwsapi|@asamuzakjp\/dom-selector)(?![\w-])/g,
    name => `<tspan class="package">${name.toLowerCase()}</tspan>`,
  )
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

// Bars span the labeled logarithmic axis. Incorrect results have no bar.
export function chart(
  title: string,
  names: string[],
  rows: Measurement[],
  provenance: string,
  revision = '',
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
  const note = packageText(provenance).replace(
    /`([^`]+)`/g,
    '<tspan class="code">$1</tspan>',
  )
  const colors = names.map(
    (name, index) =>
      chartColors[
        name.startsWith('@asamuzakjp/')
          ? 1
          : name.includes('prerelease')
            ? 0
            : (index + 2) % chartColors.length
      ]!,
  )
  const gradients = colors
    .map(
      ([start, end], index) =>
        `<linearGradient id="series${index}"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient>`,
    )
    .join('')
  const values = rows.flatMap(row =>
    row.milliseconds.filter(value => value !== null),
  )
  const low =
    Math.floor(Math.log10(Math.min(...(values.length ? values : [0.001])))) - 1
  const high = Math.max(
    low + 1,
    Math.ceil(Math.log10(Math.max(...(values.length ? values : [1])))),
  )
  const position = (value: number) =>
    440 + ((Math.log10(value) - low) / (high - low)) * 480
  const axis = Array.from({ length: high - low + 1 }, (_, index) => {
    const value = 10 ** (low + index)
    const label =
      value < 1 ? `${Number((value * 1000).toPrecision(3))}μs` : `${value}ms`
    return `<text x="${440 + (index / (high - low)) * 480}" y="122" text-anchor="${index === 0 ? 'start' : index === high - low ? 'end' : 'middle'}" class="tick">${unitText(label)}</text>`
  }).join('')
  const groupHeight = 58 + names.length * 26
  const notesTop = Math.max(616, 150 + groupHeight * rows.length + 20)
  const height = Math.max(720, notesTop + 80)
  const body = rows
    .map((row, index) => {
      const top = 150 + index * groupHeight
      const fastest = Math.min(
        ...row.milliseconds.filter(value => value !== null),
      )
      return (
        `<text x="48" y="${top}" class="code selector">${escapeText(row.selector)}</text>` +
        names
          .map((name, series) => {
            const value = row.milliseconds[series] as number | null
            const y = top + 28 + series * 26
            const status =
              row.errors[series] ??
              (value === null
                ? 'not measured'
                : value < 0.1
                  ? `${(value * 1000).toFixed(2)}μs`
                  : `${value.toFixed(2)}ms`)
            const weight = value === fastest ? ' style="font-weight:700"' : ''
            return `<g><title>${escapeText(`${name}: ${row.selector}. ${status}`)}</title><text x="48" y="${y + 5}" class="code engine"${weight}>${escapeText(name)}</text><path d="M440 ${y}h480" stroke="#223048" stroke-width="2"/>${value === null ? '' : `<rect class="bar" x="440" y="${y - 1}" width="${(position(value) - 440).toFixed(2)}" height="2" fill="url(#series${series})"/>`}<text x="940" y="${y + 5}" class="time"${weight}>${unitText(status)}</text></g>`
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img"><title>${escapeText(title)}</title><desc>${escapeText(provenance)}. Median query time on a shared logarithmic scale; further left is faster. Bars span from the lowest labeled time to each value. Failed correctness checks have no bar.</desc><defs>${chartBackground}${gradients}</defs><style>${chartTextStyles}.engine{font-size:16px}.selector{font-weight:600}.tick{font-size:14px}.bar{transform-box:fill-box;transform-origin:left center;animation:fill 800ms ease-out both}@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media(prefers-reduced-motion:reduce){.bar{animation:none}}</style>${chartFrame(height)}<text x="48" y="58" class="chart-title">${escapeText(title)}</text><text x="48" y="90" class="muted">Logarithmic time scale · Shorter bars are faster</text><text x="1052" y="90" text-anchor="end" class="muted">Warm queries · All results</text>${axis}${body}<path d="M48 ${notesTop - 34}H1052" stroke="#304159"/><text x="48" y="${notesTop}" class="muted">${queryStateNote}</text><text x="1052" y="${notesTop + 60}" text-anchor="end" class="muted note metadata">${note}${revision ? `<tspan fill="#75808e"> · ${escapeText(revision)}</tspan>` : ''}</text></svg>`,
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
