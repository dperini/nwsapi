import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { nativeCustomOperatorForSelector } from '../../../src/adapter/native/resolver.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

function setupAdapter() {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const { window } = new JSDOM(
    '<!doctype html><main><a id="escaped" data-url="https://site.test/index.html"></a></main>',
  )
  let hostCalls = 0
  const adapter = new DOMSelector(
    window as unknown as Window & typeof globalThis,
    window.document,
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
  adapter.engine.registerOperator('#=', {
    p1: '^item\\d*',
    p2: '$',
    p3: 'true',
  })
  const price = window.document.querySelector('#escaped')!

  function assertPatternCases(
    pattern: string,
    attribute: string,
    cases: ReadonlyArray<readonly [string, boolean]>,
    expectedCode?: string,
  ) {
    adapter.engine.Operators['#='] = { p1: pattern, p2: '$', p3: 'true' }
    const selector = `a[${attribute}#="x"]`
    if (expectedCode !== undefined) {
      assert.equal(
        nativeCustomOperatorForSelector(adapter.engine, selector),
        expectedCode,
      )
    }
    for (const [value, expected] of cases) {
      price.setAttribute(attribute, value)
      const before = hostCalls
      assert.deepEqual(
        adapter.querySelectorAll(selector, window.document),
        expected ? [price] : [],
      )
      assert.equal(hostCalls, before + 1)
    }
  }

  function assertOperatorPairs(
    prefix: string,
    entries: ReadonlyArray<readonly [string, string, string, string]>,
  ) {
    for (const [name, pattern, matches, rejects] of entries) {
      assertPatternCases(pattern, `${prefix}${name}`, [
        [matches, true],
        [rejects, false],
      ])
    }
  }

  return {
    window,
    adapter,
    price,
    getHostCalls: () => hostCalls,
    assertPatternCases,
    assertOperatorPairs,
  }
}

test.skipIf(!addon)(
  'optional, bounded, whitespace, and dot attribute patterns execute in Rust',
  () => {
    const { window, assertPatternCases } = setupAdapter()
    try {
      assertPatternCases(
        '^code\\d?',
        'data-optional',
        [
          ['codex', true],
          ['code7x', true],
          ['code77x', false],
        ],
        '#=G1^636f6465!?d:$;',
      )
      assertPatternCases(
        '^batch\\d{2,3}',
        'data-bounded',
        [
          ['batch1x', false],
          ['batch12x', true],
          ['batch123x', true],
          ['batch1234x', false],
        ],
        '#=G1^6261746368!#d!#d!?d:$;',
      )
      assertPatternCases('^item\\s+', 'data-whitespace', [
        ['item\u00a0x', true],
        ['item\u200bx', false],
      ])
      assertPatternCases(
        '^code.+',
        'data-dot-plus',
        [
          ['code7x', true],
          ['code💡x', true],
          ['codex', false],
          ['code\nx', false],
        ],
        '#=G1^636f6465!A:$;',
      )
      assertPatternCases('^code.?', 'data-dot-optional', [
        ['codex', true],
        ['code7x', true],
        ['code77x', false],
      ])
      assertPatternCases('^batch.{2,3}', 'data-dot-bounded', [
        ['batch1x', false],
        ['batch12x', true],
        ['batch123x', true],
        ['batch1234x', false],
      ])
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'character classes, word boundaries, and negated shorthands execute in Rust',
  () => {
    const {
      window,
      adapter,
      price,
      getHostCalls,
      assertPatternCases,
      assertOperatorPairs,
    } = setupAdapter()
    try {
      assertPatternCases('^batch[a-z]+', 'data-ascii-class', [
        ['batchabcx', true],
        ['batchxyzx', true],
        ['batchAax', false],
        ['batcha1x', false],
      ])
      assertPatternCases('^batch[\\w-]+', 'data-word-shorthand', [
        ['batcha_z-9x', true],
        ['batchéx', false],
      ])
      assertOperatorPairs('data-class-', [
        ['non-digit', '^item[\\D]+', 'item-x', 'item7x'],
        ['non-word', '^item[\\W]+', 'item-x', 'itemAx'],
        ['double-negated-digit', '^item[^\\D]+', 'item7x', 'item-x'],
        ['space', '^item[\\s]+', 'item\u00a0x', 'itemx'],
        ['non-space', '^item[\\S]+', 'item-x', 'item x'],
        ['double-negated-space', '^item[^\\S]+', 'item\u00a0x', 'item-x'],
        ['escaped-controls', '^item[\\t\\n]+', 'item\tx', 'item x'],
      ])
      adapter.engine.Operators['#='] = {
        p1: '^batch[a-z]+',
        p2: '$',
        p3: 'true',
      }
      price.setAttribute('data-ascii-class-insensitive', 'batchAax')
      const beforeInsensitive = getHostCalls()
      assert.deepEqual(
        adapter.querySelectorAll(
          'a[data-ascii-class-insensitive#="x" i]',
          window.document,
        ),
        [price],
      )
      assert.equal(getHostCalls(), beforeInsensitive + 1)
      assertPatternCases('^batch[^0-9]+', 'data-negated-ascii-class', [
        ['batch-x', true],
        ['batch💡x', true],
        ['batch7x', false],
      ])
      assertOperatorPairs('data-word-', [
        ['boundary', '^item\\b-', 'item-x', 'itemx'],
        ['non-boundary', '^item\\B', 'itemx', 'item-x'],
      ])
      assertOperatorPairs('data-', [
        ['negative-digits', '^item\\D+', 'item-x', 'item7x'],
        ['negative-word', '^item\\W+', 'item-x', 'itemAx'],
        ['negative-space', '^item\\S+', 'item\u200bx', 'item\u00a0x'],
      ])
    } finally {
      window.close()
    }
  },
)
