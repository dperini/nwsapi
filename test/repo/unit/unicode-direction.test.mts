import { createRequire } from 'node:module'
import { createLegacyEngine } from '../common/legacy.mts'
import { JSDOM } from 'jsdom'
import { expect, test, vi, type TestContext } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import type * as Direction from '../../../src/core/unicode-directionality.mts'

const require = createRequire(import.meta.url)

function fixture(
  t: TestContext,
  make: (host: Parameters<typeof factory>[0]) => ReturnType<typeof factory>,
  markup = '<main dir="auto"></main>',
) {
  const { window } = new JSDOM(markup)
  t.onTestFinished(() => window.close())
  // Force the shipped fallback, including hosts whose native matcher delegates.
  for (const name of [
    'matches',
    'webkitMatchesSelector',
    'mozMatchesSelector',
    'msMatchesSelector',
  ]) {
    Object.defineProperty(window.Element.prototype, name, {
      value: undefined,
      configurable: true,
    })
  }
  const engine = make(window)
  const doc = window.document
  const main = doc.querySelector('main')!
  return { window, engine, doc, main }
}

for (const [label, make] of [
  ['modern', factory],
  ['legacy hooks', createLegacyEngine],
] as const) {
  test(`${label}: Unicode first-strong matching observes scripts and text mutations`, t => {
    const { engine, main, doc } = fixture(t, make)
    for (const [text, direction] of [
      ['אב English', 'rtl'],
      ['... אב', 'rtl'],
      ['English אב', 'ltr'],
      ['... العربية', 'rtl'],
      ['123 😀', 'ltr'],
      ['\u{1e900}', 'rtl'],
      ['\u{10940}', 'rtl'],
      ['\u200eאב', 'ltr'],
      ['\u200fA', 'rtl'],
      ['\u{16ea0}', 'ltr'],
      ['', 'ltr'],
    ] as const) {
      main.textContent = text
      for (const value of ['ltr', 'rtl'] as const) {
        const selector = `main:dir(${value})`
        const matches = value === direction
        expect(engine.match(selector, main), text).toBe(matches)
        expect(engine.select(selector, doc), text).toEqual(
          matches ? [main] : [],
        )
        expect(engine.first(selector, doc), text).toBe(matches ? main : null)
      }
    }
    expect(engine.match(':dir(unknown)', main)).toBe(false)
  })

  test(`${label}: automatic direction excludes isolated descendants and uses control values`, t => {
    const { engine, main, doc } = fixture(t, make)
    main.innerHTML =
      '<bdi>אב</bdi><span dir="auto">אב</span><span dir="rtl">אב</span><script>אב</script><style>אב</style><textarea>אב</textarea><!-- אב --><span dir="invalid">English</span>'
    expect(engine.match(':dir(ltr)', main)).toBe(true)
    main.lastElementChild!.textContent = 'אב'
    expect(engine.match(':dir(rtl)', main)).toBe(true)
    main.setAttribute('dir', 'LTR')
    expect(engine.match(':dir(ltr)', main)).toBe(true)
    const textarea = main.querySelector('textarea')!
    textarea.dir = 'auto'
    textarea.value = 'English'
    expect(engine.match(':dir(ltr)', textarea)).toBe(true)
    textarea.value = 'אב'
    expect(engine.match(':dir(rtl)', textarea)).toBe(true)
    const input = doc.createElement('input')
    main.append(input)
    main.setAttribute('dir', 'rtl')
    input.type = 'tel'
    expect(engine.match(':dir(ltr)', input)).toBe(true)
    for (const type of [
      'text',
      'search',
      'tel',
      'url',
      'password',
      'hidden',
      'button',
      'submit',
      'reset',
      'email',
    ]) {
      input.type = type
      input.dir = 'auto'
      for (const value of ['', '123', 'English', 'אב']) {
        input.value = value
        expect(engine.match(':dir(rtl)', input), `${type}: ${value}`).toBe(
          value === 'אב',
        )
      }
    }
    input.type = 'checkbox'
    expect(engine.match(':dir(ltr)', input)).toBe(true)
    const foreign = doc.createElementNS('urn:other', 'span')
    foreign.setAttribute('dir', 'ltr')
    main.append(foreign)
    expect(engine.match(':dir(rtl)', foreign)).toBe(true)
    foreign.remove()
    expect(engine.match(':dir(ltr)', foreign)).toBe(true)
  })

  test(`${label}: automatic slot direction follows assignments and shadow inheritance`, t => {
    const { engine, main, doc } = fixture(t, make)
    main.dir = 'rtl'
    const root = main.attachShadow({ mode: 'open' })
    root.innerHTML = '<section><slot dir="auto">English</slot></section>'
    const section = root.firstElementChild!
    const slot = section.firstElementChild!
    expect(engine.match(':dir(rtl)', section)).toBe(true)
    expect(engine.match(':dir(rtl)', slot)).toBe(true)
    main.append('English')
    expect(engine.match(':dir(ltr)', slot)).toBe(true)
    main.firstChild!.textContent = 'אב'
    expect(engine.match(':dir(rtl)', slot)).toBe(true)
    main.replaceChildren(doc.createElement('bdi'))
    main.firstElementChild!.textContent = 'אב'
    expect(engine.match(':dir(ltr)', slot)).toBe(true)
    main.replaceChildren(doc.createElement('span'))
    main.firstElementChild!.append('אב')
    expect(engine.match(':dir(rtl)', slot)).toBe(true)
    section.setAttribute('dir', 'auto')
    expect(engine.match(':dir(ltr)', section)).toBe(true)
  })

  test(`${label}: native direction checks avoid reading fallback DOM state`, t => {
    const { engine, main } = fixture(t, make)
    const matches = vi.fn(() => true)
    Object.defineProperty(main, 'matches', { value: matches })
    const attribute = vi.spyOn(main, 'getAttribute')
    expect(engine.match(':dir(rtl)', main)).toBe(true)
    expect(matches).toHaveBeenCalledWith(':dir(rtl)')
    expect(attribute).not.toHaveBeenCalled()
  })

  test(`${label}: ordinary slot text works without shadow DOM APIs`, t => {
    const { engine, main, window } = fixture(t, make)
    main.innerHTML = '<slot>אב</slot>'
    expect(engine.match(':dir(rtl)', main)).toBe(true)
    main.firstElementChild!.setAttribute('dir', 'auto')
    expect(engine.match(':dir(rtl)', main.firstElementChild!)).toBe(true)
    Object.defineProperty(window.Node.prototype, 'getRootNode', {
      value: undefined,
      configurable: true,
    })
    main.innerHTML = '<slot>אב</slot>'
    expect(engine.match(':dir(rtl)', main)).toBe(true)
    main.firstElementChild!.setAttribute('dir', 'auto')
    expect(engine.match(':dir(rtl)', main.firstElementChild!)).toBe(true)
  })
}

test('bundled bidi data agrees with Unicode 17 range boundaries', () => {
  const { firstStrong } = Reflect.get(factory, '_direction') as typeof Direction
  const classes = ['Left_To_Right', 'Right_To_Left', 'Arabic_Letter'].map(
    name =>
      (
        require(`@unicode/unicode-17.0.0/Bidi_Class/${name}/ranges.mjs`) as {
          default: Array<{ begin: number; end: number }>
        }
      ).default,
  )
  const boundaries = new Set<number>()
  for (const ranges of classes) {
    for (const { begin, end } of ranges) {
      for (const point of [begin - 1, begin, end - 1, end]) {
        if (point >= 0 && point <= 0x10_ff_ff) {
          boundaries.add(point)
        }
      }
    }
  }
  for (const point of boundaries) {
    const index = classes.findIndex(ranges =>
      ranges.some(({ begin, end }) => point >= begin && point < end),
    )
    expect(firstStrong(String.fromCodePoint(point)), point.toString(16)).toBe(
      index < 0 ? null : index === 0 ? 'ltr' : 'rtl',
    )
  }
})
