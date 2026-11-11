import { batch as flushSync } from 'solid-js/dist/solid.js'
import type { ScrollBoxRenderable } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { menuContent } from '../../../../../scripts/repo/develop/menu.mts'

export async function exerciseMenu(width = 80, height = 24) {
  const setup = await createTestRenderer({ width, height })
  try {
    const state = {
      selected: 0,
      result: `${'Historical result with a long wrapped line '.repeat(40)}LAST HISTORY MARKER`,
      readiness: {
        setup: {
          ready: false,
          message: [
            'Missing tool. Install the supported version before continuing.',
            `The download is cached under ${'/very/long/cache/path/'.repeat(5)}界.`,
            'Restart the command after installation so environment checks run again.',
            'If the problem continues, inspect the complete diagnostic report.',
          ].join('\n'),
        },
        guide: { ready: true, message: '' },
      },
    }
    let activations = 0
    const menu = menuContent(setup.renderer, state, {
      onSelect: () => {
        activations += 1
      },
    })

    if (!menu) {
      throw new Error('Expected task menu')
    }
    await setup.flush()
    const panel = setup.renderer.root.getChildren()[0]!
    const body = panel.getChildren()[3] as ScrollBoxRenderable
    const badge = setup.renderer.root.findDescendantById('wizard-status-0')!
    const badgeGeometry = { height: badge.height, aligned: badge.y === menu.y }
    const initial = {
      selected: menu.getSelectedIndex(),
      scrollTop: body.scrollTop,
    }

    await setup.mockInput.pressKeys(['\x1b[6~'])
    await setup.flush()
    const scrolled = {
      selected: menu.getSelectedIndex(),
      scrollTop: body.scrollTop,
    }

    await setup.mockInput.pressKeys(['ARROW_DOWN'])
    await setup.mockInput.typeText('5')
    await setup.flush()
    const preview = {
      selected: menu.getSelectedIndex(),
      activations,
      scrollTop: body.scrollTop,
    }
    setup.mockInput.pressEnter()
    const activated = { selected: menu.getSelectedIndex(), activations }

    Object.assign(state, {
      disabled: { voiceover: 'Requires macOS.', review: 'Unavailable.' },
    })
    await setup.mockInput.typeText('6')
    await setup.flush()
    await setup.mockInput.pressKeys(['ARROW_DOWN'])
    await setup.flush()
    flushSync(() => setup.mockInput.pressKey('?'))
    setup.mockInput.pressEnter()
    const disabled = {
      selected: menu.getSelectedIndex(),
      activations,
      expanded: menu.showSelectionIndicator,
      panel: setup.renderer.root.getChildren()[0]!.id,
    }
    await setup.mockInput.pressKeys(['ARROW_UP', 'ARROW_UP'])
    await setup.flush()
    const skipped = { selected: menu.getSelectedIndex(), activations }
    flushSync(() => setup.mockInput.pressKey('?'))
    await setup.flush()
    const helpOpened = setup.renderer.root.getChildren()[0]!.id
    await new Promise(resolve => setTimeout(resolve, 0))
    setup.mockInput.pressEscape()
    // A lone Escape waits for the terminal parser's sequence timeout.
    await new Promise(resolve => setTimeout(resolve, 100))
    flushSync(() => {})
    await setup.flush()
    const helpClosed = setup.renderer.root.getChildren()[0]!.id
    return {
      initial,
      badgeGeometry,
      selectionArrow: menu.showSelectionIndicator,
      scrolled,
      preview,
      activated,
      disabled,
      skipped,
      helpOpened,
      helpClosed,
    }
  } finally {
    await setup.dispose()
  }
}

export async function exerciseReviewMenu() {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  try {
    const state = { selected: 4, result: '', group: 'review' as const }
    const selected: number[] = []
    let backs = 0
    let quits = 0
    const menu = menuContent(setup.renderer, state, {
      onSelect: index => selected.push(index),
      onBack: () => {
        backs++
      },
      onQuit: () => {
        quits++
      },
    })!
    await setup.flush()
    setup.mockInput.pressEnter()
    setup.mockInput.pressEscape()
    await new Promise(resolve => setTimeout(resolve, 100))
    await setup.mockInput.typeText('q')
    return {
      options: menu.options.map(option => option.name),
      selected,
      backs,
      quits,
    }
  } finally {
    await setup.dispose()
  }
}

export async function exerciseReviewLauncher() {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  try {
    let opened = 0
    let activated = 0
    menuContent(
      setup.renderer,
      { selected: 2, result: '' },
      {
        onMoreChecks: () => {
          opened++
        },
        onSelect: () => {
          activated++
        },
      },
    )
    await setup.flush()
    await setup.mockInput.typeText('m')
    return { opened, activated }
  } finally {
    await setup.dispose()
  }
}

export async function exerciseLanguagePicker() {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  try {
    const state = { selected: 2, result: '', language: 'en' as 'en' | 'it' }
    const saved: string[] = []
    let activations = 0
    const menu = menuContent(setup.renderer, state, {
      onLanguage: language => {
        saved.push(language)
      },
      onSelect: () => {
        activations++
      },
    })!
    await setup.flush()
    flushSync(() => setup.mockInput.pressKey('l'))
    await setup.flush()
    await setup.mockInput.pressKeys(['ARROW_DOWN'])
    await setup.flush()
    const beforeApply = state.language
    flushSync(() => setup.mockInput.pressEnter())
    await setup.flush()
    const applied = {
      language: state.language,
      selected: menu.getSelectedIndex(),
      activations,
      saved: [...saved],
      name: menu.options[0]!.name,
    }
    flushSync(() => setup.mockInput.pressKey('l'))
    await setup.flush()
    await setup.mockInput.pressKeys(['ARROW_UP'])
    setup.mockInput.pressEscape()
    await new Promise(resolve => setTimeout(resolve, 100))
    await setup.flush()
    flushSync(() => setup.mockInput.pressEnter())
    return {
      beforeApply,
      applied,
      cancelled: state.language,
      saved,
      activations,
    }
  } finally {
    await setup.dispose()
  }
}
