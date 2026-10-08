import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface Sample {
  milliseconds: number
  heapDeltaBytes: number
}
interface Row {
  variant: string
  case: string
  samples: Sample[]
  counts: {
    hits: number
    lookups: number
    compilations: number
    hotHits: number
    hotLookups: number
    retained: Array<{ entries: number; estimatedBytes: number }>
    perPass?: Array<{ calls: number; hits: number }>
  }
}
interface Recording {
  date: string
  node: string
  platform: string
  architecture: string
  cpu: string
  beforeRevision: string
  candidateRevision: string
  cases: Array<{ name: string }>
  rows: Row[]
}
const [input, output] = process.argv.slice(2)
if (!input || !output) {
  throw new Error('Usage: report.mts <recording.json> <report.md>')
}
const data = JSON.parse(readFileSync(input, 'utf8')) as Recording
const median = (row: Row, key: keyof Sample) =>
  row.samples.map(sample => sample[key]).toSorted((a, b) => a - b)[1]!
const row = (name: string, variant: string) =>
  data.rows.find(item => item.case === name && item.variant === variant)!
const rate = (item: Row) =>
  ((100 * item.counts.hits) / item.counts.lookups).toFixed(2) + '%'
const ms = (item: Row) => median(item, 'milliseconds').toFixed(2) + 'ms'
const heap = (item: Row) =>
  (median(item, 'heapDeltaBytes') / 1024 / 1024).toFixed(2) + 'MiB'
const link = path.relative(path.dirname(output), input)
const lines = [
  '# Selector cache scan mitigation in V3',
  '',
  'V3 exposes numeric cache budgets and limits admission when compiled-plan caches are full. Existing entries move to the most recent position on a hit. A local deterministic sequence admits approximately one in eight new entries that require eviction. Entries that fit without eviction are admitted immediately. This retains useful plans during repeated scans while allowing a changing workload to replace old plans.',
  '',
  'This addresses the repeated-scan failure measured for [issue #242](https://github.com/dperini/nwsapi/issues/242) in the cases below. It does not reproduce the reporter’s complete application. Oversized individual plans remain uncached, and workloads larger than the budgets still incur misses.',
  '',
  '<details>',
  '<summary>Measurement scope and reproduction</summary>',
  '',
  `Recorded on ${data.date.slice(0, 10)} using Node.js ${data.node}, ${data.platform}/${data.architecture}, ${data.cpu}. Baseline: \`${data.beforeRevision}\`. Candidate: \`${data.candidateRevision}\`. [Recorded inputs, samples, counts, and bundle hashes](${link}).`,
  '',
  'Each timing sample runs in a fresh process with the same DOM and query sequence. There are three timing samples per case. The table reports medians. Timing includes the complete `match()` calls after one warmup scan. A separate instrumented process observes actual resolver-cache reads and counts dynamic `Function` construction. It also checks every match result. No extra cache reads are used to measure hits.',
  '',
  'Heap deltas compare explicit garbage collections before warmup and after the measured queries while the engine, document, and selector traces remain reachable. They include VM compilation and other process effects. They are not exact cache sizes. Estimated retained bytes are checked separately for each cache and must remain within its configured budget.',
  '',
  'Both default variants use 4,096 entries and 2MiB per compiled-plan cache. The expanded variant uses `CACHE_LIMIT: 8192` and `CACHE_BYTES: 8 * 1024 * 1024`. These limits apply per cache, not to the whole engine or process.',
  '',
  '```sh',
  'node scripts/repo/bench/cache/scan.mts before.cjs dist/nwsapi.js assets/repo/bench/issue-242-cache-mitigation-2026-10-08.json',
  'node scripts/repo/bench/cache/report.mts assets/repo/bench/issue-242-cache-mitigation-2026-10-08.json docs/repo/perf/selector-cache-mitigation-outcome.md',
  '```',
  '',
  'Build `before.cjs` from the baseline revision using the repository build command. Build the candidate before running the comparison. The collector starts workers with `--expose-gc`.',
  '',
  '</details>',
  '',
  '## Default budgets',
  '',
  '| Case | Before hits | After hits | Before runtime | After runtime | Function constructions before → after |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
]
for (const { name } of data.cases) {
  const before = row(name, 'before')
  const after = row(name, 'after')
  lines.push(
    `| ${name} | ${rate(before)} | ${rate(after)} | ${ms(before)} | ${ms(after)} | ${before.counts.compilations} → ${after.counts.compilations} |`,
  )
}
lines.push(
  '',
  'Class cases scan simple class selectors. The complex case scans 2,300 selectors shaped like `:where(.css-x).ant-btn-N:not(:disabled):not(.ant-btn-disabled):hover`. The small warm case makes 64,000 calls. Other steady scans make ten passes. The mixed case alternates 32 frequently reused selectors with one-off selectors. The changed case replaces the original 2,300 selectors and makes twenty passes over the new set.',
  '',
  '## Larger host-selected budgets and memory',
  '',
  '| Case | Expanded hits | Expanded runtime | Heap delta before | Heap delta after | Heap delta expanded |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
)
for (const { name } of data.cases) {
  const expanded = row(name, 'after-expanded')
  lines.push(
    `| ${name} | ${rate(expanded)} | ${ms(expanded)} | ${heap(row(name, 'before'))} | ${heap(row(name, 'after'))} | ${heap(expanded)} |`,
  )
}
lines.push(
  '',
  'Expanded budgets can hold both the simple and complex steady scans. The changed workload includes its first cold pass, so an aggregate hit rate below 100% does not imply continuing misses. One-off selectors cannot produce hits. Heap deltas depend on garbage collection and VM code retention and should be interpreted alongside the recorded per-cache estimated byte counts.',
  '',
  '## Configuration contract',
  '',
  '- `CACHE_LIMIT` and `CACHE_BYTES` accept nonnegative safe integers. Zero disables retention for the applicable caches.',
  '- Changes clear existing query caches and apply immediately. Invalid numeric values throw before changing options. Existing Boolean options retain their behavior.',
  '- Configure the host’s actual engine. The V3 `DOMSelector` adapter accepts these numeric settings before its first use.',
  '- The no-`Map` fallback uses the same compiled-plan policy and limits. Fixed-size helper caches retain their own bounds.',
  '',
  'The separate V2 change exposes configuration with its existing defaults and LRU policy. It is a mitigation when a stylesheet fits the host-selected bounds, rather than the V3 admission-policy change.',
  '',
)
writeFileSync(output, lines.join('\n'))
