import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { escapeText } from '../charts.mts'
import type { Row } from './measure.mts'
import type { Tree } from './model.mts'
import { bar, geomean, timeChange } from './display.mts'
import { decisionView } from './decision.mts'

interface Artifact {
  metadata: {
    host: string
    scenario?: string
    settings?: { rounds: number }
    version: string
    cpu: string
    power: string
    powerAfter?: string
    candidateSha256: string
  }
  rows: Row[]
  model?: Tree
  expression?: string
}
const [input, output, phase = 'evaluation'] = process.argv.slice(2)
const confirming = phase.startsWith('confirmation')
const alternate = confirming ? 'Guarded runtime' : 'Trained tree'
const stage = confirming ? 'confirmation' : 'held-out'
if (!input || !output) {
  throw new Error(
    'Usage: planner/report.mts measurements-directory output.html [evaluation|confirmation|confirmation-repeat]',
  )
}
const load = (host: string, kind: string) =>
  JSON.parse(
    readFileSync(path.join(input, `${host}-${kind}.json`), 'utf8'),
  ) as Artifact
const results = ['chromium', 'jsdom'].map(host => {
  const training = load(host, 'training')
  const evaluation = load(host, phase)
  const speedup = geomean(
    evaluation.rows.map(row => row.costs[0]! / row.costs[1]!),
  )
  const worst = Math.max(
    ...evaluation.rows.map(row => row.costs[1]! / row.costs[0]!),
  )
  return {
    host,
    training,
    evaluation,
    speedup,
    worst,
    passes: speedup >= 1.05 && worst <= 1.15,
  }
})
const promote = results.every(result => result.passes)
const summary = {
  decision: promote
    ? confirming
      ? 'retain guarded runtime implementation'
      : 'eligible for further validation'
    : 'retain existing runtime rule',
  gate: { minimumGeomeanSpeedup: 1.05, maximumCaseSlowdown: 1.15 },
  hosts: results.map(({ host, speedup, worst, passes }) => ({
    host,
    speedup,
    worst,
    passes,
  })),
}
writeFileSync(
  path.join(
    input,
    phase === 'evaluation' ? 'summary.json' : phase + '-summary.json',
  ),
  JSON.stringify(summary, null, 2) + '\n',
)
const shared = JSON.parse(
  readFileSync(path.join(input, 'shared-model.json'), 'utf8'),
) as { expression: string }
const isHas = results[0]!.evaluation.metadata.scenario === 'has'
const subject = isHas ? ':has()' : 'type-union'
const script = isHas ? 'planner/has/run.mts' : 'planner/run.mts'
const trainingCount = results[0]!.training.rows.filter(
  row => row.split === 'train',
).length
const evaluationCount = results[0]!.evaluation.rows.length
const shownExpression = confirming
  ? 'anchors < 32: forward\nwitnesses === 0: empty result\nwitnesses <= anchors * 2: inverse\nplain classes && anchors <= 192 && witnesses <= anchors * 4: inverse\notherwise: forward'
  : shared.expression
