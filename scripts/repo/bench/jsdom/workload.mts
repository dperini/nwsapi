import type { Profiler } from 'node:inspector'
import type * as Jsdom from 'jsdom'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { REPO_ROOT } from '../../lib/paths.mts'

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    wpt: { type: 'string' },
    output: { type: 'string' },
    worker: { type: 'string' },
    profile: { type: 'string' },
    trials: { type: 'string', default: '5' },
  },
})
assert(
  values.host && values.wpt,
  'Pass --host <prepared jsdom checkout> and --wpt <pinned WPT directory>',
)
const host = path.resolve(values.host)
const wpt = path.resolve(values.wpt)
const entry = fileURLToPath(import.meta.url)
const candidate = path.join(REPO_ROOT, 'dist/nwsapi.js')
const page = 'dom/ranges/Range-mutations-dataChange.html'
const inputs = [
  page,
  'dom/ranges/Range-mutations.js',
  'dom/common.js',
  'resources/testharness.js',
]
const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const hostRequire = createRequire(path.join(host, 'package.json'))

type HarnessTest = { name: string; status: number; message: string }
type HarnessResult = { tests: number; failures: HarnessTest[]; status: number }
type Sample = {
  engine: string
  range: HarnessResult & { durationMs: number; errors: string[] }
  lifecycle: Record<string, number>
}

export function summarizeProfile(profile: Profiler.Profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const parents = new Map<number, number>()
  for (const node of profile.nodes) {
    for (const child of node.children || []) {
      parents.set(child, node.id)
    }
  }
  const samples = profile.samples || []
  const deltas = profile.timeDeltas || []
  const self = new Map<string, number>()
  let total = 0
  let selector = 0
  for (let i = 0; i < samples.length; i++) {
    const delta = deltas[i] || 0
    total += delta
    let id: number | undefined = samples[i]!
    const frame = nodes.get(id)!.callFrame
    const key = frame.functionName + ' (' + path.basename(frame.url) + ')'
    self.set(key, (self.get(key) || 0) + delta)
    while (id !== undefined) {
      const url = nodes.get(id)!.callFrame.url
      if (
        url.includes('/dom-selector/') ||
        url.endsWith('/dist/nwsapi.js') ||
        url.endsWith('/dist/adapter/dom-selector.js')
      ) {
        selector += delta
        break
      }
      id = parents.get(id)
    }
  }
  return {
    totalSampleMs: total / 1000,
    selectorInclusivePercent: (selector / total) * 100,
    topSelfSamples: Array.from(self)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, time]) => ({ name, percent: (time / total) * 100 })),
  }
}

