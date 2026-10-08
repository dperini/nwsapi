import { act } from 'react'
import { JSDOM } from 'jsdom'
import { afterEach, expect, test, vi } from 'vitest'
import { initializeGuideControls } from '../../../../../docs/repo/perf/pytorch-has-routing/select.mts'

afterEach(() => vi.unstubAllGlobals())

test('checkbox accessible names stay stable while indicator and native state change', async () => {
  const dom = new JSDOM(
    '<label><input type="checkbox" checked>Use the model</label>',
  )
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement)
  vi.stubGlobal('Event', dom.window.Event)
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await act(() => Promise.resolve(initializeGuideControls()))
  const control = dom.window.document.querySelector('input')!
  const button =
    dom.window.document.querySelector<HTMLButtonElement>('[role="checkbox"]')!
  expect(button.getAttribute('aria-label')).toBe('Use the model')
  await act(() => Promise.resolve(button.click()))
  expect(control.checked).toBe(false)
  expect(button.getAttribute('aria-checked')).toBe('false')
  expect(button.getAttribute('aria-label')).toBe('Use the model')
  await act(() =>
    Promise.resolve(dom.window.document.querySelector('label')!.click()),
  )
  expect(control.checked).toBe(true)
  expect(button.getAttribute('aria-checked')).toBe('true')
  expect(button.getAttribute('aria-label')).toBe('Use the model')
})
