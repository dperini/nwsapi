import { createHostReaders } from './jsdom.mts'
import type { HostOptions, HostReaders, IdlUtils } from './jsdom.mts'

type CssNode = import('css-tree').CssNode
type Selector = import('css-tree').Selector
type NwsapiEngine = import('../../.config/runtime.d.ts').NwsapiEngine
type NwsapiCollection = import('../../.config/runtime.d.ts').NwsapiCollection

type HostWindow = Window & typeof globalThis
type Engine = NwsapiEngine & {
  Snapshot: { doc: Document }
  closest(selector: string, node: Element): Element | null
  [ENGINE_OWNER]?: Document
}
const createNwsapi: (host: {
  document: Document
  DOMException: typeof DOMException
  hostReaders?: HostReaders | undefined
}) => Engine = require('../nwsapi.js')
type QueryOptions = { noexcept?: boolean | undefined }
type AdapterDocument = Document & { [DOCUMENT_STATE]?: State }
type State = {
  engine?: Engine
  options: Record<string, boolean> | { __proto__: null }
  active: boolean
  hostReaders?: HostReaders | undefined
}

// A package override can load a second copy. Versioned, non-enumerable slots
// share adapter state across those copies without a global window registry.
const DOCUMENT_STATE = Symbol.for('nwsapi.DOMSelector.document.v1')
const ENGINE_OWNER = Symbol.for('nwsapi.DOMSelector.owner.v1')

function assertSetup(window: HostWindow, document: AdapterDocument) {
  const state = document[DOCUMENT_STATE] as State | undefined
  if (state && state.active) {
    throw new window.TypeError('Configure the adapter before its first use')
  }
}

function getState(document: AdapterDocument): State {
  let state = document[DOCUMENT_STATE] as State | undefined
  if (!state) {
    state = { options: { __proto__: null }, active: false }
    Object.defineProperty(document, DOCUMENT_STATE, { value: state })
  }
  return state
}

function activate(adapter: DOMSelector) {
  const engine = adapter.engine
  if (!adapter.state.active) {
    assertThrowing(adapter.window, engine)
    adapter.state.active = true
  }
  return engine
}

function assertThrowing(window: HostWindow, engine: Engine) {
  if (engine.configure()['VERBOSITY'] !== true) {
    throw new window.TypeError('The jsdom adapter requires VERBOSITY: true')
  }
}

function configureEngine(
  engine: Engine,
  options: Record<string, unknown>,
  clear?: boolean,
) {
  if (options['LEGACY'] && typeof engine.registerLegacyHooks === 'function') {
    const install = require('../modules/nwsapi-legacy.js') as (
      engine: Engine,
    ) => Engine
    install(engine)
  }
  engine.configure(options, clear)
}

// jsdom passes implementation nodes in and expects public wrappers back.
// css-tree is needed only by this adapter, for stylesheet specificity.
class DOMSelector {
  declare window: Window & typeof globalThis
  declare idlUtils: IdlUtils | undefined
  declare document: Document
  declare state: State
  declare css: typeof import('css-tree') | undefined
  declare selectors:
    | Map<
        string,
        {
          ast: import('css-tree').SelectorList
          branches: Array<{
            ast: import('css-tree').Selector
            selector: string
          }>
        }
      >
    | undefined

  static configure(window: HostWindow, options: Record<string, boolean>) {
    const document = window.document
    assertSetup(window, document)
    if (
      Object.keys(options).includes('VERBOSITY') &&
      options['VERBOSITY'] !== true
    ) {
      throw new window.TypeError('The jsdom adapter requires VERBOSITY: true')
    }
    const state = getState(document)
    // Copy own options only. Always clear resolvers compiled before setup.
    state.options = {
      __proto__: null,
      ...state.options,
      ...options,
      VERBOSITY: true,
    }
    if (state.engine) {
      configureEngine(state.engine, state.options, true)
    }
  }

  static use(window: HostWindow, engine: Engine) {
    const document = window.document
    assertSetup(window, document)
    if (
      !engine ||
      typeof engine.configure !== 'function' ||
      typeof engine.match !== 'function' ||
      typeof engine.first !== 'function' ||
      typeof engine.select !== 'function' ||
      typeof engine.closest !== 'function' ||
      !engine.Snapshot ||
      engine.Snapshot.doc !== document
    ) {
      throw new window.TypeError('Expected an NWSAPI engine for this document')
    }
    const owner = engine[ENGINE_OWNER]
    if (owner && owner !== document) {
      throw new window.TypeError('The engine is bound to another document')
    }
    const state = getState(document)
    if (state.engine && state.engine !== engine) {
      throw new window.TypeError('The document already has an adapter engine')
    }
    assertThrowing(window, engine)
    configureEngine(engine, state.options, true)
    state.engine = engine
    Object.defineProperty(engine, ENGINE_OWNER, { value: document })
    return engine
  }

  constructor(
    window: Window & typeof globalThis,
    document = window.document,
    options: HostOptions = {},
  ) {
    this.window = window
    this.idlUtils = options.idlUtils
    this.document = this.wrap(document) as Document
    this.state = getState(this.document)
    if (!this.state.engine && !this.state.hostReaders) {
      this.state.hostReaders = createHostReaders(this.document, options)
    }
  }

