import type * as Jsdom from 'jsdom'
import type EngineFactory from '../../../dist/nwsapi.js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { median } from './timing.mts'

type Row = {
  shape: string
  scope: string
  selector: string
  matches: number
  firstMs: number
  warmMs: number
  mutationMs: number | null
  mutationCorrect: boolean
  unnotifiedMutationCorrect: boolean
  profile?: Array<{ frame: string; samples: number }>
}

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    engine: { type: 'string' },
    route: { type: 'string' },
    profile: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: 'assets/repo/bench/complex-selectors.json',
    },
  },
})
assert(values.host, 'Pass --host <prepared jsdom checkout>')
const host = path.resolve(values.host)
const hostRequire = createRequire(path.join(host, 'package.json'))
const candidate = fileURLToPath(
  new URL('../../../dist/nwsapi.js', import.meta.url),
)
const entry = fileURLToPath(import.meta.url)
const selectors = [
  '.box:first-child ~ .box:nth-of-type(4n) + .box .block.inner > .content',
  '.box .block.inner > .content',
]
const shapes = [
  { name: 'original', boxes: 5, outer: 5, inner: 5, depth: 0, mixed: false },
  { name: 'wide', boxes: 64, outer: 2, inner: 2, depth: 0, mixed: false },
  { name: 'deep', boxes: 16, outer: 2, inner: 2, depth: 8, mixed: false },
  { name: 'mixed', boxes: 16, outer: 2, inner: 2, depth: 0, mixed: true },
]

