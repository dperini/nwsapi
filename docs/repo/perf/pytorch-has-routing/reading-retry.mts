export function beginReaderRetry(
  button: HTMLButtonElement,
  loadingLabel: string,
) {
  if (button.getAttribute('aria-disabled') === 'true') {
    return false
  }
  button.setAttribute('aria-disabled', 'true')
  button.textContent = loadingLabel
  return true
}

export function readerRetryOwnsFocus(
  article: HTMLElement,
  button: HTMLButtonElement | undefined,
) {
  return Boolean(
    button &&
    article.contains(button) &&
    article.ownerDocument.activeElement === button,
  )
}

export function focusReaderRetryResult(
  shouldFocus: boolean,
  target: HTMLElement,
  programmaticHeading = false,
) {
  if (!shouldFocus) {
    return
  }
  if (programmaticHeading && !target.hasAttribute('tabindex')) {
    target.tabIndex = -1
  }
  target.focus({ preventScroll: true })
}
