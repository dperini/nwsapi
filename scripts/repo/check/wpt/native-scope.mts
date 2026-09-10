import {
  pageMetadata,
  manifestSources,
  verifyNativeCheckout,
} from './native-metadata.mts'
import { inferScripts, inferCase, type Inference } from './native-inference.mts'
export { manifestSources } from './native-metadata.mts'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  narrowUniverse,
  nativePins,
  type passingUniverse,
  type SelectorReview,
} from './native-pool.mts'
import { isMainModule } from '../../lib/run-node.mts'

type Pool = ReturnType<typeof passingUniverse>

export function classifyScript(source: string, file: string) {
  const found = new Map<
    string,
    { kind: SelectorReview['kind']; reason: string }
  >()
  for (const profile of inferScripts([{ source, file }]).profiles) {
    if (
      profile.parts.every(part => part !== null) &&
      ['selector-matching', 'selector-parsing'].includes(profile.category)
    ) {
      found.set(profile.parts.join(''), {
        kind: profile.category as SelectorReview['kind'],
        reason: profile.reason,
      })
    }
  }
  return found
}

type PageAnalysis = ReturnType<typeof inferScripts> & { dependencies: string[] }

function decideCase(
  title: string | null,
  analysis: PageAnalysis,
  relative: string,
): Inference {
  let decision =
    title === null ? undefined : inferCase(title, analysis.profiles)
  if (!decision && !analysis.errors.length && !analysis.dependencies.length) {
    decision = analysis.fallback
    const categories = new Set(
      analysis.profiles.map(profile => profile.category),
    )
    if (categories.size === 1) {
      decision = analysis.profiles[0]
    } else if (
      analysis.profiles.length &&
      analysis.profiles.every(profile =>
        ['rendering', 'css-values', 'other-api'].includes(profile.category),
      )
    ) {
      decision = {
        ...analysis.profiles[0]!,
        category: 'other-api',
        reason:
          'All registration callbacks and their resolved helpers test APIs outside selector parsing and matching.',
      }
    }
  }
  decision ||= {
    category: 'unresolved',
    reason: analysis.errors.length
      ? 'Unparsed script: ' + analysis.errors.join(', ')
      : analysis.dependencies.length
        ? 'Unresolved dependency: ' + analysis.dependencies.join(', ')
        : 'Generated or ambiguous test registration needs a scope rule.',
    file: relative,
    line: 0,
  } satisfies Inference
  return decision
}

function assignDefaultTitles(
  analysis: ReturnType<typeof inferScripts>,
  relative: string,
  title: string | undefined,
) {
  let unnamed = 0

  if (title) {
    for (const profile of analysis.profiles) {
      if (profile.unnamed && profile.file === '/' + relative) {
        profile.parts = [title + (unnamed ? ' ' + unnamed : '')]
        unnamed++
      }
    }
  }
}

