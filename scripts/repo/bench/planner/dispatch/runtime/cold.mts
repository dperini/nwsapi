import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { gzipSync, gunzipSync } from 'node:zlib'
import { isMainModule } from '../../../../lib/run-node.mts'
import { provenance, sha256 } from '../../../footprint/shared.mts'
import { checkedPower } from '../../has/power.mts'
import type { NwsapiEngine } from '../../../../../../.config/runtime.d.ts'

type Factory = (window: unknown) => NwsapiEngine
const selectors = [
  '.item:has(.hit)',
  '.item:has(.absent)',
  '.anchor:has(.hit)',
  'div.card',
  '[data-x="1"]',
  'ul li a',
  'main > section:nth-child(3)',
]

function factory(source: string, disablePlanner: boolean): Factory {
  const module = { exports: {} }
  compileFunction(source, ['module', 'exports', 'require'])(
    module,
    module.exports,
    createRequire(import.meta.url),
  )
  const create = module.exports as (window: unknown) => NwsapiEngine
  return window => {
    const engine = create(window)
    if (disablePlanner && engine.useNeuralPlanner) {
      engine.useNeuralPlanner(null)
    }
    return engine
  }
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[values.length >> 1]!
}

function fixture() {
  const html =
    '<main>' +
    Array.from(
      { length: 500 },
      (_, index) =>
        `<section id="item-${index}" class="item card${index < 80 ? ' anchor' : ''}" data-x="${index % 2}"><div>${index % 4 ? '<span class="hit"></span>' : ''}</div><ul><li><a href="#">x</a></li></ul></section>`,
    ).join('') +
    '</main>'
  return new JSDOM(html).window
}

function assertMatches(engine: NwsapiEngine, selector: string, doc: Document) {
  assert.deepEqual(
    Array.from(engine.select(selector, doc)),
    Array.from(doc.querySelectorAll(selector)),
    selector,
  )
}

export function coldBenchmark(output: string, baselinePath?: string) {
  const power = checkedPower()
  const baseline = gunzipSync(
    readFileSync(
      baselinePath ||
        'assets/repo/bench/planner-dispatch-jit-2026-10-05-r1/chromium-variant-0.cjs.gz',
    ),
  ).toString()
  const current = readFileSync('dist/nwsapi.js', 'utf8')
  const sources = [baseline, current]
  const factories = sources.map((source, index) => factory(source, index === 1))
  const window = fixture()
  const cold = selectors.map(() => [[], []] as [number[], number[]])
  const warm = selectors.map(() => [[], []] as [number[], number[]])

  for (const selector of selectors) {
    for (const create of factories) {
      assertMatches(create(window), selector, window.document)
    }
  }

  for (let round = 0; round < 31; round++) {
    for (let index = 0; index < selectors.length; index++) {
      const selector = selectors[index]!
      const order = round % 2 ? [1, 0] : [0, 1]
      for (const version of order) {
        const coldEngine = factories[version]!(window)
        const started = process.hrtime.bigint()
        assert.ok(coldEngine.select(selector, window.document))
        cold[index]![version]!.push(
          Number(process.hrtime.bigint() - started) / 1e6,
        )

        const warmEngine = factories[version]!(window)
        for (let count = 0; count < 16; count++) {
          warmEngine.select(selector, window.document)
        }
        const warmStart = process.hrtime.bigint()
        warmEngine.select(selector, window.document)
        warm[index]![version]!.push(
          Number(process.hrtime.bigint() - warmStart) / 1e6,
        )
      }
    }
  }

  const mutationEngine = factories[1]!(window)
  const witness = window.document.querySelector('.hit')!
  assertMatches(mutationEngine, '.item:has(.hit)', window.document)
  witness.remove()
  assertMatches(mutationEngine, '.item:has(.hit)', window.document)
  window.close()

  const rows = selectors.map((selector, index) => ({
    selector,
    coldMedianMs: cold[index]!.map(median),
    warmMedianMs: warm[index]!.map(median),
  }))
  const result = {
    metadata: {
      ...provenance(),
      power,
      powerAfter: checkedPower(),
      rounds: 31,
      baselineSha256: sha256(baseline),
      integratedPlannerDisabledSha256: sha256(current),
      selectionIdentityChecked: true,
      mutationChecked: true,
    },
    labels: [
      baselinePath ? 'Before cold-path change' : 'Before integration',
      'Integrated planner disabled',
    ],
    rows,
  }
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  writeFileSync(
    output.replace(/\.json$/, '.baseline.cjs.gz'),
    gzipSync(baseline),
  )
  writeFileSync(output.replace(/\.json$/, '.current.cjs.gz'), gzipSync(current))
}

if (isMainModule(import.meta.url)) {
  const [output, baseline] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/runtime/cold.mts output.json [baseline.cjs.gz]',
    )
  } else if (!output) {
    throw new Error('Provide an output JSON path')
  } else {
    coldBenchmark(path.resolve(output), baseline)
  }
}
