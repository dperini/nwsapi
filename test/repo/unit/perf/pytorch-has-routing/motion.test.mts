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
    'film-forward-summary',
    'film-inverse-summary',
    'film-forward-caption',
    'film-inverse-caption',
  ]
  for (let i = 0, length = ids.length; i < length; i += 1) {
    const element = document.createElement(
      ids[i] === 'film-forward' || ids[i] === 'film-inverse' ? 'div' : 'button',
    )
    element.id = ids[i]!
    document.body.append(element)
  }
  const timeline = document.createElement('input')
  timeline.id = 'film-timeline'
  timeline.type = 'range'
  timeline.min = '0'
  document.body.append(timeline)
  const animate = vi.fn()
  Object.assign(dom.window.HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
  })
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
  expect(view.document.querySelectorAll('.film-element rect').length).toBe(16)
  expect(
    view.document.querySelector('.film-warning rect')!.getAttribute('width'),
  ).toBe('79')
  expect(view.timeline.value).toBe('0')
  expect(
    view.document.getElementById('film-forward-summary')!.textContent,
  ).toBe('0 operations · No cards yet')
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

test('each diagram toggles playback and scrubs independently in both directions', async () => {
  const view = await fixture()
  const scene = view.document.getElementById('film-forward')!
  const pointer = (type: string, clientX: number) => {
    const event = new view.dom.window.Event(type)
    Object.assign(event, { button: 0, pointerId: 1, clientX })
    scene.dispatchEvent(event)
    if (type === 'pointerup') {
      scene.dispatchEvent(
        new view.dom.window.MouseEvent('click', { detail: 1 }),
      )
    }
  }
  pointer('pointerdown', 100)
  pointer('pointerup', 100)
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(2400)
  expect(view.timeline.value).toBe('2')
  expect(view.document.getElementById('film-inverse-work')!.textContent).toBe(
    '0 operations',
  )
  expect(
    view.document.getElementById('film-inverse-summary')!.textContent,
  ).toBe('0 operations · No cards yet')
  pointer('pointerdown', 100)
  pointer('pointerup', 100)
  expect(vi.getTimerCount()).toBe(0)
  pointer('pointerdown', 100)
  pointer('pointermove', 180)
  pointer('pointerup', 180)
  expect(view.timeline.value).toBe('6')
  expect(vi.getTimerCount()).toBe(0)
  pointer('pointerdown', 180)
  pointer('pointermove', 100)
  pointer('pointerup', 100)
  expect(view.timeline.value).toBe('2')
  pointer('pointerdown', 100)
  pointer('pointermove', -1000)
  pointer('pointerup', -1000)
  expect(view.timeline.value).toBe('0')
  scene.dispatchEvent(
    new view.dom.window.KeyboardEvent('keydown', { key: 'Enter' }),
  )
  expect(vi.getTimerCount()).toBe(1)
  scene.dispatchEvent(
    new view.dom.window.KeyboardEvent('keydown', { key: ' ' }),
  )
  expect(vi.getTimerCount()).toBe(0)
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

test('keyboard scrubbing advances one route and cancels playback', async () => {
  const view = await fixture()
  const scene = view.document.getElementById('film-forward')!
  const key = (value: string) =>
    scene.dispatchEvent(
      new view.dom.window.KeyboardEvent('keydown', {
        key: value,
        cancelable: true,
      }),
    )
  view.click('film-play')
  expect(key('ArrowRight')).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  expect(view.timeline.value).toBe('1')
  expect(view.document.getElementById('film-inverse-work')!.textContent).toBe(
    '0 operations',
  )
  key('End')
  expect(scene.dataset['complete']).toBe('true')
  key('Home')
  expect(view.timeline.value).toBe('0')
  key('ArrowLeft')
  expect(view.timeline.value).toBe('0')
  expect(key('Escape')).toBe(true)
})

test('lost pointer capture prevents a stale drag from starting playback', async () => {
  const view = await fixture()
  const scene = view.document.getElementById('film-forward')!
  const down = new view.dom.window.Event('pointerdown')
  Object.assign(down, { button: 0, pointerId: 1, clientX: 10 })
  scene.dispatchEvent(down)
  scene.dispatchEvent(new view.dom.window.Event('lostpointercapture'))
  scene.dispatchEvent(new view.dom.window.Event('pointerup'))
  scene.dispatchEvent(new view.dom.window.MouseEvent('click', { detail: 1 }))
  expect(vi.getTimerCount()).toBe(0)
})

test('assistive virtual clicks toggle route playback without pointer events', async () => {
  const view = await fixture()
  const scene = view.document.querySelector<HTMLButtonElement>(
    '#film-forward .film-scene-control',
  )!
  scene.click()
  expect(vi.getTimerCount()).toBe(1)
  expect(scene.textContent).toBe('Pause')
  expect(scene.getAttribute('aria-label')).toContain('Pause forward')
  scene.click()
  expect(vi.getTimerCount()).toBe(0)
  expect(scene.textContent).toBe('Play')
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
