import { afterEach, expect, test, vi } from 'vitest'
import { createRoot } from 'solid-js/dist/solid.js'
import { createLanguageTransition } from '../../../../scripts/repo/develop/flipboard-transition.mts'
import { FLIP_TOTAL_DURATION } from '../../../../scripts/repo/develop/flipboard.mts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('Solid transition preserves matching cells and cancels its timer on disposal', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', '1')
  createRoot(dispose => {
    const transition = createLanguageTransition()
    const text = transition.bind(0)
    expect(text('CAT', 'en')).toBe('CAT')
    transition.begin()
    expect(text('CAR', 'it')).toBe('CAT')
    vi.advanceTimersByTime(160)
    expect(text('CAR', 'it').slice(0, 2)).toBe('CA')
    vi.advanceTimersByTime(FLIP_TOTAL_DURATION)
    expect(text('CAR', 'it')).toBe('CAR')
    transition.begin()
    dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

test('animation opt-out applies the language immediately without scheduling work', () => {
  vi.useFakeTimers()
  vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', '0')
  createRoot(dispose => {
    const transition = createLanguageTransition()
    const text = transition.bind(0)
    text('English', 'en')
    transition.begin()
    expect(text('Italiano', 'it')).toBe('Italiano')
    expect(vi.getTimerCount()).toBe(0)
    dispose()
  })
})

test('a second language change replaces the pending animation and can finish immediately', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', '1')
  createRoot(dispose => {
    const transition = createLanguageTransition()
    const text = transition.bind(0)
    text('CAT', 'en')
    transition.begin()
    text('CAR', 'it')
    vi.advanceTimersByTime(160)
    const interrupted = text('CAR', 'it')
    transition.begin()
    expect(text('CAT', 'en')).toBe(interrupted)
    expect(vi.getTimerCount()).toBe(1)
    transition.finish()
    expect(text('CAT', 'en')).toBe('CAT')
    expect(vi.getTimerCount()).toBe(0)
    dispose()
  })
})
