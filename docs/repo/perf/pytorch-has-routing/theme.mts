import { isReadingMode } from './reading-mode.mts'
import { initializeRangePulses } from './range.mts'

let active: HTMLElement | undefined
let pending = false
let spotlightKey = ''
const spotlightPositions = new Map<string, { x: string; y: string }>()

export function initializeSpotlightPositions() {
  const themes = ['what', 'why', 'when', 'where']
  for (let i = 0, length = themes.length; i < length; i += 1) {
    spotlightPositions.set(themes[i]!, {
      x: `${Math.round(Math.random() * 35)}vw`,
      y: `${Math.round(Math.random() * 45)}vh`,
    })
  }
}

export function blendSpotlight(
  first: HTMLElement,
  second: HTMLElement,
  progress: number,
) {
  const from = first.dataset['scrollTheme']!
  const to = second.dataset['scrollTheme']!
  const percent = Math.round((1 - progress) * 100)
  const key = `${from}:${to}:${percent}`
  if (key === spotlightKey) {
    return
  }
  spotlightKey = key
  const spotlight = document.querySelector<HTMLElement>('.scroll-morph')!
  const color = `color-mix(in srgb, var(--topic-${from}) ${percent}%, var(--topic-${to}))`
  document.body.style.setProperty('--scroll-accent', color)
  document.documentElement.style.setProperty('--page-scrollbar-accent', color)
  spotlight.style.setProperty(
    '--scroll-wash',
    `color-mix(in srgb, ${color} 70%, transparent)`,
  )
  const start = spotlightPositions.get(from)!
  const end = spotlightPositions.get(to)!
  const x =
    parseFloat(start.x) + (parseFloat(end.x) - parseFloat(start.x)) * progress
  const y =
    parseFloat(start.y) + (parseFloat(end.y) - parseFloat(start.y)) * progress
  spotlight.style.setProperty('--scroll-x', `${x}vw`)
  spotlight.style.setProperty('--scroll-y', `${y}vh`)
}

function measureSpotlight(sections: NodeListOf<HTMLElement>, center: number) {
  if (!sections.length) {
    return
  }
  const width = window.innerHeight * 0.6
  for (let i = 0, length = sections.length - 1; i < length; i += 1) {
    const first = sections[i]!
    const second = sections[i + 1]!
    const boundary =
      (first.getBoundingClientRect().bottom +
        second.getBoundingClientRect().top) /
      2
    if (center <= boundary + width / 2) {
      const progress = Math.max(
        0,
        Math.min(1, (center - boundary + width / 2) / width),
      )
      return () => blendSpotlight(first, second, progress)
    }
  }
  const last = sections[sections.length - 1]!
  return () => blendSpotlight(last, last, 0)
}

export function updateActiveTheme() {
  const sections = document.querySelectorAll<HTMLElement>('[data-scroll-theme]')
  const center = window.innerHeight / 2
  const paintSpotlight = isReadingMode()
    ? undefined
    : measureSpotlight(sections, center)
  const paintContents = measureActiveContents()
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

  paintSpotlight?.()
  paintContents()
  if (!selected || selected === active) {
    return
  }
  active?.classList.remove('is-active')
  selected.classList.add('is-active')
  document.body.dataset['theme'] = selected.dataset['scrollTheme']
  active = selected
}

function measureActiveContents() {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('#reading-contents a'),
  )
  let selected = links.length > 0 ? 0 : -1
  for (let i = 0, length = links.length; i < length; i += 1) {
    const target = document.getElementById(links[i]!.hash.slice(1))
    if (target && target.getBoundingClientRect().top <= innerHeight * 0.3) {
      selected = i
    }
  }
  const pageEnd = document.documentElement.scrollHeight - innerHeight
  if (pageEnd > 0 && scrollY >= pageEnd - Math.max(8, innerHeight * 0.02)) {
    selected = links.length - 1
  }
  return () => {
    for (let i = 0, length = links.length; i < length; i += 1) {
      const link = links[i]!
      if (i === selected) {
        if (!link.hasAttribute('aria-current')) {
          link.setAttribute('aria-current', 'location')
          randomizeContentsShimmer(link)
        }
      } else {
        link.removeAttribute('aria-current')
      }
    }
  }
}

export function randomizeContentsShimmer(link: HTMLAnchorElement) {
  const leftToRight = Math.random() < 0.5
  link.style.setProperty('--shimmer-start', leftToRight ? '100%' : '0%')
  link.style.setProperty('--shimmer-end', leftToRight ? '0%' : '100%')
}

export function initializeContentsShimmer() {
  document
    .querySelector<HTMLElement>('.reading-sidebar')
    ?.addEventListener('animationiteration', event => {
      if (
        event.animationName === 'chapter-border-shimmer' &&
        event.target instanceof HTMLAnchorElement
      ) {
        randomizeContentsShimmer(event.target)
      }
    })
}

export function scheduleThemeUpdate() {
  if (pending) {
    return
  }
  pending = true
  window.requestAnimationFrame(() => {
    pending = false
    updateActiveTheme()
  })
}

export function initializePanelHighlights() {
  if (typeof IntersectionObserver === 'undefined') {
    return
  }
  const observer = new IntersectionObserver(
    entries => {
      for (let i = 0, length = entries.length; i < length; i += 1) {
        const entry = entries[i]!
        entry.target.toggleAttribute('data-panel-active', entry.isIntersecting)
      }
    },
    { rootMargin: '-80px 0px -80px 0px', threshold: 0 },
  )
  const panels = document.querySelectorAll<HTMLElement>(
    '.section-intro, .callout, .story-explanation, .route-consequence, .route-teaching-note, .trace-description',
  )
  for (let i = 0, length = panels.length; i < length; i += 1) {
    const panel = panels[i]!
    panel.setAttribute('data-panel-highlight', '')
    observer.observe(panel)
  }
}

export function initializeSectionThemes() {
  initializeRangePulses()
  initializeSpotlightPositions()
  initializePanelHighlights()
  initializeContentsShimmer()
  window.addEventListener('scroll', scheduleThemeUpdate, { passive: true })
  window.addEventListener('resize', scheduleThemeUpdate)
  window.addEventListener('guide-reading-mode-change', scheduleThemeUpdate)
  updateActiveTheme()
}
