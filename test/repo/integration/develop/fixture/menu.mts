import type { ScrollBoxRenderable } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { menuContent } from '../../../../../scripts/repo/develop/menu.mts'

export async function captureMenuFrames() {
  const setup = await createTestRenderer({ width: 80, height: 24 })
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
    const menu = menuContent(setup.renderer, state)
    let activations = 0
    menu.on('itemSelected', () => {
      activations += 1
    })
    await setup.flush()
    const frames = [setup.captureCharFrame()]
    const panel = setup.renderer.root.getChildren()[0]!
    const body = panel.getChildren()[3] as ScrollBoxRenderable
    await setup.mockInput.pressKeys(['\x1b[6~'])
    await setup.flush()
    const remediation = setup.captureCharFrame()
    await setup.mockInput.pressKeys(Array(8).fill('\x1b[6~'))
    await setup.flush()
    frames.push(setup.captureCharFrame())
    setup.resize(100, 30)
    await setup.flush()
    await setup.mockInput.pressKeys(Array(8).fill('\x1b[6~'))
    await setup.flush()
    const wideScrolled = setup.captureCharFrame()
    setup.resize(120, 40)
    await setup.flush()
    await setup.mockInput.pressKeys(Array(8).fill('\x1b[6~'))
    await setup.flush()
    const largerScrolled = setup.captureCharFrame()
    setup.resize(80, 24)
    await setup.flush()
    const pageDown = {
      selected: menu.getSelectedIndex(),
      activations,
    }
    await setup.mockInput.pressKeys(['ARROW_DOWN'])
    await setup.mockInput.typeText('4')
    await setup.flush()
    const preview = {
      scrollTop: body.scrollTop,
      selected: menu.getSelectedIndex(),
      activations,
      frame: setup.captureCharFrame(),
    }
    setup.mockInput.pressEnter()
    const enter = { selected: menu.getSelectedIndex(), activations }
    setup.resize(100, 30)
    await setup.flush()
    const wide = setup.captureCharFrame()
    setup.resize(120, 40)
    await setup.flush()
    const larger = setup.captureCharFrame()
    setup.resize(79, 23)
    await setup.flush()
    const small = setup.captureCharFrame()
    const commands: string[] = []
    for (const digit of ['1', '2', '3', '4']) {
      await setup.mockInput.typeText(digit)
      await setup.flush()
      commands.push(setup.captureCharFrame())
    }
    return {
      frames,
      remediation,
      pageDown,
      preview,
      enter,
      wideScrolled,
      largerScrolled,
      wide,
      larger,
      small,
      commands,
    }
  } finally {
    setup.renderer.destroy()
  }
}
