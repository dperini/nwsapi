import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('first class candidates handle token boundaries, late hits, and synchronous mutations', async t => {
  const { window } = new JSDOM(
    '<!doctype html><main><i class="x-card card-x card\u00a0x"></i><b class="card\tprimary\nother\fend\rtail" id="first"></b><b class="card" id="second"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const root = doc.querySelector('main')!
  const nw = factory(window)
  const verify = (selector: string) =>
    expect(nw.first(selector, root), selector).toBe(
      root.querySelector(selector),
    )
  for (const selector of [
    '.card',
    '.primary',
    '.other',
    '.end',
    '.tail',
    'b.card',
    'i.card',
    '.absent',
  ] as const) {
    verify(selector)
    verify(selector)
  }
  root.firstElementChild!.setAttribute('class', 'card')
  verify('.card')
  root.firstElementChild!.remove()
  verify('.card')
  root.prepend(doc.getElementById('second')!)
  verify('.card')
  root.firstElementChild!.className = ''
  await Promise.resolve()
  verify('.card')
  root.innerHTML = '<i></i>'.repeat(40) + '<b class="card" id="late"></b>'
  verify('.card')
  verify('main > b.card')
  root.innerHTML =
    '<section><b class="card"></b></section><b class="card" id="direct"></b>'
  verify('main > b.card')
  verify('.card, section')
  root.innerHTML = '<input class="card"><input class="card">'
  const inputs = root.getElementsByTagName('input')
  inputs[1]!.checked = true
  verify('.card:checked')
  inputs[0]!.checked = true
  verify('.card:checked')
  inputs[0]!.checked = false
  verify('.card:checked')
  root.remove()
  verify('.card')
})

test('first class candidates remain correct after adoption and SVG class changes', t => {
  const html = new JSDOM(
    '<!doctype html><main><svg><g class="card" id="svg"></g></svg></main>',
  )
  const xml = new JSDOM('<root/>', { contentType: 'application/xml' })
  t.onTestFinished(() => {
    html.window.close()
    xml.window.close()
  })
  const nw = factory(html.window)
  const root = html.window.document.querySelector('main')!
  expect(nw.first('g.card', root)?.id).toBe('svg')
  root.querySelector('g')!.setAttribute('class', 'other')
  expect(nw.first('g.card', root)).toBeNull()
  root.querySelector('g')!.setAttribute('class', 'card')
  expect(nw.first('g.card', root)?.id).toBe('svg')
  xml.window.document.documentElement.append(
    xml.window.document.adoptNode(root),
  )
  expect(nw.first('g.card', root)?.id).toBe('svg')
  root.querySelector('g')!.setAttribute('class', 'other')
  expect(nw.first('g.card', root)).toBeNull()
  root.querySelector('g')!.setAttribute('class', 'card')
  expect(nw.first('g.card', root)?.id).toBe('svg')
})

test('cached class candidates use the current document case rules after adoption', t => {
  const standards = new JSDOM(
    '<!doctype html><main><p class="card" id="lower"></p><p class="Card" id="upper"></p></main>',
  )
  const quirks = new JSDOM('<body></body>')
  const xml = new JSDOM('<root/>', { contentType: 'application/xml' })
  t.onTestFinished(() => {
    standards.window.close()
    quirks.window.close()
    xml.window.close()
  })
  const nw = factory(standards.window)
  const root = standards.window.document.querySelector('main')!
  expect(nw.first('.Card', root)?.id).toBe('upper')
  expect(nw.first('.Card:not(.absent)', root)?.id).toBe('upper')
  quirks.window.document.body.append(quirks.window.document.adoptNode(root))
  expect(nw.first('.Card', root)?.id).toBe('lower')
  expect(nw.first('.Card:not(.absent)', root)?.id).toBe('lower')
  xml.window.document.documentElement.append(
    xml.window.document.adoptNode(root),
  )
  expect(nw.first('.Card:not(.absent)', root)?.id).toBe('upper')
  expect(nw.first('.Card', root)?.id).toBe('upper')
  root.lastElementChild!.setAttribute('class', 'other')
  expect(nw.first('.Card', root)).toBeNull()
  expect(nw.first('.card', root)?.id).toBe('lower')
})
