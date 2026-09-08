import { optimiseSvg } from '../gen/svg-optimize.mts'
import { escapeText } from './charts.mts'

export interface QueryChartOptions {
  names: [string, string]
  rows: Array<{
    selector: string
    warm: [number, number]
    cold: [number, number]
  }>
  speedup: string
  notes: Array<string | Array<string | { code: string }>>
  bottomPadding?: number
}

// Both columns start at zero. Each has its own scale and unit.
// Note positions determine the canvas height, including space for descenders.
export function queryChart({
  names,
  rows,
  speedup,
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
  const notesTop = 251 + rows.length * 39
  const height = notesTop + (notes.length - 1) * 23 + 5 + bottomPadding

  const warmMax = Math.ceil(Math.max(...rows.flatMap(row => row.warm)) * 1000)
  const coldMax = Math.ceil(Math.max(...rows.flatMap(row => row.cold)))
  const lines = rows
    .map((row, i) => {
      const y = 223 + i * 39
      return (
        `<text x="48" y="${y + 10}" class="code">${escapeText(row.selector)}</text>` +
        ['warm', 'cold']
          .map(state => {
            const x = state === 'warm' ? 420 : 790
            const right = state === 'warm' ? 708 : 1052
            const maximum = state === 'warm' ? warmMax : coldMax
            return row[state]
              .map((value, series) => {
                const time = state === 'warm' ? value * 1000 : value
                const top = y + series * 12
                const color = series === 0 ? '#a8ee8b' : '#a4aff7'
                const width = (time / maximum) * 190
                return `<path d="M${x} ${top}h190" stroke="#223048" stroke-width="2"/>
          <rect x="${x}" y="${top - 1}" width="${width.toFixed(2)}" height="2" fill="${color}" class="bar" style="animation-delay:${i * 35}ms"/>
          <text x="${right}" y="${top + 5}" text-anchor="end" class="time" style="fill:${color}">${time.toFixed(2)} ${state === 'warm' ? 'μs' : 'ms'}</text>`
              })
              .join('')
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeText(names[0])}</title>
<desc id="desc">Warm and cold first-query times for ${escapeText(names[0])} and ${escapeText(names[1])} through jsdom. Shorter lines are faster. Warm times use microseconds; cold times use milliseconds. Each column has its own scale, starting at zero. Cold means the first query on a fresh document, excluding document creation and explicit NWSAPI factory setup.</desc>
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101d30"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs>
<style>
text{font-family:Arial,Helvetica,sans-serif;fill:#f0f5fa}
.muted{fill:#aabbd0;font-size:16px}
.code{font-family:Consolas,Menlo,monospace;font-size:18px;fill:#dce6f1}
.time{font-size:15px;font-variant-numeric:tabular-nums}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 750ms cubic-bezier(.22,1,.36,1) 1 both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
<rect width="1100" height="${height}" rx="24" fill="url(#bg)"/>
<rect x=".5" y=".5" width="1099" height="${height - 1}" rx="24" fill="none" stroke="#2b3a50"/>
<text x="48" y="68" class="code" style="font-size:42px;font-weight:700">${escapeText(names[0])}</text>
<text x="1052" y="68" text-anchor="end" font-size="42" font-weight="700" style="fill:#baf471">Up to ${escapeText(speedup)}</text>
<rect x="48" y="96" width="100" height="32" rx="6" fill="#223048"/>
<text x="64" y="118" class="code">${escapeText(names[0])}</text>
<path d="M48 133h100" stroke="#a8ee8b" stroke-width="2"/>
<rect x="181" y="96" width="317" height="32" rx="6" fill="#223048"/>
<text x="195" y="118" class="code">${escapeText(names[1])}</text>
<path d="M181 133h317" stroke="#a4aff7" stroke-width="2"/>
<text x="48" y="184" class="muted">Shorter lines are faster.</text>
<text x="420" y="174" font-size="23" font-weight="700">Warm</text>
<text x="420" y="198" class="muted">0–${warmMax} μs per query</text>
<text x="790" y="174" font-size="23" font-weight="700">Cold</text>
<text x="790" y="198" class="muted">0–${coldMax} ms per query</text>
${lines}
<path d="M48 ${notesTop - 26}H1052" stroke="#304159"/>
${notes.map((note, index) => `<text x="48" y="${notesTop + index * 23}" class="muted">${(typeof note === 'string' ? [note] : note).map(part => (typeof part === 'string' ? escapeText(part) : `<tspan class="code">${escapeText(part.code)}</tspan>`)).join('')}</text>`).join('')}
</svg>`) + '\n'
  )
}
