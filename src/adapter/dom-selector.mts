import { validateCacheOptions } from '../core/initialize/configuration.mts'
import { createHostReaders } from './jsdom.mts'
import type { HostOptions, HostReaders, IdlUtils } from './jsdom.mts'
import { queryNativeHost, queryNativeTraversal } from './native-query.mts'
import type { NativeQueryBinding } from './native-query.mts'
import { nativeBinding, queryNativeAdapter } from './native-binding.mts'
import type { QueryMethod } from './native-binding.mts'
import { toHostNodeList } from './selector/list.mts'
import { supportsNativeSelector } from './selector/supports.mts'
import {
  checkStylesheetSelector,
  loadCssTree,
  parseStylesheetSelector,
} from './selector/stylesheet.mts'
import { NATIVE_OPERATOR_GRAMMAR } from './native/types.mts'

type NwsapiEngine = import('../../.config/runtime.d.ts').NwsapiEngine
type NwsapiCollection = import('../../.config/runtime.d.ts').NwsapiCollection

type HostWindow = Window & typeof globalThis
type Engine = NwsapiEngine & {
  Snapshot: {
    doc: Document
    isFocusable: NwsapiEngine['Snapshot']['isFocusable']
    matchesNative: NwsapiEngine['Snapshot']['matchesNative']
  }
  Operators: Record<string, unknown>
  Combinators: Record<string, (match: RegExpMatchArray) => string>
  CFG: { operators: string; combinators: string }
  customBulkHasPlanner: boolean
  hasPluginPlans: boolean
  [NATIVE_OPERATOR_GRAMMAR]?: string
  customSyntax: boolean
  customResolvers: boolean
  routePlannerHost?:
    | import('../core/select/has/policy.mts').RoutePlannerHost
    | undefined
  directionality(element: Element): 'ltr' | 'rtl'
  nativeTraversal?: (
    direction: 'up' | 'down' | 'next' | 'previous',
    expression: string | number | null | undefined,
    node: Node,
  ) => Element | null | undefined
  [ENGINE_OWNER]?: Document
}
const createNwsapi: (
  host: {
    document: Document
    DOMException: typeof DOMException
    hostReaders?: HostReaders | undefined
  } & Pick<
    HostWindow,
    'Element' | 'HTMLElement' | 'Document' | 'DocumentFragment' | 'NodeList'
  >,
) => Engine = require('../nwsapi.js')
type QueryOptions = { noexcept?: boolean | undefined }
type AdapterDocument = Document & { [DOCUMENT_STATE]?: State }
type State = {
  engine?: Engine
  options: Record<string, boolean | number> | { __proto__: null }
  active: boolean
  setupPlanCaches?: Map<NativeQueryBinding, number>
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
    delete adapter.state.setupPlanCaches
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

function isWrapper(utils: IdlUtils, node: Node): boolean {
  try {
    return Boolean(utils.implForWrapper?.(node))
  } catch {
    return false
  }
}

function wrapperForImpl(utils: IdlUtils, node: unknown): Node | undefined {
  try {
    return utils.wrapperForImpl(node) ?? undefined
  } catch {
    return undefined
  }
}

// jsdom passes implementation nodes in and expects public wrappers back.
// css-tree is needed only by this adapter, for stylesheet specificity.
class DOMSelector {
  declare window: Window & typeof globalThis
  declare nativeQuery: NativeQueryBinding | undefined
  declare nativePlanCacheId: number | undefined
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

  static configure(
    window: HostWindow,
    options: Record<string, boolean | number>,
  ) {
    const document = window.document
    assertSetup(window, document)
    options = { ...options }
    validateCacheOptions(options)
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
      const setupPlanCaches = Array.from(state.setupPlanCaches ?? [])
      for (
        let index = 0, length = setupPlanCaches.length;
        index < length;
        index++
      ) {
        const [binding, id] = setupPlanCaches[index]!
        binding.clearPlanCache?.(id)
      }
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
    this.nativeQuery = options.nativeQuery
    this.nativePlanCacheId = undefined
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
        Element: this.window.Element,
        HTMLElement: this.window.HTMLElement,
        Document: this.window.Document,
        DocumentFragment: this.window.DocumentFragment,
        NodeList: this.window.NodeList,
      })
      engine.useRoutePlanner('jsdom')
      configureEngine(engine, {
        LOGERRORS: false,
        ...this.state.options,
        VERBOSITY: true,
      })
      this.state.engine = engine
      Object.defineProperty(engine, ENGINE_OWNER, { value: this.document })
    }
    const binding = this.nativeQuery
    if (binding) {
      const engine = this.state.engine
      const native = nativeBinding(engine, binding)
      this.nativePlanCacheId = native.planCacheId
      if (
        !this.state.active &&
        binding.clearPlanCache &&
        native.planCacheId !== undefined
      ) {
        this.state.setupPlanCaches ??= new Map()
        this.state.setupPlanCaches.set(binding, native.planCacheId)
      }
      engine.nativeTraversal = (direction, expression, node) =>
        queryNativeTraversal(
          nativeBinding(engine, binding),
          this.document,
          direction,
          expression,
          node,
        )
    }
    return this.state.engine
  }

  // The IDL adapter supplies wrappers; public calls already supply DOM nodes.
  // Callers validate nodeType before they use a node for a query.
  wrap(node: unknown): Node | null | undefined {
    if (!this.idlUtils) {
      return node as Node | null | undefined
    }
    if (this.nativeQuery?.wrapHostNode) {
      return this.nativeQuery.wrapHostNode(
        node,
        this.idlUtils,
        isWrapper,
        wrapperForImpl,
      )
    }
    if (
      node &&
      typeof node === 'object' &&
      isWrapper(this.idlUtils, node as Node)
    ) {
      return node as Node
    }
    return wrapperForImpl(this.idlUtils, node)
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
  // eslint-disable-next-line complexity -- validates and routes public jsdom selector calls.
  run(
    method: QueryMethod,
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
      const engine = activate(this)
      if (this.nativeQuery && typeof selector === 'string') {
        const native = queryNativeAdapter(
          engine,
          this.nativeQuery,
          this.document,
          method,
          selector,
          node as Document | DocumentFragment | Element,
        )
        if (native !== undefined) {
          if (method === 'select' && engine.Config.NODE_LIST) {
            return toHostNodeList(this.window, native as Element[])
          }
          return native
        }
      }
      return engine[method](selector, node as Element)
    } catch (error) {
      if (options && options.noexcept) {
        return fallback
      }
      throw error
    }
  }

  install(all = false) {
    const binding = this.nativeQuery
    const engine = activate(this)
    if (!binding) {
      engine.install(all)
      return
    }
    const cacheId = this.nativePlanCacheId
    const query: import('../core/dom/install.mts').InstalledQuery = (
      method,
      selector,
      context,
    ) =>
      queryNativeHost(
        nativeBinding(engine, binding),
        this.document,
        method,
        selector,
        context,
      )
    if (cacheId !== undefined && binding.clearPlanCache) {
      query.clearCache = () => binding.clearPlanCache?.(cacheId)
    }
    engine.install(all, query)
  }

  uninstall() {
    this.state.engine?.uninstall()
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
      this.nativeQuery?.clearPlanCache?.(this.nativePlanCacheId)
    }
  }

  extractSubjects() {
    // A wildcard keeps every stylesheet rule eligible. This is conservative:
    // check() still does the matching, including escaped names and nested lists.
    return [{ id: null, className: null, tag: null }]
  }

  supports(selector: unknown) {
    return supportsNativeSelector(
      selector,
      () => activate(this),
      this.nativeQuery,
      this.document,
    )
  }

  parse(selector: string) {
    const selectors = this.selectors || (this.selectors = new Map())
    return parseStylesheetSelector(this.css!, selectors, selector)
  }

  check(selector: string, input: unknown) {
    // Keep this outside the selector-error handler: a missing peer dependency
    // must fail visibly rather than silently suppressing stylesheet matches.
    const css = (this.css = loadCssTree(this.css))
    return checkStylesheetSelector(
      css,
      () => activate(this),
      value => this.wrap(value),
      value => this.parse(value),
      this.nativeQuery,
      this.document,
      selector,
      input,
    )
  }
}

export type DOMSelectorAdapter = typeof DOMSelector
export type DOMSelectorEngine = Engine

module.exports = DOMSelector
