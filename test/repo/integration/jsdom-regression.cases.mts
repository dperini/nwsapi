import assert from 'node:assert/strict'
import { test } from 'vitest'
import { jsdomSelectorCases } from '../common/fixture/jsdom-selector.mts'
import { DOMSelector, host } from './fixture/jsdom.mts'

test('shared adapter instances observe resolver clearing and synchronous DOM mutations', t => {
  const window = host(t)
  const a = new DOMSelector(window)
  const b = new DOMSelector(window)
  const document = window.document
  const first = document.getElementById('one')!
  const second = document.getElementById('two')!
  assert.equal(a.querySelector('.item', document)!, first)
  const snapshot = a.querySelectorAll('.item', document)
  first.className = ''
  second.remove()
  const replacement = document.createElement('div')
  replacement.className = 'item'
  document.body.append(replacement)
  b.clear(true)
  assert.equal(a.querySelector('.item', document)!, replacement)
  assert.deepEqual(Array.from(b.querySelectorAll('.item', document)), [
    replacement,
  ])
  assert.deepEqual(Array.from(snapshot), [first, second])
})

for (const [issue, html, selector, expected] of jsdomSelectorCases) {
  test(`jsdom#${issue}: public DOM selector integration`, t => {
    const window = host(t, html)
    for (let pass = 0; pass < 2; pass++) {
      const document = window.document
      assert.deepEqual(
        Array.from(
          document.querySelectorAll(selector),
          (node: Element) => node.id,
        ),
        expected,
      )
      assert.equal(document.querySelector(selector)?.id, expected[0])
      assert.equal(
        document.getElementById(expected[0])!.matches(selector),
        true,
      )
    }
  })
}

test('jsdom#3792: nested relational stylesheet selectors affect computed style', t => {
  const window = host(
    t,
    '<style>tr.svelte:has(input:where(.svelte):checked) td:where(.svelte) { color: rgb(1, 2, 3) }</style><table><tr class="svelte"><td class="svelte"><input class="svelte" type="checkbox" checked></td></tr></table>',
  )
  const cell = window.document.querySelector('td')!
  const input = window.document.querySelector('input')!
  assert.equal(window.getComputedStyle(cell).color, 'rgb(1, 2, 3)')
  input.removeAttribute('checked')
  assert.notEqual(window.getComputedStyle(cell).color, 'rgb(1, 2, 3)')
  input.setAttribute('checked', '')
  assert.equal(window.getComputedStyle(cell).color, 'rgb(1, 2, 3)')
})

test('public DOM APIs preserve scope, XML, shadow, null, and identifier regressions', t => {
  const window = host(
    t,
    '<div class="sm:block"><span></span></div><button id="react-aria-:r6:"><svg><g></g></svg></button>',
  )
  const document = window.document
  const div = document.querySelector('div')!
  const button = document.querySelector('button')!
  const svg = document.querySelector('svg')!
  assert.equal(div.querySelector(':scope > span')!, div.firstElementChild!)
  assert.equal(button.querySelector(':scope svg')!, svg)
  assert.equal(svg.querySelector(':scope g')!, svg.firstElementChild!)
  assert.equal(div.closest('#null'), null)
  assert.equal(div.closest('.null'), null)
  assert.equal(div.matches(':active'), false)
  for (const selector of ['#-123', '.-123', 'button#react-aria-:r6: svg']) {
    assert.throws(() => document.querySelector(selector)!, {
      name: 'SyntaxError',
    })
  }
  assert.equal(document.querySelector('button#react-aria-\\:r6\\: svg')!, svg)
  const shadow = div.attachShadow({ mode: 'open' })
  const article = document.createElement('article')
  shadow.append(article)
  assert.equal(shadow.querySelector(':host > article')!, article)
  const parse = (text: string) =>
    new window.DOMParser().parseFromString(text, 'text/xml')
  const namespaced = parse('<cp:coreProperties xmlns:cp="urn:properties"/>')
  assert.equal(
    namespaced.querySelector('coreProperties')!,
    namespaced.documentElement,
  )
  const numeric = parse('<a id="9a"><b/></a>')
  assert.equal(
    numeric.documentElement.querySelector(':scope>b')!,
    numeric.documentElement.firstElementChild!,
  )
  const tree = parse(
    '<bar><bar id="theBar"><child-bars/></bar><child-bars/></bar>',
  )
  const child = tree.getElementById('theBar')!
  const destination = child.parentElement!.querySelector(':scope > child-bars')!
  assert.equal(destination, tree.documentElement.lastElementChild)
  destination.appendChild(child)
  assert.equal(child.parentElement, destination)
})

test('the drop-in distinguishes modal state from ARIA and open body portals', t => {
  const window = host(t, '<button id="trigger">Open</button>')
  const doc = window.document
  const dialog = doc.createElement('dialog')
  dialog.setAttribute('aria-modal', 'true')
  Object.defineProperty(dialog, 'modal', { value: true })
  doc
    .getElementById('trigger')!
    .addEventListener('click', () => doc.body.appendChild(dialog))
  doc.getElementById('trigger')!.click()
  for (let index = 0; index < 2; index += 1) {
    dialog.open = index % 2 === 0
    assert.deepEqual(
      Array.from(doc.querySelectorAll('dialog:open')),
      dialog.open ? [dialog] : [],
    )
    assert.deepEqual(Array.from(doc.querySelectorAll(':modal')), [])
    assert.equal(dialog.matches(':modal'), false)
    assert.equal(doc.querySelector('[aria-modal="true"]')!, dialog)
  }
  dialog.remove()
  assert.equal(dialog.matches(':modal'), false)
})
