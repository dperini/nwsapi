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

export function slotHost(element: Element): Element | null {
  return htmlName(element) === 'slot' && element.getRootNode
    ? shadowHost(element.getRootNode())
    : null
}
