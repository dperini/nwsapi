type SelectorToken = { text: string; kind: string }

export function selectorTokens(source: string): SelectorToken[] {
  const parts =
    source.match(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[.#][\w-]+|::?[\w-]+|[\w-]+|[^\w]/g,
    ) ?? []
  let attribute = false
  return parts.map(text => {
    let kind = 'plain'
    if (/^["']/.test(text)) {
      kind = 'string'
    } else if (/^[.#]/.test(text)) {
      kind = 'function'
    } else if (text.startsWith(':')) {
      kind = 'keyword'
    } else if (/^\d/.test(text)) {
      kind = 'number'
    } else if (/^[\[\]()>+~=|^$*,]$/.test(text)) {
      kind = 'operator'
    } else if (attribute && /^[\w-]+$/.test(text)) {
      kind = 'type'
    }
    if (text === '[' || text === ']') {
      attribute = text === '['
    }
    return { text, kind }
  })
}

export function highlightSelector(node: HTMLElement, source: string) {
  const fragment = document.createDocumentFragment()
  for (const token of selectorTokens(source)) {
    const span = document.createElement('span')
    span.className = `syntax-${token.kind}`
    span.textContent = token.text
    fragment.append(span)
  }
  node.replaceChildren(fragment)
}
