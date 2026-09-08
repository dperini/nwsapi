import { escapeText, unitText, packageText } from './charts.mts'
import {
  chartBackground,
  chartColors,
  chartGradients,
  chartFrame,
  chartTextStyles,
} from './chart-theme.mts'
import type { QueryChartOptions } from './query-chart.mts'
import { optimiseSvg } from '../gen/svg-optimize.mts'

// Four query highlights share the category charts' viewport and typography.
export function compactQueryChart(options: QueryChartOptions) {
  const { names, rows, notes } = options
  if (
    rows.length !== 4 ||
    notes.length !== 3 ||
    rows.some(row =>
      [...row.cold, ...row.warm].some(
        value => !Number.isFinite(value) || value <= 0,
      ),
    )
  ) {
    throw new Error(
      'The first-match chart needs four measured queries and three notes.',
    )
  }
  const times = rows
    .flatMap(row => [...row.cold, ...row.warm])
    .map(value => value * 1000)
  const low = Math.floor(Math.log10(Math.min(...times)))
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...times))))
  const width = 1004
  const position = (value: number) =>
    ((Math.log10(value * 1000) - low) / (high - low)) * width
  const axes = [48]
    .map(x =>
      Array.from({ length: high - low + 1 }, (_, i) => {
        const value = 10 ** (low + i)
        return `<text x="${x + (i / (high - low)) * width}" y="122" class="tick" text-anchor="${i === 0 ? 'start' : i === high - low ? 'end' : 'middle'}">${unitText(value >= 1000 ? value / 1000 + 'ms' : value + 'μs')}</text>`
      }).join(''),
    )
    .join('')
  const body = rows
    .map((row, i) => {
      const x = 48
      const y = 162 + i * 100
      const lines = names
        .map((name, series) => {
          const warm = position(row.warm[series]!)
          const cold = position(row.cold[series]!)
          const top = y + 22 + series * 20
          return `<g><title>${escapeText(name + ': ' + row.selector)}. Cold ${(row.cold[series]! * 1000).toFixed(2)}μs; warm ${(row.warm[series]! * 1000).toFixed(2)}μs.</title><path d="M${x} ${top}h${width}" stroke="#223048" stroke-width="2"/><rect class="bar" x="${x + Math.min(warm, cold)}" y="${top - 1}" width="${Math.abs(cold - warm)}" height="2" fill="url(#series${series})"/><circle cx="${x + warm}" cy="${top}" r="3" fill="${chartColors[series]![0]}"/><circle cx="${x + cold}" cy="${top}" r="3" fill="${chartColors[series]![1]}"/></g>`
        })
        .join('')
      const comparisons = (['cold', 'warm'] as const)
        .map((state, index) => {
          const ratio = row[state][1] / row[state][0]
          return `<tspan dx="${index ? 20 : 0}">${state === 'cold' ? 'Cold' : 'Warm'} ${unitText(Math.max(ratio, 1 / ratio).toFixed(2) + '×')} ${ratio >= 1 ? 'faster' : 'slower'}</tspan>`
        })
        .join('')
      return `<text x="${x}" y="${y}" class="code selector">${escapeText(row.selector)}</text>${lines}<text x="${x}" y="${y + 70}" class="comparison">${comparisons}</text>`
    })
    .join('')
  const footer = notes
    .map(
      (note, index) =>
        `<text x="${index ? 1052 : 48}" y="${616 + index * 28}"${index ? ' text-anchor="end"' : ''} class="muted note${index ? ' metadata' : ''}">${(typeof note === 'string' ? [note] : note).map(part => (typeof part === 'string' ? packageText(part) : `<tspan class="code">${escapeText(part.code)}</tspan>`)).join('')}</text>`,
    )
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="720" viewBox="0 0 1100 720" role="img"><title>Cold and warm first matches</title><desc>Direct standalone library calls on native browser DOMs, without jsdom. Each line connects warm and cold times on the same logarithmic scale. Further left is faster.</desc><defs>${chartBackground}${chartGradients}</defs><style>${chartTextStyles}.selector,.tick,.comparison{font-size:16px}.selector{font-weight:600}.comparison{fill:#c5d4e5}.bar{animation:fade 750ms ease-out both}@keyframes fade{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.bar{animation:none}}</style>${chartFrame(720)}<text x="48" y="58" class="chart-title">First matches</text><text x="48" y="90" class="muted">Logarithmic scale · Further left is faster</text><text x="540" y="58" class="code" style="fill:${chartColors[0]![0]}">● ${escapeText(names[0])}</text><text x="540" y="90" class="code" style="fill:${chartColors[1]![0]}">● ${escapeText(names[1])}</text>${axes}${body}<path d="M48 582H1052" stroke="#304159"/>${footer}</svg>`,
    ) + '\n'
  )
}
