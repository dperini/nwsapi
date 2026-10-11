import { JSDOM } from 'jsdom'
import { afterEach, expect, test, vi } from 'vitest'
import { initializeReadingMode } from '../../../../../docs/repo/perf/pytorch-has-routing/reading-mode.mts'

afterEach(() => vi.unstubAllGlobals())

test('reader clicks request alternating page turns after cancelling page motion', () => {
  const dom = new JSDOM(
    '<button data-reading-toggle></button><button data-color-toggle data-light-label="Light" data-dark-label="Dark"></button>',
    { url: 'https://docs.example/' },
  )
  const { document } = dom.window
  const reading = document.querySelector<HTMLButtonElement>(
    '[data-reading-toggle]',
  )!
  const cancel = vi.fn(() => {
    expect(reading.dataset['bookMotion']).not.toBe('opening')
  })
  Object.defineProperty(document, 'getAnimations', {
    value: () => [{ cancel }],
  })
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('Event', dom.window.Event)
  vi.stubGlobal('localStorage', dom.window.localStorage)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
  try {
    initializeReadingMode()
    expect(reading.dataset['bookMotion']).toBeUndefined()
    reading.click()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(reading.dataset['bookMotion']).toBe('opening')
    expect(reading.getAttribute('aria-pressed')).toBe('true')
    reading.click()
    expect(reading.dataset['bookMotion']).toBe('closing')
    expect(reading.getAttribute('aria-pressed')).toBe('false')
    reading.click()
    expect(reading.dataset['bookMotion']).toBe('opening')
    expect(cancel).toHaveBeenCalledTimes(2)
  } finally {
    dom.window.close()
  }
})
