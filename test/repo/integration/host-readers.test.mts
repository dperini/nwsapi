import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import Adapter from '../../../dist/dom-selector.js'

const require = createRequire(import.meta.url)
const idlUtils = require('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper(node: Node): object
  wrapperForImpl(node: unknown): Node
}
const {
  domSymbolTree,
} = require('jsdom/lib/jsdom/living/helpers/internal-constants.js')

for (const contentType of ['text/html', 'application/xml']) {
  test(`supplied host helpers preserve duplicate IDs in ${contentType}`, t => {
    const { window } = new JSDOM(
      '<main><section><i id="same"></i><b id="same"></b></section><i id="same"></i></main>',
      { contentType },
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
      idlUtils,
      domSymbolTree,
    })
    assert.equal(adapter.engine.configure()['IDS_DUPES'], true)
    const root = doc.querySelector('main')!
    const section = root.firstElementChild!
    const first = section.firstElementChild!
    const second = section.lastElementChild!
    const third = root.lastElementChild!
    const check = (
      context: Document | Element | DocumentFragment,
      expected: Element[],
    ) => {
      const impl = idlUtils.implForWrapper(context)
      assert.deepEqual(
        Array.from(adapter.querySelectorAll('#same', impl)),
        expected,
      )
      assert.equal(adapter.querySelector('#same', impl), expected[0] || null)
    }
    check(doc, [first, second, third])
    check(section, [first, second])
    section.prepend(second)
    check(doc, [second, first, third])
    first.id = 'other'
    check(doc, [second, third])
    second.remove()
    check(doc, [third])
    first.id = 'same'
    check(doc, [first, third])
    const fragment = doc.createDocumentFragment()
    fragment.appendChild(root)
    check(doc, [])
    check(fragment, [first, third])
    check(section, [first])
  })

  test(`host readers preserve attributes and traversal in ${contentType}`, t => {
    const { window } = new JSDOM(
      '<main><section><i data-hit="a"></i>text<!--gap--><i data-hit="b"></i><b><i data-hit="c"></i></b></section></main>',
      { contentType },
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const root = doc.querySelector('main')!
    const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
      idlUtils,
      domSymbolTree,
    })
    const queries = [
      '[data-hit]',
      '[data-hit="a"]',
      '[data-hit=""]',
      '[data-hit^="b"]',
      'section > i',
      'i + i',
      'i ~ b',
      'main i',
      'section:has(> i)',
      'section:has(> b)',
      'i:has(+ b)',
      'i:has(~ b)',
      'b:has(+ i)',
      'i:nth-child(2)',
    ]
    const check = (context: Document | Element | DocumentFragment) => {
      const impl = idlUtils.implForWrapper(context)
      for (const selector of queries) {
        const expected = Array.from(context.querySelectorAll(selector))
        assert.deepEqual(
          Array.from(adapter.querySelectorAll(selector, impl)),
          expected,
        )
        assert.equal(adapter.querySelector(selector, impl), expected[0] || null)
      }
      for (const node of context.querySelectorAll('*')) {
        for (const selector of queries) {
          assert.equal(
            adapter.matches(selector, idlUtils.implForWrapper(node)),
            node.matches(selector),
          )
          assert.equal(
            adapter.closest(selector, idlUtils.implForWrapper(node)),
            node.closest(selector),
          )
        }
      }
    }
    check(doc)
    const target = root.querySelector('i')!
    target.setAttribute('data-hit', '')
    check(root)
    target.removeAttribute('data-hit')
    root.querySelector('section')!.appendChild(target)
    check(doc)
    const fragment = doc.createDocumentFragment()
    fragment.appendChild(root)
    check(fragment)
    const other = doc.implementation.createDocument(null, 'other')
    other.adoptNode(root)
    other.documentElement.appendChild(root)
    check(other)
    target.setAttributeNS('urn:test', 'x:hit', 'yes')
    assert.deepEqual(
      Array.from(
        adapter.querySelectorAll(
          '[*|hit="yes"]',
          idlUtils.implForWrapper(other),
        ),
      ),
      [target],
    )
  })
}

test('injected getters bypass overridden public access and support missing tree utilities', t => {
  const { window } = new JSDOM('<main><i data-hit="yes"></i></main>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const node = doc.querySelector('i')!
  const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
    idlUtils,
  })
  // Initialize capabilities before replacing accessors on the subject.
  adapter.querySelectorAll('[data-hit]', idlUtils.implForWrapper(doc))
  node.getAttribute = node.hasAttribute = () => {
    throw new Error('Public accessor called')
  }
  for (const selector of [
    '[data-hit]',
    '[data-hit="yes"]',
    '[data-hit^="y"]',
  ]) {
    assert.deepEqual(
      Array.from(
        adapter.querySelectorAll(selector, idlUtils.implForWrapper(doc)),
      ),
      [node],
    )
    assert.equal(adapter.matches(selector, idlUtils.implForWrapper(node)), true)
  }
})

