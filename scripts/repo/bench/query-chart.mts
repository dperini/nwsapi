import { chromium } from '@playwright/test'
import { optimiseSvg } from '../gen/svg-optimize.mts'
import { escapeText } from './charts.mts'
import {
  chartBackground,
  chartColors,
  chartFrame,
  chartTextStyles,
  noteCodeFont,
  noteFont,
} from './chart-theme.mts'

export interface QueryChartOptions {
  names: [string, string]
  rows: Array<{
    selector: string
    warm: [number, number]
    cold: [number, number]
  }>
  notes: Array<string | Array<string | { code: string }>>
  bottomPadding?: number
}

// Measure words in the same fonts as the SVG. Keep package names in code style.
export async function wrapQueryNotes(notes: QueryChartOptions['notes']) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    return await page.evaluate(
      ({ notes: entries, noteFont: proseFont, codeFont: monoFont }) => {
        const context = document.createElement('canvas').getContext('2d')!
        const lines: Array<Array<string | { code: string }>> = [[]]
        let width = 0
        for (const note of entries) {
          for (const part of typeof note === 'string' ? [note] : note) {
            const code = typeof part !== 'string'
            const words = (code ? part.code : part).match(/\S+/g) ?? []
            for (const word of words) {
              context.font = code ? monoFont : proseFont
              const wordWidth = context.measureText(word).width
              context.font = proseFont
              const spaceWidth = context.measureText(' ').width
              // The 1100px canvas has 48px padding on both sides.
              if (width && width + spaceWidth + wordWidth > 1004) {
                lines.push([])
                width = 0
              }
              const line = lines[lines.length - 1]
              if (width) {
                line.push(' ')
                width += spaceWidth
              }
              line.push(code ? { code: word } : word)
              width += wordWidth
            }
          }
        }
        return lines
      },
      { notes, noteFont, codeFont: noteCodeFont },
    )
  } finally {
    await browser.close()
  }
}

// Each engine uses the same logarithmic scale. Endpoints show warm and cold times.
// Note positions determine the canvas height, including space for descenders.
export function queryChart({
  names,
  rows,
  notes,
  bottomPadding = 40,
}: QueryChartOptions) {
  if (
    !rows.length ||
    !notes.length ||
    !Number.isFinite(bottomPadding) ||
    bottomPadding < 0 ||
    rows.some(row =>
      [row.warm, row.cold].some(
        values =>
          values.length !== 2 ||
          values.some(value => !Number.isFinite(value) || value <= 0),
      ),
    )
  ) {
    throw new RangeError(
      'Provide positive query times, notes, and nonnegative bottom padding.',
    )
  }
  const notesTop = 208 + rows.length * 64
  const height = notesTop + (notes.length - 1) * 23 + 5 + bottomPadding

  const times = rows
    .flatMap(row => [...row.warm, ...row.cold])
    .map(value => value * 1000)
  const low = Math.floor(Math.log10(Math.min(...times)))
  const high = Math.ceil(Math.log10(Math.max(...times)))
  const span = Math.max(1, high - low)
  const position = (value: number) =>
    ((Math.log10(value * 1000) - low) / span) * 650
  const colors = chartColors.slice(0, names.length)
  const gradients = colors
    .map(
      ([warm, cold], index) =>
        `<linearGradient id="series${index}"><stop stop-color="${warm}"/><stop offset="1" stop-color="${cold}"/></linearGradient>`,
    )
    .join('')
  const axes =
    names
      .map(
        (name, series) =>
          `<text x="${350 + series * 240}" y="65" class="code" style="fill:${colors[series][0]}">● ${escapeText(name)}</text>`,
      )
      .join('') +
    Array.from({ length: span + 1 }, (_, index) => {
      const value = 10 ** (low + index)
      const label = value >= 1000 ? `${value / 1000} ms` : `${value} μs`
      return `<text x="${350 + (index / span) * 650}" y="132" text-anchor="middle" class="tick">${label}</text>`
    }).join('')
  const lines = rows
    .map((row, i) => {
      const y = 163 + i * 64
      const comparisons = (['cold', 'warm'] as const)
        .map((state, index) => {
          const ratio = row[state][1] / row[state][0]
          const faster = ratio >= 1
          const factor = faster ? ratio : 1 / ratio
          const label = `${state === 'warm' ? 'Warm' : 'Cold'} ${factor.toFixed(2)}× ${faster ? 'faster' : 'slower'}`
          return `<tspan dx="${index ? 24 : 0}" class="comparison" style="fill:${state === 'warm' ? '#ffc979' : '#80d7ff'}">${label}</tspan>`
        })
        .join('')
      return (
        `<text x="48" y="${y + 10}" class="code">${escapeText(row.selector)}</text>` +
        `<text x="350" y="${y + 39}">${comparisons}</text>` +
        names
          .map((name, series) => {
            const x = 350
            const top = y + series * 12
            const warm = position(row.warm[series])
            const cold = position(row.cold[series])
            const summary = `Cold ${row.cold[series].toFixed(2)} ms · Warm ${(row.warm[series] * 1000).toFixed(2)} μs`
            return `<g><title>${escapeText(`${name}: ${row.selector}. ${summary}`)}</title>
      <path d="M${x} ${top}h650" stroke="#223048" stroke-width="2"/>
      <rect x="${x}" y="${top - 5}" width="650" height="10" fill="transparent"/>
      <rect class="bar" x="${x + Math.min(warm, cold)}" y="${top - 1}" width="${Math.abs(cold - warm)}" height="2" fill="url(#series${series})" style="animation-delay:${i * 35}ms"/>
      <circle cx="${x + warm}" cy="${top}" r="3" fill="${colors[series][0]}"/>
      <circle cx="${x + cold}" cy="${top}" r="3" fill="${colors[series][1]}"/>
      </g>`
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeText(names[0])}</title>
<desc id="desc">Cold and warm first-query times for ${escapeText(names[0])} and ${escapeText(names[1])} through jsdom. Both stacked engine lines use the same logarithmic time scale. Each gradient connects warm and cold markers. Further left means faster. Comparison factors appear below each pair. Exact timings are in SVG tooltips. Cold measurements exclude document creation and explicit NWSAPI factory setup.</desc>
<defs>${chartBackground}${gradients}</defs>
<style>
${chartTextStyles}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 750ms cubic-bezier(.22,1,.36,1) 1 both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
${chartFrame(height)}
<text x="48" y="65" class="muted">Logarithmic time scale</text>
<text x="48" y="89" class="muted">Further left is faster</text>
${axes}
${lines}
<path d="M48 ${notesTop - 38}H1052" stroke="#304159"/>
${notes.map((note, index) => `<text x="48" y="${notesTop + index * 23}" class="muted note">${(typeof note === 'string' ? [note] : note).map(part => (typeof part === 'string' ? escapeText(part) : `<tspan class="code">${escapeText(part.code)}</tspan>`)).join('')}</text>`).join('')}
</svg>`) + '\n'
  )
}
