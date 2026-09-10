import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('browser syntax accepts identifiers and transition lists without accepting malformed arguments', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  for (const legacy of [false, true]) {
    engine.configure({ LEGACY: legacy })
    for (const context of [
      window.document,
      window.document.createDocumentFragment(),
    ]) {
      for (const selector of [
        '::column',
        ':active-view-transition-type(one, two)',
        ':active-view-transition-type(one\\,two)',
        ':state(initial)',
        ':state(inherit)',
      ]) {
        expect(() => engine.select(selector, context), selector).not.toThrow()
      }
      for (const selector of [
        '::column(foo)',
        ':active-view-transition-type()',
        ':active-view-transition-type(,one)',
        ':active-view-transition-type(initial)',
        ':active-view-transition-type(one two)',
        ':active-view-transition-type(one,)',
        ':state()',
        ':state(one,two)',
      ]) {
        expect(() => engine.select(selector, context), selector).toThrow()
      }
    }
  }
})
