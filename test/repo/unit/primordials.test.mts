import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { expect, test, type TestContext } from 'vitest'
import type factory from '../../../dist/nwsapi.js'
import { registerLegacyInContext } from '../common/legacy.mts'

const filename = fileURLToPath(
  new URL('../../../dist/nwsapi.js', import.meta.url),
)
const source = readFileSync(filename, 'utf8')

function load(t: TestContext, before = '') {
  const { window } = new JSDOM(
    '<main><p id="😀" class="item"></p><input type="checkbox" checked></main>',
  )
  t.onTestFinished(() => window.close())
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: module.exports })
  vm.runInContext(before, context)
  vm.runInContext(source, context, { filename })
  return { context, window, make: module.exports as typeof factory }
}

test('captured APIs survive later replacement of global methods and constructors', t => {
  const { context, window, make } = load(t)
  const engine = make(window)
  vm.runInContext(
    `
    var fail = function () { throw new Error('late replacement called'); };
    String.prototype.includes = String.fromCodePoint = fail;
    Object.create = Object.defineProperty = Object.defineProperties = fail;
    Array.prototype.slice = fail;
    Map = WeakMap = WeakRef = FinalizationRegistry = Symbol = undefined;
  `,
    context,
  )
  for (const current of [engine, make(window)]) {
    expect(current.select('main > .item')).toHaveLength(1)
    expect(current.select(':checked')).toHaveLength(1)
    expect(current.select('#\\1f600 ')).toHaveLength(1)
    current.configure({ NODE_LIST: true })
    expect(Array.from(current.select('p'))).toHaveLength(1)
  }
})

test('legacy hooks reject JavaScript shims even when their own toString looks native', t => {
  const { context, window, make } = load(
    t,
    `
    var broken = function () { throw new Error('shim called'); };
    broken.toString = function () { return 'function Map() { [native code] }'; };
    String.prototype.includes = String.fromCodePoint = broken;
    Map = WeakMap = WeakRef = FinalizationRegistry = broken;
  `,
  )
  const engine = registerLegacyInContext(make(window), context)
  expect(engine.configure('LEGACY')).toBe(true)
  expect(engine.select(':checked')).toHaveLength(1)
  expect(engine.select('#\\1f600 ')).toHaveLength(1)
  expect(engine.select('main > .item')).toHaveLength(1)
})

for (const failure of ['read', 'delete', 'retained-key']) {
  test(`startup probes reject native-looking maps with broken ${failure} behavior`, t => {
    const { context, window, make } = load(
      t,
      `
    var NativeMap = Map, NativeWeakMap = WeakMap;
    Map = new Proxy(NativeMap, {
      construct: function () {
        var map = new NativeMap();
        if (${JSON.stringify(failure)} === 'read') {
          map.get = function () { return undefined; }.bind(null);
        } else {
          map.delete = function () { return ${failure === 'retained-key'}; }.bind(null);
        }
        return map;
      }
    });
    WeakMap = new Proxy(NativeWeakMap, {
      construct: function () { throw new Error('broken constructor'); }
    });
  `,
    )
    const engine = registerLegacyInContext(make(window), context)
    expect(engine.select('main > .item')).toHaveLength(1)
    expect(engine.select('p:nth-child(1)')).toHaveLength(1)
    expect(engine.select(':checked')).toHaveLength(1)
  })
}
