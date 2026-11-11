import {
  localizedUi,
  ui as baseUi,
  languageHeader,
  languageOverlay,
  useLanguagePicker,
} from './language-ui.mts'
import {
  localizedTask,
  saveWizardLanguage,
  translateWizard,
} from './language.mts'
import type { WizardLanguage } from './language.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { consoleMessage } from './console-symbols.mts'
import { startWizardMascot } from './mascot.mts'
import { commandHelp, formatCommandOptions } from './help.mts'
import {
  createCliRenderer,
  t,
  fg,
  type CliRenderer,
  type ScrollBoxRenderable,
  type SelectRenderable,
} from '@opentui/core'
import { createRoot, flushSync } from '@opentui/react'
import { createDefaultOpenTuiKeymap } from '@opentui/keymap/opentui'
import { KeymapProvider, useBindings } from '@opentui/keymap/react'
import { useEffect, useRef, useState } from 'react'
import {
  menuTasks,
  taskDetails,
  taskDisplayCommand,
  taskStatus,
} from './actions.mts'
import type { MenuState, MenuChoice } from './actions.mts'
import { menuExitHelp, menuHelp } from './keys.mts'

const COLORS = {
  background: '#0c171e',
  text: '#eff3fa',
  muted: '#bdcbd6',
  title: '#4285f4',
  details: '#eff3fa',
  command: '#8ab4f8',
  warning: '#fbbc05',
  success: '#34a853',
  info: '#4285f4',
  error: '#ea4335',
  disabled: '#9aa0a6',
  optional: '#c4b5fd',
}

interface MenuHandlers {
  onLanguage?: (language: WizardLanguage) => void
  onSelect?: (index: number) => void
  onQuit?: () => void
  onMoreChecks?: () => void
  onBack?: () => void
}

interface MenuAppProps extends MenuHandlers {
  state: MenuState
  selectRef: { current: SelectRenderable | null }
}

