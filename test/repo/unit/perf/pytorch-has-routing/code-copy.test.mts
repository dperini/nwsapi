import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { attachCodeCopy } from '../../../../../docs/repo/perf/pytorch-has-routing/code-copy.mts'

const windows: JSDOM[] = []
afterEach(() => {
  windows.splice(0).forEach(dom => dom.window.close())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fixture() {
  const dom = new JSDOM('<pre><code>const answer = 42</code></pre>')
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

function clipboardWith(promise: Promise<void>) {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn(() => promise) },
  })
}

test('copy locks repeated activation and keeps success status after the visual check resets', async () => {
  vi.useFakeTimers()
  let complete!: () => void
  clipboardWith(
    new Promise<void>(resolve => {
      complete = resolve
    }),
  )
  const view = fixture()

  view.button.click()
  view.button.click()
  expect(navigator.clipboard.writeText).toHaveBeenCalledOnce()
  expect(view.button.disabled).toBe(true)

  complete()
  await vi.waitFor(() => expect(view.status.textContent).toBe('Copied'))
  expect(view.button.getAttribute('aria-label')).toBe('Code copied')
  await vi.advanceTimersByTimeAsync(400)
  expect(view.button.getAttribute('aria-label')).toBe('Copy code')
  expect(view.toolbar.dataset['copyState']).toBeUndefined()
  expect(view.status.textContent).toBe('Copied')
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
