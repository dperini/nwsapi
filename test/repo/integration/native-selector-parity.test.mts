import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  hostSelectorStates,
  queryNativeHost,
} from '../../../src/adapter/native-query.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'

type Fixture = {
  html: string
  selectors: string[]
  attributes?: Array<{
    id: string
    namespace: string
    name: string
    value: string
  }>
}
type Corpus = Fixture & { xml: Fixture[]; shadowSelectors: string[] }

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']
const corpus = JSON.parse(
  readFileSync(
    new URL('../common/fixture/selector/compatibility.json', import.meta.url),
    'utf8',
  ),
) as Corpus

function outcome<T>(read: () => T): { result: T } | { error: string } {
  try {
    return { result: read() }
  } catch (error) {
    const named = error as { name?: string }
    return { error: named?.name ?? 'Error' }
  }
}

test.skipIf(!addon)(
  'native results and JavaScript fallback agree across the v3 selector corpus',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const checked = new Set<string>()
    const rustFallbacks = new Map<string, 'accepted' | 'rejected'>()
    let attemptedContexts = 0
    let rustExecutedContexts = 0
    const documents = [
      { fixture: corpus, contentType: 'text/html' },
      ...corpus.xml.map(fixture => ({
        fixture,
        contentType: 'application/xml',
      })),
    ]
    for (const { fixture, contentType } of documents) {
      const { window } = new JSDOM(fixture.html, { contentType })
      try {
        const document = window.document
        const host = window as unknown as Window & typeof globalThis
        const native = new DOMSelector(host, document, { nativeQuery: binding })
        const fallback = new DOMSelector(host, document)
        for (const attr of fixture.attributes ?? []) {
          document
            .getElementById(attr.id)!
            .setAttributeNS(attr.namespace, attr.name, attr.value)
        }
        const compare = (
          selector: string,
          context: Document | DocumentFragment | Element,
        ) => {
          attemptedContexts++
          const label = contentType + ' ' + selector
          const expected = outcome(() =>
            Array.from(fallback.querySelectorAll(selector, context)),
          )
          const actual = outcome(() =>
            Array.from(native.querySelectorAll(selector, context)),
          )
          assert.deepEqual(actual, expected, label)
          const source = Uint16Array.from(selector, character =>
            character.charCodeAt(0),
          )
          const rustSupports = binding.supportsHostSelector(
            source,
            binding.jquery,
            binding.forgiving,
          )
          const direct = queryNativeHost(
            {
              ...binding,
              directionality: candidate =>
                native.engine.directionality(candidate),
              selectorStates: (candidate, candidateSelector) =>
                hostSelectorStates(
                  document,
                  activeElement =>
                    native.engine.Snapshot.isFocusable(activeElement),
                  (matchedElement, nativeSelector) =>
                    native.engine.Snapshot.matchesNative(
                      matchedElement,
                      nativeSelector,
                    ),
                  candidate,
                  native.engine.Snapshot,
                  candidateSelector,
                ),
            },
            document,
            'select',
            selector,
            context,
          )
          if (direct !== undefined) {
            rustExecutedContexts++
            assert.deepEqual({ result: direct }, expected, label + ' via Rust')
            checked.add(label)
          } else if (rustSupports) {
            assert.fail(
              label + ' is supported by Rust but fell back to JavaScript',
            )
          } else {
            rustFallbacks.set(
              label,
              'error' in expected ? 'rejected' : 'accepted',
            )
          }
        }
        for (const selector of fixture.selectors) {
          compare(selector, document)
          const scope = document.getElementById('scope')
          if (scope) {
            compare(selector, scope)
          }
        }
        const shadowHost = document.getElementById('shadow-host')
        if (shadowHost) {
          const shadow = shadowHost.attachShadow({ mode: 'open' })
          shadow.innerHTML = '<slot></slot>'
          for (const selector of corpus.shadowSelectors) {
            compare(selector, shadow)
          }
        }
      } finally {
        window.close()
      }
    }
    for (const label of [
      'text/html #section > p',
      'text/html :scope',
      'text/html :lang(en)',
      'text/html :lang("*")',
      'text/html :lang("en-*")',
      'text/html :target',
      'text/html :link',
      'text/html :any-link',
      'text/html :matches(.item, .special)',
      'text/html :host',
      'text/html :host-context(body) > slot',
      'text/html :host(#shadow-host) > slot',
      'text/html :interest-source',
      'text/html :interest-target',
      'text/html :target-after',
      'text/html :target-before',
      'text/html :target-current',
      'text/html :current',
      'text/html p::marker',
      'text/html p::before',
      'text/html p::backdrop',
      'text/html p::file-selector-button',
      'text/html p::details-content',
      'text/html p::checkmark',
      'text/html p::picker-icon',
      'text/html p::picker(select)',
      'text/html p::search-text',
      'text/html p::target-text',
      'text/html p::highlight(test)',
      'text/html p::spelling-error',
      'text/html p::grammar-error',
      'text/html p::scroll-button(*)',
      'text/html p::scroll-marker',
      'text/html p::scroll-marker-group',
      'text/html p::column',
      'text/html p::part(test)',
      'text/html p::view-transition',
      'text/html p::view-transition-group(*)',
      'text/html p::view-transition-old(test)',
      'text/html ::slotted(*)',
      'text/html :xr-overlay',
      'text/html :read-only',
      'text/html :read-write',
      'text/html :open',
      'text/html :closed',
      'text/html :dir(rtl)',
      'text/html :dir(auto)',
      'text/html section:has(> .special)',
      'text/html :is()',
      'text/html :where()',
      'text/html p:nth-child(odd/**/of .item)',
      'text/html p:nth-child(1 of ::before)',
      'application/xml *|item',
      'application/xml item:nth-of-type(2)',
      'application/xml [*|x]',
      'application/xml [*|x="one"]',
      'application/xml [|x="value"]',
    ]) {
      assert.ok(checked.has(label), label + ' fell back to JavaScript')
    }
    assert.equal(attemptedContexts, 509)
    assert.equal(rustExecutedContexts, 456)
    const acceptedFallbacks = [...rustFallbacks]
      .filter(([, status]) => status === 'accepted')
      .map(([label]) => label)
      .toSorted((left, right) => left.localeCompare(right))
    assert.deepEqual(
      acceptedFallbacks,
      [],
      'every selector accepted by the JS engine in this corpus must execute in Rust',
    )
    for (const selector of [':-moz-read-only', ':-moz-read-write']) {
      assert.equal(
        rustFallbacks.get('text/html ' + selector),
        'rejected',
        selector + ' must be rejected by both engines',
      )
    }
    if (process.env['NWSAPI_REPORT_RUST_COVERAGE'] === '1') {
      console.info(
        JSON.stringify({
          rustExecutedContexts,
          attemptedContexts,
          allCasePercent: Number(
            ((100 * rustExecutedContexts) / attemptedContexts).toFixed(1),
          ),
          acceptedCasesPercent: Number(
            (
              (100 * rustExecutedContexts) /
              (rustExecutedContexts +
                [...rustFallbacks.values()].filter(
                  status => status === 'accepted',
                ).length)
            ).toFixed(1),
          ),
          javascriptFallbacks: [...rustFallbacks].toSorted(([left], [right]) =>
            left.localeCompare(right),
          ),
          acceptedRustFallbacks: acceptedFallbacks,
        }),
      )
    }
  },
  30_000,
)

