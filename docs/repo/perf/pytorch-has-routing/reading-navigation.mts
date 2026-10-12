import { currentLocale, translate } from './locale.mts'
import { localizeText } from './locale-content.mts'
import { documentHref, getDocument } from './documents.mts'
import { initializeContentsSelection } from './contents-selection.mts'
import { handleContentsActivation } from './contents-focus.mts'

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
  if (navigation.parentElement !== contents) {
    contents.append(navigation)
  }
}

export function initializeReadingContents(
  stateKey = CONTENTS_STATE_KEY,
  breakpoint = '(max-width: 1200px)',
) {
  const contents = document.querySelector<HTMLDetailsElement>(
    '#reading-navigation',
  )!
  const summary = contents.querySelector('summary')!
  const summaryLabel = summary.querySelector('span')!
  const navigation = contents.parentElement!.querySelector('nav')!
  const mobileToggle = document.querySelector<HTMLButtonElement>(
    '[data-reader-contents-toggle]',
  )
  const replacementView = matchMedia('(max-width: 600px)')
  navigation.classList.add('reading-section-links')
  initializeContentsSelection(navigation)
  labelReadingContents(navigation)
  const mobile = matchMedia(breakpoint)
  contents.open = !mobile.matches
  try {
    const saved = localStorage.getItem(stateKey)
    if (saved !== null) {
      contents.open = saved === 'true'
    }
  } catch {
    // The contents can still collapse when browser storage is unavailable.
  }
  const update = () => {
    placeReadingContents(contents, navigation)
    const label = contents.open ? 'onThisPage' : 'contents'
    summaryLabel.dataset['i18n'] = label
    summaryLabel.textContent = translate(label)
    summary.title = translate(
      contents.open ? 'collapseContents' : 'expandContents',
    )
    summary.setAttribute(
      'aria-label',
      `${summaryLabel.textContent}: ${summary.title}`,
    )
    if (mobileToggle) {
      const hasLinks = navigation.querySelector('a[href^="#"]') !== null
      const ready =
        hasLinks &&
        !contents.hidden &&
        !document.querySelector('#reading-content')?.hasAttribute('aria-busy')
      const toggleLabel = translate(
        contents.open ? 'collapseContents' : 'contents',
      )
      mobileToggle.disabled = !ready
      mobileToggle.setAttribute('aria-expanded', String(contents.open))
      mobileToggle.setAttribute('aria-label', toggleLabel)
      mobileToggle.title = toggleLabel
    }
  }
  document
    .querySelector<HTMLAnchorElement>('.skip-link[href="#reading-content"]')
    ?.addEventListener('click', () => {
      if (mobile.matches && contents.open) {
        contents.open = false
        update()
      }
    })
  const navigationObserver = new MutationObserver(() => {
    labelReadingContents(navigation)
    update()
  })
  navigationObserver.observe(navigation, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  navigationObserver.observe(contents, {
    attributes: true,
    attributeFilter: ['hidden'],
  })
  const article = document.querySelector('#reading-content')
  if (article) {
    navigationObserver.observe(article, {
      attributes: true,
      attributeFilter: ['aria-busy'],
    })
  }
  mobileToggle?.addEventListener('click', () => {
    if (replacementView.matches && !mobileToggle.disabled) {
      contents.open = !contents.open
      update()
    }
  })
  contents.addEventListener('toggle', () => {
    update()
    try {
      localStorage.setItem(stateKey, String(contents.open))
    } catch {
      // Keep the current panel state when browser storage is unavailable.
    }
  })
  mobile.addEventListener('change', () => {
    if (mobile.matches) {
      contents.open = false
    }
    update()
  })
  window.addEventListener('guide-display-reset', () => {
    contents.open = !mobile.matches
    try {
      localStorage.removeItem(stateKey)
    } catch {
      // The visible panel still resets when storage is unavailable.
    }
    update()
  })
  window.addEventListener('guide-locale-change', update)
  document.addEventListener('keydown', event => {
    if (mobile.matches && contents.open && event.key === 'Escape') {
      event.preventDefault()
      contents.open = false
      update()
      if (replacementView.matches && mobileToggle) {
        mobileToggle.focus()
      } else {
        summary.focus()
      }
    }
  })
  navigation.addEventListener('click', event => {
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
        : null
    if (!link) {
      return
    }
    handleContentsActivation(event, link, () => {
      if (mobile.matches) {
        contents.open = false
        update()
      }
    })
  })
  update()
}

export function renderRelatedDocuments(path: string) {
  const navigation = document.querySelector<HTMLElement>('.reading-related')
  if (!navigation) {
    return
  }
  navigation.replaceChildren()
  const related = (getDocument(path)?.related ?? []).filter(item =>
    getDocument(item.path),
  )
  if (related.length === 0) {
    navigation.hidden = true
    return
  }
  navigation.hidden = false
  const heading = document.createElement('h2')
  heading.dataset['i18n'] = 'relatedDocuments'
  heading.textContent = translate('relatedDocuments')
  navigation.append(heading)
  const list = document.createElement('ul')
  for (const item of related) {
    const target = getDocument(item.path)
    if (target) {
      const link = document.createElement('a')
      link.href = documentHref(target.path)
      link.textContent = localizeText(item.label, currentLocale())
      const row = document.createElement('li')
      row.append(link)
      list.append(row)
    }
  }
  navigation.append(list)
}
