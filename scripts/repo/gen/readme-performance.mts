import { readFileSync, writeFileSync } from 'node:fs'
import { optimiseSvg } from './svg-optimize.mts'
import { escapeText } from '../bench/charts.mts'

const root = new URL('../../../', import.meta.url)
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'))
const reports = [
  'results.json',
  'documentation/results.json',
  'atomic/results.json',
].map(file => read('assets/repo/bench/' + file))
const rows = reports.flatMap(report => report.rows)
if (
  rows.some(
    row =>
      row.errors.some(Boolean) ||
      row.milliseconds.some(value => !Number.isFinite(value) || value <= 0),
  )
) {
  throw new Error(
    'README chart requires successful, finite benchmark measurements',
  )
}
const wins = rows.filter(
  row => row.milliseconds[1] < row.milliseconds[2],
).length
const doubles = rows.filter(
  row => row.milliseconds[2] / row.milliseconds[1] >= 2,
).length
const first = read('assets/repo/bench/first-match-results.json')
// These two fixture queries have empty results; show every nonempty query.
const nonempty = first.rows.filter(
  row => !['.missing', '.absent > button'].includes(row.selector),
)
const ratios = nonempty.map(row => row.milliseconds[2] / row.milliseconds[1])
if (
  nonempty.length !== 12 ||
  ratios.some(value => !Number.isFinite(value) || value <= 0)
) {
  throw new Error('Review the README layout when first-match fixtures change')
}
const maximum = Math.ceil(Math.max(...ratios))
const plotWidth = 404
const bars = nonempty
  .map((row, i) => {
    const x = i < 6 ? 48 : 584
    const y = 384 + (i % 6) * 69
    const width = (ratios[i] / maximum) * plotWidth
    const baseline = x + plotWidth / maximum
    return `<text x="${x}" y="${y}" class="selector">${escapeText(row.selector)}</text>
    <text x="${x + 460}" y="${y}" text-anchor="end" class="ratio">${ratios[i].toFixed(1)}×</text>
    <rect x="${x}" y="${y + 13}" width="${plotWidth}" height="12" rx="6" fill="#223048"/>
    <rect x="${x}" y="${y + 13}" width="${width.toFixed(2)}" height="12" rx="6" fill="url(#bar)"/>
    <path d="M${baseline.toFixed(2)} ${y + 8}v22" stroke="#e4eaf2" stroke-width="2"/>`
  })
  .join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="910" viewBox="0 0 1100 910" role="img" aria-labelledby="title desc">
<title id="title">NWSAPI: faster on ${wins} of ${rows.length} all-results benchmark queries</title>
<desc id="desc">${doubles} all-results queries are at least twice as fast as dom-selector. First-match speedups for all 12 nonempty queries range from ${Math.min(...ratios).toFixed(1)} to ${Math.max(...ratios).toFixed(1)} times jsdom querySelector. Each bar starts at zero; white ticks mark the jsdom baseline of one. Recorded warm-query benchmarks; see linked methodology.</desc>
<defs>
<linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101d30"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
<linearGradient id="bar"><stop stop-color="#38cfae"/><stop offset="1" stop-color="#c0f767"/></linearGradient>
<radialGradient id="glow"><stop stop-color="#77e5a4" stop-opacity=".12"/><stop offset="1" stop-color="#77e5a4" stop-opacity="0"/></radialGradient>
</defs>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:#f0f5fa}.muted{fill:#aabbd0;font-size:17px}.eyebrow{fill:#a8ee8b;font-size:15px;font-weight:700;letter-spacing:3px}.big{font-size:66px;font-weight:800;letter-spacing:-3px}.selector{font-family:Consolas,Menlo,monospace;font-size:18px;fill:#dce6f1}.ratio{font-size:23px;font-weight:700;fill:#baf471}</style>
<rect width="1100" height="910" rx="24" fill="url(#bg)"/>
<ellipse cx="920" cy="70" rx="360" ry="220" fill="url(#glow)"/>
<rect x=".5" y=".5" width="1099" height="909" rx="24" fill="none" stroke="#2b3a50"/>
<text x="48" y="48" class="eyebrow">NWSAPI / PERFORMANCE</text>
<text x="48" y="107" font-size="46" font-weight="700" letter-spacing="-1">Find it. Faster.</text>
<text x="48" y="199" class="big">${wins}<tspan fill="#7e91ab" font-size="42">/${rows.length}</tspan></text>
<text x="48" y="234" class="muted">all-results queries faster</text>
<path d="M398 154v91M746 154v91" stroke="#304159"/>
<text x="438" y="199" class="big">${doubles}<tspan fill="#7e91ab" font-size="42">/${rows.length}</tspan></text>
<text x="438" y="234" class="muted">at least 2× faster</text>
<text x="786" y="199" class="big" style="fill:#baf471">${Math.max(...ratios).toFixed(1)}×</text>
<text x="786" y="234" class="muted">peak first-match speedup</text>
<path d="M48 274H1052" stroke="#304159"/>
<text x="48" y="318" font-size="23" font-weight="700">First match, less waiting.</text>
<text x="48" y="345" class="muted">All 12 nonempty queries · Longer is faster</text>
<path d="M787 324v20" stroke="#e4eaf2" stroke-width="2"/>
<text x="801" y="340" class="muted">jsdom baseline = 1×</text>
${bars}
<path d="M48 798H1052" stroke="#304159"/>
<text x="48" y="831" class="muted">Recorded warm queries · NWSAPI 2.3.0-prerelease vs dom-selector ${escapeText(first.metadata.competitor)}</text>
<text x="48" y="856" class="muted">First match: direct NWSAPI API vs jsdom querySelector · jsdom ${escapeText(first.metadata.jsdom)}</text>
<text x="48" y="881" class="muted">Node.js ${escapeText(first.metadata.node.replace(/^v/, ''))} · ${escapeText(first.metadata.cpu)} · Full results &amp; methodology linked below</text>
</svg>`
writeFileSync(
  new URL('assets/repo/bench/readme-performance.svg', root),
  optimiseSvg(svg) + '\n',
)
