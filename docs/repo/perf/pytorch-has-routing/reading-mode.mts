export const READING_MODE_KEY = 'nwsapi-guide-reading'
export const COLOR_MODE_KEY = 'nwsapi-guide-color-mode'

type ColorMode = 'light' | 'dark'

export function isReadingMode() {
  return document.documentElement.hasAttribute('data-reading-mode')
}

export function allowsMotion() {
  return (
    !isReadingMode() && !matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function initializeReadingMode() {
  const root = document.documentElement
  const reading = document.querySelector<HTMLButtonElement>(
    '[data-reading-toggle]',
  )
  const color = document.querySelector<HTMLButtonElement>('[data-color-toggle]')
  if (!reading || !color) {
    return
  }
  const system = matchMedia('(prefers-color-scheme: dark)')
  let explicit = false
  let mode: ColorMode = system.matches ? 'dark' : 'light'
  try {
    const stored = sessionStorage.getItem(COLOR_MODE_KEY)
    if (stored === 'dark' || stored === 'light') {
      mode = stored
      explicit = true
    }
    root.toggleAttribute(
      'data-reading-mode',
      sessionStorage.getItem(READING_MODE_KEY) === 'true',
    )
  } catch {
    // System defaults and in-memory controls work when storage is blocked.
  }
  const update = () => {
    root.dataset['colorMode'] = mode
    reading.setAttribute('aria-pressed', String(isReadingMode()))
    const label = color.dataset[mode === 'dark' ? 'lightLabel' : 'darkLabel']!
    color.setAttribute('aria-label', label)
    color.title = label
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        isReadingMode() ? '#f4ecdf' : mode === 'dark' ? '#0c171e' : '#f5f8fc',
      )
  }
  const apply = () => {
    root.classList.add('reading-mode-switching')
    update()
    if (isReadingMode()) {
      document.getAnimations().forEach(animation => animation.cancel())
    }
    window.dispatchEvent(new Event('guide-reading-mode-change'))
    requestAnimationFrame(() => {
      requestAnimationFrame(() =>
        root.classList.remove('reading-mode-switching'),
      )
    })
  }
  const persist = () => {
    try {
      sessionStorage.setItem(READING_MODE_KEY, String(isReadingMode()))
      if (explicit) {
        sessionStorage.setItem(COLOR_MODE_KEY, mode)
      }
    } catch {
      // Keep the current appearance for this page if storage is unavailable.
    }
  }
  reading.addEventListener('click', () => {
    root.toggleAttribute('data-reading-mode')
    persist()
    apply()
    reading.dataset['bookMotion'] = isReadingMode() ? 'opening' : 'closing'
  })
  color.addEventListener('click', () => {
    delete reading.dataset['bookMotion']
    mode = mode === 'dark' ? 'light' : 'dark'
    explicit = true
    root.removeAttribute('data-reading-mode')
    persist()
    apply()
  })
  system.addEventListener('change', () => {
    if (!explicit) {
      mode = system.matches ? 'dark' : 'light'
      apply()
    }
  })
  window.addEventListener('guide-locale-change', update)
  update()
}
