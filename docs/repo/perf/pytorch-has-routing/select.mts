/// <reference types="vite/client" />
import { createElement as h, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import * as Select from '@radix-ui/react-select'
import * as Checkbox from '@radix-ui/react-checkbox'
import { selectorTokens } from './selector.mts'
import languageIcon from '../../../../assets/repo/model-guide/icons/language.svg?raw'

function selectorLabel(source: string) {
  return h(
    'code',
    { className: 'selector-code' },
    selectorTokens(source).map((token, index) =>
      h('span', { key: index, className: `syntax-${token.kind}` }, token.text),
    ),
  )
}

// Adapted from shadcn/ui Select and Checkbox, with the guide's semantic theme tokens.
// Keep the original form controls as the shared state for the existing demonstrations.
function useControlValue(control: HTMLInputElement | HTMLSelectElement) {
  const read = () =>
    control instanceof HTMLInputElement ? control.checked : control.value
  const [state, setState] = useState(() => ({ value: read() }))
  useEffect(() => {
    const refresh = () => setState({ value: read() })
    document.addEventListener('guide-controls-sync', refresh)
    control.addEventListener('change', refresh)
    return () => {
      document.removeEventListener('guide-controls-sync', refresh)
      control.removeEventListener('change', refresh)
    }
  }, [control])
  return state.value
}

function notify(control: HTMLElement) {
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

const emptySelectValue = '__guide_control_empty__'

function getSelectValue(selectedValue: string, allowEmpty: boolean) {
  return allowEmpty && selectedValue === '' ? emptySelectValue : selectedValue
}

function getSelectOptions(control: HTMLSelectElement, allowEmpty: boolean) {
  return Array.from(control.options).filter(
    option => allowEmpty || option.value !== '',
  )
}

function getSelectOptionValue(option: HTMLOptionElement, allowEmpty: boolean) {
  return allowEmpty && option.value === '' ? emptySelectValue : option.value
}

function getSelectAccent(control: HTMLSelectElement) {
  const section = control.closest<HTMLElement>('[data-scroll-theme]')
  if (control.hasAttribute('data-language-select')) {
    return 'var(--scroll-accent, var(--topic-what))'
  }
  if (section) {
    return `var(--topic-${section.dataset['scrollTheme']})`
  }
  return 'var(--topic-where)'
}

function getSelectLabel(control: HTMLSelectElement, label?: string) {
  if (control.hasAttribute('data-language-select')) {
    return control.getAttribute('aria-label') ?? label ?? 'Language'
  }
  const currentLabel = control.dataset['i18nAria']
    ? control.labels?.[0]?.textContent?.trim()
    : label
  if (currentLabel) {
    return currentLabel
  }
  if (control.id === 'challenge-prediction') {
    return 'My prediction'
  }
  if (control.id === 'story-selector') {
    return 'Your selector'
  }
  return 'Environment'
}

function selectTriggerId(control: HTMLSelectElement) {
  return control.id ? `${control.id}-trigger` : undefined
}

function ensureSelectLabelId(control: HTMLSelectElement) {
  const label = control.labels?.[0]
  if (!label) {
    return undefined
  }
  if (!label.id) {
    const baseId = `${control.id || 'guide-select'}-label`
    let id = baseId
    let suffix = 2
    while (document.getElementById(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }
    label.id = id
  }
  return label.id
}

function useSelectLabelFocus(control: HTMLSelectElement) {
  useEffect(() => {
    const label = control.labels?.[0]
    const triggerId = selectTriggerId(control)
    const trigger = triggerId ? document.getElementById(triggerId) : null
    if (!label || !(trigger instanceof HTMLButtonElement)) {
      return undefined
    }
    const focusTrigger = (event: MouseEvent) => {
      if (event.target instanceof Node && trigger.contains(event.target)) {
        return
      }
      event.preventDefault()
      trigger.focus()
    }
    label.addEventListener('click', focusTrigger)
    return () => label.removeEventListener('click', focusTrigger)
  }, [control])
}

function useLanguageLabel(control: HTMLSelectElement, label?: string) {
  const [currentLabel, setCurrentLabel] = useState(() =>
    getSelectLabel(control, label),
  )
  useEffect(() => {
    if (!control.hasAttribute('data-language-select')) {
      return undefined
    }
    const refresh = () => setCurrentLabel(getSelectLabel(control, label))
    window.addEventListener('guide-locale-change', refresh)
    return () => window.removeEventListener('guide-locale-change', refresh)
  }, [control, label])
  return currentLabel
}

function renderLanguageIcon(control: HTMLSelectElement) {
  if (!control.hasAttribute('data-language-select')) {
    return null
  }
  return h('span', {
    className: 'language-trigger-icon',
    'aria-hidden': true,
    dangerouslySetInnerHTML: { __html: languageIcon },
  })
}

function renderSelectTrigger(
  control: HTMLSelectElement,
  label: string | undefined,
  value: string,
  placeholder: string | undefined,
) {
  const languageSelect = control.hasAttribute('data-language-select')
  const labelId = control.labels?.[0]?.id
  return h(
    Select.Trigger,
    {
      id: selectTriggerId(control),
      className: 'guide-select-trigger',
      'aria-describedby': control.getAttribute('aria-describedby') ?? undefined,
      ...(labelId
        ? { 'aria-labelledby': labelId }
        : { 'aria-label': getSelectLabel(control, label) }),
    },
    renderLanguageIcon(control),
    h(Select.Value, { placeholder }, languageSelect ? value : undefined),
    h(
      Select.Icon,
      { 'aria-hidden': true },
      h(
        'svg',
        { viewBox: '0 0 24 24', className: 'guide-select-chevron' },
        h('path', { d: 'm6 9 6 6 6-6' }),
      ),
    ),
  )
}

function renderSelectOption(
  control: HTMLSelectElement,
  option: HTMLOptionElement,
  allowEmpty: boolean,
) {
  return h(
    Select.Item,
    {
      key: option.value,
      value: getSelectOptionValue(option, allowEmpty),
      className: 'guide-select-item',
      textValue: option.text,
    },
    h(
      Select.ItemText,
      null,
      control.id === 'story-selector'
        ? selectorLabel(option.text)
        : option.text,
    ),
    h(Select.ItemIndicator, { className: 'guide-select-check' }, '✓'),
  )
}

function renderSelectContent(
  control: HTMLSelectElement,
  options: HTMLOptionElement[],
  allowEmpty: boolean,
  theme: CSSProperties & { '--section-accent': string },
) {
  const languageSelect = control.hasAttribute('data-language-select')
  return h(
    Select.Portal,
    null,
    h(
      Select.Content,
      {
        className: languageSelect
          ? 'guide-select-content language-select-content'
          : 'guide-select-content',
        position: 'popper',
        sideOffset: 6,
        style: theme,
      },
      h(
        Select.Viewport,
        null,
        h(
          Select.Group,
          null,
          options.map(option =>
            renderSelectOption(control, option, allowEmpty),
          ),
        ),
      ),
    ),
  )
}

function GuideSelect({
  control,
  label,
}: {
  control: HTMLSelectElement
  label?: string
}) {
  const selectedValue = useControlValue(control) as string
  const currentLabel = useLanguageLabel(control, label)
  useSelectLabelFocus(control)
  const allowEmpty = control.hasAttribute('data-allow-empty')
  const value = getSelectValue(selectedValue, allowEmpty)
  const options = getSelectOptions(control, allowEmpty)
  const placeholder =
    control.options[0]?.value === '' ? control.options[0].text : undefined
  const theme: CSSProperties & { '--section-accent': string } = {
    '--section-accent': getSelectAccent(control),
  }
  return h(
    Select.Root,
    {
      value,
      onValueChange: (next: string) => handleSelectChange(control, next),
    },
    renderSelectTrigger(control, currentLabel, value, placeholder),
    renderSelectContent(control, options, allowEmpty, theme),
  )
}

function handleSelectChange(control: HTMLSelectElement, next: string) {
  const allowEmpty = control.hasAttribute('data-allow-empty')
  control.value = allowEmpty && next === emptySelectValue ? '' : next
  notify(control)
}

function GuideCheckbox({
  control,
  label,
}: {
  control: HTMLInputElement
  label: string | undefined
}) {
  const checked = useControlValue(control) as boolean
  return h(
    Checkbox.Root,
    {
      className: 'guide-checkbox',
      checked,
      'aria-label': label,
      onCheckedChange: (next: boolean | 'indeterminate') => {
        control.checked = next === true
        notify(control)
      },
    },
    h(Checkbox.Indicator, null, '✓'),
  )
}

export function initializeGuideControls() {
  document
    .querySelectorAll<HTMLSelectElement>(
      'select.theme-select:not([data-language-select])',
    )
    .forEach(control => {
      ensureSelectLabelId(control)
      const mount = document.createElement('span')
      mount.className = 'guide-select-mount'
      control.after(mount)
      control.hidden = true
      const label = Array.from(control.labels?.[0]?.childNodes ?? [])
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('')
        .trim()
      createRoot(mount).render(h(GuideSelect, { control, label }))
    })
  document
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach(control => {
      const label = control.labels?.[0]?.textContent?.trim()
      const mount = document.createElement('span')
      mount.className = 'guide-checkbox-mount'
      control.after(mount)
      control.hidden = true
      createRoot(mount).render(h(GuideCheckbox, { control, label }))
    })
}

export function initializeLanguageSelect() {
  const control = document.querySelector<HTMLSelectElement>(
    'select[data-language-select]',
  )
  if (!control) {
    return
  }
  control.setAttribute(
    'aria-label',
    control.getAttribute('aria-label') ?? 'Language',
  )
  ensureSelectLabelId(control)
  const mount = document.createElement('span')
  mount.className = 'language-select-mount'
  control.after(mount)
  flushSync(() => {
    createRoot(mount).render(h(GuideSelect, { control, label: 'Language' }))
  })
  control.hidden = true
  control.parentElement?.setAttribute('data-language-enhanced', '')
}
