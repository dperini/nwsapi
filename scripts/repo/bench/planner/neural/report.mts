import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type HostResult = {
  cases: number
  routeAccuracyInModelDomain: number
  speedupVsProductionRule: number
  speedupProductionVsAlwaysForward: number
  speedupProductionVsAlwaysInverse: number
  oracleRegret: number
  worstSlowdownVsProductionRule: number
  modelApplications: number
  fallbackApplications: number
  speedupVsProductionRuleTiming95CI: [number, number]
  simpleRatioRule: { speedupVsProductionRule: number }
  tunedRatioRule: { speedupVsProductionRule: number }
  tunedRatioRuleThreshold: number
  routeCostSummary: {
    selectedRouteCostsNs: number[]
    productionRouteCostsNs: number[]
    modelApplied: boolean[]
  }
}

const directory =
  process.argv[2] || 'assets/repo/bench/planner-neural-2026-10-04'
const evaluation = JSON.parse(
  readFileSync(path.join(directory, 'evaluation.json'), 'utf8'),
) as {
  model: string
  trainingFramework: string
  device: string
  selectedEpochs: number
  trainingRows: number
  validationFamilies: string[]
  validationRows: number
  heldOutFamilies: string[]
  heldOutRows: number
  trainingDomain: { anchors: number[]; witnesses: number[]; ratio: number[] }
  reachedEpochLimit: boolean
  selectedRatioThreshold: number
  inputs: {
    candidateSha256: string
    fixtureSha256: string
    powerByHost: Record<string, string>
  }
  results: Record<string, HostResult>
}
const inference = JSON.parse(
  readFileSync(path.join(directory, 'inference.json'), 'utf8'),
) as {
  runtime: string
  platform: string
  modelBytes: number
  callsPerRound: number
  rounds: number
  results: Record<
    string,
    {
      model: { medianNsPerCall: number }
      rule: { medianNsPerCall: number }
    }
  >
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function powerSummary(value: string | undefined) {
  const source = value || ''
  const supply =
    source.match(/Now drawing from '([^']+)'/)?.[1] || 'Power unknown'
  const state = source.match(/\t(\d+%); ([^;]+)/)
  return `${supply}${state ? ` · battery ${state[1]} ${state[2]}` : ''}`
}

function percent(value: number) {
  return `${((1 / value) * 100).toFixed(2)}%`
}

function geometricMean(values: number[]) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  )
}

const inferenceOverheadNs = Math.max(
  0,
  inference.results['in-domain']!.model.medianNsPerCall -
    inference.results['in-domain']!.rule.medianNsPerCall,
)

function adjustedSpeedup(result: HostResult) {
  return geometricMean(
    result.routeCostSummary.selectedRouteCostsNs.map(
      (cost, index) =>
        result.routeCostSummary.productionRouteCostsNs[index]! /
        (cost +
          (result.routeCostSummary.modelApplied[index]
            ? inferenceOverheadNs
            : 0)),
    ),
  )
}

function timeChange(speedup: number) {
  return speedup >= 1
    ? `${((1 - 1 / speedup) * 100).toFixed(2)}% less query time`
    : `${((1 / speedup - 1) * 100).toFixed(2)}% more query time`
}

function hostCard(host: string, label: string, result: HostResult) {
  const neuralCost = 1 / result.speedupVsProductionRule
  const simpleCost = 1 / result.simpleRatioRule.speedupVsProductionRule
  const adjustedCost = 1 / adjustedSpeedup(result)
  const upper = 1.1
  const width = (value: number) => Math.min(100, (value / upper) * 100)
  return `<section class="host"><div class="kicker">${label}</div><h2>${host}</h2>
<div class="chart" role="img" aria-label="Relative query time against the existing guarded planner; 100 is tied and lower is faster.">
<div class="axis"><span>0</span><span>55</span><span>110 · slower</span></div>
<div class="row"><span>Existing guarded planner</span><div class="track"><div class="bar baseline" style="width:${width(1)}%"></div></div><strong>100.00</strong></div>
<div class="row"><span>PyTorch model route only</span><div class="track"><div class="bar neural" style="width:${width(neuralCost)}%"></div></div><strong>${(neuralCost * 100).toFixed(2)}</strong></div>
<div class="row"><span>Simple ratio rule (÷2)</span><div class="track"><div class="bar simple" style="width:${width(simpleCost)}%"></div></div><strong>${(simpleCost * 100).toFixed(2)}</strong></div>
<div class="row"><span>Tuned ratio rule (÷${result.tunedRatioRuleThreshold})</span><div class="track"><div class="bar simple" style="width:${width(1 / result.tunedRatioRule.speedupVsProductionRule)}%"></div></div><strong>${((1 / result.tunedRatioRule.speedupVsProductionRule) * 100).toFixed(2)}</strong></div>
<div class="row"><span>Neural + Node inference estimate</span><div class="track"><div class="bar adjusted" style="width:${width(adjustedCost)}%"></div></div><strong>${(adjustedCost * 100).toFixed(2)}</strong></div>
</div>
<p class="context">Lower query time is better. Values are relative to the existing guarded rule (100 = tied). The neural route decision excludes JavaScript inference. Its 95% timing-only bootstrap interval is ${(result.speedupVsProductionRuleTiming95CI[0] * 100).toFixed(1)}–${(result.speedupVsProductionRuleTiming95CI[1] * 100).toFixed(1)}% of the current rule; uncertainty across workloads is not included.</p>
<div class="stats"><div><b>${result.modelApplications}</b><span>model decisions</span></div><div><b>${result.fallbackApplications}</b><span>fallback cases</span></div><div><b>${percent(result.speedupProductionVsAlwaysForward)}</b><span>always-forward time vs guarded</span></div></div>
</section>`
}

