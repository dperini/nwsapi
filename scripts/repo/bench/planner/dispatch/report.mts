import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { geomean } from '../neural/oracle.mts'
import { split } from './fixtures.mts'

interface Timings {
  metadata: {
    power: string
    powerAfter: string
    status: string
    labels: string[]
    policy?: string
    trainingScope?: string
    familyCounts?: Record<string, number>
    decisionCache?: string
  }
  rows: Array<{ family: string; costs: number[] }>
  summaries: Record<
    string,
    {
      model: Metric
      simpleRule: Metric
      cachedModel?: Metric
      cachedRule?: Metric
    }
  >
}
interface Metric {
  cases: number
  geometricSpeedRatio: number
  totalTimeSpeedRatio: number
  worstTimeRatio: number
  passesGate: boolean
}

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function chart(data: Timings, host: string, group: string) {
  const names: Record<string, string> = {
    evaluation: 'Reserved synthetic cases',
    development: 'Existing benchmark cases',
    validation: 'Model selection cases',
  }
  const rows = data.rows.filter(row => split(row.family) === group)
  const values = data.metadata.labels.map((label, index) => ({
    label,
    value: 100 * geomean(rows.map(row => row.costs[index]! / row.costs[0]!)),
  }))
  const maximum = Math.max(...values.map(row => row.value)) * 1.08
  const metrics = data.summaries[group]!
  const primary = metrics.cachedModel ?? metrics.model
  const modelIndex = metrics.cachedModel ? 3 : 2
  const ruleIndex = metrics.cachedRule ? 4 : 1
  const ruleTime = geomean(
    rows.map(row => row.costs[modelIndex]! / row.costs[ruleIndex]!),
  )
  return `<section><h2>${host} · ${names[group]}</h2><p class="direction">↓ Lower is faster. Current v3 = 100%.</p>
    ${values.map((row, index) => `<div class="row"><span>${escape(row.label)}</span><div class="track"><div class="bar ${index === 0 ? 'baseline' : ''}" style="width:${(100 * row.value) / maximum}%"></div></div><strong>${row.value.toFixed(1)}%</strong></div>`).join('')}
    <p>${rows.length} warm all-results queries. Every bar includes the existing witness preflight, route decision, and full query. ${group === 'development' ? 'These fixtures were examined in earlier experiments.' : 'These synthetic template families were reserved before training.'}</p>
    <p>${metrics.cachedModel ? 'Total time with cached model decisions' : 'Total model time'}, one query per case: ${(100 / primary.totalTimeSpeedRatio).toFixed(1)}% of current v3. Worst relative query: ${(100 * primary.worstTimeRatio).toFixed(1)}% of current v3. Group check: <strong>${primary.passesGate ? 'passed' : 'failed'}</strong>.</p>
    <p>${metrics.cachedModel ? 'Compared with the cached filter rule, the cached model takes' : 'Compared with the simple rule, the model takes'} ${(100 * Math.abs(ruleTime - 1)).toFixed(1)}% ${ruleTime > 1 ? 'more' : 'less'} time on average. Small differences need stable repeat measurements before claiming a model advantage.</p>${cacheNote(rows, Boolean(metrics.cachedModel))}</section>`
}

function cacheNote(rows: Array<{ costs: number[] }>, enabled: boolean) {
  if (!enabled) {
    return ''
  }
  const ratio = geomean(rows.map(row => row.costs[3]! / row.costs[2]!))
  return `<p>With decision reuse, the model takes ${(ratio * 100).toFixed(1)}% of its uncached complete-query time in this group. Both variants have the same weights. These timings repeat the same inputs on an unchanged DOM. Cold queries and alternating input patterns still need measurement.</p>`
}

function qualifies(data: Timings, group: string) {
  const metric = data.summaries[group]
  return (metric?.cachedModel ?? metric?.model)?.passesGate
}

function trainingDescription(data: Timings, host: string) {
  const counts = data.metadata.familyCounts
  return `${host}: ${counts?.['train'] ?? 6} training families, ${counts?.['validation'] ?? 2} selection families, ${counts?.['evaluation'] ?? 2} evaluation families. ${data.metadata.trainingScope ?? 'Previous fixtures are development controls.'} ${data.metadata.decisionCache ?? ''}`
}

function scopeParagraph(note: string | undefined) {
  return note ? `<p>${escape(note)}</p>` : ''
}

