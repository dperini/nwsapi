import { browserLaunchOptions } from '../browser.mts'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { rolldown } from 'rolldown'
import type { NwsapiEngine } from '../../../.config/runtime.d.ts'
import { REPO_ROOT } from '../lib/paths.mts'

interface Adapter {
  matches(selector: string, element: Element): boolean
  querySelectorAll(selector: string, context: Node): Element[]
  supports(selector: string): boolean
  extractSubjects(selector: string): unknown
  check(
    selector: string,
    element: Element,
    options: { requireAst: boolean },
  ): {
    match: boolean
    pseudoElement: string | null
  }
}
type AdapterConstructor = new (window: Window, document: Document) => Adapter
interface ProbeWindow extends Window {
  __factory(window: {
    document: Document
    DOMException?: typeof DOMException
  }): NwsapiEngine
  __competitor: { DOMSelector: AdapterConstructor }
  __adapter: AdapterConstructor | { default: AdapterConstructor }
  __probe: {
    compare: (
      selector: string,
      context?: Document | Element | ShadowRoot,
    ) => Row
    engine: NwsapiEngine
    competitor: Adapter
    adapter: Adapter
  }
}
type Outcome<Value> = { value: Value } | { error: string }
interface Row {
  selector: string
  context: string
  native: Outcome<string[]>
  nwsapi: Outcome<string[]>
  competitor: Outcome<string[]>
  adapter: Outcome<string[]>
  nativeSupports: boolean
  adapterSupports: boolean
  competitorSupports: boolean
}
interface Cases {
  html: string
  selectors: string[]
  shadowSelectors: string[]
  xml: Array<{
    name: string
    html: string
    selectors: string[]
    attributes?: Array<{
      id: string
      namespace: string
      name: string
      value: string
    }>
  }>
}

