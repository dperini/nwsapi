import { createRequire } from 'node:module'
import type * as CssTree from 'css-tree'
import type { CssNode, Selector, SelectorList } from 'css-tree'
import { nativeBinding } from '../native-binding.mts'
import { queryNativeHost } from '../native-query.mts'
import type { NativeQueryBinding } from '../native/types.mts'
import type { DOMSelectorEngine } from '../dom-selector.mts'

const require = createRequire(import.meta.url)

export type StylesheetEntry = {
  ast: SelectorList
  branches: Array<{ ast: Selector; selector: string }>
}

export function parseStylesheetSelector(
  css: typeof CssTree,
  selectors: Map<string, StylesheetEntry>,
  selector: string,
): StylesheetEntry {
  let entry = selectors.get(selector)
  if (!entry) {
    const ast = css.parse(selector, {
      context: 'selectorList',
    }) as SelectorList
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

export function checkStylesheetSelector(
  css: typeof CssTree,
  activate: () => DOMSelectorEngine,
  wrap: (input: unknown) => Node | null | undefined,
  parse: (selector: string) => StylesheetEntry,
  nativeQuery: NativeQueryBinding | undefined,
  document: Document,
  selector: string,
  input: unknown,
) {
  try {
    const engine = activate()
    const node = wrap(input)
    if (!node || node.nodeType !== 1) {
      return { ast: null, match: false, pseudoElement: null }
    }
    const entry = parse(selector)
    const matched = new css.List<CssNode>()
    for (
      let index = 0, branchesLength = entry.branches.length;
      index < branchesLength;
      index++
    ) {
      const branch = entry.branches[index]!
      const native = nativeQuery
        ? queryNativeHost(
            nativeBinding(engine, nativeQuery),
            document,
            'match',
            branch.selector,
            node as Element,
          )
        : undefined
      if (
        native !== undefined
          ? native.length > 0
          : engine.match(branch.selector, node as Element)
      ) {
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

export function loadCssTree(
  current: typeof CssTree | undefined,
): typeof CssTree {
  return current || require('css-tree')
}