export function report(
  confirmation: string,
  output: string,
  scopeNote?: string,
) {
  const panels: string[] = []
  const status: string[] = []
  const decisions: string[] = []
  const power: string[] = []
  const training: string[] = []
  for (const host of ['chromium', 'jsdom']) {
    const label = host === 'chromium' ? 'Chromium' : 'jsdom'
    const data = JSON.parse(
      readFileSync(path.join(confirmation, `${host}.json`), 'utf8'),
    ) as Timings
    training.push(trainingDescription(data, label))
    status.push(
      `${label}: ${data.metadata.status === 'validation-passed' ? 'training check passed' : 'training check failed'}`,
    )
    const qualified =
      qualifies(data, 'evaluation') && qualifies(data, 'development')
    decisions.push(
      `${label}: ${qualified ? 'requires application qualification' : 'did not qualify'}`,
    )
    power.push(
      `${host}: ${data.metadata.power}\nAfter: ${data.metadata.powerAfter}`,
    )
    for (const group of ['evaluation', 'development', 'validation'].filter(
      name => data.summaries[name],
    )) {
      panels.push(chart(data, label, group))
    }
  }
  const parity = JSON.parse(
    readFileSync(path.join(confirmation, 'parity.json'), 'utf8'),
  ) as {
    cases: Record<string, number>
    ruleCases?: Record<string, number>
    mismatches: number
  }
  writeFileSync(
    output,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NWSAPI: choosing a route before profiling</title><style>
:root{color-scheme:light;background:#f3f6fb;color:#17243c;font:16px/1.6 system-ui}body{max-width:1020px;margin:0 auto;padding:44px 24px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15}h2{font-size:23px}section,details{background:white;border:1px solid #dbe3ef;border-radius:18px;padding:26px;margin:24px 0;box-shadow:0 8px 24px #24355008}.direction{color:#2255a8;font-weight:650}.row{display:grid;grid-template-columns:170px 1fr 85px;gap:18px;align-items:center;margin:20px 0}.track{background:#edf1f7;border-radius:8px;overflow:hidden;height:30px}.bar{height:100%;background:linear-gradient(90deg,#5074ec,#8977eb);border-radius:8px}.baseline{background:linear-gradient(90deg,#17a58b,#5cbbaa)}strong{font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#2255a8}@media(max-width:600px){body{padding:24px 14px}.row{grid-template-columns:110px 1fr 65px;gap:10px;font-size:13px}section,details{padding:18px}}
</style><main><p>NWSAPI · PyTorch route experiment</p><h1>Choose the route before doing extra query work</h1>
<p>The model uses candidate counts and selector facts the engine already obtains. It does not inspect four anchors before deciding. The default action is the current v3 route.</p>
<p>This is a development experiment. Runtime promotion requires useful gains over the simple rule and qualification beyond synthetic templates.</p>
${scopeParagraph(scopeNote)}
<p><strong>Complete-query decision:</strong> ${escape(decisions.join(' · '))}.</p>
<p><strong>Training validation status:</strong> ${escape(status.join(' · '))}. A selected research checkpoint is not an accepted runtime feature.</p>
<details><summary>How to read the results and how we measured them</summary><p>100% is current v3 query time. A bar at 90% took 10% less time. A bar at 110% took 10% more time. Bars use the geometric average of relative query times. Total time adds one measured query time per case and shows the sum as a percentage of current v3. Expensive queries have more effect on that sum. Actual application query frequencies may differ.</p><p>Each case has 11 rotating timing rounds of at least 20ms, or 24ms for a reversed-order repeat. Exact result order and element identities are checked around timing. All feature preparation and emitted JavaScript inference are inside each query. Separate host models use linear, two-unit, four-unit, and eight-unit PyTorch candidates with three fixed seeds. ${escape(training.join(' '))} Evaluation measurements are included only after training validation passes. These are synthetic experiments, not independent application results.</p><p>The gate requires at least a 1.05× geometric speed ratio, no increase in total time, and no query taking more than 1.15× baseline time. Python and JavaScript agree on ${Object.values({ ...parity.cases, ...Object.fromEntries(Object.entries(parity.ruleCases ?? {}).map(([host, count]) => [host + '-rule', count])) }).reduce((sum, value) => sum + value, 0)} parity cases, with ${parity.mismatches} mismatches.</p><pre>${escape(power.join('\n\n'))}</pre></details>
${panels.join('\n')}<p>Generated from recorded measurements in <code>${escape(confirmation)}</code>.</p></main></html>\n`,
  )
}

if (isMainModule(import.meta.url)) {
  const [confirmation, output, scopeNote] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/report.mts confirmation output.html [scope-note]',
    )
  } else if (!confirmation) {
    throw new Error('Confirmation directory and HTML output required.')
  } else if (!output) {
    throw new Error('Confirmation directory and HTML output required.')
  } else {
    report(confirmation, output, scopeNote)
  }
}
