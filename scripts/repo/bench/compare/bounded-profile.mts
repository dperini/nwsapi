import { Session } from 'node:inspector/promises'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
import type factoryType from '../../../../dist/nwsapi.js'
import { fixture, selectors } from './fixture.mts'

const enginePath = process.argv[3] || process.cwd() + '/dist/nwsapi.js'
const factory: typeof factoryType = createRequire(import.meta.url)(enginePath)
const engineHash = createHash('sha256')
  .update(readFileSync(enginePath))
  .digest('hex')

// Fixed workloads from the follow-up checklist. Setup and warmup are excluded.
const stateHtml =
  '<!doctype html><body><section lang=en dir=ltr>' +
  '<fieldset disabled><legend>Heading</legend>' +
  '<div>'.repeat(8) +
  '<input required value=ok>'.repeat(256) +
  '</div>'.repeat(8) +
  '</fieldset></section>'
const cases = [
  ...selectors(4, 'has').map(selector => ({
    selector,
    html: fixture(16, 4, 'adjacent', 'has'),
  })),
  { selector: selectors(64)[1]!, html: fixture(256, 64, 'adjacent') },
  ...[
    'input',
    'input:disabled',
    'input:valid',
    'input:invalid',
    'input:lang(en)',
    'input:dir(ltr)',
  ].map(selector => ({
    selector,
    html:
      selector.includes(':valid') || selector.includes(':invalid')
        ? stateHtml.replace('fieldset disabled', 'fieldset')
        : stateHtml,
  })),
]
const session = new Session()
session.connect()
const rows = []
try {
  for (const { selector, html } of cases) {
    const { window } = new JSDOM(html)
    try {
      const engine = factory(window)
      const expected = Array.from(window.document.querySelectorAll(selector))
      const run = () => engine.select(selector, window.document)
      const actual = run()
      if (
        actual.length !== expected.length ||
        expected.some((node, i) => node !== actual[i])
      ) {
        throw new Error('Profile fixture mismatch: ' + selector)
      }
      for (let i = 0; i < 200; ++i) {
        run()
      }
      await session.post('Profiler.enable')
      await session.post('Profiler.start')
      for (let i = 0; i < 200; ++i) {
        run()
      }
      const { profile } = await session.post('Profiler.stop')
      const samples = profile.samples?.length || 1
      const sites = profile.nodes
        .filter(node => node.hitCount)
        .map(node => ({
          function: node.callFrame.functionName,
          file: node.callFrame.url.replaceAll(process.cwd(), '<repo>'),
          line: node.callFrame.lineNumber + 1,
          percent: (100 * (node.hitCount || 0)) / samples,
        }))
        .toSorted((a, b) => b.percent - a.percent)
        .slice(0, 20)
      const timings = []
      for (let round = 0; round < 5; ++round) {
        const start = performance.now()
        for (let i = 0; i < 200; ++i) {
          run()
        }
        timings.push((performance.now() - start) / 200)
      }
      console.log(selector)
      rows.push({
        selector,
        matches: expected.length,
        millisecondsPerQuery: timings,
        sites,
      })
    } finally {
      window.close()
    }
  }
} finally {
  session.disconnect()
}
writeFileSync(
  process.argv[2]!,
  JSON.stringify(
    {
      node: process.version,
      engineHash,
      methodology:
        'Node/jsdom. 200 warmup queries. 200 CPU-profiled queries, then five unprofiled batches of 200 queries. State fixture has 256 required populated inputs under eight wrappers in a fieldset, inherited en/ltr. The fieldset is disabled except for validity probes. No application-frequency claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
