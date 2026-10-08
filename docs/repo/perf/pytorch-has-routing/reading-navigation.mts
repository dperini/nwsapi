import { currentLocale, translate } from './locale.mts'
import { localizeText } from './locale-content.mts'
import { isReadingMode } from './reading-mode.mts'
import { iconMarkup } from './icons.mts'

export const CONTENTS_STATE_KEY = 'nwsapi-guide-contents'

export function labelReadingContents(navigation: HTMLElement) {
  for (const link of navigation.querySelectorAll('a')) {
    link.title = link.textContent?.trim() ?? ''
    link.setAttribute('aria-label', link.title)
  }
}

export function placeReadingContents(
  contents: HTMLDetailsElement,
  navigation: HTMLElement,
) {
  // Closed details hide their children, so the compact tabs sit beside it.
  if (contents.open) {
    contents.append(navigation)
  } else {
    contents.after(navigation)
  }
}

export function syncReadingSidebarOffset() {
  const header = document.querySelector<HTMLElement>('.topbar')
  if (header) {
    const bottom = Math.min(
      header.offsetHeight,
      Math.max(0, header.getBoundingClientRect().bottom),
    )
    document.documentElement.style.setProperty(
      '--guide-topbar-bottom',
      `${bottom}px`,
    )
  }
}

export function wiggleReadingContent() {
  const layouts = document.querySelectorAll<HTMLElement>(
    '.guide-layout, .reading-layout',
  )
  for (const layout of layouts) {
    layout.classList.remove('contents-resizing')
    void layout.offsetWidth
    layout.classList.add('contents-resizing')
  }
}

export function initializeReadingContents(
  stateKey = CONTENTS_STATE_KEY,
  breakpoint = '(max-width: 900px)',
) {
  const contents = document.querySelector<HTMLDetailsElement>(
    '#reading-navigation',
  )!
  const summary = contents.querySelector('summary')!
  const summaryLabel = summary.querySelector('span')!
  const navigation = contents.querySelector('nav')!
  const header = document.querySelector<HTMLElement>('.topbar')
  const headerObserver = header
    ? new ResizeObserver(syncReadingSidebarOffset)
    : undefined
  if (header) {
    headerObserver?.observe(header)
    syncReadingSidebarOffset()
    window.addEventListener('scroll', syncReadingSidebarOffset, {
      passive: true,
    })
  }
  navigation.classList.add('reading-section-links')
  labelReadingContents(navigation)
  new MutationObserver(() => labelReadingContents(navigation)).observe(
    navigation,
    { childList: true, subtree: true, characterData: true },
  )
  const mobile = matchMedia(breakpoint)
  contents.open = !mobile.matches
  try {
    const saved = sessionStorage.getItem(stateKey)
    if (saved !== null) {
      contents.open = saved === 'true'
    }
  } catch {
    // The contents can still collapse when browser storage is unavailable.
  }
  let reading = isReadingMode()
  let initializing = true
  let expandedBeforeReading = contents.open
  if (reading) {
    contents.open = false
  }
  const update = () => {
    placeReadingContents(contents, navigation)
    const label = contents.open ? 'onThisPage' : 'contents'
    summaryLabel.dataset['i18n'] = label
    summaryLabel.textContent = translate(label)
    summary.title = translate(
      contents.open ? 'collapseContents' : 'expandContents',
    )
    summary.setAttribute('aria-label', summary.title)
  }
  contents.addEventListener('toggle', () => {
    update()
    if (!initializing && !isReadingMode()) {
      wiggleReadingContent()
    }
    try {
      if (!isReadingMode()) {
        sessionStorage.setItem(stateKey, String(contents.open))
      }
    } catch {
      // Keep the current panel state when browser storage is unavailable.
    }
  })
  window.setTimeout(() => {
    initializing = false
  }, 0)
  mobile.addEventListener('change', () => {
    contents.open = !mobile.matches && !isReadingMode()
    update()
  })
  window.addEventListener('guide-locale-change', update)
  window.addEventListener('guide-reading-mode-change', () => {
    const nextReading = isReadingMode()
    if (nextReading === reading) {
      return
    }
    if (nextReading) {
      expandedBeforeReading = contents.open
    }
    contents.open = nextReading ? false : expandedBeforeReading
    reading = nextReading
    update()
  })
  contents.parentElement!.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      contents.open = false
      summary.focus()
    }
  })
  navigation.addEventListener('click', event => {
    if (
      mobile.matches &&
      event.target instanceof Element &&
      event.target.closest('a')
    ) {
      contents.open = false
    }
  })
  update()
}

const sequence = [
  ['docs/repo/perf/pytorch-for-beginners.md', 'How the routing model works'],
  [
    'docs/repo/perf/neural-dispatch-crossed-outcome.md',
    'Crossed-query results',
  ],
  [
    'assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html',
    'Crossed-query report',
  ],
  ['docs/repo/perf/neural-dispatch-jit-outcome.md', 'Dispatch follow-up'],
  [
    'assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html',
    'Dispatch and JIT report',
  ],
] as const

export function renderReadingNavigation(documentPath: string) {
  const navigation = document.querySelector<HTMLElement>('.reading-pagination')!
  navigation.replaceChildren()
  const index = sequence.findIndex(([path]) => path === documentPath)
  for (const [direction, entry] of [
    ['previous', sequence[index - 1]],
    ['next', sequence[index + 1]],
  ] as const) {
    if (!entry) {
      continue
    }
    const link = document.createElement('a')
    link.rel = direction === 'previous' ? 'prev' : 'next'
    link.href = `./model-guide-reading.html?doc=${encodeURIComponent(entry[0])}`
    const title = document.createElement('span')
    title.className = 'reading-page-title'
    title.textContent = localizeText(entry[1], currentLocale())
    link.title = `${translate(direction)}: ${title.textContent}`
    link.setAttribute('aria-label', link.title)
    const icon = document.createElement('span')
    icon.className = 'reading-page-icon'
    icon.ariaHidden = 'true'
    icon.innerHTML = iconMarkup(
      direction === 'previous' ? 'previousDocument' : 'nextDocument',
    )
    link.append(title, icon)
    navigation.append(link)
  }
}
