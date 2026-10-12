import { JSDOM } from 'jsdom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  initializeContentsSelection,
  selectedContentsIndex,
} from '../../../../../docs/repo/perf/pytorch-has-routing/contents-selection.mts'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const dom = new JSDOM('<nav><a href="#first">First</a></nav>', {
    url: 'https://guide.example/',
  })
  const { document } = dom.window
  const navigation = document.querySelector<HTMLElement>('nav')!
  const link = navigation.querySelector<HTMLAnchorElement>('a')!
  vi.stubGlobal('document', document)
  vi.stubGlobal('location', dom.window.location)
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('Element', dom.window.Element)
  vi.stubGlobal('Event', dom.window.Event)
  initializeContentsSelection(navigation)
  return { dom, document, navigation, link, links: [link] }
}

test('modified contents activations do not change the current location marker', () => {
  const view = fixture()
  for (const init of [
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { button: 1 },
  ]) {
    view.navigation.dispatchEvent(
      new view.dom.window.MouseEvent('click', {
        bubbles: true,
        ...init,
      }),
    )
    expect(selectedContentsIndex(view.links)).toBeUndefined()
  }
  view.link.target = '_blank'
  view.link.click()
  expect(selectedContentsIndex(view.links)).toBeUndefined()
  view.dom.window.close()
})

test('unmodified contents activation still selects the current location', () => {
  const view = fixture()
  view.link.click()
  expect(selectedContentsIndex(view.links)).toBe(0)
  view.dom.window.close()
})

test('a prevented contents activation does not change the current marker', () => {
  const view = fixture()
  view.navigation.addEventListener('click', event => event.preventDefault(), {
    capture: true,
  })
  view.link.click()
  expect(selectedContentsIndex(view.links)).toBeUndefined()
  view.dom.window.close()
})
