import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { legacyHost } from '../common/fixture/legacy-host.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import { nativeBinding } from '../../../src/adapter/native-binding.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'legacy host attribute readers seed Rust selector snapshots',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const installLegacy = require('../../../dist/modules/nwsapi-legacy.js') as (
      engine: object,
    ) => unknown
    const { window } = new JSDOM(
      '<!doctype html><main><p class="pick" data-score="2"></p><p class="pick" data-score="3"></p><a id="legacyUrl" href="./target"></a><svg><linearGradient id="gradient"></linearGradient><use id="use" xlink:href="#gradient"></use></svg></main>',
      { url: 'http://legacy.example/#legacy-target' },
    )
    try {
      const nativeDocument = window.document
      const target = nativeDocument.createElement('p')
      target.setAttribute('id', 'legacy-target')
      nativeDocument.body.append(target)
      const document = legacyHost(nativeDocument, {
        comments: false,
      }) as Document
      let hostCalls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              hostCalls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const engine = adapter.engine
      installLegacy(engine)
      engine.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
      engine.configure({ LEGACY: true })
      const selector = 'main > p[class~="pick"][data-score!="2"]'
      const expected = engine.select(selector, document)
      assert.equal(engine.configure()['LEGACY'], true)
      const legacyReaders = nativeBinding(engine, binding).legacyReaders
      assert.ok(legacyReaders)
      assert.equal(
        legacyReaders?.tagOf(document.getElementsByTagName('p')[0]!),
        'p',
      )

      assert.deepEqual(adapter.querySelectorAll(selector, document), expected)
      assert.equal(hostCalls, 1)
      const resolvedUrlSelector = 'a[href="http://legacy.example/target"]'
      assert.deepEqual(
        adapter.querySelectorAll(resolvedUrlSelector, document),
        engine.select(resolvedUrlSelector, document),
      )
      assert.equal(hostCalls, 2)
      assert.deepEqual(
        adapter.querySelectorAll(
          '[enctype="application/x-www-form-urlencoded"]',
          document,
        ),
        engine.select(
          '[enctype="application/x-www-form-urlencoded"]',
          document,
        ),
      )
      assert.equal(hostCalls, 3)
      assert.deepEqual(
        adapter.querySelectorAll('form:valid', document),
        engine.select('form:valid', document),
      )
      assert.equal(hostCalls, 3)
      const commentedSelector = 'main/* :focus */ > p[data-score="2"]'
      assert.deepEqual(
        adapter.querySelectorAll(commentedSelector, document),
        engine.select(commentedSelector, document),
      )
      assert.equal(hostCalls, 4)
      assert.deepEqual(
        adapter.querySelectorAll('use[*|href]', document),
        engine.select('use[*|href]', document),
      )
      assert.equal(hostCalls, 5)
      engine.registerSelector(
        'legacy:first',
        /^:legacyFlag(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      engine.registerSelector(
        'legacy:second',
        /^:legacyAlso(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      engine.configure({}, true)
      const legacyPluginSelector = 'main > p.pick:legacyFlag:legacyAlso'
      assert.deepEqual(
        adapter.querySelectorAll(legacyPluginSelector, document),
        engine.select(legacyPluginSelector, document),
      )
      assert.equal(hostCalls, 6)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(':target', document),
          node => node.id,
        ),
        Array.from(engine.select(':target', document), node => node.id),
      )
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(':target', document),
          node => node.id,
        ),
        ['legacy-target'],
      )
      assert.equal(hostCalls, 8)
      const detachedTarget = nativeDocument.createElement('p')
      detachedTarget.setAttribute('id', 'legacy-target')
      const detachedRoot = nativeDocument.createElement('section')
      detachedRoot.append(detachedTarget)
      assert.deepEqual(adapter.querySelectorAll(':target', detachedRoot), [])
      const scopedSelector = 'p[class~="pick"][data-score!="2"]'
      const main = document.getElementsByTagName('main')[0]!
      assert.deepEqual(
        adapter.querySelectorAll(scopedSelector, main),
        engine.select(scopedSelector, main),
      )
      assert.equal(hostCalls, 9)

      const traversalFile =
        require.resolve('../../../dist/modules/nwsapi-traversal.js')
      runInNewContext(readFileSync(traversalFile, 'utf8'), {
        NW: { Dom: engine },
        document,
      })
      const fragment = document.createDocumentFragment()
      const rawFragmentSection = nativeDocument.createElement('section')
      rawFragmentSection.innerHTML = '<i></i><b></b>'
      fragment.append(rawFragmentSection)
      const fragmentSection = fragment.firstChild as Element
      assert.equal(engine.down!(fragment, null), fragmentSection)
      assert.equal(
        engine.down!(fragment, 'b'),
        fragmentSection.getElementsByTagName('b')[0],
      )
      assert.equal(hostCalls, 11)

      const rawOuterHost = nativeDocument.createElement('x-outer')
      const rawOuterShadow = rawOuterHost.attachShadow({ mode: 'open' })
      rawOuterShadow.innerHTML = '<x-inner></x-inner>'
      const rawInnerHost = rawOuterShadow.querySelector('x-inner')!
      const rawInnerShadow = rawInnerHost.attachShadow({ mode: 'open' })
      rawInnerShadow.innerHTML =
        '<section><span class=pick></span><slot></slot></section>'
      nativeDocument.body.append(rawOuterHost)
      const outerHost = document.getElementsByTagName('x-outer')[0]!
      const outerShadow = outerHost.shadowRoot!
      const innerHost = outerShadow.firstChild as Element
      const innerShadow = innerHost.shadowRoot!
      const innerSection = innerShadow.firstChild as Element
      const slot = innerSection.getElementsByTagName('slot')[0]!
      assert.equal(engine.down!(innerShadow, 'slot'), slot)
      assert.equal(hostCalls, 12)
      assert.deepEqual(
        adapter.querySelectorAll(
          ':host-context(body) > section > slot',
          innerShadow,
        ),
        [slot],
      )
      assert.equal(hostCalls, 13)
      const span = innerSection.getElementsByTagName('span')[0]!
      assert.deepEqual(adapter.querySelectorAll(':host .pick', innerSection), [
        span,
      ])
      assert.equal(hostCalls, 14)
    } finally {
      window.close()
    }
  },
)
