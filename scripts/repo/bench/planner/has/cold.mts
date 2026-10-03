import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { gunzipSync } from 'node:zlib'
import { ENGINE_BUILD_PATH } from '../../../lib/paths.mts'
import { median, provenance, sha256 } from '../../footprint/shared.mts'
import type { Fixture } from '../fixtures.mts'
import type { NwsapiEngine } from '../../../../../.config/runtime.d.ts'

const [baseline, directory] = process.argv.slice(2)
if (!baseline || !directory) {
  throw new Error(
    'Usage: planner/has/cold.mts baseline.cjs measurement-directory',
  )
}
const load = createRequire(import.meta.url)
const files = [path.resolve(baseline), ENGINE_BUILD_PATH]
const factories = files.map(
  file => load(file) as (window: unknown) => NwsapiEngine,
)
const entries = JSON.parse(
  gunzipSync(readFileSync(path.join(directory, 'fixtures.json.gz'))).toString(),
) as Fixture[]
const rows = []
for (const entry of entries.filter(
  item => item.family === 'flat' && [0, 4].includes(item.plannerFeatures![3]),
)) {
  const hosts = factories.map(() => {
    const { window } = new JSDOM(entry.html)
    const expected = Array.from(
      window.document.querySelectorAll(entry.selector),
    )
    return { window, expected }
  })
  const samples: number[][] = [[], []]
  try {
    for (let round = 0; round < 25; ++round) {
      for (let turn = 0; turn < 2; ++turn) {
        const index = (round + turn) % 2
        const host = hosts[index]!
        const engine = factories[index]!(host.window)
        const start = performance.now()
        const actual = engine.select(entry.selector, host.window.document)
        samples[index]!.push((performance.now() - start) * 1e6)
        assert.deepEqual(Array.from(actual), host.expected, entry.id)
      }
    }
    rows.push({ id: entry.id, samples, costs: samples.map(median) })
  } finally {
    for (const host of hosts) {
      host.window.close()
    }
  }
}
writeFileSync(
  path.join(directory, 'jsdom-cold.json'),
  JSON.stringify(
    {
      metadata: {
        ...provenance(),
        variants: files.map(file => sha256(readFileSync(file))),
        rounds: 25,
        scope:
          'First selection per fresh engine on reused DOM; engine construction excluded',
      },
      rows,
    },
    null,
    2,
  ) + '\n',
)
