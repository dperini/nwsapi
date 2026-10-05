import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { geomean } from '../neural/oracle.mts'

interface Timings {
  metadata: { labels: string[]; power: string }
  rows: Array<{ id: string; costs: number[] }>
}
interface Inference {
  medianNs: number
}
interface OracleResult {
  conservativeSpeedRatio: number
  currentInputEmpiricalSpeedRatio: number
}

function read(directory: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(directory, file), 'utf8'))
}

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function chart(
  title: string,
  rows: Array<{ label: string; value: number }>,
  unit: string,
  context: string,
) {
  const max = Math.max(...rows.map(row => row.value)) * 1.08
  return `<section class="panel"><h2>${escape(title)}</h2><p class="direction">↓ Lower is faster${unit === '%' ? ' · 100% = current v3 query time' : ''}</p>
    <div class="chart">${rows.map((row, i) => `<div class="row"><span>${escape(row.label)}</span><div class="track"><div class="bar ${i === 0 ? 'base' : ''}" style="width:${(row.value / max) * 100}%"></div></div><strong>${row.value.toFixed(1)}${unit}</strong></div>`).join('')}</div><p class="context">${escape(context)}</p></section>`
}

function measuredChart(data: Timings, host: string) {
  const names = ['Current v3', 'Simple prefix rule', 'Trained neural policy']
  const rows = names.map((label, index) => ({
    label,
    value:
      100 * geomean(data.rows.map(row => row.costs[index]! / row.costs[0]!)),
  }))
  return chart(
    `${host} integrated queries`,
    rows,
    '%',
    `${data.rows.length} known development cases, exact ordered results checked before and after timing. Prefix work, feature accounting, emitted neural inference, and completion are all inside the timed query. These are development measurements, not independent application validation.`,
  )
}

