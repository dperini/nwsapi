import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface Sample {
  milliseconds: number
}

interface Row {
  variant: string
  case: string
  validation: { valid: boolean }
  samples: Sample[]
  counts: {
    hits: number
    lookups: number
    queryHits: number
    queryLookups: number
    hotQueryHits: number
    hotQueryLookups: number
    compilations: number
    retained: Array<{ entries: number; estimatedBytes: number }>
  }
}

interface Recording {
  recordedAt: string
  node: string
  platform: string
  architecture: string
  cpu: string
  jsdom: string
  baselineRevision: string
  candidateBaseRevision: string
  candidateSourceModified: boolean
  sources: Array<{ name: string; path: string; sha256: string }>
  settings: {
    defaultCacheLimit: number
    defaultCacheBytes: number
    timingSamples: number
  }
  cases: Array<{ name: string }>
  rows: Row[]
}

const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg) {
  throw new Error('Usage: report.mts <recording.json> <report.md>')
}

const input = path.resolve(inputArg)
const output = path.resolve(outputArg)
const data = JSON.parse(readFileSync(input, 'utf8')) as Recording
const median = (row: Row) =>
  row.samples.map(sample => sample.milliseconds).sort((a, b) => a - b)[1]!
const row = (name: string, variant: string) =>
  data.rows.find(item => item.case === name && item.variant === variant)!
const queryHitRate = (item: Row) =>
  `${((100 * item.counts.queryHits) / item.counts.queryLookups).toFixed(1)}%`
const lookupHitRate = (item: Row) =>
  `${((100 * item.counts.hits) / item.counts.lookups).toFixed(1)}%`
const maxFor = (
  variant: string,
  index: number,
  field: 'entries' | 'estimatedBytes',
  bytePressure: boolean,
) => {
  const rows = data.rows.filter(
    item =>
      item.variant === variant &&
      item.case.startsWith('byte-pressure') === bytePressure,
  )
  return Math.max(...rows.map(item => item.counts.retained[index]![field]))
}

for (const item of data.rows) {
  if (!item.validation.valid) {
    throw new Error(
      `Correctness validation failed for ${item.variant}/${item.case}`,
    )
  }
}

const lines = [
  '# V2 selector cache admission measurements',
  '',
  `Recorded ${data.recordedAt} on Node.js ${data.node}, \`jsdom\` ${data.jsdom}, ${data.platform}/${data.architecture} (${data.cpu}). Baseline revision: \`${data.baselineRevision}\`. Candidate base: \`${data.candidateBaseRevision}\`. Candidate source modified: ${data.candidateSourceModified}.`,
  '',
  `Baseline SHA-256: \`${data.sources[0]!.sha256}\`. Candidate SHA-256: \`${data.sources[1]!.sha256}\`. [Full recording](${path.basename(input)}).`,
  '',
  '<details>',
  '<summary>Shared measurement method and cases</summary>',
  '',
  'Each timing sample runs in a fresh process. There are three samples per case and source, and the table reports medians. A separate process validates every match result before timing. Another separate counts process instruments actual `matchResolvers.get()` calls and `Function` construction in the source VM. It checks both exposed caches against their configured entry and byte bounds after each query. No extra cache reads are used to measure hits. Timing excludes validation and counting instrumentation.',
  '',
  'The small warm case makes 64,000 repeated calls over 32 selectors. The exact-cap and overflow cases use 1,000, 1,001, and 2,300 class selectors. The byte-pressure case uses 2,300 complex selectors with a 100,000-entry limit and a 2MiB byte limit. The hot-with-one-offs case mixes 32 warmed selectors with unique selectors. The changed-stylesheet case warms 2,300 old selectors and then repeats 2,300 replacements.',
  '',
  'Query hit rate counts whether the first resolver-cache lookup for each `match()` call found a compiled resolver. Raw lookup hit rate counts individual `matchResolvers.get()` calls. A miss may perform two reads. Ordinary cases use the configured 1,000-entry and 2MiB limits per cache. The byte-pressure case raises only the entry limit to isolate the byte bound.',
  '',
  '</details>',
  '',
  '| Case | Query hit rate, baseline → candidate | Raw lookup hit rate, baseline → candidate | Baseline median | Candidate median | Function constructions baseline → candidate |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
]

for (const { name } of data.cases) {
  const before = row(name, 'baseline')
  const after = row(name, 'candidate')
  lines.push(
    `| ${name} | ${queryHitRate(before)} → ${queryHitRate(after)} | ${lookupHitRate(before)} → ${lookupHitRate(after)} | ${median(before).toFixed(1)}ms | ${median(after).toFixed(1)}ms | ${before.counts.compilations} → ${after.counts.compilations} |`,
  )
}

lines.push(
  '',
  'The exact-cap scan stays fully warm in both versions. Just over the entry cap, sampled admission recovers nearly all query hits and cuts measured `Function` constructions from 10,010 to 11. The 2,300-selector scans improve query hit rates and medians under both entry pressure and byte pressure. The hot subset remains fully cached in the mixed workload. The changed-stylesheet workload trades some cold misses for fewer repeated compilations. Small timing differences are machine-sensitive and should not be generalized beyond these cases.',
  '',
  '| Retained cache | Ordinary maximum entries, baseline → candidate | Ordinary maximum bytes, baseline → candidate | Byte-pressure entries, baseline → candidate | Byte-pressure bytes, baseline → candidate |',
  '| --- | ---: | ---: | ---: | ---: |',
  `| matchResolvers | ${maxFor('baseline', 0, 'entries', false)} → ${maxFor('candidate', 0, 'entries', false)} | ${maxFor('baseline', 0, 'estimatedBytes', false)}B → ${maxFor('candidate', 0, 'estimatedBytes', false)}B | ${maxFor('baseline', 0, 'entries', true)} → ${maxFor('candidate', 0, 'entries', true)} | ${maxFor('baseline', 0, 'estimatedBytes', true)}B → ${maxFor('candidate', 0, 'estimatedBytes', true)}B |`,
  `| matchLambdas | ${maxFor('baseline', 1, 'entries', false)} → ${maxFor('candidate', 1, 'entries', false)} | ${maxFor('baseline', 1, 'estimatedBytes', false)}B → ${maxFor('candidate', 1, 'estimatedBytes', false)}B | ${maxFor('baseline', 1, 'entries', true)} → ${maxFor('candidate', 1, 'entries', true)} | ${maxFor('baseline', 1, 'estimatedBytes', true)}B → ${maxFor('candidate', 1, 'estimatedBytes', true)}B |`,
  '',
  `Values are the largest end-of-run cache sizes across cases in each workload class. The counts process checks each cache against its configured entry and byte bounds after every query. Ordinary cases use ${data.settings.defaultCacheLimit} entries and ${(data.settings.defaultCacheBytes / 1024 / 1024).toFixed(0)}MiB per cache. Byte-pressure measurements use the configured higher entry cap and keep the same byte limit. Estimated bytes are the cache's own accounting, not total process memory.`,
  '',
)
writeFileSync(output, lines.join('\n'))
