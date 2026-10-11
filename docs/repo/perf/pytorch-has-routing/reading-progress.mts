import { initializeReadingResume } from './reading-resume.mts'
import { element } from './ui.mts'
import { selectedContentsIndex } from './contents-selection.mts'

export function followReading(headings: HTMLElement[], path: string) {
  const links = Array.from(element('reading-contents').querySelectorAll('a'))
  const progressBar = document.querySelector<HTMLElement>('.reading-progress')!
  const nativeProgress = CSS.supports('animation-timeline: scroll()')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const contents = element('reading-navigation')
  const article = element('reading-content')
  const remember = initializeReadingResume(headings, path)
  let moved = false
  let scheduled = false
  let current = -1
  const update = () => {
    scheduled = false
    if (!article.getClientRects().length) {
      return
    }
    const last = document.documentElement.scrollHeight - innerHeight
    const progress = last > 0 ? Math.min(1, Math.max(0, scrollY / last)) : 1
    const visibleHeadings = headings
      .map((heading, index) => ({ heading, index }))
      .filter(({ heading }) => heading.getClientRects().length > 0)
    if (visibleHeadings.length === 0) {
      return
    }
    let active = visibleHeadings[0]!.index
    visibleHeadings.forEach(({ heading, index }) => {
      if (heading.getBoundingClientRect().top <= innerHeight * 0.3) {
        active = index
      }
    })
    if (last > 0 && scrollY >= last - 2) {
      active = visibleHeadings.at(-1)!.index
    }
    active = selectedContentsIndex(links) ?? active
    if (!nativeProgress || reducedMotion.matches) {
      progressBar.style.transform = `scaleX(${progress})`
    } else {
      progressBar.style.removeProperty('transform')
    }
    if (active === current) {
      return
    }
    current = active
    if (moved) {
      remember(active)
    }
    links.forEach((link, index) => {
      if (index === active) {
        link.setAttribute('aria-current', 'location')
      } else {
        link.removeAttribute('aria-current')
      }
    })
  }
  const schedule = () => {
    if (!scheduled) {
      scheduled = true
      requestAnimationFrame(update)
    }
  }
  const onScroll = () => {
    moved = true
    schedule()
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', schedule)
  addEventListener('guide-contents-selection-change', schedule)
  contents.addEventListener('toggle', schedule)
  article.addEventListener('toggle', schedule, true)
  reducedMotion.addEventListener('change', schedule)
  const resizeObserver = new ResizeObserver(schedule)
  resizeObserver.observe(article)
  update()
  return () => {
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', schedule)
    removeEventListener('guide-contents-selection-change', schedule)
    contents.removeEventListener('toggle', schedule)
    article.removeEventListener('toggle', schedule, true)
    reducedMotion.removeEventListener('change', schedule)
    resizeObserver.disconnect()
  }
}
