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
  const note = escapeText(provenance).replace(
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
      ],
  )
  const gradients = colors
    .map(
      ([start, end], index) =>
        `<linearGradient id="series${index}"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient>`,
    )
    .join('')
  const maximum = Math.max(
    0.001,
    ...rows.flatMap(row => row.milliseconds.filter(value => value !== null)),
  )
  const groupHeight = 58 + names.length * 26
  const notesTop = 160 + groupHeight * rows.length + 20
  const height = notesTop + 23 + 5 + 40
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
            const value = row.milliseconds[series]
            const y = top + 28 + series * 26
            const status =
              row.errors[series] ??
              (value === null ? 'not measured' : `${value.toFixed(2)} ms`)
            const width = value === null ? 0 : (value / maximum) * 480
            const weight = value === fastest ? ' style="font-weight:700"' : ''
            return `<g><title>${escapeText(`${name}: ${row.selector}. ${status}`)}</title><text x="48" y="${y + 5}" class="code engine"${weight}>${escapeText(name)}</text><path d="M440 ${y}h480" stroke="#223048" stroke-width="2"/>${value === null ? '' : `<rect class="bar" x="440" y="${y - 1}" width="${width.toFixed(2)}" height="2" fill="url(#series${series})"/>`}<text x="940" y="${y + 5}" class="time"${weight}>${escapeText(status)}</text></g>`
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img"><title>${escapeText(title)}</title><desc>${escapeText(provenance)}. Median milliseconds per query; lower is better. Failed correctness checks have no timing.</desc><defs>${chartBackground}${gradients}</defs><style>${chartTextStyles}.engine{font-size:16px}.selector{font-weight:600}.bar{transform-box:fill-box;transform-origin:left center;animation:fill 800ms ease-out 1 both}@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media(prefers-reduced-motion:reduce){.bar{animation:none}}</style>${chartFrame(height)}<text x="48" y="65" class="muted">Linear time scale</text><text x="48" y="89" class="muted">Shorter bars are faster</text><text x="440" y="89" class="muted">Warm queries · All results</text>${body}<path d="M48 ${notesTop - 38}H1052" stroke="#304159"/><text x="48" y="${notesTop}" class="muted">${queryStateNote}</text><text x="48" y="${notesTop + 23}" class="muted note">${note}${revision ? `<tspan fill="#75808e"> · ${escapeText(revision)}</tspan>` : ''}</text></svg>`,
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