const { values } = parseArgs({
  options: {
    browser: { type: 'string' },
    'expect-major': { type: 'string', default: '153' },
    competitor: { type: 'string', default: '../domSelector' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/selector-compatibility.json',
    },
  },
})
const require = createRequire(import.meta.url)
const competitorRoot = path.resolve(REPO_ROOT, values.competitor)
const dependencyRequire = createRequire(
  createRequire(require.resolve('jsdom')).resolve('@asamuzakjp/dom-selector'),
)
const dependencies: Record<string, string> = {}
const aliases: Record<string, string> = {}
for (const name of [
  'bidi-js',
  'css-tree',
  'is-potential-custom-element-name',
  'lru-cache',
]) {
  let root = path.dirname(dependencyRequire.resolve(name))
  while (
    root !== path.dirname(root) &&
    !existsSync(path.join(root, 'package.json'))
  ) {
    root = path.dirname(root)
  }
  // Distribution subdirectories can carry their own module-type manifest.
  while (
    JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name !==
    name
  ) {
    const parent = path.dirname(root)
    if (parent === root) {
      throw new Error(`Cannot locate ${name} package metadata`)
    }
    root = parent
    while (
      !existsSync(path.join(root, 'package.json')) &&
      root !== path.dirname(root)
    ) {
      root = path.dirname(root)
    }
  }
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    version: string
    exports: { '.': { import: { browser: { default: string } } | string } }
  }
  dependencies[name] = manifest.version
  const entry = manifest.exports?.['.']?.import
  aliases[name] =
    name === 'lru-cache' && typeof entry === 'object'
      ? path.resolve(root, entry.browser.default)
      : name === 'css-tree' && typeof entry === 'string'
        ? path.resolve(root, entry)
        : dependencyRequire.resolve(name)
}
async function bundle(input: string, name: string) {
  const build = await rolldown({
    input,
    platform: 'browser',
    treeshake: false,
    plugins: [
      {
        name: 'local-comparison-dependencies',
        resolveId(id) {
          return aliases[id] ?? null
        },
      },
    ],
  })
  try {
    const { output } = await build.generate({
      format: 'iife',
      name,
      codeSplitting: false,
    })
    const chunk = output[0]
    if (
      output.length !== 1 ||
      chunk?.type !== 'chunk' ||
      chunk.imports.length
    ) {
      throw new Error('The browser comparison needs a standalone bundle.')
    }
    return chunk.code
  } finally {
    await build.close()
  }
}
const casesPath = path.join(
  REPO_ROOT,
  'test/repo/fixtures/selectors/compatibility.json',
)
const inputs = readFileSync(casesPath, 'utf8')
const fixtureCases = JSON.parse(inputs) as Cases
const candidate = readFileSync(path.join(REPO_ROOT, 'dist/nwsapi.js'), 'utf8')
const competitorBundle = await bundle(
  path.join(competitorRoot, 'src/index.js'),
  '__competitor',
)
const adapterBundle = await bundle(
  path.join(REPO_ROOT, 'dist/dom-selector.js'),
  '__adapter',
)
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const revision = (cwd: string) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
const browser = await chromium.launch({
  ...(values.browser
    ? { executablePath: values.browser }
    : browserLaunchOptions()),
  headless: true,
})
try {
  if (browser.version().split('.')[0] !== values['expect-major']) {
    throw new Error(
      `Expected Chrome ${values['expect-major']}, got ${browser.version()}. Pass --browser with the intended executable.`,
    )
  }
  const page = await browser.newPage()
  await page.route('**/*', route =>
    route.fulfill({ contentType: 'text/html', body: fixtureCases.html }),
  )
  await page.goto('https://selector-audit.test/')
  await page.addScriptTag({
    content: `(function(){const module={exports:{}};const exports=module.exports;\n${candidate}\nglobalThis.__factory=module.exports;})();`,
  })
  await page.addScriptTag({ content: competitorBundle })
  await page.addScriptTag({ content: adapterBundle })
  const matrix = await page.evaluate(cases => {
    const host = window as unknown as ProbeWindow
    const engine = host.__factory(window)
    const competitor = new host.__competitor.DOMSelector(window, document)
    const AdapterEngine =
      'default' in host.__adapter ? host.__adapter.default : host.__adapter
    const adapter = new AdapterEngine(window, document)
    const attempt = <Value,>(fn: () => Value): Outcome<Value> => {
      try {
        return { value: fn() }
      } catch (error) {
        return { error: (error as Error).name }
      }
    }
    const ids = (nodes: ArrayLike<Element>) =>
      Array.from(nodes, node => node.id || node.localName)
    const compare = (
      selector: string,
      context: Document | Element | ShadowRoot = document,
    ): Row => ({
      selector,
      context:
        context === document
          ? 'document'
          : context.nodeType === 11
            ? 'shadow'
            : (context as Element).id,
      native: attempt(() => ids(context.querySelectorAll(selector))),
      nwsapi: attempt(() => ids(engine.select(selector, context))),
      competitor: attempt(() =>
        ids(competitor.querySelectorAll(selector, context)),
      ),
      adapter: attempt(() => ids(adapter.querySelectorAll(selector, context))),
      nativeSupports: CSS.supports(`selector(${selector})`),
      adapterSupports: adapter.supports(selector),
      competitorSupports: competitor.supports(selector),
    })
    customElements.define(
      'audit-state',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachInternals().states.add('ready')
        }
      },
    )
    const shadow = document
      .getElementById('shadow-host')!
      .attachShadow({ mode: 'open' })
    shadow.innerHTML =
      '<slot id="assigned"></slot><slot id="empty" name="empty"></slot><slot id="fallback" name="fallback">fallback</slot>'
    ;(document.getElementById('dialog') as HTMLDialogElement).showModal()
    document.getElementById('popover')!.showPopover()
    const rows = cases.selectors.map(selector => compare(selector))
    rows.push(
      ...cases.shadowSelectors.map(selector => compare(selector, shadow)),
    )
    const section = document.getElementById('section')!
    rows.push(
      ...[
        ':scope',
        ':scope > p',
        'body p',
        '> p',
        'p:nth-child(2 of .item)',
      ].map(selector => compare(selector, section)),
    )
    const foreign =
      document.implementation.createHTMLDocument('foreign elements')
    for (const [namespace, name, id] of [
      ['http://www.w3.org/1999/xhtml', 'p', 'html'],
      ['urn:foreign', 's:p', 'prefix'],
      ['urn:foreign', 's:P', 'upper-prefix'],
      ['urn:foreign', 'P', 'upper'],
      ['http://www.w3.org/1999/xhtml', 'h:p', 'html-prefix'],
    ]) {
      const element = foreign.createElementNS(namespace!, name!)
      element.id = id!
      foreign.body.append(element)
    }
    rows.push(
      ...['p', 'P', '*|p', '*|P', 'p:first-of-type', 'p:nth-of-type(2)'].map(
        selector => ({
          ...compare(selector, foreign),
          context: 'HTML foreign namespaces',
        }),
      ),
    )
    ;(document.getElementById('dialog') as HTMLDialogElement).close()
    document.getElementById('popover')!.hidePopover()
    host.__probe = { compare, engine, competitor, adapter }
    return rows
  }, fixtureCases)
  const userState: Array<{ phase: string; rows: Row[] }> = []
  for (const [phase, value] of [
    ['invalid', 'invalid'],
    ['valid', 'user@example.test'],
  ] as const) {
    await page.locator('#email').fill(value)
    await page.locator('#email').press('Tab')
    userState.push({
      phase,
      rows: await page.evaluate(() =>
        [':user-valid', ':user-invalid'].map(selector =>
          (window as unknown as ProbeWindow).__probe.compare(selector),
        ),
      ),
    })
  }
  const transitions = await page.evaluate(async () => {
    const { compare } = (window as unknown as ProbeWindow).__probe
    const style = document.createElement('style')
    style.textContent = '::view-transition-group(*){animation-duration:60s}'
    document.head.append(style)
    const transition = document.startViewTransition({
      update() {
        document.body.classList.add('transition-test')
      },
      types: ['audit'],
    })
    try {
      await transition.ready
      return [
        ':active-view-transition',
        ':active-view-transition-type(audit)',
        ':active-view-transition-type(other)',
      ].map(selector => compare(selector))
    } finally {
      transition.skipTransition()
      await transition.finished
      style.remove()
      document.body.classList.remove('transition-test')
    }
  })
  await page.evaluate(() => {
    const source = document.createElement('button')
    source.id = 'interest-source'
    source.textContent = 'Interest target'
    source.setAttribute('interestfor', 'interest-target')
    source.style.setProperty('interest-delay', '0s')
    const target = document.createElement('div')
    target.id = 'interest-target'
    target.setAttribute('popover', '')
    target.textContent = 'Target'
    document.body.append(source, target)
  })
  await page.locator('#interest-source').hover()
  let interestFixtureError: string | null = null
  try {
    await page.waitForFunction(
      () => document.querySelector(':interest-source') !== null,
      {},
      { timeout: 2500 },
    )
  } catch (error) {
    interestFixtureError = (error as Error).name
  }
  const interest = {
    fixtureError: interestFixtureError,
    rows: await page.evaluate(() =>
      [':interest-source', ':interest-target'].map(selector =>
        (window as unknown as ProbeWindow).__probe.compare(selector),
      ),
    ),
  }
  const xmlResults = await page.evaluate(fixtures => {
    const host = window as unknown as ProbeWindow
    return fixtures.map(fixture => {
      const xml = new DOMParser().parseFromString(
        fixture.html,
        'application/xml',
      )
      if (xml.querySelector('parsererror')) {
        throw new Error('Invalid XML fixture')
      }
      for (const attribute of fixture.attributes ?? []) {
        xml
          .getElementById(attribute.id)!
          .setAttributeNS(attribute.namespace, attribute.name, attribute.value)
      }
      const engine = host.__factory({ document: xml, DOMException })
      const competitor = new host.__competitor.DOMSelector(window, xml)
      const AdapterEngine =
        'default' in host.__adapter ? host.__adapter.default : host.__adapter
      const adapter = new AdapterEngine(window, xml)
      const attempt = (fn: () => ArrayLike<Element>): Outcome<string[]> => {
        try {
          return { value: Array.from(fn(), node => node.id || node.localName) }
        } catch (error) {
          return { error: (error as Error).name }
        }
      }
      return {
        name: fixture.name,
        rows: fixture.selectors.map(selector => ({
          selector,
          native: attempt(() => xml.querySelectorAll(selector)),
          nwsapi: attempt(() => engine.select(selector, xml)),
          competitor: attempt(() => competitor.querySelectorAll(selector, xml)),
          adapter: attempt(() => adapter.querySelectorAll(selector, xml)),
        })),
      }
    })
  }, fixtureCases.xml)
  const api = await page.evaluate(() => {
    const { adapter, competitor, engine } = (window as unknown as ProbeWindow)
      .__probe
    const node = document.getElementById('two')!
    return ['p', 'p, #missing', 'p::before', ':is(p, #missing)', ':scope'].map(
      selector => ({
        selector,
        matches: {
          native: node.matches(selector),
          core: engine.match(selector, node),
          adapter: adapter.matches(selector, node),
          competitor: competitor.matches(selector, node),
        },
        subjects: {
          adapter: adapter.extractSubjects(selector),
          competitor: competitor.extractSubjects(selector),
        },
        check: {
          adapter: adapter.check(selector, node, { requireAst: true }).match,
          competitor: competitor.check(selector, node, { requireAst: true })
            .match,
        },
      }),
    )
  })
  const report = {
    recorded: new Date().toISOString(),
    browser: browser.version(),
    experimentalFlags: [],
    node: process.version,
    revisions: {
      nwsapi: revision(REPO_ROOT),
      competitor: revision(competitorRoot),
    },
    versions: {
      nwsapi: require('../../../package.json').version as string,
      competitor: (
        JSON.parse(
          readFileSync(path.join(competitorRoot, 'package.json'), 'utf8'),
        ) as {
          version: string
        }
      ).version,
      dependencies,
    },
    hashes: {
      inputs: sha256(inputs),
      nwsapi: sha256(candidate),
      competitor: sha256(competitorBundle),
      adapter: sha256(adapterBundle),
    },
    matrix,
    userState,
    transitions,
    interest,
    xml: xmlResults,
    api,
  }
  writeFileSync(
    path.resolve(REPO_ROOT, values.output),
    JSON.stringify(report) + '\n',
  )
  const rows = [
    ...matrix,
    ...userState.flatMap(state => state.rows),
    ...transitions,
    ...interest.rows,
    ...xmlResults.flatMap(fixture => fixture.rows),
  ]
  console.log(
    JSON.stringify({
      output: values.output,
      browser: report.browser,
      cases: rows.length,
      mismatches: rows.filter(
        row => JSON.stringify(row.native) !== JSON.stringify(row.nwsapi),
      ).length,
    }),
  )
} finally {
  await browser.close()
}