export function reportAdaptive(
  collection: string,
  scalar: string,
  oracle: string,
  model: string,
  confirmation: string,
  output: string,
) {
  const oracleData = read(oracle, 'oracle.json') as {
    results: Record<string, OracleResult>
  }
  const overhead = read(scalar, 'overhead.json') as {
    node: Record<string, Inference>
    browser: { results: Record<string, Inference> }
  }
  const evaluation = read(model, 'evaluation.json') as {
    selected: { hidden: number; epoch: number }
    trainingRows: number
    validationRows: number
    developmentRows: number
  }
  const parity = read(model, 'parity.json') as {
    cases: number
    decisionDisagreements: number
  }
  const cards: string[] = []
  const summary: Record<string, unknown> = {}
  for (const host of ['chromium', 'jsdom']) {
    const data = read(collection, `${host}-training.json`) as Timings
    const confirmed = read(confirmation, `${host}.json`) as Timings & {
      summary: unknown
    }
    const prefixCeiling = geomean(
      data.rows.map(
        row => row.costs[0]! / Math.min(row.costs[3]!, row.costs[4]!),
      ),
    )
    summary[host] = {
      prefixCeilingSpeedRatio: prefixCeiling,
      integrated: confirmed.summary,
    }
    cards.push(
      measuredChart(confirmed, host === 'chromium' ? 'Chromium' : 'jsdom'),
    )
    cards.push(
      chart(
        `${host} planning limits`,
        [
          { label: 'Current v3', value: 100 },
          {
            label: 'Free perfect route choice',
            value: 100 / oracleData.results[host]!.conservativeSpeedRatio,
          },
          {
            label: 'Free perfect choice after prefix',
            value: 100 / prefixCeiling,
          },
        ],
        '%',
        'These are optimistic hindsight diagnostics from two different experiments. The route choice retains the global witness preflight and counts equivalent routes as baseline. The prefix choice must first perform four useful anchor checks. Neither oracle is a deployable model, and timings of medians can favor the oracle through noise.',
      ),
    )
  }
  const inference = [
    ['Node', overhead.node],
    ['Chromium', overhead.browser.results],
  ] as const
  const overheadCards = inference
    .map(([host, results]) =>
      chart(
        `${host} decision overhead`,
        [
          { label: 'Existing guard', value: results['baseline']!.medianNs },
          {
            label: 'Generic old network',
            value: results['reference']!.medianNs,
          },
          { label: 'Scalar same network', value: results['scalar']!.medianNs },
          {
            label: 'Folded scalar same network',
            value: results['folded']!.medianNs,
          },
        ],
        'ns',
        'Standalone dispatch on 256 rotating inputs, including domain fallbacks. Uses the same old tanh weights to isolate code-generation overhead. This is a separate model from the retrained ReLU continuation policy and does not include DOM work.',
      ),
    )
    .join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWSAPI neural planner implementation results</title><style>
  :root{color-scheme:dark;font:16px/1.65 system-ui,sans-serif;background:#0b1220;color:#e5edf9}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0,#163750,transparent 60%),#0b1220}main{max-width:1120px;padding:48px 24px 90px;margin:auto}h1{font-size:clamp(34px,5vw,60px);line-height:1.08;letter-spacing:-.04em;max-width:900px}h2{font-size:23px;margin-top:0}a{color:#97e1bf}.kicker{color:#97e1bf;letter-spacing:.14em;text-transform:uppercase;font-size:12px}.lede{font-size:20px;max-width:850px;color:#bdcddd}.notice{padding:22px;border:1px solid #b38d47;background:#322918;border-radius:14px;margin:25px 0}.panel,details{padding:24px;border:1px solid #2b4159;background:#111f30;border-radius:16px;margin:20px 0}.direction{color:#b5c9dd;font-size:13px}.row{display:grid;grid-template-columns:235px minmax(80px,1fr) 85px;gap:14px;align-items:center;margin:15px 0;font-size:14px}.track{height:25px;background:#23374e;border-radius:5px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#71b7a0,#ade5bb)}.bar.base{background:linear-gradient(90deg,#6686b1,#9fb9db)}strong{font-variant-numeric:tabular-nums}.row strong{text-align:right}.context{font-size:13px;color:#a6bad0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.stat{padding:20px;background:#172a3c;border-radius:12px}.stat b{font-size:30px;display:block;color:#a4e6c4}code{font-size:13px;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:650}li{margin:8px 0}footer{color:#a6bad0;font-size:13px;border-top:1px solid #2b4159;padding-top:22px;margin-top:36px}@media(max-width:700px){main{padding:28px 15px}.row{grid-template-columns:135px minmax(50px,1fr) 65px;font-size:12px;gap:8px}.panel{padding:17px}.grid{grid-template-columns:1fr}}
  </style></head><body><main><p class="kicker">NWSAPI · October 5, 2026 · AC measurements</p><h1>Cheaper neural decisions.<br>Measured query costs.</h1><p class="lede">The benchmark routes are repaired. The neural exporter is faster. A new PyTorch model learns whether to continue or switch after four anchor checks. The charts below measure the complete cost of that decision.</p>
  <div class="notice"><strong>The adaptive prefix strategy fails its performance gate and stays offline.</strong> Even perfect free choices after the prefix lose to production on this development suite. Training cannot recover work already spent on that prefix. The production selector engine has not been changed.</div>
  <div class="grid"><div class="stat"><b>${evaluation.selected.hidden} hidden units</b>ReLU checkpoint selected at epoch ${evaluation.selected.epoch}</div><div class="stat"><b>${parity.cases.toLocaleString()} parity cases</b>${parity.decisionDisagreements} Python/JavaScript decision mismatches</div></div>
  <details><summary>Measurement scope, training, and acceptance</summary><p>The old October 4 neural comparison is superseded: its forward label could run inverse, its reconstructed baseline differed from production, and its Python and JavaScript fallbacks disagreed. The repaired collector proves actual route execution in both hosts and preserves unmodified baseline measurements.</p><p>The corrected route and adaptive collections each use 112 known cases per host, with 11 rotating rounds of at least 20ms. The fixtures include synthetic DOM arrangements and repository pages. The component and atomic CSS pages are generated examples. AC was checked at host boundaries. These are warm all-results queries, with no claim of application-wide generalization or cold-start improvement.</p><p>The neural policy uses ${evaluation.trainingRows} fitting rows, ${evaluation.validationRows} validation rows, and ${evaluation.developmentRows} separate development rows. Family splits are shared across hosts. Three hidden sizes and three seeds were considered. Relative-cost weights teach preference, validation time selects the checkpoint, and a score threshold chooses when to change the simple rule. The training estimate budgets 25ns for inference; the integrated charts below measure the actual emitted code instead.</p><p>Promotion requires at least 1.05x geometric speed ratio in each host and no case above 1.15x baseline time, followed by independent confirmation and compatibility checks. The prefix pilot fails before promotion. Broader application collection, runtime plan caching, and release qualification are deferred by that result.</p></details>
  ${cards.join('')}${overheadCards}
  <section class="panel"><h2>What is implemented</h2><ul><li>Complete route forcing with AST edits, actual-route evidence, ordered identity checks, and a versioned dataset that keeps the measured baseline.</li><li>Scalar neural export, folded constants, host specialization, and cross-language parity.</li><li>Exact prefix reuse, exact forward or inverse completion, and mutation/ordering coverage in the experimental implementation.</li><li>Cost-sensitive PyTorch training, grouped validation, saved weights and checkpoint, real JavaScript model integration, and reproducible measurements.</li></ul><p>The useful result is a working measurement and training pipeline plus a measured rejection of an expensive strategy. The next research question is how to select profiling only where it can pay, before doing the prefix. That requires a new experiment and fresh evaluation groups.</p></section>
  <p><a href="/tiny-model-training.html">Training guide</a> · <a href="https://github.com/dperini/nwsapi/blob/prerelease/3.0.0/docs/repo/perf/neural-planner-implementation.md">Detailed implementation specification</a></p>
  <footer>Inputs: <code>${escape(collection)}</code> · <code>${escape(model)}</code> · <code>${escape(confirmation)}</code>. Earlier raw measurements are preserved. All model work is development tooling. The installed library has no PyTorch, Python, or neural inference dependency.</footer></main></body></html>`
  writeFileSync(output, html)
  writeFileSync(
    path.join(confirmation, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  return output
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(
      'Usage: adaptive/report.mts collection scalar oracle model confirmation output.html',
    )
  } else if (args.length !== 6) {
    throw new Error('Expected six explicit input/output paths.')
  } else {
    console.log(
      reportAdaptive(
        ...(args as [string, string, string, string, string, string]),
      ),
    )
  }
}
