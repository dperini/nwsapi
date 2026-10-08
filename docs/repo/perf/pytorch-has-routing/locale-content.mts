import italian from '../../../../assets/repo/model-guide/locales/strings.it.generated.json'

type Locale = 'en' | 'it'
type Source = { original: string; rendered: string }
const dictionary: Record<string, string> = italian
const attributes = [
  'aria-label',
  'aria-valuetext',
  'title',
  'alt',
  'placeholder',
]
const excluded =
  'pre, code, script, style, svg, .selector-code, .spoken-word, [data-language-select], [data-i18n], [data-locale-content], [translate="no"]:not(html)'
const sources = new WeakMap<Node, Source>()
const attributeSources = new WeakMap<Element, Map<string, Source>>()
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const templates = Object.entries(dictionary)
  .filter(
    ([source]) =>
      /ZXQ\d+QXZ/.test(source) &&
      source.replace(/ZXQ\d+QXZ/g, '').replace(/[^a-z]/gi, '').length >= 4,
  )
  .map(([source, translated]) => ({
    pattern: new RegExp(
      '^' +
        source
          .split(/ZXQ\d+QXZ/)
          .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('(.+?)') +
        '$',
    ),
    slots: Array.from(source.matchAll(/ZXQ(\d+)QXZ/g), match =>
      Number(match[1]),
    ),
    translated,
    length: source.replace(/ZXQ\d+QXZ/g, '').length,
  }))
  .toSorted((a, b) => b.length - a.length)

function translateTemplate(source: string): string {
  for (const template of templates) {
    const match = template.pattern.exec(source)
    if (!match) {
      continue
    }
    return template.translated.replace(
      /ZXQ(\d+)QXZ/g,
      (_slot, index: string) => {
        const value = match[template.slots.indexOf(Number(index)) + 1] ?? ''
        return /^\.[\w-]+(?:\[|[:.#])/.test(value)
          ? value
          : (dictionary[value] ?? value)
      },
    )
  }
  return source
}

export function localizeText(source: string, locale: Locale): string {
  if (
    locale === 'en' ||
    /^\.[\w-]+(?:\[|[:.#])/.test(source) ||
    /^\S+\.(?:mts|mjs|js|py|json|md)$/.test(source)
  ) {
    return source
  }
  const key = normalize(source)
  if (!key) {
    return source
  }
  const translated = dictionary[key] ?? translateTemplate(key)
  if (translated === key) {
    return source
  }
  return (
    (/^[,.;:!?]/.test(translated) ? '' : (source.match(/^\s*/)?.[0] ?? '')) +
    translated +
    (source.match(/\s*$/)?.[0] ?? '')
  )
}

function remember(previous: Source | undefined, value: string): Source {
  return previous?.rendered === value
    ? previous
    : { original: value, rendered: value }
}

function localizeNode(node: Text, locale: Locale) {
  if (node.parentElement?.closest(excluded)) {
    return
  }
  const source = remember(sources.get(node), node.data)
  source.rendered = localizeText(source.original, locale)
  sources.set(node, source)
  if (node.data !== source.rendered) {
    node.data = source.rendered
  }
}

function localizeAttributes(node: Element, locale: Locale) {
  if (node.closest('pre, code, script, style, [translate="no"]:not(html)')) {
    return
  }
  const records = attributeSources.get(node) ?? new Map<string, Source>()
  for (const name of attributes) {
    const value = node.getAttribute(name)
    if (!value) {
      continue
    }
    const source = remember(records.get(name), value)
    source.rendered = localizeText(source.original, locale)
    records.set(name, source)
    if (value !== source.rendered) {
      node.setAttribute(name, source.rendered)
    }
  }
  attributeSources.set(node, records)
}

export function initializeContentLocale(getLocale: () => Locale) {
  const roots = new Set<Node>()
  let pending = false
  function walk(root: Node) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    )
    let node: Node | null = root
    while (node) {
      if (node instanceof Text) {
        localizeNode(node, getLocale())
      } else if (node instanceof Element) {
        localizeAttributes(node, getLocale())
      }
      node = walker.nextNode()
    }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      roots.add(record.target)
    }
    if (!pending) {
      pending = true
      queueMicrotask(flush)
    }
  })
  function flush() {
    pending = false
    for (const root of roots) {
      if (root.isConnected) {
        walk(root)
      }
    }
    roots.clear()
    // Discard our own text mutations so translated strings never become source text.
    observer.takeRecords()
  }
  function refresh() {
    walk(document.documentElement)
    observer.takeRecords()
  }
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: attributes,
  })
  window.addEventListener('guide-locale-change', refresh)
  refresh()
}
