import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'
const dom = (html: string) => new JSDOM(html, { url: 'https://example.test/' })

test('selective child chains preserve nested anchor order and live results', t => {
  const { window } = dom(`<!doctype html>
    <section class="anchor" id="outer"><div>
      <section class="anchor" id="inner"><div><span id="first"></span></div></section>
      <span id="second"></span></div><div><span id="third"></span></div></section>`)
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  const selectors = [
    '.anchor > div > span',
    'section.anchor>div>span',
    '.anchor\t>\ndiv > span',
  ]
  const check = () => {
    for (const selector of selectors) {
      expect(nw.select(selector, doc), selector).toEqual(
        [...doc.querySelectorAll(selector)].toSorted((a, b) =>
          a.compareDocumentPosition(b) & 4 ? -1 : 1,
        ),
      )
    }
  }
  check()
  expect(nw.select(selectors[0]).map(e => e.id)).toEqual([
    'first',
    'second',
    'third',
  ])
  doc.getElementById('inner')!.className = 'gone'
  check()
  doc.getElementById('outer')!.append(doc.getElementById('inner')!)
  check()
  doc.getElementById('inner')!.className = 'anchor'
  check()
  doc.getElementById('outer')!.remove()
  check()
})

test('child chains keep scoped, callback, first, legacy, and list behavior', t => {
  const { window } = dom(
    '<!doctype html><section class="anchor"><div><span id="a"></span></div><div><span id="b"></span></div></section>',
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  const selector = '.anchor > div > span'
  const expected = [...doc.querySelectorAll(selector)]
  expect(nw.first(selector, doc)).toBe(expected[0])
  const seen: Element[] = []
  expect(
    nw.select(selector, doc, e => {
      seen.push(e)
    }),
  ).toEqual(expected)
  expect(seen).toEqual(expected)
  expect(nw.select(selector, doc.querySelector('div'))).toEqual([expected[0]])
  for (const legacy of [true, false]) {
    nw.configure({ LEGACY: legacy })
    expect(nw.select(selector, doc)).toEqual(expected)
  }
  nw.configure({ NODE_LIST: true })
  expect(Array.from(nw.select(selector, doc))).toEqual(expected)
  const fragment = doc.createDocumentFragment()
  fragment.append(doc.querySelector('section')!)
  expect(Array.from(nw.select(selector, fragment))).toEqual(expected)
})

test('child chains handle wide anchors, tag case, SVG, quirks, and invalid syntax', t => {
  for (const doctype of ['<!doctype html>', '']) {
    const { window } = dom(
      doctype +
        '<main>' +
        '<section class="anchor"><div><span></span></div></section>'.repeat(
          150,
        ) +
        '<section class="ANCHOR"><div><span></span></div></section>' +
        '<svg class="anchor"><g><path></path></g></svg></main>',
    )
    t.onTestFinished(() => window.close())
    const nw = factory(window)
    const doc = window.document
    for (const selector of [
      '.anchor > div > span',
      '.anchor > g > path',
      '.missing > div',
    ]) {
      expect(nw.select(selector, doc), selector).toEqual(
        [...doc.querySelectorAll(selector)].toSorted((a, b) =>
          a.compareDocumentPosition(b) & 4 ? -1 : 1,
        ),
      )
    }
    for (const selector of [
      '.anchor >> div',
      '.anchor >',
      '.anchor > div > :unknown',
    ]) {
      expect(() => nw.select(selector, doc), selector).toThrow()
    }
    doc.querySelector('main')!.innerHTML =
      '<section class="anchor"><div><span></span></div></section>'
    expect(nw.select('.anchor > div > span', doc)).toEqual([
      ...doc.querySelectorAll('span'),
    ])
  }
})

test('simple logical compounds preserve matching, forgiving lists, and mutations', t => {
  const { window } = dom(
    '<!doctype html><div class="card"><button class="primary" id="ok"></button><input></div>',
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  for (const legacy of [false, true]) {
    for (const forgiving of [false, true]) {
      nw.configure({ LEGACY: legacy, FORGIVING: forgiving })
      for (const selector of [
        ':where(.card) > button',
        ':is(button.primary#ok)',
        ':not(:is(.primary))',
        ':is(.card):has(> button)',
        ':where(.card) > :is(button.primary)',
      ]) {
        const expected = [...doc.querySelectorAll(selector)]
        expect(nw.select(selector, doc), selector).toEqual(expected)
        for (const element of doc.querySelectorAll('*')) {
          expect(nw.match(selector, element), selector).toBe(
            expected.includes(element),
          )
        }
      }
    }
  }
  nw.configure({ FORGIVING: true, LEGACY: false })
  expect(nw.select(':is(.primary, :unknown)', doc)).toEqual([
    doc.querySelector('button'),
  ])
  doc.querySelector('button')!.className = 'changed'
  expect(nw.select(':is(button.primary#ok)', doc)).toEqual([])
})

test('logical type candidates retain order, uniqueness, scopes, and callbacks', t => {
  const { window } = dom(
    '<!doctype html><div class="card"><input id="a"><button id="b"></button><input id="c"><span></span></div><button id="d"></button>',
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const selector of [
      ':is(button,input)',
      ':where(input,button,input)',
      '.card > :is(button,input)',
      ':is(button,input), input',
    ]) {
      for (const context of [doc, doc.querySelector('.card')!]) {
        const expected = [...context.querySelectorAll(selector)]
        expect(nw.select(selector, context), selector).toEqual(expected)
        const seen: Element[] = []
        expect(
          nw.select(selector, context, e => {
            seen.push(e)
          }),
        ).toEqual(expected)
        expect(seen).toEqual(expected)
        expect(nw.first(selector, context)).toBe(expected[0])
      }
    }
  }
  const fragment = doc.createDocumentFragment()
  fragment.append(doc.getElementById('d')!, doc.getElementById('a')!)
  nw.configure({ LEGACY: false })
  expect(nw.select(':is(button,input)', fragment).map(e => e.id)).toEqual([
    'd',
    'a',
  ])
  expect(nw.select(':is(button,input)', doc).map(e => e.id)).toEqual(['b', 'c'])
  doc.querySelector('.card')!.prepend(doc.getElementById('c')!)
  expect(nw.select(':is(button,input)', doc).map(e => e.id)).toEqual(['c', 'b'])
})

test('logical routing samples density without caching answers', t => {
  const { window } = dom('<!doctype html><main></main>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  const main = doc.querySelector('main')!
  for (const html of [
    '<div></div><span></span>'.repeat(100),
    '<i></i>'.repeat(300) + '<div></div><span></span>',
    '<div></div><span></span>'.repeat(100),
  ]) {
    main.innerHTML = html
    const expected = [...main.querySelectorAll('div, span')]
    for (let i = 0; i < 70; ++i) {
      expect(nw.select(':is(div,span)', doc)).toEqual(expected)
    }
    expect(nw.select(':is(div,span)', main)).toEqual(expected)
  }
})
