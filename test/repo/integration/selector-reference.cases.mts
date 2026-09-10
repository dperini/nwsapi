import { describe, expect, test } from 'vitest'
import { build } from './selector-fixture.mts'

describe('agreement with the reference engine', () => {
  // jsdom 30 resolves selectors with @asamuzakjp/dom-selector, so
  // querySelectorAll here is a second implementation rather than this one.
  // These are the shapes whose candidate list the optimizer had to be taught
  // to read; a wrong list changes the answer, not just the speed.
  const SELECTORS = [
    'div:not(:nth-of-type(2n))',
    'div:not(:nth-child(3))',
    'div:is(.a):not(:where(.b))',
    'div:not(:not(:not(span)))',
    'div:has(:is(.a .b))',
    'p:nth-child(3)',
    'p:nth-last-child(3)',
    'p:nth-of-type(3)',
    'p:nth-child(2n+1)',
    'div > p:not(.a):nth-child(2)',
    '.a:not([data-x]) + p',
    'div:not(:is(svg|div))',
    // a comma inside a nested functional pseudo-class does not separate two
    // selectors; splitting the group on it produced fragments like ' span)'
    ':is(p:not(.b), span)',
    ':is(p:is(.a, .c), span)',
    'div:not(p:not(.a), span)',
    ':is([data-x="a,b"], span)',
    ':where(svg|div)',
  ]

  test('the same elements, in the same order', () => {
    let markup = '<!doctype html><body>'
    for (let i = 0; i < 40; ++i) {
      markup +=
        `<div id=d${i} class="${i % 3 === 0 ? 'a' : 'b'}"${i % 5 === 0 ? ' data-x=1' : ''}>` +
        `<p id=p${i}a class="${i % 2 ? 'a' : 'c'}">1</p><p id=p${i}b>2</p><span id=s${i}>3</span>` +
        '</div>'
    }
    markup += '</body>'
    const { document, NW } = build(markup)

    for (const selector of SELECTORS) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, `${selector} disagrees with the reference engine`).toEqual(
        reference,
      )
    }
  })

  test('the form pseudo-classes answer what a browser answers', () => {
    // The expected sets here come from Chromium, not from jsdom: on these
    // four selectors jsdom's engine and the browser disagree, and this engine
    // sides with the browser. test/upstream/browser-agreement.spec.mts is
    // where that comparison is made against a live browser; this pins the
    // answers so they can be checked without one, and
    // docs/dom-selector-differences.md records the disagreement.
    const { document, NW } = build(
      '<!doctype html><body><div id=d>' +
        '<input id=i1 disabled><input id=i2><input id=i3 required>' +
        '<input id=i4 type=email value="not-an-email">' +
        '<fieldset id=fs disabled><legend id=lg><input id=li1></legend><input id=fi1></fieldset>' +
        '<fieldset id=fs2><input id=fi2></fieldset>' +
        '<form id=f1><input id=fi3 required><button id=b1>go</button></form>' +
        '</div></body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document)).map(node => node.id)

    // a disabled control is barred from constraint validation, so it matches
    // neither ':valid' nor ':invalid'
    expect(ids(':valid')).toEqual(['i2', 'fs', 'li1', 'fs2', 'fi2', 'b1'])
    expect(ids(':invalid')).toEqual(['i3', 'i4', 'f1', 'fi3'])
    expect(ids('input:valid')).toEqual(['i2', 'li1', 'fi2'])

    // a button is optional outright, and a fieldset-disabled control is
    // read-only rather than read-write
    expect(ids(':optional')).toEqual([
      'i1',
      'i2',
      'i4',
      'li1',
      'fi1',
      'fi2',
      'b1',
    ])
    expect(ids('button:optional')).toEqual(['b1'])
    expect(ids(':read-write')).toEqual(['i2', 'i3', 'i4', 'li1', 'fi2', 'fi3'])
    expect(ids('fieldset :read-write')).toEqual(['li1', 'fi2'])
    expect(ids('input:not(:read-write)')).toEqual(['i1', 'fi1'])
  })

  test(':defined matches every element that is not an undefined custom one', () => {
    const { window, document, NW } = build(
      '<!doctype html><body><div id=d1></div><my-thing id=mt></my-thing>' +
        '<button id=b1 is="fancy-btn">x</button></body>',
    )
    const ids = () =>
      Array.from(NW.select(':defined', document))
        .map(node => node.id)
        .filter(Boolean)

    // a built-in element is defined; a custom element is not until it has a
    // definition and has been upgraded to it, and a customized built-in whose
    // definition does not exist is in the same position
    expect(ids()).toEqual(['d1'])

    window.customElements.define(
      'my-thing',
      class extends window.HTMLElement {},
    )
    expect(ids()).toEqual(['d1', 'mt'])

    window.customElements.define(
      'fancy-btn',
      class extends window.HTMLButtonElement {},
      {
        extends: 'button',
      },
    )
    // the existing element is not upgraded by a later definition of an 'is'
    // form, which is what the reference engine says too
    expect(ids()).toEqual(
      Array.from(document.querySelectorAll(':defined'), node => node.id).filter(
        Boolean,
      ),
    )
  })

  test(':disabled and :enabled are complements, fieldsets included', () => {
    // A control inside a disabled fieldset is disabled unless it sits in that
    // fieldset's first legend child, and an option is disabled by the
    // optgroup it belongs to. ':enabled' used to read only the element's own
    // property, so it matched controls that ':disabled' matched as well.
    const { document, NW } = build(
      '<!doctype html><body><div><input id=i1 disabled><input id=i2>' +
        '<fieldset id=fs disabled><legend id=lg><input id=i5></legend><input id=i4>' +
        '<fieldset id=fs3><legend id=lg3><input id=i7></legend></fieldset></fieldset>' +
        '<fieldset id=fs2><input id=i6></fieldset>' +
        '<fieldset id=fs4 disabled><div><legend id=lg4><input id=i8></legend></div></fieldset>' +
        '<select id=se><optgroup id=og disabled><option id=op>o</option></optgroup>' +
        '<optgroup id=og2><option id=op2 disabled>o</option><option id=op3>o</option></optgroup>' +
        '</select></div></body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document)).map(node => node.id)
    const reference = (selector: string) =>
      Array.from(document.querySelectorAll(selector), node => node.id)

    for (const selector of [
      ':disabled',
      ':enabled',
      'input:disabled',
      'option:disabled',
    ] as const) {
      expect(ids(selector), selector).toEqual(reference(selector))
    }
    // and no element is both
    const both = ids(':disabled').filter(id => ids(':enabled').includes(id))
    expect(both).toEqual([])
  })

  test('the class of an SVG element is not a string', () => {
    // Element.className reflects the class attribute as a string, except on
    // SVGElement, where SVG 1.1 defined it as an SVGAnimatedString and the
    // browsers still ship that. jsdom implements it the same way, so this
    // covers the browser behavior too. Reading it without checking the type
    // matches the class against '[object SVGAnimatedString]' and quietly
    // finds nothing.
    const { document, NW } = build(
      '<!doctype html><body><div class="x big" id=d></div>' +
        '<svg id=s class="y wide"><rect id=r class=z></rect></svg></body>',
    )
    expect(typeof document.getElementById('s')!.className).toBe('object')

    // the class has to be a part the fetch did not use, or the resolver never
    // tests it: candidates come back from getElementsByClassName already
    for (const selector of [
      '.y.wide',
      '.wide.y',
      'svg.y.wide',
      '.y > .z',
      '.y .z',
      '.y rect',
      '.x.big',
      'div.x.big',
      '[class~="y"]',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
    expect(NW.match('.y.wide', document.getElementById('s')!)).toBe(true)
  })

  test('LEGACY restores the handling a pre-2015 host needed', () => {
    // The generated tests read reflected properties and call the host without
    // asking whether it has the method, because every host that can run this
    // source returns elements from a tag or class lookup. LEGACY is for one
    // that does not: IE up to 8 put comment nodes in a '*' collection.
    const { document, NW } = build(
      '<!doctype html><body><a href="#" id=a class="x big">x</a><!-- c --></body>',
    )
    const comment = document.body.childNodes[1]
    const scope = document.createElement('div')
    scope.innerHTML = '<a href="#" id=b class="x big">y</a>'
    const link = scope.firstChild
    // a host handing back something that is not an element
    Object.defineProperties(scope, {
      getElementsByTagName: {
        value: () => [link, document.createComment('c')],
      },
      getElementsByClassName: {
        value: () => [link, document.createComment('c')],
      },
    })

    // by default the fetch is trusted, so a collection like that is an error
    // rather than a non-match
    expect(() => NW.select('[href]', scope)).toThrow()
    expect(() => NW.select('.x.big', scope)).toThrow()
    // a tag test reads a property, so it rejects the comment either way
    expect(Array.from(NW.select('a.x', scope)).map(node => node.id)).toEqual([
      'b',
    ])

    try {
      NW.configure({ LEGACY: true })
      expect(
        Array.from(NW.select('[href]', scope)).map(node => node.id),
      ).toEqual(['b'])
      expect(
        Array.from(NW.select('.x.big', scope)).map(node => node.id),
      ).toEqual(['b'])
      expect(NW.match('.x', comment as unknown as Element)).toBe(false)
      expect(NW.match('[href]', comment as unknown as Element)).toBe(false)
      expect(NW.match('#a', comment as unknown as Element)).toBe(false)

      // and the ordinary answers do not change under it
      for (const selector of [
        'a.x',
        'a#a',
        '#a.big',
        'a[href]',
        '.x.big',
      ] as const) {
        const mine = Array.from(NW.select(selector, document)).map(
          node => node.id,
        )
        const reference = Array.from(
          document.querySelectorAll(selector),
          node => node.id,
        )
        expect(mine, selector).toEqual(reference)
      }
    } finally {
      NW.configure({ LEGACY: false })
    }

    // flipping the flag has to reach the compiled resolvers, not just the
    // next selector nobody has asked for yet
    expect(() => NW.select('[href]', scope)).toThrow()
  })

  test('an id the resolver tests, escaped every way the syntax allows', () => {
    // A plain '#id' is looked up by the id map. An id anywhere else in the
    // selector is compiled into a comparison against the value the DOM hands
    // back, so the escapes in the selector have to be resolved to the same
    // string the document holds.
    const { document, NW } = build(
      '<!doctype html><body><div id=plain><p id="a.b">1</p><p id="a:b">2</p>' +
        '<p id="café">3</p><p id="x y">4</p></div><div id=PLAIN></div></body>',
    )
    for (const selector of [
      'div#plain',
      'p#a\\.b',
      'p#a\\3A b',
      'p#caf\\e9 ',
      'p#café',
      'div#plain p#a\\.b',
      '#plain > #a\\.b',
      'div#PLAIN',
      'p#x\\ y',
      '[id="a.b"]',
      'div:not(#plain)',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
  })

  test('a forgiving list drops only the item it cannot read', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=d><p id=p>x</p></div></body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document)).map(node => node.id)
    const reference = (selector: string) =>
      Array.from(document.querySelectorAll(selector), node => node.id)

    // The unreadable item is the namespace-qualified one; the readable item
    // beside it still applies.
    for (const selector of [
      'p:is(svg|p, p)',
      'div:is(svg|div, #d)',
      ':where(svg|p, p)',
    ] as const) {
      expect(ids(selector), selector).toEqual(reference(selector))
    }
    // A list of nothing but unreadable items matches nothing, and does not
    // throw the way a non-forgiving list does.
    expect(ids(':is(svg|p)')).toEqual([])
    expect(() => NW.select('svg|p', document)).toThrow()
  })

  test('wildcard namespace type selectors agree with the reference', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=d><p id=p>x</p></div></body>',
    )

    expect(
      Array.from(NW.select('*|div', document)).map(node => node.id),
    ).toEqual(['d'])
    expect(
      Array.from(document.querySelectorAll('*|div'), node => node.id),
    ).toEqual(['d'])
  })
})
