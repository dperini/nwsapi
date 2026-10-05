import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../../lib/run-node.mts'

interface Metric {
  label: string
  cases: number
  geometricTimePercent: number
  totalTimePercent: number
  worstTimeRatio: number
}
interface Measurement {
  metadata: { variants: string[]; power: string; powerAfter: string }
  rows: Array<{ id: string; fixtureSha256: string; costs: number[] }>
  summaries: Record<string, Metric[]>
}

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
function load(directory: string, host: string): Measurement {
  return JSON.parse(
    readFileSync(path.join(directory, `${host}.json`), 'utf8'),
  ) as Measurement
}
function panel(host: string, group: string, first: Metric[], repeat: Metric[]) {
  const titles: Record<string, string> = {
    all: 'All measured queries',
    older: 'Older controls',
    crossed: 'Crossed layouts',
    diagnostic: 'Diagnostic layouts',
  }
  const context: Record<string, string> = {
    all: '304 existing queries: 112 older controls, 96 crossed cases and 96 diagnostic cases.',
    older:
      '112 older cases include flat and nested structures, small queries and repository workload pages.',
    crossed:
      '96 previously measured validation and evaluation cases cross candidate counts and attribute filters.',
    diagnostic:
      '96 previously measured cases use nesting depths 2, 7 and 15, ratios 3 or 5 and all filter combinations.',
  }
  const maximum =
    1.08 *
    Math.max(
      ...first.map(row => row.geometricTimePercent),
      ...repeat.map(row => row.geometricTimePercent),
    )
  const rows = first
    .map((metric, index) => {
      const bars = [metric, repeat[index]!]
        .map(
          (row, pass) =>
            `<div class="run"><span>${pass ? 'Repeat' : 'First'}</span><div class="track"><div class="bar ${pass ? 'repeat' : ''}" style="width:${(100 * row.geometricTimePercent) / maximum}%"></div></div><strong>${row.geometricTimePercent.toFixed(1)}%</strong></div>`,
        )
        .join('')
      return `<h3>${escape(metric.label)}</h3>${bars}`
    })
    .join('')
  const difference = [first, repeat].map(
    metrics =>
      100 *
      (metrics[3]!.geometricTimePercent / metrics[2]!.geometricTimePercent - 1),
  )
  const comparison = difference
    .map(
      (value, index) =>
        `${index ? 'Repeat' : 'First'}: cache takes ${Math.abs(value).toFixed(1)}% ${value > 0 ? 'more' : 'less'} time than the uncached model`,
    )
    .join('. ')
  return `<section><h2>${host} · ${titles[group]}</h2><p class="direction">↓ Lower is faster. Before integration = 100%.</p>${rows}<p>${context[group]} Bars show the geometric average of relative complete-query time.</p><p>${comparison}.</p><p>Worst retained-planner query: ${(100 * first[2]!.worstTimeRatio).toFixed(1)}% of its baseline time first, ${(100 * repeat[2]!.worstTimeRatio).toFixed(1)}% in the repeat.</p><p>Worst cache-trial query: ${(100 * first[3]!.worstTimeRatio).toFixed(1)}% of its baseline time first, ${(100 * repeat[3]!.worstTimeRatio).toFixed(1)}% in the repeat. Check slower cases even when the average improves.</p></section>`
}

function outliers(directory: string) {
  const hosts = ['chromium', 'jsdom']
    .map(host => {
      const data = load(directory, host)
      const rows = data.rows
        .toSorted(
          (left, right) =>
            right.costs[2]! / right.costs[0]! - left.costs[2]! / left.costs[0]!,
        )
        .slice(0, 6)
        .map(row => {
          const percent = (index: number) =>
            ((100 * row.costs[index]!) / row.costs[0]!).toFixed(1)
          return `<tr><td>${escape(row.id)}</td><td>${percent(1)}%</td><td>${percent(2)}%</td><td>${percent(3)}%</td></tr>`
        })
        .join('')
      return `<h3>${host}</h3><table><thead><tr><th>Query</th><th>Planner off</th><th>Planner on</th><th>Cache trial</th></tr></thead><tbody>${rows}</tbody></table>`
    })
    .join('')
  return `<section><h2>Repeat outlier review</h2><p>This additional reversed pass uses the same 304 fixtures. Each cell is query time relative to the pre-integration engine at 100%. It also compares the integrated engine with the planner disabled to help separate planner effects from integration and timing noise. Large differences between passes mean the case needs more repeats. The report includes unfiltered cases where the neural policy is ineligible. Slow time on those cases is not evidence that the model chose a slow route.</p>${hosts}<p>These are the six slowest planner-on rows from this pass, not a new independent workload.</p></section>`
}