  get engine() {
    if (!this.state.engine) {
      const engine = createNwsapi({
        document: this.document,
        hostReaders: this.state.hostReaders,
        DOMException: this.window.DOMException,
      })
      configureEngine(engine, {
        LOGERRORS: false,
        ...this.state.options,
        VERBOSITY: true,
      })
      this.state.engine = engine
      Object.defineProperty(engine, ENGINE_OWNER, { value: this.document })
    }
    return this.state.engine
  }

  // The IDL adapter supplies wrappers; public calls already supply DOM nodes.
  // Callers validate nodeType before they use a node for a query.
  wrap(node: unknown): Node | null | undefined {
    return (this.idlUtils ? this.idlUtils.wrapperForImpl(node) : node) as
      | Node
      | null
      | undefined
  }

  run(
    method: 'match',
    selector: string,
    node: unknown,
    options: QueryOptions | undefined,
    fallback: boolean,
    elementOnly: boolean,
  ): boolean
  run(
    method: 'closest' | 'first',
    selector: string,
    node: unknown,
    options: QueryOptions | undefined,
    fallback: null,
    elementOnly?: boolean,
  ): Element | null
  run(
    method: 'select',
    selector: string,
    node: unknown,
    options: QueryOptions | undefined,
    fallback: Element[],
  ): NwsapiCollection
  run(
    method: 'match' | 'closest' | 'first' | 'select',
    selector: string,
    input: unknown,
    options: QueryOptions | undefined,
    fallback: boolean | Element | Element[] | null,
    elementOnly = false,
  ) {
    try {
      const node = this.wrap(input)
      if (
        !node ||
        (elementOnly
          ? node.nodeType !== 1
          : node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)
      ) {
        throw new this.window.TypeError(
          'Expected a ' +
            (elementOnly
              ? 'Element'
              : 'Document, DocumentFragment, or Element') +
            ' node',
        )
      }
      return activate(this)[method](selector, node as Element)
    } catch (error) {
      if (options && options.noexcept) {
        return fallback
      }
      throw error
    }
  }

  matches(selector: string, node: unknown, options?: QueryOptions) {
    return this.run('match', selector, node, options, false, true)
  }

  closest(selector: string, node: unknown, options?: QueryOptions) {
    return this.run('closest', selector, node, options, null, true)
  }

  querySelector(selector: string, node: unknown, options?: QueryOptions) {
    return this.run('first', selector, node, options, null)
  }

  querySelectorAll(selector: string, node: unknown, options?: QueryOptions) {
    return this.run('select', selector, node, options, [])
  }

  clear(clearAll = false) {
    // nwsapi caches compiled selectors, not matching results. DOM changes do
    // not invalidate them. A full clear explicitly drops compiled selectors.
    if (clearAll) {
      this.engine.configure({}, true)
      if (this.selectors) {
        this.selectors.clear()
      }
    }
  }

  extractSubjects() {
    // A wildcard keeps every stylesheet rule eligible. This is conservative:
    // check() still does the matching, including escaped names and nested lists.
    return [{ id: null, className: null, tag: null }]
  }

  supports(selector: unknown) {
    if (typeof selector !== 'string') {
      return false
    }
    try {
      activate(this).match(selector, this.document.createElement('div'))
      return true
    } catch {
      return false
    }
  }

  parse(selector: string) {
    const selectors = this.selectors || (this.selectors = new Map())
    let entry = selectors.get(selector)
    if (!entry) {
      const css = this.css!
      const ast = css.parse(selector, {
        context: 'selectorList',
      }) as import('css-tree').SelectorList
      const branches: Array<{ ast: Selector; selector: string }> = []
      ast.children.forEach(node => {
        // Parsing in selectorList context gives Selector children.
        const branch = node as Selector
        // jsdom does not compute styles for pseudo-elements. Keep them out of
        // element specificity, even when another branch in the list matches.
        let pseudoElement = false
        branch.children.forEach(part => {
          if (
            part.type === 'PseudoElementSelector' ||
            (part.type === 'PseudoClassSelector' &&
              /^(before|after|first-line|first-letter)$/i.test(part.name))
          ) {
            pseudoElement = true
          }
        })
        if (!pseudoElement) {
          branches.push({ ast: branch, selector: css.generate(branch) })
        }
      })
      entry = { ast, branches }
      // Bound syntax storage without caching DOM nodes or match results.
      if (selectors.size >= 256) {
        selectors.delete(selectors.keys().next().value!)
      }
      selectors.set(selector, entry)
    }
    return entry
  }

  check(selector: string, input: unknown) {
    // Keep this outside the selector-error handler: a missing peer dependency
    // must fail visibly rather than silently suppressing stylesheet matches.
    const css: typeof import('css-tree') =
      this.css || (this.css = require('css-tree'))
    try {
      const engine = activate(this)
      const node = this.wrap(input)
      if (!node || node.nodeType !== 1) {
        return { ast: null, match: false, pseudoElement: null }
      }
      const entry = this.parse(selector)
      const matched = new css.List<CssNode>()
      for (
        let index = 0, branchesLength = entry.branches.length;
        index < branchesLength;
        index++
      ) {
        const branch = entry.branches[index]!
        if (engine.match(branch.selector, node as Element)) {
          matched.appendData(branch.ast)
        }
      }
      // Each result owns its list; checking another element cannot change it.
      const ast = { ...entry.ast, children: matched }
      return { ast, match: !matched.isEmpty, pseudoElement: null }
    } catch {
      // Invalid or unsupported stylesheet selectors do not break style reads.
      return { ast: null, match: false, pseudoElement: null }
    }
  }
}

module.exports = DOMSelector
