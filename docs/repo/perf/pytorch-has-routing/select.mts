import { createElement as h, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Select from '@radix-ui/react-select'
import * as Checkbox from '@radix-ui/react-checkbox'

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

function GuideSelect({ control }: { control: HTMLSelectElement }) {
  const value = useControlValue(control) as string
  const options = Array.from(control.options).filter(
    option => option.value !== '',
  )
  const placeholder =
    control.options[0]?.value === '' ? control.options[0].text : undefined
  const section = control.closest<HTMLElement>('[data-scroll-theme]')!
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
          control.id === 'challenge-prediction'
            ? 'My prediction'
            : control.id === 'story-selector'
              ? 'Your selector'
              : 'Host',
      },
      h(Select.Value, { placeholder }),
      h(Select.Icon, { 'aria-hidden': true }, '⌄'),
    ),
    h(
      Select.Portal,
      null,
      h(
        Select.Content,
        {
          className: 'guide-select-content',
          position: 'popper',
          sideOffset: 6,
          style: {
            '--section-accent':
              getComputedStyle(section).getPropertyValue('--section-accent'),
          },
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
                },
                h(Select.ItemText, null, option.text),
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

function GuideCheckbox({ control }: { control: HTMLInputElement }) {
  const checked = useControlValue(control) as boolean
  return h(
    Checkbox.Root,
    {
      className: 'guide-checkbox',
      checked,
      'aria-label': control.closest('label')?.textContent?.trim(),
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
    .querySelectorAll<HTMLSelectElement>('select.theme-select')
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
      const mount = document.createElement('span')
      mount.className = 'guide-checkbox-mount'
      control.after(mount)
      control.hidden = true
      createRoot(mount).render(h(GuideCheckbox, { control }))
    })
}
