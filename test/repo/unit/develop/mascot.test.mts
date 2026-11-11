import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  chooseVisitor,
  chooseTransformationEffect,
  nextVisitorDelay,
  wizardAnimationsEnabled,
  EFFECTS,
  VISITORS,
  startWizardMascot,
} from '../../../../scripts/repo/develop/mascot.mts'
beforeEach(() => vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', '1'))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test.each(VISITORS)(
  'a brief spell visits %s, then restores the wizard',
  visitor => {
    vi.useFakeTimers()
    const show = vi.fn()
    const random = vi
      .fn()
      .mockReturnValue(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce((VISITORS.indexOf(visitor) + 0.1) / VISITORS.length)
    const stop = startWizardMascot(show, random)
    vi.advanceTimersByTime(17_999)
    expect(show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(show).toHaveBeenLastCalledWith('✨')
    vi.advanceTimersByTime(350)
    expect(show).toHaveBeenLastCalledWith(visitor)
    vi.advanceTimersByTime(1350)
    expect(show.mock.calls.map(([emoji]) => emoji)).toEqual([
      '✨',
      visitor,
      '✨',
      '🧙',
    ])
    stop()
    vi.advanceTimersByTime(120_000)
    expect(show).toHaveBeenCalledTimes(4)
  },
)

test.each(EFFECTS)(
  'randomly selects %s as the transformation effect',
  effect => {
    vi.useFakeTimers()
    const show = vi.fn()
    const random = vi
      .fn()
      .mockReturnValue(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce((EFFECTS.indexOf(effect) + 0.1) / EFFECTS.length)
    const stop = startWizardMascot(show, random)
    vi.advanceTimersByTime(20_000)
    expect(show.mock.calls.map(([emoji]) => emoji)).toEqual([
      effect,
      '🐸',
      effect,
      '🧙',
    ])
    stop()
  },
)

test('fresh delays vary and consecutive visitors never repeat', () => {
  vi.useFakeTimers()
  const show = vi.fn()
  const values = [0, 0, 0, 0, 0, 0, 0.5]
  const stop = startWizardMascot(show, () => values.shift() ?? 0)
  vi.advanceTimersByTime(19_700)
  expect(show).toHaveBeenCalledTimes(4)
  vi.advanceTimersByTime(56_499)
  expect(show).toHaveBeenCalledTimes(4)
  vi.advanceTimersByTime(1 + 1700)
  expect(show.mock.calls[5]).toEqual(['🐉'])
  stop()
})

test('closing the wizard cancels an in-progress spell', () => {
  vi.useFakeTimers()
  const show = vi.fn()
  const stop = startWizardMascot(show, () => 0)
  vi.advanceTimersByTime(18_000)
  stop()
  vi.advanceTimersByTime(120_000)
  expect(show.mock.calls).toEqual([['✨']])
  expect(vi.getTimerCount()).toBe(0)
})

test.each(['0', 'no', 'NO', 'No', 'n', 'N', 'false', 'FALSE', '  No  '])(
  'disables animations for %s',
  value => {
    expect(wizardAnimationsEnabled(value)).toBe(false)
  },
)
test.each([
  '1',
  'yes',
  'YES',
  'YeS',
  'y',
  'Y',
  'true',
  'TRUE',
  '  Y  ',
  '',
  'unknown',
])('enables animations for %s', value => {
  expect(wizardAnimationsEnabled(value)).toBe(true)
})
test('animations default to on when unset', () => {
  vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', undefined)
  expect(wizardAnimationsEnabled()).toBe(true)
})
test('screenshot mode schedules no animation or random draws', () => {
  vi.useFakeTimers()
  vi.stubEnv('NWSAPI_WIZARD_ANIMATIONS', '0')
  const show = vi.fn()
  const random = vi.fn()
  const stop = startWizardMascot(show, random)
  vi.advanceTimersByTime(600_000)
  expect(show).not.toHaveBeenCalled()
  expect(random).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  stop()
})
test('exported selectors cover only the approved visitors and effects', () => {
  const visitors = new Set<string>()
  const effects = new Set<string>()
  for (let index = 0; index < 100; index++) {
    const random = () => index / 100
    const visitor = chooseVisitor(undefined, random)
    const effect = chooseTransformationEffect(random)
    expect(VISITORS).toContain(visitor)
    expect(EFFECTS).toContain(effect)
    expect(chooseVisitor(visitor, random)).not.toBe(visitor)
    const delay = nextVisitorDelay(random)
    expect(delay).toBeGreaterThanOrEqual(18_000)
    expect(delay).toBeLessThan(95_000)
    visitors.add(visitor)
    effects.add(effect)
  }
  expect(visitors).toEqual(new Set(VISITORS))
  expect(effects).toEqual(new Set(EFFECTS))
  expect(nextVisitorDelay(() => 0)).not.toBe(nextVisitorDelay(() => 0.5))
})
