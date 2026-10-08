import { element, writeUnitText } from './ui.mts'
import type { parse } from 'gpu-lexer'
import { highlightSelector } from './selector.mts'
import { attachCodeCopy } from './code-copy.mts'

let parser: Promise<{ parse: typeof parse }> | undefined
let queue = Promise.resolve()
const pending = new WeakMap<HTMLElement, string>()
const finished = new WeakMap<HTMLElement, string>()
const observed = new Set<HTMLElement>()
let unavailable = false
const kinds = new Set([
  'plain',
  'comment',
  'string',
  'number',
  'keyword',
  'type',
  'function',
  'constant',
  'operator',
])

async function highlight(node: HTMLElement, source: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    if (unavailable) {
      return
    }
    parser ??= import('gpu-lexer')
    const spans = await Promise.race([
      parser.then(({ parse }) => parse(source)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Highlighting timed out')),
          8000,
        )
      }),
    ])
    if (node.textContent !== source) {
      return
    }
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (let i = 0, length = spans.length; i < length; i += 1) {
      const span = spans[i]!
      if (
        !Number.isSafeInteger(span.start) ||
        !Number.isSafeInteger(span.end) ||
        span.start !== cursor ||
        span.end <= cursor ||
        span.end > source.length ||
        !kinds.has(span.type)
      ) {
        return
      }
      const token = document.createElement('span')
      token.className = `syntax-${span.type}`
      writeUnitText(token, source, span.start, span.end)
      fragment.append(token)
      cursor = span.end
    }
    if (cursor !== source.length) {
      return
    }
    node.replaceChildren(fragment)
    node.dataset['highlight'] = 'gpu-lexer'
    finished.set(node, source)
  } catch {
    unavailable = true
    if (node.textContent === source) {
      node.dataset['highlight'] = 'plain'
    }
  } finally {
    clearTimeout(timeout)
    if (node.textContent === source) {
      if (node.dataset['highlight'] === 'pending') {
        node.dataset['highlight'] = 'plain'
      }
      if (node.dataset['highlight'] === 'plain') {
        writeUnitText(node, source)
      }
      finished.set(node, source)
      node.removeAttribute('aria-busy')
    }
    if (pending.get(node) === source) {
      pending.delete(node)
    }
  }
}

function schedule(node: HTMLElement) {
  const source = node.textContent ?? ''
  if (
    !source ||
    pending.get(node) === source ||
    finished.get(node) === source
  ) {
    return
  }
  pending.set(node, source)
  node.dataset['highlight'] = 'pending'
  node.setAttribute('aria-busy', 'true')
  queue = queue.then(() => highlight(node, source))
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      schedule(entry.target as HTMLElement)
    }
  })
})

function observe(node: HTMLElement) {
  attachCodeCopy(node)
  node.tabIndex = 0
  if (!observed.has(node)) {
    node.dataset['highlight'] = 'pending'
    node.setAttribute('aria-busy', 'true')
    observed.add(node)
    observer.observe(node)
  }
  const box = node.getBoundingClientRect()
  if (box.height > 0 && box.top < innerHeight && box.bottom > 0) {
    schedule(node)
  }
}

export function code(id: string, source: string) {
  const node = element(id)
  if (node.textContent === source) {
    observe(node)
    return
  }
  const height = node.getBoundingClientRect().height
  if (height > 0) {
    node.style.minHeight = `${height}px`
  }
  node.dataset['highlight'] = 'pending'
  node.setAttribute('aria-busy', 'true')
  finished.delete(node)
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
