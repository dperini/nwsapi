import { Session } from 'node:inspector/promises'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { REPO_ROOT } from '../lib/paths.mts'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'
import { DOCUMENTS } from './documents.mts'
import { cases } from './cases.mts'

const [phase = 'select', outputArgument] = process.argv.slice(2)
if (!['select', 'first', 'match', 'cold', 'resolver'].includes(phase)) {
  throw new Error(
    'Usage: profile.mts <select|first|match|cold|resolver> <output.cpuprofile>',
  )
}
const output =
  outputArgument ||
  path.join(
    mkdtempSync(path.join(os.tmpdir(), 'nwsapi-profile-')),
    'nwsapi.cpuprofile',
  )
const worlds = Object.entries(cases).map(([name, groups]) => {
  const { window } = new JSDOM(DOCUMENTS[name].html())
  const engine = factory(window)
  const doc = window.document
  const nodes = [...doc.getElementsByTagName('*')]
  const queries = Object.values(groups)
    .flat()
    .map(selector => ({
      selector,
      resolve: engine.compile(selector, true),
    }))
  return { window, engine, doc, nodes, queries }
})
let consumed = 0
function run(iterations: number) {
  for (const { engine, doc, nodes, queries } of worlds) {
    for (let i = 0; i < iterations; ++i) {
      for (const { selector, resolve } of queries) {
        switch (phase) {
          case 'cold':
            consumed +=
              engine.compile(selector + `:not(.profile-${i})`, true)?.toString()
                .length || 0
            break
          case 'match':
            consumed += Number(engine.match(selector, nodes[i % nodes.length]))
            break
          case 'first':
            consumed += Number(!!engine.first(selector, doc))
            break
          case 'resolver':
            consumed += resolve
              ? (resolve(nodes, null, doc, []) as Element[]).length
              : nodes.length
            break
          default:
            consumed += engine.select(selector, doc).length
        }
      }
    }
  }
}
const session = new Session()
session.connect()
try {
  if (phase !== 'cold') {
    run(30)
  }
  await session.post('Profiler.enable')
  await session.post('Profiler.start')
  const iterations = phase === 'match' ? 100_000 : 1000
  run(iterations)
  const { profile } = await session.post('Profiler.stop')
  writeFileSync(output, JSON.stringify(profile))
  const counts = new Map<number, number>()
  for (const sample of profile.samples || []) {
    counts.set(sample, (counts.get(sample) || 0) + 1)
  }
  const top = profile.nodes
    .map(node => ({
      samples: counts.get(node.id) || 0,
      function: node.callFrame.functionName,
      url: node.callFrame.url.replace('file://' + REPO_ROOT + '/', ''),
      line: node.callFrame.lineNumber + 1,
    }))
    .toSorted((a, b) => b.samples - a.samples)
    .slice(0, 30)
  console.log(
    JSON.stringify(
      {
        phase,
        output,
        iterations,
        sourceSha256: createHash('sha256')
          .update(
            readFileSync(new URL('../../../src/nwsapi.js', import.meta.url)),
          )
          .digest('hex'),
        consumed,
        node: process.version,
        v8: process.versions.v8,
        samples: profile.samples?.length,
        top,
      },
      null,
      2,
    ),
  )
} finally {
  session.disconnect()
  for (const { window } of worlds) {
    window.close()
  }
}
