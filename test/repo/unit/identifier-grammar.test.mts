import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

const require = createRequire(import.meta.url)
const minified: typeof factory = require('../../../dist/nwsapi.min.js')

for (const [label, make] of [
  ['source', factory],
  ['minified', minified],
] as const) {
  test(`${label}: CSS identifiers include Unicode 17 and names outside JavaScript's grammar`, t => {
    const { window } = new JSDOM('<p></p>')
    t.onTestFinished(() => window.close())
    const doc = window.document
    const element = doc.querySelector('p')!
    const engine = make(window)
    for (const value of [
      'ƪ',
      'Ɂ',
      'ʔ',
      'ʡ',
      'ใ',
      'ໃ',
      'ǃ',
      '\u0080',
      '\u009f',
      '\u{10940}',
      '\u{16ea0}',
      '😀',
      '--',
      '-a',
      '_a',
    ]) {
      element.id = value
      element.className = value
      for (const selector of [
        '#' + value,
        '.' + value,
        'p.' + value,
        ':is(.' + value + ')',
      ]) {
        expect(engine.match(selector, element), selector).toBe(true)
        expect(engine.select(selector, doc), selector).toEqual([element])
        expect(engine.first(selector, doc), selector).toBe(element)
      }
    }
  })

  test(`${label}: invalid identifier starts cannot pass through compound optimizations`, t => {
    const { window } = new JSDOM('<p></p>')
    t.onTestFinished(() => window.close())
    const doc = window.document
    const element = doc.querySelector('p')!
    const engine = make(window)
    for (const value of ['0', '0rem', '-1', '-']) {
      for (const selector of [
        '.' + value,
        '#' + value,
        'p.' + value,
        'p#' + value,
        ':state(' + value + ')',
      ]) {
        expect(() => engine.match(selector, element), selector).toThrow()
        expect(
          () => engine.select(selector, doc.createDocumentFragment()),
          selector,
        ).toThrow()
        expect(() => engine.first(selector, doc), selector).toThrow()
      }
    }
    expect(engine.match(':state(--)', element)).toBe(false)
    expect(engine.select('::part(--)', doc)).toEqual([])
    element.id = '0'
    expect(engine.match('#\\30 ', element)).toBe(true)
    expect(engine.select('p#\\30 ', doc)).toEqual([element])
    expect(engine.match(':state(\\30 )', element)).toBe(false)
  })
}
