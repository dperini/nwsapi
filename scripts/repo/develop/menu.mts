import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core'
import type { CliRenderer } from '@opentui/core'
import { TASKS, taskInstructions } from './actions.mts'
import type { MenuState } from './actions.mts'

function menuContent(renderer: CliRenderer, state: MenuState) {
  const panel = new BoxRenderable(renderer, {
    width: '100%',
    height: '100%',
    padding: 1,
    flexDirection: 'column',
    gap: 1,
  })
  const menu = new SelectRenderable(renderer, {
    width: '100%',
    height: 4,
    flexShrink: 0,
    selectedIndex: state.selected,
    options: TASKS.map((task, index) => {
      const status = state.readiness?.[task.script]
      return {
        name: `${index + 1}. ${task.name}`,
        description: status
          ? status.ready
            ? `${task.description} · Ready`
            : `${task.description} · Setup needed`
          : task.description,
      }
    }),
    showDescription: false,
    wrapSelection: false,
    backgroundColor: '#0c171e',
    focusedBackgroundColor: '#0c171e',
    textColor: '#eff3fa',
    focusedTextColor: '#eff3fa',
    selectedBackgroundColor: '#37304c',
    selectedTextColor: '#e1cefc',
  })
  const details = new TextRenderable(renderer, {
    content: taskInstructions(
      TASKS[state.selected]!,
      state.readiness?.[TASKS[state.selected]!.script],
    ),
    fg: '#cceadf',
    width: '100%',
    height: 7,
    flexShrink: 0,
    wrapMode: 'word',
  })
  panel.add(
    new TextRenderable(renderer, {
      content: 'nwsapi / Developer menu',
      fg: '#d3b8fa',
      height: 1,
    }),
  )
  panel.add(
    new TextRenderable(renderer, {
      content:
        'New checkout? Start with setup. Otherwise choose what you need.',
      fg: '#bdcbd6',
      wrapMode: 'word',
    }),
  )
  panel.add(menu)
  panel.add(details)
  panel.add(
    new TextRenderable(renderer, {
      content: state.result,
      height: Math.min(6, Math.max(2, Math.ceil(state.result.length / 72))),
      flexShrink: 0,
      fg: '#bdcbd6',
      wrapMode: 'word',
    }),
  )
  panel.add(
    new TextRenderable(renderer, {
      content: `1–${TASKS.length} or ↑/↓ preview · Enter run · q or Esc quit\nNothing runs until you press Enter.`,
      fg: '#d3b8fa',
      wrapMode: 'word',
    }),
  )
  renderer.root.add(panel)
  menu.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const task = TASKS[index]
    if (task) {
      state.selected = index
      details.content = taskInstructions(task, state.readiness?.[task.script])
    }
  })
  menu.focus()
  return menu
}

export async function chooseTask(
  state: MenuState,
): Promise<number | undefined> {
  let finish: (value: number | undefined) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const result = new Promise<number | undefined>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: '#0c171e',
    useMouse: false,
    targetFps: 10,
    onDestroy: () => finish(undefined),
    consoleMode: 'disabled',
  })
  const terminate = () => {
    finish(undefined)
  }
  const resize = (width: number, height: number) => {
    if (width < 80 || height < 24) {
      fail(new Error('Terminal is too small for the visual menu.'))
    }
  }
  process.once('SIGTERM', terminate)
  renderer.on('resize', resize)
  try {
    const menu = menuContent(renderer, state)
    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) =>
      finish(index),
    )
    renderer.keyInput.on('keypress', key => {
      if (/^\d$/.test(key.name)) {
        const index = Number(key.name) - 1
        if (TASKS[index]) {
          menu.setSelectedIndex(index)
        }
      }
      if (key.name === 'q' || key.name === 'escape') {
        finish(undefined)
      }
    })
    return await result
  } finally {
    process.removeListener('SIGTERM', terminate)
    renderer.off('resize', resize)
    renderer.destroy()
  }
}
