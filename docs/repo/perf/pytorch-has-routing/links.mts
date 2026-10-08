import { iconMarkup } from './icons.mts'

export function initializeLinkMarkers() {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    '.closing a[href], .reading-related a[href], .reading-prose a[href]',
  )
  for (const link of links) {
    const url = new URL(link.href)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (!link.textContent?.trim() && link.querySelector('img, picture'))
    ) {
      continue
    }
    link.querySelector('svg')?.remove()
    const kind = url.origin === location.origin ? 'internal' : 'external'
    link.dataset['linkKind'] = kind
    link.insertAdjacentHTML('beforeend', iconMarkup(kind))
  }
}