test('host state fallback recognizes indeterminate radio groups', () => {
  const { window } = new JSDOM(
    '<form><input id=empty-a type=radio name=empty><input id=empty-b type=radio name=empty>' +
      '<input id=checked-a type=radio name=checked checked><input id=checked-b type=radio name=checked></form>' +
      '<form><input id=other-form-unchecked type=radio name=shared></form>' +
      '<form><input id=other-form-checked type=radio name=shared checked></form>' +
      '<form id=external-form><input id=external-unchecked type=radio name=external></form>' +
      '<input id=external-checked type=radio name=external form=external-form checked>' +
      '<input id=document-shadow-name type=radio name=shadowgroup checked>' +
      '<input id=solo type=radio>',
  )
  try {
    const document = window.document
    const matcher = () => undefined
    const focusable = (): false => false
    const states = (id: string) =>
      hostSelectorStates(
        document,
        focusable,
        matcher,
        document.getElementById(id)!,
      ) ?? []
    const shadow = document.createElement('div').attachShadow({ mode: 'open' })
    shadow.innerHTML = '<input id=shadow-unchecked type=radio name=shadowgroup>'
    const shadowStates =
      hostSelectorStates(
        document,
        focusable,
        matcher,
        shadow.getElementById('shadow-unchecked')!,
      ) ?? []
    for (const id of [
      'empty-a',
      'empty-b',
      'other-form-unchecked',
      'shadow-unchecked',
      'solo',
    ]) {
      const result = id === 'shadow-unchecked' ? shadowStates : states(id)
      assert.ok(result.includes('indeterminate'), id)
    }
    for (const id of [
      'checked-a',
      'checked-b',
      'external-unchecked',
      'external-checked',
    ]) {
      assert.ok(!states(id).includes('indeterminate'), id)
    }
  } finally {
    window.close()
  }
})

