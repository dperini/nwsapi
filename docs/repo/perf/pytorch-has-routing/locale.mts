import en from './locales/en.json'
import it from './locales/it.json'
import { initializeLanguageSelect } from './select.mts'
import { initializeContentLocale } from './locale-content.mts'
import { initializeReadingMode } from './reading-mode.mts'

type Locale = keyof typeof messages
const messages = { en, it }
const preferenceKey = 'nwsapi-guide-locale'

function browserLocale(): Locale {
  const locale = new Intl.Locale(navigator.languages[0] ?? navigator.language)
  return locale.language === 'it' ? 'it' : 'en'
}

function savedLocale(): Locale {
  try {
    const stored = sessionStorage.getItem(preferenceKey)
    if (stored === 'it' || stored === 'en') {
      return stored
    }
  } catch {
    // Private browsing may deny storage while the selector remains usable.
  }
  return browserLocale()
}

let activeLocale = savedLocale()

export function currentLocale(): Locale {
  return activeLocale
}

export function translate(key: keyof typeof en): string {
  return messages[currentLocale()][key] ?? en[key]
}

export function initializeLocale() {
  initializeReadingMode()
  const select = document.querySelector<HTMLSelectElement>(
    '[data-language-select]',
  )
  if (!select) {
    return
  }
  select.value = currentLocale()
  document.documentElement.lang = select.value
  initializeLanguageSelect()
  applyLocaleMessages()
  select.setAttribute('aria-label', translate('language'))
  initializeContentLocale(currentLocale)
  select.addEventListener('change', () => {
    const locale = select.value === 'it' ? 'it' : 'en'
    activeLocale = locale
    try {
      sessionStorage.setItem(preferenceKey, locale)
    } catch {
      // Keep the in-memory choice when browser storage is unavailable.
    }
    document.documentElement.lang = locale
    applyLocaleMessages()
    select.setAttribute('aria-label', translate('language'))
    window.dispatchEvent(
      new CustomEvent('guide-locale-change', { detail: locale }),
    )
  })
}

function applyLocaleMessages() {
  const locale = currentLocale()
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset['i18n'] as keyof typeof en
    node.textContent = translate(key)
  }
  for (const node of document.querySelectorAll<HTMLElement>(
    '[data-i18n-aria]',
  )) {
    const key = node.dataset['i18nAria'] as keyof typeof en
    node.setAttribute('aria-label', translate(key))
  }
  for (const node of document.querySelectorAll<HTMLElement>(
    '[data-i18n-title]',
  )) {
    const key = node.dataset['i18nTitle'] as keyof typeof en
    node.setAttribute('title', translate(key))
  }
  document.documentElement.lang = locale
}
