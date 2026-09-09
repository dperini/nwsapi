import { leftToRight, rightToLeft, arabicLetter } from '../external/unicode.js'

export type Direction = 'ltr' | 'rtl'

// The three immutable expressions are bundled once, outside engine instances.
export function firstStrong(text: string): Direction | null {
  const left = text.search(leftToRight)
  if (left === 0) {
    return 'ltr'
  }
  const prefix = left < 0 ? text : text.slice(0, left)
  if (rightToLeft.test(prefix) || arabicLetter.test(prefix)) {
    return 'rtl'
  }
  return left < 0 ? null : 'ltr'
}

export function htmlName(element: Element): string {
  return element.namespaceURI === 'http://www.w3.org/1999/xhtml'
    ? element.localName
    : ''
}

export function explicitDirection(element: Element): string {
  return htmlName(element)
    ? (element.getAttribute('dir') || '').toLowerCase()
    : ''
}

export function shadowHost(node: Node): Element | null {
  return node.nodeType === 11 ? (node as ShadowRoot).host || null : null
}

export function directionParent(element: Element): Element | null {
  return (
    element.parentElement ||
    (element.parentNode && shadowHost(element.parentNode))
  )
}

export function excluded(element: Element): boolean {
  const name = htmlName(element)
  return (
    !!name &&
    (/^(?:bdi|script|style|textarea)$/.test(name) ||
      /^(?:ltr|rtl|auto)$/.test(explicitDirection(element)))
  )
}

// Walk the live DOM without retaining text, nodes, or mutation-sensitive results.
export function containedText(
  root: Element,
  excludeRoot: boolean,
): Direction | null {
  if (excludeRoot && excluded(root)) {
    return null
  }
  let node: Node | null = root
  while (node) {
    let skip = false
    if (node.nodeType === 3) {
      const value = firstStrong((node as Text).data)
      if (value) {
        return value
      }
    } else if (node.nodeType === 1) {
      const element = node as Element
      skip = element !== root && excluded(element)
      if (!skip && htmlName(element) === 'slot' && element.getRootNode) {
        const host = shadowHost(element.getRootNode())
        if (host) {
          return directionality(host)
        }
      }
    }
    if (!skip && node.firstChild) {
      node = node.firstChild
      continue
    }
    while (node !== root && !node.nextSibling) {
      node = node.parentNode!
    }
    node = node === root ? null : node.nextSibling
  }
  return null
}

export function autoDirection(element: Element): Direction | null {
  const name = htmlName(element)
  if (
    name === 'textarea' ||
    (name === 'input' &&
      /^(?:hidden|text|search|tel|url|email|password|submit|reset|button)$/.test(
        (element as HTMLInputElement).type,
      ))
  ) {
    const value = (element as HTMLInputElement | HTMLTextAreaElement).value
    return firstStrong(value) || (value ? 'ltr' : null)
  }
  if (
    name === 'slot' &&
    element.getRootNode &&
    shadowHost(element.getRootNode())
  ) {
    const assigned = (element as HTMLSlotElement).assignedNodes()
    if (assigned.length) {
      for (let index = 0; index < assigned.length; index++) {
        const node = assigned[index]!
        const value =
          node.nodeType === 3
            ? firstStrong((node as Text).data)
            : node.nodeType === 1
              ? containedText(node as Element, true)
              : null
        if (value) {
          return value
        }
      }
      return null
    }
  }
  return containedText(element, false)
}

// https://html.spec.whatwg.org/multipage/dom.html#the-directionality
export function directionality(element: Element): Direction {
  let current: Element | null = element
  while (current) {
    const dir = explicitDirection(current)
    if (dir === 'ltr' || dir === 'rtl') {
      return dir
    }
    const name = htmlName(current)
    if (dir === 'auto' || name === 'bdi') {
      return autoDirection(current) || 'ltr'
    }
    if (name === 'input' && (current as HTMLInputElement).type === 'tel') {
      return 'ltr'
    }
    current = directionParent(current)
  }
  return 'ltr'
}
