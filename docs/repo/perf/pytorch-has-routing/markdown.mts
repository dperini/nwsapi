const allowedTags = new Set(
  'a abbr b blockquote br code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input kbd li ol p picture pre s samp section small span strong sub summary sup table tbody td th thead tr ul var'.split(
    ' ',
  ),
)
const allowedAttributes = new Set(
  'alt checked class colspan disabled height href id open reversed role rowspan scope src start title type width'.split(
    ' ',
  ),
)

export function readingMarkup(source: string) {
  const template = document.createElement('template')
  template.innerHTML = source
  for (const node of template.content.querySelectorAll('*')) {
    if (!allowedTags.has(node.localName)) {
      node.remove()
      continue
    }
    for (const attribute of Array.from(node.attributes)) {
      if (!allowedAttributes.has(attribute.name)) {
        node.removeAttribute(attribute.name)
      }
    }
    if (node instanceof HTMLInputElement) {
      node.type = 'checkbox'
      node.disabled = true
    }
    for (const attribute of ['href', 'src']) {
      const value = node.getAttribute(attribute)
      if (value && !safeDocumentUrl(value, attribute === 'href')) {
        node.removeAttribute(attribute)
      }
    }
  }
  return template.innerHTML
}

function safeDocumentUrl(value: string, link: boolean) {
  try {
    const url = new URL(value, 'https://guide.invalid/')
    return (
      ['http:', 'https:'].includes(url.protocol) ||
      (link && url.protocol === 'mailto:')
    )
  } catch {
    return false
  }
}
