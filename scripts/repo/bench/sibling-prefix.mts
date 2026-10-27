import { pathToFileURL } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const baselinePath = process.argv[2]
if (!baselinePath) {
  throw new Error(
    'Pass the baseline dist/nwsapi.js path as the first argument.',
  )
}
const baselineModule = await import(pathToFileURL(resolve(baselinePath)).href)
const currentModule = await import(
  pathToFileURL(resolve('dist/nwsapi.js')).href
)
const cases = [
  { name: 'tiny-negative-2', n: 2, left: -1, candidates: 1 },
  { name: 'tiny-positive-2', n: 2, left: 0, candidates: 1 },
  { name: 'tiny-negative-4', n: 4, left: -1, candidates: 2 },
  { name: 'tiny-positive-4', n: 4, left: 0, candidates: 2 },
  { name: 'small-negative-16', n: 16, left: -1, candidates: 16 },
  { name: 'wide-negative-128', n: 128, left: -1, candidates: 128 },
  { name: 'wide-negative-512', n: 512, left: -1, candidates: 512 },
  { name: 'wide-negative-1024', n: 1024, left: -1, candidates: 1024 },
  { name: 'wide-positive-1024', n: 1024, left: 0, candidates: 1024 },
  { name: 'sparse-candidate-1024', n: 1024, left: -1, candidates: 1 },
  { name: 'sparse-candidate-positive-1024', n: 1024, left: 0, candidates: 1 },
  { name: 'few-candidates-1024', n: 1024, left: 512, candidates: 4 },
  {
    name: 'many-parents-one-candidate',
    n: 2,
    left: 0,
    candidates: 1,
    parents: 256,
  },
]
const results = []
for (const workload of cases) {
  const parents = workload.parents ?? 1
  const html =
    '<main>' +
    Array.from(
      { length: parents },
      () =>
        '<section>' +
        Array.from({ length: workload.n }, (_, index) => {
          const stride = Math.ceil(workload.n / workload.candidates)
          const candidate = index % stride === stride - 1
          const left = index === workload.left
          return `<i${left ? ' data-a=""' : ''}${candidate ? ' class="b"' : ''}></i>`
        }).join('') +
        '</section>',
    ).join('') +
    '</main>'
  const { window } = new JSDOM(html)
  const root = window.document.querySelector('main')!
  const engines = {
    baseline: baselineModule.default(window),
    optimized: currentModule.default(window),
  }
  const run = (engine: ReturnType<typeof engines.baseline>) =>
    engine.select('[data-a] ~ .b', root)
  const baselineResults = run(engines.baseline)
  const optimizedResults = run(engines.optimized)
  assert.deepEqual(
    optimizedResults,
    baselineResults,
    `Result mismatch for ${workload.name}`,
  )
  const count = baselineResults.length
  const timings = { baseline: [] as number[], optimized: [] as number[] }
  for (let warmup = 0; warmup < 10; warmup++) {
    run(engines.baseline)
    run(engines.optimized)
  }
  for (let repetition = 0; repetition < 9; repetition++) {
    const order =
      repetition % 2 ? ['optimized', 'baseline'] : ['baseline', 'optimized']
    for (const name of order as Array<keyof typeof timings>) {
      const start = performance.now()
      for (let iteration = 0; iteration < 5; iteration++) {
        run(engines[name])
      }
      timings[name].push((performance.now() - start) / 5)
    }
  }
  const prototype = window.Element.prototype
  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    'previousElementSibling',
  )!
  let previousReads = 0
  Object.defineProperty(prototype, 'previousElementSibling', {
    configurable: true,
    get() {
      previousReads++
      return descriptor.get!.call(this)
    },
  })
  run(engines.baseline)
  const baseline_previous_sibling_reads = previousReads
  previousReads = 0
  run(engines.optimized)
  const optimized_previous_sibling_reads = previousReads
  Object.defineProperty(prototype, 'previousElementSibling', descriptor)
  const median = (values: number[]) =>
    values.toSorted((left, right) => left - right)[
      Math.floor(values.length / 2)
    ]!
  results.push({
    ...workload,
    result_count: count,
    baseline_previous_sibling_reads,
    optimized_previous_sibling_reads,
    baseline_ms_median: median(timings.baseline),
    optimized_ms_median: median(timings.optimized),
    timings_ms: timings,
  })
  window.close()
}
const output = resolve(
  'assets/repo/bench/sibling-prefix/2026-10-27/public-select.json',
)
await writeFile(
  output,
  JSON.stringify(
    {
      baseline_commit: '636e604952c83fe721e6bda87d624ebe29550967',
      runtime: process.version,
      platform: `${process.platform}-${process.arch}`,
      selector: '[data-a] ~ .b',
      context: 'main element containing one or more section elements',
      optimized_build: 'dist/nwsapi.js from this worktree',
      baseline_sha256: createHash('sha256')
        .update(await readFile(baselinePath))
        .digest('hex'),
      optimized_sha256: createHash('sha256')
        .update(await readFile('dist/nwsapi.js'))
        .digest('hex'),
      methodology:
        '10 warmups per version; 9 alternating paired rounds; each sample is 5 selects, reported as median milliseconds per select.',
      cases: results,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify(
    results.map(({ name, baseline_ms_median, optimized_ms_median }) => ({
      name,
      baseline_ms_median,
      optimized_ms_median,
    })),
    null,
    2,
  ),
)
