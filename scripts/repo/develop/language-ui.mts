import type { SelectRenderable } from '@opentui/core'
import { createElement } from '@opentui/react'
import { useBindings } from '@opentui/keymap/react'
import { useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import type { MenuState } from './actions.mts'
import { LANGUAGES, translateWizard } from './language.mts'
import type { WizardLanguage } from './language.mts'

export type UiElement = (
  type: ElementType | 'box' | 'scrollbox' | 'select' | 'text',
  props?: Record<string, unknown> | null,
  ...children: ReactNode[]
) => ReactNode
export const ui = createElement as unknown as UiElement

export function localizedUi(language: WizardLanguage): UiElement {
  return (type, props, ...children) =>
    ui(
      type,
      props && {
        ...props,
        ...(typeof props['content'] === 'string'
          ? { content: translateWizard(props['content'], language) }
          : {}),
      },
      ...children,
    )
}

export function useLanguagePicker(
  state: MenuState,
  save?: (language: WizardLanguage) => void,
) {
  const [language, setLanguage] = useState(state.language ?? 'en')
  const [open, setOpen] = useState(state.languageOpen ?? false)
  const [error, setError] = useState('')
  const apply = (index: number) => {
    const next = LANGUAGES[index]!.code
    try {
      save?.(next)
      state.language = next
      state.languageOpen = false
      setLanguage(next)
      setOpen(false)
      setError('')
    } catch {
      setError(
        language === 'it'
          ? 'Impossibile salvare la lingua.'
          : 'Could not save language.',
      )
    }
  }
  useBindings(
    () => ({
      commands: [
        { name: 'wizard.language', run: () => setOpen(value => !value) },
        { name: 'wizard.language.cancel', run: () => setOpen(false) },
      ],
      bindings: [
        { key: 'l', cmd: 'wizard.language' },
        { key: 'shift+l', cmd: 'wizard.language' },
        ...(open ? [{ key: 'escape', cmd: 'wizard.language.cancel' }] : []),
      ],
    }),
    [open],
  )
  return {
    language,
    open,
    apply,
    toggle: () => setOpen(value => !value),
    error,
  }
}

export function languageHeader(
  title: string,
  language: WizardLanguage,
  toggle: () => void,
) {
  return ui(
    'box',
    {
      height: 1,
      flexShrink: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    ui('text', {
      content: translateWizard(title, language),
      fg: '#4285f4',
      height: 1,
    }),
    // A text translation mark works in terminals without image-protocol support.
    ui('text', {
      id: 'wizard-language-toggle',
      content: `文A ${language} ▾ [L]`,
      fg: '#8ab4f8',
      width: 14,
      height: 1,
      onMouseDown: toggle,
    }),
  )
}

export function LanguagePicker({
  language,
  apply,
  error,
  pickerRef,
}: {
  pickerRef: { current: SelectRenderable | null }
  language: WizardLanguage
  apply: (index: number) => void
  error: string
}) {
  return ui(
    'box',
    {
      id: 'wizard-language-picker',
      position: 'absolute',
      top: 2,
      right: 1,
      width: 30,
      height: 8,
      border: true,
      borderColor: '#8ab4f8',
      backgroundColor: '#182029',
      paddingLeft: 1,
      paddingRight: 1,
      zIndex: 10,
      flexDirection: 'column',
    },
    ui('text', {
      content: language === 'it' ? 'Lingua' : 'Language',
      fg: '#8ab4f8',
      height: 1,
    }),
    ui('select', {
      id: 'wizard-languages',
      ref: pickerRef,
      focused: true,
      height: 2,
      options: LANGUAGES.map(item => ({
        name: `${item.name}${item.code === language ? ' ✓' : ''}`,
        description: '',
      })),
      selectedIndex: LANGUAGES.findIndex(item => item.code === language),
      showDescription: false,
      selectedBackgroundColor: '#26364b',
      backgroundColor: '#182029',
      textColor: '#eff3fa',
      selectedTextColor: '#a8c7fa',
      onSelect: apply,
    }),
    ui('text', {
      content:
        error ||
        (language === 'it'
          ? '↑↓ scegli · Invio applica\nEsc annulla'
          : '↑↓ choose · Enter apply\nEsc cancel'),
      fg: error ? '#ea4335' : '#bdcbd6',
      height: 2,
    }),
  )
}

export function languageOverlay(
  picker: ReturnType<typeof useLanguagePicker>,
  pickerRef: { current: SelectRenderable | null },
) {
  return picker.open ? ui(LanguagePicker, { ...picker, pickerRef }) : null
}
