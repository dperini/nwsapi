import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import factory from '../../../src/nwsapi.js'
import {
  ENGINE_BUILD_PATH,
  ENGINE_SOURCE_PATH,
  REPO_ROOT,
} from '../lib/paths.mts'
import { agrees, chart, splitCharts } from './charts.mts'
import type { Measurement } from './charts.mts'
import { components } from './documents.mts'

const require = createRequire(import.meta.url)
const { values } = parseArgs({
  options: {
    baseline: { type: 'string', multiple: true },
    output: { type: 'string', default: 'assets/repo/bench' },
    rounds: { type: 'string', default: '9' },
    iterations: { type: 'string', default: '100' },
  },
})
if (!values.baseline?.length) {
  throw new Error(
    'Pass --baseline for each extracted published nwsapi package directory (2.0.0 and 2.2.27).',
  )
}
const rounds = Number(values.rounds)
const iterations = Number(values.iterations)
if (
  !Number.isInteger(rounds) ||
  rounds < 3 ||
  !Number.isInteger(iterations) ||
  iterations < 1
) {
  throw new RangeError('Use at least three rounds and one iteration.')
}
const html = components()
const dom = new JSDOM(html)
const { document } = dom.window
const options = { document, DOMException: dom.window.DOMException }
execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ENGINE_SOURCE_PATH], {
  cwd: REPO_ROOT,
})
const sha = execFileSync(
  'git',
  ['log', '-1', '--format=%H', '--', ENGINE_SOURCE_PATH],
  { cwd: REPO_ROOT, encoding: 'utf8' },
).trim()
const source = fs.readFileSync(ENGINE_BUILD_PATH)
const candidate = factory(options)
const engines = values.baseline.map(directory => {
  const root = path.resolve(directory)
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  )
  if (pkg.name !== 'nwsapi' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error('Baseline must be an extracted stable nwsapi package.')
  }
  const sourcePath = require.resolve(root)
  const engine = require(sourcePath)(options)
  return {
    name: `nwsapi ${pkg.version}`,
    version: pkg.version,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(sourcePath))
      .digest('hex'),
    query: (selector: string) => engine.select(selector, document),
  }
})
engines.push({
  name: `unreleased ${sha.slice(0, 8)}`,
  version: 'unreleased',
  sha256: crypto.createHash('sha256').update(source).digest('hex'),
  query: selector => candidate.select(selector, document),
})
const jsdomPkg = require('jsdom/package.json')
const jsdomRequire = createRequire(require.resolve('jsdom'))
const competitorPkg = jsdomRequire('@asamuzakjp/dom-selector/package.json')
engines.push({
  name: `dom-selector ${competitorPkg.version}`,
  version: competitorPkg.version,
  sha256: crypto
    .createHash('sha256')
    .update(fs.readFileSync(jsdomRequire.resolve('@asamuzakjp/dom-selector')))
    .digest('hex'),
  query: selector => document.querySelectorAll(selector),
})
const categories = {
  identifiers: ['#in-150', '.card', 'button', 'button.primary'],
  attributes: [
    '[data-testid]',
    '[data-testid="btn-150"]',
    '[data-testid^="btn-"]',
    '[class~="primary"]',
  ],
  relationships: [
    'div button',
    'div > button',
    'label + input',
    'button ~ span',
  ],
  positional: [
    'div:first-child',
    'div:last-child',
    'div:nth-child(2n)',
    'div:nth-last-child(3)',
  ],
  logical: [
    'button:not(.missing)',
    ':is(button, input)',
    ':where(.card) > button',
    'div:has(> button)',
  ],
  forms: [
    'input:enabled',
    'input:optional',
    'input:read-write',
    'button:disabled',
  ],
}
const rows: Measurement[] = []
const browser = await chromium.launch({ headless: true })
let reference: Record<string, number[]>
let browserVersion: string
try {
  browserVersion = browser.version()
  const page = await browser.newPage()
  await page.setContent(html)
  reference = await page.evaluate(selectors => {
    const nodes = Array.from(document.getElementsByTagName('*'))
    return Object.fromEntries(
      selectors.map(selector => [
        selector,
        Array.from(document.querySelectorAll(selector), node =>
          nodes.indexOf(node),
        ),
      ]),
    )
  }, Object.values(categories).flat())
} finally {
  await browser.close()
}
const hostNodes = Array.from(document.getElementsByTagName('*'))
let consumed = 0
try {
  for (const [category, selectors] of Object.entries(categories)) {
    for (const selector of selectors) {
      const expected = reference[selector].map(index => hostNodes[index])
      const errors = engines.map(engine => {
        try {
          return agrees(engine.query(selector), expected)
            ? null
            : 'result mismatch'
        } catch (error) {
          return `${error.name}: unsupported`
        }
      })
      const samples = engines.map(() => [] as number[])
      for (let warmup = 0; warmup < 20; ++warmup) {
        engines.forEach((engine, index) => {
          if (!errors[index]) {
            consumed += engine.query(selector).length
          }
        })
      }
      // Rotate engine order each round to distribute drift and GC pauses.
      for (let round = 0; round < rounds; ++round) {
        for (let offset = 0; offset < engines.length; ++offset) {
          const index = (round + offset) % engines.length
          if (errors[index]) {
            continue
          }
          const start = process.hrtime.bigint()
          for (let count = 0; count < iterations; ++count) {
            consumed += engines[index].query(selector).length
          }
          samples[index].push(
            Number(process.hrtime.bigint() - start) / iterations / 1e6,
          )
        }
      }
      rows.push({
        category,
        selector,
        errors,
        samples,
        milliseconds: samples.map(sample => {
          const sorted = sample.toSorted((left, right) => left - right)
          return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
        }),
      })
    }
  }
} finally {
  dom.window.close()
}
const metadata = {
  timestamp: new Date().toISOString(),
  candidateCommit: sha,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: os.cpus()[0]?.model,
  jsdom: jsdomPkg.version,
  correctnessOracle: `Chromium ${browserVersion}`,
  rounds,
  iterations,
  fixtureSha256: crypto.createHash('sha256').update(html).digest('hex'),
  engines: engines.map(({ query: _query, ...engine }) => engine),
  consumed,
}
const output = path.resolve(REPO_ROOT, values.output)
const titles = {
  identifiers: 'Basic selectors',
  attributes: 'Attribute selectors',
  relationships: 'Relationships',
  positional: 'Position selectors',
  logical: 'Logical selectors',
  forms: 'Form state selectors',
}
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(output, 'results.json'),
  JSON.stringify({ metadata, rows }, null, 2) + '\n',
)
for (const group of splitCharts(rows)) {
  fs.writeFileSync(
    path.join(output, `${group.name}.svg`),
    chart(
      titles[group.rows[0].category] ?? group.name,
      engines.map(engine => engine.name),
      group.rows,
      `${process.version}; jsdom ${jsdomPkg.version}; ${rounds} rounds; ${metadata.timestamp.slice(0, 10)}; candidate ${sha.slice(0, 8)}`,
    ),
  )
}
console.log(
  `Wrote ${rows.length} selector results and ${splitCharts(rows).length} charts to ${output}`,
)
if (rows.some(row => row.errors[engines.length - 2])) {
  process.exitCode = 1
}
