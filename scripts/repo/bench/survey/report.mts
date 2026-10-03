import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../lib/paths.mts'
import { escapeText } from '../charts.mts'

const source = path.join(REPO_ROOT, 'docs/repo/perf/survey-2026-10-03.md')
const output = path.join(
  REPO_ROOT,
  'assets/repo/bench/survey-2026-10-03/index.html',
)

function render() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim()
  // The input is maintained repository Markdown, including its details blocks.
  let body = execFileSync(
    'npx',
    ['--yes', '--package=marked@18.0.14', 'marked', '--input', source],
    {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    },
  )
  const sections: Array<{ id: string; title: string }> = []
  body = body.replace(/<h2>(.*?)<\/h2>/g, (_match, title: string) => {
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-$/, '')
    sections.push({ id, title })
    return `<h2 id="${id}">${title}</h2>`
  })
  body = body.replace(
    /(href|src)="(\.\.\/[^"#]+)"/g,
    (_match, attribute: string, target: string) => {
      const absolute = path.resolve(path.dirname(source), target)
      const relative = path.relative(path.dirname(output), absolute)
      const url = relative.startsWith('../')
        ? `https://github.com/dperini/nwsapi/blob/${revision}/${path.relative(REPO_ROOT, absolute)}`
        : relative
      return `${attribute}="${escapeText(url)}"`
    },
  )
  body = body
    .replaceAll(
      '<table>',
      '<div class="table-scroll" tabindex="0" role="region" aria-label="Report comparison table"><table>',
    )
    .replaceAll('</table>', '</table></div>')
  const measurements = JSON.parse(
    readFileSync(path.join(path.dirname(output), 'results.json'), 'utf8'),
  ) as { rows: unknown[] }
  const nav = sections
    .map(section => `<a href="#${section.id}">${section.title}</a>`)
    .join('')
  writeFileSync(
    output,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>NWSAPI v3 · Performance audit</title><style>${styles}</style></head>
<body><a class="skip" href="#report">Skip to report</a><div class="topbar"><a class="brand" href="#">NWSAPI <span>/ v3 research</span></a><div><a href="atlas/index.html">Explore charts ↗</a><button onclick="window.print()">Print / PDF</button></div></div>
<div class="layout"><aside><p class="eyebrow">October 3, 2026</p><nav aria-label="Report sections">${nav}</nav><div class="sidebar-note">Recorded evidence<br>Prioritized experiments<br>Exact selector semantics</div></aside>
<main id="report"><div class="eyebrow">Performance engineering / research report</div><div class="summary"><div><b>07</b><span>ranked opportunities</span></div><div><b>${measurements.rows.length}</b><span>comparison cases</span></div><div><b>03</b><span>recommended next steps</span></div></div><article>${body}</article><footer><a href="atlas/index.html">Open the full chart explorer →</a><p>Generated from the maintained audit. Measurements, limitations and implementation proposals are preserved.</p></footer></main></div>
<script>const links=[...document.querySelectorAll('nav a')];const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){for(const link of links){link.toggleAttribute('aria-current',link.hash==='#'+entry.target.id)}}}},{rootMargin:'-10% 0px -70% 0px'});document.querySelectorAll('h2[id]').forEach(section=>observer.observe(section));</script></body></html>\n`,
  )
  console.log(`Rendered complete audit: ${output}`)
}

const styles = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e2eaf4;background:#0b111c;font-synthesis:none}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:100px}body{margin:0;background:radial-gradient(ellipse 1000px 600px at 75% 0,#183046,transparent)}a{color:#b5edc1;text-decoration-thickness:1px;text-underline-offset:4px}a:hover{color:#fff}a:focus-visible,button:focus-visible,[tabindex]:focus-visible{outline:2px solid #b5edc1;outline-offset:5px}.skip{position:absolute;top:-80px;background:#172538;padding:16px;z-index:5}.skip:focus{top:10px}.topbar{height:76px;padding:0 40px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #263344;background:#0b111cee;position:sticky;top:0;z-index:2;backdrop-filter:blur(15px)}.brand{font-weight:750;letter-spacing:.1em;text-decoration:none;color:#fff}.brand span{font-weight:400;letter-spacing:0;color:#95a9bd}.topbar>div{display:flex;align-items:center;gap:28px;font-size:13px}button{color:#c5d4e5;background:none;border:1px solid #3b5065;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer}.layout{max-width:1480px;display:grid;grid-template-columns:255px minmax(0,1fr);gap:65px;padding:52px 44px;margin:auto}aside{align-self:start;position:sticky;top:125px}nav{display:flex;flex-direction:column;gap:8px;margin:26px 0}nav a{font-size:14px;text-decoration:none;line-height:1.5;color:#91a7c0;padding:10px 12px;border-left:2px solid transparent}nav a[aria-current]{color:#b5edc1;border-color:#b5edc1;background:#142635;border-radius:0 6px 6px 0}.eyebrow{text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.14em;color:#9bdfb0}.sidebar-note{border-top:1px solid #253649;padding:24px 12px;color:#6e859e;font-size:12px;line-height:2}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:27px 0 38px}.summary>div{border:1px solid #2a3e52;border-radius:12px;padding:18px 20px;background:#12223380}.summary b{display:block;font-size:30px;font-weight:500;color:#c1eed0}.summary span{font-size:12px;color:#97adc4}h1{font-size:clamp(34px,4.2vw,57px);line-height:1.08;letter-spacing:-.04em;max-width:780px;font-weight:650;margin:0 0 30px;color:#f4f7fb}h2{font-size:30px;letter-spacing:-.025em;line-height:1.3;color:#f4f7fb;margin:68px 0 25px;padding-top:28px;border-top:1px solid #2b3a4d}h3{font-size:20px;line-height:1.4;margin:34px 0 18px;color:#dae7f5}p,li{font-size:15px;line-height:1.85;color:#aebfd1}p{margin:18px 0}li{padding-left:8px;margin:12px 0}code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;color:#d3e6f5;background:#1b2a3a;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{background:#080e17;border:1px solid #29394d;border-radius:12px;padding:22px;overflow:auto;line-height:1.8}pre code{padding:0;background:none;white-space:pre;overflow-wrap:normal}.table-scroll{overflow:auto;border:1px solid #2b3d53;border-radius:12px;margin:26px 0}table{border-collapse:collapse;width:100%;min-width:620px;font-size:13px;line-height:1.7}th{background:#1b2e43;color:#dce9f7;text-align:left;font-weight:600;padding:16px}td{padding:19px 16px;vertical-align:top;border-top:1px solid #25384d;color:#aebfd1}tbody tr:nth-child(even){background:#12203088}td:first-child{color:#cae4d6;font-weight:550}td code{font-size:12px}th:first-child{min-width:75px}article>.table-scroll:first-of-type td:nth-child(2){min-width:180px}article>.table-scroll:first-of-type td:nth-child(3){min-width:220px}article>.table-scroll:first-of-type td:nth-child(4){min-width:240px}details{border:1px solid #2a4055;border-radius:12px;background:#112031;padding:18px 22px;margin:24px 0}summary{cursor:pointer;font-size:14px;color:#c3dbef}article img{display:block;width:100%;height:auto;border-radius:18px;margin:28px 0}footer{border-top:1px solid #2b3a4d;margin-top:60px;padding:32px 0}footer p{font-size:12px;color:#758aa3}@media(max-width:1050px){.layout{grid-template-columns:190px minmax(0,1fr);gap:30px;padding:32px 24px}.topbar{padding:0 24px}}@media(max-width:760px){.layout{display:block;padding:28px 18px}.topbar{padding:0 18px;height:65px}.brand span{display:none}.topbar>div{gap:14px}.topbar button{display:none}aside{position:static}aside .eyebrow,.sidebar-note{display:none}nav{display:flex;flex-direction:row;overflow:auto;margin:0 0 30px;gap:0}nav a{white-space:nowrap;font-size:12px}.summary>div{padding:12px}.summary b{font-size:25px}.summary span{font-size:11px}h1{font-size:39px}h2{font-size:25px}p,li{font-size:14px}}@media print{html{scroll-behavior:auto}body{background:white;color:#111}.topbar,aside,.summary,.eyebrow,.skip,footer{display:none}.layout{display:block;padding:0}h1,h2,h3,p,li,td,th,a,code{color:#111}h1{font-size:30px}h2{break-after:avoid;margin-top:30px}.table-scroll,pre{overflow:visible}table{min-width:0;font-size:10px}th,td{padding:8px}th,tbody tr:nth-child(even),code,pre,details{background:#f6f6f6}article>.table-scroll:first-of-type td:nth-child(n){min-width:0}a{overflow-wrap:anywhere}details>*{display:block}summary{display:block;color:#111}}
`

if (process.argv.includes('--help')) {
  console.log(
    'Usage: node scripts/repo/bench/survey/report.mts\nRenders the October 3 audit as HTML using the pinned marked@18.0.14 CLI through npx. The first render may download the renderer. No runtime dependency is added.',
  )
} else {
  render()
}