if (values.engine) {
  assert(['baseline', 'candidate'].includes(values.engine))
  assert(['direct', 'host'].includes(values.route!))
  const baseline = hostRequire('@asamuzakjp/dom-selector')
  const factory = hostRequire(candidate) as typeof EngineFactory
  if (values.engine === 'candidate' && values.route === 'host') {
    hostRequire.cache[
      hostRequire.resolve('@asamuzakjp/dom-selector')
    ]!.exports = factory
  }
  const { JSDOM } = hostRequire('./lib/api.js') as typeof Jsdom
  const rows = []
  for (const shape of shapes) {
    const { window } = new JSDOM('<!doctype html><body></body>')
    try {
      const doc = window.document
      const contents: Element[][] = []
      for (let i = 0; i < shape.boxes; ++i) {
        const box = doc.createElement('div')
        box.className = 'box container'
        doc.body.append(box)
        if (shape.mixed) {
          doc.body.append(doc.createTextNode('gap'), doc.createComment('gap'))
        }
        let parent: Element = box
        for (let depth = 0; depth < shape.depth; ++depth) {
          const wrapper = doc.createElement('section')
          parent.append(wrapper)
          parent = wrapper
        }
        const items: Element[] = []
        for (let j = 0; j < shape.outer; ++j) {
          const outer = doc.createElement('div')
          outer.className = 'block outer'
          parent.append(outer)
          for (let k = 0; k < shape.inner; ++k) {
            const inner = doc.createElement('div')
            inner.className = 'block inner'
            const content = doc.createElement('p')
            content.className = 'content'
            inner.append(content)
            outer.append(inner)
            items.push(content)
          }
        }
        contents.push(items)
      }
      const engine: {
        clear?: () => void
        querySelectorAll: (
          selector: string,
          root: Document | Element,
        ) => ArrayLike<Element>
      } | null =
        values.route === 'host'
          ? null
          : values.engine === 'candidate'
            ? { querySelectorAll: factory(window).select }
            : new baseline.DOMSelector(window)
      for (const scope of ['document', 'element'] as const) {
        const root = scope === 'document' ? doc : doc.body
        for (let index = 0; index < selectors.length; ++index) {
          const selector = selectors[index]!
          const expected = contents.flatMap((items, i) =>
            index === 1 || (i >= 4 && i % 4 === 0) ? items : [],
          )
          const query = (): ArrayLike<Element> =>
            values.route === 'host'
              ? root.querySelectorAll(selector)
              : engine!.querySelectorAll(selector, root)
          const check = (actual: ArrayLike<Element>) => {
            assert.equal(actual.length, expected.length)
            for (let i = 0; i < expected.length; ++i) {
              assert.equal(actual[i], expected[i])
            }
          }
          const started = performance.now()
          const first = query()
          const firstMs = performance.now() - started
          check(first)
          for (let i = 0; i < 30; ++i) {
            check(query())
          }
          const iterations = 200
          let result
          const warmStart = performance.now()
          for (let i = 0; i < iterations; ++i) {
            result = query()
          }
          const warmMs = (performance.now() - warmStart) / iterations
          check(result!)
          const changed = expected[0]!
          changed.className = ''
          const removed = query()
          let mutationCorrect = removed.length === expected.length - 1
          for (let i = 0; i < removed.length; ++i) {
            mutationCorrect &&= removed[i] === expected[i + 1]
          }
          const unnotifiedMutationCorrect = mutationCorrect
          engine?.clear?.()
          const notified = query()
          mutationCorrect = notified.length === expected.length - 1
          for (let i = 0; i < notified.length; ++i) {
            mutationCorrect &&= notified[i] === expected[i + 1]
          }
          changed.className = 'content'
          engine?.clear?.()
          check(query())
          const mutationStart = performance.now()
          for (let i = 0; i < iterations; ++i) {
            changed.className = i % 2 ? 'content' : ''
            engine?.clear?.()
            result = query()
            mutationCorrect &&=
              result.length === expected.length - (i % 2 ? 0 : 1)
          }
          const mutationMs = mutationCorrect
            ? (performance.now() - mutationStart) / iterations
            : null
          if (values.engine === 'candidate') {
            assert(
              mutationCorrect,
              `Candidate mutation failed: ${shape.name} ${scope} ${selector}`,
            )
          }
          check(result!)
          let profile
          if (
            values.profile &&
            shape.name === 'wide' &&
            scope === 'document' &&
            index === 0
          ) {
            const session = new Session()
            session.connect()
            await session.post('Profiler.enable')
            await session.post('Profiler.start')
            for (let i = 0; i < 1000; ++i) {
              query()
            }
            const captured = await session.post('Profiler.stop')
            session.disconnect()
            const nodes = new Map(
              captured.profile.nodes.map(node => [node.id, node.callFrame]),
            )
            const counts = new Map<string, number>()
            for (const id of captured.profile.samples || []) {
              const frame = nodes.get(id)!
              const name = `${frame.functionName || '(anonymous)'} (${path.basename(frame.url)}:${frame.lineNumber + 1})`
              counts.set(name, (counts.get(name) || 0) + 1)
            }
            profile = Array.from(counts)
              .toSorted((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([frame, samples]) => ({ frame, samples }))
          }
          rows.push({
            shape: shape.name,
            scope,
            selector,
            matches: expected.length,
            firstMs,
            warmMs,
            mutationMs,
            mutationCorrect,
            unnotifiedMutationCorrect,
            ...(profile ? { profile } : {}),
          })
        }
      }
    } finally {
      window.close()
    }
  }
  console.log(JSON.stringify(rows))
} else {
  const runs: Array<{
    trial: number
    engine: string | undefined
    route: string | undefined
    rows: Row[]
  }> = []
  const variants = [
    ['baseline', 'direct'],
    ['candidate', 'direct'],
    ['baseline', 'host'],
    ['candidate', 'host'],
  ]
  for (let trial = 0; trial < 5; ++trial) {
    for (let offset = 0; offset < variants.length; ++offset) {
      const [engine, route] = variants[(trial + offset) % variants.length]!
      const rows = JSON.parse(
        execFileSync(
          process.execPath,
          [entry, '--host', host, '--engine', engine!, '--route', route!],
          { encoding: 'utf8' },
        ),
      )
      runs.push({ trial, engine, route, rows })
    }
  }
  const profiles = []
  for (const engine of ['baseline', 'candidate']) {
    profiles.push({
      engine,
      rows: JSON.parse(
        execFileSync(
          process.execPath,
          [
            entry,
            '--host',
            host,
            '--engine',
            engine,
            '--route',
            'host',
            '--profile',
          ],
          { encoding: 'utf8' },
        ),
      ).filter((row: { profile?: unknown }) => row.profile),
    })
  }
  const summaries = runs[0]!.rows.map(
    (row: { shape: string; scope: string; selector: string }) => ({
      ...row,
      measurements: variants.map(([engine, route]) => {
        const samples = runs
          .filter(run => run.engine === engine && run.route === route)
          .map(run =>
            run.rows.find(
              (item: typeof row) =>
                item.shape === row.shape &&
                item.scope === row.scope &&
                item.selector === row.selector,
            ),
          )
        return {
          engine,
          route,
          firstMs: median(samples.map(sample => sample!.firstMs)),
          warmMs: median(samples.map(sample => sample!.warmMs)),
          mutationMs: samples.every(sample => sample!.mutationCorrect)
            ? median(samples.map(sample => sample!.mutationMs!))
            : null,
          mutationCorrect: samples.every(sample => sample!.mutationCorrect),
        }
      }),
    }),
  )
  const hash = (file: string) =>
    createHash('sha256').update(readFileSync(file)).digest('hex')
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        architecture: process.arch,
        hostRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: host,
          encoding: 'utf8',
        }).trim(),
        hostLockSha256: hash(path.join(host, 'package-lock.json')),
        baselinePackage: hostRequire('@asamuzakjp/dom-selector/package.json')
          .version,
        candidateSha256: hash(candidate),
        fixtureScriptSha256: hash(entry),
        methodology:
          'Five fresh worker processes per engine and route, rotating order. Each worker checks ordered identity against fixture-derived expected nodes. First calls are timed separately, followed by 30 warmups and batches of 200 queries. Element-scope first calls occur after document-scope calls and are not cold compilation measurements. Host means public jsdom querySelectorAll with its selector dependency replaced only for the candidate. The direct baseline receives its public clear() notification after mutations, matching the host integration contract. Unnotified mutation checks are retained separately. Mutation batches toggle one matching class and include the mutation, cache notification, query, and length check. Invalid mutation results receive no timing result. Separate host CPU profiles sample 1000 wide complex queries. No rendering is measured.',
        shapes,
        summaries,
        runs,
        profiles,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`Wrote ${values.output}`)
}
