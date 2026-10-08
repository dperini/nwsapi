let active: HTMLElement | undefined
let pending = false
const spotlightPositions = new Map<string, { x: string; y: string }>()

function initializeSpotlightPositions() {
  const themes = ['what', 'why', 'when', 'where']
  for (let i = 0, length = themes.length; i < length; i += 1) {
    spotlightPositions.set(themes[i]!, {
      x: `${Math.round(Math.random() * 35)}vw`,
      y: `${Math.round(Math.random() * 45)}vh`,
    })
  }
}

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
  const position = spotlightPositions.get(selected.dataset['scrollTheme']!)!
  document.body.style.setProperty('--scroll-x', position.x)
  document.body.style.setProperty('--scroll-y', position.y)
  document.documentElement.style.setProperty(
    '--page-scrollbar-accent',
    getComputedStyle(selected).getPropertyValue('--section-accent'),
  )
  document.querySelectorAll<HTMLAnchorElement>('.chapters a').forEach(link => {
    const current = link.hash === `#${selected.id}`
    if (current) {
      link.setAttribute('aria-current', 'location')
    } else {
      link.removeAttribute('aria-current')
    }
  })
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
  initializeSpotlightPositions()
  window.addEventListener('scroll', scheduleThemeUpdate, { passive: true })
  window.addEventListener('resize', scheduleThemeUpdate)
  updateActiveTheme()
}