const choices = isHas && confirming ? decisionView(input, results, promote) : ''
const chartMaximum = Math.max(
  125,
  ...results.flatMap(({ evaluation }) => {
    const families = [...new Set(evaluation.rows.map(row => row.family))]
    return families.map(
      family =>
        100 *
        geomean(
          evaluation.rows
            .filter(row => row.family === family)
            .map(row => row.costs[1]! / row.costs[0]!),
        ),
    )
  }),
)
const cards = results
  .map(result => {
    const { host, evaluation, speedup, worst } = result
    const families = [...new Set(evaluation.rows.map(row => row.family))]
    const groups = families
      .map(family => {
        const rows = evaluation.rows.filter(row => row.family === family)
        const cost =
          geomean(rows.map(row => row.costs[1]! / row.costs[0]!)) * 100
        const scale = chartMaximum
        return `<div class="group"><h3>${escapeText(family)}</h3>${bar('Original rule', 100, scale, 'rule')}${bar(alternate, cost, scale, 'model')}<p class="context">${rows.length} ${escapeText(family)} cases. Geometric mean time relative to the original rule = 100 units. Lower is better.</p></div>`
      })
      .join('')
    const rows = evaluation.rows
      .map(
        row =>
          `<tr><td>${escapeText(row.id)}</td><td>${(row.costs[0]! / 1000).toFixed(2)}µs</td><td>${(row.costs[1]! / 1000).toFixed(2)}µs</td><td>${timeChange(row.costs[1]! / row.costs[0]!)}</td></tr>`,
      )
      .join('')
    return `<section><div class="eyebrow"><code>${host}</code> ${escapeText(evaluation.metadata.version)}</div><h2>${timeChange(1 / speedup)}</h2><p>Worst individual case: ${timeChange(worst)}. Promotion gate: <strong>${result.passes ? 'passed' : 'missed'}</strong>.</p><div class="charts">${groups}</div><p class="context">${evaluation.rows.length} synthetic ${stage} cases across ${families.length} families, including any small-query controls. Each bar shows geometric mean query time relative to the original rule at 100 units. All family charts share one scale and start at zero. Shorter is faster. Orange bars indicate more time. Timing includes ${confirming ? 'dispatch guards' : 'model guards and inference'}, and ${isHas ? 'witness fetching' : 'periodic collection probes'}.</p><details><summary>${alternate} decision</summary><pre>${escapeText(shownExpression)}</pre><p>The benchmark wrapper uses the existing rule outside the training envelope.</p></details><details><summary>All ${stage} measurements</summary><div class="scroll"><table><thead><tr><th>Case</th><th>Rule</th><th>${alternate}</th><th>Time change</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>`
  })
  .join('')
const previousPass = confirming
  ? results
      .map(({ host }) => {
        const rows = load(host, 'confirmation').rows
        const speedup = geomean(rows.map(row => row.costs[0]! / row.costs[1]!))
        const worst = Math.max(
          ...rows.map(row => row.costs[1]! / row.costs[0]!),
        )
        return `${host}: ${timeChange(1 / speedup)}, worst ${timeChange(worst)}`
      })
      .join('; ')
  : ''
const firstPassMissed =
  confirming &&
  results.some(({ host }) =>
    load(host, 'confirmation').rows.some(
      row => row.costs[1]! / row.costs[0]! > 1.15,
    ),
  )
