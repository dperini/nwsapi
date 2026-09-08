import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

interface Profile {
  engineSha256: string
  node?: string
  browser?: string
  count?: number
  queries?: number
  iterations?: number
  method?: string
  sampling?: Record<string, number | boolean>
  compilerSampledBytes?: number
  compilerBytesPerCall?: number
  measurements?: Record<string, number>
}
interface Experiment {
  baselineRevision: string
  candidateRevision: string
  before?: Profile | Profile[]
  after?: Profile | Profile[]
}
interface Observations {
  measuredAt: string
  platform: string
  notes: string[]
  experiments: Record<string, Experiment>
}
const { values } = parseArgs({ options: { check: { type: 'boolean' } } })
const input = new URL(
  '../../../assets/repo/bench/memory-observations.json',
  import.meta.url,
)
const output = new URL(
  '../../../assets/repo/bench/memory-performance.json',
  import.meta.url,
)
const source = readFileSync(input, 'utf8')
const observations: Observations = JSON.parse(source)
function median(samples: number[]) {
  if (!samples.length || samples.some(value => !Number.isFinite(value))) {
    throw new Error('Expected finite measurement samples')
  }
  const sorted = samples.toSorted((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}
function metric(before: number[], after: number[]) {
  const baseline = median(before)
  const candidate = median(after)
  return {
    before: baseline,
    after: candidate,
    reductionPercent: baseline > 0 ? (1 - candidate / baseline) * 100 : null,
  }
}
function heapMetrics(profile: Profile) {
  const { measurements, count, queries } = profile
  if (!measurements || !count || !queries) {
    throw new Error('Missing heap workload')
  }
  const { baseline, instances, cached } = measurements
  if (
    baseline === undefined ||
    instances === undefined ||
    cached === undefined
  ) {
    throw new Error('Missing heap phase')
  }
  return {
    idleBytesPerEngine: (instances - baseline) / count,
    addedBytesPerCachedSelector: (cached - instances) / (count * queries),
    engineAndCacheBytes: cached - baseline,
  }
}
const comparisons = []
const additionalEvidence: string[] = []
for (const [name, experiment] of Object.entries(observations.experiments)) {
  const { before, after } = experiment
  if (!before || !after) {
    additionalEvidence.push(name)
    continue
  }
  const baseline = Array.isArray(before) ? before : [before]
  const candidate = Array.isArray(after) ? after : [after]
  const first = baseline[0]!
  const last = candidate[0]!
  let metrics: Record<string, ReturnType<typeof metric>>
  if (first.measurements && last.measurements) {
    const a = heapMetrics(first)
    const b = heapMetrics(last)
    metrics = Object.fromEntries(
      Object.entries(a).map(([key, value]) => [
        key,
        metric([value], [b[key as keyof typeof b]]),
      ]),
    )
  } else if (
    first.compilerBytesPerCall !== undefined &&
    last.compilerBytesPerCall !== undefined
  ) {
    metrics = {
      sampledCompilerBytesPerCall: metric(
        baseline.map(
          sample => sample.compilerSampledBytes! / sample.iterations!,
        ),
        candidate.map(
          sample => sample.compilerSampledBytes! / sample.iterations!,
        ),
      ),
    }
  } else {
    additionalEvidence.push(name)
    continue
  }
  const workload = (profile: Profile) =>
    JSON.stringify({
      node: profile.node,
      browser: profile.browser,
      count: profile.count,
      queries: profile.queries,
      iterations: profile.iterations,
      method: profile.measurements
        ? (profile.method ?? (profile.browser ? 'select-and-first' : 'select'))
        : undefined,
      sampling: profile.sampling,
    })
  if (
    [...baseline, ...candidate].some(
      profile => workload(profile) !== workload(first),
    )
  ) {
    throw new Error(`Incompatible measurement workloads: ${name}`)
  }
  comparisons.push({
    name,
    baselineRevision: experiment.baselineRevision,
    candidateRevision: experiment.candidateRevision,
    baselineEngineSha256: first.engineSha256,
    candidateEngineSha256: last.engineSha256,
    baselineRuntime: first.node ?? first.browser,
    candidateRuntime: last.node ?? last.browser,
    count: first.count,
    queries: first.queries,
    iterations: first.iterations,
    baselineSamples: baseline.length,
    candidateSamples: candidate.length,
    metrics,
  })
}
const report = {
  generatedBy: 'pnpm run gen:memory',
  source: 'memory-observations.json',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  measuredAt: observations.measuredAt,
  platform: observations.platform,
  notes: [
    ...observations.notes,
    'Derived comparisons are generated from recorded observations, not fresh benchmark runs.',
    'Allocation metrics are sampled estimates. Positive reductionPercent means fewer bytes.',
    'Timing and eviction evidence remains in the source observations under additionalEvidence keys.',
  ],
  comparisons,
  additionalEvidence,
}
const content = JSON.stringify(report, null, 2) + '\n'
if (values.check) {
  if (readFileSync(output, 'utf8') !== content) {
    throw new Error('Memory report is stale. Run pnpm run gen:memory.')
  }
} else {
  writeFileSync(output, content)
}
