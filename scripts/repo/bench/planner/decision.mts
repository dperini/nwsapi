import { readFileSync } from 'node:fs'
import path from 'node:path'
import { escapeText } from '../charts.mts'
import type { Row } from './measure.mts'
import { bar, geomean, timeChange } from './display.mts'

interface Comparison {
  host: string
  evaluation: { rows: Row[] }
}

function compareRows(original: Row[], candidate: Row[]) {
  const heldout = candidate.filter(row => row.split === 'holdout')
  const baseline = new Map(original.map(row => [row.id, row]))
  if (!heldout.length || baseline.size !== heldout.length) {
    throw new Error('Decision chart requires matching held-out cases')
  }
  for (const row of heldout) {
    const reference = baseline.get(row.id)
    if (
      reference?.split !== 'holdout' ||
      reference.fixtureSha256 !== row.fixtureSha256
    ) {
      throw new Error('Decision chart fixture mismatch: ' + row.id)
    }
  }
  return heldout
}

function summarize(rows: Row[]) {
  const ratios = rows.map(row => row.costs[1]! / row.costs[0]!)
  return {
    cost: geomean(ratios) * 100,
    worst: Math.max(...ratios),
  }
}

export function decisionView(input: string, results: Comparison[]) {
  const comparisons = results.map(({ host, evaluation }) => {
    const preflight = JSON.parse(
      readFileSync(path.join(input, `${host}-preflight.json`), 'utf8'),
    ) as { rows: Row[] }
    const heldout = compareRows(preflight.rows, evaluation.rows)
    return {
      host,
      count: heldout.length,
      shortcut: summarize(preflight.rows),
      both: summarize(heldout),
    }
  })
  const maximum = Math.max(
    125,
    ...comparisons.flatMap(({ shortcut, both }) => [shortcut.cost, both.cost]),
  )
  const charts = comparisons
    .map(
      ({ host, count, shortcut, both }) =>
        `<div class="group"><h3>${host === 'chromium' ? 'Chrome / Chromium' : '<code>jsdom</code> / Node.js'}</h3><div class="axis">← Less time is better · same scale in both charts</div>${bar('A · Original rule', 100, maximum, 'rule')}${bar('B · Empty shortcut only', shortcut.cost, maximum, 'shortcut')}${bar('C · Both changes · enabled', both.cost, maximum, 'model')}<p class="context">${count} matching held-out synthetic cases. Each option is normalized to its own run’s original-rule time = 100 units. B and C were measured in separate runs, so their difference is indicative, not a direct race.</p><p class="risk"><strong>Worst individual case:</strong><br>B: ${timeChange(shortcut.worst)}<br>C: ${timeChange(both.worst)}</p></div>`,
    )
    .join('')
  const table = comparisons
    .map(
      ({ host, shortcut, both }) =>
        `<tr><th><code>${escapeText(host)}</code></th><td>Reference</td><td>${timeChange(shortcut.cost / 100)}</td><td>${timeChange(both.cost / 100)}</td></tr>`,
    )
    .join('')
  return `<section id="choose"><div class="eyebrow">Your three choices</div><h2>How much query time do we save?</h2><p>Read these as a fixed amount of work: if the original rule takes <strong>100 units of time</strong>, a bar at <strong>80</strong> takes <strong>20% less time</strong>. These units are relative, not milliseconds.</p><div class="choices"><article><span class="option">A</span><h3>Original rule</h3><p>Undo both recent changes. Keep the previous routing behavior and its measured time as the reference.</p></article><article><span class="option">B</span><h3>Empty shortcut only</h3><p>Stop immediately when no possible witness exists. Keep the previous routing rule for queries that do have witnesses.</p><p><strong>Choose for the smaller behavior change.</strong> Its separate size and cold-query impact were not recorded.</p></article><article class="recommended"><span class="option">C · Currently enabled</span><h3>Keep both changes</h3><p>Keep the empty shortcut and the bounded route preference learned offline. No AI model or GPU runs during queries.</p><p><strong>Choose for the largest measured warm-query gain.</strong> Adds 80bytes gzip in total. Keep validating on real workloads.</p></article></div><div class="choice-charts">${charts}</div><details><summary>Side-by-side numbers</summary><div class="scroll"><table><thead><tr><th>Host</th><th>A · Original</th><th>B · Shortcut only</th><th>C · Both</th></tr></thead><tbody>${table}</tbody></table></div></details><p><strong>My recommendation: keep C on the prerelease branch.</strong> It saves more time in this synthetic comparison. B is the more conservative alternative because it only adds an exact early exit. Full compatibility suites were not rerun, and these averages do not predict your application’s speedup. This report does not change the selected runtime.</p></section>`
}
