import { describe, expect, test } from 'vitest'
import { build, buildModern, ids, MARKUP } from './legacy-fixture.mts'

describe('what a legacy resolver is allowed to contain', () => {
  // The reads the generated code makes are the whole point of the option, so
  // this audits the code itself rather than an answer: with LEGACY on, no
  // resolver may read the host directly. It is what caught the twenty
  // pseudo-class emissions that were still doing it.
  const DIRECT =
    /\b[eno]\.(localName|nodeName|className|classList|id|parentElement|firstElementChild|nextElementSibling|previousElementSibling|getAttribute|hasAttribute|isConnected|attributes|children)\b/

  const SHAPES = [
    'div',
    '.x',
    '#d',
    '[href]',
    '[href="#"]',
    '[class~="x"]',
    '[title="A" i]',
    'div p',
    'div > p',
    'p + a',
    'p ~ a',
    'div p a',
    'p, span',
    ':first-child',
    ':last-child',
    ':only-child',
    ':first-of-type',
    ':last-of-type',
    ':only-of-type',
    ':nth-child(3)',
    ':nth-child(2n+1)',
    ':nth-of-type(2)',
    ':nth-last-child(2)',
    ':nth-last-of-type(1)',
    ':empty',
    ':root',
    ':scope',
    ':not(.x)',
    ':is(.x)',
    ':where(p, a)',
    ':has(p)',
    ':has(> p)',
    ':lang(en)',
    ':dir(ltr)',
    ':link',
    ':any-link',
    ':visited',
    ':target',
    ':enabled',
    ':disabled',
    ':checked',
    ':indeterminate',
    ':required',
    ':optional',
    ':valid',
    ':invalid',
    ':in-range',
    ':out-of-range',
    ':read-only',
    ':read-write',
    ':placeholder-shown',
    ':default',
    ':defined',
    ':hover',
    ':focus',
    ':active',
    ':muted',
    ':playing',
    ':paused',
    ':seeking',
    ':buffering',
    ':stalled',
    ':open',
    ':closed',
    ':modal',
    ':fullscreen',
    ':picture-in-picture',
    ':popover-open',
    ':local-link',
  ]

  test('no resolver reads the host directly', () => {
    const { NW } = build(MARKUP)
    expect(NW.configure()['LEGACY']).toBe(true)

    const offenders = []
    for (const selector of SHAPES) {
      for (const mode of [true, false] as const) {
        let code
        try {
          const factory = NW.compile(selector, mode, null)
          // a selector the fetch answers on its own compiles to no resolver
          code = factory ? String(factory) : ''
        } catch {
          // a selector this build rejects is not this test's business
          continue
        }
        const found = code.match(DIRECT)
        if (found) {
          offenders.push(
            `${selector} [${mode ? 'select' : 'match'}] reads ${found[0]}`,
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('host-read text inside selector strings is data, not generated code', () => {
    const { NW, document } = buildModern('<div id=a></div><div id=b></div>')
    const a = document.getElementById('a')!
    for (const value of [
      'e.localName',
      'n.parentElement',
      'o.id',
      'e.hasAttribute(x)',
      'e.getAttribute(x)',
      'e/localName',
      'e[localName]',
    ] as const) {
      a!.setAttribute('data-x', value)
      const quoted = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      for (const selector of [
        '[data-x="' + quoted + '"]',
        ':not([data-x="' + quoted + '"])',
        ':is([data-x="' + quoted + '"])',
      ] as const) {
        NW.configure({ LEGACY: false })
        const expected = ids(NW.select(selector, document))
        NW.configure({ LEGACY: true })
        expect(ids(NW.select(selector, document)), selector).toEqual(expected)
      }
    }
  })

  test('the ordinary path still reads the host directly', () => {
    // the other half of the bargain: with the option off, the reads are
    // written in place and cost neither a call nor a branch
    const { NW } = buildModern(MARKUP)
    expect(NW.configure()['LEGACY']).toBe(false)
    expect(String(NW.compile('div p', true, null))).toContain('.localName')
    expect(String(NW.compile('[href]', true, null))).toContain('.hasAttribute')
    expect(String(NW.compile(':first-child', true, null))).toContain(
      '.previousElementSibling',
    )
  })
})