test('host state bridge records parameterized native pseudo results', () => {
  const { window } = new JSDOM(
    '<div id="current"></div><div id="transition"></div>',
  )
  try {
    const current = window.document.getElementById('current')!
    const transition = window.document.getElementById('transition')!
    const matcher = (element: Element, selector: string) =>
      (element === current && selector.startsWith(':current(')) ||
      (element === current && selector === ':state(ready-state)') ||
      (element === current && selector === ':state(--ready)') ||
      (element === transition &&
        selector === ':active-view-transition-type(fade, slide)')
    const read = (element: Element, selector: string) =>
      hostSelectorStates(
        window.document,
        () => false,
        matcher,
        element,
        undefined,
        selector,
      )
    assert.ok(
      read(current, ':current(.chapter)')?.includes(
        'functional::current(.chapter)',
      ),
    )
    assert.ok(
      read(transition, ':active-view-transition-type(fade, slide)')?.includes(
        'functional::active-view-transition-type(fade, slide)',
      ),
    )
    const multiple = read(
      current,
      ':current(.chapter), :current(:is(.other, .chapter)) :active-view-transition-type(fade, slide)',
    )
    assert.ok(multiple?.includes('functional::current(.chapter)'))
    assert.ok(multiple?.includes('functional::current(:is(.other, .chapter))'))
    const nested = read(current, ':current(:is(:current(.inner), .chapter))')
    assert.ok(
      nested?.includes('functional::current(:is(:current(.inner), .chapter))'),
    )
    assert.ok(nested?.includes('functional::current(.inner)'))
    const commented = read(current, ':current(/* ) ( ignored */ .chapter)')
    assert.ok(commented?.includes('functional::current(.chapter)'))
    const unterminatedComment = read(
      current,
      ':current(.chapter /* ) ( ignored',
    )
    assert.ok(unterminatedComment?.includes('functional::current(.chapter)'))
    assert.ok(
      read(current, ':state(ready\\2d state)')?.includes('state:ready-state'),
    )
    assert.ok(
      read(current, ':st\\61 te(ready-state)')?.includes('state:ready-state'),
    )
    assert.ok(
      read(current, ':state/**/(ready-state)')?.includes('state:ready-state'),
    )
    assert.ok(read(current, ':state(--ready)')?.includes('state:--ready'))
    assert.ok(
      !read(
        current,
        '/* :current(.chapter) */ [data-note=":current(.other)"]',
      )?.some(state => state.startsWith('functional:')),
    )
    assert.ok(
      !read(current, '::current(.chapter)')?.some(state =>
        state.startsWith('functional:'),
      ),
    )
    assert.ok(
      read(current, '/* :has-slotted( */ [data-note=":has-slotted("]') !==
        undefined,
    )
  } finally {
    window.close()
  }
})
