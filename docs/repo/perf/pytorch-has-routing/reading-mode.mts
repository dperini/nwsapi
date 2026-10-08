export const READING_MODE_KEY = 'nwsapi-guide-reading'

export function initializeReadingMode() {
  const root = document.documentElement
  const button = document.querySelector<HTMLButtonElement>(
    '[data-reading-toggle]',
  )
  if (!button) {
    return
  }
  const update = () => {
    const enabled = root.hasAttribute('data-reading-mode')
    button.setAttribute('aria-pressed', String(enabled))
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', enabled ? '#f4ecdf' : '#0c171e')
  }
  button.addEventListener('click', () => {
    root.classList.add('reading-mode-switching')
    const enabled = root.toggleAttribute('data-reading-mode')
    try {
      sessionStorage.setItem(READING_MODE_KEY, String(enabled))
    } catch {
      // Reading mode still works when the browser blocks session storage.
    }
    update()
    window.dispatchEvent(new Event('guide-reading-mode-change'))
    requestAnimationFrame(() => {
      requestAnimationFrame(() =>
        root.classList.remove('reading-mode-switching'),
      )
    })
  })
  update()
}
