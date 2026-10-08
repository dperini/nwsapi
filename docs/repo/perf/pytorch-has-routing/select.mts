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
  const [value, setValue] = useState(read)
  useEffect(() => {
    const refresh = () => setValue(read())
    document.addEventListener('guide-controls-sync', refresh)
    control.addEventListener('change', refresh)
    return () => {
      document.removeEventListener('guide-controls-sync', refresh)
      control.removeEventListener('change', refresh)
    }
  }, [control])
  return value
}

function notify(control: HTMLElement) {
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function GuideSelect({
  control,
  label,
}: {
  control: HTMLSelectElement
  label?: string
}) {
  const value = useControlValue(control) as string
  const options = Array.from(control.options).filter(
    option => option.value !== '',
  )
  const placeholder =
    control.options[0]?.value === '' ? control.options[0].text : undefined
  const section = control.closest<HTMLElement>('[data-scroll-theme]')
  const accent = control.hasAttribute('data-language-select')
    ? 'var(--scroll-accent, var(--topic-what))'
    : section
      ? getComputedStyle(section).getPropertyValue('--section-accent')
      : 'var(--topic-where)'
  const theme: CSSProperties & { '--section-accent': string } = {
    '--section-accent': accent,
  }
  return h(
    Select.Root,
    {
      value,
      onValueChange: (next: string) => {
        control.value = next
        notify(control)
      },
    },
    h(
      Select.Trigger,
      {
        className: 'guide-select-trigger',
        'aria-label':
          label ??
          (control.id === 'challenge-prediction'
            ? 'My prediction'
            : control.id === 'story-selector'
              ? 'Your selector'
              : 'Environment'),
      },
      control.hasAttribute('data-language-select')
        ? h('span', {
            className: 'language-trigger-icon',
            'aria-hidden': true,
            dangerouslySetInnerHTML: { __html: languageIcon },
          })
        : null,
      h(
        Select.Value,
        { placeholder },
        control.hasAttribute('data-language-select') ? value : undefined,
      ),
      h(
        Select.Icon,
        { 'aria-hidden': true },
        h(
          'svg',
          { viewBox: '0 0 24 24', className: 'guide-select-chevron' },
          h('path', { d: 'm6 9 6 6 6-6' }),
        ),
      ),
    ),
    h(
      Select.Portal,
      null,
      h(
        Select.Content,
        {
          className: control.hasAttribute('data-language-select')
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
              h(
                Select.Item,
                {
                  key: option.value,
                  value: option.value,
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
                h(
                  Select.ItemIndicator,
                  { className: 'guide-select-check' },
                  '✓',
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  )
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
      const mount = document.createElement('span')
      mount.className = 'guide-select-mount'
      control.after(mount)
      control.hidden = true
      createRoot(mount).render(h(GuideSelect, { control }))
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
  const mount = document.createElement('span')
  mount.className = 'language-select-mount'
  control.after(mount)
  flushSync(() => {
    createRoot(mount).render(h(GuideSelect, { control, label: 'Language' }))
  })
  control.hidden = true
  control.parentElement?.setAttribute('data-language-enhanced', '')
}
