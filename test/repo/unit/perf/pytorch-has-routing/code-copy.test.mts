import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { attachCodeCopy } from '../../../../../docs/repo/perf/pytorch-has-routing/code-copy.mts'

const windows: JSDOM[] = []
afterEach(() => {
  windows.splice(0).forEach(dom => dom.window.close())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function fixture() {
  const dom = new JSDOM('<pre><code>const answer = 42</code></pre>', {
    url: 'https://example.test',
  })
  windows.push(dom)
  vi.stubGlobal('document', dom.window.document)
  const code = dom.window.document.querySelector<HTMLElement>('code')!
  attachCodeCopy(code)
  const originalButton = dom.window.document.querySelector('.code-copy')
  attachCodeCopy(code)
  expect(dom.window.document.querySelectorAll('.code-copy')).toHaveLength(1)
  expect(dom.window.document.querySelector('.code-copy')).toBe(originalButton)
  const button =
    dom.window.document.querySelector<HTMLButtonElement>('.code-copy')!
  const status =
    dom.window.document.querySelector<HTMLElement>('[role="status"]')!
  return { dom, code, button, status, toolbar: button.parentElement! }
}

test('copy locks repeated activation and keeps success status after the visual check resets', async () => {
  vi.useFakeTimers()
  let complete!: () => void
  const writeText = vi.fn(
    () =>
      new Promise<void>(resolve => {
        complete = resolve
      }),
  )
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const view = fixture()

  view.button.focus()
  view.button.click()
  view.button.click()
  expect(writeText).toHaveBeenCalledOnce()
  expect(view.button.getAttribute('aria-disabled')).toBe('true')
  expect(view.dom.window.document.activeElement).toBe(view.button)

  complete()
  await vi.waitFor(() => expect(view.status.textContent).toBe('Copied'))
  expect(view.button.getAttribute('aria-label')).toBe('Code copied')
  await vi.advanceTimersByTimeAsync(400)
  expect(view.button.getAttribute('aria-label')).toBe('Copy code')
  expect(view.toolbar.dataset['copyState']).toBeUndefined()
  expect(view.status.textContent).toBe('Copied')
  expect(view.status.hidden).toBe(false)
  expect(view.status.dataset['copyOutcome']).toBe('copied')
})

test('copy failure stays available until retry and a successful retry restores the label', async () => {
  vi.useFakeTimers()
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValueOnce(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const view = fixture()

  view.button.click()
  await vi.waitFor(() =>
    expect(view.status.textContent).toBe(
      'Select the code to copy it manually.',
    ),
  )
  await vi.advanceTimersByTimeAsync(10_000)
  expect(view.status.textContent).toBe('Select the code to copy it manually.')

  view.button.click()
  expect(view.status.textContent).toBe('')
  await vi.waitFor(() => expect(view.status.textContent).toBe('Copied'))
  expect(writeText).toHaveBeenCalledTimes(2)
  expect(view.button.getAttribute('aria-label')).toBe('Code copied')
})

test('a retry before the visual reset cancels the stale reset', async () => {
  vi.useFakeTimers()
  let completeFirst!: () => void
  let completeSecond!: () => void
  const writeText = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          completeFirst = resolve
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          completeSecond = resolve
        }),
    )
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const view = fixture()

  view.button.click()
  completeFirst()
  await vi.waitFor(() => expect(view.status.textContent).toBe('Copied'))
  await vi.advanceTimersByTimeAsync(200)
  view.button.click()
  expect(view.button.getAttribute('aria-disabled')).toBe('true')
  await vi.advanceTimersByTimeAsync(200)
  expect(view.button.getAttribute('aria-label')).toBe('Copy code')
  expect(view.status.hidden).toBe(false)
  expect(view.status.textContent).toBe('')

  completeSecond()
  await vi.waitFor(() => expect(view.status.textContent).toBe('Copied'))
  expect(writeText).toHaveBeenCalledTimes(2)
  expect(view.button.getAttribute('aria-label')).toBe('Code copied')
})