const chromium = evaluation.results['chromium']!
const jsdom = evaluation.results['jsdom']!
const inferenceRows = Object.entries(inference.results)
  .map(
    ([name, row]) =>
      `<tr><td>${name}</td><td>${row.rule.medianNsPerCall.toFixed(1)}ns</td><td>${row.model.medianNsPerCall.toFixed(1)}ns</td><td>${(row.model.medianNsPerCall / row.rule.medianNsPerCall).toFixed(1)}×</td></tr>`,
  )
  .join('')
const output = path.join(
  'assets/repo/bench/survey-2026-10-03',
  'neural-planner.html',
)
writeFileSync(
  output,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NWSAPI · Neural route planner experiment</title><style>
:root{color-scheme:dark;font:16px/1.65 Inter,ui-sans-serif,system-ui,sans-serif;background:#09111b;color:#e5edf7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse 900px 450px at 70% 0,#1b3d55,transparent 75%),#09111b}main{max-width:1040px;margin:auto;padding:54px 24px 90px}a{color:#9fe5b5}.kicker{text-transform:uppercase;letter-spacing:.15em;color:#8fdfad;font-size:11px;font-weight:750}.hero{max-width:850px}.hero h1{font-size:clamp(36px,6vw,64px);line-height:1.02;letter-spacing:-.045em;margin:16px 0}.lede{font-size:19px;color:#bac9d8}.callout{margin:28px 0;padding:20px 24px;border:1px solid #685c38;background:#242116;border-radius:14px;color:#e6d8a7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.host,.panel{margin:20px 0;padding:23px;border:1px solid #2a3d50;border-radius:15px;background:#101d2a}.host h2{margin:2px 0 22px}.axis,.row{display:grid;grid-template-columns:190px 1fr 64px;gap:12px;align-items:center}.axis{grid-template-columns:190px 1fr 64px;color:#8b9caf;font-size:11px}.axis span:nth-child(2){text-align:center}.axis span:last-child{text-align:right}.row{margin:13px 0;font-size:13px}.track{height:23px;background:#26364a;border-radius:4px;overflow:hidden}.bar{height:100%;border-radius:4px}.baseline{background:linear-gradient(90deg,#6f90b5,#a3bdda)}.neural{background:linear-gradient(90deg,#61c58c,#a0e3a7)}.simple{background:linear-gradient(90deg,#b482d7,#d6a8e9)}.adjusted{background:linear-gradient(90deg,#cf795e,#f2ae71)}.row strong{text-align:right;font-variant-numeric:tabular-nums}.context{color:#9eafbf;font-size:13px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}.stats div{padding:11px;background:#172638;border-radius:9px}.stats b,.stats span{display:block}.stats b{color:#d8f0df}.stats span{font-size:11px;color:#9eafbf}.panel h2{margin-top:0}.panel p,.panel li{color:#b0bfce}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;border-bottom:1px solid #2b3b4c;padding:10px}footer{margin-top:38px;border-top:1px solid #293a4b;padding-top:18px;color:#8496a8;font-size:12px}@media(max-width:750px){main{padding:34px 17px}.grid{grid-template-columns:1fr}.axis,.row{grid-template-columns:140px 1fr 58px;gap:8px}.stats{grid-template-columns:1fr}}
</style><main><div role="alert" style="padding:24px;margin:24px;border:2px solid #eeaa55;background:#302315;color:#fff"><strong>October 5 correction: the October 4 neural comparison is superseded.</strong> The forward benchmark could execute the inverse route. The reconstructed baseline and exported fallback also differed from production. Its exact performance percentages cannot establish a win or regression. Raw artifacts are preserved while corrected measurements are collected.</div><div class="hero"><div class="kicker">NWSAPI · Offline PyTorch experiment</div><h1>A neural planner learned the route.<br>It did not make queries faster.</h1><p class="lede">We trained a small network to estimate forward and inverse <code>:has()</code> route costs from cheap query facts. It is a real trained model, exported to JavaScript, and kept out of the production runtime while we measure whether it earns its cost.</p></div>
<div class="callout"><strong>No demonstrated net performance win. Do not ship this model or the wider ratio rule.</strong> On held-out synthetic and repository-page workloads, route-only performance shows ${timeChange(chromium.speedupVsProductionRule)} in Chromium and ${timeChange(jsdom.speedupVsProductionRule)} in jsdom. After adding the Node-measured inference overhead, the estimated result is ${timeChange(adjustedSpeedup(chromium))} in Chromium and ${timeChange(adjustedSpeedup(jsdom))} in jsdom. This is an estimate, not an end-to-end runtime measurement. The model’s decision function takes ${inference.results['in-domain']!.model.medianNsPerCall.toFixed(1)}ns on this Node runtime for an in-domain input, versus ${inference.results['in-domain']!.rule.medianNsPerCall.toFixed(1)}ns for the simple current guard.</div>
<div class="grid">${hostCard('Chromium', `${chromium.cases} held-out cases`, chromium)}${hostCard('jsdom', `${jsdom.cases} held-out cases`, jsdom)}</div>
<section class="panel"><h2>The network itself adds work</h2><p>Median JavaScript decision time after warmup on ${inference.runtime} (${inference.platform}), ${inference.modelBytes} bytes of model code, ${inference.callsPerRound.toLocaleString()} calls per round across ${inference.rounds} rounds. These timings cover only the route decision. They do not include DOM counting, traversal, or model download.</p><div class="table"><table><thead><tr><th>Input case</th><th>Existing rule</th><th>Neural decision</th><th>Added decision cost</th></tr></thead><tbody>${inferenceRows}</tbody></table></div><p>The neural decision adds ${inferenceOverheadNs.toFixed(1)}ns over the existing guard in this Node microbenchmark. The adjusted bar adds that measured difference to each model-handled held-out query; it is an estimate because we did not execute the network inside the browser timing loop. WebGPU would add dispatch and result-transfer work too. Batched planning needs a separate API and a separate benchmark before it would make sense.</p></section>
<section class="panel"><h2>How we trained and checked it</h2><ul><li>${evaluation.trainingFramework}, ${evaluation.device} training; ${evaluation.model}; six numeric inputs and two predicted log costs. Model size, seed and training duration were selected by grouped validation over ${evaluation.validationFamilies.join(' and ')}. The one-number ratio baseline selected a ${evaluation.selectedRatioThreshold} cutoff.</li><li>${evaluation.trainingRows} training rows; ${evaluation.validationRows} rows contributed to grouped validation. The final fit used ${evaluation.selectedEpochs} epochs${evaluation.reachedEpochLimit ? ' (the current epoch cap was reached)' : ''}. The final untouched holdout has ${evaluation.heldOutRows} rows in ${evaluation.heldOutFamilies.join(', ')} DOM families.</li><li>Both routes were measured for each fixture. The model chooses a route; nwsapi still performs exact matching. Outside the recorded feature range, the generated JavaScript artifact uses the old rule.</li><li>Raw timings came from <code>${evaluation.inputs.candidateSha256.slice(0, 12)}</code> and fixture set <code>${evaluation.inputs.fixtureSha256.slice(0, 12)}</code>. Power snapshots: Chromium: ${escapeHtml(powerSummary(evaluation.inputs.powerByHost['chromium']))}; jsdom: ${escapeHtml(powerSummary(evaluation.inputs.powerByHost['jsdom']))}.</li></ul><p>The dataset combines controlled synthetic families with checked-in documentation, component-tree, and atomic-CSS page fixtures. These are representative project workloads, not user application traces. Mutation workloads, one-result queries, startup cost, and downstream application impact remain unmeasured. No production route logic was changed for this experiment. The ratio cutoff improved this holdout by less than the preset promotion threshold and is kept offline.</p></section>
<footer>Artifacts: dataset.json · evaluation.json · inference.json · model.mjs. Reproduce with <code>pnpm run bench:planner:neural</code>. The Python environment is pinned for development only.</footer></main></html>`,
)
console.log(output)