export function MenuApp({
  state,
  onLanguage,
  onSelect,
  onQuit,
  onMoreChecks,
  onBack,
  selectRef,
}: MenuAppProps) {
  const picker = useLanguagePicker(state, onLanguage)
  const ui = localizedUi(picker.language)
  const tasks = menuTasks(state).map(task =>
    localizedTask(task, picker.language),
  )
  const [selected, setSelected] = useState(state.selected)
  const [mascot, setMascot] = useState('🧙')
  useEffect(() => startWizardMascot(setMascot), [])
  const [helpCommand, setHelpCommand] = useState(state.helpCommand)
  const bodyRef = useRef<ScrollBoxRenderable | null>(null)
  const pickerRef = useRef<SelectRenderable | null>(null)
  useEffect(() => {
    const target = picker.open ? pickerRef.current : selectRef.current
    target?.focus()
  }, [picker.open, helpCommand])

  useBindings(
    () => ({
      commands: [
        { name: 'wizard.quit', run: () => onQuit?.() },
        {
          name: 'wizard.more-checks',
          run: () => {
            if (
              !state.group &&
              tasks[state.selected]?.script === 'review' &&
              !state.disabled?.['review']
            ) {
              onMoreChecks?.()
            }
          },
        },
        {
          name: 'wizard.back',
          run: () => {
            if (helpCommand) {
              setHelpCommand(undefined)
            } else if (state.group) {
              onBack?.()
            } else {
              onQuit?.()
            }
          },
        },
        {
          name: 'wizard.help',
          run: () => {
            if (state.disabled?.[tasks[state.selected]!.script]) {
              return
            }
            setHelpCommand(tasks[state.selected]!.script)
            bodyRef.current?.scrollTo(0)
          },
        },
        {
          name: 'wizard.details.previous-page',
          run: () => bodyRef.current?.scrollBy(-1, 'viewport'),
        },
        {
          name: 'wizard.details.next-page',
          run: () => bodyRef.current?.scrollBy(1, 'viewport'),
        },
        ...tasks.map((_, index) => ({
          name: `wizard.preview.${index + 1}`,
          run: () => {
            selectRef.current?.setSelectedIndex(index)
          },
        })),
      ],
      bindings: picker.open
        ? [{ key: 'q', cmd: 'wizard.quit' }]
        : [
            { key: 'q', cmd: 'wizard.quit' },
            { key: 'm', cmd: 'wizard.more-checks' },
            { key: 'escape', cmd: 'wizard.back' },
            { key: '?', cmd: 'wizard.help' },
            { key: 'shift+?', cmd: 'wizard.help' },
            { key: 'pageup', cmd: 'wizard.details.previous-page' },
            { key: 'pagedown', cmd: 'wizard.details.next-page' },
            ...tasks.map((_, index) => ({
              key: String(index + 1),
              cmd: `wizard.preview.${index + 1}`,
            })),
          ],
    }),
    [onQuit, helpCommand, picker.open],
  )

  if (helpCommand) {
    const help = commandHelp(helpCommand)
    return ui(
      'box',
      {
        key: 'command-help',
        id: 'wizard-command-help',
        width: '100%',
        height: '100%',
        padding: 1,
        gap: 1,
        flexDirection: 'column',
        backgroundColor: COLORS.background,
      },
      languageHeader(
        `NWSAPI v3  /  Developer wizard ${mascot}`,
        picker.language,
        picker.toggle,
      ),
      ui('text', {
        content: `${help.title} · Command options`,
        fg: COLORS.command,
        height: 1,
        flexShrink: 0,
      }),
      ui(
        'scrollbox',
        {
          ref: bodyRef,
          flexGrow: 1,
          scrollY: true,
          scrollX: false,
          contentOptions: { gap: 1 },
        },
        ui('text', {
          content: `Usage:\n  ${help.command} [options]`,
          fg: COLORS.text,
          flexShrink: 0,
        }),
        ui('text', {
          content: help.description,
          fg: COLORS.muted,
          flexShrink: 0,
          wrapMode: 'word',
        }),
        ui('text', {
          content: formatCommandOptions(help),
          fg: COLORS.text,
          flexShrink: 0,
          wrapMode: 'word',
        }),
      ),
      ui('text', {
        content: 'PgUp/PgDn scroll · Esc back · q quit',
        fg: COLORS.title,
        height: 1,
        flexShrink: 0,
      }),
      languageOverlay(picker, pickerRef),
    )
  }

  const selectedTask = tasks[selected]!
  const command = taskDisplayCommand(selectedTask)
  const selectedStatus = taskStatus(selectedTask, state)
  const disabled = selectedStatus.kind === 'disabled'

  return ui(
    'box',
    {
      key: 'task-menu',
      id: 'wizard-menu',
      width: '100%',
      height: '100%',
      padding: 1,
      flexDirection: 'column',
      gap: 1,
      backgroundColor: COLORS.background,
    },
    languageHeader(
      `NWSAPI v3  /  Developer wizard ${mascot}`,
      picker.language,
      picker.toggle,
    ),
    ui('text', {
      content: state.group
        ? 'More checks · Choose a check. Esc returns.'
        : disabled
          ? 'Choose an available task.'
          : 'Choose a task. Enter runs it.',
      fg: COLORS.muted,
      height: 1,
      flexShrink: 0,
      wrapMode: 'word',
    }),
    ui(
      'box',
      { height: tasks.length, flexShrink: 0, flexDirection: 'row' },
      ui('select', {
        id: 'wizard-tasks',
        ref: selectRef,
        width:
          Math.max(
            ...tasks.map((task, index) => `${index + 1}. ${task.name}`.length),
          ) + 7,
        height: tasks.length,
        flexShrink: 0,
        focused: !picker.open,
        selectedIndex: selected,
        options: tasks.map((task, index) => ({
          name: `${disabled ? '  ' : ''}${index + 1}. ${task.name}`,
          description: task.description,
        })),
        showDescription: false,
        showSelectionIndicator: !disabled,
        wrapSelection: false,
        backgroundColor: COLORS.background,
        focusedBackgroundColor: COLORS.background,
        textColor: COLORS.text,
        focusedTextColor: COLORS.text,
        selectedBackgroundColor: '#1b304a',
        selectedTextColor: disabled ? COLORS.disabled : COLORS.text,
        onChange: (index: number) => {
          const task = tasks[index]
          if (task) {
            state.selected = index
            setSelected(index)
            bodyRef.current?.scrollTo(0)
          }
        },
        onSelect: (index: number) => {
          if (!state.disabled?.[tasks[index]!.script]) {
            onSelect?.(index)
          }
        },
      }),
      ui(
        'box',
        { width: 18, flexShrink: 0, flexDirection: 'column' },
        ...tasks.map((task, index) => {
          const status = taskStatus(task, state)
          const hint =
            status.kind === 'disabled' ? status.message : status.label
          const color = COLORS[status.kind]
          return ui('text', {
            key: task.script,
            id: `wizard-status-${index}`,
            content: index === selected ? `● ${hint}` : '●',
            fg: color,
            backgroundColor: index === selected ? '#1b304a' : COLORS.background,
            height: 1,
            width: '100%',
            flexShrink: 0,
          })
        }),
      ),
    ),
    ui(
      'scrollbox',
      {
        id: 'wizard-details',
        ref: bodyRef,
        width: '100%',
        flexGrow: 1,
        flexShrink: 1,
        contentOptions: { paddingRight: 1, gap: 1 },
        scrollY: true,
        scrollX: false,
        scrollbarOptions: { showArrows: false },
      },
      ...(!disabled
        ? [
            ui('text', {
              content: t`${selectedTask.name}${fg(COLORS.optional)(selectedTask.optional ? translateWizard(' · Optional', picker.language) : '')}`,
              fg: COLORS.title,
              bold: true,
              width: '100%',
              height: 'auto',
              flexShrink: 0,
              wrapMode: 'word',
            }),
            selectedStatus.message
              ? ui('text', {
                  content: consoleMessage(
                    selectedStatus.kind,
                    selectedStatus.message,
                  ),
                  fg: COLORS[selectedStatus.kind],
                  width: '100%',
                  height: 'auto',
                  flexShrink: 0,
                  wrapMode: 'word',
                })
              : null,
            state.result
              ? ui('text', {
                  content: consoleMessage(
                    state.resultKind ?? 'info',
                    state.result,
                  ),
                  fg: COLORS[state.resultKind ?? 'info'],
                  width: '100%',
                  height: 'auto',
                  flexShrink: 0,
                  wrapMode: 'word',
                })
              : null,
            ui('text', {
              content: taskDetails({ ...selectedTask, optional: false }),
              fg: COLORS.details,
              width: '100%',
              height: 'auto',
              flexShrink: 0,
              wrapMode: 'word',
            }),
            ui('text', {
              content: `Next: ${selectedTask.next.replace(/^Next:\s*/, '')}`,
              fg: COLORS.muted,
              width: '100%',
              height: 'auto',
              flexShrink: 0,
              wrapMode: 'word',
            }),
          ]
        : []),
    ),
    ui('text', {
      content: disabled ? '' : `Command: ${command}`,
      fg: COLORS.command,
      height: 1,
      flexShrink: 0,
    }),
    ui('text', {
      content: disabled
        ? `1–${tasks.length} / ↑↓ choose task · ${menuExitHelp(!!state.group)}`
        : `${menuHelp(tasks.length, process.platform, !!state.group)} · ? options${!state.group && selectedTask.script === 'review' ? ' · m more' : ''}`,
      fg: COLORS.title,
      height: 1,
      flexShrink: 0,
      wrapMode: 'word',
    }),
    languageOverlay(picker, pickerRef),
  )
}

export function menuContent(
  renderer: CliRenderer,
  state: MenuState,
  handlers: MenuHandlers = {},
) {
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const root = createRoot(renderer)
  const selectRef: { current: SelectRenderable | null } = { current: null }
  flushSync(() =>
    root.render(
      baseUi(
        KeymapProvider,
        { keymap },
        baseUi(MenuApp, { state, selectRef, ...handlers }),
      ),
    ),
  )
  const menu = selectRef.current
  if (!menu && !state.helpCommand) {
    throw new Error('OpenTUI React did not render the wizard task list.')
  }
  return menu as SelectRenderable | null
}

export async function chooseTask(state: MenuState): Promise<MenuChoice> {
  let finish: (value: MenuChoice) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const result = new Promise<MenuChoice>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: COLORS.background,
    useMouse: true,
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
    menuContent(renderer, state, {
      onLanguage: language => saveWizardLanguage(REPO_ROOT, language),
      onSelect: index => finish(index),
      onQuit: terminate,
      onMoreChecks: () => finish('review-checks'),
      onBack: () => finish('back'),
    })
    return await result
  } finally {
    process.removeListener('SIGTERM', terminate)
    renderer.off('resize', resize)
    renderer.destroy()
  }
}
