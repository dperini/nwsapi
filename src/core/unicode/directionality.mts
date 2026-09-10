import {
  directionParent,
  excluded,
  explicitDirection,
  htmlName,
  shadowHost,
  slotHost,
} from './dom.mts'
import type { Direction } from './text-direction.mts'
import { textDirection } from './text-direction.mts'

export {
  directionParent,
  excluded,
  explicitDirection,
  htmlName,
  shadowHost,
  slotHost,
} from './dom.mts'
export { textDirection } from './text-direction.mts'

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
      const value = textDirection((node as Text).data)
      if (value) {
        return value
      }
    } else if (node.nodeType === 1) {
      const element = node as Element
      skip = element !== root && excluded(element)
      if (!skip) {
        const host = slotHost(element)
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
    return textDirection(value) || (value ? 'ltr' : null)
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
            ? textDirection((node as Text).data)
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
