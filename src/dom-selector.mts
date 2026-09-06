'use strict';

const createNwsapi = require('./nwsapi.js');

// jsdom passes implementation nodes in and expects public wrappers back.
// css-tree is needed only by this adapter, for stylesheet specificity.
class DOMSelector {
  constructor(window, document = window.document, options = {}) {
    this.window = window;
    this.idlUtils = options.idlUtils;
    this.document = this.wrap(document);
    this.engine = createNwsapi({
      document: this.document,
      DOMException: window.DOMException
    });
    this.engine.configure({ LOGERRORS: false, VERBOSITY: true });
  }

  wrap(node) {
    return this.idlUtils ? this.idlUtils.wrapperForImpl(node) : node;
  }

  run(method, selector, node, options, fallback, elementOnly = false) {
    try {
      node = this.wrap(node);
      if (!node || (elementOnly ? node.nodeType !== 1 :
        node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)) {
        throw new this.window.TypeError('Expected a ' +
          (elementOnly ? 'Element' : 'Document, DocumentFragment, or Element') + ' node');
      }
      return this.engine[method](selector, node);
    } catch (error) {
      if (options && options.noexcept) return fallback;
      throw error;
    }
  }

  matches(selector, node, options) {
    return this.run('match', selector, node, options, false, true);
  }

  closest(selector, node, options) {
    return this.run('closest', selector, node, options, null, true);
  }

  querySelector(selector, node, options) {
    return this.run('first', selector, node, options, null);
  }

  querySelectorAll(selector, node, options) {
    return this.run('select', selector, node, options, []);
  }

  clear(clearAll = false) {
    // nwsapi caches compiled selectors, not matching results. DOM changes do
    // not invalidate them. A full clear explicitly drops compiled selectors.
    if (clearAll) {
      this.engine.configure({}, true);
      if (this.selectors) this.selectors.clear();
    }
  }

  extractSubjects() {
    // A wildcard keeps every stylesheet rule eligible. This is conservative:
    // check() still does the matching, including escaped names and nested lists.
    return [{ id: null, className: null, tag: null }];
  }

  supports(selector) {
    if (typeof selector !== 'string') return false;
    try {
      this.engine.match(selector, this.document.createElement('div'));
      return true;
    } catch {
      return false;
    }
  }

  parse(selector) {
    const selectors = this.selectors || (this.selectors = new Map());
    let entry = selectors.get(selector);
    if (!entry) {
      const ast = this.css.parse(selector, { context: 'selectorList' });
      const branches = [];
      ast.children.forEach(branch => {
        // jsdom does not compute styles for pseudo-elements. Keep them out of
        // element specificity, even when another branch in the list matches.
        let pseudoElement = false;
        branch.children.forEach(part => {
          if (part.type === 'PseudoElementSelector' ||
            (part.type === 'PseudoClassSelector' &&
             /^(before|after|first-line|first-letter)$/i.test(part.name))) {
            pseudoElement = true;
          }
        });
        if (!pseudoElement) {
          branches.push({ ast: branch, selector: this.css.generate(branch) });
        }
      });
      entry = { ast, branches };
      // Bound syntax storage without caching DOM nodes or match results.
      if (selectors.size >= 256) selectors.delete(selectors.keys().next().value);
      selectors.set(selector, entry);
    }
    return entry;
  }

  check(selector, node) {
    // Keep this outside the selector-error handler: a missing peer dependency
    // must fail visibly rather than silently suppressing stylesheet matches.
    const css = this.css || (this.css = require('css-tree'));
    try {
      node = this.wrap(node);
      if (!node || node.nodeType !== 1) {
        return { ast: null, match: false, pseudoElement: null };
      }
      const entry = this.parse(selector);
      const matched = new css.List();
      for (const branch of entry.branches) {
        if (this.engine.match(branch.selector, node)) matched.appendData(branch.ast);
      }
      // Each result owns its list; checking another element cannot change it.
      const ast = { ...entry.ast, children: matched };
      return { ast, match: !matched.isEmpty, pseudoElement: null };
    } catch {
      // Invalid or unsupported stylesheet selectors do not break style reads.
      return { ast: null, match: false, pseudoElement: null };
    }
  }
}

module.exports = DOMSelector;
