import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { NavigationMenu } from '@base-ui/react/navigation-menu'

type NavigationKey =
  | 'documentsNavigationLabel'
  | 'browseDocuments'
  | 'interactiveGuide'
  | 'apiReference'

type Translate = (key: NavigationKey) => string

// Adapted from shadcn/ui's registry/base-nova/ui/navigation-menu.tsx composition.
function dataSlot(name: string) {
  return { 'data-slot': name }
}

function DocumentsMenu({
  translate,
  title,
}: {
  translate: Translate
  title: string
}) {
  return h(
    NavigationMenu.Root,
    {
      ...dataSlot('navigation-menu'),
      className: 'documents-navigation',
      'aria-label': translate('documentsNavigationLabel'),
      onValueChange: (_value, details) => {
        if (details.reason === 'trigger-hover') {
          details.cancel()
        }
      },
    },
    h(
      NavigationMenu.List,
      {
        ...dataSlot('navigation-menu-list'),
        className: 'documents-navigation-list',
      },
      h(
        NavigationMenu.Item,
        {
          ...dataSlot('navigation-menu-item'),
          className: 'documents-navigation-item',
          value: 'documents',
        },
        h(
          NavigationMenu.Trigger,
          {
            ...dataSlot('navigation-menu-trigger'),
            className: 'documents-navigation-trigger',
            'aria-label': title
              ? `${title}, ${translate('documentsNavigationLabel')}`
              : translate('documentsNavigationLabel'),
            title: title || translate('documentsNavigationLabel'),
          },
          h('span', null, title),
          h(
            'svg',
            {
              viewBox: '0 0 16 16',
              className: 'documents-navigation-chevron',
              'aria-hidden': true,
            },
            h('path', { d: 'm4 6 4 4 4-4' }),
          ),
        ),
        h(
          NavigationMenu.Content,
          {
            ...dataSlot('navigation-menu-content'),
            className: 'documents-navigation-content',
          },
          h(
            'div',
            { className: 'documents-navigation-links' },
            h(
              NavigationMenu.Link,
              {
                href: './index.html',
                ...dataSlot('navigation-menu-link'),
                className: 'documents-navigation-link',
              },
              translate('browseDocuments'),
            ),
            h(
              NavigationMenu.Link,
              {
                href: './model-guide-reading.html?doc=docs%2Frepo%2Fselector%2Fapi.md',
                ...dataSlot('navigation-menu-link'),
                className: 'documents-navigation-link',
              },
              translate('apiReference'),
            ),
            h(
              NavigationMenu.Link,
              {
                href: './pytorch-has-routing.html',
                ...dataSlot('navigation-menu-link'),
                className: 'documents-navigation-link',
              },
              translate('interactiveGuide'),
            ),
          ),
        ),
      ),
    ),
    h(
      NavigationMenu.Portal,
      null,
      h(
        NavigationMenu.Positioner,
        {
          ...dataSlot('navigation-menu-positioner'),
          className: 'documents-navigation-positioner',
          side: 'bottom',
          sideOffset: 6,
          align: 'start',
        },
        h(
          NavigationMenu.Popup,
          {
            ...dataSlot('navigation-menu-popup'),
            className: 'documents-navigation-popup',
            'aria-label': translate('documentsNavigationLabel'),
          },
          h(NavigationMenu.Viewport, {
            ...dataSlot('navigation-menu-viewport'),
            className: 'documents-navigation-viewport',
          }),
        ),
      ),
    ),
  )
}

export function initializeNavigationMenu(translate: Translate) {
  for (const mount of document.querySelectorAll<HTMLElement>(
    '.documents-navigation-mount',
  )) {
    const root = createRoot(mount)
    const render = () => {
      const title =
        mount.dataset['pageTitle'] ?? mount.textContent?.trim() ?? ''
      flushSync(() => root.render(h(DocumentsMenu, { translate, title })))
    }
    render()
    window.addEventListener('guide-locale-change', render)
    window.addEventListener('guide-header-context-change', render)
  }
}
