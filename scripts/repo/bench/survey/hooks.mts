import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { performance } from 'node:perf_hooks'
import type { JSDOM as Jsdom } from 'jsdom'
import { REPO_ROOT, ENGINE_BUILD_PATH } from '../../lib/paths.mts'
import { sha256, median } from '../footprint/shared.mts'

const { values } = parseArgs({
  options: {
    dependencies: { type: 'string' },
    output: { type: 'string' },
    worker: { type: 'string' },
    help: { type: 'boolean' },
  },
})

if (values.help) {
  console.log(
    'Usage: survey/hooks.mts --dependencies installation-directory --output hooks.json\nMeasures a narrow stylesheet-subject prototype in fresh jsdom documents and records adapter hook availability. Runtime files are unchanged.',
  )
} else if (!values.dependencies) {
  throw new Error('Supply --dependencies installation-directory.')
} else if (values.worker) {
  console.log(JSON.stringify(probe(values.worker)))
} else {
  if (!values.output) {
    throw new Error('Supply --output hooks.json.')
  }
  const results = ['baseline', 'subjects', 'stock'].map(mode =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          '--dependencies',
          values.dependencies!,
          '--worker',
          mode,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        },
      ),
    ),
  )
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        candidateSha256: sha256(readFileSync(ENGINE_BUILD_PATH)),
        method:
          'Exploratory instrumented probe. Seven fresh documents per mode, fixed mode order, setup excluded. Counts are stronger evidence than timings. CSS subject extraction prototype handles only exact simple class selectors. All other subjects stay wildcard.',
        results,
      },
      null,
      2,
    ) + '\n',
  )
}

interface Adapter {
  check(selector: string, input: unknown): unknown
  extractSubjects(selector: string, sensitive?: boolean): unknown
}
interface AdapterFactory {
  DOMSelector: new (
    window: unknown,
    document: unknown,
    options: Record<string, unknown>,
  ) => Adapter
}

function probe(mode: string) {
  const load = createRequire(
    path.join(path.resolve(values.dependencies!), 'package.json'),
  )
  let checks = 0
  let hookNames: string[] = []
  const candidate = load(ENGINE_BUILD_PATH) as AdapterFactory
  if (mode !== 'stock') {
    class ProbeAdapter extends candidate.DOMSelector {
      constructor(
        window: unknown,
        document: unknown,
        options: Record<string, unknown>,
      ) {
        super(window, document, options)
        hookNames = Object.keys(options)
      }
      override check(selector: string, input: unknown) {
        ++checks
        return super.check(selector, input)
      }
      override extractSubjects(selector: string, sensitive?: boolean) {
        if (mode === 'subjects' && /^\.[a-z0-9-]+$/.test(selector)) {
          return [{ id: null, className: selector.slice(1), tag: null }]
        }
        return super.extractSubjects(selector, sensitive)
      }
    }
    const entry = load.resolve('@asamuzakjp/dom-selector')
    load(entry)
    load.cache[entry]!.exports = { DOMSelector: ProbeAdapter }
  }
  const { JSDOM } = load('jsdom') as { JSDOM: typeof Jsdom }
  const rules = Array.from(
    { length: 240 },
    (_, i) => `.unused-${i}{color:red}`,
  ).join('')
  const html = `<!doctype html><style>${rules}.hit{color:rgb(1, 2, 3)}</style><main>${'<i class="hit"></i>'.repeat(24)}</main>`
  const samples = []
  const counts = []
  for (let round = 0; round < 7; ++round) {
    const dom = new JSDOM(html)
    checks = 0
    const nodes = Array.from(dom.window.document.getElementsByTagName('i'))
    const start = performance.now()
    const colors = nodes.map(node => dom.window.getComputedStyle(node).color)
    samples.push(performance.now() - start)
    counts.push(checks)
    if (colors.some(color => color !== 'rgb(1, 2, 3)')) {
      throw new Error('Stylesheet probe returned an incorrect color.')
    }
    dom.window.close()
  }
  const mutation = new JSDOM(
    '<!doctype html><style>.missing{color:rgb(1, 2, 3)}</style><i class="hit"></i>',
  )
  const element = mutation.window.document.getElementsByTagName('i')[0]!
  const before = mutation.window.getComputedStyle(element).color
  const sheet = mutation.window.document.styleSheets[0]!
  ;(sheet.cssRules[0] as CSSStyleRule).selectorText = '.hit'
  // Force a style-cache invalidation to isolate the cached subject keys.
  element.setAttribute('data-refresh', '1')
  const after = mutation.window.getComputedStyle(element).color
  mutation.window.close()
  return {
    mode,
    jsdom: load('jsdom/package.json').version,
    competitor: load('@asamuzakjp/dom-selector/package.json').version,
    hostOptionKeys: hookNames,
    rules: 241,
    elements: 24,
    styleMilliseconds: samples,
    medianMilliseconds: median(samples),
    checkCalls: mode === 'stock' ? null : counts,
    selectorTextMutation: { before, after, expected: 'rgb(1, 2, 3)' },
  }
}