export function runtimeReport(
  firstDirectory: string,
  repeatDirectory: string,
  output: string,
  qualityDirectory?: string,
) {
  const panels: string[] = []
  const power: string[] = []
  for (const host of ['chromium', 'jsdom']) {
    const first = load(firstDirectory, host)
    const repeat = load(repeatDirectory, host)
    assert.deepEqual(
      first.metadata.variants,
      repeat.metadata.variants,
      'Bundles changed',
    )
    assert.deepEqual(
      first.rows.map(row => `${row.id}:${row.fixtureSha256}`).toSorted(),
      repeat.rows.map(row => `${row.id}:${row.fixtureSha256}`).toSorted(),
      'Fixtures changed',
    )
    power.push(
      `${host} first:\n${first.metadata.power}\n${first.metadata.powerAfter}\nRepeat:\n${repeat.metadata.power}\n${repeat.metadata.powerAfter}`,
    )
    for (const group of ['all', 'older', 'crossed', 'diagnostic']) {
      panels.push(
        panel(
          host === 'chromium' ? 'Chromium' : 'jsdom',
          group,
          first.summaries[group]!,
          repeat.summaries[group]!,
        ),
      )
    }
  }
  writeFileSync(
    output,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWSAPI integrated planner measurements</title><style>
:root{color-scheme:light;background:#f3f6fb;color:#17243c;font:16px/1.6 system-ui}body{max-width:1000px;margin:auto;padding:40px 24px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15}h2{font-size:23px}h3{font-size:16px;margin:18px 0 8px}section,details{background:white;border:1px solid #dbe3ef;border-radius:18px;padding:26px;margin:24px 0;box-shadow:0 8px 24px #24355008}.direction{color:#2255a8;font-weight:650}.run{display:grid;grid-template-columns:65px 1fr 75px;gap:12px;align-items:center;margin:7px 0}.track{height:22px;background:#edf1f7;border-radius:7px;overflow:hidden}.bar{height:100%;background:#a0b5ee;border-radius:7px}.repeat{background:linear-gradient(90deg,#5074ec,#8977eb)}strong{font-variant-numeric:tabular-nums}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){body{padding:24px 14px}section,details{padding:18px}.run{grid-template-columns:48px 1fr 65px;gap:8px;font-size:13px}}
</style><main><p>NWSAPI · Integrated runtime</p><h1>Does the planner make normal queries faster?</h1><p>This comparison measures the engine before integration, the integrated engine with the planner disabled, the enabled model and a one-entry model-decision cache.</p><p><strong>Decision: keep the selector guard fix and the uncached planner. The cache did not deliver a consistent extra gain in the reversed pass.</strong></p><p>The cache trial stores counts, flags and a boolean. It stores no elements or query results. Matching and candidate collection still run on every query.</p><details><summary>How to read the charts and how we measured</summary><p>100% is the earlier engine time. 80% means 20% less time. 110% means 10% more time. Measurements include full warm queries with native element identities and order checked before and after timing. The first pass uses nine rounds of at least 12ms. The repeat reverses cases and versions and uses at least 16ms. Policies are frozen. We explicitly select each host policy outside timing.</p><p>These fixtures have been examined before. This is tuning evidence, not independent qualification. Cold calls, alternating selectors, mutations and other applications still need measurement.</p><pre>${escape(power.join('\n\n'))}</pre></details>${panels.join('\n')}${qualityDirectory ? outliers(qualityDirectory) : ''}<p>Inputs: <code>${escape(firstDirectory)}</code> and <code>${escape(repeatDirectory)}</code>.</p></main></html>\n`,
  )
}

if (isMainModule(import.meta.url)) {
  const [first, repeat, output, quality] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/runtime/report.mts first repeat output.html [quality-pass]',
    )
  } else if (!first || !repeat || !output) {
    throw new Error('Provide both measurement directories and an HTML output')
  } else {
    runtimeReport(first, repeat, output, quality)
  }
}
