import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { initializeReadingContents } from '../../../../../docs/repo/perf/pytorch-has-routing/reading-navigation.mts'

beforeEach(() => vi.useFakeTimers())

afterEach(async () => {
  await vi.runAllTimersAsync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createReader() {
  const dom = new JSDOM(
    '<header><button data-reader-contents-toggle aria-expanded="false"></button></header><main><article id="reading-content"><h2 id="target">Target</h2></article><aside><details id="reading-navigation"><summary><span></span></summary><button data-reading-contents-close></button><nav><ol id="reading-contents"><li><a href="#target">Target</a></li></ol></nav></details></aside></main>',
    { url: 'https://docs.example/reader' },
  )
  const media = new Map<
    string,
    { matches: boolean; listeners: Array<() => void> }
  >([
    ['(max-width: 600px)', { matches: true, listeners: [] }],
    ['(max-width: 1200px)', { matches: true, listeners: [] }],
  ])
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('location', dom.window.location)
  vi.stubGlobal('localStorage', dom.window.localStorage)
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver)
  vi.stubGlobal('Element', dom.window.Element)
  vi.stubGlobal('Event', dom.window.Event)
  vi.stubGlobal('matchMedia', (query: string) => {
    const state = media.get(query)!
    return {
      get matches() {
        return state.matches
      },
      addEventListener(_type: string, listener: () => void) {
        state.listeners.push(listener)
      },
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
  dom.window.document.querySelector('h2')!.scrollIntoView = vi.fn()
  initializeReadingContents()
  return { dom, media }
}

test('header open focuses the mobile close and explicit close returns focus', () => {
  const { dom } = createReader()
  const { document } = dom.window
  const toggle = document.querySelector<HTMLButtonElement>(
    '[data-reader-contents-toggle]',
  )!
  const close = document.querySelector<HTMLButtonElement>(
    '[data-reading-contents-close]',
  )!
  const contents = document.querySelector<HTMLDetailsElement>(
    '#reading-navigation',
  )!

  toggle.click()

  expect(contents.open).toBe(true)
  expect(document.activeElement).toBe(close)
  close.click()
  expect(contents.open).toBe(false)
  expect(document.activeElement).toBe(toggle)
  dom.window.close()
})

test('Escape closes mobile contents and returns focus to the header toggle', () => {
  const { dom } = createReader()
  const { document } = dom.window
  const toggle = document.querySelector<HTMLButtonElement>(
    '[data-reader-contents-toggle]',
  )!
  toggle.click()

  document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape' }),
  )

  expect(
    document.querySelector('#reading-navigation')?.hasAttribute('open'),
  ).toBe(false)
  expect(document.activeElement).toBe(toggle)
  dom.window.close()
})

test('section activation closes contents and focuses its heading', () => {
  const { dom } = createReader()
  const { document } = dom.window
  document
    .querySelector<HTMLButtonElement>('[data-reader-contents-toggle]')!
    .click()
  document
    .querySelector<HTMLAnchorElement>('#reading-contents a')!
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  expect(
    document.querySelector('#reading-navigation')?.hasAttribute('open'),
  ).toBe(false)
  expect(document.activeElement).toBe(document.querySelector('#target'))
  dom.window.close()
})

test('modified section activation keeps the contents view open', () => {
  const { dom } = createReader()
  const { document } = dom.window
  document
    .querySelector<HTMLButtonElement>('[data-reader-contents-toggle]')!
    .click()
  document
    .querySelector<HTMLAnchorElement>('#reading-contents a')!
    .dispatchEvent(
      new dom.window.MouseEvent('click', {
        bubbles: true,
        ctrlKey: true,
      }),
    )

  expect(
    document.querySelector('#reading-navigation')?.hasAttribute('open'),
  ).toBe(true)
  dom.window.close()
})

test('resizing past the replacement view moves focus out of its close control', () => {
  const { dom, media } = createReader()
  const { document } = dom.window
  const close = document.querySelector<HTMLButtonElement>(
    '[data-reading-contents-close]',
  )!
  document
    .querySelector<HTMLButtonElement>('[data-reader-contents-toggle]')!
    .click()
  expect(document.activeElement).toBe(close)

  const replacement = media.get('(max-width: 600px)')!
  replacement.matches = false
  for (const listener of replacement.listeners) {
    listener()
  }

  expect(document.activeElement).toBe(
    document.querySelector('#reading-navigation summary'),
  )
  expect(
    document.querySelector('#reading-navigation')?.hasAttribute('open'),
  ).toBe(true)
  dom.window.close()
})
