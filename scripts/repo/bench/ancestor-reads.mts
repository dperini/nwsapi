import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { createPrefixVariants } from './ancestor-prefix.mts'
import { median } from './timing.mts'
import { profileAncestorMemory } from './ancestor-memory.mts'

const { values } = parseArgs({
  options: {
    prefix: { type: 'boolean', default: false },
    memory: { type: 'boolean', default: false },
    classes: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: 'assets/repo/bench/ancestor-reads.json',
    },
  },
})
const names = values.prefix
  ? ['baseline', 'split-prefix', 'cached-prefix']
  : ['baseline', 'always-cache', 'depth-gated']
const shapes = [
  { name: 'original', boxes: 5, outer: 5, inner: 5, depths: [0] },
  { name: 'wide', boxes: 64, outer: 2, inner: 2, depths: [0] },
  { name: 'deep', boxes: 16, outer: 2, inner: 2, depths: [8] },
  {
    name: 'mixed-shallow-first',
    boxes: 16,
    outer: 2,
    inner: 2,
    depths: [0, 8],
  },
  { name: 'mixed-deep-first', boxes: 16, outer: 2, inner: 2, depths: [8, 0] },
]
const selectors = [
  '.box:first-child ~ .box:nth-of-type(4n) + .box .block.inner > .content',
  '.box .block.inner > .content',
]
const rows = []
for (const shape of shapes) {
  const { window } = new JSDOM('<!doctype html><body></body>')
  try {
    const doc = window.document
    for (let i = 0; i < shape.boxes; ++i) {
      const box = doc.createElement('div')
      box.className = 'box container'
      doc.body.append(box)
      let parent: Element = box
      for (
        let depth = 0;
        depth < shape.depths[i % shape.depths.length]!;
        ++depth
      ) {
        const wrapper = doc.createElement('section')
        parent.append(wrapper)
        parent = wrapper
      }
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
        }
      }
    }
    const engine = factory(window)
    const snapshot = engine.Snapshot as typeof engine.Snapshot & {
      classOf(element: Element): string | null
    }
    const candidates = Array.from(doc.getElementsByClassName('content'))
    type Record = { parent: Element | null; cls: string | null }
    const record = (element: Element, cache: WeakMap<Element, Record>) => {
      let row = cache.get(element)
      if (!row) {
        row = {
          parent: element.parentElement,
          cls: snapshot.classOf(element),
        }
        cache.set(element, row)
      }
      return row
    }
    const classRead = (
      element: Element,
      cache: WeakMap<Element, string | null>,
    ) => {
      let value = cache.get(element)
      if (value === undefined) {
        value = snapshot.classOf(element)
        cache.set(element, value)
      }
      return value
    }
    const depthCache = (nodes: Element[]) => {
      if (nodes.length < 16) {
        return null
      }
      let element: Element | null = nodes[0]!
      for (let i = 0; i < 8; ++i) {
        element = element.parentElement
        if (!element) {
          return null
        }
      }
      return new WeakMap<Element, Record>()
    }
    for (const selector of selectors) {
      const baseline = engine.compile(selector, true)!
      const source = baseline.toString()
      // These fixed fixtures contain no strings or escaped identifiers.
      // Rewrite only known generated reads for an experiment, never production.
      assert(
        source.includes('var e,') &&
          source.includes('s.classOf(e)') &&
          source.includes('e.parentElement'),
      )
      const variants: Array<
        (
          candidates: Element[],
          callback: null,
          context: Document,
          results: Element[],
        ) => unknown
      > = [baseline]
      if (values.prefix) {
        const suffixText = ' .block.inner > .content'
        assert(selector.endsWith(suffixText))
        type Match = (
          element: Element,
          callback: null,
          context: Document,
          result: boolean,
        ) => boolean
        const prefixMatch = engine.compile(
          selector.slice(0, -suffixText.length),
          false,
        ) as unknown as Match
        const suffixMatch = engine.compile(
          suffixText.trim(),
          false,
        ) as unknown as Match
        variants.push(
          ...createPrefixVariants(
            element => prefixMatch(element, null, doc, false),
            element => suffixMatch(element, null, doc, false),
          ),
        )
      } else {
        for (const gated of [false, true]) {
          const changed = source
            .replace(
              'var e,',
              () =>
                `var _cache=${gated ? 'depthCache(c)' : 'new WeakMap()'},e,`,
            )
            .replaceAll(
              'e.parentElement',
              values.classes
                ? 'e.parentElement'
                : gated
                  ? '(_cache?record(e,_cache).parent:e.parentElement)'
                  : 'record(e,_cache).parent',
            )
            .replaceAll(
              's.classOf(e)',
              values.classes
                ? gated
                  ? '(_cache?classRead(e,_cache):s.classOf(e))'
                  : 'classRead(e,_cache)'
                : gated
                  ? '(_cache?record(e,_cache).cls:s.classOf(e))'
                  : 'record(e,_cache).cls',
            )
          variants.push(
            // oxlint-disable-next-line typescript/no-implied-eval -- Fixed experimental resolver code, checked against the unchanged engine.
            Function(
              's',
              'a',
              'record',
              'depthCache',
              'classRead',
              'return ' + changed,
            )(engine.Snapshot, undefined, record, depthCache, classRead),
          )
        }
      }
      const query = (index: number) =>
        variants[index]!(candidates, null, doc, []) as Element[]
      const expected = Array.from(doc.querySelectorAll(selector))
      const check = (result: Element[], wanted = expected) => {
        assert.equal(result.length, wanted.length)
        for (let i = 0; i < result.length; ++i) {
          assert.equal(result[i], wanted[i])
        }
      }
      for (let index = 0; index < variants.length; ++index) {
        check(query(index))
        for (let i = 0; i < 30; ++i) {
          query(index)
        }
      }
      const timings: number[][] = [[], [], []]
      for (let round = 0; round < 7; ++round) {
        for (let offset = 0; offset < variants.length; ++offset) {
          const index = (round + offset) % variants.length
          const start = performance.now()
          let result: Element[] = []
          for (let i = 0; i < 300; ++i) {
            result = query(index)
          }
          timings[index]!.push((performance.now() - start) / 300)
          check(result)
        }
      }
      const memory = values.memory
        ? await profileAncestorMemory(query, names)
        : undefined
      const counts: Array<{ parentReads: number; classReads: number }> = []
      const parentDescriptor = Object.getOwnPropertyDescriptor(
        window.Node.prototype,
        'parentElement',
      )!
      const classDescriptor = Object.getOwnPropertyDescriptor(
        window.Element.prototype,
        'className',
      )!
      let parentReads = 0
      let classReads = 0
      try {
        Object.defineProperty(window.Node.prototype, 'parentElement', {
          ...parentDescriptor,
          get() {
            ++parentReads
            return parentDescriptor.get!.call(this)
          },
        })
        Object.defineProperty(window.Element.prototype, 'className', {
          ...classDescriptor,
          get() {
            ++classReads
            return classDescriptor.get!.call(this)
          },
        })
        for (let index = 0; index < variants.length; ++index) {
          parentReads = 0
          classReads = 0
          const result = query(index)
          counts.push({ parentReads, classReads })
          check(result)
        }
      } finally {
        Object.defineProperty(
          window.Node.prototype,
          'parentElement',
          parentDescriptor,
        )
        Object.defineProperty(
          window.Element.prototype,
          'className',
          classDescriptor,
        )
      }
      const target = candidates[0]!.parentElement!
      target.className = 'block'
      const mutated = Array.from(doc.querySelectorAll(selector))
      for (let index = 0; index < variants.length; ++index) {
        check(query(index), mutated)
      }
      target.className = 'block inner'
      const box = target.closest('.box')!
      const boxClass = box.className
      box.className = ''
      const prefixMutated = Array.from(doc.querySelectorAll(selector))
      for (let index = 0; index < variants.length; ++index) {
        check(query(index), prefixMutated)
      }
      box.className = boxClass
      candidates.reverse()
      for (let index = 0; index < variants.length; ++index) {
        check(query(index), expected.toReversed())
      }
      candidates.reverse()
      rows.push({
        shape: shape.name,
        selector,
        candidates: candidates.length,
        matches: expected.length,
        variants: names.map((name, index) => ({
          name,
          medianMs: median(timings[index]!),
          samplesMs: timings[index],
          ...counts[index],
        })),
        mutationCorrect: true,
        prefixMutationCorrect: true,
        reversedOrderCorrect: true,
        memory,
      })
    }
  } finally {
    window.close()
  }
}
writeFileSync(
  values.output,
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      engineSha256: createHash('sha256')
        .update(readFileSync('dist/nwsapi.js'))
        .digest('hex'),
      methodology:
        'Experimental compiled-resolver comparison only. Three rotating variants, seven rounds, 30 warmups and 300 calls per timed batch. Candidate lookup and compilation are outside timers. Parent/class counts run separately from timing. Node identity, order, and mutation results are checked outside timers. No production engine change, integrated host timing, or rendering. Optional memory profiling runs separately and is described in memoryMethodology. The depth gate uses the first candidate and requires 16 candidates and eight parents. These are experimental thresholds, not a recommended policy.',
      cachePayload: values.prefix
        ? 'Ancestor-prefix boolean results. Per-query weak map and reusable path array. No depth gate.'
        : values.classes
          ? 'Class value only. Parent reads remain direct.'
          : 'Parent and class record.',
      memoryMethodology: values.memory
        ? 'Node inspector allocation sampling includes collected objects at a 1024byte interval. Three rounds rotate variant order. Retained heap is measured before and after two batches of 2000 calls without allocation sampling. A separate sample then covers 2000 warm compiled-resolver calls. Four GCs across event-loop turns precede whole-process heapUsed readings. Profiler structures and report storage can affect retained readings. Candidate lookup, compilation, timing, and getter instrumentation are outside allocation sampling. No detached-node test or public-host query measurement.'
        : undefined,
      shapes,
      rows,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${values.output}`)
