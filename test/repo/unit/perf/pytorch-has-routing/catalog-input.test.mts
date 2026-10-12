import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  connectSearchInput,
  settledAnnouncement,
} from '../../../../../docs/repo/perf/pytorch-has-routing/catalog-input.mts'

const windows: JSDOM[] = []
afterEach(() => {
  windows.splice(0).forEach(dom => dom.window.close())
  vi.useRealTimers()
})

function fixture() {
  const dom = new JSDOM(
    '<input><button id="clear">Clear</button><button id="undo" hidden>Undo</button><p role="status"></p>',
  )
  windows.push(dom)
  const document = dom.window.document
  const input = document.querySelector('input')!
  const clear = document.querySelector<HTMLButtonElement>('#clear')!
  const undo = document.querySelector<HTMLButtonElement>('#undo')!
  const update = vi.fn()
  const cancelAnnouncement = vi.fn()
  const controls = connectSearchInput({
    input,
    clear,
    undo,
    update,
    cancelAnnouncement,
    setClearDisabled: disabled => {
      clear.disabled = disabled
    },
  })
  const dispatch = (name: string) =>
    input.dispatchEvent(new dom.window.Event(name))
  return {
    document,
    input,
    clear,
    undo,
    update,
    cancelAnnouncement,
    controls,
    dispatch,
  }
}

test('composition filters once when committed and ignores the following duplicate input', () => {
  const view = fixture()
  view.dispatch('compositionstart')
  view.input.value = 'に'
  view.dispatch('input')
  view.input.value = '日本'
  view.dispatch('input')
  expect(view.controls.isComposing()).toBe(true)
  expect(view.update).not.toHaveBeenCalled()
  expect(view.cancelAnnouncement).toHaveBeenCalledOnce()
  view.dispatch('compositionend')
  view.dispatch('input')
  expect(view.update).toHaveBeenCalledOnce()
  expect(view.controls.isComposing()).toBe(false)
})

test('cancelled composition flushes deferred results once', () => {
  const view = fixture()
  view.dispatch('compositionstart')
  view.dispatch('compositionend')
  view.dispatch('input')
  expect(view.update).toHaveBeenCalledOnce()
})

test('clear and undo restore the query and focus without a second clear history', () => {
  const view = fixture()
  view.input.value = ':has(.warning)'
  view.dispatch('input')
  view.clear.click()
  expect(view.input.value).toBe('')
  expect(view.undo.hidden).toBe(false)
  expect(view.clear.disabled).toBe(true)
  expect(view.document.activeElement).toBe(view.input)
  view.undo.click()
  expect(view.input.value).toBe(':has(.warning)')
  expect(view.undo.hidden).toBe(true)
  expect(view.clear.disabled).toBe(false)
  expect(view.document.activeElement).toBe(view.input)
  expect(view.update).toHaveBeenCalledTimes(3)
})

test('typing and history restoration discard stale undo data', () => {
  const view = fixture()
  view.input.value = 'old query'
  view.dispatch('input')
  view.clear.click()
  view.input.value = 'new query'
  view.dispatch('input')
  expect(view.undo.hidden).toBe(true)
  view.undo.click()
  expect(view.input.value).toBe('new query')
  view.clear.click()
  view.input.value = 'history query'
  view.controls.reset()
  view.undo.click()
  expect(view.input.value).toBe('history query')
})

test('settled counts suppress intermediate announcements and can be cancelled', () => {
  vi.useFakeTimers()
  const view = fixture()
  const status = view.document.querySelector('p')!
  const count = settledAnnouncement(status)
  count.update('10')
  vi.advanceTimersByTime(100)
  count.update('2')
  vi.advanceTimersByTime(199)
  expect(status.textContent).toBe('')
  vi.advanceTimersByTime(1)
  expect(status.textContent).toBe('2')
  count.update('0')
  count.cancel()
  vi.advanceTimersByTime(200)
  expect(status.textContent).toBe('2')
})
