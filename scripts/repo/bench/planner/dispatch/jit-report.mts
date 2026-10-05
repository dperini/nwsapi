import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'

interface Metric {
  label: string
  cases: number
  geometricTimePercent: number
  totalTimePercent: number
  worstTimeRatio: number
}
interface Measurement {
  metadata: {
    power: string
    powerAfter: string
    variants: string[]
    labels: string[]
    modelCertificate: { sourceSha256: string; proof: string }
  }
  rows: Array<{ id: string }>
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

function bar(metric: Metric, maximum: number, repeat: boolean) {
  return `<div class="run"><span>${repeat ? 'Repeat' : 'First'}</span><div class="track"><div class="bar ${repeat ? 'repeat' : ''}" style="width:${(100 * metric.geometricTimePercent) / maximum}%"></div></div><strong>${metric.geometricTimePercent.toFixed(1)}%</strong></div>`
}

function panel(host: string, group: string, first: Metric[], repeat: Metric[]) {
  const titles: Record<string, string> = {
    fresh: 'All fresh diagnostic cases',
    unfiltered: 'Fresh cases without attribute filters',
    filtered: 'Fresh cases with attribute filters',
    reproduction: 'Previously examined slow cases',
  }
  const scope: Record<string, string> = {
    fresh:
      '96 fresh cases with nesting depths 2, 7 and 15, two outside-witness fractions, 48 or 144 anchors, ratios 3 or 5, and every filter combination.',
    unfiltered:
      '24 fresh queries without attribute filters. The frozen policy cannot override any of these selectors. Ratio 5 is outside its supported range.',
    filtered:
      '72 fresh queries with anchor, witness or both attribute filters. Ratio 3 is within the frozen input range. Ratio 5 must retain the baseline route.',
    reproduction:
      'Three slow cases already examined in the crossed experiment. These help reproduce a symptom and provide no new independent qualification evidence.',
  }
  const maximum =
    Math.max(
      ...first.map(row => row.geometricTimePercent),
      ...repeat.map(row => row.geometricTimePercent),
    ) * 1.08
  const rows = first
    .map(
      (metric, index) =>
        `<div class="variant"><h3>${escape(metric.label)}</h3>${bar(metric, maximum, false)}${bar(repeat[index]!, maximum, true)}</div>`,
    )
    .join('')
  const changes = [first, repeat].map(
    metrics =>
      100 *
      (1 - metrics[4]!.geometricTimePercent / metrics[3]!.geometricTimePercent),
  )
  const description = changes
    .map(
      (value, index) =>
        `${index ? 'Repeat' : 'First'}: split model takes ${Math.abs(value).toFixed(1)}% ${value >= 0 ? 'less' : 'more'} time than the original model`,
    )
    .join('. ')
  return `<section><h2>${host} · ${titles[group]}</h2><p class="direction">↓ Lower is faster. Current v3 = 100%.</p>${rows}<p>${scope[group]} All bars measure complete warm queries and use the geometric average of relative query time.</p><p>${description}. The weights and route choices are unchanged.</p><p>Worst split-model query: ${(100 * first[4]!.worstTimeRatio).toFixed(1)}% of baseline in the first pass and ${(100 * repeat[4]!.worstTimeRatio).toFixed(1)}% in the repeat. A favorable average can still hide slower cases.</p></section>`
}

function olderConfirmation(firstDirectory: string) {
  const directory = path.join(
    path.dirname(firstDirectory),
    'planner-dispatch-crossed-split-2026-10-05-r1',
  )
  const rows = ['chromium', 'jsdom']
    .map(host => {
      const data = JSON.parse(
        readFileSync(path.join(directory, `${host}.json`), 'utf8'),
      ) as {
        summaries: Record<
          string,
          { model: { geometricSpeedRatio: number; passesGate: boolean } }
        >
      }
      assert.equal(data.summaries['development']!.model.passesGate, false)
      const cells = ['development', 'validation', 'evaluation']
        .map(
          group =>
            `<td>${(100 / data.summaries[group]!.model.geometricSpeedRatio).toFixed(1)}%</td>`,
        )
        .join('')
      return `<tr><td>${host === 'chromium' ? 'Chromium' : 'jsdom'} split model</td>${cells}</tr>`
    })
    .join('')
  return `<section><h2>Older-suite confirmation</h2><p>One complete confirmation pass measured 112 older cases, 48 crossed validation cases and 48 crossed evaluation cases on each host. Lower percentages mean less query time than current v3.</p><table><thead><tr><th>Host</th><th>Older cases</th><th>Validation</th><th>Evaluation</th></tr></thead><tbody>${rows}</tbody></table><p>The older groups fail the existing minimum-gain gate. Both candidates remain experimental. All native result and route checks completed, and 41,112 saved Python/JavaScript policy comparisons had zero mismatches.</p><p>Source: <code>${escape(directory)}</code>. This table records one pass and does not replace the two fresh-case passes above.</p></section>`
}

export function jitReport(
  firstDirectory: string,
  repeatDirectory: string,
  output: string,
) {
  const panels: string[] = []
  const power: string[] = []
  const findings: string[] = []
  for (const host of ['chromium', 'jsdom']) {
    const first = load(firstDirectory, host)
    const repeat = load(repeatDirectory, host)
    assert.deepEqual(
      first.metadata.variants,
      repeat.metadata.variants,
      'Measured code changed',
    )
    assert.deepEqual(
      first.rows.map(row => row.id).toSorted(),
      repeat.rows.map(row => row.id).toSorted(),
      'Measured cases changed',
    )
    assert.deepEqual(
      first.metadata.modelCertificate,
      repeat.metadata.modelCertificate,
      'Policy proof changed',
    )
    const changes = [first, repeat].map(
      data =>
        100 *
        (data.summaries['unfiltered']![4]!.geometricTimePercent /
          data.summaries['unfiltered']![3]!.geometricTimePercent -
          1),
    )
    findings.push(
      `${host}: first ${Math.abs(changes[0]!).toFixed(1)}% ${changes[0]! > 0 ? 'more' : 'less'} time, repeat ${Math.abs(changes[1]!).toFixed(1)}% ${changes[1]! > 0 ? 'more' : 'less'} time.`,
    )
    power.push(
      `${host} first:\n${first.metadata.power}\nAfter:\n${first.metadata.powerAfter}\n${host} repeat:\n${repeat.metadata.power}\nAfter:\n${repeat.metadata.powerAfter}`,
    )
    for (const group of ['fresh', 'unfiltered', 'filtered', 'reproduction']) {
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
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWSAPI dispatch and JIT diagnostics</title><style>
:root{color-scheme:light;background:#f3f6fb;color:#17243c;font:16px/1.6 system-ui}body{max-width:1000px;margin:auto;padding:40px 24px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15}h2{font-size:23px}h3{font-size:16px;margin:18px 0 8px}section,details{background:white;border:1px solid #dbe3ef;border-radius:18px;padding:26px;margin:24px 0;box-shadow:0 8px 24px #24355008}.direction{color:#2255a8;font-weight:650}.run{display:grid;grid-template-columns:65px 1fr 75px;gap:12px;align-items:center;margin:7px 0}.track{height:22px;background:#edf1f7;border-radius:7px;overflow:hidden}.bar{height:100%;background:#a0b5ee;border-radius:7px}.repeat{background:linear-gradient(90deg,#5074ec,#8977eb)}strong{font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#2255a8}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #dbe3ef}@media(max-width:600px){body{padding:24px 14px}section,details{padding:18px}.run{grid-template-columns:48px 1fr 65px;gap:8px;font-size:13px}}
</style><main><p>NWSAPI · Frozen-policy experiment</p><h1>Keep unchanged queries on the original matching function</h1><p>This experiment compares plan metadata, a no-op dispatch branch, the frozen model and split matching functions. Model weights and thresholds stay fixed.</p><p>The generator checks the policy's emitted guards before bypassing dispatch for unfiltered selectors. Instrumented queries check that the split model preserves the original model's route.</p><p><strong>Unfiltered split-model time compared with the original model:</strong> ${escape(findings.join(' '))}</p><p>Read both passes before choosing a variant. A first-pass gain that disappears in the repeat does not establish a reliable optimization.</p><p>These are development measurements. Earlier production qualification failures still apply. The distributed engine keeps its current routing policy.</p><details><summary>How to read the charts and how we measured</summary><p>100% is unchanged v3 time. 90% means 10% less time. 110% means 10% more time. The first pass uses 11 rotating rounds of at least 20ms. The repeat reverses case order and uses at least 24ms. All query preparation, route decisions and matching are inside the timed query. Native result identities and order are checked around timing.</p><p>Metadata only adds the filter-mask property. No-op dispatch also adds the dispatch branch and a helper that always returns false. Frozen model uses the original generated matching function. Split model and split rule use the original matcher for unfiltered selectors and a second matcher for filtered selectors. The plan property remains.</p><p>JIT traces run separately with logging enabled and isolated pages. They cannot establish speed gains or reproduce every feedback pattern from this multi-document run.</p><pre>${escape(power.join('\n\n'))}</pre></details>${panels.join('\n')}${olderConfirmation(firstDirectory)}<section><h2>Open work</h2><ol><li>Investigate stable helper callbacks across multiple documents. Preserve legacy hooks and capability checks.</li><li>Fit intermediate simple-rule thresholds from training data, then use new reserved cases.</li><li>Try exact integer-count intervals to remove model arithmetic. Prove policy equivalence and measure complete queries.</li><li>Consider skipping already-covered witness predicates. Include all-miss and sparse-match cases.</li><li>Measure independent applications, cold calls, alternating selectors and DOM changes before runtime integration.</li></ol><p>These follow-up experiments remain open. The split path has not established a repeatable unfiltered average win.</p></section><p>Recorded inputs: <code>${escape(firstDirectory)}</code> and <code>${escape(repeatDirectory)}</code>.</p></main></html>\n`,
  )
}

if (isMainModule(import.meta.url)) {
  const [first, repeat, output] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: dispatch/jit-report.mts first repeat output.html')
  } else if (!first || !repeat || !output) {
    throw new Error('Two diagnostic directories and an HTML output required.')
  } else {
    jitReport(first, repeat, output)
  }
}
