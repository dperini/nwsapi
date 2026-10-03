import { escapeText } from '../charts.mts'
import type { Measurement } from '../charts.mts'
import { optimiseSvg } from '../../gen/svg-optimize.mts'
import { duration, ratioLabel } from './model.mts'

const colors = ['#a9efb4', '#bfacff']
const left = 400
const width = 540

function scale(rows: Measurement[]) {
  const values = rows.flatMap(row =>
    row.milliseconds.flatMap((value, i) =>
      value === null ? [] : [value, ...(row.samples?.[i] ?? [])],
    ),
  )
  const low = Math.floor(
    Math.log10(Math.min(...(values.length ? values : [0.001]))),
  )
  const high = Math.max(
    low + 1,
    Math.ceil(Math.log10(Math.max(...(values.length ? values : [1])))),
  )
  return {
    low,
    high,
    x: (value: number) =>
      left + (width * (Math.log10(value) - low)) / (high - low),
  }
}

function series(
  row: Measurement,
  index: number,
  y: number,
  x: (v: number) => number,
) {
  const value = row.milliseconds[index]!
  const label = row.errors[index] || duration(value)
  if (value === null) {
    return `<text x="${left}" y="${y + 5}" class="muted">${escapeText(label)}</text>`
  }
  const samples = row.samples?.[index] ?? [value]
  const min = Math.min(value, ...samples)
  const max = Math.max(value, ...samples)
  return `<g fill="${colors[index]}"><title>${escapeText(`${duration(value)} median; observed rounds ${duration(min)}–${duration(max)}`)}</title><path d="M${x(min)} ${y}H${x(max)}" stroke="${colors[index]}" stroke-width="3" stroke-opacity=".5"/><circle cx="${x(value)}" cy="${y}" r="6"/><text x="974" y="${y + 5}" font-size="14">${escapeText(label)}</text></g>`
}

export function atlasChart(
  title: string,
  names: string[],
  rows: Measurement[],
  caption: string,
) {
  const height = 244 + rows.length * 104
  const axis = scale(rows)
  const ticks = Array.from({ length: axis.high - axis.low + 1 }, (_, i) => {
    const value = 10 ** (axis.low + i)
    const x = axis.x(value)
    return `<path d="M${x} 130V${height - 79}" stroke="#28384b" stroke-dasharray="3 6"/><text x="${x}" y="123" text-anchor="middle" class="tick">${duration(value)}</text>`
  }).join('')
  const body = rows
    .map((row, i) => {
      const y = 153 + i * 104
      return `<g><title>${escapeText(row.selector)}</title><text x="36" y="${y + 5}" class="selector">${escapeText(row.selector)}</text><text x="36" y="${y + 41}" class="muted">${ratioLabel(row)} relative speed</text>${series(row, 0, y + 34, axis.x)}${series(row, 1, y + 59, axis.x)}<path d="M36 ${y + 85}H1064" stroke="#263446"/></g>`
    })
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img"><title>${escapeText(title)}</title><desc>Median latency on a logarithmic axis. Left is faster. Whiskers show the observed round minimum and maximum, not confidence intervals. Relative speed is competitor time divided by candidate time. ${escapeText(caption)}</desc><defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="#17283b"/><stop offset="1" stop-color="#0b1320"/></linearGradient></defs><rect width="1100" height="${height}" rx="22" fill="url(#background)"/><style>text{font-family:Arial,Helvetica,sans-serif;fill:#ecf2f8}.muted{fill:#8fa5bd;font-size:13px}.tick{fill:#a9b9cc;font-size:12px}.selector{font-family:Menlo,Consolas,monospace;font-size:15px}</style><text x="36" y="43" font-size="24" font-weight="700">${escapeText(title)}</text><text x="1064" y="43" text-anchor="end" class="muted">WARM QUERIES / ALL RESULTS</text>${names.map((name, i) => `<circle cx="${42 + i * 480}" cy="77" r="5" fill="${colors[i]}"/><text x="${55 + i * 480}" y="82" font-size="14">${escapeText(name)}</text>`).join('')}${ticks}${body}<text x="36" y="${height - 47}" class="muted">Logarithmic latency · Left is faster · Whiskers: observed round range · Ratio above 1× favors the first engine</text><text x="36" y="${height - 22}" class="muted">${escapeText(caption)}</text></svg>`,
    ) + '\n'
  )
}
