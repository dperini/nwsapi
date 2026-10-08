const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const selector = '.lab, .film-grid > article, .section-intro, .callout'

function motionAllowed() {
  return (
    !reduced.matches &&
    !document.documentElement.hasAttribute('data-reading-mode')
  )
}

function shimmer(panel: HTMLElement) {
  if (!motionAllowed() || panel.classList.contains('panel-shimmer')) {
    return
  }
  panel.classList.add('panel-shimmer')
}

export function highlightLinkedArea(target: HTMLElement) {
  const panel =
    target.closest<HTMLElement>('[data-shimmer-panel]') ??
    target.querySelector<HTMLElement>('[data-shimmer-panel]')
  if (panel) {
    shimmer(panel)
  }
}

function highlightHash(hash: string) {
  let id: string
  try {
    id = decodeURIComponent(hash.slice(1))
  } catch {
    return
  }
  const target = document.getElementById(id)
  if (target) {
    highlightLinkedArea(target)
  }
}

export function initializePanelShimmer() {
  const panels = document.querySelectorAll<HTMLElement>(`main :is(${selector})`)
  for (const panel of panels) {
    panel.dataset['shimmerPanel'] = ''
    panel.addEventListener('animationend', event => {
      if (
        event.target === panel &&
        event.animationName === 'chapter-border-shimmer'
      ) {
        panel.classList.remove('panel-shimmer')
      }
    })
  }
  let observer: IntersectionObserver | undefined
  const observe = () => {
    observer?.disconnect()
    if (!motionAllowed() || typeof IntersectionObserver === 'undefined') {
      return
    }
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            shimmer(entry.target as HTMLElement)
          }
        }
      },
      {
        rootMargin: `-${Math.round(innerHeight * 0.3)}px 0px -${Math.round(innerHeight * 0.5)}px 0px`,
        threshold: 0,
      },
    )
    panels.forEach(panel => observer!.observe(panel))
  }
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(observe, 150)
  })
  const refresh = () => {
    panels.forEach(panel => panel.classList.remove('panel-shimmer'))
    observe()
  }
  reduced.addEventListener('change', refresh)
  window.addEventListener('guide-reading-mode-change', refresh)
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) {
      return
    }
    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (
      !link ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }
    const url = new URL(link.href)
    if (
      url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.search === location.search
    ) {
      highlightHash(url.hash)
    }
  })
  window.addEventListener('hashchange', () => highlightHash(location.hash))
  observe()
  highlightHash(location.hash)
}
