import { browserLaunchOptions } from '../browser.mts'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import {
  createPrefixVariants,
  createSharedPrefixVariants,
} from './ancestor-prefix.mts'

type Probe = {
  run(index: number, count: number): void
  detach(): void
  refs: Array<WeakRef<Element>>
}
const { values } = parseArgs({
  options: {
    'attribute-classes': { type: 'boolean', default: false },
    baseline: { type: 'string' },
    inline: { type: 'boolean', default: false },
    single: { type: 'boolean', default: false },
    shared: { type: 'boolean', default: false },
    prefix: { type: 'boolean', default: false },
    classes: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: 'assets/repo/bench/ancestor-browser.json',
    },
  },
})
if (values['attribute-classes'] && !values.baseline) {
  throw new Error(
    '--attribute-classes requires --baseline for the control engine',
  )
}
const names = values.baseline
  ? ['baseline', 'candidate']
  : values.inline
    ? ['baseline', 'shared-prefix', 'inline-prefix']
    : values.shared
      ? ['baseline', 'shared-prefix', 'last-prefix']
      : values.prefix
        ? ['baseline', 'split-prefix', 'cached-prefix']
        : ['baseline', 'always-cache', 'depth-gated']
const code = readFileSync('dist/nwsapi.js', 'utf8')
const beforeCode = values.baseline
  ? readFileSync(values.baseline, 'utf8')
  : undefined
const browser = await chromium.launch(browserLaunchOptions())
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
        if (beforeCode) {
          await page.addScriptTag({ content: beforeCode })
          await page.evaluate(() => {
            const host = window as unknown as {
              NW: { Dom: unknown }
              BeforeDom: unknown
            }
            host.BeforeDom = host.NW.Dom
          })
        }
        await page.addScriptTag({ content: code })
        const timing = await page.evaluate(
          ({
            depths,
            selector,
            classes,
            prefixMode,
            prefixFactory,
            sharedMode,
            single,
            inlineMode,
            productionComparison,
            attributeClasses,
          }) => {
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
                      single ? 1 : 2,
                    )
                }
              }
            }
            populate()
            const engine = host.NW.Dom
            const nodes = Array.from(document.getElementsByClassName('content'))
            const expected = Array.from(document.querySelectorAll(selector))
            if (attributeClasses) {
              engine.Snapshot.classOf = element =>
                element.getAttribute('class') || ''
            }
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
              if (prefixMode || sharedMode) {
                const suffixText = ' .block.inner > .content'
                if (!selector.endsWith(suffixText)) {
                  throw new Error('Unexpected experimental suffix')
                }
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
                if (sharedMode) {
                  // oxlint-disable-next-line typescript/no-implied-eval -- Serialize the local fixed-selector benchmark helper into the browser.
                  const buildShared = Function(
                    'return ' + prefixFactory,
                  )() as typeof createSharedPrefixVariants
                  const shared = engine.Snapshot as unknown as {
                    nthOfType(node: null, mode: number): void
                  }
                  return [
                    baseline,
                    ...buildShared(
                      engine
                        .compile(selector.slice(0, -suffixText.length), true)
                        .toString(),
                      engine.Snapshot,
                      element => suffixMatch(element, null, document, false),
                      () => shared.nthOfType(null, 2),
                      inlineMode ? baseline.toString() : undefined,
                    ),
                  ]
                }
                // oxlint-disable-next-line typescript/no-implied-eval -- Serialize the local fixed-selector benchmark helper into the browser.
                const build = Function(
                  'return ' + prefixFactory,
                )() as typeof createPrefixVariants
                return [
                  baseline,
                  ...build(
                    element => prefixMatch(element, null, document, false),
                    element => suffixMatch(element, null, document, false),
                  ),
                ]
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
            const before = (window as unknown as { BeforeDom: typeof engine })
              .BeforeDom
            const variants = productionComparison
              ? [before.compile(selector, true), engine.compile(selector, true)]
              : buildVariants()
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
            const samples: number[][] = variants.map(() => [])
            for (let round = 0; round < 7; ++round) {
              for (let offset = 0; offset < variants.length; ++offset) {
                const index = (round + offset) % variants.length
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
            const box = changed.closest('.box')!
            const boxClass = box.className
            box.className = ''
            const prefixMutated = Array.from(
              document.querySelectorAll(selector),
            )
            for (let index = 0; index < variants.length; ++index) {
              verify(query(index), prefixMutated)
            }
            box.className = boxClass
            const nextBox = box.nextSibling
            document.body.append(box)
            const moved = new Set(document.querySelectorAll(selector))
            const movedExpected = nodes.filter(element => moved.has(element))
            for (let index = 0; index < variants.length; ++index) {
              verify(query(index), movedExpected)
            }
            document.body.insertBefore(box, nextBox)
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
                moved.clear()
                movedExpected.length = 0
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
            prefixMode: values.prefix,
            prefixFactory:
              values.shared || values.inline
                ? createSharedPrefixVariants.toString()
                : createPrefixVariants.toString(),
            sharedMode: values.shared || values.inline,
            inlineMode: values.inline,
            productionComparison: !!values.baseline,
            attributeClasses: values['attribute-classes'],
            single: values.single,
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
        for (let index = 0; index < names.length; ++index) {
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
            name: names[index],
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
          prefixMutationCorrect: true,
          positionalMutationCorrect: true,
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
        candidatesPerOuter: values.single ? 1 : 2,
        platform: process.platform,
        architecture: process.arch,
        attributeClasses: values['attribute-classes'],
        engineSha256: createHash('sha256').update(code).digest('hex'),
        baselineSha256: beforeCode
          ? createHash('sha256').update(beforeCode).digest('hex')
          : undefined,
        cachePayload: values['attribute-classes']
          ? 'Candidate Snapshot.classOf reads getAttribute("class") or an empty string. No DOM-value cache. Baseline uses the unmodified reader.'
          : values.baseline
            ? 'Unmodified baseline and candidate compiled resolvers.'
            : values.inline
              ? 'Previous ancestor result in the original compiled resolver. Original positional state and cleanup. No extra parent reads, weak map, path array, or depth gate.'
              : values.shared
                ? 'Shared collection positional state and one previous ancestor result per query. No weak map, path array, or depth gate.'
                : values.prefix
                  ? 'Ancestor-prefix boolean results. Per-query weak map and reusable path array. No depth gate.'
                  : values.classes
                    ? 'Class value only. Parent reads remain direct.'
                    : 'Parent and class record.',
        methodology:
          'Fixed compiled-resolver experiments in native browser DOM. Sixteen boxes contain two outer elements each. The candidatesPerOuter field records the candidate count per outer element. Depth patterns repeat across boxes. Seven rotating rounds of 1000 calls after 100 warmups. Candidate lookup and compilation excluded. Allocation sampling covers 2000 separate calls per variant and includes collected objects. Four GCs precede retained-heap measurements. Variant allocation order is fixed and each fixture gets a fresh page. Estimated allocation and whole-page retained heap are distinct. Mutation and reversed candidate order checked outside timers. WeakRefs checked after removing fixtures. Public-host timing and rendering are outside this benchmark.',
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
