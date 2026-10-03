import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../../.config/runtime.d.ts'
import { compareTiming } from '../compare/timing.mts'
import { median } from '../timing.mts'

import { writeTimingReport } from './report.mts'
import { cases } from './cases.mts'

const [baseline, candidate, output] = process.argv.slice(2)
if (!baseline || !candidate || !output) {
  throw new Error('Usage: port/run.mts baseline.cjs candidate.cjs output.json')
}
const require = createRequire(import.meta.url)
const files = [baseline, candidate]
const factories = files.map(
  file => require(path.resolve(file)) as (host: unknown) => NwsapiEngine,
)
const settings = { rounds: 7, milliseconds: 20, batch: 8 }
const rows = []
for (const entry of cases) {
  const variants = factories.map(factory => {
    const { window } = new JSDOM(entry.markup)
    const engine = factory(window)
    const element =
      window.document.querySelector(entry.target || '.leaf') ||
      window.document.querySelector('section')!
    const run = entry.match
      ? () => engine.match(entry.selector, element)
      : () => engine.select(entry.selector, window.document)
    const expected = entry.match
      ? element.matches(entry.selector)
      : Array.from(window.document.querySelectorAll(entry.selector))
    return {
      window,
      run,
      check: () => assert.deepEqual(run(), expected, entry.name),
    }
  })
  try {
    for (const variant of variants) {
      variant.check()
      for (let i = 0; i < 32; ++i) {
        variant.run()
      }
    }
    const samples = await compareTiming(
      variants.map(variant => variant.run),
      settings,
    )
    const milliseconds = samples.map(rounds =>
      median(rounds.map(round => round.p50Ns / 1e6)),
    )
    rows.push({
      ...entry,
      milliseconds,
      speedup: milliseconds[0]! / milliseconds[1]!,
      samples,
    })
    console.log(
      entry.name +
        ': ' +
        (milliseconds[0]! / milliseconds[1]!).toFixed(2) +
        'x',
    )
    for (const variant of variants) {
      variant.check()
    }
  } finally {
    for (const variant of variants) {
      variant.window.close()
    }
  }
}
const cold: number[][] = [[], []]
const windows = factories.map(
  () => new JSDOM('<!doctype html><body></body>').window,
)
const coldEngines = factories.map((factory, i) => factory(windows[i]))
try {
  for (let round = 0; round < 7; ++round) {
    for (let turn = 0; turn < 2; ++turn) {
      const index = (round + turn) % 2
      const start = performance.now()
      for (let i = 0; i < 500; ++i) {
        coldEngines[index]!.compile(
          'section.unique' + round + '_' + i + '[data-x]:not(.missing)',
          false,
        )
      }
      cold[index]!.push((performance.now() - start) / 500)
    }
  }
} finally {
  for (const window of windows) {
    window.close()
  }
}
console.log(
  'cold compilation: ' + (median(cold[0]!) / median(cold[1]!)).toFixed(2) + 'x',
)
writeTimingReport(output, {
  node: process.version,
  power:
    process.platform === 'darwin'
      ? execFileSync('/usr/bin/pmset', ['-g', 'batt'], {
          encoding: 'utf8',
        }).trim()
      : null,
  cpu: os.cpus()[0]!.model,
  files: files.map(file => ({
    file,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  })),
  cold,
  settings,
  rows,
})
