import { iconMarkup } from './icons.mts'

function removeLinkMarker(link: HTMLAnchorElement) {
  const previousTail = link.querySelector('.link-marker-tail')
  if (previousTail) {
    previousTail.querySelector('.inline-icon')?.remove()
    previousTail.replaceWith(...Array.from(previousTail.childNodes))
    link.normalize()
  }
  link.querySelector('svg.inline-icon')?.remove()
}

function appendCodeMarker(
  link: HTMLAnchorElement,
  code: HTMLElement,
  kind: 'internal' | 'external',
) {
  const tail = document.createElement('span')
  tail.className = 'link-marker-tail link-code-marker'
  tail.classList.toggle(
    'link-code-marker-short',
    (code.textContent?.length ?? 0) <= 24,
  )
  tail.append(code)
  tail.insertAdjacentHTML('beforeend', iconMarkup(kind))
  link.append(tail)
}

function appendLinkMarker(
  link: HTMLAnchorElement,
  kind: 'internal' | 'external',
) {
  removeLinkMarker(link)
  const ending = link.lastChild
  if (ending instanceof HTMLElement && ending.tagName === 'CODE') {
    appendCodeMarker(link, ending, kind)
    return
  }
  const words =
    ending?.nodeType === Node.TEXT_NODE
      ? ending.textContent?.match(/^([\s\S]*?)(\S+)\s*$/)
      : undefined
  // Long identifiers must remain free to wrap in narrow columns.
  if (!ending || !words || (words[2]?.length ?? 0) > 24) {
    link.insertAdjacentHTML('beforeend', iconMarkup(kind))
    return
  }
  ending.textContent = words[1] ?? ''
  const tail = document.createElement('span')
  tail.className = 'link-marker-tail'
  tail.textContent = words[2] ?? ''
  tail.insertAdjacentHTML('beforeend', iconMarkup(kind))
  link.append(tail)
}

export function initializeLinkMarkers() {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    '.closing a[href], .reading-prose a[href], .reading-related a[href]',
  )
  for (const link of links) {
    const url = new URL(link.href)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (!link.textContent?.trim() && link.querySelector('img, picture'))
    ) {
      continue
    }
    const kind = url.origin === location.origin ? 'internal' : 'external'
    link.dataset['linkKind'] = kind
    appendLinkMarker(link, kind)
  }
}
