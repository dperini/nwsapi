import createNwsapi from '../../../dist/nwsapi.js'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

// oxlint-disable-next-line complexity -- exercise the full method/arity matrix together
test('installed wrappers preserve callbacks and ignore extra arguments at every arity', t => {
  const { window } = new JSDOM('<main><p></p><p></p></main>', {
    runScripts: 'outside-only',
    url: 'https://example.test/',
  })
  t.onTestFinished(() => window.close())
  window.eval(
    fs.readFileSync(
      new URL('../../../dist/nwsapi.js', import.meta.url),
      'utf8',
    ),
  )
  const engine = window.NW.Dom
  const doc = window.document
  const main = doc.querySelector('main')!
  const child = main.firstElementChild!
  const fragment = doc.createDocumentFragment()
  fragment.append(main.cloneNode(true))
  engine.install()
  try {
    for (const target of [doc, main, fragment, child] as const) {
      for (const method of [
        'querySelector',
        'querySelectorAll',
        ...(target === child ? ['matches', 'closest'] : []),
      ] as const) {
        const invoke = (...args: unknown[]) =>
          Reflect.apply(Reflect.get(target, method), target, args)
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
            return {
              error: error instanceof Error ? error.name : String(error),
            }
          }
        }
        expect(capture(() => invoke())).toEqual(
          capture(() =>
            Reflect.apply(Reflect.get(engine, resolver!), engine, []),
          ),
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
          expect(
            method === 'querySelectorAll'
              ? Array.from(invoke(...args) as ArrayLike<Element>)
              : invoke(...args),
          ).toEqual(expected)
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
        const result = invoke('p', 'ignored')
        expect(
          method === 'querySelectorAll'
            ? Array.from(result as ArrayLike<Element>)
            : result,
        ).toEqual(expected)
      }
    }
  } finally {
    engine.uninstall()
  }
})

test('installed query results are static NodeList-compatible snapshots', t => {
  const { window } = new JSDOM('<p></p><p></p>', { runScripts: 'outside-only' })
  t.onTestFinished(() => window.close())
  window.eval(
    fs.readFileSync(
      new URL('../../../dist/nwsapi.js', import.meta.url),
      'utf8',
    ),
  )
  const engine = window.NW.Dom
  engine.install()
  const doc = window.document
  const list = doc.querySelectorAll('p')
  const nodes = Array.from(list)
  expect(list).toBeInstanceOf(window.NodeList)
  expect(Array.isArray(engine.select('p', doc))).toBe(true)
  expect(list.item(0)).toBe(nodes[0])
  expect(list.item(2)).toBeNull()
  expect(() => Reflect.apply(Reflect.get(list, 'item'), list, [])).toThrow()
  expect(Array.from(list.keys())).toEqual([0, 1])
  expect(Array.from(list.entries())).toEqual([
    [0, nodes[0]],
    [1, nodes[1]],
  ])
  const receiver = {}
  list.forEach(function (this: unknown, node, index, owner) {
    expect(this).toBe(receiver)
    expect(node).toBe(nodes[index])
    expect(owner).toBe(list)
  }, receiver)
  nodes[0]!.remove()
  doc.body.append(doc.createElement('p'))
  expect(Array.from(list)).toEqual(nodes)
  expect(Reflect.set(list, 'length', 0)).toBe(false)
  expect(list.length).toBe(2)
  engine.uninstall()
})

test('nonthrowing configuration returns empty results for missing arguments', t => {
  const { window } = new JSDOM('<div></div>')
  t.onTestFinished(() => window.close())
  const engine = createNwsapi(window)
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  expect(Reflect.apply(engine.match, engine, [])).toBe(false)
  expect(Reflect.apply(engine.select, engine, [])).toEqual([])
  expect(Reflect.apply(engine.first, engine, [])).toBeNull()
})
