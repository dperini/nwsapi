import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

// Selector-layer reproductions linked by jsdom/jsdom#3854. Rendering and
// event-library selector construction remain responsibilities of their hosts.
const cases = [
  [3370, '<div class="case" id="hit"></div>', 'div[class=CasE I]', ['hit']],
  [
    3432,
    '<button id="hit">hi</button><input type="submit" id="input">',
    ':is(:is(button, input)[type=submit], button:not([type])):not([disabled])',
    ['hit', 'input'],
  ],
  [3544, '<ul><li id="hit"></li></ul>', 'UL > LI', ['hit']],
  [
    3603,
    '<fieldset disabled><input id="inside"></fieldset><input disabled id="outside"><input id="enabled">',
    'input:disabled',
    ['inside', 'outside'],
  ],
  [3612, '<div class="box" id="hit"></div>', 'DIV.box', ['hit']],
  [
    3686,
    '<div a id="hit"></div><b class="c"></b>',
    ':is([a],b):not(.c)',
    ['hit'],
  ],
  [3750, '<myElement id="hit"></myElement>', 'myElement', ['hit']],
  [
    3780,
    '<p id="hit"></p><x-undefined></x-undefined>',
    'body > :defined',
    ['hit'],
  ],
  [
    3792,
    '<table><tr class="svelte-1ob8zmv"><td class="svelte-1ob8zmv" id="hit"><input class="svelte-1ob8zmv" type="checkbox" checked></td></tr></table>',
    'tr.svelte-1ob8zmv:has(input:where(.svelte-1ob8zmv):checked) td:where(.svelte-1ob8zmv)',
    ['hit'],
  ],
] as const
for (const [issue, html, selector, expected] of cases) {
  test(`jsdom#${issue}: selector reproduction`, t => {
    const { window } = new JSDOM(html)
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    for (let pass = 0; pass < 2; pass += 1) {
      expect(
        Array.from(engine.select(selector, window.document), e => e.id),
      ).toEqual(expected)
      expect(engine.first(selector, window.document)?.id).toBe(expected[0])
      expect(
        engine.match(selector, window.document.getElementById(expected[0]!)!),
      ).toBe(true)
    }
  })
}

test('jsdom#2159, #3321, #3802: XML names and exact scope identity', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const parse = (xml: string) =>
    new window.DOMParser().parseFromString(xml, 'text/xml')
  const namespaced = parse(
    '<cp:coreProperties xmlns:cp="urn:properties" xmlns:dc="urn:metadata"><dc:title/></cp:coreProperties>',
  )
  expect(engine.first('coreProperties', namespaced)).toBe(
    namespaced.documentElement,
  )
  const numeric = parse('<a id="9a"><b/></a>')
  expect(engine.first(':scope>b', numeric.documentElement)).toBe(
    numeric.documentElement.firstElementChild,
  )
  const tree = parse(
    '<bar><bar id="theBar"><child-bars/></bar><child-bars/></bar>',
  )
  const child = tree.getElementById('theBar')!
  const destination = engine.first(':scope > child-bars', child.parentElement!)!
  expect(destination).toBe(tree.documentElement.lastElementChild)
  destination.appendChild(child)
  expect(child.parentElement).toBe(destination)
})

test('jsdom#3466, #3610, #3620: null attributes, active state, and invalid identifiers', t => {
  const { window } = new JSDOM('<div><p></p></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const p = window.document.querySelector('p')!
  expect(engine.closest('#null', p)).toBeNull()
  expect(engine.closest('.null', p)).toBeNull()
  expect(engine.match(':active', p)).toBe(false)
  for (const selector of ['#-123', '.-123']) {
    expect(() => engine.first(selector, window.document)).toThrow()
  }
})

test('jsdom#3469, #3692, #3818: scope avoids serializing classes and IDs', t => {
  const { window } = new JSDOM(
    '<div class="sm:block"><span></span></div><button id="react-aria-:r6:"><svg><g></g></svg></button>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const div = window.document.querySelector('div')!
  const button = window.document.querySelector('button')!
  const svg = window.document.querySelector('svg')!
  expect(engine.first(':scope > span', div)).toBe(div.firstElementChild)
  expect(engine.first(':scope svg', button)).toBe(svg)
  expect(engine.first(':scope g', svg)).toBe(svg.firstElementChild)
  expect(engine.first('button#react-aria-\\:r6\\: svg', window.document)).toBe(
    svg,
  )
  expect(() =>
    engine.first('button#react-aria-:r6: svg', window.document),
  ).toThrow()
})

test('jsdom#3618: host child query uses the shadow root', t => {
  const { window } = new JSDOM('<section></section>')
  t.onTestFinished(() => window.close())
  const host = window.document.querySelector('section')!
  const shadow = host.attachShadow({ mode: 'open' })
  const article = window.document.createElement('article')
  shadow.append(article)
  expect(factory(window).first(':host > article', shadow)).toBe(article)
})