if (values.worker) {
  assert(
    ['baseline', 'candidate'].includes(values.worker),
    'Unknown worker engine',
  )
  if (values.worker === 'candidate') {
    const modulePath = hostRequire.resolve('@asamuzakjp/dom-selector')
    hostRequire(modulePath)
    hostRequire.cache[modulePath]!.exports = hostRequire(candidate)
  }
  const { JSDOM, requestInterceptor, VirtualConsole } = hostRequire(
    './lib/api.js',
  ) as typeof Jsdom
  const errors: string[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => errors.push(error.message))
  let complete!: (result: HarnessResult) => void
  const completed = new Promise<HarnessResult>(resolve => {
    complete = resolve
  })
  const session = new Session()
  if (values.profile) {
    session.connect()
    await session.post('Profiler.enable')
    await session.post('Profiler.start')
  }
  const started = performance.now()
  const dom = new JSDOM(readFileSync(path.join(wpt, page), 'utf8'), {
    url: 'https://wpt.invalid/' + page,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    resources: {
      interceptors: [
        requestInterceptor(request => {
          const url = new URL(request.url)
          assert.equal(
            url.origin,
            'https://wpt.invalid',
            'The workload must not access the network',
          )
          if (url.pathname === '/resources/testharnessreport.js') {
            return new Response(
              'add_completion_callback((tests, status) => window.report(tests, status));',
            )
          }
          assert(
            inputs.includes(url.pathname.slice(1)),
            'Unexpected workload resource: ' + url.pathname,
          )
          return new Response(readFileSync(path.join(wpt, url.pathname)))
        }),
      ],
    },
    beforeParse(window) {
      window['report'] = (
        tests: HarnessTest[],
        harnessStatus: { status: number },
      ) =>
        complete({
          tests: tests.length,
          failures: Array.from(tests)
            .filter(test => test.status !== 0)
            .map(({ name, status, message }) => ({ name, status, message })),
          status: harnessStatus.status,
        })
    },
  })
  const result = await completed
  const durationMs = performance.now() - started
  if (values.profile) {
    const { profile } = await session.post('Profiler.stop')
    writeFileSync(values.profile, JSON.stringify(profile))
    writeFileSync(
      values.profile + '.summary.json',
      JSON.stringify(summarizeProfile(profile), null, 2) + '\n',
    )
    session.disconnect()
  }
  dom.window.close()
  assert.equal(result.status, 0, 'WPT harness failed')
  assert.equal(result.tests, 2808, 'The pinned workload changed')
  assert.deepEqual(result.failures, [])
  assert.deepEqual(errors, [])

  // Documents, first queries, warm queries, and disposal have separate timers.
  const worlds: Jsdom.JSDOM[] = []
  const html =
    '<!doctype html><main>' +
    '<section class="row"><span></span><input></section>'.repeat(100) +
    '</main>'
  const count = 40
  global.gc!()
  const heapBefore = process.memoryUsage().heapUsed
  let start = performance.now()
  for (let i = 0; i < count; i++) {
    worlds.push(new JSDOM(html))
  }
  const constructionMs = (performance.now() - start) / count
  global.gc!()
  const constructedHeapBytes =
    (process.memoryUsage().heapUsed - heapBefore) / count
  start = performance.now()
  for (let i = 0; i < count; i++) {
    assert.equal(
      worlds[i]!.window.document.querySelectorAll('.row > span').length,
      100,
    )
  }
  const firstQueryMs = (performance.now() - start) / count
  start = performance.now()
  for (let i = 0; i < count; i++) {
    for (let query = 0; query < 100; query++) {
      assert.equal(
        worlds[i]!.window.document.querySelectorAll('.row > span').length,
        100,
      )
    }
  }
  const warmQueryMs = (performance.now() - start) / (count * 100)
  global.gc!()
  const queriedHeapBytes = (process.memoryUsage().heapUsed - heapBefore) / count
  start = performance.now()
  for (let i = 0; i < count; i++) {
    worlds[i]!.window.close()
  }
  worlds.length = 0
  const closeMs = (performance.now() - start) / count
  // Let queued observer and window cleanup work finish before collecting.
  await new Promise<void>(resolve => setImmediate(resolve))
  global.gc!()
  const afterCloseHeapBytes =
    (process.memoryUsage().heapUsed - heapBefore) / count
  console.log(
    JSON.stringify({
      engine: values.worker,
      range: { ...result, durationMs, errors },
      lifecycle: {
        constructionMs,
        firstQueryMs,
        warmQueryMs,
        closeMs,
        constructedHeapBytes,
        queriedHeapBytes,
        afterCloseHeapBytes,
      },
    } satisfies Sample),
  )
} else {
  const trials = Number(values.trials)
  assert(Number.isInteger(trials) && trials >= 3, 'Use at least three trials')
  const samples: Sample[] = []
  for (let trial = 0; trial < trials; trial++) {
    const order =
      trial % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
    for (const engine of order) {
      const output = execFileSync(
        process.execPath,
        [
          '--expose-gc',
          entry,
          '--host',
          host,
          '--wpt',
          wpt,
          '--worker',
          engine!,
        ],
        { encoding: 'utf8', timeout: 120_000 },
      )
      samples.push(JSON.parse(output) as Sample)
      console.error('Completed trial ' + (trial + 1) + ': ' + engine)
    }
  }
  const summary = (numbers: number[]) => {
    const sorted = numbers.toSorted((a, b) => a - b)
    const mean =
      numbers.reduce((total, number) => total + number, 0) / numbers.length
    return {
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      standardDeviation: Math.sqrt(
        numbers.reduce((total, number) => total + (number - mean) ** 2, 0) /
          (numbers.length - 1),
      ),
    }
  }
  const engines = Object.fromEntries(
    ['baseline', 'candidate'].map(engine => {
      const selected = samples.filter(sample => sample.engine === engine)
      return [
        engine,
        {
          rangeMs: summary(selected.map(sample => sample.range.durationMs)),
          lifecycle: Object.fromEntries(
            Object.keys(selected[0]!.lifecycle).map(key => [
              key,
              summary(selected.map(sample => sample.lifecycle[key]!)),
            ]),
          ),
        },
      ]
    }),
  )
  const profiles: Record<string, ReturnType<typeof summarizeProfile>> = {}
  if (values.profile) {
    for (const engine of ['baseline', 'candidate']) {
      const profilePath = values.profile + '.' + engine + '.cpuprofile'
      execFileSync(
        process.execPath,
        [
          '--expose-gc',
          entry,
          '--host',
          host,
          '--wpt',
          wpt,
          '--worker',
          engine,
          '--profile',
          profilePath,
        ],
        { encoding: 'utf8', timeout: 120_000 },
      )
      profiles[engine] = JSON.parse(
        readFileSync(profilePath + '.summary.json', 'utf8'),
      ) as ReturnType<typeof summarizeProfile>
    }
  }
  const report = {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    hostRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: host,
      encoding: 'utf8',
    }).trim(),
    hostLockHash: hash(path.join(host, 'package-lock.json')),
    baselinePackage: hostRequire('@asamuzakjp/dom-selector/package.json')
      .version as string,
    candidateHash: hash(candidate),
    inputHashes: Object.fromEntries(
      inputs.map(input => [input, hash(path.join(wpt, input))]),
    ),
    methods:
      'Fresh processes in alternating order. Range includes harness execution and assertions. Lifecycle includes host documents and public DOM queries. Heap figures are full JavaScript heap deltas, not isolated engine allocation. CPU-profile runs are separate.',
    profiles,
    trials,
    engines,
    samples,
  }
  const output =
    values.output ||
    path.join(REPO_ROOT, 'assets/repo/bench/jsdom-workload.json')
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(output)
}
