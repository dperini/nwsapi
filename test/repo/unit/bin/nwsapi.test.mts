import { expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  ACTIONS,
  isMainModule,
  selectedAction,
} from '../../../../src/bin/nwsapi.mts'

test('plain CLI menu selects only an available numbered action', () => {
  expect(ACTIONS.length).toBeGreaterThan(0)
  expect(selectedAction('1')).toBe(0)
  expect(selectedAction(String(ACTIONS.length))).toBe(ACTIONS.length - 1)
  expect(selectedAction('')).toBe(0)
  expect(selectedAction('0')).toBeUndefined()
  expect(selectedAction('not a number')).toBeUndefined()
  expect(selectedAction(String(ACTIONS.length + 1))).toBeUndefined()
})

test('CLI entrypoint guard matches direct and linked paths', () => {
  const entry = fileURLToPath(import.meta.url)
  expect(isMainModule(import.meta.url, entry)).toBe(true)
  expect(isMainModule(import.meta.url, `${entry}.missing`)).toBe(false)
  expect(isMainModule(import.meta.url, undefined)).toBe(false)
})
