import { element, timeUnits, writeUnitText } from './ui.mts'
import type { parse } from './highlight-tokens.mts'
import { highlightSelector } from './selector.mts'
import { attachCodeCopy } from './code-copy.mts'

let parser: Promise<{ parse: typeof parse }> | undefined
let queue = Promise.resolve()
const pending = new WeakMap<HTMLElement, string>()
const finished = new WeakMap<HTMLElement, string>()
const observed = new WeakSet<HTMLElement>()
let unavailable = false

function tokenFragment(spans: ReturnType<typeof parse>, source: string) {
  const fragment = document.createDocumentFragment()
  const units = timeUnits(source)
  for (const span of spans) {
    const token = document.createElement('span')
    token.className = `syntax-${span.type}`
    writeUnitText(token, source, span.start, span.end, units)
    fragment.append(token)
  }
  return fragment
}

function language(node: HTMLElement) {
  const codeNode = node.querySelector('code')
  const classes = codeNode?.classList ?? node.classList
  const marked = [...classes].find(name => name.startsWith('language-'))
  return node.dataset['language'] ?? marked?.slice(9) ?? 'plain'
}

async function highlight(
  node: HTMLElement,
  source: string,
  lang: string,
  key: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    if (unavailable || pending.get(node) !== key) {
      return
    }
    parser ??= import('./highlight-tokens.mts')
    const spans = await Promise.race([
      parser.then(({ parse }) => parse(source, lang)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Highlighting timed out')),
          8000,
        )
      }),
    ])
    if (node.textContent !== source || pending.get(node) !== key) {
      return
    }
    const fragment = tokenFragment(spans, source)
    node.replaceChildren(fragment)
    node.dataset['highlight'] = 'highlights'
  } catch {
    unavailable = true
    if (node.textContent === source && pending.get(node) === key) {
      node.dataset['highlight'] = 'plain'
    }
  } finally {
    clearTimeout(timeout)
    if (node.textContent === source && pending.get(node) === key) {
      if (node.dataset['highlight'] === 'pending') {
        node.dataset['highlight'] = 'plain'
      }
      if (node.dataset['highlight'] === 'plain') {
        writeUnitText(node, source)
      }
      finished.set(node, key)
      node.removeAttribute('aria-busy')
    }
    if (pending.get(node) === key) {
      pending.delete(node)
    }
  }
}

function schedule(node: HTMLElement) {
  const source = node.textContent ?? ''
  const lang = language(node)
  const key = `${lang}\0${source}`
  if (!source) {
    node.dataset['highlight'] = 'plain'
    node.removeAttribute('aria-busy')
    pending.delete(node)
    return
  }
  if (pending.get(node) === key || finished.get(node) === key) {
    return
  }
  pending.set(node, key)
  node.dataset['highlight'] = 'pending'
  node.setAttribute('aria-busy', 'true')
  queue = queue.then(() => highlight(node, source, lang, key))
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      schedule(entry.target as HTMLElement)
    }
  })
})

function observe(node: HTMLElement) {
  node.dataset['language'] = language(node)
  attachCodeCopy(node)
  node.tabIndex = 0
  if (!observed.has(node)) {
    node.dataset['highlight'] = 'pending'
    node.setAttribute('aria-busy', 'true')
    observed.add(node)
    observer.observe(node)
  }
  const box = node.getBoundingClientRect()
  if (
    !node.textContent ||
    (box.height > 0 && box.top < innerHeight && box.bottom > 0)
  ) {
    schedule(node)
  }
}

export function code(id: string, source: string, lang = 'javascript') {
  const node = element(id)
  if (node.textContent === source && node.dataset['language'] === lang) {
    observe(node)
    return
  }
  node.dataset['language'] = lang
  const height = node.getBoundingClientRect().height
  if (height > 0) {
    node.style.minHeight = `${height}px`
  }
  node.dataset['highlight'] = 'pending'
  node.setAttribute('aria-busy', 'true')
  finished.delete(node)
  pending.delete(node)
  node.textContent = source
  observe(node)
}

export function initializeHighlighting() {
  document.querySelectorAll<HTMLElement>('code:not(pre code)').forEach(node => {
    const source = node.textContent ?? ''
    if (/^[.#:][\w-]+/.test(source)) {
      highlightSelector(node, source)
    }
  })
  document.querySelectorAll<HTMLElement>('pre').forEach(observe)
  document.querySelectorAll<HTMLDetailsElement>('details').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) {
        details.querySelectorAll<HTMLElement>('pre').forEach(observe)
      }
    })
  })
}
