import { expect, test, vi } from 'vitest'
import {
  closeOwnedBrowser,
  runVoiceOverWorker,
  type NarrationPage,
  type VoiceOverDriver,
  type WorkerAdapters,
} from '../../../../../scripts/repo/test/voiceover/worker.mts'

const target =
  'http://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md'

test('captures one fresh phrase from the verified API page control', async () => {
  const phrases: string[] = []
  const voiceOver = fakeVoiceOver(phrases)
  const page = fakePage()
  const adapters = fakeAdapters(page, voiceOver)
  const result = await runVoiceOverWorker(target, adapters)
  expect(result.status).toBe(0)
  expect(result.evidence).toEqual({
    action: 'moveCursorToKeyboardFocus',
    pageUrl: target,
    phrases: ['Reading mode, toggle button'],
  })
  expect(vi.mocked(voiceOver.start)).toHaveBeenCalledWith({
    capture: false,
    retries: 1,
    timeout: 15_000,
  })
  expect(vi.mocked(voiceOver.perform)).toHaveBeenCalledWith(
    voiceOver.keyboardCommands.moveCursorToKeyboardFocus,
    { capture: true, retries: 1, timeout: 5000 },
  )
  expect(vi.mocked(voiceOver.stop)).toHaveBeenCalledOnce()
  expect(vi.mocked(page.dispose)).toHaveBeenCalledOnce()
})

test('does not import or start VoiceOver when foreground ownership is wrong', async () => {
  const voiceOver = fakeVoiceOver([])
  const page = fakePage()
  const adapters = fakeAdapters(page, voiceOver, { frontmost: false })
  const result = await runVoiceOverWorker(target, adapters)
  expect(result.status).toBe(1)
  expect(result.started).toBe(false)
  expect(vi.mocked(voiceOver.start)).not.toHaveBeenCalled()
  expect(vi.mocked(adapters.loadVoiceOver)).not.toHaveBeenCalled()
  expect(vi.mocked(page.dispose)).toHaveBeenCalledOnce()
})

test('requires parent authorization immediately before VoiceOver startup', async () => {
  const voiceOver = fakeVoiceOver([])
  const adapters = fakeAdapters(fakePage(), voiceOver)
  adapters.authorizeStart = vi.fn(async () => false)
  const result = await runVoiceOverWorker(target, adapters)
  expect(result.status).toBe(1)
  expect(vi.mocked(voiceOver.start)).not.toHaveBeenCalled()
  expect(adapters.authorizeStart).toHaveBeenCalledOnce()
})

test('rechecks current ownership after Guidepup startup before arming capture', async () => {
  const voiceOver = fakeVoiceOver([])
  const page = fakePage()
  let captureWatchArmed = false
  page.ownershipIntact = vi.fn(async () => captureWatchArmed)
  page.armOwnershipWatch = vi.fn(async () => {
    captureWatchArmed = true
  })
  const result = await runVoiceOverWorker(target, fakeAdapters(page, voiceOver))
  expect(result.status).toBe(0)
  expect(vi.mocked(page.armOwnershipWatch)).toHaveBeenCalledOnce()
})

test('reports browser closure only after the server closes successfully', async () => {
  const onClosed = vi.fn()
  const closeServer = vi.fn(async () => {})
  await closeOwnedBrowser(closeServer, 1042, onClosed)
  expect(onClosed).toHaveBeenCalledWith(1042)

  const failedClose = vi.fn(async () => {
    throw new Error('fixture close failure')
  })
  await expect(closeOwnedBrowser(failedClose, 1043, onClosed)).rejects.toThrow(
    'fixture close failure',
  )
  expect(onClosed).toHaveBeenCalledOnce()
})

test('discards phrases if the page briefly loses ownership during capture', async () => {
  const phrases: string[] = []
  const voiceOver = fakeVoiceOver(phrases)
  const page = fakePage()
  vi.mocked(page.ownershipIntact).mockResolvedValueOnce(false)
  const result = await runVoiceOverWorker(target, fakeAdapters(page, voiceOver))
  expect(result.status).toBe(1)
  expect(result.evidence).toBeUndefined()
  expect(voiceOver.spokenPhraseLog).toHaveBeenCalledTimes(1)
  expect(vi.mocked(voiceOver.stop)).toHaveBeenCalledOnce()
})

test('a heading mismatch or page navigation prevents speech capture', async () => {
  const voiceOver = fakeVoiceOver([])
  const page = fakePage({ heading: 'Not the API' })
  const result = await runVoiceOverWorker(target, fakeAdapters(page, voiceOver))
  expect(result.status).toBe(1)
  expect(vi.mocked(voiceOver.start)).not.toHaveBeenCalled()
  expect(vi.mocked(voiceOver.perform)).not.toHaveBeenCalled()
})

test('empty fresh phrase output is not a passing capture', async () => {
  const voiceOver = fakeVoiceOver([], false)
  const result = await runVoiceOverWorker(
    target,
    fakeAdapters(fakePage(), voiceOver),
  )
  expect(result.status).toBe(1)
  expect(result.evidence).toBeUndefined()
})

test('an open-page failure cannot reach VoiceOver startup', async () => {
  const voiceOver = fakeVoiceOver([])
  const adapters = fakeAdapters(fakePage(), voiceOver)
  adapters.openPage = vi.fn(async () => {
    throw new Error('fixture page launch failed')
  })
  const result = await runVoiceOverWorker(target, adapters)
  expect(result.status).toBe(1)
  expect(result.error).toBe('fixture page launch failed')
  expect(vi.mocked(adapters.loadVoiceOver)).not.toHaveBeenCalled()
})

function fakeVoiceOver(phrases: string[], speak = true): VoiceOverDriver {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    perform: vi.fn(async () => {
      if (speak) {
        phrases.push('Reading mode, toggle button')
      }
    }),
    keyboardCommands: { moveCursorToKeyboardFocus: 'move-to-focus' },
    spokenPhraseLog: vi.fn(async () => phrases),
  }
}

function fakePage(
  options: { heading?: string; url?: string } = {},
): NarrationPage {
  return {
    url: () => options.url ?? target,
    bringToFront: vi.fn(async () => {}),
    isVisible: vi.fn(async () => true),
    hasFocus: vi.fn(async () => true),
    heading: vi.fn(async () => options.heading ?? 'API'),
    focusReadingMode: vi.fn(async () => {}),
    armOwnershipWatch: vi.fn(async () => {}),
    ownershipIntact: vi.fn(async () => true),
    dispose: vi.fn(async () => {}),
    processId: 1042,
  }
}

function fakeAdapters(
  page: NarrationPage,
  voiceOver: VoiceOverDriver,
  options: { frontmost?: boolean } = {},
): WorkerAdapters {
  return {
    openPage: vi.fn(async (_url, onBrowserStarted) => {
      onBrowserStarted(1042)
      return page
    }),
    isOwnedBrowserFrontmost: vi.fn(async () => options.frontmost ?? true),
    loadVoiceOver: vi.fn(async () => voiceOver),
    onStarted: vi.fn(),
    onBrowserStarted: vi.fn(),
    onBrowserClosed: vi.fn(),
    authorizeStart: vi.fn(async () => true),
    onStop: vi.fn(),
  }
}
