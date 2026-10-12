import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  beginReaderRetry,
  focusReaderRetryResult,
  readerRetryOwnsFocus,
} from '../../../../../docs/repo/perf/pytorch-has-routing/reading-retry.mts'

test('reader retry remains focused and ignores repeat activation while in flight', () => {
  const dom = new JSDOM('<article><button>Retry document</button></article>')
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const retry = article.querySelector<HTMLButtonElement>('button')!
  retry.focus()

  expect(beginReaderRetry(retry, 'Opening document…')).toBe(true)
  expect(retry.disabled).toBe(false)
  expect(retry.getAttribute('aria-disabled')).toBe('true')
  expect(retry.textContent).toBe('Opening document…')
  expect(article.ownerDocument.activeElement).toBe(retry)
  expect(beginReaderRetry(retry, 'Opening document…')).toBe(false)
  dom.window.close()
})

test('reader retry transfers focus only when the retry button still owns it', () => {
  const dom = new JSDOM(
    '<article><button>Retry</button><h1>Document title</h1><button>Browse</button></article>',
  )
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const [retry, browse] = article.querySelectorAll<HTMLButtonElement>('button')
  const heading = article.querySelector<HTMLElement>('h1')!
  retry!.focus()
  expect(readerRetryOwnsFocus(article, retry)).toBe(true)
  focusReaderRetryResult(true, heading, true)
  expect(heading.tabIndex).toBe(-1)
  expect(article.ownerDocument.activeElement).toBe(heading)

  browse!.focus()
  expect(readerRetryOwnsFocus(article, retry)).toBe(false)
  focusReaderRetryResult(false, retry!)
  expect(article.ownerDocument.activeElement).toBe(browse)
  dom.window.close()
})

test('a repeated retry failure can focus its replacement control', () => {
  const dom = new JSDOM(
    '<article><button data-reader-retry>Retry</button></article>',
  )
  const article = dom.window.document.querySelector<HTMLElement>('article')!
  const oldRetry = article.querySelector<HTMLButtonElement>('button')!
  oldRetry.focus()
  const ownedFocus = readerRetryOwnsFocus(article, oldRetry)
  const nextRetry = dom.window.document.createElement('button')
  nextRetry.textContent = 'Retry document'
  article.replaceChildren(nextRetry)
  focusReaderRetryResult(ownedFocus, nextRetry)
  expect(dom.window.document.activeElement).toBe(nextRetry)
  dom.window.close()
})
