import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../.config/runtime.d.ts'
import { compareTiming } from './compare/timing.mts'
import { median } from './timing.mts'

const broad =
  '<!doctype html><main>' +
  '<section class="card a b" data-a="one" data-b><span class="leaf"></span></section>'.repeat(
    256,
  ) +
  '</main>'
const deep =
  '<!doctype html><main>' +
  '<div class="card a">'.repeat(100) +
  '<i class="witness leaf"></i>' +
  '</div>'.repeat(100) +
  '</main>'
const cases = [
  {
    name: 'shared class scans',
    selector: '.card[data-a], .card[data-b]',
    markup: broad,
  },
  {
    name: 'shared tag scans',
    selector: 'section[data-a], section[data-b]',
    markup: broad,
  },
  {
    name: 'complex logical predicates',
    selector: 'span:is(main > section > span, aside > span)',
    markup: broad,
  },
  {
    name: 'mixed backtracking miss',
    selector: '.missing .a > .a .a .leaf',
    markup: deep,
    match: true,
  },
  {
    name: 'mixed backtracking hit',
    selector: 'body .a > .a .a .leaf',
    markup: deep,
    match: true,
  },
  {
    name: 'sparse overlapping has',
    selector: '.card:has(.witness)',
    markup: deep,
  },
  {
    name: 'missing overlapping has',
    selector: '.card:has(.missing)',
    markup: deep,
  },
  { name: 'dense has control', selector: '.card:has(.leaf)', markup: broad },
  {
    name: 'small has control',
    selector: '.card:has(.leaf)',
    markup:
      '<!doctype html><section class="card"><i class="leaf"></i></section>',
  },
  {
    name: 'compound attribute reject',
    selector: 'section.missing[data-a="one"][data-b]',
    markup: broad,
    match: true,
  },
  { name: 'identity selection control', selector: '.card', markup: broad },
  {
    name: 'simple match control',
    selector: 'section.card',
    markup: broad,
    match: true,
  },
]
const [baseline, candidate, output] = process.argv.slice(2)
if (!baseline || !candidate || !output) {
  throw new Error('Usage: port.mts baseline.cjs candidate.cjs output.json')
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
      window.document.querySelector('.leaf') ||
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
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      cpu: os.cpus()[0]!.model,
      files: files.map(file => ({
        file,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      })),
      settings,
      rows,
    },
    null,
    2,
  ) + '\n',
)