const onAC = results.every(
  ({ evaluation }) =>
    evaluation.metadata.power.includes("Now drawing from 'AC Power'") &&
    evaluation.metadata.powerAfter?.includes("Now drawing from 'AC Power'"),
)
const metadata = results[0]!.evaluation.metadata
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWSAPI · Small trained planner</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0a101c;color:#e8efff}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:60px 24px}a{color:#8be4d2}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#97abc9;font-size:12px}h1{font-size:clamp(38px,6vw,68px);letter-spacing:-.05em;margin:18px 0}h2{font-size:30px;letter-spacing:-.03em}h3{font-size:16px;text-transform:none}.lede{max-width:780px;font-size:20px;line-height:1.6;color:#b5c4dc}.decision{border-left:4px solid #9ef28b;background:#142329;padding:20px 24px;margin:32px 0;font-size:20px}section{border:1px solid #26354b;border-radius:22px;background:linear-gradient(145deg,#142034,#0d1523);padding:30px;margin:26px 0}.charts{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.group{min-width:0}.label{display:flex;justify-content:space-between;font-size:12px;margin:15px 0 7px}.track{height:22px;background:#080f1c;border-left:1px solid #6a7b91}.bar{height:100%;border-radius:0 5px 5px 0}.rule{background:linear-gradient(90deg,#bd98ff,#eb80b2)}.shortcut{background:linear-gradient(90deg,#86bfff,#699cff)}.slower{background:linear-gradient(90deg,#ffb36c,#f48e78)}.model{background:linear-gradient(90deg,#c6fa74,#48d4be)}.bar-note{font-size:12px;color:#c4d5e9;margin:5px 0 18px}.axis{font-size:12px;color:#c4d5e9}.choice-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px;margin-top:32px}.choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:28px 0}.choices article{padding:20px;border:1px solid #34455f;border-radius:14px}.choices p{font-size:14px}.recommended{background:#163032;border-color:#71d2ad!important}.option{font-size:12px;color:#b7efd5;font-weight:700}.risk{padding:16px;background:#101a2a;border-radius:12px;font-size:14px}p{line-height:1.7}.context{font-size:14px;color:#a8bbd5}details{margin:18px 0;border-top:1px solid #2a3b53;padding-top:18px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#080f1c;padding:20px;border-radius:12px;line-height:1.7}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;margin-top:20px}td,th{padding:10px;text-align:left;border-bottom:1px solid #28384c}footer{color:#8eabc5;font-size:12px;overflow-wrap:anywhere}@media(max-width:750px){.charts,.choices,.choice-charts{grid-template-columns:1fr}main{padding:30px 16px}section{padding:22px}}
</style><main><a href="/">← Performance audit</a><div class="eyebrow" style="margin-top:36px">NWSAPI / compiler research / October 3, 2026</div><h1>Less query time.<br>Shorter bars. Better.</h1><p class="lede">${confirming ? 'A guarded rule distilled from training chooses exact :has() routes. Empty witness collections exit before map allocation or anchor filtering.' : `An offline-trained decision tree chooses between two exact ${subject} execution paths. The model predicts cost. The selector engine still determines every match.`}</p><p class="eyebrow">${onAC ? 'AC-powered measurements · power checked before and after each host' : 'Recorded power state appears below'}</p><div class="decision"><strong>↓ Lower is better on every chart.</strong><br>100 = original query time. 80 = 20% less time. 110 = 10% more time.</div>${confirming ? '' : `<p>Evaluation recommendation: ${escapeText(summary.decision)}.</p>`}<details open><summary>Methodology and promotion gate</summary><p>${trainingCount} training cases and ${evaluationCount} ${stage} cases per host. Family assignments precede measurement.${onAC ? ' Training inputs are frozen from the earlier battery collection. Only the measured comparisons were rerun on AC power.' : ''} At most three tree levels, cost-sensitive splitting, no runtime training or model download. ${results[0]!.evaluation.metadata.settings?.rounds || 7} rounds rotate variant order. Native timings are round means; <code>jsdom</code> timings are Mitata round medians. ${confirming ? 'Confirmation measures the actual built runtime against the saved baseline. The repeat pass reverses fixture order and extends the timing budget.' : 'Model evaluation is a separate run using the generated branches.'}</p><p>The promotion threshold is at least 4.8% less geometric mean query time in each host, with no individual evaluated case taking over 15% more time. Synthetic warm all-results queries support only this experiment. Cold start, mutation, callback, XML, first-result, and real-application validation need separate evidence beyond this warm-query report.</p><p>Ordered element identity is checked before and after timing. ${confirming ? 'The runtime uses the guarded rule and empty-witness preflight. Full compatibility suites were not rerun in this experiment.' : 'The source runtime is unchanged in this experimental comparison.'} No GPU or competitor speedup is claimed.</p>${confirming ? `<p>First confirmation pass: ${escapeText(previousPass)}. ${firstPassMissed ? 'The first pass included at least one case exceeding the 15% slowdown limit.' : 'Every first-pass case stayed within the 15% slowdown limit.'} The longer repeat retains all cases and uses reversed fixture order. Both passes remain recorded. These synthetic measurements do not establish application-wide gains.</p>` : ''}</details>${choices}<div class="eyebrow">${evaluationCount}-case ${stage} breakdown${confirming ? ' · includes training families' : ''}</div>${cards}<footer>${escapeText(metadata.cpu)} · baseline SHA256 ${escapeText(metadata.candidateSha256)}<p>${escapeText(metadata.power)}</p><p>Reproduce with scripts/repo/bench/${script} and planner/report.mts. Recorded inputs: ${escapeText(path.basename(path.resolve(input)))}/.</p></footer></main></html>`
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(JSON.stringify(summary, null, 2))
