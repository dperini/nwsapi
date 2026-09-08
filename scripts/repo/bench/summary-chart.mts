import { escapeText, unitText, packageText } from './charts.mts'
import type { Measurement } from './charts.mts'
import {
  chartBackground,
  chartColors,
  chartGradients,
  chartFrame,
  chartTextStyles,
} from './chart-theme.mts'
import { optimiseSvg } from '../gen/svg-optimize.mts'

// Equal weight per query; averaging ratios arithmetically favors outliers.
export function geometricSpeedup(rows: Measurement[]) {
  if (
    !rows.length ||
    rows.some(
      row =>
        row.errors.some(Boolean) ||
        row.milliseconds.length !== 2 ||
        row.milliseconds.some(
          value => value === null || !Number.isFinite(value) || value <= 0,
        ),
    )
  ) {
    throw new Error(
      'Performance summary requires correct, positive timings for both engines on every query.',
    )
  }
  return Math.exp(
    rows.reduce(
      (sum, row) => sum + Math.log(row.milliseconds[1]! / row.milliseconds[0]!),
      0,
    ) / rows.length,
  )
}

export interface SummaryMetric {
  title: string
  detail: string
  headline: string
  values: [number, number]
  labels: [string, string]
}

export function summaryChart(metrics: SummaryMetric[], notes: string[]) {
  if (
    metrics.length !== 3 ||
    notes.length !== 3 ||
    metrics.some(metric =>
      metric.values.some(value => !Number.isFinite(value) || value <= 0),
    )
  ) {
    throw new Error('The summary needs three measured metrics and three notes.')
  }
  const names = ['nwsapi', '@asamuzakjp/dom-selector']
  const body = metrics
    .map((metric, index) => {
      const top = 145 + index * 145
      const maximum = Math.max(...metric.values)
      return (
        `<text x="48" y="${top}" class="metric-title">${escapeText(metric.title)}</text><text x="48" y="${top + 25}" class="muted">${escapeText(metric.detail)}</text><text x="1052" y="${top + 12}" text-anchor="end" class="headline">${unitText(metric.headline)}</text>` +
        metric.values
          .map((value, series) => {
            const y = top + 59 + series * 28
            return `<g><title>${escapeText(metric.title + ' · ' + names[series] + ': ' + metric.labels[series])}</title><text x="48" y="${y + 5}" class="code engine">${escapeText(names[series]!)}</text><path d="M410 ${y}h460" stroke="#223048" stroke-width="2"/><rect x="410" y="${y - 1}" width="${(value / maximum) * 460}" height="2" fill="url(#series${series})"/><text x="1052" y="${y + 5}" text-anchor="end" class="muted">${unitText(metric.labels[series]!)}</text></g>`
          })
          .join('')
      )
    })
    .join('')
  const footer = notes
    .map(
      (note, index) =>
        `<text x="${index ? 1052 : 48}" y="${index ? 644 + index * 24 : 616}"${index ? ' text-anchor="end"' : ''} class="muted note${index ? ' metadata' : ''}">${packageText(note)}</text>`,
    )
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="720" viewBox="0 0 1100 720" role="img"><title>NWSAPI — Fast CSS Selectors API Engine</title><desc>Standalone library comparison. ${escapeText(notes.join(' '))} Each metric has its own zero-based linear scale; shorter bars are better.</desc><defs>${chartBackground}${chartGradients}</defs><style>${chartTextStyles}.metric-title{font-size:20px;font-weight:700}.engine{font-size:16px}.headline{font-size:30px;font-weight:700;fill:${chartColors[0]![0]}}</style>${chartFrame(720)}<text x="48" y="58" class="chart-title">NWSAPI — Fast CSS Selectors API Engine</text>${body}<path d="M48 582H1052" stroke="#304159"/>${footer}</svg>`,
    ) + '\n'
  )
}
