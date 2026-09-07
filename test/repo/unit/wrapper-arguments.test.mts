import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

test('installed wrappers preserve callbacks and ignore extra arguments at every arity', t => {
  const { window } = new JSDOM('<main><p></p><p></p></main>', {
    runScripts: 'outside-only',
    url: 'https://example.test/',
  })
  t.onTestFinished(() => window.close())
  window.eval(
    fs.readFileSync(new URL('../../../src/nwsapi.js', import.meta.url), 'utf8'),
  )
  const engine = window.NW.Dom
  const doc = window.document
  const main = doc.querySelector('main')!
  const child = main.firstElementChild!
  const fragment = doc.createDocumentFragment()
  fragment.append(main.cloneNode(true))
  engine.install()
  try {
    for (const target of [doc, main, fragment, child]) {
      for (const method of [
        'querySelector',
        'querySelectorAll',
        ...(target === child ? ['matches', 'closest'] : []),
      ]) {
        const invoke = (...args: unknown[]) =>
          Reflect.apply(target[method], target, args)
        const resolver = {
          querySelector: 'first',
          querySelectorAll: 'select',
          matches: 'match',
          closest: 'closest',
        }[method]
        const capture = (callback: () => unknown) => {
          try {
            return { value: callback() }
          } catch (error) {
            return { error: error.name }
          }
        }
        expect(capture(() => invoke())).toEqual(
          capture(() => Reflect.apply(engine[resolver], engine, [])),
        )
        const expected =
          method === 'matches'
            ? true
            : method === 'closest'
              ? child
              : method === 'querySelectorAll'
                ? Array.from(target.querySelectorAll('p'))
                : target.querySelector('p')
        for (let arity = 1; arity <= 10; arity++) {
          const seen: Element[] = []
          const args: unknown[] = ['p']
          if (arity > 1) {
            args.push((element: Element) => {
              seen.push(element)
            })
          }
          while (args.length < arity) {
            args.push('ignored')
          }
          expect(invoke(...args)).toEqual(expected)
          if (arity > 1) {
            expect(seen).toEqual(
              method === 'matches' || method === 'closest'
                ? [child]
                : Array.isArray(expected)
                  ? expected
                  : expected
                    ? [expected]
                    : [],
            )
          }
        }
        expect(invoke('p', 'ignored')).toEqual(expected)
      }
    }
  } finally {
    engine.uninstall()
  }
})
