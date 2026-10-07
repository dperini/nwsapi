import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { toyNodes } from '../../../../../docs/repo/perf/pytorch-has-routing/dom.mts'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function fixture(reducedMotion = false) {
  vi.resetModules()
  const dom = new JSDOM('<main></main>')
  const document = dom.window.document
  const ids = [
    'film-play',
    'film-next',
    'film-reset',
    'film-beat',
    'film-status',
    'film-forward',
    'film-inverse',
    'film-forward-work',
    'film-inverse-work',
    'film-forward-result',
    'film-inverse-result',
    'film-forward-caption',
    'film-inverse-caption',
  ]
  for (let i = 0, length = ids.length; i < length; i += 1) {
    const element = document.createElement('button')
    element.id = ids[i]!
    document.body.append(element)
  }
  const timeline = document.createElement('input')
  timeline.id = 'film-timeline'
  timeline.type = 'range'
  timeline.min = '0'
  document.body.append(timeline)
  const animate = vi.fn()
  const cancel = vi.fn()
  Object.assign(dom.window.SVGElement.prototype, {
    animate,
    getAnimations: () => [{ cancel }],
  })
  const media = {
    matches: reducedMotion,
    addEventListener: vi.fn(),
  }
  vi.stubGlobal('document', document)
  vi.stubGlobal('matchMedia', () => media)
  const motion =
    await import('../../../../../docs/repo/perf/pytorch-has-routing/motion.mts')
  vi.useFakeTimers()
  motion.initializeMotion()
  motion.renderMotion(toyNodes([2, 0, 1, 0], true))
  const click = (id: string) => document.getElementById(id)!.click()
  return { ...motion, document, timeline, animate, cancel, media, click, dom }
}

test('scrubbing and playback produce the same exact matches for both routes', async () => {
  const view = await fixture()
  expect(view.timeline.value).toBe('0')
  expect(vi.getTimerCount()).toBe(0)
  view.click('film-next')
  view.click('film-next')
  expect(view.animate).toHaveBeenCalledTimes(2)
  expect(view.cancel).toHaveBeenCalled()
  view.click('film-play')
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(1200)
  expect(view.timeline.value).toBe('3')
  view.click('film-play')
  expect(vi.getTimerCount()).toBe(0)
  view.timeline.value = view.timeline.max
  view.timeline.dispatchEvent(new view.dom.window.Event('input'))
  const scenes = view.document.querySelectorAll('[data-complete="true"]')
  expect(scenes.length).toBe(2)
  const matches = view.document.querySelectorAll('[data-match="true"]')
  expect(matches.length).toBe(4)
  expect(
    view.document.querySelectorAll('.film-element[data-marked="true"]').length,
  ).toBe(0)
  expect(view.document.getElementById('film-status')!.dataset['playback']).toBe(
    'complete',
  )
  view.timeline.value = '2'
  view.timeline.dispatchEvent(new view.dom.window.Event('input'))
  expect(view.document.getElementById('film-status')!.dataset['playback']).toBe(
    'paused',
  )
  view.timeline.value = view.timeline.max
  view.timeline.dispatchEvent(new view.dom.window.Event('input'))
  expect(
    (view.document.getElementById('film-next') as HTMLButtonElement).disabled,
  ).toBe(true)
  view.click('film-play')
  expect(view.timeline.value).toBe('0')
  vi.advanceTimersByTime(Number(view.timeline.max) * 1200)
  expect(vi.getTimerCount()).toBe(0)
  view.click('film-reset')
  expect(view.timeline.value).toBe('0')
})

test('reduced motion keeps the complete timeline without moving search cursors', async () => {
  const view = await fixture(true)
  view.click('film-next')
  view.click('film-next')
  expect(view.animate).not.toHaveBeenCalled()
  view.click('film-play')
  const callback = view.media.addEventListener.mock.calls[0]![1] as () => void
  callback()
  expect(vi.getTimerCount()).toBe(0)
})

test('hidden tabs pause playback and edits reset both traces', async () => {
  const view = await fixture()
  view.click('film-play')
  Object.defineProperty(view.document, 'hidden', {
    value: false,
    configurable: true,
  })
  view.document.dispatchEvent(new view.dom.window.Event('visibilitychange'))
  expect(vi.getTimerCount()).toBe(1)
  Object.defineProperty(view.document, 'hidden', { value: true })
  view.document.dispatchEvent(new view.dom.window.Event('visibilitychange'))
  expect(vi.getTimerCount()).toBe(0)
  view.renderMotion(toyNodes([0, 0, 0, 0], false))
  expect(view.timeline.value).toBe('0')
  expect(view.document.querySelectorAll('.film-warning').length).toBe(0)
})
