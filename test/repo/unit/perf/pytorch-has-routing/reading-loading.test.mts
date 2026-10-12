import { JSDOM } from 'jsdom'
import { afterEach, expect, test, vi } from 'vitest'
import { showLoadingAfterDelay } from '../../../../../docs/repo/perf/pytorch-has-routing/reading-loading.mts'

afterEach(() => vi.useRealTimers())

test('reader shows a stationary loading status after the delay and clears it on completion', () => {
  vi.useFakeTimers()
  const dom = new JSDOM('<article aria-busy="true"></article>')
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const cancel = showLoadingAfterDelay(article, () => true)
  vi.advanceTimersByTime(249)
  expect(article.hasAttribute('data-loading-visible')).toBe(false)
  vi.advanceTimersByTime(1)
  expect(article.hasAttribute('data-loading-visible')).toBe(true)
  cancel()
  expect(article.hasAttribute('data-loading-visible')).toBe(false)
  dom.window.close()
})

test('fast success or error cancels the delayed loading status', () => {
  vi.useFakeTimers()
  const dom = new JSDOM('<article aria-busy="true"></article>')
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const cancel = showLoadingAfterDelay(article, () => true)
  article.removeAttribute('aria-busy')
  cancel()
  vi.advanceTimersByTime(250)
  expect(article.hasAttribute('data-loading-visible')).toBe(false)
  dom.window.close()
})

test('stale reader requests cannot reveal the loading status', () => {
  vi.useFakeTimers()
  const dom = new JSDOM('<article aria-busy="true"></article>')
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const cancel = showLoadingAfterDelay(article, () => false)
  vi.advanceTimersByTime(250)
  expect(article.hasAttribute('data-loading-visible')).toBe(false)
  cancel()
  dom.window.close()
})
