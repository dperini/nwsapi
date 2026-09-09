import { registerLegacyInContext } from '../common/legacy.mts'
import type * as NodeFs from 'node:fs'
import type * as NodeVm from 'node:vm'
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { aqs_match } from '@ultrathink/acorn.rs.wasm'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
import assert from 'node:assert/strict'
const { readFileSync } = require('node:fs') as typeof NodeFs
import path from 'node:path'
const vm = require('node:vm') as typeof NodeVm
const source = readFileSync(path.join(__dirname, '../../../dist/nwsapi.js'))
// A test-only hook exercises the internal allocator without adding public API.
// Locate the return by syntax so indentation and semicolons do not affect it.
// Query inside WASM so only the matching span crosses into JavaScript.
const result = JSON.parse(
  aqs_match(
    source.toString('utf8'),
    'ReturnStatement[argument.type="Identifier"][argument.name="Dom"]',
  ),
) as { ok: boolean; matches: Array<{ start: number }> }
assert.equal(result.ok, true)
assert.equal(result.matches.length, 1)
const start = result.matches[0]!.start
// The WASM parser returns byte offsets, so splice the original UTF-8 buffer.
const instrumented = Buffer.concat([
  source.subarray(0, start),
  Buffer.from(
    'Dom.testCreateWeakMap = function() { return createWeakMap(); };\n',
  ),
  source.subarray(start),
]).toString('utf8')

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
          getAttributeNames(): string[]
          isConnected: boolean
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
    createElement(name: string) {
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
    getAttributeNames() {
      return []
    },
    isConnected: true,
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
    const nw = registerLegacyInContext(
      (context.module.exports as TestFactory)({
        document,
        DOMException: Error,
      }),
      context,
    )
    assert.equal(
      nw.configure('LEGACY'),
      false,
      'WeakMap availability does not determine the flag',
    )
    nw.configure({ LEGACY: legacy })
    const first = nw.testCreateWeakMap()
    const initialReads = reads
    assert.ok(initialReads > 0)
    if (available) {
      const key = {}
      first!.set(key, 42)
      assert.equal(first!.get(key), 42)
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
