export function showLoadingAfterDelay(
  article: HTMLElement,
  isCurrentRequest: () => boolean,
  delay = 250,
) {
  article.removeAttribute('data-loading-visible')
  const timer = setTimeout(() => {
    if (isCurrentRequest() && article.getAttribute('aria-busy') === 'true') {
      article.setAttribute('data-loading-visible', '')
    }
  }, delay)
  return () => {
    clearTimeout(timer)
    article.removeAttribute('data-loading-visible')
  }
}
