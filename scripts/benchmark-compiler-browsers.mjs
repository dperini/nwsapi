// Usage: node scripts/benchmark-compiler-browsers.mjs baseline.js [report.json]
// Fixtures and browser startup are excluded. Timings are workload-specific.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium, firefox, webkit } from 'playwright'
import { createHash } from 'node:crypto'
import { launchCompilerBrowser } from './lib/compiler-browser.mjs'

assert.ok(process.argv[2], 'provide a saved baseline source file')
const baseline = readFileSync(process.argv[2], 'utf8')
const current = readFileSync(new URL('../src/nwsapi.js', import.meta.url), 'utf8')
const digest = value => createHash('sha256').update(value).digest('hex')
const report = { date: new Date().toISOString(), baseline: process.argv[2], baselineSHA256: digest(baseline), currentSHA256: digest(current), units: 'milliseconds per operation', engines: [] }
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await launchCompilerBrowser(name, type)
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><main></main>')
    const result = await page.evaluate(({ baseline, current }) => {
      window.eval(baseline); const before = window.NW.Dom
      window.eval(current); const after = window.NW.Dom
      const engines = [before, after]
      document.body.innerHTML = '<main>' + Array.from({ length: 150 }, (_, i) =>
        `<section class="card a b" data-x="x" id="card${i}">` + '<span class="needle"></span>'.repeat(12) + '</section>').join('') +
        '</main><aside id="wide">' + '<i class="needle"></i>'.repeat(600) + '</aside>' +
        '<div class="outer a">'.repeat(35) + '<b class="leaf" id="leaf"></b>' + '</div>'.repeat(35) +
        '<div class="nest">'.repeat(150) + '<em class="witness"></em>' + '</div>'.repeat(150)
      const card = document.getElementById('card0'), wide = document.getElementById('wide'), leaf = document.getElementById('leaf')
      const cases = [
        ['simple match hit', e => e.match('section.card', card), true],
        ['cheap tag miss', e => e.match('article:has(> .needle)', card), false],
        ['simple select', e => e.select('.card').length, 150],
        ['compound facts', e => e.match('.a.b[data-x="x"][data-x^="x"]:is(.a,.b):not(.off)', card), true],
        ['first selector list', e => e.first('.card[data-x], .card.a').id, 'card0'],
        ['shared selector scans', e => e.select('.card[data-x], .card[id], .card:nth-child(2n)').length, 150],
        ['has child hit', e => e.match(':has(> .needle)', wide), true],
        ['has child miss', e => e.match(':has(> .missing)', wide), false],
        ['has sibling hit', e => e.match(':has(+ section.card)', card), true],
        ['ancestor hit', e => e.match('.outer .leaf', leaf), true],
        ['ancestor miss', e => e.match('.missing .outer .outer .leaf', leaf), false],
        ['mixed backtracking miss', e => e.match('.missing .a > .a .a .leaf', leaf), false],
        ['mixed backtracking hit', e => e.match('body .a > .a .a .leaf', leaf), true],
        ['bulk nth', e => e.select('section > span:nth-child(2n):not(:nth-child(3n))').length, 600],
        ['logical subplans', e => e.select('span:is(main > section > span, aside > span)').length, 1800],
        ['select relational', e => e.select('.card:has(> .needle)').length, 150],
        ['first relational', e => e.first('.card:has(> .needle)').id, 'card0'],
        ['bulk descendant has', e => e.select('.nest:has(.witness)').length, 150],
      ]
      const results = []
      function measure(run, minimum = 25) {
        let count = 0, elapsed, sink
        const start = performance.now()
        do { for (let i = 0; i < 10; i++) sink = run(); count += 10; elapsed = performance.now() - start } while (elapsed < minimum)
        window.__benchmarkSink = sink
        return elapsed / count
      }
      function stats(values) {
        values.sort((a, b) => a - b)
        return { median: values[3], min: values[0], max: values[6], samples: values }
      }
      for (const [label, run, expected] of cases) {
        for (const engine of engines) {
          if (run(engine) !== expected) throw Error('incorrect benchmark: ' + label)
          for (let i = 0; i < 30; i++) run(engine)
        }
        const samples = [[], []]
        for (let round = 0; round < 7; round++) for (let offset = 0; offset < 2; offset++) {
          const index = (round + offset) % 2
          samples[index].push(measure(() => run(engines[index])))
        }
        const baselineStats = stats(samples[0]), currentStats = stats(samples[1])
        results.push({ label, baseline: baselineStats, current: currentStats, speedup: baselineStats.median / currentStats.median })
      }
      const cold = [[], []]
      for (let round = 0; round < 7; round++) for (let offset = 0; offset < 2; offset++) {
        const index = (round + offset) % 2, engine = engines[index], start = performance.now()
        for (let i = 0; i < 300; i++) engine.compile(`section#cold${round}_${i}.card[data-x]:has(> span)`, false)
        cold[index].push((performance.now() - start) / 300)
      }
      const coldBefore = stats(cold[0]), coldAfter = stats(cold[1])
      results.push({ label: 'cold compilation', baseline: coldBefore, current: coldAfter, speedup: coldBefore.median / coldAfter.median })
      return results
    }, { baseline, current })
    report.engines.push({ name, version: browser.version(), results: result })
    console.log(name + ' ' + browser.version())
    console.table(result.map(row => ({ case: row.label, baseline_ms: row.baseline.median.toFixed(6), current_ms: row.current.median.toFixed(6), speedup: row.speedup.toFixed(2) + 'x' })))
  } finally { await browser.close() }
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n')
