let active: HTMLElement | undefined
let pending = false

function updateActiveTheme() {
  const sections = document.querySelectorAll<HTMLElement>('[data-scroll-theme]')
  const center = window.innerHeight / 2
  let nearest = Number.POSITIVE_INFINITY
  let selected: HTMLElement | undefined

  for (let i = 0, length = sections.length; i < length; i += 1) {
    const section = sections[i]!
    const bounds = section.getBoundingClientRect()
    const distance =
      bounds.top > center
        ? bounds.top - center
        : bounds.bottom < center
          ? center - bounds.bottom
          : 0
    if (distance <= nearest) {
      nearest = distance
      selected = section
    }
  }

  if (!selected || selected === active) {
    return
  }
  active?.classList.remove('is-active')
  selected.classList.add('is-active')
  document.body.dataset['theme'] = selected.dataset['scrollTheme']
  active = selected
}

function scheduleThemeUpdate() {
  if (pending) {
    return
  }
  pending = true
  window.requestAnimationFrame(() => {
    pending = false
    updateActiveTheme()
  })
}

export function initializeSectionThemes() {
  window.addEventListener('scroll', scheduleThemeUpdate, { passive: true })
  window.addEventListener('resize', scheduleThemeUpdate)
  updateActiveTheme()
}
