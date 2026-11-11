import type { SelectRenderable } from '@opentui/core'
import { isStyledText, StyledText } from '@opentui/core'
import { batch, createSignal } from 'solid-js/dist/solid.js'
import type { Accessor } from 'solid-js'
import type { MenuState } from '../actions.mts'
import { LANGUAGES, translateWizard } from './state.mts'
import type { WizardLanguage } from './state.mts'
import { ui, resolveProps, useBindings } from '../solid-ui.mts'
import type { UiElement, WizardKeymap } from '../solid-ui.mts'
import { createLanguageTransition } from '../flipboard/transition.mts'
export { ui } from '../solid-ui.mts'

export function localizedUi(
  language: Accessor<WizardLanguage>,
  transition: ReturnType<typeof createLanguageTransition>,
): UiElement {
  let row = 0
  return (type, props, ...children) => {
    const fields = new Map<string, ReturnType<typeof transition.bind>>()
    const text = (value: string, key: string) => {
      if (!fields.has(key)) {
        fields.set(key, transition.bind(row++))
      }
      return fields.get(key)!(translateWizard(value, language()), language())
    }
    return ui(
      type,
      () => {
        const values = { ...resolveProps(props) }
        const content = values['content']
        if (typeof content === 'string') {
          values['content'] = text(content, 'content')
        } else if (isStyledText(content)) {
          values['content'] = new StyledText(
            content.chunks.map((chunk, index) => ({
              ...chunk,
              text: text(chunk.text, 'chunk.' + index),
            })),
          )
        }
        if (type === 'select' && Array.isArray(values['options'])) {
          values['options'] = values['options'].map(
            (option: { name: string }, index: number) => ({
              ...option,
              name: text(option.name, 'option.' + index),
            }),
          )
        }
        return values
      },
      ...children,
    )
  }
}

export function useLanguagePicker(
  state: MenuState,
  keymap: WizardKeymap,
  save?: (language: WizardLanguage) => void,
) {
  const [language, setLanguage] = createSignal(state.language ?? 'en')
  const [open, setOpen] = createSignal(state.languageOpen ?? false)
  const [error, setError] = createSignal('')
  const transition = createLanguageTransition()
  const apply = (index: number) => {
    const next = LANGUAGES[index]!.code
    try {
      save?.(next)
      state.language = next
      state.languageOpen = false
      batch(() => {
        if (next !== language()) {
          transition.begin()
        }
        setLanguage(next)
        setOpen(false)
      })
      setError('')
    } catch {
      setError(
        language() === 'it'
          ? 'Impossibile salvare la lingua.'
          : 'Could not save language.',
      )
    }
  }
  useBindings(keymap, () => ({
    commands: [
      {
        name: 'wizard.language',
        run: () => {
          transition.finish()
          setOpen(value => !value)
        },
      },
      { name: 'wizard.language.cancel', run: () => setOpen(false) },
    ],
    bindings: [
      { key: 'l', cmd: 'wizard.language' },
      { key: 'shift+l', cmd: 'wizard.language' },
      ...(open() ? [{ key: 'escape', cmd: 'wizard.language.cancel' }] : []),
    ],
  }))
  return {
    language,
    transition,
    open,
    apply,
    toggle: () => {
      transition.finish()
      setOpen(value => !value)
    },
    error,
  }
}

export function languageHeader(
  title: () => string,
  language: Accessor<WizardLanguage>,
  toggle: () => void,
  element: UiElement,
) {
  return element(
    'box',
    {
      height: 1,
      flexShrink: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    () =>
      element('text', () => ({
        content: translateWizard(title(), language()),
        fg: '#4285f4',
        height: 1,
      })),
    () =>
      element('text', () => ({
        id: 'wizard-language-toggle',
        content: `文A ${language()} ▾ [L]`,
        fg: '#8ab4f8',
        width: 14,
        height: 1,
        onMouseDown: toggle,
      })),
  )
}

export function LanguagePicker({
  language,
  apply,
  error,
  pickerRef,
}: {
  pickerRef: { current: SelectRenderable | null }
  language: Accessor<WizardLanguage>
  apply: (index: number) => void
  error: Accessor<string>
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
    () =>
      ui('text', () => ({
        content: language() === 'it' ? 'Lingua' : 'Language',
        fg: '#8ab4f8',
        height: 1,
      })),
    () =>
      ui('select', () => ({
        id: 'wizard-languages',
        ref: pickerRef,
        focused: true,
        height: 2,
        options: LANGUAGES.map(item => ({
          name: `${item.name}${item.code === language() ? ' ✓' : ''}`,
          description: '',
        })),
        selectedIndex: LANGUAGES.findIndex(item => item.code === language()),
        showDescription: false,
        selectedBackgroundColor: '#26364b',
        backgroundColor: '#182029',
        textColor: '#eff3fa',
        selectedTextColor: '#a8c7fa',
        onSelect: apply,
      })),
    () =>
      ui('text', () => ({
        content:
          error() ||
          (language() === 'it'
            ? '↑↓ scegli · Invio applica\nEsc annulla'
            : '↑↓ choose · Enter apply\nEsc cancel'),
        fg: error() ? '#ea4335' : '#bdcbd6',
        height: 2,
      })),
  )
}

export function languageOverlay(
  picker: ReturnType<typeof useLanguagePicker>,
  pickerRef: { current: SelectRenderable | null },
) {
  return picker.open() ? ui(LanguagePicker, { ...picker, pickerRef }) : null
}
