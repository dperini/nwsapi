import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'

afterEach(() => vi.unstubAllGlobals())

async function fixture() {
  vi.resetModules()
  const dom = new JSDOM(
    ['training', 'search', 'policy', 'source']
      .map(id => `<section id="${id}"><p class="section-intro"></p></section>`)
      .join(''),
  )
  const audios: HTMLAudioElement[] = []
  const reject: Array<(reason: Error) => void> = []
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('Audio', function () {
    const audio = dom.window.document.createElement('audio')
    let paused = true
    Object.defineProperty(audio, 'paused', { get: () => paused })
    Object.defineProperty(audio, 'duration', { value: 30 })
    audio.pause = vi.fn(() => {
      paused = true
      audio.dispatchEvent(new dom.window.Event('pause'))
    })
    audio.play = vi.fn(() => {
      paused = false
      audio.dispatchEvent(new dom.window.Event('play'))
      return new Promise<void>((resolve, failure) => {
        reject.push(failure)
        void resolve
      })
    })
    audios.push(audio)
    return audio
  })
  const { initializeNarration } =
    await import('../../../../../docs/repo/perf/pytorch-has-routing/narration.mts')
  initializeNarration()
  const buttons =
    dom.window.document.querySelectorAll<HTMLButtonElement>('.narration-play')
  return { dom, audios, buttons, reject }
}

test('switching narration pauses the previous clip and ignores its stale failure', async () => {
  const view = await fixture()
  view.buttons[0]!.click()
  expect(view.buttons[0]!.getAttribute('aria-label')).toBe(
    'Pause narration: training',
  )
  view.buttons[1]!.click()
  expect(view.audios[0]!.paused).toBe(true)
  expect(view.buttons[0]!.getAttribute('aria-label')).toBe(
    'Listen to narration: training',
  )
  expect(view.buttons[1]!.getAttribute('aria-pressed')).toBe('true')
  view.reject[0]!(new Error('cancelled'))
  await Promise.resolve()
  expect(view.buttons[0]!.textContent).toBe('Listen')
  expect(view.audios[1]!.paused).toBe(false)
  view.dom.window.dispatchEvent(new view.dom.window.Event('pagehide'))
  expect(view.audios[1]!.paused).toBe(true)
  expect(view.buttons[1]!.getAttribute('aria-pressed')).toBe('false')
})

test('playback failure resets pressed controls and permits a retry', async () => {
  const view = await fixture()
  view.buttons[0]!.click()
  view.reject[0]!(new Error('unavailable'))
  await Promise.resolve()
  expect(view.audios[0]!.paused).toBe(true)
  expect(view.buttons[0]!.getAttribute('aria-pressed')).toBe('false')
  expect(view.buttons[0]!.textContent).toBe('Audio unavailable')
  expect(view.buttons[0]!.getAttribute('aria-label')).toContain(
    view.buttons[0]!.textContent,
  )
  view.buttons[0]!.click()
  expect(view.buttons[0]!.getAttribute('aria-pressed')).toBe('true')
})
