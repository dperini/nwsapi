let selectedHash = ''
const scrollKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
])

export function selectedContentsIndex(links: HTMLAnchorElement[]) {
  const index = links.findIndex(link => link.hash === selectedHash)
  return index >= 0 ? index : undefined
}

function notifySelectionChange() {
  window.dispatchEvent(new Event('guide-contents-selection-change'))
}

function releaseSelection() {
  if (selectedHash) {
    selectedHash = ''
    notifySelectionChange()
  }
}

function handleScrollKey(event: KeyboardEvent) {
  const control =
    event.target instanceof Element &&
    event.target.closest(
      'input, textarea, select, button, [contenteditable], [role="combobox"], [role="slider"], [role="listbox"]',
    )
  if (scrollKeys.has(event.key) && !control && !event.defaultPrevented) {
    releaseSelection()
  }
}

export function initializeContentsSelection(navigation: HTMLElement) {
  selectedHash = location.hash
  navigation.addEventListener('click', event => {
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
        : null
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      selectedHash = link.hash
      notifySelectionChange()
    }
  })
  window.addEventListener('wheel', releaseSelection, { passive: true })
  window.addEventListener('touchmove', releaseSelection, { passive: true })
  window.addEventListener('keydown', handleScrollKey)
  window.addEventListener('pointerdown', event => {
    if (event.clientX >= document.documentElement.clientWidth) {
      releaseSelection()
    }
  })
  window.addEventListener('hashchange', () => {
    selectedHash = location.hash
    notifySelectionChange()
  })
}
