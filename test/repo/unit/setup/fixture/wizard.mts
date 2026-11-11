import { REVIEW_TASKS } from '../../../../../scripts/repo/develop/actions.mts'
import { createCliRenderer } from '@opentui/core'
import { menuContent } from '../../../../../scripts/repo/develop/menu.mts'
import type { MenuState } from '../../../../../scripts/repo/develop/actions.mts'

// Fixture-only state. No task execution, tool probes, or VoiceOver calls.
const selected = Number(process.argv[2] ?? 0)
const scenario = process.argv[3] ?? 'ready'
const state: MenuState = {
  selected,
  language: scenario === 'italian' ? 'it' : 'en',
  languageOpen: scenario === 'language-picker',
  ...(scenario === 'review-checks' ? { group: 'review' as const } : {}),
  ...(scenario.startsWith('help:') ? { helpCommand: scenario.slice(5) } : {}),
  result: '',
  readiness: {
    ...Object.fromEntries(
      REVIEW_TASKS.map(task => [task.script, { ready: true, message: '' }]),
    ),
    guide: { ready: true, message: '' },
    review: { ready: true, message: '' },
    'ci:local': { ready: true, message: '' },
  },
}
if (scenario === 'attention') {
  state.readiness!['review'] = {
    ready: false,
    message: 'Dependencies need setup. Run pnpm run go, then retry.',
  }
}
if (scenario === 'error' || scenario === 'fallback-error') {
  state.failures = {
    review: 'Review failed. Fix the reported errors, then run review again.',
  }
}
if (scenario === 'disabled') {
  state.disabled = { voiceover: 'macOS only' }
}
if (scenario === 'success') {
  state.result = 'Checkout checks passed.'
  state.resultKind = 'success'
}
if (scenario === 'info') {
  state.result = 'Documentation server stopped.'
  state.resultKind = 'info'
}
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  useMouse: false,
  consoleMode: 'disabled',
})
menuContent(renderer, state, { onQuit: () => renderer.destroy() })
