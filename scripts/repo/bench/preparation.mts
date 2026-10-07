import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../.config/runtime.d.ts'
import { compareTiming } from './compare/timing.mts'
import { median, timingEngine } from './timing.mts'

interface Case {
  name: string
  selector: string
  operation: 'select' | 'raw' | 'closest' | 'switch' | 'recompile' | 'cold'
  markup: string
}

const broad =
  '<!doctype html><main>' +
  '<div class="item" data-hit></div>'.repeat(512) +
  '</main>'
const deep =
  '<!doctype html><main class="root">' +
  '<div>'.repeat(64) +
  '<i id="leaf"></i>' +
  '</div>'.repeat(64) +
  '</main>'
const cases: Case[] = [
  {
    name: 'filtered class snapshot',
    selector: '.item[data-hit]',
    operation: 'select',
    markup: broad,
  },
  {
    name: 'filtered tag snapshot',
    selector: 'div[data-hit]',
    operation: 'select',
    markup: broad,
  },
  {
    name: 'missing filtered class',
    selector: '.item[data-miss]',
    operation: 'select',
    markup: broad,
  },
  {
    name: 'identity class control',
    selector: '.item',
    operation: 'select',
    markup: broad,
  },
  {
    name: 'descendant syntax reuse',
    selector: 'article div span',
    operation: 'select',
    markup:
      '<!doctype html><article><div><span></span></div></article>' +
      '<span></span>'.repeat(256),
  },
  {
    name: 'sibling syntax reuse',
    selector: 'i.before ~ b.target',
    operation: 'select',
    markup:
      '<!doctype html><main>' +
      '<section><i class="before"></i><b class="target"></b></section>'.repeat(
        64,
      ) +
      '</main>',
  },
  {
    name: 'closest deep hit',
    selector: '.root',
    operation: 'closest',
    markup: deep,
  },
  {
    name: 'closest deep miss',
    selector: '.missing',
    operation: 'closest',
    markup: deep,
  },
  {
    name: 'closest early control',
    selector: 'i',
    operation: 'closest',
    markup: deep,
  },
  {
    name: 'raw nested class predicates',
    selector: 'div:not(.missing):not(.absent)',
    operation: 'raw',
    markup: broad,
  },
  {
    name: 'cross-document matching',
    selector: 'div:not(.missing)',
    operation: 'switch',
    markup: '<!doctype html><div class="item"></div>',
  },
  {
    name: 'recompile after cache clear',
    selector: 'div:not(.missing):nth-child(2n)',
    operation: 'recompile',
    markup: broad,
  },
  {
    name: 'distinct cold compilation control',
    selector: 'div:not(.missing-N)',
    operation: 'cold',
    markup: broad,
  },
]
const [baseline, candidate, output] = process.argv.slice(2)
if (!baseline || !candidate || !output) {
  throw new Error(
    'Usage: preparation.mts <baseline.cjs> <candidate.cjs> <output.json>',
  )
}
const require = createRequire(import.meta.url)
const factories = [baseline, candidate].map(
  file => require(path.resolve(file)) as (host: unknown) => NwsapiEngine,
)
const settings = { rounds: 7, milliseconds: 30, batch: 8 }
const rows = []
for (const entry of cases) {
  const variants = factories.map(factory => prepare(factory, entry))
  try {
    for (const variant of variants) {
      variant.check()
      for (let index = 0; index < 32; ++index) {
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
    const row = {
      ...entry,
      samples,
      milliseconds,
      ratio: milliseconds[0]! / milliseconds[1]!,
    }
    rows.push(row)
    for (const variant of variants) {
      variant.check()
    }
    console.log(entry.name, milliseconds, row.ratio)
  } finally {
    for (const variant of variants) {
      variant.close()
    }
  }
}
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      v8: process.versions.v8,
      cpu: os.cpus()[0]?.model,
      timingEngine,
      settings,
      baseline: 'First implementation batch, 64abc81',
      sources: [baseline, candidate].map(file => ({
        file,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      })),
      methodology:
        'Seven rotating rounds; equivalent independent jsdom documents. Setup and identity checks outside timing. Raw calls use fixed arrays. Cache-clear rows include configure and compile. Cold rows use distinct selector suffixes. No application-wide, browser timing, or retained-memory claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
)

export function prepare(factory: (host: unknown) => NwsapiEngine, entry: Case) {
  const first = new JSDOM(entry.markup)
  const second = entry.operation === 'switch' ? new JSDOM(entry.markup) : null
  const document = first.window.document
  const engine = factory(first.window)
  const candidates = Array.from(document.getElementsByTagName('div'))
  const resolver =
    entry.operation === 'raw' ? engine.compile(entry.selector, true) : null
  const leaf = document.getElementById('leaf')
  const nodes = second
    ? [
        document.querySelector('div')!,
        second.window.document.querySelector('div')!,
      ]
    : []
  let iteration = 0
  const run = () => {
    switch (entry.operation) {
      case 'select':
        return engine.select(entry.selector, document)
      case 'raw':
        return resolver!(candidates, null, document, [])
      case 'closest':
        return engine.closest(entry.selector, leaf!)
      case 'switch':
        return engine.match(entry.selector, nodes[iteration++ % 2]!)
      case 'recompile':
        engine.configure({}, true)
        return engine.compile(entry.selector, true)
      case 'cold':
        return engine.compile(
          entry.selector.replace('-N', '-' + iteration++),
          true,
        )
      default:
        throw new Error('Unknown benchmark operation')
    }
  }
  return {
    run,
    close: () => {
      first.window.close()
      second?.window.close()
    },
    check: () => {
      const actual = run()
      if (entry.operation === 'closest') {
        assert.equal(actual, leaf!.closest(entry.selector))
      } else if (entry.operation === 'switch') {
        assert.equal(actual, true)
      } else if (
        entry.operation === 'recompile' ||
        entry.operation === 'cold'
      ) {
        assert.equal(typeof actual, 'function')
        const expected = Array.from(
          document.querySelectorAll(entry.selector.replace('-N', '-probe')),
        )
        assert.deepEqual(
          (actual as NonNullable<ReturnType<NwsapiEngine['compile']>>)(
            candidates,
            null,
            document,
            [],
          ),
          expected,
        )
      } else {
        assert.deepEqual(
          Array.from(actual as Element[]),
          Array.from(document.querySelectorAll(entry.selector)),
        )
      }
    },
  }
}
