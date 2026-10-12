import { Button as BaseButton } from '@base-ui/react/button'
import { createElement as h, useLayoutEffect, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

type ClassProps = { className?: string }
type DataProps = { 'data-slot'?: string; 'data-i18n'?: string }

function dataSlot(value: string) {
  return { 'data-slot': value }
}

function mergeClass(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base
}

// Adapted from the official shadcn Base UI Button, Field, and Input Group sources.
export function FieldGroup(props: ComponentProps<'div'>) {
  return h('div', {
    ...props,
    'data-slot': 'field-group',
    className: mergeClass('catalog-field-group', props.className),
  })
}

export function Field(props: ComponentProps<'div'>) {
  return h('div', {
    ...props,
    role: 'group',
    'data-slot': 'field',
    className: mergeClass('catalog-field', props.className),
  })
}

export function FieldLabel(props: ComponentProps<'label'> & DataProps) {
  return h(Label, {
    ...props,
    'data-slot': 'field-label',
    className: mergeClass('catalog-field-label', props.className),
  })
}

function Label(props: ComponentProps<'label'> & DataProps) {
  return h('label', props)
}

export function InputGroup(props: ComponentProps<'div'>) {
  return h('div', {
    ...props,
    role: 'group',
    'data-slot': 'input-group',
    className: mergeClass('catalog-input-group', props.className),
  })
}

export function InputGroupInput(props: ComponentProps<'input'> & DataProps) {
  return h(Input, {
    ...props,
    'data-slot': 'input-group-control',
    className: mergeClass('catalog-input-group-input', props.className),
  })
}

function Input(props: ComponentProps<'input'> & DataProps) {
  return h('input', props)
}

export function InputGroupAddon({
  align = 'inline-start',
  ...props
}: ComponentProps<'span'> & { align?: 'inline-start' | 'inline-end' }) {
  return h('span', {
    ...props,
    'data-slot': 'input-group-addon',
    'data-align': align,
    className: mergeClass('catalog-input-group-addon', props.className),
  })
}

type InputGroupButtonProps = ClassProps &
  DataProps &
  Omit<ComponentProps<typeof BaseButton>, 'className' | 'type' | 'variant'> & {
    children?: ReactNode
    type?: 'button' | 'submit' | 'reset'
    variant?: 'ghost' | 'default' | 'outline'
  }

export function Button({
  className,
  variant = 'default',
  ...props
}: ClassProps &
  DataProps &
  Omit<ComponentProps<typeof BaseButton>, 'className' | 'variant'> & {
    variant?: 'ghost' | 'default' | 'outline'
  }) {
  const { 'data-slot': slot, ...buttonProps } = props
  return h(BaseButton, {
    ...buttonProps,
    ...dataSlot(slot ?? 'button'),
    className: mergeClass(
      `catalog-button catalog-button-${variant}`,
      className,
    ),
  })
}

export function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  ...props
}: InputGroupButtonProps) {
  return h(Button, {
    ...props,
    type,
    ...dataSlot('input-group-button'),
    variant,
    className: mergeClass('catalog-input-group-button', className),
  })
}

type ClearSearchButtonProps = InputGroupButtonProps & {
  registerDisabledSetter: (setter: (disabled: boolean) => void) => void
}

function ClearSearchButton({
  registerDisabledSetter,
  ...props
}: ClearSearchButtonProps) {
  const [disabled, setDisabled] = useState(true)
  useLayoutEffect(() => {
    registerDisabledSetter(setDisabled)
  }, [registerDisabledSetter])
  return h(InputGroupButton, { ...props, disabled })
}

type CatalogLabelKey =
  | 'searchDocuments'
  | 'clearSearch'
  | 'undoClearSearch'
  | 'topicFilter'
  | 'typeFilter'
  | 'allTopics'
  | 'allTypes'
  | 'searchPlaceholder'
  | 'documentsLoadFailure'
  | 'retryFailedDocuments'
  | 'retryingDocuments'

type CatalogTranslator = (key: CatalogLabelKey) => string

