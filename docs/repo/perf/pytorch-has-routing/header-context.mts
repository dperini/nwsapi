type HeaderContextKind = 'catalog' | 'reader' | 'model-guide'
type HeaderContextKey =
  | 'catalogDocs'
  | 'documentsNavigationLabel'
  | 'walkthroughModelGuide'
type Translate = (key: HeaderContextKey) => string

let currentTitle: string | undefined
let translate: Translate = key => key
let readerHeaderObserver: ResizeObserver | undefined

function stylePixels(
  element: HTMLElement,
  property: 'columnGap' | 'paddingLeft' | 'paddingRight',
) {
  return Number.parseFloat(getComputedStyle(element)[property]) || 0
}

function readerTitleSpace(header: HTMLElement, context: HTMLElement) {
  const identity = context.closest<HTMLElement>('.reader-header-identity')
  const navigation = context.closest<HTMLElement>('.header-navigation-group')
  const actions = header.querySelector<HTMLElement>('.header-actions')
  const brand = navigation?.querySelector<HTMLElement>('.brand')
  const separator = navigation?.querySelector<HTMLElement>(
    '[data-header-context-separator]',
  )
  const source = identity?.querySelector<HTMLElement>('.header-source-slot')
  if (!identity || !navigation || !actions || !brand || !separator || !source) {
    return Number.POSITIVE_INFINITY
  }
  const actionChildren = Array.from(actions.children)
  const actionWidth = actionChildren.reduce(
    (total, child) => total + child.getBoundingClientRect().width,
    stylePixels(actions, 'columnGap') * Math.max(actionChildren.length - 1, 0),
  )
  const navigationGaps =
    stylePixels(navigation, 'columnGap') *
    Math.max(navigation.children.length - 1, 0)
  const contentWidth =
    header.clientWidth -
    stylePixels(header, 'paddingLeft') -
    stylePixels(header, 'paddingRight')
  return (
    contentWidth -
    actionWidth -
    stylePixels(header, 'columnGap') -
    stylePixels(identity, 'columnGap') -
    source.getBoundingClientRect().width -
    brand.scrollWidth -
    separator.getBoundingClientRect().width -
    navigationGaps
  )
}

function updateReaderHeaderReflow() {
  const header = document.querySelector<HTMLElement>(
    '.reader-topbar:has(.reader-header-identity)',
  )
  const context = header?.querySelector<HTMLElement>('[data-header-context]')
  if (!header || !context || context.hidden) {
    return
  }
  if (!matchMedia('(max-width: 600px)').matches) {
    context
      .closest<HTMLElement>('.reader-topbar')
      ?.removeAttribute('data-header-reflow')
    return
  }
  const fontSize = Number.parseFloat(getComputedStyle(context).fontSize) || 16
  const readableTitleWidth = fontSize
  const shouldReflow =
    readerTitleSpace(header, context) + 2 < readableTitleWidth
  header.toggleAttribute('data-header-reflow', shouldReflow)
}

function observeReaderHeader() {
  const header = document.querySelector<HTMLElement>(
    '.reader-topbar:has(.reader-header-identity)',
  )
  if (!header || typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', updateReaderHeaderReflow)
    return
  }
  readerHeaderObserver?.disconnect()
  readerHeaderObserver = new ResizeObserver(updateReaderHeaderReflow)
  readerHeaderObserver.observe(header)
  for (const target of header.querySelectorAll<HTMLElement>(
    '.reader-header-identity, .header-navigation-group, .brand, [data-header-context], .header-source-slot, .header-actions',
  )) {
    readerHeaderObserver.observe(target)
  }
  window.addEventListener('resize', updateReaderHeaderReflow)
}

function renderHeaderContext() {
  const context = document.querySelector<HTMLElement>('[data-header-context]')
  if (!context) {
    return
  }
  const kind = context.dataset['headerContextKind'] as HeaderContextKind
  const separator = context.parentElement?.querySelector<HTMLElement>(
    '[data-header-context-separator]',
  )
  const setTitle = (title: string) => {
    if (context.classList.contains('documents-navigation-mount')) {
      context.dataset['pageTitle'] = title
      window.dispatchEvent(new Event('guide-header-context-change'))
      return
    }
    context.textContent = title
  }
  if (kind === 'reader' && !currentTitle) {
    setTitle('')
    context.hidden = true
    separator?.setAttribute('hidden', '')
    context.removeAttribute('title')
    context
      .closest<HTMLElement>('.reader-topbar')
      ?.removeAttribute('data-header-reflow')
    return
  }
  if (currentTitle) {
    setTitle(currentTitle)
    context.hidden = false
    separator?.removeAttribute('hidden')
    context.title = currentTitle
    updateReaderHeaderReflow()
    return
  }
  context.hidden = false
  separator?.removeAttribute('hidden')
  const key: HeaderContextKey =
    kind === 'model-guide'
      ? 'walkthroughModelGuide'
      : kind === 'catalog'
        ? 'catalogDocs'
        : 'documentsNavigationLabel'
  setTitle(translate(key))
  context.removeAttribute('title')
  updateReaderHeaderReflow()
}

export function setHeaderContext(title?: string) {
  currentTitle = title?.trim() || undefined
  renderHeaderContext()
}

export function initializeHeaderContext(translateMessage: Translate) {
  translate = translateMessage
  renderHeaderContext()
  observeReaderHeader()
  window.addEventListener('guide-locale-change', () => {
    renderHeaderContext()
  })
}
