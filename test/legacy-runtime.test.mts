import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
import path from 'node:path'
const vm = require('node:vm')
const source = readFileSync(path.join(__dirname, '../src/nwsapi.js'), 'utf8')
// A test-only hook exercises the internal allocator without adding public API.
assert.equal(source.split('return Dom;').length, 2)
const instrumented = source.replace(
  'return Dom;',
  'Dom.testCreateWeakMap = function() { return createWeakMap(); }; return Dom;',
)

type TestFactory = (host: {
  document: ReturnType<typeof documentStub>
  DOMException: typeof Error
}) => {
  configure(option: string | { LEGACY: boolean }): boolean
  testCreateWeakMap(): WeakMap<object, unknown> | undefined
}

function documentStub() {
  const document = {
    nodeType: 9,
    documentElement: undefined as
      | {
          nodeType: number
          localName: string
          firstElementChild: null
          hasAttribute(): boolean
          namespaceURI: string
          ownerDocument: unknown
        }
      | undefined,
    contentType: 'text/html',
    compatMode: 'CSS1Compat',
    addEventListener() {},
    getElementsByClassName() {
      return []
    },
    createElement(name) {
      return { localName: name.toLowerCase() }
    },
  }
  document.documentElement = {
    nodeType: 1,
    localName: 'html',
    firstElementChild: null,
    hasAttribute() {
      return false
    },
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document,
  }
  return document
}

for (const [name, value, legacy, available] of [
  ['modern', WeakMap, false, true],
  ['legacy with WeakMap', WeakMap, true, true],
  ['legacy without WeakMap', undefined, true, false],
  ['legacy with a non-callable WeakMap', {}, true, false],
] as const) {
  test(`${name} selects the allocator once`, () => {
    let reads = 0
    const context = { module: { exports: {} }, exports: {} }
    Object.defineProperty(context, 'WeakMap', {
      get() {
        reads++
        return value
      },
    })
    vm.runInNewContext(instrumented, context)
    const document = documentStub()
    const nw = (context.module.exports as TestFactory)({
      document,
      DOMException: Error,
    })
    assert.equal(
      nw.configure('LEGACY'),
      false,
      'capability does not determine the flag',
    )
    nw.configure({ LEGACY: legacy })
    const first = nw.testCreateWeakMap()
    const initialReads = reads
    assert.ok(initialReads > 0)
    if (available) {
      const key = {}
      first.set(key, 42)
      assert.equal(first.get(key), 42)
    } else {
      assert.equal(first, undefined)
    }
    for (let i = 0; i < 50; i++) {
      const next = nw.testCreateWeakMap()
      if (available) {
        assert.notEqual(next, first)
      } else {
        assert.equal(next, undefined)
      }
    }
    assert.equal(
      reads,
      initialReads,
      'allocations must reuse the detected constructor',
    )
  })
}
