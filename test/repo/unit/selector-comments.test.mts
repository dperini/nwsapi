import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

for (const legacy of [false, true]) {
  test(`CSS comments preserve tokens, strings, and escapes (legacy ${legacy})`, t => {
    const { window } = new JSDOM(
      '<main><p id="one" class="item special" data-x="ab"></p><p id="two" class="item" data-x="/*literal*/"></p></main>',
    )
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine).configure({ LEGACY: true })
    }
    const cases = [
      ['.item/**/.special', ['one']],
      ['p:nth-child(odd/**/of/**/.item)', ['one']],
      ['p:nth-child(2n/**/+/**/1)', ['one']],
      ['p[data-x="AB"/**/i]', ['one']],
      ['p[data-x=AB/**/i]', ['one']],
      ['p[data-x="/*literal*/"]', ['two']],
      ['/**/.item/**//**/', ['one', 'two']],
      ['p/*unterminated', ['one', 'two']],
      [':is(p/**/span,.special)', ['one']],
      ['.\\69 /**/.special', []],
      ['.\\69/**/ tem', []],
      ['.\\69 tem/**/.special', ['one']],
      ['[data-x="a\\\nb"]/**/', ['one']],
      ['[data-x="a\\\r\nb"]/**/', ['one']],
      ['[data-x="\\61 b"]/**/', ['one']],
      ['p/*"ignored*/.special', ['one']],
    ] as const
    for (let pass = 0; pass < 2; pass += 1) {
      for (const [selector, expected] of cases) {
        expect(
          Array.from(engine.select(selector, window.document), e => e.id),
          selector,
        ).toEqual(expected)
        expect(
          engine.first(selector, window.document)?.id ?? null,
          selector,
        ).toBe(expected[0] ?? null)
        expect(
          engine.match(selector, window.document.getElementById('one')!),
          selector,
        ).toBe(expected.some(id => id === 'one'))
      }
    }
    for (const selector of [
      'p/**/span',
      ':is/**/(p)',
      '#/**/one',
      '.\\69 /**/tem',
      '[data-x~/**/=ab]',
      'p:nth-child(2/**/n)',
      '[data-/**/x=ab]',
    ]) {
      expect(() => engine.select(selector, window.document), selector).toThrow()
      expect(
        () => engine.first(selector, window.document.createDocumentFragment()),
        selector,
      ).toThrow()
      expect(
        () => engine.match(selector, window.document.getElementById('one')!),
        selector,
      ).toThrow()
    }
    expect(
      engine.compile('p/**/.special', false)!(
        window.document.getElementById('one'),
        null,
        null,
        false,
      ),
    ).toBe(true)
  })
}
