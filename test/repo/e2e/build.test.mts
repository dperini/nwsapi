import type * as NwsapiModule from '../../../src/nwsapi.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'
import { JSDOM } from 'jsdom'
import { beforeAll, test } from 'vitest'

let source: string
const pkg = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
)

beforeAll(() => {
  source = readFileSync(
    new URL('../../../dist/nwsapi.min.js', import.meta.url),
    'utf8',
  )
  assert.match(source, /^\/\*!\n \* NWSAPI /)
  assert.ok(source.includes(`NWSAPI ${pkg.version} -`))
})

for (const [file, ecmaVersion] of [
  ['src/nwsapi.js', 2015],
  ['dist/nwsapi.min.js', 2015],
  ['src/modules/nwsapi-jquery.js', 5],
  ['src/modules/nwsapi-traversal.js', 5],
] as const) {
  test(`${file} retains its existing ES${ecmaVersion} script syntax`, () => {
    const code = readFileSync(
      new URL(`../../../${file}`, import.meta.url),
      'utf8',
    )
    parse(code, { ecmaVersion, sourceType: 'script' })
  })
}

test('adapter retains its existing ES2019 CommonJS syntax', () => {
  const code = readFileSync(
    new URL('../../../src/dom-selector.js', import.meta.url),
    'utf8',
  )
  parse(code, { ecmaVersion: 2019, sourceType: 'script' })
  assert.match(code, /require\(['"]css-tree['"]\)/)
  assert.match(code, /module\.exports\s*=\s*DOMSelector/)
})

for (const format of ['browser', 'CommonJS', 'AMD'] as const) {
  test(`minified ${format} build selects, matches, and observes mutations`, () => {
    const dom = new JSDOM('<div><p id="a" class="x"></p><p id="b"></p></div>', {
      runScripts: 'outside-only',
    })
    const { window } = dom
    try {
      let factory: typeof NwsapiModule.default | undefined
      if (format === 'CommonJS') {
        const module = { exports: {} }
        vm.runInNewContext(source, { module, exports: module.exports })
        factory = module.exports as typeof NwsapiModule.default
        assert.equal(
          typeof Object.getOwnPropertyDescriptor(factory, 'DOMSelector')!.get,
          'function',
        )
      } else if (format === 'AMD') {
        const define = (value: typeof NwsapiModule.default) => {
          factory = value
        }
        define.amd = {}
        vm.runInNewContext(source, { define })
      } else {
        vm.runInContext(source, dom.getInternalVMContext())
      }
      const engine = factory ? factory(window) : window.NW.Dom
      assert.equal(engine.Version, `nwsapi-${pkg.version}`)
      const ids = () =>
        Array.from(engine.select('div > p.x'), (node: Element) => node.id)
      assert.deepEqual(ids(), ['a'])
      assert.equal(
        engine.match('div > p.x', window.document.getElementById('a')!),
        true,
      )
      window.document.getElementById('b')!.className = 'x'
      assert.deepEqual(ids(), ['a', 'b'])
    } finally {
      window.close()
    }
  })
}
