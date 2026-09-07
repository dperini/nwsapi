'use strict'

const createNwsapi = require('./nwsapi.js')
type Engine = ReturnType<typeof createNwsapi>
type State = {
  engine?: Engine
  options: Record<string, boolean>
  active: boolean
}

// A package override can load a second copy. Versioned, non-enumerable slots
// share adapter state across those copies without a global window registry.
const DOCUMENT_STATE = Symbol.for('nwsapi.DOMSelector.document.v1')
const ENGINE_OWNER = Symbol.for('nwsapi.DOMSelector.owner.v1')

function assertSetup(window, document) {
  const state = document[DOCUMENT_STATE] as State | undefined
  if (state && state.active) {
    throw new window.TypeError('Configure the adapter before its first use')
  }
}

function getState(document) {
  let state = document[DOCUMENT_STATE] as State | undefined
  if (!state) {
    state = { options: { __proto__: null }, active: false }
    Object.defineProperty(document, DOCUMENT_STATE, { value: state })
  }
  return state
}

function activate(adapter) {
  const engine = adapter.engine
  if (!adapter.state.active) {
    assertThrowing(adapter.window, engine)
    adapter.state.active = true
  }
  return engine
}

function assertThrowing(window, engine) {
  if (engine.configure().VERBOSITY !== true) {
    throw new window.TypeError('The jsdom adapter requires VERBOSITY: true')
  }
}

// jsdom passes implementation nodes in and expects public wrappers back.
// css-tree is needed only by this adapter, for stylesheet specificity.
class DOMSelector {
  declare window: Window & typeof globalThis
  declare idlUtils: { wrapperForImpl(node: unknown): Node } | undefined
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

  static configure(window, options: Record<string, boolean>) {
    const document = window.document
    assertSetup(window, document)
    if (
      Object.keys(options).includes('VERBOSITY') &&
      options.VERBOSITY !== true
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
      state.engine.configure(state.options, true)
    }
  }

  static use(window, engine: Engine) {
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
    engine.configure(state.options, true)
    state.engine = engine
    Object.defineProperty(engine, ENGINE_OWNER, { value: document })
    return engine
  }

  constructor(
    window,
    document = window.document,
    options: { idlUtils?: { wrapperForImpl(node: unknown): Node } } = {},
  ) {
    this.window = window
    this.idlUtils = options.idlUtils
    this.document = this.wrap(document)
    this.state = getState(this.document)
  }

  get engine() {
    if (!this.state.engine) {
      const engine = createNwsapi({
        document: this.document,
        DOMException: this.window.DOMException,
      })
      engine.configure({
        LOGERRORS: false,
        ...this.state.options,
        VERBOSITY: true,
      })
      this.state.engine = engine
      Object.defineProperty(engine, ENGINE_OWNER, { value: this.document })
    }
    return this.state.engine
  }

  wrap(node) {
    return this.idlUtils ? this.idlUtils.wrapperForImpl(node) : node
  }

  run(method, selector, node, options, fallback, elementOnly = false) {
    try {
      node = this.wrap(node)
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
      return activate(this)[method](selector, node)
    } catch (error) {
      if (options && options.noexcept) {
        return fallback
      }
      throw error
    }
  }

  matches(selector, node, options?) {
    return this.run('match', selector, node, options, false, true)
  }

  closest(selector, node, options?) {
    return this.run('closest', selector, node, options, null, true)
  }

  querySelector(selector, node, options?) {
    return this.run('first', selector, node, options, null)
  }

  querySelectorAll(selector, node, options?) {
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

  supports(selector) {
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

  parse(selector) {
    const selectors = this.selectors || (this.selectors = new Map())
    let entry = selectors.get(selector)
    if (!entry) {
      const ast = this.css.parse(selector, {
        context: 'selectorList',
      }) as import('css-tree').SelectorList
      const branches = []
      ast.children.forEach((branch: import('css-tree').Selector) => {
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
          branches.push({ ast: branch, selector: this.css.generate(branch) })
        }
      })
      entry = { ast, branches }
      // Bound syntax storage without caching DOM nodes or match results.
      if (selectors.size >= 256) {
        selectors.delete(selectors.keys().next().value)
      }
      selectors.set(selector, entry)
    }
    return entry
  }

  check(selector, node) {
    // Keep this outside the selector-error handler: a missing peer dependency
    // must fail visibly rather than silently suppressing stylesheet matches.
    const css = this.css || (this.css = require('css-tree'))
    try {
      const engine = activate(this)
      node = this.wrap(node)
      if (!node || node.nodeType !== 1) {
        return { ast: null, match: false, pseudoElement: null }
      }
      const entry = this.parse(selector)
      const matched = new css.List()
      for (const branch of entry.branches) {
        if (engine.match(branch.selector, node)) {
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
