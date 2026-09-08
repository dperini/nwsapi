import { readFileSync, writeFileSync } from 'node:fs'
import { optimiseSvg } from './svg-optimize.mts'
import { escapeText } from '../bench/charts.mts'

const root = new URL('../../../', import.meta.url)
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'))
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
    const y = 330 + (i % 6) * 69
    const width = (ratios[i] / maximum) * plotWidth
    const baseline = x + plotWidth / maximum
    return `<text x="${x}" y="${y}" class="selector">${escapeText(row.selector)}</text>
    <text x="${x + 460}" y="${y}" text-anchor="end" class="ratio">${ratios[i].toFixed(1)}×</text>
    <rect x="${x}" y="${y + 13}" width="${plotWidth}" height="12" rx="6" fill="#223048"/>
    <rect x="${x}" y="${y + 13}" width="${width.toFixed(2)}" height="12" rx="6" fill="url(#bar)" class="bar" style="animation-delay:${(i % 6) * 70}ms"/>
    <path d="M${baseline.toFixed(2)} ${y + 8}v22" stroke="#e4eaf2" stroke-width="2"/>`
  })
  .join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="830" viewBox="0 0 1100 830" role="img" aria-labelledby="title desc">
<title id="title">NWSAPI first-match performance</title>
<desc id="desc">Recorded nonempty first-match queries are ${Math.min(...ratios).toFixed(1)} to ${Math.max(...ratios).toFixed(1)} times faster using nwsapi directly than jsdom querySelector with @asamuzakjp/dom-selector. Each bar starts at zero; white ticks mark the jsdom baseline of one. See linked methodology.</desc>
<defs>
<linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101d30"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
<linearGradient id="bar"><stop stop-color="#38cfae"/><stop offset="1" stop-color="#c0f767"/></linearGradient>
<radialGradient id="glow"><stop stop-color="#77e5a4" stop-opacity=".12"/><stop offset="1" stop-color="#77e5a4" stop-opacity="0"/></radialGradient>
</defs>
<style>
text{font-family:Arial,Helvetica,sans-serif;fill:#f0f5fa}
.muted{fill:#aabbd0;font-size:17px}
.eyebrow{fill:#a8ee8b;font-size:15px;font-weight:700;letter-spacing:3px}
.code,.selector{font-family:Consolas,Menlo,monospace;font-size:18px;fill:#dce6f1}
.ratio{font-size:23px;font-weight:700;fill:#baf471}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 750ms cubic-bezier(.22,1,.36,1) 1 both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
<rect width="1100" height="830" rx="24" fill="url(#bg)"/>
<ellipse cx="920" cy="70" rx="360" ry="220" fill="url(#glow)"/>
<rect x=".5" y=".5" width="1099" height="829" rx="24" fill="none" stroke="#2b3a50"/>
<text x="48" y="48" class="eyebrow">PERFORMANCE</text>
<text x="48" y="102" font-size="42" font-weight="700" letter-spacing="-1">Fast CSS Selectors API Engine</text>
<text x="48" y="183" font-size="66" font-weight="800" letter-spacing="-3" fill="#baf471" style="fill:#baf471">${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}×</text>
<text x="407" y="165" font-size="25" font-weight="700">faster first matches</text>
<text x="407" y="193" class="muted">Recorded warm-query comparison</text>
<rect x="48" y="216" width="100" height="32" rx="6" fill="#223048"/>
<text x="64" y="238" class="code">nwsapi</text>
<text x="163" y="238" class="muted">vs</text>
<rect x="199" y="216" width="317" height="32" rx="6" fill="#223048"/>
<text x="213" y="238" class="code">@asamuzakjp/dom-selector</text>
<path d="M48 273H1052" stroke="#304159"/>
<text x="48" y="304" class="muted">First-match speedup · Longer is faster</text>
<path d="M788 288v20" stroke="#e4eaf2" stroke-width="2"/>
<text x="802" y="304" class="muted"><tspan class="code">jsdom</tspan> baseline = 1×</text>
${bars}
<path d="M48 737H1052" stroke="#304159"/>
<text x="48" y="766" class="muted"><tspan class="code">nwsapi</tspan> 2.3.0-prerelease · <tspan class="code">@asamuzakjp/dom-selector</tspan> ${escapeText(first.metadata.competitor)} · <tspan class="code">jsdom</tspan> ${escapeText(first.metadata.jsdom)}</text>
<text x="48" y="791" class="muted">Direct engine API vs <tspan class="code">jsdom</tspan> querySelector · Node.js ${escapeText(first.metadata.node.replace(/^v/, ''))} · ${escapeText(first.metadata.cpu)}</text>
<text x="48" y="816" class="muted">Full results &amp; methodology linked below</text>
</svg>`

writeFileSync(
  new URL('assets/repo/bench/readme-performance.svg', root),
  optimiseSvg(svg) + '\n',
)
