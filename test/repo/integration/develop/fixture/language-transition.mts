import { batch } from 'solid-js/dist/solid.js'
import { createTestRenderer } from '@opentui/core/testing'
import { menuContent } from '../../../../../scripts/repo/develop/menu.mts'
import { FLIP_TOTAL_DURATION } from '../../../../../scripts/repo/develop/flipboard/text.mts'

export async function exerciseLanguageTransition() {
  const setup = await createTestRenderer({ width: 100, height: 30 })
  try {
    const state = { selected: 0, result: '', language: 'en' as 'en' | 'it' }
    let activations = 0
    const menu = menuContent(setup.renderer, state, {
      onSelect: () => {
        activations++
      },
    })!
    await setup.flush()
    const before = setup.captureCharFrame()
    batch(() => setup.mockInput.pressKey('l'))
    await setup.flush()
    await setup.mockInput.pressKeys(['ARROW_DOWN'])
    batch(() => setup.mockInput.pressEnter())
    await new Promise(resolve => setTimeout(resolve, 160))
    await setup.flush()
    const during = setup.captureCharFrame()
    await new Promise(resolve => setTimeout(resolve, FLIP_TOTAL_DURATION))
    await setup.flush()
    const after = setup.captureCharFrame()
    return {
      before,
      during,
      after,
      selected: menu.getSelectedIndex(),
      destroyed: menu.isDestroyed,
      activations,
      language: state.language,
    }
  } finally {
    await setup.dispose()
  }
}
