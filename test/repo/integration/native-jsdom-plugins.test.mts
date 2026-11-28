import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'native jQuery plugin selectors match the JavaScript extension',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const extensionFile =
      require.resolve('../../../dist/modules/nwsapi-jquery.js')
    const { window } = new JSDOM(
      '<!doctype html><main><p id=p0></p><p id=p1>text</p><p id=p2><!-- comment --></p>' +
        '<h2 id=heading></h2><input id=text type=text><input id=checkbox type=checkbox>' +
        '<input id=file type=file><input id=image type=image><input id=password type=password>' +
        '<input id=radio type=radio><input id=reset type=reset><input id=submit type=submit>' +
        '<input id=button type=button><button id=nativeButton></button><select id=select></select>' +
        '<textarea id=textarea></textarea></main>',
    )
    try {
      const host = window as unknown as Window & typeof globalThis
      let nativeCalls = 0
      const native = new DOMSelector(host, window.document, {
        nativeQuery: {
          ...binding,
          jquery: true,
          layoutMeasurements: false,
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            nativeCalls++
            return binding.queryHost(...args)
          },
        },
      })
      const fallback = new DOMSelector(host, window.document)
      for (const engine of [native.engine, fallback.engine]) {
        runInNewContext(readFileSync(extensionFile, 'utf8'), {
          NW: { Dom: engine },
        })
      }
      const middle = window.document.getElementById('p1')!
      for (const [selector, expected] of [
        ['p:even', true],
        ['p:odd', false],
        ['p:eq(0)', true],
        ['p:eq(1)', false],
        ['p:eq(-1)', false],
        ['p:lt(1)', true],
        ['p:gt(0)', false],
        ['p:lt(-1)', false],
      ] as const) {
        assert.equal(fallback.matches(selector, middle), expected, selector)
        const before = nativeCalls
        assert.equal(native.matches(selector, middle), expected, selector)
        assert.equal(nativeCalls, before + 1, selector)
      }
      const cases = [
        'p:even',
        'p:odd',
        'p:eq(1)',
        'p:even:odd',
        'p:odd:even',
        'p:even:even',
        'p:eq(1):lt(3)',
        'p:lt(3):eq(1)',
        'p:lt(2)',
        'p:gt(1)',
        'p:first',
        'p:last',
        'p:nth(1)',
        'p:hidden',
        'p:visible',
        ':text',
        ':checkbox',
        ':file',
        ':image',
        ':password',
        ':radio',
        ':reset',
        ':submit',
        ':button',
        ':input',
        ':header',
        'p:parent',
      ]
      const compare = () => {
        for (const selector of cases) {
          assert.deepEqual(
            Array.from(
              native.querySelectorAll(selector, window.document),
              node => node.id,
            ),
            Array.from(
              fallback.querySelectorAll(selector, window.document),
              node => node.id,
            ),
            selector,
          )
        }
      }
      compare()
      native.install()
      try {
        const beforeInstalledVisibility = nativeCalls
        assert.deepEqual(
          Array.from(
            window.document.querySelectorAll('p:hidden'),
            node => node.id,
          ),
          ['p0', 'p1', 'p2'],
        )
        assert.deepEqual(
          Array.from(
            window.document.querySelectorAll('p:visible'),
            node => node.id,
          ),
          [],
        )
        assert.equal(nativeCalls, beforeInstalledVisibility + 2)
      } finally {
        native.uninstall()
      }
      const beforeVisibility = nativeCalls
      assert.deepEqual(
        Array.from(
          native.querySelectorAll('p:hidden', window.document),
          node => node.id,
        ),
        Array.from(
          fallback.querySelectorAll('p:hidden', window.document),
          node => node.id,
        ),
      )
      assert.deepEqual(
        Array.from(
          native.querySelectorAll('p:visible', window.document),
          node => node.id,
        ),
        Array.from(
          fallback.querySelectorAll('p:visible', window.document),
          node => node.id,
        ),
      )
      assert.equal(nativeCalls, beforeVisibility + 2)
      const callsBeforeCustomExtension = nativeCalls
      native.engine.registerSelector(
        'userCustom',
        /^:userCustom(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      assert.deepEqual(
        Array.from(
          native.querySelectorAll('p:even', window.document),
          node => node.id,
        ),
        Array.from(
          fallback.querySelectorAll('p:even', window.document),
          node => node.id,
        ),
      )
      assert.equal(nativeCalls, callsBeforeCustomExtension + 1)
      assert.equal(
        native.querySelectorAll('p:userCustom', window.document).length,
        3,
      )
      assert.equal(nativeCalls, callsBeforeCustomExtension + 2)
      const main = window.document.querySelector('main')!
      main.append(window.document.getElementById('p0')!)
      compare()

      const collisionWindow = new JSDOM(
        '<!doctype html><main><p></p><p></p><p></p></main>',
      )
      try {
        let collisionNativeCalls = 0
        const collision = new DOMSelector(
          collisionWindow as unknown as Window & typeof globalThis,
          collisionWindow.window.document,
          {
            nativeQuery: {
              ...binding,
              jquery: true,
              queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
                collisionNativeCalls++
                return binding.queryHost(...args)
              },
            },
          },
        )
        collision.engine.registerSelector(
          'jquery:child',
          /^:even(.*)/i,
          (match, source) => ({
            match,
            status: true,
            source: `if(false){${source}}`,
          }),
        )
        runInNewContext(readFileSync(extensionFile, 'utf8'), {
          NW: { Dom: collision.engine },
        })
        assert.equal(
          collision.querySelectorAll('p:even', collisionWindow.window.document)
            .length,
          0,
        )
        assert.equal(collisionNativeCalls, 0)
      } finally {
        collisionWindow.window.close()
      }
      const child = native.engine.Selectors['jquery:child']!
      child.Callback = (match, source) => ({
        match,
        status: true,
        source: `if(false){${source}}`,
      })
      native.engine.configure({}, true)
      const beforeReplacement = nativeCalls
      assert.equal(native.querySelectorAll('p:even', window.document).length, 0)
      assert.equal(nativeCalls, beforeReplacement)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native and JavaScript :empty ignore empty text nodes',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><div id=host></div></main>',
    )
    try {
      const document = window.document
      const hostElement = document.getElementById('host')!
      hostElement.appendChild(document.createTextNode(''))
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, document, { nativeQuery: binding })
      const fallback = new DOMSelector(host, document)
      assert.deepEqual(native.querySelectorAll('#host:empty', document), [
        hostElement,
      ])
      assert.deepEqual(
        native.querySelectorAll('#host:empty', document),
        fallback.querySelectorAll('#host:empty', document),
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native jsdom queries preserve identities and see mutations',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id=a class=pick></p><p id=b></p></main><p id=outside class=pick></p>',
    )
    try {
      const document = window.document
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) =>
              binding.supportsHostSelector(...args),
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const main = document.getElementsByTagName('main')[0]!
      const a = document.getElementById('a')!
      const b = document.getElementById('b')!
      assert.deepEqual(adapter.querySelectorAll('.pick', main), [a])
      assert.equal(adapter.querySelector('main > .pick', document), a)
      assert.equal(adapter.matches('p + p', b), true)
      assert.equal(adapter.closest('main', a), main)
      assert.equal(calls, 4)

      a.className = 'pick\ud800 other'
      b.className = 'pick'
      main.insertBefore(b, a)
      assert.deepEqual(adapter.querySelectorAll('.pick', main), [b])
      assert.equal(adapter.querySelector('.other', main), a)
      assert.equal(calls, 6)

      const fragment = document.createDocumentFragment()
      fragment.append(a)
      assert.equal(adapter.querySelector('.other', fragment), a)
      assert.equal(calls, 7)
      assert.equal(adapter.querySelector('p:first-child', main), b)
      assert.equal(calls, 8)
      assert.equal(adapter.querySelector('p:not(:focus)', main), b)
      assert.equal(calls, 9)

      const foreign = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      )
      main.append(foreign)
      assert.equal(adapter.querySelector('svg', main), foreign)
      assert.equal(calls, 10)
      assert.deepEqual(
        adapter.querySelectorAll('p >> b', document, { noexcept: true }),
        [],
      )

      const invalidBranch = 'p:is(.pick, :unsupported)'
      const invalidBranchUnits = Uint16Array.from(invalidBranch, c =>
        c.charCodeAt(0),
      )
      assert.equal(binding.supportsHostSelector(invalidBranchUnits), true)
      assert.equal(
        binding.supportsHostSelector(invalidBranchUnits, false, false),
        false,
      )
      adapter.engine.configure({ FORGIVING: false })
      const beforeStrictQuery = calls
      assert.throws(() => adapter.querySelectorAll(invalidBranch, document))
      assert.equal(calls, beforeStrictQuery)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'traversal indexes and selectors agree across independent engines',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const plugin = readFileSync(
      require.resolve('../../../dist/modules/nwsapi-traversal.js'),
      'utf8',
    )
    const markup =
      '<!doctype html><main id=m><b id=a></b>text<i id=b><u id=c></u></i><!--x--><em id=d></em></main>'
    const hosts = [new JSDOM(markup), new JSDOM(markup)]
    let calls = 0
    try {
      const engines = hosts.map(({ window }, index) => {
        const adapter = new DOMSelector(
          window as unknown as Window & typeof globalThis,
          window.document,
          index
            ? {}
            : {
                nativeQuery: {
                  ...binding,
                  queryHost(...args) {
                    calls++
                    return binding.queryHost(...args)
                  },
                },
              },
        )
        const engine = adapter.engine
        runInNewContext(plugin, {
          NW: { Dom: engine },
          document: window.document,
        })
        return engine
      })
      for (const [direction, origin] of [
        ['up', 'c'],
        ['next', 'a'],
        ['previous', 'd'],
        ['down', 'm'],
      ] as const) {
        for (const expression of [
          undefined,
          0,
          1,
          2,
          99,
          -1,
          1.5,
          'i',
          '.missing',
        ]) {
          const before = calls
          const results = engines.map((engine, index) => {
            const node = hosts[index]!.window.document.getElementById(origin)!
            return engine[direction]!(node, expression)?.outerHTML ?? null
          })
          assert.equal(results[0], results[1], direction + ' ' + expression)
          assert.equal(
            calls - before,
            expression === -1 || expression === 1.5 ? 0 : 1,
          )
        }
      }
    } finally {
      for (const host of hosts) {
        host.window.close()
      }
    }
  },
)
