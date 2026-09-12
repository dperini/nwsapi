import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  engineNames,
  kib,
  positiveInteger,
  provenance,
  summarize,
} from './shared.mts'
import { REPO_ROOT } from '../../lib/paths.mts'

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '40' },
    queries: { type: 'string', default: '100' },
    rounds: { type: 'string', default: '5' },
    output: {
      type: 'string',
      default: '.cache/bench/jsdom-memory-footprint.json',
    },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: pnpm run compare:memory [--count 40] [--queries 100] [--rounds 5] [--output path]',
  )
} else {
  const count = positiveInteger(values.count, 'count', 1000)
  const queries = positiveInteger(values.queries, 'queries')
  const rounds = positiveInteger(values.rounds, 'rounds', 100)
  type Sample = {
    initialized: number
    queried: number
    cacheGrowth: number
    fixtureSha256: string
  }
  const samples: Sample[][] = [[], []]
  const worker = fileURLToPath(
    new URL('./footprint-worker.mts', import.meta.url),
  )
  for (let round = 0; round < rounds; round++) {
    for (let turn = 0; turn < 2; turn++) {
      const index = (round + turn) % 2
      const result = execFileSync(
        process.execPath,
        [
          '--expose-gc',
          worker,
          ['nwsapi', 'dom-selector'][index]!,
          String(count),
          String(queries),
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
        },
      )
      samples[index]!.push(JSON.parse(result))
    }
    console.log(`Memory footprint: round ${round + 1}/${rounds}`)
  }
  const report = {
    metadata: {
      ...provenance(),
      count,
      queries,
      rounds,
      fixtureSha256: samples[0]![0]!.fixtureSha256,
      method:
        'Incremental retained JS heap per document after GC; fresh process per engine and round; preallocated DOMs and shared module code excluded; direct engine APIs; alternating order.',
    },
    rows: engineNames.map((engine, i) => ({
      engine,
      initialized: summarize(samples[i]!.map(s => s.initialized)),
      queried: summarize(samples[i]!.map(s => s.queried)),
      cacheGrowth: summarize(samples[i]!.map(s => s.cacheGrowth)),
    })),
  }
  const output = path.resolve(values.output)
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  for (const row of report.rows) {
    console.log(
      `${row.engine}: ${kib(row.initialized.median)} initialized; ${kib(row.queried.median)} after ${queries} queries per document`,
    )
  }
  console.log(`Recorded samples: ${path.relative(REPO_ROOT, output)}`)
}
