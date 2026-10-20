import {
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core'
import type { CliRenderer } from '@opentui/core'
import { TASKS, taskDetails } from './actions.mts'
import type { MenuState } from './actions.mts'
import { menuHelp } from './keys.mts'

const COLORS = {
  background: '#0c171e',
  text: '#eff3fa',
  muted: '#bdcbd6',
  title: '#d3b8fa',
  details: '#cceadf',
}

export function optionName(index: number, state: MenuState) {
  const task = TASKS[index]!
  const status = state.readiness?.[task.script]
  const readiness = status
    ? status.ready
      ? ' · Ready'
      : ' · Setup needed'
    : ''
  return `${index + 1}. ${task.name}${readiness}`
}

const OPTION_LABEL_WIDTH = Math.max(
  ...TASKS.map((task, index) => `${index + 1}. ${task.name}`.length),
)

export function alignedOptionName(
  index: number,
  state: MenuState,
  alignStatus: boolean,
) {
  const name = `${index + 1}. ${TASKS[index]!.name}`
  const status = state.readiness?.[TASKS[index]!.script]
  if (!alignStatus || !status) {
    return optionName(index, state)
  }
  const label = status.ready ? 'Ready' : 'Setup needed'
  return `${name}${' '.repeat(OPTION_LABEL_WIDTH - name.length + 2)}${label}`
}

export function menuContent(renderer: CliRenderer, state: MenuState) {
  const panel = new BoxRenderable(renderer, {
    width: '100%',
    height: '100%',
    padding: 1,
    flexDirection: 'column',
    gap: 1,
  })
  const title = new TextRenderable(renderer, {
    content: 'nwsapi / Developer menu',
    fg: COLORS.title,
    height: 1,
    flexShrink: 0,
  })
  const intro = new TextRenderable(renderer, {
    content: 'New checkout? Start with setup. Otherwise choose what you need.',
    fg: COLORS.muted,
    height: 1,
    flexShrink: 0,
    wrapMode: 'word',
  })
  const menu = new SelectRenderable(renderer, {
    width: '100%',
    height: TASKS.length,
    flexShrink: 0,
    selectedIndex: state.selected,
    options: TASKS.map((task, index) => ({
      name: alignedOptionName(index, state, renderer.terminalWidth >= 80),
      description: task.description,
    })),
    showDescription: false,
    wrapSelection: false,
    backgroundColor: COLORS.background,
    focusedBackgroundColor: COLORS.background,
    textColor: COLORS.text,
    focusedTextColor: COLORS.text,
    selectedBackgroundColor: '#37304c',
    selectedTextColor: '#e1cefc',
  })
  const body = new ScrollBoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    contentOptions: { paddingRight: 1, gap: 1 },
    scrollY: true,
    scrollX: false,
    scrollbarOptions: { showArrows: false },
  })
  const details = new TextRenderable(renderer, {
    content: taskDetails(
      TASKS[state.selected]!,
      state.readiness?.[TASKS[state.selected]!.script],
    ),
    fg: COLORS.details,
    width: '100%',
    height: 'auto',
    flexShrink: 0,
    wrapMode: 'word',
  })
  const history = new TextRenderable(renderer, {
    content: state.result,
    fg: COLORS.muted,
    width: '100%',
    height: 'auto',
    flexShrink: 0,
    wrapMode: 'word',
  })
  const command = new TextRenderable(renderer, {
    content: `Command: ${TASKS[state.selected]!.command?.join(' ') ?? `pnpm run ${TASKS[state.selected]!.script}`}`,
    fg: COLORS.details,
    height: 1,
    flexShrink: 0,
  })
  const footer = new TextRenderable(renderer, {
    content: menuHelp(TASKS.length),
    fg: COLORS.title,
    height: 2,
    flexShrink: 0,
    wrapMode: 'word',
  })
  body.add(details)
  if (state.result) {
    body.add(history)
  }
  panel.add(title)
  panel.add(intro)
  panel.add(menu)
  panel.add(body)
  panel.add(command)
  panel.add(footer)
  renderer.root.add(panel)
  menu.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const task = TASKS[index]
    if (task) {
      state.selected = index
      details.content = taskDetails(task, state.readiness?.[task.script])
      command.content = `Command: ${task.command?.join(' ') ?? `pnpm run ${task.script}`}`
      body.scrollTo(0)
    }
  })
  renderer.keyInput.on('keypress', key => {
    if (/^\d$/.test(key.name)) {
      const index = Number(key.name) - 1
      if (TASKS[index]) {
        menu.setSelectedIndex(index)
      }
    }
    if (key.name === 'pageup') {
      key.preventDefault()
      body.scrollBy(-1, 'viewport')
    }
    if (key.name === 'pagedown') {
      key.preventDefault()
      body.scrollBy(1, 'viewport')
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
    backgroundColor: COLORS.background,
    useMouse: false,
    targetFps: 10,
    onDestroy: () => finish(undefined),
    consoleMode: 'disabled',
  })
  const terminate = () => finish(undefined)
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
