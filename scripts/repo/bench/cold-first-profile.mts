import { Session } from 'node:inspector/promises'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'
import { components } from './documents.mts'

// Build outside the profile so DOM construction does not hide query costs.
const selectors = [
  '.card',
  'button.primary',
  'input.input',
  '.card > button.primary',
]
const worlds = Array.from({ length: 40 }, (_, i) => {
  const { window } = new JSDOM(components())
  return {
    window,
    engine: factory(window),
    selector: selectors[i % selectors.length],
  }
})
const session = new Session()
const output = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-cold-first-'))
session.connect()
try {
  await session.post('Profiler.enable')
  await session.post('Profiler.setSamplingInterval', { interval: 50 })
  await session.post('Profiler.start')
  let consumed = 0
  for (const { engine, window, selector } of worlds) {
    consumed += Number(Boolean(engine.first(selector, window.document)))
  }
  const { profile } = await session.post('Profiler.stop')
  writeFileSync(
    path.join(output, 'cold-first.cpuprofile'),
    JSON.stringify(profile),
  )
  const counts = new Map<number, number>()
  for (const sample of profile.samples || []) {
    counts.set(sample, (counts.get(sample) || 0) + 1)
  }
  const top = profile.nodes
    .map(node => ({
      samples: counts.get(node.id) || 0,
      name: node.callFrame.functionName,
      file: node.callFrame.url,
    }))
    .toSorted((a, b) => b.samples - a.samples)
    .slice(0, 20)
  console.log(
    JSON.stringify(
      { output, consumed, samples: profile.samples?.length, top },
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