test('incompatible tree capabilities fall back to public traversal', t => {
  const { window } = new JSDOM('<main><i></i>text<b></b></main>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
    idlUtils,
    domSymbolTree: {
      parent: () => null,
      nextSibling: () => null,
      previousSibling: () => null,
    },
  })
  assert.deepEqual(
    Array.from(
      adapter.querySelectorAll('main > i + b', idlUtils.implForWrapper(doc)),
    ),
    [doc.querySelector('b')],
  )
})

test('reader fallbacks preserve nodes the supplied utilities cannot unwrap', t => {
  const { window } = new JSDOM(
    '<main><i data-hit="yes"></i>text<!--gap--><b data-hit="yes"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  let allow = true
  const utilities = {
    ...idlUtils,
    implForWrapper: (node: Node) =>
      allow ? idlUtils.implForWrapper(node) : undefined,
  }
  const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
    idlUtils: utilities,
    domSymbolTree,
  })
  adapter.querySelectorAll('main', idlUtils.implForWrapper(doc))
  allow = false
  for (const selector of [
    'main > i[data-hit]',
    'i + b[data-hit="yes"]',
    'i:has(+ b)',
    'main:has(> b)',
  ]) {
    assert.deepEqual(
      Array.from(
        adapter.querySelectorAll(selector, idlUtils.implForWrapper(doc)),
      ),
      Array.from(doc.querySelectorAll(selector)),
    )
  }
})

test('incomplete or incompatible implementation getters keep the public route', t => {
  const windows: Array<InstanceType<typeof JSDOM>['window']> = []
  t.onTestFinished(() => windows.forEach(window => window.close()))
  for (const kind of ['missing', 'incorrect-empty']) {
    const { window } = new JSDOM('<main><i data-hit="yes"></i></main>')
    windows.push(window)
    const doc = window.document
    const utilities = {
      ...idlUtils,
      implForWrapper(node: Node) {
        if (kind === 'missing') {
          return undefined
        }
        const impl = idlUtils.implForWrapper(node)
        return new Proxy(impl, {
          get(target, key) {
            return key === 'getAttribute'
              ? () => null
              : Reflect.get(target, key, target)
          },
        })
      },
    }
    const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
      idlUtils: utilities,
      domSymbolTree,
    })
    assert.deepEqual(
      Array.from(
        adapter.querySelectorAll(
          '[data-hit="yes"]',
          idlUtils.implForWrapper(doc),
        ),
      ),
      [doc.querySelector('i')],
    )
  }
})

test('tree readers respect shadow boundaries and callback mutations', t => {
  const { window } = new JSDOM('<main><i></i><i></i></main>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const main = doc.querySelector('main')!
  const shadow = main.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<section><i data-hit="yes"></i>text<b></b></section>'
  const adapter = new Adapter(window, idlUtils.implForWrapper(doc), {
    idlUtils,
    domSymbolTree,
  })
  assert.deepEqual(
    Array.from(
      adapter.querySelectorAll(
        'section > i + b',
        idlUtils.implForWrapper(shadow),
      ),
    ),
    [shadow.querySelector('b')],
  )
  assert.equal(
    adapter.closest(
      'main',
      idlUtils.implForWrapper(shadow.querySelector('i')!),
    ),
    null,
  )
  const calls: Element[] = []
  adapter.engine.select('main > i', doc, node => {
    calls.push(node)
    node.setAttribute('data-hit', 'yes')
    assert.equal(
      adapter.matches('[data-hit="yes"]', idlUtils.implForWrapper(node)),
      true,
    )
  })
  assert.equal(calls.length, 2)
})

test('host readers require literal null attributes for ID and class matching', t => {
  const { window } = new JSDOM('<main><span></span></main>')
  t.onTestFinished(() => window.close())
  const parent = window.document.querySelector('main')!
  const child = parent.firstElementChild!
  const adapter = new Adapter(
    window,
    idlUtils.implForWrapper(window.document),
    {
      idlUtils,
      domSymbolTree,
    },
  )
  const subject = idlUtils.implForWrapper(child)
  for (const [selector, attribute] of [
    ['#null', 'id'],
    ['.null', 'class'],
  ]) {
    for (const value of [null, '', 'null', null]) {
      if (value === null) {
        child.removeAttribute(attribute!)
      } else {
        child.setAttribute(attribute!, value)
      }
      assert.equal(adapter.matches(selector!, subject), value === 'null')
      assert.equal(
        adapter.closest(selector!, subject),
        value === 'null' ? child : null,
      )
    }
    parent.setAttribute(attribute!, 'null')
    assert.equal(adapter.closest(selector!, subject), parent)
    parent.removeAttribute(attribute!)
    assert.equal(adapter.closest(selector!, subject), null)
  }
})
