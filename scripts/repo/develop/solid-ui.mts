import { createComponent, createElement, insert, spread } from '@opentui/solid'
import type { JSX } from '@opentui/solid'
import {
  createEffect,
  createRenderEffect,
  onCleanup,
  untrack,
} from 'solid-js/dist/solid.js'
import type { Keymap, Layer } from '@opentui/keymap'
import { isStyledText, TextRenderable } from '@opentui/core'
import type { Renderable, KeyEvent } from '@opentui/core'

export type WizardKeymap = Keymap<Renderable, KeyEvent>
export type UiProps = Record<string, unknown> | (() => Record<string, unknown>)
export type UiElement = (
  type: string | ((props: never) => unknown),
  props?: UiProps | null,
  ...children: unknown[]
) => JSX.Element

export function resolveProps(props?: UiProps | null) {
  return (typeof props === 'function' ? props() : props) ?? {}
}

export const ui: UiElement = (type, props, ...children) => {
  if (typeof type === 'function') {
    return createComponent(
      type as (props: Record<string, unknown>) => unknown,
      {
        ...resolveProps(props),
        get children() {
          return children
        },
      },
    ) as unknown as JSX.Element
  }
  const node = createElement(type)
  const ref = untrack(() => resolveProps(props)['ref']) as
    | { current: unknown }
    | undefined
  if (ref) {
    ref.current = node
    onCleanup(() => {
      if (ref.current === node) {
        ref.current = null
      }
    })
  }
  spread(
    node,
    () => {
      const {
        ref: _ref,
        key: _key,
        selectedIndex,
        ...values
      } = resolveProps(props)
      if (isStyledText(values['content'])) {
        delete values['content']
      }
      return {
        ...values,
        ...(selectedIndex === undefined ? {} : { selectedIndex }),
      }
    },
    true,
  )
  createRenderEffect(() => {
    const content = resolveProps(props)['content']
    if (node instanceof TextRenderable && isStyledText(content)) {
      node.content = content
    }
  })
  for (const child of children) {
    insert(node, child, null)
  }
  return node as unknown as JSX.Element
}

export function useBindings(
  keymap: WizardKeymap,
  layer: () => Layer<Renderable, KeyEvent>,
) {
  createEffect(() => onCleanup(keymap.registerLayer(layer())))
}
