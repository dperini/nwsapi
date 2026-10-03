import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { ENGINE_BUILD_PATH } from '../../lib/paths.mts'
import { sha256 } from '../footprint/shared.mts'
import type { NwsapiEngine } from '../../../../.config/runtime.d.ts'

const [output] = process.argv.slice(2)
if (!output || output === '--help') {
  console.log(
    'Usage: survey/compiler.mts output.json\nCounts live attribute and sibling reads in existing compiled paths. No timing claims.',
  )
} else {
  const load = createRequire(import.meta.url)
  const factory = load(ENGINE_BUILD_PATH) as (host: unknown) => NwsapiEngine
  const dom = new JSDOM('<!doctype html><i data-value="foobar"></i>')
  const element = dom.window.document.getElementsByTagName('i')[0]!
  let attributeReads = 0
  let presenceReads = 0
  const engine = factory({
    document: dom.window.document,
    DOMException: dom.window.DOMException,
    hostReaders: {
      attrOf(node: Element, name: string) {
        ++attributeReads
        return node.getAttribute(name)
      },
      hasAttrOf(node: Element, name: string) {
        ++presenceReads
        return node.hasAttribute(name)
      },
    },
  })
  const attributes = [
    '[data-value^="foo"][data-value$="bar"]',
    '[data-value="foobar"][data-value]',
    '[data-value="foobar"][data-value="foobar"]',
  ].map(selector => {
    engine.match(selector, element)
    attributeReads = 0
    presenceReads = 0
    assert.equal(engine.match(selector, element), true)
    return { selector, attributeReads, presenceReads }
  })
  const siblingReads = [
    { count: 64, types: 4 },
    { count: 128, types: 4 },
    { count: 256, types: 1 },
    { count: 256, types: 4 },
    { count: 256, types: 16 },
  ].map(({ count, types }) => {
    const markup = Array.from(
      { length: count },
      (_, i) => `<x-${i % types}></x-${i % types}>`,
    ).join('')
    const host = new JSDOM(`<!doctype html><main>${markup}</main>`)
    const doc = host.window.document
    const instance = factory(host.window)
    const selector = 'main > :nth-of-type(2n)'
    const expected = Array.from(doc.querySelectorAll(selector))
    const prototype = host.window.Element.prototype
    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      'nextElementSibling',
    )!
    let reads = 0
    Object.defineProperty(prototype, 'nextElementSibling', {
      ...descriptor,
      get(this: Element) {
        ++reads
        return descriptor.get!.call(this)
      },
    })
    instance.select(selector, doc)
    reads = 0
    const result = Array.from(instance.select(selector, doc))
    assert.deepEqual(result, expected)
    const entry = {
      selector,
      siblings: count,
      types,
      reads,
      matches: result.length,
    }
    host.window.close()
    return entry
  })
  dom.window.close()
  writeFileSync(
    output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        candidateSha256: sha256(readFileSync(ENGINE_BUILD_PATH)),
        host: `jsdom ${load('jsdom/package.json').version}`,
        method:
          'Operation counts on warm calls. Attribute host hooks and nextElementSibling getter instrumented. Ordered identities checked against the host selector engine. No performance timings.',
        attributes,
        siblingReads,
      },
      null,
      2,
    ) + '\n',
  )
}