export function classifyPool(pool: Pool, checkout: string) {
  verifyNativeCheckout(checkout, pool.revision)
  const sources = manifestSources(
    JSON.parse(readFileSync(path.join(checkout, 'MANIFEST.json'), 'utf8'))
      .items,
  )
  const fileCache = new Map<string, ReturnType<typeof pageMetadata>>()
  const pageCache = new Map<
    string,
    ReturnType<typeof inferScripts> & { dependencies: string[] }
  >()
  const load = (
    relative: string,
    seen = new Set<string>(),
  ): { inputs: Array<{ file: string; source: string }>; missing: string[] } => {
    if (seen.has(relative)) {
      return { inputs: [], missing: [] }
    }
    seen.add(relative)
    const file = path.resolve(checkout, relative)
    if (
      !file.startsWith(path.resolve(checkout) + path.sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      return { inputs: [], missing: [relative] }
    }
    if (!fileCache.has(relative)) {
      fileCache.set(
        relative,
        pageMetadata(readFileSync(file, 'utf8'), relative),
      )
    }
    const metadata = fileCache.get(relative)!
    const inputs = metadata.scripts.map(source => ({
      file: '/' + relative,
      source,
    }))
    const missing: string[] = []
    for (const dependency of metadata.dependencies) {
      // The native harness provides registration and assertion functions, not selector test bodies.
      if (
        [
          '/resources/testharness.js',
          '/resources/testharnessreport.js',
          '/resources/testdriver.js',
          '/resources/testdriver-vendor.js',
        ].includes(dependency)
      ) {
        continue
      }
      // This removed resource returns 404 in the pinned run. Analyze it normally if upstream restores it.
      if (
        dependency === '/resources/WebIDLParser.js' &&
        !existsSync(path.join(checkout, dependency))
      ) {
        continue
      }
      const url = URL.parse(
        dependency.replace(/\{\{[^{}]*\}\}/g, () => '0'),
        'https://wpt.test/' + relative,
      )
      if (
        !url ||
        (url.origin !== 'https://wpt.test' && !dependency.includes('{{'))
      ) {
        missing.push(dependency)
        continue
      }
      const child = load(url.pathname.slice(1), seen)
      inputs.push(...child.inputs)
      missing.push(...child.missing)
    }
    return { inputs, missing }
  }
  const reviews: SelectorReview[] = []
  const pages = new Map<
    string,
    {
      source: string
      counts: Record<string, number>
      groups: Map<
        string,
        {
          category: string
          reason: string
          file: string
          line: number
          count: number
          samples: string[]
        }
      >
    }
  >()
  const totals: Record<string, number> = {}
  for (const entry of pool.cases) {
    const relative = sources.get(entry.test) || ''
    if (!pageCache.has(relative)) {
      const bundle = load(relative)
      const analysis = inferScripts(bundle.inputs)
      assignDefaultTitles(analysis, relative, fileCache.get(relative)?.title)
      pageCache.set(relative, { ...analysis, dependencies: bundle.missing })
    }
    const analysis = pageCache.get(relative)!
    const decision = decideCase(entry.subtest, analysis, relative)
    const category = decision.category
    totals[category] = (totals[category] || 0) + 1
    if (
      ['selector-parsing', 'selector-matching', 'mixed-selector'].includes(
        category,
      )
    ) {
      reviews.push({
        ...entry,
        kind:
          category === 'selector-parsing'
            ? 'selector-parsing'
            : 'selector-matching',
        reason: decision.reason,
      })
    }
    if (!pages.has(entry.test)) {
      pages.set(entry.test, { source: relative, counts: {}, groups: new Map() })
    }
    const page = pages.get(entry.test)!
    page.counts[category] = (page.counts[category] || 0) + 1
    const key = JSON.stringify([
      category,
      decision.file,
      decision.line,
      decision.reason,
    ])
    if (!page.groups.has(key)) {
      page.groups.set(key, {
        category,
        reason: decision.reason,
        file: decision.file,
        line: decision.line,
        count: 0,
        samples: [],
      })
    }
    const group = page.groups.get(key)!
    group.count++
    if (group.samples.length < 3 && entry.subtest !== null) {
      group.samples.push(entry.subtest)
    }
  }
  return {
    selected: narrowUniverse(pool, reviews),
    totals,
    finalized: !totals['unresolved'],
    pages: [...pages].map(([test, page]) => ({
      test,
      source: page.source,
      counts: page.counts,
      groups: [...page.groups.values()],
    })),
  }
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      pool: { type: 'string' },
      checkout: { type: 'string' },
      output: { type: 'string' },
    },
  })
  if (!values.pool || !values.checkout || !values.output) {
    throw new Error(
      'Usage: native-scope.mts --pool native-pool.json --checkout /full/wpt --output scoped.json',
    )
  }
  const pool: Pool = JSON.parse(readFileSync(values.pool, 'utf8'))
  const pins = nativePins()
  if (
    pool.scope !== 'candidate-native-passes' ||
    pool.browser !== pins.browser ||
    pool.revision !== pins.revision
  ) {
    throw new Error(
      'Scope requires the complete candidate passing pool at current pins.',
    )
  }
  const result = classifyPool(pool, values.checkout)
  writeFileSync(values.output, JSON.stringify(result) + '\n')
  console.log(
    JSON.stringify({
      nativePassing: pool.cases.length,
      selected: result.selected.cases.length,
      totals: result.totals,
      finalized: result.finalized,
    }),
  )
}
