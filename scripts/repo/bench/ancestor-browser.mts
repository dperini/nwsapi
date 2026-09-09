import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

type Probe = {
  run(index: number, count: number): void
  detach(): void
  refs: Array<WeakRef<Element>>
}
const { values } = parseArgs({
  options: {
    classes: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: 'assets/repo/bench/ancestor-browser.json',
    },
  },
})
const code = readFileSync('dist/nwsapi.js', 'utf8')
const browser = await chromium.launch()
const rows = []
try {
  for (const fixtureDepths of [[0], [8], [0, 8], [8, 0]]) {
    for (const fixtureSelector of [
      '.box:first-child ~ .box:nth-of-type(4n) + .box .block.inner > .content',
      '.box .block.inner > .content',
    ]) {
      const page = await browser.newPage()
      try {
        await page.setContent('<!doctype html><body></body>')
        await page.addScriptTag({ content: code })
        const timing = await page.evaluate(
          ({ depths, selector, classes }) => {
            const host = window as unknown as {
              NW: {
                Dom: {
                  compile(
                    selector: string,
                    mode: boolean,
                  ): (
                    c: Element[],
                    f: null,
                    x: Document,
                    r: Element[],
                  ) => Element[]
                  Snapshot: { classOf(element: Element): string | null }
                }
              }
              probe: Probe
            }
            const populate = () => {
              for (let i = 0; i < 16; ++i) {
                const box = document.createElement('div')
                box.className = 'box'
                document.body.append(box)
                let parent: Element = box
                for (let d = 0; d < depths[i % depths.length]!; ++d) {
                  const wrapper = document.createElement('section')
                  parent.append(wrapper)
                  parent = wrapper
                }
                for (let j = 0; j < 2; ++j) {
                  const outer = document.createElement('div')
                  outer.className = 'block outer'
                  parent.append(outer)
                  outer.innerHTML =
                    '<div class="block inner"><p class="content"></p></div>'.repeat(
                      2,
                    )
                }
              }
            }
            populate()
            const engine = host.NW.Dom
            const nodes = Array.from(document.getElementsByClassName('content'))
            const expected = Array.from(document.querySelectorAll(selector))
            type Read = { parent: Element | null; cls: string | null }
            const record = (
              element: Element,
              cache: WeakMap<Element, Read>,
            ) => {
              let entry = cache.get(element)
              if (!entry) {
                entry = {
                  parent: element.parentElement,
                  cls: engine.Snapshot.classOf(element),
                }
                cache.set(element, entry)
              }
              return entry
            }
            const classRead = (
              element: Element,
              cache: WeakMap<Element, string | null>,
            ) => {
              let value = cache.get(element)
              if (value === undefined) {
                value = engine.Snapshot.classOf(element)
                cache.set(element, value)
              }
              return value
            }
            const depthCache = (candidates: Element[]) => {
              if (candidates.length < 16) {
                return null
              }
              let element: Element | null = candidates[0]!
              for (let i = 0; i < 8; ++i) {
                element = element.parentElement
                if (!element) {
                  return null
                }
              }
              return new WeakMap<Element, Read>()
            }
            const buildVariants = () => {
              const baseline = engine.compile(selector, true)
              const variants = [baseline]
              const source = baseline.toString()
              if (
                !source.includes('var e,') ||
                !source.includes('s.classOf(e)') ||
                !source.includes('e.parentElement')
              ) {
                throw new Error('Generated resolver shape changed')
              }
              for (const gated of [false, true]) {
                const rewritten = source
                  .replace(
                    'var e,',
                    () =>
                      `var _cache=${gated ? 'depthCache(c)' : 'new WeakMap()'},e,`,
                  )
                  .replaceAll(
                    'e.parentElement',
                    classes
                      ? 'e.parentElement'
                      : gated
                        ? '(_cache?record(e,_cache).parent:e.parentElement)'
                        : 'record(e,_cache).parent',
                  )
                  .replaceAll(
                    's.classOf(e)',
                    classes
                      ? gated
                        ? '(_cache?classRead(e,_cache):s.classOf(e))'
                        : 'classRead(e,_cache)'
                      : gated
                        ? '(_cache?record(e,_cache).cls:s.classOf(e))'
                        : 'record(e,_cache).cls',
                  )
                variants.push(
                  // oxlint-disable-next-line typescript/no-implied-eval -- Fixed experimental resolver code, validated against native results.
                  Function(
                    's',
                    'a',
                    'record',
                    'depthCache',
                    'classRead',
                    'return ' + rewritten,
                  )(engine.Snapshot, undefined, record, depthCache, classRead),
                )
              }
              return variants
            }
            const variants = buildVariants()
            const query = (index: number) =>
              variants[index]!(nodes, null, document, [])
            const verify = (result: Element[], wanted: Element[]) => {
              if (
                result.length !== wanted.length ||
                result.some((node, i) => node !== wanted[i])
              ) {
                throw new Error('Experimental resolver changed results')
              }
            }
            for (let index = 0; index < variants.length; ++index) {
              verify(query(index), expected)
              for (let i = 0; i < 100; ++i) {
                query(index)
              }
            }
            const samples: number[][] = [[], [], []]
            for (let round = 0; round < 7; ++round) {
              for (let offset = 0; offset < 3; ++offset) {
                const index = (round + offset) % 3
                const start = performance.now()
                for (let i = 0; i < 1000; ++i) {
                  query(index)
                }
                samples[index]!.push((performance.now() - start) / 1000)
              }
            }
            const changed = nodes[0]!.parentElement!
            changed.className = 'block'
            const mutated = Array.from(document.querySelectorAll(selector))
            for (let index = 0; index < variants.length; ++index) {
              verify(query(index), mutated)
            }
            changed.className = 'block inner'
            // Candidate order is part of the first-candidate gate's input.
            nodes.reverse()
            const reversed = expected.toReversed()
            for (let index = 0; index < variants.length; ++index) {
              verify(query(index), reversed)
            }
            nodes.reverse()
            host.probe = {
              refs: [
                new WeakRef(nodes[0]!),
                new WeakRef(nodes[0]!.parentElement!),
              ],
              run(index, count) {
                for (let i = 0; i < count; ++i) {
                  query(index)
                }
              },
              detach() {
                nodes.length = 0
                expected.length = 0
                document.body.replaceChildren()
              },
            }
            return {
              samples,
              matches: expected.length,
              candidates: nodes.length,
            }
          },
          {
            depths: fixtureDepths,
            selector: fixtureSelector,
            classes: values.classes,
          },
        )
        const session = await page.context().newCDPSession(page)
        const heap = async () => {
          for (let i = 0; i < 4; ++i) {
            await page.evaluate(
              () => new Promise(resolve => setTimeout(resolve, 0)),
            )
            await session.send('HeapProfiler.collectGarbage')
          }
          return (await session.send('Runtime.getHeapUsage')).usedSize
        }
        const variants = []
        for (let index = 0; index < 3; ++index) {
          const before = await heap()
          await session.send('HeapProfiler.startSampling', {
            samplingInterval: 1024,
            includeObjectsCollectedByMajorGC: true,
            includeObjectsCollectedByMinorGC: true,
          })
          await page.evaluate(
            variantIndex =>
              (window as unknown as { probe: Probe }).probe.run(
                variantIndex,
                2000,
              ),
            index,
          )
          const { profile } = await session.send('HeapProfiler.stopSampling')
          const total = (node: typeof profile.head): number =>
            node.selfSize +
            node.children.reduce((sum, child) => sum + total(child), 0)
          const after = await heap()
          variants.push({
            name: ['baseline', 'always-cache', 'depth-gated'][index],
            samplesMs: timing.samples[index],
            allocatedBytesEstimate: total(profile.head),
            retainedBefore: before,
            retainedAfter: after,
          })
        }
        await page.evaluate(() =>
          (window as unknown as { probe: Probe }).probe.detach(),
        )
        const detachedHeap = await heap()
        const survivingNodes = await page.evaluate(
          () =>
            (window as unknown as { probe: Probe }).probe.refs.filter(ref =>
              ref.deref(),
            ).length,
        )
        assert.equal(
          survivingNodes,
          0,
          'Removed candidates must be collectible',
        )
        rows.push({
          depths: fixtureDepths,
          selector: fixtureSelector,
          matches: timing.matches,
          candidates: timing.candidates,
          variants,
          detachedHeap,
          survivingNodes,
          mutationCorrect: true,
          reversedOrderCorrect: true,
        })
      } finally {
        await page.close()
      }
    }
  }
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        browser: browser.version(),
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        engineSha256: createHash('sha256').update(code).digest('hex'),
        cachePayload: values.classes
          ? 'Class value only. Parent reads remain direct.'
          : 'Parent and class record.',
        methodology:
          'Fixed compiled-resolver experiments in native browser DOM. Sixteen boxes contain four candidates each. Depth patterns repeat across boxes. Seven rotating rounds of 1000 calls after 100 warmups. Candidate lookup and compilation excluded. Allocation sampling covers 2000 separate calls per variant and includes collected objects. Four GCs precede retained-heap measurements. Variant allocation order is fixed and each fixture gets a fresh page. Estimated allocation and whole-page retained heap are distinct. Mutation and reversed candidate order checked outside timers. WeakRefs checked after removing fixtures. No production engine change, public-host timing, or rendering.',
        rows,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`Wrote ${values.output}`)
} finally {
  await browser.close()
}
