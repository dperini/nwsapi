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

// Each engine uses the same logarithmic scale. Endpoints show warm and cold times.
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

  const times = rows
    .flatMap(row => [...row.warm, ...row.cold])
    .map(value => value * 1000)
  const low = Math.floor(Math.log10(Math.min(...times)))
  const high = Math.ceil(Math.log10(Math.max(...times)))
  const span = Math.max(1, high - low)
  const position = (value: number) =>
    ((Math.log10(value * 1000) - low) / span) * 270
  const colors = [
    ['#baf471', '#2bc5ae'],
    ['#a4aff7', '#ef9bc9'],
  ]
  const gradients = colors
    .map(
      ([warm, cold], index) =>
        `<linearGradient id="series${index}"><stop stop-color="${warm}"/><stop offset="1" stop-color="${cold}"/></linearGradient>`,
    )
    .join('')
  const axes = names
    .map((name, series) => {
      const x = 410 + series * 335
      return (
        `<text x="${x}" y="125" class="code">${escapeText(name)}</text>
    <text x="${x}" y="149" class="muted"><tspan fill="${colors[series][0]}">● Warm</tspan><tspan dx="18" fill="${colors[series][1]}">● Cold</tspan></text>` +
        Array.from({ length: span + 1 }, (_, index) => {
          const power = low + index
          const value = 10 ** power
          const label = value >= 1000 ? `${value / 1000} ms` : `${value} μs`
          return `<text x="${x + (index / span) * 270}" y="192" text-anchor="middle" class="tick">${label}</text>`
        }).join('')
      )
    })
    .join('')
  const lines = rows
    .map((row, i) => {
      const y = 223 + i * 39
      return (
        `<text x="48" y="${y + 10}" class="code">${escapeText(row.selector)}</text>` +
        names
          .map((name, series) => {
            const x = 410 + series * 335
            const warm = position(row.warm[series])
            const cold = position(row.cold[series])
            const summary = `Warm ${(row.warm[series] * 1000).toFixed(2)} μs · Cold ${row.cold[series].toFixed(2)} ms`
            return `<g><title>${escapeText(`${name}: ${row.selector}. ${summary}`)}</title>
      <path d="M${x} ${y}h270" stroke="#223048" stroke-width="2"/>
      <rect x="${x}" y="${y - 8}" width="270" height="30" fill="transparent"/>
      <rect class="bar" x="${x + Math.min(warm, cold)}" y="${y - 1}" width="${Math.abs(cold - warm)}" height="2" fill="url(#series${series})" style="animation-delay:${i * 35}ms"/>
      <circle cx="${x + warm}" cy="${y}" r="3" fill="${colors[series][0]}"/>
      <circle cx="${x + cold}" cy="${y}" r="3" fill="${colors[series][1]}"/>
      <text x="${x}" y="${y + 19}" class="time">${escapeText(summary)}</text></g>`
          })
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeText(names[0])}</title>
<desc id="desc">Warm and cold first-query times for ${escapeText(names[0])} and ${escapeText(names[1])} through jsdom. Both engine columns use the same logarithmic time scale. Each gradient connects warm and cold markers. Further left means faster. Exact timings appear below each line. Cold measurements exclude document creation and explicit NWSAPI factory setup.</desc>
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101d30"/><stop offset="1" stop-color="#0b1220"/></linearGradient>${gradients}</defs>
<style>
text{font-family:Arial,Helvetica,sans-serif;fill:#f0f5fa}
.muted{fill:#aabbd0;font-size:16px}
.code{font-family:Consolas,Menlo,monospace;font-size:18px;fill:#dce6f1}
.tick{fill:#aabbd0;font-size:12px}
.time{fill:#aabbd0;font-size:13px;font-variant-numeric:tabular-nums}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 750ms cubic-bezier(.22,1,.36,1) 1 both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
<rect width="1100" height="${height}" rx="24" fill="url(#bg)"/>
<rect x=".5" y=".5" width="1099" height="${height - 1}" rx="24" fill="none" stroke="#2b3a50"/>
<text x="48" y="68" class="code" style="font-size:42px;font-weight:700">${escapeText(names[0])}</text>
<text x="1052" y="68" text-anchor="end" font-size="42" font-weight="700" style="fill:#baf471">Up to ${escapeText(speedup)}</text>
<text x="48" y="125" class="muted">Warm → cold</text>
<text x="48" y="149" class="muted">Further left is faster.</text>
<text x="48" y="192" class="muted">Logarithmic time scale</text>
${axes}
${lines}
<path d="M48 ${notesTop - 26}H1052" stroke="#304159"/>
${notes.map((note, index) => `<text x="48" y="${notesTop + index * 23}" class="muted">${(typeof note === 'string' ? [note] : note).map(part => (typeof part === 'string' ? escapeText(part) : `<tspan class="code">${escapeText(part.code)}</tspan>`)).join('')}</text>`).join('')}
</svg>`) + '\n'
  )
}
