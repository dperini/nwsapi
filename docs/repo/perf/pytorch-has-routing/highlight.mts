import { element } from './ui.mts'
import type { parse } from 'gpu-lexer'

let parser: Promise<{ parse: typeof parse }> | undefined
let queue = Promise.resolve()
const pending = new WeakMap<HTMLElement, string>()
const finished = new WeakMap<HTMLElement, string>()
const observed = new Set<HTMLElement>()
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
  try {
    parser ??= import('gpu-lexer')
    const { parse } = await parser
    const spans = await parse(source)
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
      token.textContent = source.slice(span.start, span.end)
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
    node.dataset['highlight'] = 'plain'
  } finally {
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
  if (!observed.has(node)) {
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
  node.textContent = source
  observe(node)
}

export function initializeHighlighting() {
  document.querySelectorAll<HTMLElement>('pre').forEach(observe)
  document.querySelectorAll<HTMLDetailsElement>('details').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) {
        details.querySelectorAll<HTMLElement>('pre').forEach(observe)
      }
    })
  })
}
