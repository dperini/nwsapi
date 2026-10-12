export function isUnmodifiedContentsActivation(event: MouseEvent) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  )
}

export function focusContentsHeading(target: HTMLElement) {
  const heading = target.matches('h1, h2, h3, h4, h5, h6')
    ? target
    : target.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const focusTarget = heading ?? target
  if (!focusTarget.hasAttribute('tabindex')) {
    focusTarget.tabIndex = -1
  }
  focusTarget.focus({ preventScroll: true })
  return focusTarget
}

export function handleContentsActivation(
  event: MouseEvent,
  link: HTMLAnchorElement,
  onActivate: () => void,
  ownerDocument = document,
  frame = requestAnimationFrame,
) {
  if (
    !isUnmodifiedContentsActivation(event) ||
    (link.target && link.target.toLowerCase() !== '_self')
  ) {
    return false
  }
  onActivate()
  const id = decodeURIComponent(link.hash.slice(1))
  frame(() => {
    const target = ownerDocument.getElementById(id)
    if (!target) {
      return
    }
    let disclosure = target.closest('details')
    while (disclosure) {
      disclosure.open = true
      disclosure = disclosure.parentElement?.closest('details') ?? null
    }
    const focusTarget = focusContentsHeading(target)
    focusTarget.scrollIntoView({ block: 'start', behavior: 'instant' })
  })
  return true
}