export function mountCatalogControls(
  form: HTMLFormElement,
  translate: CatalogTranslator,
) {
  const initialQuery =
    form.querySelector<HTMLInputElement>('#document-search')?.value ?? ''
  let updateClearDisabled: (disabled: boolean) => void = () => {}
  const registerClearDisabledSetter = (setter: (disabled: boolean) => void) => {
    updateClearDisabled = setter
  }
  const root = createRoot(form)
  flushSync(() => {
    root.render(
      h(
        FieldGroup,
        { className: 'documents-form-fields' },
        h(
          Field,
          { className: 'documents-search-field' },
          h(
            FieldLabel,
            { htmlFor: 'document-search', 'data-i18n': 'searchDocuments' },
            translate('searchDocuments'),
          ),
          h(
            InputGroup,
            null,
            h(
              InputGroupAddon,
              { align: 'inline-start', 'aria-hidden': true },
              h(
                'svg',
                {
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.8,
                  'aria-hidden': true,
                },
                h('circle', { cx: 10.8, cy: 10.8, r: 6.3 }),
                h('path', { d: 'm16 16 4.2 4.2' }),
              ),
            ),
            h(InputGroupInput, {
              id: 'document-search',
              name: 'q',
              type: 'search',
              autoComplete: 'off',
              placeholder: translate('searchPlaceholder'),
            }),
            h(
              InputGroupAddon,
              { align: 'inline-end' },
              h(
                ClearSearchButton,
                {
                  id: 'clear-search',
                  type: 'button',
                  variant: 'ghost',
                  'data-i18n': 'clearSearch',
                  registerDisabledSetter: registerClearDisabledSetter,
                },
                translate('clearSearch'),
              ),
            ),
          ),
        ),
        h(
          Button,
          {
            id: 'undo-clear-search',
            type: 'button',
            variant: 'ghost',
            hidden: true,
            'data-i18n': 'undoClearSearch',
          },
          translate('undoClearSearch'),
        ),
        h(
          'div',
          { className: 'documents-filter-row' },
          h(
            Field,
            null,
            h(
              FieldLabel,
              { htmlFor: 'category-filter', 'data-i18n': 'topicFilter' },
              translate('topicFilter'),
            ),
            h(
              'select',
              {
                id: 'category-filter',
                name: 'category',
                className: 'theme-select',
                'data-allow-empty': '',
                'data-i18n-aria': 'topicFilter',
              },
              h(
                'option',
                { value: '', 'data-i18n': 'allTopics' },
                translate('allTopics'),
              ),
            ),
          ),
          h(
            Field,
            null,
            h(
              FieldLabel,
              { htmlFor: 'type-filter', 'data-i18n': 'typeFilter' },
              translate('typeFilter'),
            ),
            h(
              'select',
              {
                id: 'type-filter',
                name: 'type',
                className: 'theme-select',
                'data-allow-empty': '',
                'data-i18n-aria': 'typeFilter',
              },
              h(
                'option',
                { value: '', 'data-i18n': 'allTypes' },
                translate('allTypes'),
              ),
            ),
          ),
        ),
        h('p', {
          id: 'document-load-status',
          className: 'documents-load-status',
          role: 'status',
          hidden: true,
        }),
        h(
          Button,
          {
            id: 'retry-document-load',
            type: 'button',
            variant: 'outline',
            className: 'documents-retry-button',
            'data-i18n': 'retryFailedDocuments',
            hidden: true,
          },
          translate('retryFailedDocuments'),
        ),
        h(Button, {
          type: 'submit',
          disabled: true,
          hidden: true,
          className: 'catalog-submit-guard',
          'aria-hidden': true,
          tabIndex: -1,
        }),
      ),
    )
  })

  const searchInput = form.querySelector<HTMLInputElement>('#document-search')!
  searchInput.value = initialQuery
  return {
    searchInput,
    categoryFilter: form.querySelector<HTMLSelectElement>('#category-filter')!,
    typeFilter: form.querySelector<HTMLSelectElement>('#type-filter')!,
    clearButton: form.querySelector<HTMLButtonElement>('#clear-search')!,
    undoButton: form.querySelector<HTMLButtonElement>('#undo-clear-search')!,
    setClearDisabled(disabled: boolean) {
      flushSync(() => updateClearDisabled(disabled))
    },
    retryButton: form.querySelector<HTMLButtonElement>('#retry-document-load')!,
    loadStatus: form.querySelector<HTMLParagraphElement>(
      '#document-load-status',
    )!,
  }
}
