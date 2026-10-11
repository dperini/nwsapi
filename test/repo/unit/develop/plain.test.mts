import { expect, test, vi } from 'vitest'
import {
  choosePlain,
  returnToMenu,
} from '../../../../scripts/repo/develop/plain.mts'

function answers(values: string[]) {
  return vi.fn(async () => {
    const value = values.shift()
    if (value === undefined) {
      throw new Error('Unexpected prompt')
    }
    return value
  })
}

test('previewing remembers selection and rejects accidental confirmation text', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const state = { selected: 0, result: '' }
  const ask = answers(['3', 'typo', ''])
  expect(await choosePlain(state, ask)).toBe(2)
  expect(state.selected).toBe(2)
  expect(ask).toHaveBeenCalledTimes(3)
})

test('back permits a different choice without running the first task', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ask = answers(['1', 'b', '4', ''])
  expect(await choosePlain({ selected: 0, result: '' }, ask)).toBe(3)
  expect(ask).toHaveBeenCalledTimes(4)
})

test('rejects non-menu number formats and accepts quitting from preview', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ask = answers(['1e0', '0x1', '', '2', 'Q'])
  expect(await choosePlain({ selected: 0, result: '' }, ask)).toBeUndefined()
  expect(ask).toHaveBeenCalledTimes(5)
})

test('return prompt rejects typos instead of silently proceeding', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ask = answers(['typo', ''])
  expect(await returnToMenu(ask)).toBe(true)
  expect(ask).toHaveBeenCalledTimes(2)
  expect(await returnToMenu(answers(['q']))).toBe(false)
})
