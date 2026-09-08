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
import { agrees, splitCharts } from './charts.mts'
import { writeBenchmarkCharts } from './chart-report.mts'
import { sample, timingEngine } from './timing.mts'
import type { Measurement } from './charts.mts'
import { DOCUMENTS } from './documents.mts'
import { cases } from './cases.mts'

const require = createRequire(import.meta.url)
const candidatePkg = require('../../../package.json')
const { values } = parseArgs({
  options: {
    baseline: { type: 'string', multiple: true },
    output: { type: 'string', default: 'assets/repo/bench' },
    rounds: { type: 'string', default: '9' },
    iterations: { type: 'string', default: '100' },
    'min-round-ms': { type: 'string', default: '50' },
  },
})
if (!values.baseline?.length) {
  throw new Error(
    'Pass --baseline for the extracted nwsapi 2.2.27 package directory.',
  )
}
const rounds = Number(values.rounds)
const iterations = Number(values.iterations)
const minRoundMs = Number(values['min-round-ms'])
if (
  !Number.isInteger(rounds) ||
  rounds < 3 ||
  !Number.isInteger(iterations) ||
  iterations < 1 ||
  !Number.isFinite(minRoundMs) ||
  minRoundMs < 0
) {
  throw new RangeError(
    'Use at least three rounds, one iteration, and a nonnegative minimum round duration.',
  )
}
for (const [fixture, categories] of Object.entries(cases)) {
  const html = DOCUMENTS[fixture as keyof typeof DOCUMENTS].html()
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
  const engines: Array<{
    name: string
    version: string
    sha256: string
    query: (selector: string) => ArrayLike<Element>
  }> = values.baseline.map(directory => {
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
    name: `${candidatePkg.name} ${candidatePkg.version}`,
    version: candidatePkg.version,
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
    query: selector => candidate.select(selector, document),
  })
  const jsdomPkg = require('jsdom/package.json')
  const jsdomRequire = createRequire(require.resolve('jsdom'))
  const competitorPkg = jsdomRequire('@asamuzakjp/dom-selector/package.json')
  engines.push({
    name: `${competitorPkg.name} ${competitorPkg.version}`,
    version: competitorPkg.version,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(jsdomRequire.resolve('@asamuzakjp/dom-selector')))
      .digest('hex'),
    query: selector => document.querySelectorAll(selector),
  })
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
        const expected = reference[selector]!.map(index => hostNodes[index]!)
        const errors = engines.map(engine => {
          try {
            return agrees(engine.query(selector), expected)
              ? null
              : 'result mismatch'
          } catch (error) {
            return `${error instanceof Error ? error.name : String(error)}: unsupported`
          }
        })
        const samples = engines.map(() => [] as number[])
        const sampleIterations = engines.map(() => [] as number[])
        const mitataSamples = engines.map(() => [] as number[][])
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
            const result = await sample(
              () => {
                consumed += engines[index]!.query(selector).length
              },
              iterations,
              minRoundMs,
            )
            samples[index]!.push(result.milliseconds)
            sampleIterations[index]!.push(result.calls)
            mitataSamples[index]!.push(result.samples)
          }
        }
        // Verify warmed routing and snapshot paths as well as the cold path.
        engines.forEach((engine, index) => {
          if (!errors[index] && !agrees(engine.query(selector), expected)) {
            errors[index] = 'warm result mismatch'
          }
        })
        rows.push({
          category,
          selector,
          errors,
          samples,
          sampleIterations,
          mitataSamples,
          milliseconds: samples.map(measurements => {
            const sorted = measurements.toSorted(
              (left: number, right: number) => left - right,
            )
            return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null
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
    minRoundMs,
    timingEngine,
    fixtureSha256: crypto.createHash('sha256').update(html).digest('hex'),
    fixture,
    engines: engines.map(({ query: _query, ...engine }) => engine),
    consumed,
  }
  const output = path.resolve(
    REPO_ROOT,
    values.output,
    fixture === 'components' ? '' : fixture,
  )
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ metadata, rows }, null, 2) + '\n',
  )
  writeBenchmarkCharts(output, metadata, rows)
  console.log(
    `Wrote ${rows.length} selector results and ${splitCharts(rows).length} charts to ${output}`,
  )
  if (rows.some(row => row.errors[engines.length - 2])) {
    process.exitCode = 1
  }
}
