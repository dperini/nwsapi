import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { cpus, release } from 'node:os'
import { parseArgs } from 'node:util'
import type { Layout, Scenario } from './fixture.mts'

const require = createRequire(import.meta.url)
export function options(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      baseline: { type: 'string' },
      candidate: { type: 'string', default: 'dist/nwsapi.js' },
      output: { type: 'string' },
      mode: { type: 'string', default: 'timing' },
      groups: { type: 'string', default: '4' },
      scenario: { type: 'string', default: 'grouped' },
      layout: { type: 'string', default: 'adjacent' },
      matches: { type: 'string', default: '0,1,16,256' },
      rounds: { type: 'string', default: '5' },
      milliseconds: { type: 'string', default: '50' },
      batch: { type: 'string', default: '64' },
    },
  })
  if (!values.baseline || !values.output) {
    throw new Error(
      'Use --baseline <build.cjs> --output <report.json> [--mode timing|memory]',
    )
  }
  const integer = (value: string, min: number, max: number) => {
    const n = Number(value)
    if (!value.trim() || !Number.isInteger(n) || n < min || n > max) {
      throw new Error(
        `Expected integer from ${min} to ${max}, received ${value}`,
      )
    }
    return n
  }
  if (!['timing', 'memory'].includes(values.mode)) {
    throw new Error('Use --mode timing or memory')
  }
  if (!['adjacent', 'separated', 'nested'].includes(values.layout)) {
    throw new Error('Use --layout adjacent, separated, or nested')
  }
  if (!['grouped', 'ancestor', 'has', 'sibling'].includes(values.scenario)) {
    throw new Error('Use --scenario grouped, ancestor, has, or sibling')
  }
  return {
    scenario: values.scenario as Scenario,
    paths: [resolve(values.baseline), resolve(values.candidate)],
    output: resolve(values.output),
    mode: values.mode,
    groups: integer(values.groups, 2, 256),
    layout: values.layout as Layout,
    counts: values.matches.split(',').map(value => integer(value, 0, 256)),
    settings: {
      rounds: integer(values.rounds, 1, 99),
      milliseconds: integer(values.milliseconds, 1, 10_000),
      batch: integer(values.batch, 1, 100_000),
    },
  }
}

export function metadata(config: ReturnType<typeof options>) {
  return {
    harnessSourceHash: createHash('sha256')
      .update(readFileSync(new URL('./timing.mts', import.meta.url)))
      .digest('hex'),
    host: {
      platform: process.platform,
      arch: process.arch,
      release: release(),
      cpu: cpus()[0]?.model,
    },
    scenario: config.scenario,
    mode: config.mode,
    groups: config.groups,
    layout: config.layout,
    settings: config.settings,
    hashes: config.paths.map(p =>
      createHash('sha256').update(readFileSync(p)).digest('hex'),
    ),
    mitata: require('mitata/package.json').version as string,
    mitataSourceHash: createHash('sha256')
      .update(readFileSync(require.resolve('mitata/src/lib.mjs')))
      .digest('hex'),
    methodology:
      'Same installed mitata measurement implementation in both runtimes. Variants rotate between rounds after 1000 query warmups. Explicit batches, mitata automatic batching disabled, all sorted samples retained without trimming, nanoseconds per query. Timing disables manual GC and heap probes. Memory mode separately reports mitata positive heap deltas and GC timings, then V8 allocation sampling including collected objects and post-GC heap readings. Heap totals and GC values are per measurement, not per query. Setup, correctness checks and compilation are outside measurements. Browser and Node results are separate workloads.',
  }
}

export function writeReport(path: string, report: unknown) {
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n')
  console.log(`Wrote ${path}`)
}
