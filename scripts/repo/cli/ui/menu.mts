import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core'
import type { CliRenderer } from '@opentui/core'
import { createInterface } from 'node:readline/promises'
import { runCli } from '../../cli.mts'
import { interactiveActions } from './actions.mts'
import type { InteractiveAction } from './actions.mts'
import { formatCliOutput } from './terminal.mts'

const COLORS = {
  background: '#0c171e',
  text: '#eff3fa',
  muted: '#bdcbd6',
  title: '#d3b8fa',
  details: '#cceadf',
}

const ACTIONS: readonly InteractiveAction[] = interactiveActions

const MINIMUM_WIDTH = 80
const MINIMUM_HEIGHT = 24

export function createMenu(renderer: CliRenderer, selectedIndex: number) {
  const panel = new BoxRenderable(renderer, {
    width: '100%',
    height: '100%',
    padding: 1,
    flexDirection: 'column',
    gap: 1,
  })
  const title = new TextRenderable(renderer, {
    content: 'nwsapi / Command menu',
    fg: COLORS.title,
    height: 1,
    flexShrink: 0,
  })
  const intro = new TextRenderable(renderer, {
    content: 'Choose an action. The preview updates until you press Enter.',
    fg: COLORS.muted,
    height: 1,
    flexShrink: 0,
    wrapMode: 'word',
  })
  const list = new SelectRenderable(renderer, {
    width: '100%',
    height: ACTIONS.length,
    flexShrink: 0,
    selectedIndex,
    options: ACTIONS.map((action, index) => ({
      name: `${index + 1}. ${action.label}`,
      description: action.description,
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
  const detail = new TextRenderable(renderer, {
    content: ACTIONS[selectedIndex]!.description,
    fg: COLORS.details,
    width: '100%',
    height: 2,
    flexShrink: 0,
    wrapMode: 'word',
  })
  const command = new TextRenderable(renderer, {
    content: `Command: ${ACTIONS[selectedIndex]!.command}`,
    fg: COLORS.details,
    height: 1,
    flexShrink: 0,
  })
  const footer = new TextRenderable(renderer, {
    content: '↑/↓ or 1–4 preview · Enter run · Esc cancel',
    fg: COLORS.title,
    height: 1,
    flexShrink: 0,
  })
  panel.add(title)
  panel.add(intro)
  panel.add(list)
  panel.add(detail)
  panel.add(command)
  panel.add(footer)
  renderer.root.add(panel)
  list.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const action = ACTIONS[index]
    if (action) {
      detail.content = action.description
      command.content = `Command: ${action.command}`
    }
  })
  renderer.keyInput.on('keypress', key => {
    if (/^[1-4]$/.test(key.name)) {
      list.setSelectedIndex(Number(key.name) - 1)
    }
  })
  list.focus()
  return list
}

export async function chooseAction() {
  let finish: (value: number | undefined) => void = () => {}
  let terminatedSignal: NodeJS.Signals | undefined
  let fail: (error: Error) => void = () => {}
  let selected: number | undefined
  const result = new Promise<number | undefined>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    backgroundColor: COLORS.background,
    useMouse: false,
    targetFps: 10,
    onDestroy: () => finish(undefined),
    consoleMode: 'disabled',
  })
  const cancel = (signal: NodeJS.Signals) => {
    terminatedSignal = signal
    finish(undefined)
  }
  const resize = (width: number, height: number) => {
    if (width < MINIMUM_WIDTH || height < MINIMUM_HEIGHT) {
      fail(new Error('Terminal is too small for the visual menu.'))
    }
  }
  const onSigint = () => cancel('SIGINT')
  const onSigterm = () => cancel('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  renderer.on('resize', resize)
  try {
    if (
      renderer.terminalWidth < MINIMUM_WIDTH ||
      renderer.terminalHeight < MINIMUM_HEIGHT
    ) {
      throw new Error('Terminal is too small for the visual menu.')
    }
    const list = createMenu(renderer, 0)
    list.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      if (selected === undefined && ACTIONS[index]) {
        selected = index
        finish(index)
      }
    })
    renderer.keyInput.on('keypress', key => {
      if (key.ctrl && key.name === 'c') {
        cancel('SIGINT')
        return
      }
      if (key.name === 'escape' || key.name === 'q') {
        finish(undefined)
      }
    })
    const choice = await result
    return terminatedSignal ?? choice
  } finally {
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
    renderer.off('resize', resize)
    renderer.destroy()
  }
}

export async function readSelector() {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return (await prompt.question('CSS selector: ')).trim()
  } finally {
    prompt.close()
  }
}

export async function executeInteractiveAction(
  index: number,
  run: typeof runCli = runCli,
  readSelectorValue: () => Promise<string> = readSelector,
) {
  const action = ACTIONS[index]!
  const args = [...action.args]
  try {
    if (action.prompt) {
      const selector = await readSelectorValue()
      if (!selector) {
        console.log('No selector entered. No command was run.')
        return 0
      }
      args.push(selector)
    }
    const output = await run(args)
    console.log(formatCliOutput(output, process.stdout.isTTY))
    return 0
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return 130
    }
    const message = `nwsapi: ${error instanceof Error ? error.message : String(error)}`
    console.error(formatCliOutput(message, process.stderr.isTTY, true))
    return 1
  }
}

export async function runInteractiveCliWith(
  choose: () => Promise<number | undefined | NodeJS.Signals>,
  execute: (index: number) => Promise<number>,
) {
  let index: number | undefined | NodeJS.Signals
  try {
    index = await choose()
  } catch {
    return 78
  }
  if (index === 'SIGINT') {
    return 130
  }
  if (index === 'SIGTERM') {
    return 143
  }
  if (typeof index !== 'number') {
    return 0
  }
  return execute(index)
}

export function runInteractiveCli() {
  return runInteractiveCliWith(chooseAction, index =>
    executeInteractiveAction(index),
  )
}
