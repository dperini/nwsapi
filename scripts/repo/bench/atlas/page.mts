import { escapeText } from '../charts.mts'
import { duration, ratioLabel, speedup } from './model.mts'
import type { Report } from './model.mts'

export interface Panel {
  category: string
  file: string
  selectors: string[]
}

const style = `
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;color:#eaf0f7;background:#080e18}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 10% 0,#1b3448,transparent 55%)}
main{max-width:1180px;margin:auto;padding:60px 30px}a{color:#a9efb4}header{padding:20px 0 32px}
.eyebrow{color:#a9efb4;letter-spacing:.18em;text-transform:uppercase;font-size:12px;font-weight:700}
h1{font-size:clamp(38px,6vw,68px);line-height:1.05;letter-spacing:-.045em;margin:20px 0}
.intro{font-size:18px;max-width:780px;line-height:1.7;color:#a9b9cc}code{font-family:Menlo,Consolas,monospace}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}
.stat,details,.toolbar{border:1px solid #2a3c51;background:#111e2dbb;border-radius:16px;padding:20px}
.stat b{display:block;font-size:30px;font-weight:550;margin-bottom:8px}.stat span,p,small{color:#9eb0c5}
summary{cursor:pointer;color:#dce6f2}details p{line-height:1.7}dl{display:grid;grid-template-columns:150px 1fr;gap:10px;font-size:13px}dd{margin:0;overflow-wrap:anywhere;color:#acbed1}
.toolbar{display:flex;gap:20px;margin:28px 0;align-items:center}label{font-size:13px}select,input{background:#0b1422;border:1px solid #38516a;border-radius:8px;color:inherit;padding:10px;margin-left:10px}input{width:250px}
figure{margin:28px 0 36px}figure img{width:100%;height:auto;display:block}figcaption{font-size:13px;line-height:1.7;padding:14px 8px;max-width:1000px}
.table-wrap{overflow:auto;border:1px solid #293b50;border-radius:16px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:14px;text-align:left;border-bottom:1px solid #223246;white-space:nowrap}th{background:#142235;color:#b5c8dc}td:nth-child(n+3){font-variant-numeric:tabular-nums}tr.slower td:last-child{color:#bfacff}tr.faster td:last-child{color:#a9efb4}footer{padding-top:30px;font-size:13px;line-height:1.8}
[hidden]{display:none!important}@media(max-width:650px){main{padding:24px 12px}.stats{gap:8px}.stat{padding:14px}.stat b{font-size:23px}.toolbar{flex-direction:column;align-items:stretch}input{width:65%}dl{grid-template-columns:100px 1fr}}
`

export function atlasPage(report: Report, panels: Panel[], inputHash: string) {
  const { metadata: meta, rows } = report
  const names = meta.engines.map(engine => escapeText(engine.name))
  const proseNames = names.map(name =>
    name.replace(/^(\S+)(.*)$/, '<code>$1</code>$2'),
  )
  const categories = [...new Set(rows.map(row => row.category))]
  const measured = rows.filter(row => speedup(row) !== null)
  const faster = measured.filter(row => speedup(row)! > 1).length
  const fields = {
    Runtime: meta.runtime ?? 'not recorded',
    Host: meta.host ?? 'not recorded',
    Hardware: meta.cpu ?? 'not recorded',
    Power: meta.power ?? 'not recorded',
    Recorded: meta.timestamp,
    Candidate: meta.candidateSha256 ?? 'not recorded',
    'Input SHA-256': inputHash,
  }
  const figures = panels
    .map(
      panel =>
        `<figure data-category="${escapeText(panel.category)}" data-search="${escapeText(panel.selectors.join(' ').toLowerCase())}"><a href="${panel.file}"><img src="${panel.file}" alt="${escapeText(panel.category)} median query latency comparison" loading="lazy"/></a><figcaption>${escapeText(panel.category)} · ${panel.selectors.length} selector cases from the recorded fixtures. Direct library calls on the same host, with all result elements returned. Dots show medians of per-round batch averages. Whiskers show observed minimum–maximum across rounds. These charts exclude compilation, initialization and mutation costs.</figcaption></figure>`,
    )
    .join('')
  const table = rows
    .map(
      row =>
        `<tr data-category="${escapeText(row.category)}" data-search="${escapeText(row.selector.toLowerCase())}" class="${(speedup(row) ?? 0) > 1 ? 'faster' : 'slower'}"><td>${escapeText(row.category)}</td><td><code>${escapeText(row.selector)}</code></td>${row.milliseconds.map((value, i) => `<td>${escapeText(row.errors[i] || duration(value))}</td>`).join('')}<td>${ratioLabel(row)}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWSAPI · Performance atlas</title><style>${style}</style><main><header><div class="eyebrow">NWSAPI / performance laboratory</div><h1>Every query.<br>Every comparison.</h1><p class="intro">A reproducible latency atlas for ${proseNames[0]} and ${proseNames[1]}. Explore the full measured set, including slower cases and round-to-round variation.</p></header><div class="stats"><div class="stat"><b>${rows.length}</b><span>selector cases</span></div><div class="stat"><b>${meta.rounds}</b><span>rounds per engine</span></div><div class="stat"><b>${faster} / ${measured.length}</b><span>lower median for first engine</span></div></div><details><summary>Measurement method &amp; provenance</summary><p>${escapeText(meta.timingEngine ?? 'See the recorded input for the measurement method.')} The charts show warm queries returning all matches. Case counts are descriptive, not a statistical significance claim. Fixtures are synthetic workloads, not an application-wide speedup estimate. Whiskers are observed ranges, not confidence intervals. Axes are logarithmic and independently scaled per panel. Ratios are second-engine latency divided by first-engine latency. Above 1× favors the first engine, below 1× favors the second.</p><dl>${Object.entries(
    fields,
  )
    .map(([name, value]) => `<dt>${name}</dt><dd>${escapeText(value)}</dd>`)
    .join(
      '',
    )}</dl><p><a href="measurements.json">Recorded measurements and raw round samples</a></p></details><div class="toolbar"><label>Category<select id="category"><option value="">All categories</option>${categories.map(category => `<option>${escapeText(category)}</option>`).join('')}</select></label><label>Find selector<input id="search" type="search" placeholder="e.g. :has or input"></label><small id="visible" aria-live="polite"></small></div>${figures}<h2>Exact results</h2><div class="table-wrap"><table><thead><tr><th>Category</th><th>Selector</th><th>${names[0]}</th><th>${names[1]}</th><th>Relative speed</th></tr></thead><tbody>${table}</tbody></table></div><footer>Generated from recorded measurements. No CDN, network requests, fonts or tracking required.<br>Open any chart to save its standalone SVG. Raw samples and fingerprints travel with this report.</footer></main><script>
const category=document.getElementById('category'),search=document.getElementById('search');
function filter(){let count=0;for(const item of document.querySelectorAll('[data-category]')){item.hidden=!!((category.value&&item.dataset.category!==category.value)||!item.dataset.search.includes(search.value.toLowerCase()));if(item.tagName==='TR'&&!item.hidden)count++}document.getElementById('visible').textContent=count+' cases shown'}
category.addEventListener('change',filter);search.addEventListener('input',filter);filter();
</script></html>\n`
}
