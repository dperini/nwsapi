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

export type Case = {
  name: string
  selector: string
  operation: 'first' | 'select' | 'raw' | 'match'
  size: number
  hit?: 'all' | 'last'
  mutation?: boolean
  expected: 'all' | 'last' | 'second' | 'none' | 'true'
}

const cases: Case[] = [
  {
    name: 'first nth miss',
    selector: 'div[data-hit]:nth-child(2n)',
    operation: 'first',
    size: 512,
    expected: 'none',
  },
  {
    name: 'first nth late',
    selector: 'div[data-hit]:nth-child(2n)',
    operation: 'first',
    size: 512,
    hit: 'last',
    expected: 'last',
  },
  {
    name: 'first nth early',
    selector: 'div:nth-child(2n)',
    operation: 'first',
    size: 512,
    expected: 'second',
  },
  ...(['select', 'raw'] as const).flatMap(operation => [
    {
      name: `${operation} logical valid`,
      selector: 'div:is(.missing,[data-hit])',
      operation,
      size: 256,
      hit: 'all' as const,
      expected: 'all' as const,
    },
    {
      name: `${operation} logical invalid branch`,
      selector: 'div:is(.missing,:audit-unknown)',
      operation,
      size: 256,
      expected: 'none' as const,
    },
  ]),
  ...(['.card', '[data-hit]'] as const).flatMap(selector =>
    [false, true].map(mutation => ({
      name: `${selector} ${mutation ? 'mutation and query' : 'warm'}`,
      selector,
      operation: 'select' as const,
      size: 1000,
      hit: 'all' as const,
      mutation,
      expected: 'all' as const,
    })),
  ),
  {
    name: 'single match control',
    selector: 'div.card[data-hit]',
    operation: 'match',
    size: 256,
    hit: 'all',
    expected: 'true',
  },
  {
    name: 'language control',
    selector: 'div:lang(en-US)',
    operation: 'select',
    size: 256,
    expected: 'all',
  },
]

const [baseline, candidate, output] = process.argv.slice(2)
if (!baseline || !candidate || !output) {
  throw new Error(
    'Usage: compilation-followup.mts <baseline.cjs> <candidate.cjs> <output.json>',
  )
}
const require = createRequire(import.meta.url)
const factories = [baseline, candidate].map(
  file => require(path.resolve(file)) as (global: unknown) => NwsapiEngine,
)
const settings = { rounds: 7, milliseconds: 30, batch: 8 }
const rows = []

for (const entry of cases) {
  const markup =
    '<!doctype html><body lang="en-US"><main>' +
    Array.from({ length: entry.size }, (_, index) => {
      const hit =
        entry.hit === 'all' ||
        (entry.hit === 'last' && index === entry.size - 1)
      return `<div class="card"${hit ? ' data-hit' : ''}></div>`
    }).join('') +
    '</main>'
  const variants = factories.map(factory => prepare(factory, markup, entry))
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
      markup,
      samples,
      milliseconds,
      ratio: milliseconds[0]! / milliseconds[1]!,
    }
    rows.push(row)
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
      sources: [baseline, candidate].map(file => ({
        file,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      })),
      methodology:
        'Seven rotating rounds of public queries or raw resolvers. Each variant owns an equivalent jsdom document. Identity checks and setup are outside timing. Mutation cases include append, query, and removal. Raw resolvers use fixed candidates. No cross-runtime or retained-memory claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
)

export function prepare(
  factory: (global: unknown) => NwsapiEngine,
  markup: string,
  entry: Case,
) {
  const { window } = new JSDOM(markup)
  const document = window.document
  const engine = factory(window)
  const candidates = Array.from(document.getElementsByTagName('div'))
  const resolver =
    entry.operation === 'raw' ? engine.compile(entry.selector, true) : null
  const mutation = document.createElement('aside')
  const query = () => {
    switch (entry.operation) {
      case 'raw':
        return resolver!(candidates, null, document, [])
      case 'first':
        return engine.first(entry.selector, document)
      case 'match':
        return engine.match(entry.selector, candidates[0]!)
      case 'select':
        return engine.select(entry.selector, document)
      default:
        throw new Error('Unknown benchmark operation')
    }
  }
  const run = () => {
    if (entry.mutation) {
      document.body.appendChild(mutation)
    }
    try {
      return query()
    } finally {
      if (entry.mutation) {
        mutation.remove()
      }
    }
  }
  return {
    run,
    close: () => window.close(),
    check: () => {
      const actual = run()
      if (entry.expected === 'true') {
        assert.equal(actual, true)
      } else if (entry.operation === 'first') {
        assert.equal(
          actual,
          entry.expected === 'last'
            ? candidates.at(-1)
            : entry.expected === 'second'
              ? candidates[1]
              : null,
        )
      } else {
        const expected = entry.expected === 'all' ? candidates : []
        assert.deepEqual(Array.from(actual as Element[]), expected)
      }
    },
  }
}
